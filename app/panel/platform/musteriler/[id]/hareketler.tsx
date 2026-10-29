import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productName } from "@/lib/products";
import { HAREKET_TURU_ADI, hareketSayimi, musteriHareketleri, type HareketTuru } from "@/lib/musteri-hareketleri";
import { zorunlu } from "../../konsol-oku";
import { KBos, KKart, KNot } from "../../konsol-ui";
import { MobilSatir } from "../../../crm/table-cells";
import { SatirTiklama } from "../../../crm/satir-tiklama";
import { KURULUM_ADI, KURULUM_ISLEMI, para, sayi, tarihSaat } from "../../bicim";
import type { Odeme } from "./bolumler";

/*
  Müşteri kartının Hareketler sekmesi (29.10.2026). Neden tek çizelge:
  lib/musteri-hareketleri.ts'in başı.

  Ödemeler sayfanın kendisinden geliyor (orada bilerek sınırsız okunuyor);
  proforma, kurulum ve konsol kayıtları burada okunuyor ve her biri en
  yeni SINIR kadarla sınırlı. Sınıra ulaşan kaynak EKRANDA söyleniyor:
  sessizce kesilen bir çizelge "daha eskisi yok" diye okunur.
*/
const SINIR = 200;
const GOSTERILEN = 150;
const TURLER: HareketTuru[] = ["odeme", "proforma", "fatura", "kurulum", "konsol"];

