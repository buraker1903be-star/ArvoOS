/*
  Operasyon panosunun veri katmanı: işler, aşamaları ve kolonları.

  Neden ayrı bir saf modül: pano ekranı sunucu bileşeni (veri) ve istemci
  bileşeni (sürükle-bırak) olarak ikiye bölünmüş ve taşıma planı HEM
  istemcide (bırakmadan önceki "2 aşama kapanacak" yazısı) HEM sunucuda
  (işin kendisi) hesaplanıyor. İkisinin aynı sonucu vermesinin tek
  güvencesi aynı fonksiyonu çağırmaları.

  Bu dosya 27.09.2026'ya kadar Çalışma Çizelgesi'nin de veri katmanıydı;
  o ekran kaldırılınca aşama çubuğu, müşteri gruplaması, kişi görünümü ve
  süzgeç mantığı da silindi.

  Saf modül; testi tests/unit/operasyon-panosu.test.ts.
*/

import { gunFarki } from "./is-adimlari";

export interface OperasyonAdimi {
  id: string;
  title: string;
  sort_order: number;
  due_date: string | null;
  is_completed: boolean;
  assigned_employee_id: string | null;
  /*
    Görevin ait olduğu aşama (operation_steps.phase_title). Panonun kolonu
    buradan çıkıyor: şablon aşamalıysa yirmi görev sekiz kolona düşer,
    değilse görev başlığı kolon olmaya devam eder — aşamasız kurumlarda
    pano birebir eskisi gibi çalışıyor.

    İsteğe bağlı: eski çağrılar (ve bu alanı seçmeyen sorgular) kırılmasın.
  */
  phase_title?: string | null;
  /*
    Adımın dört durumundan biri (planned | in_progress | review | done).
    Pano kolonları buna göre ayrılıyor; is_completed yalnızca "bitti mi"
    diyor ve "kontrolde" ile "çalışılıyor" ayrımını kaybediyor.

    İsteğe bağlı: çizelge bu alanı kullanmıyordu ve eski çağrılar onu
    geçirmiyor. Yokken is_completed'dan türetiliyor — veritabanında sütun
    zaten NOT NULL, yani gerçek veride her zaman dolu.
  */
  status?: string | null;
  /*
    Adımın bitirildiği AN (gün değil, timestamp). Panoda "kaç gündür bu
    aşamada" bundan hesaplanıyor: güncel aşamaya, kendisinden önceki
    adımların bitişiyle gelinmiş olur. İsteğe bağlı — çizelge kullanmıyor.
  */
  completed_at?: string | null;
}

export interface OperasyonIsi {
  id: string;
  title: string;
  customer_name: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  /** İŞİN sorumlusu (adımın değil): tarih düzenleme yetkisi buna bakıyor. */
  assigned_employee_id?: string | null;
  steps: OperasyonAdimi[];
}

/** Tarih aralığı; ikisi de gün anahtarı (YYYY-MM-DD). */
export const KURUM_ICI = "Kurum içi iş";

/*
  Çalışma Çizelgesi (Gantt) kaldırıldı — 27.09.2026. Aşama çubukları,
  müşteri gruplaması, kişiye göre görünüm ve süzgeçler bu modüldeydi;
  hepsi o ekranla birlikte silindi. Panoda karşılığı olmayan tek şeyler
  zaman ekseni ve süzgeçlerdi; geri istenirse git geçmişinden çıkarılır
  (aynı tarihli "Çalışma Çizelgesi kaldırıldı" işlemesi).
*/

// ---------- Pano: şablon aşamaları kolon ----------

