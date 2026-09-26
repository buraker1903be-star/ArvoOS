/*
  Operasyon çizelgesinin satırları: müşteri → iş → aşama.

  Neden: Gantt yalnızca İŞ düzeyinde çiziyordu (bir iş = bir çubuk,
  start_date → due_date). Operasyoncunun istediği bu değil. Kendi
  cümleleriyle: "Emine Hanım'ın makalesi ve tezi eş zamanlı ilerlediği için,
  analizler geldiğinde her iki çalışmada da hangi aşamada olduğumuzu kolayca
  görebilmek için görevleri ve aşamaları gösteren tarihlerle destekli bir iş
  akış şeması." Yani eksik olan iki şey: AŞAMALARIN tarihleri ve aynı
  müşterinin eş zamanlı işlerinin YAN YANA durması.

  AŞAMA ÇUBUĞU NEREDEN NEREYE:
  Adımın veritabanında tek tarihi var (due_date); başlangıç tarihi yok. Bir
  aşamayı tek noktayla göstermek planlamaya yaramıyor — "bu bölüm hangi
  aralıkta yapılacak" sorusunu yanıtlamıyor. Bu yüzden aşamanın çubuğu
  ÖNCEKİ tarihli aşamanın bitiminden kendi tarihine uzanıyor; ilk aşama
  işin başlangıcından (start_date) başlıyor. Aşamalı bir planın doğal
  okunuşu bu: "iç kontrol, hazırlık bittikten sonra 12'sine kadar".

  Tarihi girilmemiş aşama çubuk almıyor (uydurma bir aralık çizmek, boş
  bırakmaktan kötü) ama satırı yine görünüyor: eksik tarih de planlama
  bilgisidir.

  Saf modül; testi tests/unit/operasyon-cizelge.test.ts.
*/

export interface CizelgeAdimi {
  id: string;
  title: string;
  sort_order: number;
  due_date: string | null;
  is_completed: boolean;
  assigned_employee_id: string | null;
  /*
    Adımın dört durumundan biri (planned | in_progress | review | done).
    Pano kolonları buna göre ayrılıyor; is_completed yalnızca "bitti mi"
    diyor ve "kontrolde" ile "çalışılıyor" ayrımını kaybediyor.

    İsteğe bağlı: çizelge bu alanı kullanmıyordu ve eski çağrılar onu
    geçirmiyor. Yokken is_completed'dan türetiliyor — veritabanında sütun
    zaten NOT NULL, yani gerçek veride her zaman dolu.
  */
  status?: string | null;
}

export interface CizelgeIsi {
  id: string;
  title: string;
  customer_name: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  /** İŞİN sorumlusu (adımın değil): tarih düzenleme yetkisi buna bakıyor. */
  assigned_employee_id?: string | null;
  steps: CizelgeAdimi[];
}

/** Tarih aralığı; ikisi de gün anahtarı (YYYY-MM-DD). */
export type Aralik = { bas: string; son: string };

export interface CizelgeAsamasi {
  id: string;
  baslik: string;
  sira: number;
  tarih: string | null;
  tamamlandi: boolean;
  /** Dört durumdan biri; pano kolonu bununla belirleniyor. */
  durum: string;
  sorumluId: string | null;
  /** Çubuğun aralığı; tarih yoksa null. */
  aralik: Aralik | null;
  /** Şu an çalışılan aşama (tamamlanmayanların ilki). */
  guncel: boolean;
}

export interface CizelgeIsSatiri {
  id: string;
  baslik: string;
  durum: string;
  oncelik: string;
  /** İşin sorumlusu; ekran "bu tarihi kim değiştirebilir" kararını buna dayandırıyor. */
  sorumluId: string | null;
  aralik: Aralik | null;
  asamalar: CizelgeAsamasi[];
  /** Şu an hangi aşamada: tamamlanmayan ilk adımın başlığı; hepsi bittiyse null. */
  guncelAsama: string | null;
  tamamlanan: number;
}

