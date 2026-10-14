import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PLANS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, ADD_ONS, planlar, urunAdi } from "@/lib/site/pricing";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";
import { fiyatlariYayimla, taslagiGeriAl, taslagiKaydet, yayindanKaldir } from "../urunler/actions";
import { PAKET_VARSAYILANI } from "@/lib/paket-limitleri";
import { PAKET_ADI, depolama, para, sayi, tarihSaat } from "../bicim";
import { bekleyenDegisiklikler, fiyatDenetimi, fiyatKaydi, yayimSonrasi, type FiyatKaydi } from "@/lib/fiyat-dogrulama";
import { YAYIN_KODU } from "@/lib/paket-ucreti";
import "../../settings/settings.css";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  ÜCRET VE PAKETLER (14.10.2026, Kurucu Konsolu'nun "en önemli konusu").

  Fiyatlandırma bir gün önce Ürünler ekranının sekmesiydi; konsol sekiz
  ana menüye geçince kendi menüsü oldu. Üç bölüm:

    1. Fiyat listesi  — taslak, önizleme + denetim, TOPLU yayım
                        (platform_fiyat_listesi, lib/fiyat-dogrulama)
    2. Paket limitleri — ArvoOS paketlerinin dahil kullanıcı, depolama ve
                        yapay zekâ kredisi (lib/paket-limitleri)
    3. Fiyat geçmişi  — her taslak, yayım, geri alma, koda dönüş

  Yayımlanan tutar ücretler sayfasına (TR/EN), JSON-LD'ye, llms-full.txt'ye,
  kurulumun liste fiyatına ve ArvoLab bireysel aboneliğine gidiyor; hepsi
  aynı okuyucudan (lib/site/fiyat-oku).
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

type Kiraci = {
  id: string; kind: string | null; license_status: string | null; plan_code: string | null;
  monthly_fee: number | null; aktif_uye: number;
};

export default async function FiyatlarPage({ searchParams }: {
  searchParams: Promise<{ bolum?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { bolum } = await searchParams;
  const secili = bolum === "paket" ? "paket" : bolum === "gecmis" ? "gecmis" : "liste";

  const [{ data: kiraciSatirlari }, { data: fiyatSatirlari }] = await Promise.all([
    supabase.from("platform_kiraci_liste").select("id,kind,license_status,plan_code,monthly_fee,aktif_uye"),
    /* Kurucu taslağı da görüyor (RLS: kurucu_fiyati_okur); site yalnızca
       yayımlanmış satırı okuyor. "*": taslak_bekliyor sütunu
       20261014064505 ile geldi; uygulanmadan önce de sayfa açılsın. */
    supabase.from("platform_fiyat_listesi").select("*"),
  ]);
  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");

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
  const { data: gecmisSatirlari, error: gecmisHatasi } = secili === "gecmis"
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

  const adres = (kod: string) => `/panel/platform/fiyatlar${kod === "liste" ? "" : `?bolum=${kod}`}`;
  /* Paket başına kiracı sayısı: limitin kaç kiracıya varsayılan olarak
     yazıldığını değil, bugün o pakette kaç kiracı olduğunu söylüyor. */
  const paketKiracisi = (paket: string) => kiracilar.filter((k) => k.plan_code === paket).length;

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜCRET VE PAKETLER</small>
        <h1>Ücret ve Paketler</h1>
        <p>Dört ürünün liste fiyatları, ek hizmetler, paket limitleri ve fiyat geçmişi. Site ve ürünler fiyatı buradan okur.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/urunler">Ürünler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Ücret özeti">
      <dl>
        <div className={secili === "liste" ? "is-active" : undefined}>
          <dt>Fiyat listesi</dt>
          <dd className={bekleyenTaslak ? "talep-uyari" : undefined}>
            <Link href={adres("liste")} aria-current={secili === "liste" ? "page" : undefined}>{sayi(PLANS.length + ADD_ONS.length)}</Link>
          </dd>
          <small>{bekleyenTaslak ? `${sayi(bekleyenTaslak)} taslak yayım bekliyor` : `${sayi(yayimliSayisi)} tutar konsoldan yayımlı`}</small>
        </div>
        <div className={secili === "paket" ? "is-active" : undefined}>
          <dt>Paket limitleri</dt>
          <dd><Link href={adres("paket")} aria-current={secili === "paket" ? "page" : undefined}>{sayi(Object.keys(PAKET_VARSAYILANI).length)}</Link></dd>
          <small>ArvoOS paketleri</small>
        </div>
        <div className={secili === "gecmis" ? "is-active" : undefined}>
          <dt>Fiyat geçmişi</dt>
          <dd><Link href={adres("gecmis")} aria-current={secili === "gecmis" ? "page" : undefined}>Aç</Link></dd>
          <small>Kim, ne zaman, neyden neye</small>
        </div>
      </dl>
    </nav>

    {secili === "liste" ? (
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

      </>
    ) : null}

    {secili === "paket" ? (
      <section className="panel-card" aria-label="Paket limitleri">
        <h2>ArvoOS paket limitleri</h2>
        <p className="panel-muted">
          Yeni kiracının lisansına yazılan varsayılanlar. Dahil kullanıcıyı aşan her etkin kullanıcı için ek kullanıcı
          bedeli ödeme bağlantısına eklenir. Kiracıya özel (pazarlıkla değişmiş) limit Lisans ve kota ekranından değişir;
          varsayılanı değiştirmek bugün bir migration gerektiriyor — konsoldan düzenleme henüz yok.
        </p>
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Paket</th><th>Dahil kullanıcı</th><th>Depolama</th><th>Yapay zekâ kredisi</th><th>Bugün bu pakette</th></tr></thead>
            <tbody>
              {Object.entries(PAKET_VARSAYILANI).map(([paket, limit]) => (
                <tr key={paket}>
                  <td>{PAKET_ADI[paket] ?? paket}<small className="plt-substatus plt-mono">{paket}</small></td>
                  <td>{sayi(limit.userLimit)}</td>
                  <td>{depolama(limit.storageLimitMb)}</td>
                  <td>{sayi(limit.aiCreditLimit)}</td>
                  <td>{sayi(paketKiracisi(paket))} kiracı</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-muted">
          ArvoARC, Randevu ve ArvoLab&apos;in limitleri kiracının ürün lisansında (limits) duruyor ve bugün yalnızca
          gösteriliyor, uygulanmıyor.
        </p>
      </section>
    ) : null}

    {secili === "gecmis" ? (
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
    ) : null}
  </main>;
}