/*
  Pano kolonları ADIM ŞABLONUNDAKİ aşamalar, kart ise İŞ.

  İlk sürümde kolonlar adımın dört durumuydu (planlandı/çalışılıyor/
  kontrolde/tamamlandı) ve kart aşamaydı. Operasyoncunun istediği bu değil:
  "her iki çalışmada da hangi aşamada olduğumuzu görmek" sorusunun yanıtı,
  işin şablondaki hangi aşamada durduğudur. Kart iş olunca pano o soruyu
  doğrudan yanıtlıyor: Emine Hanım'ın tezi "İç Kontrol" kolonunda, makalesi
  "Hazırlanıyor" kolonunda.

  İŞİN KOLONU: tamamlanmayan İLK adımı (sıraya göre). Hepsi bittiyse iş
  "Tamamlandı" kolonunda.

  ŞABLON DIŞI kolon şart. Adımlar üç kaynaktan üretiliyor ve önceliği
  sözleşmenin ara teslim takviminde (add_standard_operation_steps):
  sözleşmeden açılan bir işin aşama adları müşteriye satılan plandan gelir
  ve şablonla eşleşmeyebilir. Böyle bir işi ilk kolona koymak ya da
  gizlemek, panonun yanlış bir tablo göstermesi olurdu — kendi kolonunda,
  adıyla duruyor.

  Saf modül; testi tests/unit/operasyon-panosu.test.ts.
*/
export interface PanoIsKarti {
  isId: string;
  baslik: string;
  musteri: string;
  durum: string;
  /** low | normal | high | urgent. Kartta yalnızca normalin dışındakiler yazıyor. */
  oncelik: string;
  /*
    İŞİN teslim tarihi — aşamanınkiyle karıştırılmamalı. Operasyoncu ikisini
    de soruyor: "bu aşama ne zaman bitecek" ve "iş müşteriye ne zaman
    teslim edilecek". Kartta yalnızca aşama tarihi varken ikincisi için iş
    detayına girmek gerekiyordu.
  */
  isTermini: string | null;
  /** Tamamlanmayan ilk adım; hepsi bittiyse null. */
  guncelAsama: string | null;
  guncelAsamaId: string | null;
  /** Aşamanın teslim tarihi (işin termini değil). */
  tarih: string | null;
  tamamlandi: boolean;
  /** Bir önceki tamamlanmış adım: "geri al" bunu yeniden açıyor. */
  oncekiAsamaId: string | null;
  sorumluAdi: string | null;
  tamamlananAsama: number;
  toplamAsama: number;
  /*
    Güncel aşamada kaç gündür bekliyor. Bitmiş işte ve başlangıcı
    bilinmeyen işte null.

    Bu alan TARİHTEN BAĞIMSIZ çalışıyor ve panonun asıl açığını kapatıyor:
    canlıda (27.09.2026) sekiz işin sekizinde de aşama tarihi girilmemişti,
    dolayısıyla "gecikti/yaklaştı" uyarısı hiç çıkmıyor ve kartların
    sıralaması da rastgele oluyordu. "23 gündür aynı aşamada" ise tarih
    girilmeden de ölçülebilen bir olgu.
  */
  bekleyenGun: number | null;
  /** İşin bütün aşamaları: panodan çıkmadan açılan hızlı bakış bunu gösteriyor. */
  adimlar: PanoAdimi[];
}

/*
  Hızlı bakışta bir satır. Kartın özetinden farkı: HER aşama burada.

  OperasyonAdimi'yi GENİŞLETİYOR, kendi alan adlarını uydurmuyor: tasimaPlani
  aynı şekli bekliyor ve sürükleme ipucu ("2 aşama kapanacak") bırakmadan
  önce istemcide bu listeden hesaplanıyor. Ayrı bir şekil, ikinci bir
  dönüştürme katmanı demekti.
*/
export interface PanoAdimi extends OperasyonAdimi {
  /** Tamamlanmayan ilk adım mı: hızlı bakışta vurgulanıyor. */
  guncel: boolean;
  sorumluAdi: string | null;
}

export type PanoKolonTuru = "asama" | "tamamlandi" | "sablon_disi";

export interface PanoKolonu {
  anahtar: string;
  baslik: string;
  tur: PanoKolonTuru;
  /** Akıştaki sırası (1'den başlar); başlıkta gösteriliyor. */
  sira: number;
  kartlar: PanoIsKarti[];
}

export interface PanoSonucu {
  kolonlar: PanoKolonu[];
  /** Gizlenen boş aşamaların adları; ekran tek satırda sayıyor. */
  bosAsamalar: string[];
}

export const TAMAMLANDI_KOLONU = "__tamamlandi__";
export const SABLON_DISI_KOLONU = "__sablon_disi__";

/** Aşama adlarını karşılaştırmak için: Türkçe küçük harf, boşluklar teklenir. */
const asamaAnahtari = (baslik: string) => baslik.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

/*
  KOLONUN ADI. Şablon iki seviyeli olabiliyor (AkademikMerkez'in tablosu:
  sekiz aşama, yirmi görev). Kolon bu durumda AŞAMA; görev değil. Aksi
  hâlde pano yirmi kolona çıkar ve bir bakışta görünmesi — bütün değeri —
  biterdi. Aşaması olmayan satırda eski davranış sürüyor: kolon görevin
  kendi başlığı.
*/
const kolonAdi = (satir: { title: string; phase_title?: string | null }) =>
  (satir.phase_title ?? "").trim() || satir.title;

export interface SablonAsamasi {
  title: string;
  sort_order: number;
  phase_title?: string | null;
}