export interface CizelgeMusterisi {
  /** Gruplama anahtarı; kurum içi işler tek grupta toplanır. */
  anahtar: string;
  ad: string;
  isler: CizelgeIsSatiri[];
}

export const KURUM_ICI = "Kurum içi iş";

const gunMu = (deger: string | null): deger is string => typeof deger === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deger);

/** Aynı müşteri adının farklı yazımları tek grupta buluşsun. */
const musteriAnahtari = (ad: string | null) => (ad?.trim() ? ad.trim().toLocaleLowerCase("tr-TR") : "");

/**
 * Bir işin aşamalarını sıraya dizip çubuk aralıklarını hesaplar.
 *
 * Zincir: her tarihli aşama, kendinden önceki TARİHLİ aşamanın bitiminden
 * başlar. Araya tarihsiz bir aşama girse zincir kopmaz — çubuğu olmayan
 * aşama sonraki aşamanın başlangıcını kaydırmaz.
 */
export function asamalariKur(is: CizelgeIsi): CizelgeAsamasi[] {
  const sirali = [...(is.steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const guncelId = sirali.find((adim) => !adim.is_completed)?.id ?? null;
  let onceki = gunMu(is.start_date) ? is.start_date : null;

  return sirali.map((adim) => {
    const tarih = gunMu(adim.due_date) ? adim.due_date : null;
    /*
      Başlangıç yoksa (işin start_date'i girilmemiş ve bu ilk tarihli aşama)
      çubuk tek güne düşer: tarih biliniyor, aralık bilinmiyor. Uydurulmuş
      bir başlangıç, planı olduğundan uzun gösterirdi.
    */
    const bas = tarih ? (onceki && onceki <= tarih ? onceki : tarih) : null;
    const aralik = tarih && bas ? { bas, son: tarih } : null;
    if (tarih) onceki = tarih;
    return {
      id: adim.id,
      baslik: adim.title,
      sira: adim.sort_order,
      tarih,
      tamamlandi: adim.is_completed,
      durum: adim.status || (adim.is_completed ? "done" : "planned"),
      sorumluId: adim.assigned_employee_id,
      aralik,
      guncel: adim.id === guncelId,
    };
  });
}

/** İşin kendi çubuğu: start_date → due_date; başlangıç yoksa terminin günü. */
function isAraligi(is: CizelgeIsi): Aralik | null {
  if (!gunMu(is.due_date)) return null;
  const bas = gunMu(is.start_date) && is.start_date <= is.due_date ? is.start_date : is.due_date;
  return { bas, son: is.due_date };
}

/**
 * Müşteriye göre gruplanmış çizelge satırları.
 *
 * Gruplama isteğin çekirdeği: aynı müşterinin eş zamanlı işleri yan yana
 * durmazsa "her ikisinde de hangi aşamadayız" sorusu yanıtlanamıyor.
 * Müşterisiz (kurum içi) işler tek grupta, en sonda.
 */
export function cizelgeyiKur(isler: CizelgeIsi[]): CizelgeMusterisi[] {
  const gruplar = new Map<string, CizelgeMusterisi>();

  for (const is of isler) {
    const anahtar = musteriAnahtari(is.customer_name);
    const grup = gruplar.get(anahtar) ?? { anahtar, ad: is.customer_name?.trim() || KURUM_ICI, isler: [] };
    const asamalar = asamalariKur(is);
    grup.isler.push({
      id: is.id,
      baslik: is.title,
      durum: is.status,
      oncelik: is.priority,
      sorumluId: is.assigned_employee_id ?? null,
      aralik: isAraligi(is),
      asamalar,
      guncelAsama: asamalar.find((asama) => asama.guncel)?.baslik ?? null,
      tamamlanan: asamalar.filter((asama) => asama.tamamlandi).length,
    });
    gruplar.set(anahtar, grup);
  }

  for (const grup of gruplar.values()) {
    // İşler termine göre: en yakın teslim üstte, tarihsizler sonda.
    grup.isler.sort((a, b) => {
      if (a.aralik && b.aralik) return a.aralik.son.localeCompare(b.aralik.son) || a.baslik.localeCompare(b.baslik, "tr");
      if (a.aralik) return -1;
      if (b.aralik) return 1;
      return a.baslik.localeCompare(b.baslik, "tr");
    });
  }

  return [...gruplar.values()].sort((a, b) => {
    // Kurum içi grubu en sonda: müşteri işleri operasyoncunun asıl gündemi.
    if (a.anahtar === "") return 1;
    if (b.anahtar === "") return -1;
    return a.ad.localeCompare(b.ad, "tr");
  });
}

/**
 * Bir müşterinin birden çok işi var mı? Eş zamanlı çalışmayı işaretlemek
 * için: operasyoncunun gözü önce oraya gitmeli.
 */
export const esZamanliMi = (musteri: CizelgeMusterisi) => musteri.isler.length > 1;

/**
 * Izgara satırı: müşteri başlığı, iş ya da aşama. Satır numaraları BURADA
 * veriliyor.
 *
 * Neden ayrı bir geçiş: numaralar çizim sırasında bir sayaç artırılarak
 * üretiliyordu ve React 19 render sırasında değişken yeniden atanmasını
 * reddediyor (react-hooks/immutability) — haklı olarak, çünkü aynı bileşen
 * iki kez çizilirse sayaç kaldığı yerden devam eder. Saf bir geçiş hem
 * kuralı sağlıyor hem sınanabiliyor.
 *
 * `asamaGorunur` ay penceresini çağırana bırakıyor: hangi aşamanın
 * çizileceğine takvim karar veriyor, bu modül tarih aritmetiği yapmıyor.
 */
export type CizelgeSatiri =
  | { tur: "musteri"; satir: number; musteri: CizelgeMusterisi }
  | { tur: "is"; satir: number; is: CizelgeIsSatiri }
  | { tur: "asama"; satir: number; is: CizelgeIsSatiri; asama: CizelgeAsamasi };

export function satirlariDiz(
  musteriler: CizelgeMusterisi[],
  asamaGorunur: (asama: CizelgeAsamasi) => boolean,
  ilkSatir = 2,
): CizelgeSatiri[] {
  const satirlar: CizelgeSatiri[] = [];
  let satir = ilkSatir;
  for (const musteri of musteriler) {
    satirlar.push({ tur: "musteri", satir: satir++, musteri });
    for (const is of musteri.isler) {
      satirlar.push({ tur: "is", satir: satir++, is });
      for (const asama of is.asamalar) {
        if (!asamaGorunur(asama)) continue;
        satirlar.push({ tur: "asama", satir: satir++, is, asama });
      }
    }
  }
  return satirlar;
}

/** Izgaranın toplam satır sayısı (başlık satırı dahil). */
export const satirSayisi = (satirlar: CizelgeSatiri[], ilkSatir = 2) =>
  satirlar.length ? satirlar[satirlar.length - 1].satir : ilkSatir - 1;

// ---------- Kişiye göre görünüm ----------

/*
  "Kimde ne var" sorusu müşteriye göre gruplamayla yanıtlanmıyor: bir
  operasyoncunun üstündeki aşamalar dört ayrı müşterinin altına dağılıyor ve
  kendi gündemini görmek için bütün çizelgeyi taramak gerekiyor.

  Bu yüzden aynı veri İKİNCİ bir eksende de kuruluyor: kişi → aşamalar.
  Aşama hangi işe ve müşteriye ait olduğunu taşıyor, yoksa "Literatür
  taraması" tek başına hangi tezin literatürü olduğunu söylemiyor.
*/
export interface KisiAsamasi extends CizelgeAsamasi {
  isId: string;
  isBasligi: string;
  musteri: string;
  /** İŞİN sorumlusu; tarih düzenleme yetkisi için (adımın sorumlusu ayrı). */
  isSorumlusuId: string | null;
}

export interface CizelgeKisisi {
  /** Personel kimliği; atanmamış aşamalar için boş dizge. */
  anahtar: string;
  ad: string;
  asamalar: KisiAsamasi[];
}

export const ATANMAMIS = "Sorumlu atanmadı";

/**
 * Aşamaları sorumlusuna göre gruplar. `adCoz` personel kimliğini ada
 * çevirir (kimlik ekranda okunmuyor); çözemezse aşama "atanmamış" grubuna
 * DÜŞMEZ, "bilinmeyen personel" olarak kendi grubunda kalır — silinmiş bir
 * personelin üstündeki işi "kimsede yok" göstermek, onu kaybetmek olurdu.
 */
export function kisilereGoreKur(
  isler: CizelgeIsi[],
  adCoz: (personelId: string) => string | null,
): CizelgeKisisi[] {
  const gruplar = new Map<string, CizelgeKisisi>();

  for (const is of isler) {
    const musteri = is.customer_name?.trim() || KURUM_ICI;
    for (const asama of asamalariKur(is)) {
      const anahtar = asama.sorumluId ?? "";
      const ad = asama.sorumluId ? adCoz(asama.sorumluId) ?? "Bilinmeyen personel" : ATANMAMIS;
      const grup = gruplar.get(anahtar) ?? { anahtar, ad, asamalar: [] };
      grup.asamalar.push({ ...asama, isId: is.id, isBasligi: is.title, musteri, isSorumlusuId: is.assigned_employee_id ?? null });
      gruplar.set(anahtar, grup);
    }
  }

  for (const grup of gruplar.values()) {
    // Tarihe göre: en yakın teslim üstte, tarihsizler sonda.
    grup.asamalar.sort((a, b) => {
      if (a.tarih && b.tarih) return a.tarih.localeCompare(b.tarih) || a.baslik.localeCompare(b.baslik, "tr");
      if (a.tarih) return -1;
      if (b.tarih) return 1;
      return a.baslik.localeCompare(b.baslik, "tr");
    });
  }

  return [...gruplar.values()].sort((a, b) => {
    // Atanmamış grubu en sonda: asıl gündem kişilerin üstündekiler.
    if (a.anahtar === "") return 1;
    if (b.anahtar === "") return -1;
    return a.ad.localeCompare(b.ad, "tr");
  });
}

// ---------- Süzgeçler ----------

export interface Suzgec {
  /** Personel kimliği; "" = atanmamış, undefined = süzme yok. */
  kisi?: string;
  /** Müşteri adı (gruplama anahtarıyla aynı normalleştirme). */
  musteri?: string;
  /** İşin durumu. */
  durum?: string;
}

/**
 * İş düzeyindeki süzgeç. Müşteri ve durum işe ait; kişi süzgeci İŞİ
 * düşürmüyor çünkü kişinin aşaması o işin içinde olabiliyor — kişi süzgeci
 * aşama düzeyinde uygulanıyor (asamaSuzgeci).
 */
export function isSuzgeci(suzgec: Suzgec) {
  const musteri = suzgec.musteri ? musteriAnahtari(suzgec.musteri) : undefined;
  return (is: CizelgeIsi) => {
    if (suzgec.durum && is.status !== suzgec.durum) return false;
    if (musteri !== undefined && musteriAnahtari(is.customer_name) !== musteri) return false;
    if (suzgec.kisi !== undefined) {
      // İşin hiçbir aşaması o kişide değilse iş de listede durmasın.
      return (is.steps ?? []).some((adim) => (adim.assigned_employee_id ?? "") === suzgec.kisi);
    }
    return true;
  };
}

/** Aşama düzeyindeki süzgeç: kişi. */
export function asamaSuzgeci(suzgec: Suzgec) {
  return (asama: { sorumluId: string | null }) =>
    suzgec.kisi === undefined || (asama.sorumluId ?? "") === suzgec.kisi;
}

/**
 * Süzgeçte kullanılmak üzere müşteri adları (tekilleştirilmiş).
 *
 * Aynı kişinin iki yazımı varsa İLK görülen kalıyor: sonrakini yazmak,
 * özensiz girilmiş bir kaydın ("emine") düzgün olanı ("Emine Yılmaz")
 * bastırması demekti. Kurum içi işler listede yok — süzülecek bir ad
 * taşımıyorlar.
 */
export function musteriAdlari(isler: CizelgeIsi[]): string[] {
  const adlar = new Map<string, string>();
  for (const is of isler) {
    const ad = is.customer_name?.trim();
    if (ad && !adlar.has(musteriAnahtari(ad))) adlar.set(musteriAnahtari(ad), ad);
  }
  return [...adlar.values()].sort((a, b) => a.localeCompare(b, "tr"));
}

// ---------- Pano (kanban) ----------

/*
  Pano: aşamalar durum kolonlarında.

  Neden kart AŞAMA, iş değil: "ne hangi aşamada" sorusu ancak böyle
  görünüyor. İşler kart olsaydı kolonlar işin durumunu (planlandı/devam
  ediyor) gösterirdi ve bir tezin dokuz bölümünden hangisinin kontrolde
  olduğu yine görünmezdi — çizelgeyi yapma sebebimizin aynısı.

  Kart hangi işe ve müşteriye ait olduğunu taşıyor; "İç kontrol" tek başına
  hangi tezin iç kontrolü olduğunu söylemiyor.

  Ay penceresi YOK: pano "şu an ne var" görünümü, takvim değil. Tarihi
  olmayan aşama da panoda duruyor — planlanacak iş de iştir.
*/
export interface PanoKarti extends KisiAsamasi {
  sorumluAdi: string | null;
}

export interface PanoKolonu {
  durum: string;
  kartlar: PanoKarti[];
}

/** Kolon sırası: işin akışı (planlandı → çalışılıyor → kontrolde → tamamlandı). */
export const PANO_KOLONLARI = ["planned", "in_progress", "review", "done"];

export function panoyuKur(
  isler: CizelgeIsi[],
  adCoz: (personelId: string) => string | null,
): PanoKolonu[] {
  const kolonlar = new Map<string, PanoKarti[]>(PANO_KOLONLARI.map((durum) => [durum, []]));

  for (const is of isler) {
    const musteri = is.customer_name?.trim() || KURUM_ICI;
    for (const asama of asamalariKur(is)) {
      /*
        Tanınmayan durum "planlandı"ya düşürülmüyor, kendi kolonunda
        toplanıyor: veriyi sessizce başka bir yere yazmak, bir göç hatasını
        gizlemenin en kolay yolu.
      */
      const kolon = kolonlar.get(asama.durum) ?? [];
      kolon.push({
        ...asama,
        isId: is.id,
        isBasligi: is.title,
        musteri,
        isSorumlusuId: is.assigned_employee_id ?? null,
        sorumluAdi: asama.sorumluId ? adCoz(asama.sorumluId) ?? "Bilinmeyen personel" : null,
      });
      kolonlar.set(asama.durum, kolon);
    }
  }

  for (const kartlar of kolonlar.values()) {
    // Tarihe göre: en yakın teslim üstte, tarihsizler sonda.
    kartlar.sort((a, b) => {
      if (a.tarih && b.tarih) return a.tarih.localeCompare(b.tarih) || a.baslik.localeCompare(b.baslik, "tr");
      if (a.tarih) return -1;
      if (b.tarih) return 1;
      return a.baslik.localeCompare(b.baslik, "tr");
    });
  }

  // Bilinen kolonlar sırayla, tanınmayan durumlar sonda.
  const bilinen = PANO_KOLONLARI.map((durum) => ({ durum, kartlar: kolonlar.get(durum) ?? [] }));
  const digerleri = [...kolonlar.entries()]
    .filter(([durum]) => !PANO_KOLONLARI.includes(durum))
    .map(([durum, kartlar]) => ({ durum, kartlar }));
  return [...bilinen, ...digerleri];
}