export async function HareketBolumu({ admin, organizationId, odemeler, kayitAcildi, tur, adres }: {
  admin: SupabaseClient | null; organizationId: string; odemeler: Odeme[]; kayitAcildi: string | null;
  tur: string | undefined; adres: string;
}) {
  if (!admin) return <KBos baslik="Hareketler okunamıyor" aciklama="Sunucu anahtarı tanımlı değil; proforma ve kurulum kayıtları yalnızca onunla okunuyor." />;
  const odemeIdleri = odemeler.map((o) => o.id);
  const [proformaSonucu, faturaSonucu, kurulumSonucu, konsolSonucu] = await Promise.all([
    admin.from("platform_proformalari").select("id,proforma_no,durum,toplam,para_birimi,product,created_at,odendi_at,updated_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(SINIR),
    // Faturalar ödemeye bağlı; ödemeler zaten bu kurumla sınırlı ve tam.
    odemeIdleri.length
      ? admin.from("platform_faturalari").select("id,fatura_no,fatura_tarihi,created_at,payment_request_id").in("payment_request_id", odemeIdleri)
      : Promise.resolve({ data: [], error: null }),
    admin.from("provisioning_audit_logs").select("id,action,state,result,created_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(SINIR),
    /* Yalnızca konsolun yazdığı kayıtlar: kurumun kendi panelindeki işler
       sağ sütundaki "Son etkinlik"te, burası müşteriyle Arvo arasındaki iş. */
    admin.from("activity_logs").select("id,action,entity_type,metadata,created_at")
      .eq("organization_id", organizationId).eq("metadata->>by", "founder_console").order("created_at", { ascending: false }).limit(SINIR),
  ]);
  const proformalar = zorunlu(proformaSonucu, "Proformalar") ?? [];
  const kurulum = zorunlu(kurulumSonucu, "Kurulum kayıtları") ?? [];
  const konsol = zorunlu(konsolSonucu, "Konsol işlemleri") ?? [];

  const hepsi = musteriHareketleri({
    kayitAcildi,
    odemeler,
    proformalar: proformalar as Parameters<typeof musteriHareketleri>[0]["proformalar"],
    faturalar: (zorunlu(faturaSonucu, "Faturalar") ?? []) as Parameters<typeof musteriHareketleri>[0]["faturalar"],
    kurulum: kurulum as Parameters<typeof musteriHareketleri>[0]["kurulum"],
    konsol: konsol as Parameters<typeof musteriHareketleri>[0]["konsol"],
    urunAdi: productName,
    kurulumIslemi: (k) => KURULUM_ISLEMI[k] ?? k,
    kurulumAsamasi: (k) => KURULUM_ADI[k] ?? k,
  });
  const secili = TURLER.find((t) => t === tur) ?? null;
  const sayim = hareketSayimi(hepsi);
  const suzulen = secili ? hepsi.filter((h) => h.tur === secili) : hepsi;
  const gorunen = suzulen.slice(0, GOSTERILEN);
  const sinirda = [
    proformalar.length >= SINIR ? "proformalar" : null,
    kurulum.length >= SINIR ? "kurulum kayıtları" : null,
    konsol.length >= SINIR ? "konsol işlemleri" : null,
  ].filter(Boolean);
  const turAdresi = (t: HareketTuru | null) => `${adres}?pencere=hareketler${t ? `&tur=${t}` : ""}`;

  return (
    <KKart baslik="Hareketler" aciklama="Ödeme, proforma, fatura, kurulum ve konsol işlemleri tek çizelgede; en yeni üstte."
      sag={<span className="status-pill">{sayi(suzulen.length)} olay</span>}>
      <div className="ekip-suzgec talep-suzgec ek-arac">
        <nav className="ek-segment" aria-label="Hareket türü">
          <Link href={turAdresi(null)} scroll={false} replace className={secili ? undefined : "is-active"} aria-current={secili ? undefined : "page"}>
            Tümü <small>{sayi(hepsi.length)}</small>
          </Link>
          {TURLER.filter((t) => sayim[t] || t === secili).map((t) => (
            <Link key={t} href={turAdresi(t)} scroll={false} replace className={secili === t ? "is-active" : undefined} aria-current={secili === t ? "page" : undefined}>
              {HAREKET_TURU_ADI[t]} <small>{sayi(sayim[t])}</small>
            </Link>
          ))}
        </nav>
      </div>
      {sinirda.length ? <KNot ton="uyari">Çizelge en yeni {SINIR} kayıtla sınırlı ve {sinirda.join(", ")} bu sınıra ulaştı; daha eski olaylar listede yok.</KNot> : null}
      {suzulen.length > GOSTERILEN ? <KNot>En yeni {GOSTERILEN} olay gösteriliyor; daha eskisi için türe göre süzün.</KNot> : null}
      {gorunen.length ? (
        <div className="talep-tablo fn-ic-tablo">
          <table className="crm-data-table" data-cols="mk-olay">
            <thead><tr><th className="crm-col-date">Zaman</th><th>Olay</th><th>Tür</th><th className="crm-col-amount">Tutar</th><th></th></tr></thead>
            <tbody>
              {gorunen.map((h) => {
                const href = h.proformaId ? `/panel/platform/tahsilat/proforma/${h.proformaId}` : null;
                /* Türün rozeti olayın sonucunun renginde: reddedilen ödeme kırmızı, onaylanan yeşil. */
                const durum = { etiket: HAREKET_TURU_ADI[h.tur], ton: h.ton };
                const tutar = h.tutar === null ? null : para(h.tutar, h.paraBirimi);
                return (
                  <tr key={h.anahtar}>
                    <td className="crm-col-date" data-label="Zaman">{tarihSaat(h.zaman)}</td>
                    <td data-label="Olay">
                      {href
                        ? <Link className="crm-row-link crm-table-title" href={href}>{h.olay}</Link>
                        : <span className="crm-table-title">{h.olay}</span>}
                      {h.ayrinti ? <span className="crm-table-sub" title={h.ayrinti}>{h.ayrinti}</span> : null}
                    </td>
                    <td data-label="Tür"><span className="status-pill" data-tone={h.ton}>{durum.etiket}</span></td>
                    <td className="crm-col-amount" data-label="Tutar">{tutar ? <span className={h.olay === "Ödeme onaylandı" || h.olay === "Kartla ödendi" ? "crm-table-title cari-arti" : "crm-table-title"}>{tutar}</span> : <span className="crm-table-sub">—</span>}</td>
                    <td className="crm-table-actions">{href ? <span className="crm-row-chevron" aria-hidden="true">›</span> : null}</td>
                    <MobilSatir href={href ?? undefined} baslik={h.olay} durum={durum} alt={[tarihSaat(h.zaman), h.ayrinti, tutar]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
      ) : <KBos baslik={secili ? `${HAREKET_TURU_ADI[secili]} hareketi yok` : "Henüz hareket yok"} aciklama="Ödeme, proforma ya da kurulum işlemi olduğunda burada sırayla görünür." />}
    </KKart>
  );
}
