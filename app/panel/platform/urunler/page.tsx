import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, SUBSCRIBER_PRODUCTS } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { PLANS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, ADD_ONS, planlar, urunAdi } from "@/lib/site/pricing";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";
import { fiyatlariYayimla, taslagiGeriAl, taslagiKaydet, yayindanKaldir } from "./actions";
import { para, sayi, tarihSaat } from "../bicim";
import { bekleyenDegisiklikler, fiyatDenetimi, fiyatKaydi, yayimSonrasi, type FiyatKaydi } from "@/lib/fiyat-dogrulama";
import { YAYIN_KODU } from "@/lib/paket-ucreti";
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
  kayit?: FiyatKaydi;
  yillik?: boolean;
}) {
  const konsoldan = Boolean(kayit?.yayimlandi_at);
  const taslak = kayit?.taslak_kurus ?? null;
  const bekliyor = Boolean(kayit?.taslak_bekliyor);
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
        {bekliyor ? <small className="plt-substatus talep-uyari">yayım bekliyor: {taslak === null ? "Teklif" : para(taslak)}</small> : null}
      </td>
      <td>
        {/* Yayım satır başına değil, yukarıdaki önizlemeden TOPLU
            (14.10.2026): liste ya tamamen eski ya tamamen yeni. */}
        <div className="plt-fiyat-eylem">
          {bekliyor ? (
            <form action={taslagiGeriAl}>
              <input type="hidden" name="kod" value={kod} />
              <button className="panel-secondary" type="submit">Geri al</button>
            </form>
          ) : null}
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

const GECMIS_ISLEMI: Record<string, string> = {
  taslak: "Taslak",
  taslak_iptal: "Taslak geri alındı",
  yayim: "Yayımlandı",
  koda_donus: "Koda döndü",
};

const ACIK_LISANS = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

type Kiraci = {
  id: string; kind: string | null; license_status: string | null; plan_code: string | null;
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
    supabase.from("platform_kiraci_liste").select("id,kind,license_status,plan_code,monthly_fee,aktif_uye"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee"),
    supabase.from("product_subscribers").select("product,status"),
    /* Kurucu taslağı da görüyor (RLS: kurucu_fiyati_okur); site yalnızca
       yayımlanmış satırı okuyor. */
    /* "*": taslak_bekliyor sütunu 20261014064505 ile geldi; uygulanmadan
       önce de sayfa açılsın (fiyatKaydi eski kurala düşüyor). */
    supabase.from("platform_fiyat_listesi").select("*"),
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
  const fiyatKayitlari = ((fiyatSatirlari ?? []) as Parameters<typeof fiyatKaydi>[0][]).map(fiyatKaydi);
  const kayitlar = new Map(fiyatKayitlari.map((satir) => [satir.kod, satir]));
  const cozulmus = fiyatlariBirlestir(
    fiyatKayitlari.filter((satir) => satir.yayimlandi_at).map((satir) => ({ kod: satir.kod, aylikKurus: satir.aylik_kurus })),
  );
  const yayimliSayisi = fiyatKayitlari.filter((satir) => satir.yayimlandi_at).length;

  /*
    ÖNİZLEME VE DENETİM (14.10.2026): yayımlanacak her değişiklik önce →
    sonra ve yüzdeyle; merdiveni bozan liste yayımlanamaz, büyük değişim
    açık onay ister. Aynı denetim sunucu işleminde de çalışıyor.
  */
  const degisiklikler = bekleyenDegisiklikler(fiyatKayitlari, cozulmus);
  const bekleyenTaslak = degisiklikler.length;
  const denetim = fiyatDenetimi(yayimSonrasi(cozulmus, degisiklikler), degisiklikler);
  /* Mevcut kiracıların ücreti listeyle KENDİLİĞİNDEN değişmez (yürürlükteki
     dönem). Değişen ArvoOS basamağından liste fiyatıyla ödeyen kiracı
     sayısı yazılıyor: yayımdan sonra Kurulumlar'da "listeden farklı"
     görünecekler. */
  const paketiniBul = new Map(Object.entries(YAYIN_KODU).map(([paket, kod]) => [kod, paket]));
  const etkilenenKiraci = degisiklikler.reduce((toplam, d) => {
    const paket = paketiniBul.get(d.kod);
    if (!paket || d.eski === null) return toplam;
    return toplam + kiracilar.filter((k) => k.plan_code === paket && Number(k.monthly_fee ?? 0) === d.eski).length;
  }, 0);

  /* Fiyat geçmişi: son otuz değişiklik. Migration uygulanmadıysa tablo
     yok; bölüm "okunamadı" diyor, boş liste göstermiyor. */
  const { data: gecmisSatirlari, error: gecmisHatasi } = secili === "fiyat"
    ? await supabase.from("platform_fiyat_gecmisi")
        .select("id,kod,islem,onceki_kurus,onceki_yayimli,yeni_kurus,kim,zaman")
        .order("id", { ascending: false }).limit(30)
    : { data: null, error: null };
  const gecmis = (gecmisSatirlari ?? []) as {
    id: number; kod: string; islem: string; onceki_kurus: number | null; onceki_yayimli: boolean;
    yeni_kurus: number | null; kim: string | null; zaman: string;
  }[];
  const kimIdleri = [...new Set(gecmis.map((g) => g.kim).filter((k): k is string => Boolean(k)))];
  const { data: kimSatirlari } = kimIdleri.length
    ? await supabase.from("profiles").select("id,full_name").in("id", kimIdleri)
    : { data: [] };
  const kimAdi = new Map(((kimSatirlari ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "—"]));
  const basamakAdi = (kod: string) => {
    const plan = PLANS.find((p) => p.code === kod);
    return plan ? `${urunAdi(plan.product)} · ${plan.ad.tr}` : EK_KALEM_ADI[kod] ?? kod;
  };
  const koddakiTutar = (kod: string) => PLANS.find((p) => p.code === kod)?.aylikKurus ?? ADD_ONS.find((a) => a.code === kod)?.aylikKurus ?? null;
  const tutarYazi = (kurus: number | null) => (kurus === null ? "Teklif" : para(Number(kurus)));

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
        {degisiklikler.length ? (
          <section className="panel-card" aria-label="Yayım önizlemesi">
            <h2>Yayım önizlemesi <small className="plt-substatus">{sayi(degisiklikler.length)} değişiklik</small></h2>
            <p className="panel-muted">
              Yayımlanınca ücretler sayfasında (TR ve EN), arama motorlarına giden fiyat bilgisinde (JSON-LD), llms-full.txt&apos;de
              (en geç on dakika içinde), kurulumun &quot;liste fiyatını uygula&quot; tutarında ve ArvoLab bireysel aboneliğinde
              geçerli olur. Liste tek seferde, birlikte yayımlanır.
            </p>
            <div className="plt-table-scroll">
              <table className="plt-table">
                <thead><tr><th>Basamak</th><th>Şu an</th><th>Yayımlanınca</th><th>Değişim</th></tr></thead>
                <tbody>
                  {degisiklikler.map((d) => (
                    <tr key={d.kod}>
                      <td>{basamakAdi(d.kod)}<small className="plt-substatus plt-mono">{d.kod}</small></td>
                      <td>{tutarYazi(d.eski)}</td>
                      <td><b>{tutarYazi(d.yeni)}</b></td>
                      <td className={d.yuzde !== null && Math.abs(d.yuzde) >= 50 ? "talep-uyari" : undefined}>
                        {d.yuzde === null ? "—" : `%${d.yuzde > 0 ? "+" : ""}${d.yuzde.toLocaleString("tr-TR")}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {etkilenenKiraci ? (
              <p className="panel-muted">
                Liste fiyatından ödeyen {sayi(etkilenenKiraci)} ArvoOS kiracısının ücreti kendiliğinden değişmez (yürürlükteki
                dönem korunur); yayımdan sonra Kurulumlar&apos;da &quot;listeden farklı&quot; görünürler.
              </p>
            ) : null}
            {denetim.hatalar.length ? (
              <div className="plt-banner" data-tone="danger" role="alert">
                <span className="plt-banner-icon">!</span>
                <span><b>Bu liste yayımlanamaz</b>{denetim.hatalar.map((h) => <p key={h}>{h}</p>)}</span>
              </div>
            ) : null}
            {denetim.uyarilar.length ? (
              <div className="plt-banner" data-tone="warning">
                <span className="plt-banner-icon">!</span>
                <span><b>Yayımlamadan önce kontrol edin</b>{denetim.uyarilar.map((u) => <p key={u}>{u}</p>)}</span>
              </div>
            ) : null}
            <form action={fiyatlariYayimla} className="plt-fiyat-yayim">
              {denetim.uyarilar.length ? (
                <label className="plt-fiyat-onay"><input type="checkbox" name="onay" value="evet" required /> Uyarıları okudum, bu tutarlar doğru.</label>
              ) : null}
              <button className="panel-primary" type="submit" disabled={denetim.hatalar.length > 0}>
                {sayi(degisiklikler.length)} değişikliği yayımla
              </button>
            </form>
          </section>
        ) : null}

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
              Kaydettiğin tutar hiçbir yerde görünmez; bekleyen taslaklar yukarıdaki önizlemede birlikte
              yayımlanır. &quot;Geri al&quot; taslağı bırakır, &quot;Koda dön&quot; basamağı koddaki değerine çevirir.
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

        <section className="panel-card" aria-label="Fiyat geçmişi">
          <h2>Fiyat geçmişi</h2>
          <p className="panel-muted">Her taslak, yayım, geri alma ve koda dönüş; kim, ne zaman, neyden neye. Son otuz kayıt.</p>
          {gecmisHatasi ? (
            <p className="panel-muted">Geçmiş okunamadı ({gecmisHatasi.message}) — kayıt yok demek değil.</p>
          ) : gecmis.length ? (
            <div className="plt-table-scroll">
              <table className="plt-table">
                <thead><tr><th>Zaman</th><th>Basamak</th><th>İşlem</th><th>Önce → sonra</th><th>Kim</th></tr></thead>
                <tbody>
                  {gecmis.map((g) => (
                    <tr key={g.id}>
                      <td>{tarihSaat(g.zaman)}</td>
                      <td>{basamakAdi(g.kod)}</td>
                      <td>{GECMIS_ISLEMI[g.islem] ?? g.islem}</td>
                      <td>
                        {/* Yayımda önceki satır yoksa koddaki değer geçerliydi. */}
                        {g.islem === "yayim" && !g.onceki_yayimli ? `${tutarYazi(koddakiTutar(g.kod))} (kod)` : tutarYazi(g.onceki_kurus)}
                        {" → "}
                        {g.islem === "koda_donus" ? `${tutarYazi(koddakiTutar(g.kod))} (kod)` : tutarYazi(g.yeni_kurus)}
                      </td>
                      <td>{g.kim ? kimAdi.get(g.kim) ?? "—" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="panel-muted">Henüz fiyat değişikliği yok.</p>}
        </section>
      </>
    )}
  </main>;
}
