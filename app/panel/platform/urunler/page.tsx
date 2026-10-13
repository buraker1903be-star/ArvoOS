import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, SUBSCRIBER_PRODUCTS } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { PLANS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, ADD_ONS, planlar, urunAdi, yillikKurus } from "@/lib/site/pricing";
import { para, sayi } from "../bicim";
import "../../settings/settings.css";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  ÜRÜNLER (14.10.2026, kurum sahibinin tarifi).

  İki bölüm, iki ayrı soru:

    1. Ürünler      — hangi ürünün kaç müşterisi, kaç kullanıcısı var,
                      köprüsü ayakta mı. "Ürün yaşıyor mu" sorusu.
    2. Fiyatlandırma — aylık ve yıllık liste fiyatları, ek hizmetler.

  Ürün başına sayılar bugüne kadar hiçbir ekranda YAN YANA değildi:
  modül matrisi hangi modülün hangi kiracıda açık olduğunu gösteriyordu
  ama "ArvoLab kaç kişiye satıldı" sorusunun yanıtı yoktu.

  ArvoOS'un müşterisi = çekirdek lisansı ödeyen kurum; ötekilerinki
  organization_product_licenses satırı. İkisini aynı sütunda saymak
  için kural tek: lisansı AÇIK olan kurum müşteridir.
*/

/*
  Ek kalemlerin konsoldaki adı. Pazarlama metni (app/(site)/_content)
  BURAYA IMPORT EDİLMİYOR: o ağacı panel rotasına çekmek site sınıflarını
  da sürüklüyor ve CSS denetimi haklı olarak kırılıyor. RAKAM yine tek
  kaynakta (lib/site/pricing → ADD_ONS); burada yalnızca kısa ad var.
*/
const EK_KALEM_ADI: Record<string, string> = {
  "ek-kullanici": "Ek kullanıcı",
  "ek-sube": "Ek şube",
  "veri-aktarimi": "Veri aktarımı ve kurulum",
  "ozel-gelistirme": "Kuruma özel geliştirme",
};

const ACIK_LISANS = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

type Kiraci = {
  id: string; kind: string | null; license_status: string | null;
  monthly_fee: number | null; aktif_uye: number;
};

