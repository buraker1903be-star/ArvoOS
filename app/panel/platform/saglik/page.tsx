import Link from "next/link";
import { notFound } from "next/navigation";
import { depolamaKullanimi } from "@/lib/lisans-olcumleri";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabKopyalari, getArvolabBridgeHealth } from "@/lib/arvolab";
import { arcKopyalari, getArcBridgeHealth } from "@/lib/arc-bridge";
import { randevuKopyalari, getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { eskiKopyalar } from "@/lib/kopya-denetimi";
import { kotaDurumu, kotayaGoreSirala } from "@/lib/kota-durumu";
import { fazlaVerilen, limitSapmalari } from "@/lib/paket-limitleri";
import { musteriMi } from "@/lib/kurum-turu";
import { bekleyenKrediler } from "@/lib/ai-kredi-yukleme";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { cronAralikMetni, cronDurumlari, cronSorunlari, type CronKaydi, type CronDurumu } from "@/lib/cron-isleri";
import type { ReactNode } from "react";
import { basHarfleri, PAKET_ADI, gecenSure, para, sayi, tarihSaat } from "../bicim";
import { KNot } from "../konsol-ui";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

/*
  SİSTEM SAĞLIĞI (14.10.2026).

  Konsolun söylediği her "bir şey bozuk" uyarısı ayrı bir ekrandaydı:
  köprü kopması ana sayfada bir satır, karşılıksız ödeme Ödemeler
  sayfasında bir bölüm, kota aşımı kiracı listesinde bir rozet, bayat
  ürün kopyası yine ana sayfada tek cümle. Kurucu "bugün bir şey mi
  bozuldu" sorusunu dört ekranı gezerek yanıtlıyordu — ve üçü de
  bakılmadığında sessiz kalıyordu.

  Bu sayfa YENİ BİR ÖLÇÜM YAPMIYOR: var olan dört kaynağı tek yerde
  topluyor. Yeni bir doğruluk iddiası getirmediği için de yeni bir
  yanılma yolu açmıyor.

  Okunamayan kaynak "sorun yok" diye gösterilmez: her bölüm okunup
  okunamadığını ayrıca yazar. Bir gelen kutusunda da, bir sağlık
  ekranında da söylenebilecek en yanlış şey budur.
*/

const PENDING_STATES = new Set(["creating", "inviting_owner", "waiting_owner"]);

/*
  Şimdiki zaman MODÜL KAPSAMINDA okunuyor: `new Date()` render gövdesinde
  react-hooks saflık kuralını bozuyor (bu dosyada bir kez yaşandı).
*/
function cronTablosu(satirlar: CronKaydi[], baslangic: Date | null) {
  return cronDurumlari(satirlar, new Date(), baslangic);
}

const CRON_DURUM: Record<CronDurumu["durum"], { etiket: string; ton: string }> = {
  tamam: { etiket: "Çalışıyor", ton: "success" },
  gecikti: { etiket: "Gecikti", ton: "danger" },
  dustu: { etiket: "Son koşma düştü", ton: "warning" },
  hic: { etiket: "Kayıt yok", ton: "neutral" },
};

/** Kaydın ayrıntısındaki ilk hata cümlesi (varsa). */
function cronHataMetni(ayrinti: unknown): string | null {
  const hata = (ayrinti as { hata?: unknown } | null)?.hata;
  if (typeof hata === "string" && hata) return hata;
  if (Array.isArray(hata) && typeof hata[0] === "string" && hata[0]) return hata[0];
  return null;
}

type Kiraci = {
  id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null;
  provisioning_state: string; license_status: string | null; plan_code: string | null;
  user_limit: number | null; storage_limit_mb: number | null; aktif_uye: number;
};

export default async function SistemSagligiPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const [
    { data: kiraciSatirlari, error: kiraciHatasi },
    { data: urunSatirlari, error: urunHatasi },
    // hata-tamam: depolamaKullanimi bir promise; düşerse Promise.all reddedilir ve sayfa hata ekranına gider
    { data: depolamalar },
    { data: cronSatirlari, error: cronHatasi },
    { data: cronIlk, error: cronIlkHatasi },
  ] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,grup_markasi,provisioning_state,license_status,plan_code,user_limit,storage_limit_mb,aktif_uye")
      .order("name"),
    supabase.from("organization_product_licenses").select("organization_id,product,status"),
    /* Depolama toplamı 5 dk önbellekte (lib/lisans-olcumleri): storage.objects'i taramak her sayfa açılışında tekrar ediliyordu. */
    depolamaKullanimi().then((data) => ({ data: data as { organization_id: string; bytes: number }[], error: null })),
    supabase.from("platform_cron_durumu").select("is_adi,son_calisma,son_basarili,sonuc,sure_ms,ayrinti"),
    /* Kayıt tutmanın başlangıcı: hiç koşmamış bir işin "henüz" mü yoksa
       zamanlayıcıya hiç kaydolmamış mı olduğunu bu ayırıyor. */
    supabase.from("platform_cron_kayitlari").select("basladi_at").order("basladi_at", { ascending: true }).limit(1),
  ]);

  const [arvolab, arc, randevu, labKopya, arcKopya, rdvKopya, odemeOlaylari] = await Promise.all([
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
    arvolabKopyalari(),
    arcKopyalari(),
    randevuKopyalari(),
    getPaymentIncidents(),
  ]);

  /*
    ÖDENMİŞ AMA YÜKLENEMEMİŞ AI KREDİSİ (lib/ai-kredi-yukleme). Kurtarma
    işi on dakikada bir deniyor; burada görünen satır, denemenin hâlâ
    başarısız olduğu anlamına geliyor. Okuma düşerse LİSTE DEĞİL HATA
    tutuluyor: "bekleyen kredi yok" ile "bakamadım" aynı şey değil.
  */
  const krediSonucu = admin
    ? await bekleyenKrediler(admin).then((veri) => ({ veri, hata: null as string | null }))
      .catch((hata: unknown) => ({ veri: [], hata: hata instanceof Error ? hata.message : String(hata) }))
    : { veri: [], hata: null };

  /* Kurulum günlüğü yalnızca sunucu anahtarıyla okunuyor; anahtar yoksa
     satır hiç çizilmiyor ("0 hata" yazmak okunamayanı temiz göstermek). */
  const { data: kurulumKayitlari, error: kurulumHatasi } = admin
    ? await admin.from("provisioning_audit_logs").select("id,organization_id,action,result,state,created_at")
        /*
          DEĞER 'failed', 'error' DEĞİL (14.10.2026). Sütunun kısıtı
          ('started','success','failed') 'error'a hiç izin vermiyor:
          sorgu hata vermiyor, sessizce SIFIR satır dönüyordu ve kart
          "Kurulum hatası yok" demeyi hiçbir koşulda bırakamıyordu.
          Yanlış sütun adı üretimde hata verir ve bir yerde yakalanır,
          yanlış DEĞER hiç iz bırakmaz — bu yüzden daha sinsi.
        */
        .eq("result", "failed").order("created_at", { ascending: false }).limit(10)
    : { data: null, error: null };

  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]);
  const musteriler = kiracilar.filter((kurum) => kurum.kind !== "internal");
  const kurumAdi = new Map(kiracilar.map((k) => [k.id, k.display_name || k.name]));
  const depolamaBayt = new Map(
    ((depolamalar ?? []) as { organization_id: string; bytes: number }[]).map((s) => [s.organization_id, Number(s.bytes ?? 0)]),
  );

  const kotalar = kotayaGoreSirala(
    musteriler
      .filter((k) => k.user_limit !== null && k.storage_limit_mb !== null)
      .map((k) => kotaDurumu({
        organizationId: k.id,
        kullaniciSayisi: Number(k.aktif_uye),
        kullaniciLimiti: Number(k.user_limit),
        depolamaBayt: depolamaBayt.get(k.id) ?? 0,
        depolamaLimitiMb: Number(k.storage_limit_mb),
      })),
  ).filter((k) => k.durum !== "normal");

  /*
    PAKETİYLE UYUŞMAYAN LİSANSLAR. Sapma bugüne kadar yalnızca lisans
    formunda, SEÇİLİ kiracı için görünüyordu: "hangi kiracı paketinden
    fazlasını alıyor" sorusunu yanıtlamak için kiracıları tek tek açmak
    gerekiyordu. Kotada aynı boşluk vardı ve kapatılmıştı; bu onun
    kardeşi — orada hakkından fazlasını KULLANIYOR, burada hakkından
    fazlası TANIMLANMIŞ.

    Yalnızca FAZLA verilenler listeleniyor: eksik tanımlanmış limit de
    bir sapma ama kurucunun parasını değil müşterinin hakkını
    ilgilendiriyor ve lisans ekranında zaten görünüyor.
  */
  /*
    SAPMA YALNIZCA GERÇEK MÜŞTERİDE ANLAMLI (lib/kurum-turu).

    Kartın gerekçesi "ücretli bir pakette sessiz sapma, satılmamış
    koltuğu bedava vermek demek". Grup markası ücret ödemiyor ve müşteri
    gelirine karışmıyor; limitleri de bilerek geniş — ArvoCulture'a
    paketin üç kullanıcısı yerine 250 tanımlı ve bu bir kaçak değil,
    verilmiş bir karar. Her gün "açık sorun" diye sayılması kartın
    okunmamasına, dolayısıyla gerçek bir sapmanın da görülmemesine yol
    açardı.

    Öteki kartlar grup markalarını SAYMAYA devam ediyor: kotada, bayat
    kopyada ve kurulumda soru "para" değil "çalışıyor mu" — grup markası
    da panelde çalışıyor ve kotası dolarsa kullanıcısı engellenir.

    Ekran eskiden ham `kind !== 'internal'` testiyle yalnızca Arvo'nun
    kendisini eliyordu; sınıflandırma 14.10.2026'da tek yere alınmıştı
    ama bu sayfa dışarıda kalmıştı.
  */
  const limitSapanlar = musteriler
    .filter(musteriMi)
    .map((k) => ({
      kiraci: k,
      /* AI kredisi KIYASLANMIYOR: kiracı görünümünde o sütun yok.
         Burada eskiden "limiti hiçbir kod uygulamıyor" yazıyordu ve bu
         YANLIŞTI (14.10.2026'da düzeltildi): limiti ArvoLab kendi kredi
         kapısında uyguluyor — %80'de uyarıyor, hak bitince asistanı
         durduruyor. Körelmiş olan yalnızca ArvoOS'taki ai_credits_used
         sütunu; tüketim ArvoLab'dan canlı okunuyor (lib/urun-kullanimi).
         Kıyaslanmamasının sebebi sütunun görünümde olmaması; limit
         sapması sayfanın okuduğu veriden hesaplanamıyor. */
      sapmalar: fazlaVerilen(limitSapmalari(k.plan_code, {
        userLimit: k.user_limit, storageLimitMb: k.storage_limit_mb, aiCreditLimit: null,
      })),
    }))
    .filter((x) => x.sapmalar.length > 0);

  const olculenKiracilar = new Set(musteriler.map((k) => k.id));
  const bayatKopyalar = eskiKopyalar(
    ((urunSatirlari ?? []) as { organization_id: string; product: string; status: string }[])
      .filter((s) => olculenKiracilar.has(s.organization_id)),
    { arvolab: labKopya, arc: arcKopya, randevu: rdvKopya },
  );

  const kopruler = [
    { ad: "ArvoLab", bozuk: Boolean(arvolab?.broken), not: arvolab?.broken ? (arvolab.permanent ? "Anahtar eksik ya da iki tarafta farklı" : "ArvoLab ArvoOS'a ulaşamıyor") : "Yanıt veriyor" },
    { ad: "ArvoARC", bozuk: !arc.ok, not: arc.ok ? "Yanıt veriyor" : arc.error ? `Bağlanılamadı: ${arc.error}` : `Tanımsız değişken: ${arc.missing.join(", ")}` },
    { ad: "ArvoCal", bozuk: !randevu.ok, not: randevu.ok ? "Yanıt veriyor" : randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımsız değişken: ${randevu.missing.join(", ")}` },
  ];

  /* OKUNAMAYAN KAYNAK "SORUN YOK" DEĞİL: kayıtlar okunamazsa her iş
     "henüz kaydı yok" görünürdü ve bu nötr durum sessizce yeşil sayılırdı.
     Hata kartın kendisinde yazılı; sayım da yapılmıyor. */
  const cronBaslangici = ((cronIlk ?? []) as { basladi_at: string }[])[0]?.basladi_at ?? null;
  const cronDurum = cronHatasi ? [] : cronTablosu((cronSatirlari ?? []) as unknown as CronKaydi[], cronBaslangici ? new Date(cronBaslangici) : null);
  const cronSorun = cronSorunlari(cronDurum);
  /* KAYDI OLMAYAN İŞ "ZAMANINDA KOŞUYOR" DEĞİL. Şerit sorunsuz iş sayısını
     yazıyordu ve kayıt tutmanın ilk gününde "5 / 5 · hepsi zamanında
     koşuyor" diyordu — oysa beşinin hiçbiri henüz koşmamıştı. Pay yalnızca
     KAYDI OLAN ve sorunsuz işler; bekleyenler alt satırda sayılıyor.

     tuzak-tamam: cronDurum sınırlı bir sorgudan GELMİYOR. Kaynağı
     platform_cron_durumu (iş başına tek satır, limitsiz) ve uzunluğu
     vercel.json'daki cron sayısı kadar — cronDurumlari o listeyi
     dolaşıyor, satırları değil. Aynı Promise.all'daki .limit(1), kayıt
     tutmanın başlangıcını bulan AYRI sorguya ait (cronIlk). */
  const cronBekleyen = cronDurum.filter((d) => d.durum === "hic").length;
  const cronSaglikli = cronDurum.length - cronBekleyen - cronSorun.length;

  /*
    YALNIZCA HÂLÂ HATADA OLAN KURULUMLAR (14.10.2026).

    Sorgu 'error' arıyordu ve sütunun kısıtı o değere izin vermediği için
    kart hiçbir koşulda dolamıyordu. Değer 'failed'e çevrilince dört
    gerçek hata ortaya çıktı — ama dördü de Ağustos/Eylül'dendi ve o
    kiracılar bugün KULLANIMDA: kurulum sonradan tamamlanmış. Çözülmüş
    hatayı "açık sorun" diye saymak şeridi kalıcı olarak 2'den 6'ya
    çıkarıyordu ve sürekli dolu bir liste okunmaz olur — bu ekranın
    varlık sebebine aykırı.

    Ayıraç kiracının BUGÜNKÜ durumu: kurulum günlüğü geçmişi anlatır,
    sağlık ekranı bugünü. Geçmiş kayıtlar konsol ana sayfasının "Son
    kurulum hareketleri" listesinde duruyor.
  */
  const hatadaKalanlar = new Set(kiracilar.filter((k) => k.provisioning_state === "failed").map((k) => k.id));
  const kurulumHatalari = ((kurulumKayitlari ?? []) as { id: string | number; organization_id: string; action: string; state: string | null; created_at: string }[])
    .filter((kayit) => hatadaKalanlar.has(kayit.organization_id));
  const kurulumBekleyen = musteriler.filter((k) => PENDING_STATES.has(k.provisioning_state)).length;
  /*
    OKUNAMAYAN SORGU "SORUN YOK" DEĞİLDİR (15.10.2026).

    Supabase istemcisi hata fırlatmıyor, `error` alanına yazıyor. Bu iki
    okumanın hatası alınmıyordu: düşerse `data` null kalıyor, kiracı
    listesi boş sayılıyor ve ONA BAĞLI ÜÇ BÖLÜM birden sıfıra iniyor —
    kota, limit sapması ve bayat kopya. Yani sorun olup olmadığını
    söylemekle görevli ekran, tam da göremediği anda "Her şey yolunda"
    diyordu. Sayfanın kendisi bu kuralı koşma kayıtlarında ve kredi
    siparişlerinde zaten uyguluyordu ("'bekleyen yok' demek değil");
    bu iki okuma dışarıda kalmıştı.
  */
  const okunamayan = ([
    ["Kiracı listesi", kiraciHatasi],
    ["Ürün lisansları", urunHatasi],
    ["Koşma kayıtlarının başlangıcı", cronIlkHatasi],
    ["Kurulum günlüğü", kurulumHatasi],
  ] as [string, { message: string } | null][])
    .filter((satir): satir is [string, { message: string }] => Boolean(satir[1]));
  if (okunamayan.length)
    console.error("[konsol] sağlık sayfası sorguları okunamadı", okunamayan.map(([ad, h]) => `${ad}: ${h.message}`));

  const kopukKopru = kopruler.filter((k) => k.bozuk).length;
  /* Limit sapması da sayılıyor: şeritteki "açık sorun" ile aşağıdaki
     bölümlerin toplamı ayrışırsa rozet yanıltıcı olur. */
  const toplamSorun = krediSonucu.veri.length + cronSorun.length + kopukKopru + bayatKopyalar.length + kotalar.length + limitSapanlar.length + kurulumHatalari.length + odemeOlaylari.length;

  const kisi = (ad: string, alt: string, href: string | null) => {
    const ic = <>
      <span className="ek-avatar" aria-hidden="true">{basHarfleri(ad)}</span>
      <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span><span className="crm-table-sub" title={alt}>{alt}</span></span>
    </>;
    return href ? <Link className="crm-row-link ek-kisi" href={href}>{ic}</Link> : <span className="ek-kisi">{ic}</span>;
  };
  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );
  const bolumBasi = (baslik: string, aciklama: ReactNode) => (
    <header className="phr-bas fn-alt-bas"><h2>{baslik}</h2><small>{aciklama}</small></header>
  );

  /*
    TEK SEKMELİ KART (29.10.2026, konsol yeniden kurulurken). Sekiz bölüm
    alt alta sekiz karttı ve sayfa 3.000 pikseli geçiyordu: "kota sorunu
    var mı" sorusunun yanıtı beşinci kartın içinde, ekranın altındaydı.
    Artık beş sekme (Zamanlanmış işler · Köprü ve kopyalar · Kota ve
    limitler · Kurulum · Ödeme ve kredi), her birinin adında açık sorun
    sayısı; sayfa ilk sorunlu sekmeyle açılıyor. Sağda sorun özeti.
    Sekmeler istemci tarafında: bütün veri zaten sunucuda okunuyor,
    sekme değişince yeniden okumaya gerek yok.

    Satırlar iOS satırı yerine Finans ve Müşteriler'deki hizalı tablo.
  */
  const cronSorunAdedi = cronHatasi ? 1 : cronSorun.length;
  const kopruSorunu = kopukKopru + bayatKopyalar.length;
  const kotaSorunu = kotalar.length + limitSapanlar.length;
  const kurulumSorunu = kurulumHatalari.length;
  const odemeSorunu = krediSonucu.veri.length + odemeOlaylari.length + (krediSonucu.hata ? 1 : 0);
  const sekmeler: [string, number][] = [
    ["Zamanlanmış işler", cronSorunAdedi],
    ["Köprü ve kopyalar", kopruSorunu],
    ["Kota ve limitler", kotaSorunu],
    ["Kurulum", kurulumSorunu],
    ["Ödeme ve kredi", odemeSorunu],
  ];
  const ilkSorunlu = Math.max(0, sekmeler.findIndex(([, adet]) => adet > 0));

  return <main className="plt talep cari ekip sistem-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">SİSTEM</small>
        <h1>Sistem sağlığı</h1>
        <p className="ek-alt">Zamanlanmış işler, ürün köprüleri, kota, kurulum ve ödeme; açık sorunlar sekmelerin adında.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/kurulumlar">Kurulumlar</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Sağlık özeti">
      <dl>
        <div>
          <dt>Açık sorun</dt>
          {/* Okuma düşmüşken "0" yazmak, göremediğini temiz göstermektir. */}
          <dd className={okunamayan.length || toplamSorun ? "talep-uyari" : "cari-arti"}>
            {okunamayan.length ? "—" : sayi(toplamSorun)}
          </dd>
          <small>{okunamayan.length ? "Bazı kayıtlar okunamadı"
            : toplamSorun ? "Aşağıda sekme sekme"
            : "Her şey yolunda"}</small>
        </div>
        <div>
          <dt>Köprü</dt>
          <dd className={kopukKopru ? "talep-uyari" : "cari-arti"}>{sayi(kopruler.length - kopukKopru)} / {sayi(kopruler.length)}</dd>
          <small>{kopukKopru ? `${sayi(kopukKopru)} köprü yanıt vermiyor` : "Üçü de yanıt veriyor"}</small>
        </div>
        <div>
          <dt>Zamanlanmış iş</dt>
          <dd className={cronSorun.length || cronHatasi ? "talep-uyari" : cronBekleyen ? undefined : "cari-arti"}>
            {cronHatasi ? "—" : <>{sayi(cronSaglikli)} / {sayi(cronDurum.length)}</>}
          </dd>
          <small>{cronHatasi ? "Kayıtlar okunamadı"
            : cronSorun.length ? `${sayi(cronSorun.length)} iş gecikti ya da düştü`
            : cronBekleyen ? `${sayi(cronBekleyen)} işin ilk kaydı bekleniyor`
            : "Hepsi zamanında koşuyor"}</small>
        </div>
        <div>
          <dt>Kota</dt>
          <dd className={kiraciHatasi || kotalar.length ? "talep-uyari" : undefined}>
            {kiraciHatasi ? "—" : sayi(kotalar.length)}
          </dd>
          <small>{kiraciHatasi ? "Kiracı listesi okunamadı"
            : kotalar.length ? "Limite yaklaşan ya da aşan kiracı"
            : "Kota sorunu yok"}</small>
        </div>
        <div>
          <dt>Kurulum</dt>
          <dd className={kurulumHatalari.length ? "talep-uyari" : undefined}>{sayi(kurulumHatalari.length)}</dd>
          <small>{kurulumBekleyen ? `${sayi(kurulumBekleyen)} kurulum sürüyor` : "Son hatalı kurulum kaydı"}</small>
        </div>
      </dl>
    </nav>

    {/* Okunamayan sorgu en üstte: aşağıdaki sekmelerin boş görünmesinin
        sebebi burada yazılı olsun (yukarıdaki nota bakın). */}
    {okunamayan.length ? (
      <KNot ton="tehlike">
        <b>Bazı kayıtlar okunamadı; aşağıdaki sekmeler eksik olabilir, boş görünmeleri “sorun yok” demek değil.</b>
        {okunamayan.map(([ad, hata]) => <span key={ad}><br />{ad}: {hata.message}</span>)}
      </KNot>
    ) : null}

    <div className="talep-izgara personel-iki ekip-izgara">
      <TalepAkis kimlik="saglik" sinif="sy-kart" etiket="Sistem sağlığı" baslangic={ilkSorunlu}
        sekmeler={sekmeler.map(([ad, adet]) => (adet ? `${ad} · ${adet}` : ad))}>
        {/* ZAMANLANMIŞ İŞLER İLK SEKME: öteki sekmelerin çoğu bunların
            BELİRTİSİ. Posta eşitlemesi durduğunda kullanıcı "postalar
            gelmiyor" diyor, köprü işi durduğunda "ürün kopyası bayat". */}
        <section>
          {bolumBasi("Zamanlanmış işler", "Her iş koştuğunu kaydediyor; beklenen aralık vercel.json'dan.")}
          {cronHatasi ? (
            <KNot ton="tehlike">Koşma kayıtları okunamadı ({cronHatasi.message}) — &quot;sorun yok&quot; demek değil.</KNot>
          ) : (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="sy-cron">
                <thead><tr><th>İş</th><th>Aralık</th><th className="crm-col-date">En son koşma</th><th>Durum</th></tr></thead>
                <tbody>
                  {cronDurum.map((is) => {
                    const sorunlu = is.durum === "gecikti" || is.durum === "dustu";
                    const hata = cronHataMetni(is.ayrinti ?? null);
                    const alt = is.durum === "hic" ? "Koşma kaydı tutma bugün başladı; ilk koşmada yazılacak." : sorunlu ? (hata ?? is.aciklama) : is.aciklama;
                    return (
                      <tr key={is.yol}>
                        <td data-label="İş"><span className="crm-table-title">{is.ad}</span><span className="crm-table-sub" title={alt}>{alt}</span></td>
                        <td data-label="Aralık"><span className={is.aralikDk === null ? "talep-uyari" : "crm-table-sub"}>{cronAralikMetni(is.aralikDk)}</span></td>
                        {/* Hiç koşmamış işte "1 sa önce" yazmak yanlış: o süre kayıt tutmanın yaşı. */}
                        <td className="crm-col-date" data-label="En son koşma">{is.sonCalisma ? gecenSure(is.gecikmeDk ?? 0) : "—"}<small>{is.sonCalisma ? "önce" : is.durum === "gecikti" ? "hiç koşmadı" : "kayıt bekleniyor"}</small></td>
                        <td data-label="Durum"><span className="status-pill" data-tone={CRON_DURUM[is.durum].ton}>{CRON_DURUM[is.durum].etiket}</span></td>
                        <MobilSatir baslik={is.ad} durum={CRON_DURUM[is.durum]} alt={[cronAralikMetni(is.aralikDk), is.sonCalisma ? `${gecenSure(is.gecikmeDk ?? 0)} önce` : null, sorunlu ? hata : null]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          {bolumBasi("Ürün köprüleri", "Köprü koptuğunda hata yalnızca karşı taraftaki günlükte kalıyor; kurucu aylar sonra fark ediyordu.")}
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="sy-kopru">
              <thead><tr><th>Köprü</th><th>Ayrıntı</th><th>Durum</th></tr></thead>
              <tbody>
                {kopruler.map((kopru) => {
                  const durum = { etiket: kopru.bozuk ? "Yanıt vermiyor" : "Sağlıklı", ton: kopru.bozuk ? "danger" : "success" };
                  return (
                    <tr key={kopru.ad}>
                      <td data-label="Köprü"><span className="crm-table-title">{kopru.ad}</span></td>
                      <td data-label="Ayrıntı"><span className="crm-table-sub" title={kopru.not}>{kopru.not}</span></td>
                      <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                      <MobilSatir baslik={kopru.ad} durum={durum} alt={[kopru.not]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {bolumBasi("Ürün kopyaları", <>Köprü sağlıklıyken de kopya bayatlayabiliyor. Düzeltme kiracının lisans sekmesinde: &quot;Ürüne yeniden yansıt&quot;.</>)}
          {bayatKopyalar.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="sy-kopya">
                <thead><tr><th>Kiracı</th><th>Ürün</th><th>Konsolda</th><th>Üründe</th></tr></thead>
                <tbody>
                  {bayatKopyalar.map((kayit) => {
                    const ad = kurumAdi.get(kayit.organizationId) ?? kayit.organizationId;
                    const href = `/panel/platform/musteriler/${kayit.organizationId}?pencere=lisanslar`;
                    return (
                      <tr key={`${kayit.organizationId}-${kayit.product}`}>
                        <td data-label="Kiracı">{kisi(ad, "lisansı aç", href)}</td>
                        <td data-label="Ürün"><span className="crm-table-title">{kayit.product}</span></td>
                        <td data-label="Konsolda"><span className="crm-table-sub">{kayit.konsolDurumu}</span></td>
                        <td data-label="Üründe"><span className="status-pill" data-tone="danger">{kayit.kopyaDurumu}</span></td>
                        <MobilSatir href={href} baslik={ad} durum={{ etiket: `Üründe ${kayit.kopyaDurumu}`, ton: "danger" }} alt={[kayit.product, `konsolda ${kayit.konsolDurumu}`]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Bayat kopya yok", "Kopyası konsoldan farklı erişim veren kiracı yok.")}
        </section>

        <section>
          {bolumBasi("Kota", "Limitini aşan ya da %85'ine gelen kiracılar. Kullanıcı üyeliklerden, depolama dosya deposundan, canlı.")}
          {kotalar.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="sy-kota">
                <thead><tr><th>Kiracı</th><th>Kullanıcı</th><th>Depolama</th><th>Durum</th></tr></thead>
                <tbody>
                  {kotalar.map((kota) => {
                    const ad = kurumAdi.get(kota.organizationId) ?? kota.organizationId;
                    const href = `/panel/platform/musteriler/${kota.organizationId}?pencere=lisanslar`;
                    const durum = { etiket: kota.durum === "asildi" ? "Aşıldı" : "Yaklaştı", ton: kota.durum === "asildi" ? "danger" : "warning" };
                    return (
                      <tr key={kota.organizationId}>
                        <td data-label="Kiracı">{kisi(ad, "lisansı aç", href)}</td>
                        <td data-label="Kullanıcı"><span className="crm-table-title">%{kota.kullanici.oran}</span><small>{sayi(kota.kullanici.kullanilan)} / {sayi(kota.kullanici.limit)}</small></td>
                        <td data-label="Depolama"><span className="crm-table-title">%{kota.depolama.oran}</span><small>{sayi(kota.depolama.kullanilan)} / {sayi(kota.depolama.limit)} MB</small></td>
                        <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <MobilSatir href={href} baslik={ad} durum={durum} alt={[`kullanıcı %${kota.kullanici.oran}`, `depolama %${kota.depolama.oran}`]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Kota sorunu yok", "Limitine yaklaşan kiracı yok.")}

          {bolumBasi("Paketiyle uyuşmayan limitler", "Paketinin varsayılanından FAZLA hak tanımlanmış kiracılar. Sapma hata değil — pazarlıkla genişletilmiş limitler var — ama ücretli bir pakette sessiz sapma, satılmamış koltuğu bedava vermek demek.")}
          {limitSapanlar.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="sy-limit">
                <thead><tr><th>Kiracı</th><th>Paket</th><th>Sapma</th></tr></thead>
                <tbody>
                  {limitSapanlar.map(({ kiraci, sapmalar }) => {
                    const ad = kiraci.display_name || kiraci.name;
                    const href = `/panel/platform/musteriler/${kiraci.id}?pencere=lisanslar`;
                    const paket = PAKET_ADI[kiraci.plan_code ?? ""] ?? kiraci.plan_code ?? "paket yok";
                    const sapmaYazisi = sapmalar.map((x) => `${x.alan}: paket ${sayi(x.paket)} · kiracı ${sayi(x.kiraci)}`).join(" · ");
                    return (
                      <tr key={kiraci.id}>
                        <td data-label="Kiracı">{kisi(ad, "lisansı aç", href)}</td>
                        <td data-label="Paket"><span className="status-pill" data-tone="warning">{paket}</span></td>
                        <td data-label="Sapma"><span className="crm-table-sub" title={sapmaYazisi}>{sapmaYazisi}</span></td>
                        <MobilSatir href={href} baslik={ad} durum={{ etiket: paket, ton: "warning" }} alt={[sapmaYazisi]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Limitler paketleriyle uyumlu", "Hiçbir kiracıya paketinin üstünde hak tanımlanmamış.")}
        </section>

        <section>
          {bolumBasi("Kurulum hataları", "Kurulumu hatada kalmış kiracılar. Sonradan tamamlanan eski hatalar burada sayılmıyor; onlar ana sayfadaki kurulum hareketlerinde.")}
          {admin ? (
            kurulumHatalari.length ? (
              <div className="talep-tablo fn-ic-tablo">
                <table className="crm-data-table" data-cols="sy-kurulum">
                  <thead><tr><th>Kiracı</th><th>Adım</th><th className="crm-col-date">Zaman</th></tr></thead>
                  <tbody>
                    {kurulumHatalari.map((kayit) => {
                      const ad = kurumAdi.get(kayit.organization_id) ?? "Kurum";
                      const href = `/panel/platform/musteriler/${kayit.organization_id}?pencere=ayarlar`;
                      return (
                        <tr key={kayit.id}>
                          <td data-label="Kiracı">{kisi(ad, "kurulum sekmesini aç", href)}</td>
                          <td data-label="Adım"><span className="crm-table-title">{kayit.action}</span>{kayit.state ? <small>{kayit.state}</small> : null}</td>
                          <td className="crm-col-date" data-label="Zaman">{tarihSaat(kayit.created_at)}</td>
                          <MobilSatir href={href} baslik={ad} durum={{ etiket: "Kurulum hatası", ton: "danger" }} alt={[kayit.action, kayit.state, tarihSaat(kayit.created_at)]} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <SatirTiklama />
              </div>
            ) : bos("Kurulum hatası yok", "Kurulumu hatada kalmış kiracı yok.")
          ) : bos("Kurulum günlüğü okunamıyor", "Sunucu anahtarı tanımlı olmadığı için kurulum günlüğü okunamıyor — “hata yok” demek değil.")}
        </section>

        <section>
          {bolumBasi("Yüklenemeyen AI kredisi", "Müşteri krediyi ödedi ama ArvoLab'a yüklenemedi: ödediği hâlde asistanda durdurulur. On dakikada bir yeniden deneniyor.")}
          {krediSonucu.hata ? (
            <KNot ton="tehlike">Kredi siparişleri okunamadı ({krediSonucu.hata}) — &quot;bekleyen yok&quot; demek değil.</KNot>
          ) : krediSonucu.veri.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="sy-kredi">
                <thead><tr><th>Müşteri</th><th>Kredi</th><th className="crm-col-date">Ödeme</th><th>Durum</th></tr></thead>
                <tbody>
                  {krediSonucu.veri.map((kayit) => {
                    /* Bireysel abonenin siparişinde kurum yok: tahsilat ekranına gidiyor. */
                    const ad = kayit.organizationId ? kurumAdi.get(kayit.organizationId) ?? kayit.organizationId : "Bireysel abone";
                    const href = kayit.organizationId ? `/panel/platform/musteriler/${kayit.organizationId}?pencere=odemeler` : "/panel/platform/tahsilat";
                    return (
                      <tr key={kayit.siparisId}>
                        <td data-label="Müşteri">{kisi(ad, kayit.organizationId ? kayit.merchantOid : kayit.aboneKullaniciId ?? "kimlik yok", href)}</td>
                        <td data-label="Kredi"><span className="crm-table-title">{sayi(kayit.kredi)}</span></td>
                        <td className="crm-col-date" data-label="Ödeme">{tarihSaat(kayit.odendiAt)}</td>
                        <td data-label="Durum"><span className="status-pill" data-tone="danger">Yüklenemedi</span></td>
                        <MobilSatir href={href} baslik={ad} durum={{ etiket: "Yüklenemedi", ton: "danger" }} alt={[`${sayi(kayit.kredi)} kredi`, tarihSaat(kayit.odendiAt)]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Bekleyen kredi yok", "Ödenen her AI kredisi ArvoLab'a yüklendi.")}

          {bolumBasi("İşlenemeyen ödemeler", "PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Her birini PayTR panelinden doğrulayın.")}
          {odemeOlaylari.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="sy-odeme">
                <thead><tr><th>Kurum</th><th>Sebep</th><th className="crm-col-date">Zaman</th><th className="crm-col-amount">Tutar</th></tr></thead>
                <tbody>
                  {odemeOlaylari.map((olay) => {
                    const sebep = incidentLabels[olay.result] ?? olay.result;
                    const ad = olay.organizationName ?? "—";
                    return (
                      <tr key={olay.id}>
                        {/* PayTR numarası alt satırda: PayTR panelinde aranacak olan o. */}
                        <td data-label="Kurum">{kisi(ad, olay.merchantOid, olay.organizationId ? `/panel/platform/musteriler/${olay.organizationId}?pencere=odemeler` : null)}</td>
                        <td data-label="Sebep"><span className="status-pill" data-tone="danger">{sebep}</span><small title={incidentNotes[olay.result]}>{incidentNotes[olay.result]}</small></td>
                        <td className="crm-col-date" data-label="Zaman">{tarihSaat(olay.createdAt)}</td>
                        <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{olay.paymentAmount !== null ? para(olay.paymentAmount) : "—"}</span></td>
                        <MobilSatir baslik={ad} durum={{ etiket: sebep, ton: "danger" }} alt={[olay.merchantOid, tarihSaat(olay.createdAt), olay.paymentAmount !== null ? para(olay.paymentAmount) : null]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : bos("İşlenemeyen ödeme yok", "İşlenemeyen ödeme bildirimi yok.")}
        </section>
      </TalepAkis>

      {/* Sağ sütun: açık sorunların bölüm bölüm özeti. Satır sekmeyi
          söylüyor; sekme kartın kendisinde. */}
      <div className="liste-sag">
        <TalepAkis kimlik="saglik-sag" sinif="ek-sag" etiket="Sorun özeti" sekmeler={["Sorun özeti"]}>
          <section className="ek-panel" aria-label="Sorun özeti">
            <ul className="pu-liste">
              {[
                ["Gecikti ya da düştü", cronHatasi ? null : cronSorun.length, "Zamanlanmış işler"],
                ["Kopuk köprü", kopukKopru, "Köprü ve kopyalar"],
                ["Bayat ürün kopyası", bayatKopyalar.length, "Köprü ve kopyalar"],
                ["Kota sorunu", kiraciHatasi ? null : kotalar.length, "Kota ve limitler"],
                ["Paketinden fazla limit", kiraciHatasi ? null : limitSapanlar.length, "Kota ve limitler"],
                ["Kurulum hatası", kurulumHatalari.length, "Kurulum"],
                ["Yüklenemeyen AI kredisi", krediSonucu.hata ? null : krediSonucu.veri.length, "Ödeme ve kredi"],
                ["İşlenemeyen ödeme", odemeOlaylari.length, "Ödeme ve kredi"],
              ].map(([ad, adet, sekme]) => (
                <li key={ad as string}>
                  <span className="sy-ozet">
                    <span className="pu-govde"><b>{ad}</b><small>{sekme}</small></span>
                    <span className="status-pill" data-tone={adet === null ? "danger" : adet ? "warning" : "success"}>{adet === null ? "okunamadı" : adet ? sayi(adet as number) : "yok"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </TalepAkis>
      </div>
    </div>
  </main>;
}
