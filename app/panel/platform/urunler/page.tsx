import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, SUBSCRIBER_PRODUCTS } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { PLANS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, ADD_ONS, planlar, urunAdi } from "@/lib/site/pricing";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";
import { taslagiKaydet, taslagiYayimla, yayindanKaldir } from "./actions";
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

/*
  Fiyat satırı: yayındaki tutar, yıllık karşılığı, taslak kutusu ve iki
  düğme. Taslak ile yayın AYRI: tek adım olsaydı yanlış yazılan bir rakam
  yazıldığı anda sitede görünürdü.
*/
function FiyatSatiri({ kod, ad, birim, cozulmus, kayit, yillik }: {
  kod: string;
  ad: string;
  birim: string;
  /** Sitede şu an geçerli tutar (kod + yayımlanmış veritabanı değeri). */
  cozulmus: number | null;
  kayit?: { aylik_kurus: number | null; taslak_kurus: number | null; yayimlandi_at: string | null };
  yillik?: boolean;
}) {
  const konsoldan = Boolean(kayit?.yayimlandi_at);
  const taslak = kayit?.taslak_kurus ?? null;
  const bekliyor = taslak !== null && taslak !== (kayit?.aylik_kurus ?? null);
  return (
    <tr>
      <td>
        {ad}
        <small className="plt-substatus">{birim} · <span className="plt-mono">{kod}</span></small>
      </td>
      <td>
        {cozulmus === null ? "Teklif" : para(cozulmus)}
        <small className="plt-substatus">{konsoldan ? "konsoldan yayımlı" : "koddaki değer"}</small>
      </td>
      {/* Yıllıkta 10 ay bedeli ödeniyor; ek kalemler aylık, orada tire. */}
      <td>{yillik ? (cozulmus === null ? "Teklif" : para(cozulmus * YILLIK_ODENEN_AY)) : "—"}</td>
      <td>
        <form action={taslagiKaydet} className="plt-fiyat-form">
          <input type="hidden" name="kod" value={kod} />
          <input type="text" name="tutar" inputMode="decimal"
            defaultValue={taslak === null ? "" : String(taslak / 100)}
            placeholder="boş = teklif" aria-label={`${ad} taslak tutar`} />
          <button className="panel-secondary" type="submit">Kaydet</button>
        </form>
        {bekliyor ? <small className="plt-substatus talep-uyari">yayım bekliyor</small> : null}
      </td>
      <td>
        <div className="plt-fiyat-eylem">
          <form action={taslagiYayimla}>
            <input type="hidden" name="kod" value={kod} />
            <button className="panel-primary" type="submit" disabled={!bekliyor}>Yayımla</button>
          </form>
          {konsoldan ? (
            <form action={yayindanKaldir}>
              <input type="hidden" name="kod" value={kod} />
              <button className="panel-secondary" type="submit">Koda dön</button>
            </form>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

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

  const [{ data: kiraciSatirlari }, { data: urunLisanslari }, { data: aboneSatirlari }, { data: fiyatSatirlari }, arvolab, arc, randevu] = await Promise.all([
    supabase.from("platform_kiraci_liste").select("id,kind,license_status,monthly_fee,aktif_uye"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee"),
    supabase.from("product_subscribers").select("product,status"),
    /* Kurucu taslağı da görüyor (RLS: kurucu_fiyati_okur); site yalnızca
       yayımlanmış satırı okuyor. */
    supabase.from("platform_fiyat_listesi").select("kod,aylik_kurus,taslak_kurus,yayimlandi_at"),
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

  /*
    Yayımlanmış tutarlar koddakinin üstüne yazılıyor; satırı olmayan ya da
    yayımlanmamış basamak koddaki değerinde kalıyor (lib/site/fiyat-kaynagi).
  */
  type FiyatKaydi = { kod: string; aylik_kurus: number | null; taslak_kurus: number | null; yayimlandi_at: string | null };
  const fiyatKayitlari = (fiyatSatirlari ?? []) as FiyatKaydi[];
  const kayitlar = new Map(fiyatKayitlari.map((satir) => [satir.kod, satir]));
  const cozulmus = fiyatlariBirlestir(
    fiyatKayitlari.filter((satir) => satir.yayimlandi_at).map((satir) => ({ kod: satir.kod, aylikKurus: satir.aylik_kurus })),
  );
  const yayimliSayisi = fiyatKayitlari.filter((satir) => satir.yayimlandi_at).length;
  const bekleyenTaslak = fiyatKayitlari.filter(
    (satir) => satir.taslak_kurus !== null && satir.taslak_kurus !== satir.aylik_kurus,
  ).length;

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
          <dd className={bekleyenTaslak ? "talep-uyari" : undefined}>
            <Link href={adres("fiyat")} aria-current={secili === "fiyat" ? "page" : undefined}>{sayi(PLANS.length + ADD_ONS.length)}</Link>
          </dd>
          <small>{bekleyenTaslak ? `${sayi(bekleyenTaslak)} taslak yayım bekliyor` : `${sayi(yayimliSayisi)} tutar konsoldan yayımlı`}</small>
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
          {/*
            KOD VARSAYILAN, KONSOL ÜSTÜNE YAZAR (14.10.2026). Basamağın
            kendisi — adı, birimi, hangi üründe olduğu — lib/site/pricing'te
            kalıyor; buradan yalnızca TUTAR geçersiz kılınıyor. Veritabanı
            okunamazsa site fiyatsız kalmıyor: yayımlanmış bir fiyat
            listesinde boş hücre, yanlış rakamdan da kötüdür.
          */}
          <p className="plt-banner" data-tone="info">
            <span className="plt-banner-icon">i</span>
            <span>
              <b>Taslak ve yayın ayrı</b>
              Kaydettiğin tutar hiçbir yerde görünmez; &quot;Yayımla&quot; dedikten sonra sitede, JSON-LD&apos;de
              ve sözleşme metinlerinde geçerli olur. &quot;Koda dön&quot; basamağı koddaki değerine çevirir.
            </span>
          </p>
          {["arvoos", "arc", "randevu", "arvolab"].map((urun) => (
            <div key={urun}>
              <h3>{urunAdi(urun as Parameters<typeof urunAdi>[0])}</h3>
              <div className="plt-table-scroll">
                <table className="plt-table">
                  <thead><tr><th>Basamak</th><th>Yayındaki aylık</th><th>Yıllık</th><th>Taslak</th><th /></tr></thead>
                  <tbody>
                    {planlar(urun as Parameters<typeof planlar>[0]).map((plan) => (
                      <FiyatSatiri key={plan.code} kod={plan.code} ad={plan.ad.tr}
                        birim={plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}
                        cozulmus={cozulmus.get(plan.code) ?? null} kayit={kayitlar.get(plan.code)} yillik />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>

        <section className="panel-card" aria-label="Ek hizmetler">
          <h2>Ek hizmetler</h2>
          <p className="panel-muted">Pakete dahil olmayan, ayrıca ücretlendirilen kalemler.</p>
          <div className="plt-table-scroll">
            <table className="plt-table">
              <thead><tr><th>Kalem</th><th>Yayındaki aylık</th><th>Yıllık</th><th>Taslak</th><th /></tr></thead>
              <tbody>
                {ADD_ONS.map((kalem) => (
                  <FiyatSatiri key={kalem.code} kod={kalem.code} ad={EK_KALEM_ADI[kalem.code] ?? kalem.code}
                    birim="ek kalem" cozulmus={cozulmus.get(kalem.code) ?? null} kayit={kayitlar.get(kalem.code)} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    )}
  </main>;
}
