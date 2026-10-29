import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { kurumBelgeleri } from "@/lib/faturalama-koprusu";
import { PROFORMA_DURUM_ADI } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { KBos, KKart, KListe, KOge } from "../../konsol-ui";
import { para, tarih } from "../../bicim";

/*
  Müşteri kartının "Ödemeler ve proformalar" sekmesindeki belgeler
  (29.10.2026). Eskiden sekmenin sonunda tek cümle vardı: "platform
  henüz fatura kesmiyor". Oysa proforma 27.10.2026'dan, yüklenen fatura
  28.10.2026'dan beri var ve kurumun kendi Ödeme ve Lisans ekranı onları
  kurumBelgeleri'nden okuyor. Kurucu aynı müşterinin belgesini görmek
  için Tahsilat → Proformalar'a gidip listeyi kendisi süzüyordu.

  Aynı okuma (lib/faturalama-koprusu): müşterinin gördüğü liste ile
  kurucunun gördüğü liste ayrışmasın. İptal edilen proformalar orada da
  burada da yok; belge sayfası (tahsilat/proforma/[id]) iptali gösteriyor.
*/
export async function BelgeBolumu({ organizationId }: { organizationId: string }) {
  const admin = createAdminClient();
  if (!admin) return <KBos baslik="Belgeler okunamıyor" aciklama="Sunucu anahtarı tanımlı değil." />;
  const { proformalar, faturalar } = await kurumBelgeleri(admin, organizationId);

  return <>
    <KKart baslik="Proformalar" aciklama="Ödemeden önce müşteriye giden belgeler"
      sag={<Link className="pu-tumu" href="/panel/platform/tahsilat?kanal=proforma">Yeni proforma</Link>}>
      {proformalar.length ? (
        <KListe>
          {proformalar.map((p) => (
            <KOge
              key={p.id}
              href={`/panel/platform/tahsilat/proforma/${p.id}`}
              baslik={p.no}
              alt={[productName(p.urun), `düzenleme ${tarih(p.duzenlemeTarihi)}`, p.durum === "bekliyor" ? `son gün ${tarih(p.gecerlilikTarihi)}` : null].filter(Boolean).join(" · ")}
              durum={{ etiket: PROFORMA_DURUM_ADI[p.durum], ton: p.durum === "odendi" ? "success" : "warning" }}
              deger={para(p.toplam, p.paraBirimi)}
              degerAlt="KDV dahil"
            />
          ))}
        </KListe>
      ) : <KBos baslik="Proforma yok" aciklama="Tahsilat → Proformalar'dan bu müşteriye proforma açıldığında burada listelenir." />}
    </KKart>

    <KKart baslik="Faturalar" aciklama="Onaylanan ödemelere yüklenen faturalar">
      {faturalar.length ? (
        <KListe>
          {faturalar.map((f) => (
            <KOge
              key={`${f.no}-${f.tarih}`}
              baslik={f.no}
              alt={[productName(f.urun), tarih(f.tarih)].join(" · ")}
              deger={para(f.tutar, f.paraBirimi)}
              sonu={f.url ? <a className="pu-tumu" href={f.url} target="_blank" rel="noreferrer">Aç ↗</a> : null}
            />
          ))}
        </KListe>
      ) : <KBos baslik="Fatura yok" aciklama="Faturalar elle kesilip Tahsilat → Faturalar'dan ödemeye yükleniyor; yüklenenler burada görünür." />}
    </KKart>
  </>;
}