export default async function UrunlerPage({ searchParams }: {
  searchParams: Promise<{ bolum?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { bolum } = await searchParams;
  const secili = bolum === "fiyat" ? "fiyat" : "urun";

  const [{ data: kiraciSatirlari }, { data: urunLisanslari }, { data: aboneSatirlari }, arvolab, arc, randevu] = await Promise.all([
    supabase.from("platform_kiraci_liste").select("id,kind,license_status,monthly_fee,aktif_uye"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee"),
    supabase.from("product_subscribers").select("product,status"),
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
  ]);

  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");
  const musteriMi = new Set(kiracilar.map((k) => k.id));
  const uyeSayisi = new Map(kiracilar.map((k) => [k.id, Number(k.aktif_uye)]));
  const urunler = ((urunLisanslari ?? []) as { organization_id: string; product: string; status: string; monthly_fee: number | null }[])
    .filter((satir) => musteriMi.has(satir.organization_id));
  const aboneler = ((aboneSatirlari ?? []) as { product: string; status: string }[]);

  const kopru: Record<string, { ok: boolean; not: string }> = {
    arvoos: { ok: true, not: "Konsolun kendi veritabanı" },
    arvolab: { ok: !arvolab?.broken, not: arvolab?.broken ? "Köprü yanıt vermiyor" : "Köprü sağlıklı" },
    arc: { ok: arc.ok, not: arc.ok ? "Köprü sağlıklı" : "Köprü yanıt vermiyor" },
    randevu: { ok: randevu.ok, not: randevu.ok ? "Köprü sağlıklı" : "Köprü yanıt vermiyor" },
  };

  const satirlar = PRODUCTS.map((urun) => {
    const cekirdek = urun.code === "arvoos";
    const kurumSatirlari = cekirdek
      ? kiracilar.filter((k) => ACIK_LISANS.has(k.license_status ?? ""))
      : urunler.filter((s) => s.product === urun.code && ACIK_LISANS.has(s.status));
    const odeyen = cekirdek
      ? kiracilar.filter((k) => ODEYEN.has(k.license_status ?? ""))
      : urunler.filter((s) => s.product === urun.code && ODEYEN.has(s.status));
    const gelir = cekirdek
      ? odeyen.reduce((t, k) => t + Number((k as Kiraci).monthly_fee ?? 0), 0)
      : odeyen.reduce((t, s) => t + Number((s as { monthly_fee: number | null }).monthly_fee ?? 0), 0);
    /* Kullanıcı sayısı KURUMUN aktif üyesi: ürün başına ayrı bir üyelik
       kaydı yok, kurumun ekibi ürünü birlikte kullanıyor. */
    const kullanici = cekirdek
      ? kurumSatirlari.reduce((t, k) => t + (uyeSayisi.get((k as Kiraci).id) ?? 0), 0)
      : kurumSatirlari.reduce((t, s) => t + (uyeSayisi.get((s as { organization_id: string }).organization_id) ?? 0), 0);
    const bireysel = aboneler.filter((a) => a.product === urun.code && ACIK_LISANS.has(a.status)).length;
    return { ...urun, kurum: kurumSatirlari.length, odeyen: odeyen.length, gelir, kullanici, bireysel, saglik: kopru[urun.code] };
  });

  const toplamGelir = satirlar.reduce((t, s) => t + s.gelir, 0);
  const toplamKurum = kiracilar.filter((k) => ACIK_LISANS.has(k.license_status ?? "")).length;
  const kopukKopru = satirlar.filter((s) => !s.saglik.ok).length;

  const adres = (kod: string) => `/panel/platform/urunler?bolum=${kod}`;

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜRÜNLER</small>
        <h1>Ürünler</h1>
        <p>Dört ürünün müşteri sayısı, kullanıcısı ve geliri; altında yayımlanmış fiyat listesi.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/moduller">Modül matrisi</Link>
        <Link className="panel-secondary" href="/panel/platform/saglik">Sistem sağlığı</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Ürün özeti">
      <dl>
        <div className={secili === "urun" ? "is-active" : undefined}>
          <dt>Ürün</dt>
          <dd><Link href={adres("urun")} aria-current={secili === "urun" ? "page" : undefined}>{sayi(PRODUCTS.length)}</Link></dd>
          <small>{kopukKopru ? `${sayi(kopukKopru)} köprü yanıt vermiyor` : "Hepsi ayakta"}</small>
        </div>
        <div className={secili === "fiyat" ? "is-active" : undefined}>
          <dt>Fiyatlandırma</dt>
          <dd><Link href={adres("fiyat")} aria-current={secili === "fiyat" ? "page" : undefined}>{sayi(PLANS.length)}</Link></dd>
          <small>Yayımlanmış basamak</small>
        </div>
        <div>
          <dt>Lisanslı kurum</dt>
          <dd>{sayi(toplamKurum)}</dd>
          <small>Çekirdek lisansı açık</small>
        </div>
        <div>
          <dt>Beklenen aylık</dt>
          <dd className="cari-arti">{para(toplamGelir)}</dd>
          <small>Dört ürünün toplamı</small>
        </div>
      </dl>
    </nav>

    {secili === "urun" ? (
      <section className="panel-card" aria-label="Ürün performansı">
        <h2>Ürün performansı</h2>
        <p className="panel-muted">
          Müşteri = lisansı açık kurum (deneme dahil). Kullanıcı sayısı kurumun aktif üyesidir: ürün başına ayrı bir
          üyelik kaydı yok, kurumun ekibi ürünü birlikte kullanıyor. Kendi markalarımız sayımda yok.
        </p>
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Ürün</th><th>Müşteri</th><th>Ödeyen</th><th>Kullanıcı</th><th>Bireysel abone</th><th>Aylık gelir</th><th>Sistem</th></tr></thead>
            <tbody>
              {satirlar.map((urun) => (
                <tr key={urun.code}>
                  <td>
                    {urun.name}
                    <small className="plt-substatus">{urun.description}</small>
                  </td>
                  <td>{sayi(urun.kurum)}</td>
                  <td>{sayi(urun.odeyen)}</td>
                  <td>{sayi(urun.kullanici)}</td>
                  {/* Randevu'nun bireysel aboneliği yok: salon kurumdur. */}
                  <td>{SUBSCRIBER_PRODUCTS.some((p) => p.code === urun.code) ? sayi(urun.bireysel) : "—"}</td>
                  <td>{urun.gelir ? para(urun.gelir) : "—"}</td>
                  <td>
                    <span className="status-pill" data-tone={urun.saglik.ok ? "success" : "danger"}>{urun.saglik.ok ? "Ayakta" : "Sorunlu"}</span>
                    <small className="plt-substatus">{urun.saglik.not}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : (
      <>
        <section className="panel-card" aria-label="Yayımlanmış fiyat listesi">
          <h2>Fiyatlandırma</h2>
          <p className="panel-muted">
            Sitedeki ücretler sayfası, JSON-LD ve sözleşme metinleri bu rakamları kullanıyor.
            Yıllık seçenekte {sayi(YILLIK_ODENEN_AY)} ay bedeliyle 12 ay ({sayi(YILLIK_BEDAVA_AY)} ay bedava).
            Tutarlar KDV hariçtir.
          </p>
          {/* RAKAMLAR ŞU AN KODDA (lib/site/pricing.ts) ve bu ekran onları
              OKUYOR. Konsoldan düzenlenebilir hale getirmek bir veritabanı
              adımı istiyor; gerekçesi ve tasarımı kurum sahibiyle
              konuşuluyor (14.10.2026). */}
          <p className="plt-banner" data-tone="warning">
            <span className="plt-banner-icon">!</span>
            <span>
              <b>Bu ekran şu an okunur</b>
              Rakamlar kodda tek kaynakta duruyor ve her değişiklik gözden geçirmeden yayına çıkmıyor.
              Konsoldan düzenlenebilir hale getirmek için bir veritabanı adımı gerekiyor.
            </span>
          </p>
          {["arvoos", "arc", "randevu", "arvolab"].map((urun) => (
            <div key={urun}>
              <h3>{urunAdi(urun as Parameters<typeof urunAdi>[0])}</h3>
              <table className="plt-table">
                <thead><tr><th>Basamak</th><th>Aylık</th><th>Yıllık</th><th>Birim</th></tr></thead>
                <tbody>
                  {planlar(urun as Parameters<typeof planlar>[0]).map((plan) => (
                    <tr key={plan.code}>
                      <td>
                        {plan.ad.tr}
                        {plan.oneCikan ? <small className="plt-substatus">öne çıkan</small> : null}
                      </td>
                      <td>{plan.aylikKurus === null ? "Teklif" : para(plan.aylikKurus)}</td>
                      <td>{plan.aylikKurus === null ? "Teklif" : para(yillikKurus(plan) ?? 0)}</td>
                      <td>{plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="panel-card" aria-label="Ek hizmetler">
          <h2>Ek hizmetler</h2>
          <p className="panel-muted">Pakete dahil olmayan, ayrıca ücretlendirilen kalemler.</p>
          <table className="plt-table">
            <thead><tr><th>Kalem</th><th>Aylık</th><th>Kod</th></tr></thead>
            <tbody>
              {ADD_ONS.map((kalem) => (
                <tr key={kalem.code}>
                  <td>{EK_KALEM_ADI[kalem.code] ?? kalem.code}</td>
                  <td>{kalem.aylikKurus === null ? "Teklif" : para(kalem.aylikKurus)}</td>
                  <td className="plt-mono">{kalem.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    )}
  </main>;
}
