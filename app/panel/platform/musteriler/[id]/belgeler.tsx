import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { kurumBelgeleri } from "@/lib/faturalama-koprusu";
import { PROFORMA_DURUM_ADI } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { KBos, KKart } from "../../konsol-ui";
import { MobilSatir } from "../../../crm/table-cells";
import { SatirTiklama } from "../../../crm/satir-tiklama";
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
        <div className="talep-tablo fn-ic-tablo">
          <table className="crm-data-table" data-cols="mk-proforma">
            <thead><tr><th>Proforma</th><th className="crm-col-date">Düzenleme</th><th className="crm-col-date">Son gün</th><th className="crm-col-amount">Tutar</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              {proformalar.map((p) => {
                const href = `/panel/platform/tahsilat/proforma/${p.id}`;
                const durum = { etiket: PROFORMA_DURUM_ADI[p.durum], ton: p.durum === "odendi" ? "success" : "warning" };
                return (
                  <tr key={p.id}>
                    <td data-label="Proforma"><Link className="crm-row-link" href={href}><span className="crm-table-title plt-mono">{p.no}</span><span className="crm-table-sub">{productName(p.urun)}</span></Link></td>
                    <td className="crm-col-date" data-label="Düzenleme">{tarih(p.duzenlemeTarihi)}</td>
                    <td className="crm-col-date" data-label="Son gün">{p.durum === "bekliyor" ? tarih(p.gecerlilikTarihi) : "—"}</td>
                    <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{para(p.toplam, p.paraBirimi)}</span><small>KDV dahil</small></td>
                    <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                    <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    <MobilSatir href={href} baslik={p.no} durum={durum} alt={[productName(p.urun), para(p.toplam, p.paraBirimi)]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
      ) : <KBos baslik="Proforma yok" aciklama="Tahsilat → Proformalar'dan bu müşteriye proforma açıldığında burada listelenir." />}
    </KKart>

    <KKart baslik="Faturalar" aciklama="Onaylanan ödemelere yüklenen faturalar">
      {faturalar.length ? (
        <div className="talep-tablo fn-ic-tablo">
          <table className="crm-data-table" data-cols="mk-fatura">
            <thead><tr><th>Fatura</th><th className="crm-col-date">Tarih</th><th className="crm-col-amount">Tutar</th><th></th></tr></thead>
            <tbody>
              {faturalar.map((f) => (
                <tr key={`${f.no}-${f.tarih}`}>
                  <td data-label="Fatura"><span className="crm-table-title plt-mono">{f.no}</span><span className="crm-table-sub">{productName(f.urun)}</span></td>
                  <td className="crm-col-date" data-label="Tarih">{tarih(f.tarih)}</td>
                  <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{para(f.tutar, f.paraBirimi)}</span></td>
                  <td className="crm-table-actions">{f.url ? <a className="panel-secondary" href={f.url} target="_blank" rel="noreferrer">PDF</a> : <span className="crm-table-sub">dosya açılamadı</span>}</td>
                  <MobilSatir baslik={f.no} alt={[productName(f.urun), tarih(f.tarih), para(f.tutar, f.paraBirimi)]} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <KBos baslik="Fatura yok" aciklama="Faturalar elle kesilip Tahsilat → Faturalar'dan ödemeye yükleniyor; yüklenenler burada görünür." />}
    </KKart>
  </>;
}
