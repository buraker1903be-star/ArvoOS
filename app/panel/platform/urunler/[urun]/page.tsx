import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, SUBSCRIBER_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { planlar, type PricedProduct } from "@/lib/site/pricing";
import { planTutari, planYillikTutari } from "@/lib/site/fiyat-kaynagi";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { basHarfleri, LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../../bicim";
import { MobilSatir } from "../../../crm/table-cells";
import { SatirTiklama } from "../../../crm/satir-tiklama";
import { TalepAkis } from "../../../crm/kayit-detay/kayit-akis";
import { IstatistikKarti } from "../../../crm/istatistik-karti";
import "../../platform.css";
import "../../konsol-ui.css";
import "../../../hr/hr.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../finans.css";

/*
  TEK ÜRÜNÜN SAYFASI (14.10.2026, Kurucu Konsolu → Ürünler).

  Ürünler ekranı dört ürünü tek tabloda yan yana gösteriyor; "ArvoARC'ı
  kim kullanıyor, kimin dönemi bitiyor, köprü ayakta mı" sorusunun yanıtı
  için kiracı kiracı dolaşmak gerekiyordu. Bu sayfa bir ürünün:
    - kiracılarını (lisans durumu, paket, ücret, dönem),
    - yayımlanmış fiyat basamaklarını (Ücret ve Paketler'in okuduğu tablo),
    - köprüsünü (ayrı veritabanındaki kopyanın sağlığı),
    - bireysel abonelerini (ArvoLab, ArvoARC)
  tek yerde gösteriyor. Düzenleme burada değil: lisans kiracının dosyasında,
  fiyat Ücret ve Paketler'de, deneme süresi Bireysel abone planlarında.

  ArvoOS'un kiracısı çekirdek lisansı olan kurum (organization_licenses);
  ötekilerin organization_product_licenses satırı. Kendi kurumlarımız
  (kind = internal) listede yok.
*/

type Satir = {
  id: string; ad: string; durum: string; paket: string | null; ucret: number | null;
  donemSonu: string | null; denemeSonu: string | null; kullanici: number;
};

const ACIK = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

export default async function UrunPage({ params }: { params: Promise<{ urun: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { urun } = await params;
  const urunTanimi = PRODUCTS.find((p) => p.code === urun);
  if (!urunTanimi) notFound();
  const cekirdek = urun === "arvoos";
  const bireyselVar = SUBSCRIBER_PRODUCTS.some((p) => p.code === urun);

  const [{ data: kiraciSatirlari, error: kiraciHatasi }, { data: urunSatirlari, error: urunHatasi }, { data: aboneSatirlari }, fiyatlar, kopru] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at,aktif_uye,grup_markasi"),
    cekirdek
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("organization_product_licenses")
          .select("organization_id,status,plan_code,monthly_fee,current_period_end,trial_ends_at").eq("product", urun),
    bireyselVar
      ? supabase.from("product_subscribers").select("status").eq("product", urun).is("kurum_id", null)
      : Promise.resolve({ data: [] }),
    yayimlananFiyatlar(),
    urun === "arc" ? getArcBridgeHealth().then((h) => ({ ok: h.ok, not: h.ok ? "Köprü sağlıklı" : h.missing.length ? `Eksik ayar: ${h.missing.join(", ")}` : "Köprü yanıt vermiyor" }))
      : urun === "randevu" ? getRandevuBridgeHealth().then((h) => ({ ok: h.ok, not: h.ok ? "Köprü sağlıklı" : h.missing.length ? `Eksik ayar: ${h.missing.join(", ")}` : "Köprü yanıt vermiyor" }))
      : urun === "arvolab" ? getArvolabBridgeHealth().then((h) => ({ ok: Boolean(h && !h.broken), not: !h ? "Köprü ayarı eksik" : h.broken ? "Köprü yanıt vermiyor" : "Köprü sağlıklı" }))
      : Promise.resolve({ ok: true, not: "Konsolun kendi veritabanı" }),
  ]);
  // Okunamayan liste "kiracı yok" demek değil (AGENTS.md: engelin sorgusu hata yutmaz).
  if (kiraciHatasi) throw new Error("Kiracılar okunamadı: " + kiraciHatasi.message);
  if (urunHatasi) throw new Error("Ürün lisansları okunamadı: " + urunHatasi.message);

  type Kiraci = {
    id: string; name: string; display_name: string | null; kind: string | null; license_status: string | null;
    plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null; aktif_uye: number;
    grup_markasi?: boolean | null;
  };
  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");
  const kiraciHaritasi = new Map(kiracilar.map((k) => [k.id, k]));

  const satirlar: Satir[] = cekirdek
    ? kiracilar.filter((k) => k.license_status).map((k) => ({
        id: k.id, ad: k.display_name || k.name, durum: k.license_status!, paket: k.plan_code, ucret: k.monthly_fee,
        donemSonu: k.current_period_end, denemeSonu: k.trial_ends_at, kullanici: Number(k.aktif_uye),
      }))
    : ((urunSatirlari ?? []) as { organization_id: string; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
        .flatMap((l) => {
          const k = kiraciHaritasi.get(l.organization_id);
          if (!k) return []; // kendi kurumumuz ya da silinmiş kurum
          return [{
            id: l.organization_id, ad: k.display_name || k.name, durum: l.status, paket: l.plan_code, ucret: l.monthly_fee,
            donemSonu: l.current_period_end, denemeSonu: l.trial_ends_at, kullanici: Number(k.aktif_uye),
          }];
        });
  satirlar.sort((a, b) => Number(ODEYEN.has(b.durum)) - Number(ODEYEN.has(a.durum)) || Number(b.ucret ?? 0) - Number(a.ucret ?? 0) || a.ad.localeCompare(b.ad, "tr"));

  const acik = satirlar.filter((s) => ACIK.has(s.durum));
  const odeyen = satirlar.filter((s) => ODEYEN.has(s.durum));
  /* Grup markasının ücreti müşteri geliri değil, grup içi değer (lib/kurum-turu). */
  const grupKurumu = new Set(kiracilar.filter((k) => k.grup_markasi).map((k) => k.id));
  const gelir = odeyen.filter((s) => !grupKurumu.has(s.id)).reduce((t, s) => t + Number(s.ucret ?? 0), 0);
  const grupDegeri = odeyen.filter((s) => grupKurumu.has(s.id)).reduce((t, s) => t + Number(s.ucret ?? 0), 0);
  const aboneler = (aboneSatirlari ?? []) as { status: string }[];
  const acikAbone = aboneler.filter((a) => ACIK.has(a.status)).length;
  const basamaklar = planlar(urun as PricedProduct);

  /* Sağdaki kartın dağılımı tablodaki satırlardan (sınırsız sorgu, eksilmez). */
  const durumSayilari = [...new Set(satirlar.map((s) => s.durum))]
    .map((d) => ({ ad: productLicenseLabels[d] ?? d, adet: satirlar.filter((s) => s.durum === d).length }))
    .sort((a, b) => b.adet - a.adet);
  // Ticari bağlam: satır müşteri detayına (14.10.2026); teknik ayarlar oradan.
  const kiraciAdresi = (id: string) => `/panel/platform/musteriler/${id}`;

  /*
    PANELİN TABLOSU (29.10.2026, konsol yeniden kurulurken). Kiracılar
    iOS satırıydı; paket, kullanıcı ve dönem tek alt satırdaydı ve
    "kimin dönemi önce doluyor" sorusu satır satır okunuyordu. Sağdaki
    üç kart (lisans durumu, fiyat basamakları, bireysel aboneler) tek
    sekmeli kart oldu.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa urun-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/urunler">ÜRÜNLER</Link> · {urunTanimi.badge}</small>
        <h1>{urunTanimi.name}</h1>
        <p className="ek-alt">{urunTanimi.description}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/fiyatlar">Fiyatları düzenle</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label={`${urunTanimi.name} özeti`}>
      <dl>
        {/* "Kiracı", "müşteri" değil: grup markaları da bu sayıda (ürünü
            kullanıyorlar), oysa konsolun geri kalanında "müşteri" onları
            dışarıda bırakıyor (lib/kurum-turu). */}
        <div><dt>Kiracı</dt><dd>{sayi(acik.length)}</dd><small>lisansı açık kurum (deneme dahil)</small></div>
        <div><dt>Ödeyen</dt><dd>{sayi(odeyen.length)}</dd><small>{satirlar.length - acik.length ? `${sayi(satirlar.length - acik.length)} askıda/iptal/kapalı` : "kapalı lisans yok"}</small></div>
        <div><dt>Beklenen aylık</dt><dd className="cari-arti">{para(gelir)}</dd><small>{grupDegeri ? `+ ${para(grupDegeri)} grup içi değer` : "ödeyen müşterilerin ücreti"}</small></div>
        <div>
          <dt>Sistem</dt>
          <dd className={kopru.ok ? undefined : "talep-uyari"}>{kopru.ok ? "Ayakta" : "Sorunlu"}</dd>
          <small>{kopru.not}</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Kiracılar">
        {satirlar.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="ur-kiraci">
              <thead><tr><th>Kiracı</th><th>Paket</th><th>Kullanıcı</th><th className="crm-col-date">Dönem</th><th className="crm-col-amount">Aylık</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {satirlar.map((s) => {
                  const donem = s.durum === "trialing" ? s.denemeSonu : s.donemSonu;
                  const durum = { etiket: productLicenseLabels[s.durum] ?? s.durum, ton: LISANS_TONU[s.durum] ?? "neutral" };
                  const href = kiraciAdresi(s.id);
                  return (
                    <tr key={s.id} className={ACIK.has(s.durum) ? undefined : "is-pasif"}>
                      <td data-label="Kiracı">
                        <Link className="crm-row-link ek-kisi" href={href}>
                          <span className="ek-avatar" aria-hidden="true">{basHarfleri(s.ad)}</span>
                          <span className="ek-kisi-metin"><span className="crm-table-title" title={s.ad}>{s.ad}</span><span className="crm-table-sub">{grupKurumu.has(s.id) ? "Grup markası" : "Kurumsal"}</span></span>
                        </Link>
                      </td>
                      <td data-label="Paket">{s.paket ? <span className="crm-table-title">{PAKET_ADI[s.paket] ?? s.paket}</span> : <span className="crm-table-sub">—</span>}</td>
                      <td data-label="Kullanıcı"><span className="crm-table-title">{sayi(s.kullanici)}</span></td>
                      <td className="crm-col-date" data-label="Dönem">{donem ? tarih(donem) : "—"}{donem ? <small>{s.durum === "trialing" ? "deneme bitişi" : "dönem sonu"}</small> : null}</td>
                      {/* Ücreti girilmemiş lisans ₺0 yazmıyor: eksik kayıt, ücretsiz değil. */}
                      <td className="crm-col-amount" data-label="Aylık">{s.ucret ? <span className="crm-table-title">{para(Number(s.ucret))}</span> : <span className="k-ios-eksik">Ücret yok</span>}</td>
                      <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                      <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                      <MobilSatir href={href} baslik={s.ad} durum={durum}
                        alt={[s.paket ? PAKET_ADI[s.paket] ?? s.paket : null, `${sayi(s.kullanici)} kullanıcı`, donem ? tarih(donem) : null, s.ucret ? `${para(Number(s.ucret))} / ay` : null]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>Lisanslı kiracı yok</h2><p>Bu ürünün lisanslı kiracısı yok.</p></div>
        )}
      </section>

      <div className="liste-sag">
        <TalepAkis kimlik="urun-detay-sag" sinif="ek-sag" etiket={`${urunTanimi.name} ayrıntıları`} sekmeler={["Fiyatlar", "İstatistikler"]}>
          <section className="ek-panel" aria-label="Fiyat basamakları">
            <p className="ek-not">Yayımlanmış tutarlar, KDV dahil. <Link className="pu-tumu" href="/panel/platform/fiyatlar">Düzenle</Link></p>
            <ul className="pu-liste">
              {basamaklar.map((plan) => {
                const aylik = planTutari(plan, fiyatlar);
                const yillik = planYillikTutari(plan, fiyatlar);
                return (
                  <li key={plan.code}>
                    <Link href="/panel/platform/fiyatlar">
                      <span className="pu-govde"><b>{plan.ad.tr}</b><small>{plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}</small></span>
                      <span className="ur-tutar">{aylik === null ? "Teklif" : para(aylik)}{yillik === null ? null : <small>{para(yillik)} / yıl</small>}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <IstatistikKarti
            kapsam="bütün lisanslar"
            kutular={[
              { ad: "Lisans", deger: sayi(satirlar.length), alt: `${sayi(acik.length)} açık` },
              { ad: "Ödeyen", deger: sayi(odeyen.length), alt: "aktif ya da gecikmiş" },
              ...(bireyselVar ? [
                { ad: "Bireysel abone", deger: sayi(acikAbone), alt: "açık abonelik" },
                { ad: "Kapalı abone", deger: sayi(aboneler.length - acikAbone), alt: "süresi geçmiş ya da iptal" },
              ] : []),
            ]}
            gruplar={[{ baslik: "Lisans durumuna göre", satirlar: durumSayilari }]}
          />
        </TalepAkis>
      </div>
    </div>
  </main>;
}
