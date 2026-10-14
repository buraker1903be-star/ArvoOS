import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PLANS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, ADD_ONS, planlar, urunAdi } from "@/lib/site/pricing";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";
import { fiyatlariYayimla, taslagiGeriAl, taslagiKaydet, yayindanKaldir } from "../urunler/actions";
import { PAKET_VARSAYILANI } from "@/lib/paket-limitleri";
import { PAKET_ADI, depolama, para, sayi, tarihSaat } from "../bicim";
import { bekleyenDegisiklikler, fiyatDenetimi, fiyatKaydi, yayimSonrasi, type FiyatKaydi } from "@/lib/fiyat-dogrulama";
import { YAYIN_KODU } from "@/lib/paket-ucreti";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import "../platform.css";

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
  /*
    iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): basamak tek satır —
    adı, altında birim · kod · kaynağı; sağda yayındaki aylık ve yıllık
    karşılığı, en sağda taslak kutusu ve düğmeler (sonu: satır bağlantı
    değil, kendi işini yapıyor). Eskiden beş sütunlu tablo satırıydı
    (KTablo); "yayım bekliyor" taslak hücresinin altında ayrı satırdı,
    şimdi durum noktası. Telefonda MobilSatir'e hiç düşülmüyordu (taslak
    formu gizlenirdi); bu satırda gizlenen bir şey yok.
  */
  return (
    <KOge
      baslik={ad}
      alt={<>{birim} · <span className="plt-mono">{kod}</span> · {konsoldan ? "konsoldan yayımlı" : "koddaki değer"}</>}
      durum={bekliyor ? { etiket: `Yayım bekliyor: ${taslak === null ? "Teklif" : para(taslak)}`, ton: "warning" } : null}
      deger={cozulmus === null ? "Teklif" : para(cozulmus)}
      /* Yıllıkta 10 ay bedeli ödeniyor; ek kalemler aylık, orada yıllık yok. */
      degerAlt={yillik ? (cozulmus === null ? "yıllık teklif" : `${para(cozulmus * YILLIK_ODENEN_AY)} / yıl`) : "aylık"}
      sonu={(
        /* Yayım satır başına değil, yukarıdaki önizlemeden TOPLU
           (14.10.2026): liste ya tamamen eski ya tamamen yeni. */
        <div className="plt-fiyat-eylem">
          <form action={taslagiKaydet} className="plt-fiyat-form">
            <input type="hidden" name="kod" value={kod} />
            <input type="text" name="tutar" inputMode="decimal"
              defaultValue={taslak === null ? "" : String(taslak / 100)}
              placeholder="boş = teklif" aria-label={`${ad} taslak tutar`} />
            <button className="panel-secondary" type="submit">Kaydet</button>
          </form>
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
      )}
    />
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
  searchParams: Promise<{ bolum?: string; urun?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { bolum, urun } = await searchParams;
  const secili = bolum === "paket" ? "paket" : bolum === "gecmis" ? "gecmis" : "liste";
  /* Fiyat listesinde tek ürün açık (?urun=): dört ürün ve ek hizmetler alt
     alta 2.200 piksel tutuyordu (14.10.2026, "kompakt, sade, premium"). */
  const LISTE_URUNLERI = ["arvoos", "arc", "randevu", "arvolab", "ek"] as const;
  const seciliUrun = (LISTE_URUNLERI as readonly string[]).includes(urun ?? "") ? urun! : "arvoos";

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

  /*
    14.10.2026: panelin kart ve tablo dili (konsol-ui). Eskiden düz
    panel-card + .plt-table + .plt-banner'dı. Bölümler (?bolum=) hâlâ
    üstteki şeritten seçiliyor; her bölüm alt alta KKart.
  */
  return <main className={`plt talep cari${secili === "liste" ? " ekip liste-sayfa" : ""}`}>
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜCRET VE PAKETLER</small>
        <h1>Ücret ve Paketler</h1>
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
      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Fiyat listesi">
          <div className="ekip-suzgec talep-suzgec">
            {LISTE_URUNLERI.map((kod) => {
              const bekleyen = kod === "ek"
                ? degisiklikler.filter((d) => d.urun === "ek").length
                : degisiklikler.filter((d) => d.urun === kod).length;
              return (
                <Link key={kod} href={`/panel/platform/fiyatlar?urun=${kod}`} className={seciliUrun === kod ? "is-active" : undefined}
                  aria-current={seciliUrun === kod ? "page" : undefined}>
                  {kod === "ek" ? "Ek hizmetler" : urunAdi(kod as Parameters<typeof urunAdi>[0])}
                  {bekleyen ? <small className="talep-uyari">{bekleyen} taslak</small> : null}
                </Link>
              );
            })}
          </div>
          {/*
            KOD VARSAYILAN, KONSOL ÜSTÜNE YAZAR (14.10.2026). Basamağın
            kendisi — adı, birimi, hangi üründe olduğu — lib/site/pricing'te
            kalıyor; buradan yalnızca TUTAR geçersiz kılınıyor. Veritabanı
            okunamazsa site fiyatsız kalmıyor: yayımlanmış bir fiyat
            listesinde boş hücre, yanlış rakamdan da kötüdür.
          */}
          <KListe>
            {seciliUrun === "ek"
              ? ADD_ONS.map((kalem) => (
                  <FiyatSatiri key={kalem.code} kod={kalem.code} ad={EK_KALEM_ADI[kalem.code] ?? kalem.code}
                    birim="ek kalem" cozulmus={cozulmus.get(kalem.code) ?? null} kayit={kayitlar.get(kalem.code)} />
                ))
              : planlar(seciliUrun as Parameters<typeof planlar>[0]).map((plan) => (
                  <FiyatSatiri key={plan.code} kod={plan.code} ad={plan.ad.tr}
                    birim={plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}
                    cozulmus={cozulmus.get(plan.code) ?? null} kayit={kayitlar.get(plan.code)} yillik />
                ))}
          </KListe>
        </section>

        <div className="liste-sag">
          {degisiklikler.length ? (
            /*
              Yayım formu kartın başlık satırında: panel tablosunun alt kenar
              boşluğu eksi (kartın kenarına yaslanıyor, konsol-ui.css); altına
              konan form onun üstüne biniyordu. Notlar tablonun ardında
              (.k-tablo + .k-not boşluğu konsol-ui.css'te).
            */
            <KKart
              baslik={`Yayım önizlemesi · ${sayi(degisiklikler.length)} değişiklik`}
              aciklama={<>
                Yayımlanınca ücretler sayfasında (TR ve EN), arama motorlarına giden fiyat bilgisinde (JSON-LD), llms-full.txt&apos;de
                (en geç on dakika içinde), kurulumun &quot;liste fiyatını uygula&quot; tutarında ve ArvoLab bireysel aboneliğinde
                geçerli olur. Liste tek seferde, birlikte yayımlanır.
              </>}
              sag={(
                <form action={fiyatlariYayimla} className="plt-fiyat-yayim">
                  {denetim.uyarilar.length ? (
                    <label className="plt-fiyat-onay"><input type="checkbox" name="onay" value="evet" required /> Uyarıları okudum, bu tutarlar doğru.</label>
                  ) : null}
                  <button className="panel-primary" type="submit" disabled={denetim.hatalar.length > 0}>
                    {sayi(degisiklikler.length)} değişikliği yayımla
                  </button>
                </form>
              )}
            >
              {/* iOS satırı (14.10.2026): sağda yeni tutar, altında önceki ve
                  yüzde. Eskiden dört sütunlu tabloydu; dar yan sütunda
                  "Şu an / Yayımlanınca" başlıkları satırın kendisinden uzundu.
                  %50 ve üstü değişim yine uyarı renginde. */}
              <KListe>
                {degisiklikler.map((d) => {
                  const degisim = d.yuzde === null ? "—" : `%${d.yuzde > 0 ? "+" : ""}${d.yuzde.toLocaleString("tr-TR")}`;
                  const buyuk = d.yuzde !== null && Math.abs(d.yuzde) >= 50;
                  return (
                    <KOge
                      key={d.kod}
                      baslik={basamakAdi(d.kod)}
                      alt={<span className="plt-mono">{d.kod}</span>}
                      deger={tutarYazi(d.yeni)}
                      degerAlt={<>önce {tutarYazi(d.eski)} · <span className={buyuk ? "talep-uyari" : undefined}>{degisim}</span></>}
                    />
                  );
                })}
              </KListe>
              {denetim.hatalar.length ? (
                <KNot ton="tehlike">
                    <b>Bu liste yayımlanamaz.</b>
                    {denetim.hatalar.map((h) => <Fragment key={h}><br />{h}</Fragment>)}
                  </KNot>
              ) : null}
              {denetim.uyarilar.length ? (
                <KNot ton="uyari">
                  <b>Yayımlamadan önce kontrol edin.</b>
                  {denetim.uyarilar.map((u) => <Fragment key={u}><br />{u}</Fragment>)}
                </KNot>
              ) : null}
              {etkilenenKiraci ? (
                <KNot>
                  Liste fiyatından ödeyen {sayi(etkilenenKiraci)} ArvoOS kiracısının ücreti kendiliğinden değişmez (yürürlükteki
                  dönem korunur); yayımdan sonra Kurulumlar&apos;da &quot;listeden farklı&quot; görünürler.
                </KNot>
              ) : null}
            </KKart>
          ) : null}
          <KKart baslik="Yayın" aciklama="Taslak hiçbir yerde görünmez; bekleyenler önizlemede birlikte yayımlanır.">
            {/* 14.10.2026: iki sayı kutusu (istat-kutular) yerine iki iOS
                satırı; şerit bu ikisinden yalnızca birini yazıyor. */}
            <KListe>
              <KOge baslik="Konsoldan yayımlı" alt="kalanı koddaki değer" deger={sayi(yayimliSayisi)} />
              <KOge baslik="Yayım bekleyen" alt="taslak"
                durum={bekleyenTaslak ? { etiket: "Önizlemede", ton: "warning" } : null} deger={sayi(bekleyenTaslak)} />
            </KListe>
            <KNot>
              Yıllıkta {sayi(YILLIK_ODENEN_AY)} ay bedeliyle 12 ay ({sayi(YILLIK_BEDAVA_AY)} ay bedava). KDV hariç. Ücretler
              sayfası, JSON-LD, llms-full.txt, kurulum ve ArvoLab bireysel aboneliği bu listeyi okur.
            </KNot>
          </KKart>
        </div>
      </div>
    ) : null}

    {secili === "paket" ? (
      <KKart
        baslik="ArvoOS paket limitleri"
        aciklama={<>
          Yeni kiracının lisansına yazılan varsayılanlar. Dahil kullanıcıyı aşan her etkin kullanıcı için ek kullanıcı
          bedeli ödeme bağlantısına eklenir. Kiracıya özel (pazarlıkla değişmiş) limit Lisans ve kota ekranından değişir;
          varsayılanı değiştirmek bugün bir migration gerektiriyor — konsoldan düzenleme henüz yok.
        </>}
      >
        {/* iOS satırı (14.10.2026): limitler altta tek satırda, sağda bugün
            o paketteki kiracı sayısı. Eskiden altı sütunlu tabloydu. */}
        <KListe>
          {Object.entries(PAKET_VARSAYILANI).map(([paket, limit]) => (
            <KOge
              key={paket}
              simge={PAKET_ADI[paket] ?? paket}
              baslik={PAKET_ADI[paket] ?? paket}
              alt={`${sayi(limit.userLimit)} dahil kullanıcı · ${depolama(limit.storageLimitMb)} · ${sayi(limit.aiCreditLimit)} yapay zekâ kredisi`}
              deger={`${sayi(paketKiracisi(paket))} kiracı`}
              degerAlt="bugün bu pakette"
            />
          ))}
        </KListe>
        <KNot>
          ArvoARC, Randevu ve ArvoLab&apos;in limitleri kiracının ürün lisansında (limits) duruyor ve bugün yalnızca
          gösteriliyor, uygulanmıyor.
        </KNot>
      </KKart>
    ) : null}

    {secili === "gecmis" ? (
      <KKart baslik="Fiyat geçmişi" aciklama="Her taslak, yayım, geri alma ve koda dönüş; kim, ne zaman, neyden neye. Son otuz kayıt.">
        {gecmisHatasi ? (
          <KNot ton="tehlike">Geçmiş okunamadı ({gecmisHatasi.message}) — kayıt yok demek değil.</KNot>
        ) : gecmis.length ? (
          /* iOS satırı (14.10.2026): basamak, altında kim · ne zaman; sağda
             işlem ve yeni tutar, altında önceki. Eskiden altı sütunlu tablo. */
          <KListe>
            {gecmis.map((g) => {
              /* Yayımda önceki satır yoksa koddaki değer geçerliydi. */
              const once = g.islem === "yayim" && !g.onceki_yayimli ? `${tutarYazi(koddakiTutar(g.kod))} (kod)` : tutarYazi(g.onceki_kurus);
              const sonra = g.islem === "koda_donus" ? `${tutarYazi(koddakiTutar(g.kod))} (kod)` : tutarYazi(g.yeni_kurus);
              const kim = g.kim ? kimAdi.get(g.kim) ?? "—" : "—";
              const islem = GECMIS_ISLEMI[g.islem] ?? g.islem;
              return (
                <KOge
                  key={g.id}
                  baslik={basamakAdi(g.kod)}
                  alt={<><span className="plt-mono">{g.kod}</span>{kim !== "—" ? ` · ${kim}` : ""} · {tarihSaat(g.zaman)}</>}
                  durum={{ etiket: islem, ton: g.islem === "yayim" ? "success" : "neutral" }}
                  deger={sonra}
                  degerAlt={`önce ${once}`}
                />
              );
            })}
          </KListe>
        ) : <KBos baslik="Henüz fiyat değişikliği yok" />}
      </KKart>
    ) : null}
  </main>;
}