/*
  Bir aşamada bu kadar gün bekleyen iş kartta vurgulanıyor. Sayı KURUMDAN
  gelmiyor, seçilmiş bir eşik: akademik işlerde aşamalar haftalarca sürüyor
  (canlıdaki işler sekiz adımlı), üç hafta takılmayı ayırt edecek en kısa
  makul süre. Kurum başına ayarlanabilir olması gerekirse önce şablon
  sayfasına bir alan eklenmeli; koda gömülü ikinci bir sayı üretmeyin.

  Eşiğin AYIRDIĞI şey "gecikme" değil: gecikme tarihle tanımlı ve kartın
  kenar rengiyle gösteriliyor. Bu yalnızca "uzun süredir kımıldamıyor".
*/
export const BEKLEME_ESIGI_GUN = 21;

/** Timestamp'in İstanbul günü. Sunucu UTC'de: gece yarısından sonra bir gün kayardı. */
const istanbulGunu = (zaman: string): string | null => {
  const an = new Date(zaman);
  return Number.isNaN(an.getTime())
    ? null
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(an);
};

export function asamaPanosuKur(
  isler: OperasyonIsi[],
  sablon: SablonAsamasi[],
  adCoz: (personelId: string) => string | null,
  /** Bugünün İstanbul günü; bekleme süresi buna göre. Dışarıdan: modül saf kalsın. */
  bugun: string,
): PanoSonucu {
  const sirali = [...sablon].sort((a, b) => a.sort_order - b.sort_order);
  const kolonlar = new Map<string, PanoKolonu>();
  for (const asama of sirali) {
    // Aynı aşamanın görevleri tek kolon olur; teklenme zaten anahtar üzerinden.
    const ad = kolonAdi(asama);
    const anahtar = asamaAnahtari(ad);
    if (!kolonlar.has(anahtar)) {
      kolonlar.set(anahtar, { anahtar, baslik: ad, tur: "asama", sira: kolonlar.size + 1, kartlar: [] });
    }
  }
  const asamaSayisi = kolonlar.size;
  kolonlar.set(TAMAMLANDI_KOLONU, { anahtar: TAMAMLANDI_KOLONU, baslik: "Tamamlandı", tur: "tamamlandi", sira: asamaSayisi + 1, kartlar: [] });
  kolonlar.set(SABLON_DISI_KOLONU, { anahtar: SABLON_DISI_KOLONU, baslik: "Şablon dışı aşama", tur: "sablon_disi", sira: asamaSayisi + 2, kartlar: [] });

  for (const is of isler) {
    const adimlar = [...(is.steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const guncel = adimlar.find((adim) => !adim.is_completed) ?? null;
    const tamamlanan = adimlar.filter((adim) => adim.is_completed);
    /*
      Güncel aşamaya ne zaman gelindi: kendisinden ÖNCEKİ adımların en son
      bitişi ("geri al" ile aynı mantık — sıra dışı tamamlamada ileride
      bitmiş bir adım bu aşamanın başlangıcını söylemez). Hiç bitmiş adım
      yoksa iş başlangıcı; o da yoksa ölçülemiyor ve gösterilmiyor.
    */
    const asamayaGecis = guncel
      ? tamamlanan
          .filter((adim) => adim.sort_order < guncel.sort_order)
          .map((adim) => (adim.completed_at ? istanbulGunu(adim.completed_at) : null))
          .filter((gun): gun is string => gun !== null)
          .sort()
          .at(-1) ?? is.start_date
      : null;
    const kart: PanoIsKarti = {
      isId: is.id,
      baslik: is.title,
      musteri: is.customer_name?.trim() || KURUM_ICI,
      durum: is.status,
      oncelik: is.priority,
      isTermini: is.due_date,
      guncelAsama: guncel?.title ?? null,
      guncelAsamaId: guncel?.id ?? null,
      tarih: guncel?.due_date ?? null,
      /*
        "Tamamlanmayan adım yok" ile "hiç adım yok" aynı şey değil: adımı
        üretilmemiş iş bitmiş sayılamaz. Ayrım yapılmazsa yeni açılmış her
        iş panoda "tamamlandı" görünürdü.
      */
      tamamlandi: adimlar.length > 0 && !guncel,
      /*
        "Geri al" güncel aşamadan ÖNCEKİ tamamlanmış adımı açmalı, en son
        tamamlananı değil. Adımlar iş detayından tek tek işaretlenebiliyor,
        yani sıra dışı tamamlama mümkün: 1, 2 ve 4 bitmiş, 3 bekliyorsa en
        son tamamlanan 4'tür ve onu açmak güncel aşamayı (3) değiştirmez —
        kart yerinde kalır, kullanıcı düğmenin çalışmadığını sanar.
      */
      oncekiAsamaId:
        (guncel
          ? tamamlanan.filter((adim) => adim.sort_order < guncel.sort_order).at(-1)
          : tamamlanan.at(-1)
        )?.id ?? null,
      sorumluAdi: guncel?.assigned_employee_id
        ? adCoz(guncel.assigned_employee_id) ?? "Bilinmeyen personel"
        : is.assigned_employee_id
          ? adCoz(is.assigned_employee_id) ?? "Bilinmeyen personel"
          : null,
      tamamlananAsama: tamamlanan.length,
      toplamAsama: adimlar.length,
      /*
        Geleceğe dönük bir başlangıç (ileri tarihli start_date) negatif gün
        verirdi; "−4 gündür bu aşamada" anlamsız, sıfıra sabitleniyor.
      */
      bekleyenGun: asamayaGecis ? Math.max(gunFarki(asamayaGecis, bugun), 0) : null,
      adimlar: adimlar.map((adim) => ({
        ...adim,
        guncel: adim.id === guncel?.id,
        sorumluAdi: adim.assigned_employee_id ? adCoz(adim.assigned_employee_id) ?? "Bilinmeyen personel" : null,
      })),
    };

    /*
      Adımı hiç olmayan iş de panoda görünmeli: "şablon dışı" değil,
      henüz adımı üretilmemiş bir iş — kolonu Tamamlandı da olamaz.
      Şablon dışına düşüyor ve kartta "aşama yok" yazıyor; gizlenmesi onu
      unutturmanın en kolay yolu olurdu.
    */
    const hedef = !adimlar.length
      ? SABLON_DISI_KOLONU
      : !guncel
        ? TAMAMLANDI_KOLONU
        : kolonlar.has(asamaAnahtari(kolonAdi(guncel)))
          ? asamaAnahtari(kolonAdi(guncel))
          : SABLON_DISI_KOLONU;
    kolonlar.get(hedef)!.kartlar.push(kart);
  }

  for (const kolon of kolonlar.values()) {
    /*
      Tarihe göre: en yakın teslim üstte, tarihsizler sonda.

      TARİHSİZLER ARASINDA en uzun bekleyen üstte. Eskiden hepsi ada göre
      diziliyordu; canlıda (27.09.2026) sekiz işin sekizi de tarihsiz
      olduğu için pano baştan sona alfabetikti, yani sıralama hiçbir şey
      söylemiyordu. Bekleme süresi tarih girilmeden de ölçülüyor ve en
      azından "hangisi takılmış" sorusunu yanıtlıyor.
    */
    kolon.kartlar.sort((a, b) => {
      if (a.tarih && b.tarih) return a.tarih.localeCompare(b.tarih) || a.baslik.localeCompare(b.baslik, "tr");
      if (a.tarih) return -1;
      if (b.tarih) return 1;
      return (b.bekleyenGun ?? -1) - (a.bekleyenGun ?? -1) || a.baslik.localeCompare(b.baslik, "tr");
    });
  }

  /*
    BÜTÜN AŞAMALAR GÖSTERİLİYOR — boş olanlar dahil.

    Bir dönem boşlar gizlendi: sekiz aşama + Tamamlandı dokuz kolon
    ediyordu ve pano yatay kaydırma istiyordu. Gizlemek daha kötüsünü
    getirdi: iki işi de ilk aşamada olan kurumda panodan GERİYE TEK
    KOLON kalıyor, o da ızgarada 1fr olduğu için ekranı baştan sona
    kaplıyor ve pano kanban olmaktan çıkıp tuhaf bir listeye dönüyor
    (canlıda böyle görüldü).

    Boş kolon zaten BİLGİ: "Literatür'de hiç iş yok" panonun
    söylemesi gereken şey. Yatay kaydırma da kanban'ın olağan
    davranışı; süzgeç geldiğinden beri (pano/page.tsx) daraltmanın
    yolu da var.
  */
  const hepsi = [...kolonlar.values()];
  const bosAsamalar = hepsi
    .filter((kolon) => kolon.tur === "asama" && !kolon.kartlar.length)
    .map((kolon) => kolon.baslik);
  /*
    "Şablon dışı" kolonu YALNIZCA doluyken: akışın bir aşaması değil,
    eşleşmeyenlerin düştüğü yer. Boşken göstermek her panoya anlamsız
    bir kolon eklerdi.
  */
  const gosterilen = hepsi.filter((kolon) => kolon.tur !== "sablon_disi" || kolon.kartlar.length > 0);
  return { kolonlar: gosterilen, bosAsamalar };
}

/** Varsayılan şablon (add_standard_operation_steps ile aynı sekiz aşama). */
export const VARSAYILAN_PANO_SABLONU: SablonAsamasi[] = [
  { title: "İş Kabul Edildi", sort_order: 10 },
  { title: "Hazırlık Yapılıyor", sort_order: 20 },
  { title: "Hazırlanıyor", sort_order: 30 },
  { title: "İç Kontrol Yapılıyor", sort_order: 40 },
  { title: "Hazırlandı", sort_order: 50 },
  { title: "Müşteri İlişkileri Talimatı Bekleniyor", sort_order: 60 },
  { title: "Revizyonlar Yapılıyor", sort_order: 70 },
  { title: "Evrak Teslimine Hazır", sort_order: 80 },
];

/*
  KARTI BİR KOLONDAN DİĞERİNE TAŞIMAK ne demek.

  Kartın kolonu türetilmiş bir değer: "tamamlanmayan İLK adım"ın başlığı.
  Dolayısıyla kartı X kolonuna taşımak, X'i tamamlanmayan ilk adım yapmak
  demektir — tek kural iki yönü de kapsıyor:

    X'ten önceki tamamlanmamış adımlar  → tamamlanır
    X ve sonrasındaki tamamlanmış adımlar → yeniden açılır

  Bunu yapmayan bir taşıma kartı hedefte TUTAMAZ: bırakıldığı anda kolonu
  yeniden hesaplanır ve eski yerine zıplar, kullanıcı da sürüklemenin
  çalışmadığını sanar. Bu yüzden 2. kolondan 5. kolona sürüklemek aradaki
  aşamaları da kapatıyor; arayüz bunu bırakmadan ÖNCE yazıyor, sessizce
  yapmıyor.

  Geçersiz taşımalarda null dönüyor (hedef aşama o işte yok, iş adımsız):
  mesajı çağıran yazıyor, saf modül kullanıcıya konuşmuyor.
*/
export interface TasimaPlani {
  /** Tamamlanacak adım kimlikleri (sırayla). */
  tamamlanacak: string[];
  /** Yeniden açılacak adım kimlikleri. */
  acilacak: string[];
  /** Hedef aşamanın BU İŞTEKİ yazımı; kayıt geçmişi bunu yazıyor. */
  hedefAdi: string | null;
}

/**
 * Kartı hedef aşamaya taşımak için hangi adımların kapanıp açılacağı.
 * `hedefBaslik` null ise hedef "Tamamlandı" kolonudur (tüm adımlar kapanır).
 */
export function tasimaPlani(adimlar: OperasyonAdimi[], hedefBaslik: string | null): TasimaPlani | null {
  const sirali = [...adimlar].sort((a, b) => a.sort_order - b.sort_order);
  // Adımı olmayan iş taşınamaz: hangi aşamada olduğu zaten tanımsız.
  if (!sirali.length) return null;

  if (hedefBaslik === null) {
    return { tamamlanacak: sirali.filter((a) => !a.is_completed).map((a) => a.id), acilacak: [], hedefAdi: null };
  }

  /*
    Aynı başlıkta birden çok adım olabiliyor (sözleşmeden gelen planda
    tekrar eden aşama adları). İLK olanı hedef alınıyor: kartın kolonu da
    tamamlanmayan İLK adımdan türüyor, ikisi aynı adımı göstermeli.
  */
  /*
    Hedef bir AŞAMA olabilir (şablon iki seviyeliyse kolon odur): o aşamanın
    İLK görevi hedef alınıyor. Kartın kolonu da tamamlanmayan ilk görevin
    aşamasından türüyor; ikisi aynı görevi göstermeli, yoksa bırakılan kart
    eski yerine zıplar.
  */
  const anahtar = asamaAnahtari(hedefBaslik);
  const hedef = sirali.find((adim) => asamaAnahtari(kolonAdi(adim)) === anahtar);
  if (!hedef) return null;

  return {
    tamamlanacak: sirali.filter((a) => a.sort_order < hedef.sort_order && !a.is_completed).map((a) => a.id),
    acilacak: sirali.filter((a) => a.sort_order >= hedef.sort_order && a.is_completed).map((a) => a.id),
    // Kayıt geçmişi kullanıcının BIRAKTIĞI kolonun adını yazsın (aşamalı
    // şablonda bu, görevin değil aşamanın adıdır).
    hedefAdi: kolonAdi(hedef),
  };
}
