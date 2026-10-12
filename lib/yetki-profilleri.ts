/*
  YETKİ PROFİLLERİ — bir kişiye tek adımda kurulan hazır yetki kümesi.

  Yetkilendirme ekranı her kararı ayrı ayrı veriyor: rol, yedi modül,
  kırk kadar yetenek. Esnek ama tekrar eden bir iş var — "bu kişi
  operasyon müdürü olacak" dediğinde aynı on beş kutucuk elle
  işaretleniyor ve ikinci müdürde biri atlanıyor. Profil o kümeyi
  isimlendiriyor.

  PROFİL KİŞİYE YAZILIR, role değil: aynı rolde (manager) hem satış
  müdürü hem operasyon müdürü olabilir, ikisinin göreceği modüller
  farklıdır. Rol kuralını değiştirmek bütün müdürleri birden
  etkilerdi.

  MODÜLLER AÇIKÇA YAZILIR — açık olanlar da, kapalı olanlar da.
  "Rolden gelsin" bırakmak, kurum ileride müdür rolünün modül
  kutucuklarını değiştirdiğinde operasyon müdürüne sessizce CRM
  açılması demekti.

  YETENEKLER ÇOĞUNLUKLA ROLDEN GELİR; profil yalnızca kendisini
  TANIMLAYAN yetenekleri sabitler (operasyon müdürü için iş yönetimi,
  görev atama, arşiv ve ekip yükü). Geri kalan kişisel istisnalar
  SİLİNİR: profil uygulandıktan sonra "bu kişide neden farklı" diye
  sorulduğunda cevap profilin kendisi olmalı, bir yıl önce açılmış
  unutulmuş bir kutucuk değil.

  Saf modül: testi tests/unit/yetki-profilleri.test.ts.
*/

export type YetkiProfili = {
  /** Kalıcı anahtar (adrese ve forma yazılır). */
  key: string;
  label: string;
  aciklama: string;
  /** Üyelik rolü. Kurum Sahibi hiçbir profille atanmaz. */
  rol: string;
  /** Kişiye açılacak modüller; listede olmayan her modül kapatılır. */
  acikModuller: readonly string[];
  /** Profilin tanımı sayılan yetenekler; kişiye "açık" yazılır. */
  acikYetkiler: readonly string[];
  /**
   * Profilin ait olduğu departman türü (2026-10). Satış departmanındaki
   * kişi Satış Müdürü, operasyondaki Operasyon Müdürü olabilir;
   * bkz. profilDepartmanEngeli.
   */
  departman: DepartmanTuru;
};

export type DepartmanTuru = "satis" | "operasyon";

export const YETKI_PROFILLERI: readonly YetkiProfili[] = [
  {
    key: "operasyon-muduru",
    label: "Operasyon Müdürü",
    aciklama:
      "Bütün işleri görür, personele atar, arşivler ve ekip yükünü kişi kişi izler. " +
      "CRM, Finans, İnsan Kaynakları, Raporlar ve Dokümanlar kapalıdır; Posta açık kalır.",
    rol: "manager",
    acikModuller: ["operations", "posta"],
    acikYetkiler: [
      "operations.is.yonet",
      "operations.gorev.ata",
      "operations.arsiv.yonet",
      "operations.ekip.gor",
    ],
    departman: "operasyon",
  },
  {
    key: "satis-muduru",
    label: "Satış Müdürü",
    aciklama:
      "Bütün talepleri, teklifleri ve sözleşmeleri görür, personele atar, ekibin takvimini ve müşteri geçmişini izler. " +
      "Operasyon, Finans, İnsan Kaynakları ve Raporlar kapalıdır; Dokümanlar ve Posta açık kalır.",
    rol: "manager",
    acikModuller: ["crm", "documents", "posta"],
    acikYetkiler: [
      "crm.kayit.ata",
      "crm.talep.yonet",
      "crm.talep.arsivle",
      "crm.teklif.yonet",
      "crm.sozlesme.yonet",
      "crm.musteri.sorgula",
      "crm.takvim.tum",
    ],
    departman: "satis",
  },
];

/*
  DEPARTMAN EŞLEŞMESİ (2026-10). Kurum sahibinin kuralı: satış
  departmanındaki kişi Satış Müdürü, operasyon departmanındaki Operasyon
  Müdürü olabilir — tersi bir yanlışlıktır (satışçıya operasyonun bütün
  işlerini açmak). Departman adı serbest metin olduğu için tür adından
  çıkarılıyor ("Satış Departmanı", "SATIŞ", "Operasyon Ekibi").

  Adı iki türe de uymayan (ya da departmanı olmayan) kişiye her profil
  açık: kurumun departman adlarını bilmiyoruz, tanımadığımız bir adla
  müdürlüğü kilitlemek işi durdururdu.
*/
const kucult = (ad: string) => ad.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");

export function departmanTuru(departmanAdi: string | null | undefined): DepartmanTuru | null {
  const ad = kucult(departmanAdi ?? "");
  if (/\bsatis/.test(ad)) return "satis";
  if (/\boperasyon/.test(ad)) return "operasyon";
  return null;
}

/** Kişinin departmanına uygun profiller; tür tanınmıyorsa hepsi. */
export function departmanaUygunProfiller(departmanAdi: string | null | undefined, profiller: readonly YetkiProfili[] = YETKI_PROFILLERI): YetkiProfili[] {
  const tur = departmanTuru(departmanAdi);
  return tur ? profiller.filter((profil) => profil.departman === tur) : [...profiller];
}

/** Profil bu departmana uygulanabilir mi; değilse kullanıcıya gösterilecek açıklama. */
export function profilDepartmanEngeli(profil: YetkiProfili, departmanAdi: string | null | undefined): string | null {
  const tur = departmanTuru(departmanAdi);
  if (!tur || tur === profil.departman) return null;
  return `${profil.label} yalnızca ${profil.departman === "satis" ? "satış" : "operasyon"} departmanındaki personele uygulanır; bu kişi "${departmanAdi}" departmanında. Önce departmanını değiştirin.`;
}

export const profilBul = (key: string | null | undefined) =>
  YETKI_PROFILLERI.find((profil) => profil.key === key) ?? null;

/** Her modül için açık/kapalı kararı; "rolden gelsin" bırakılmıyor. */
export function profilModulKararlari(
  profil: YetkiProfili,
  moduller: readonly { key: string }[],
): { module_key: string; can_access: boolean }[] {
  return moduller.map((modul) => ({
    module_key: modul.key,
    can_access: profil.acikModuller.includes(modul.key),
  }));
}

/**
 * Kişi şu an profile uyuyor mu — ekranda "uygulandı" demek için.
 *
 * Ölçüt üç parça: rol, modül istisnalarının TAMAMI ve profilin
 * tanım yetenekleri. Modülde tek bir "rolden gelen" satır bile
 * uyumsuzluk sayılıyor; profilin amacı rol kuralından bağımsız
 * olmaktı.
 */
export function profilUygulandiMi(
  profil: YetkiProfili,
  mevcut: {
    rol: string;
    modulIstisnalari: ReadonlyMap<string, boolean>;
    yetkiIstisnalari: ReadonlyMap<string, boolean>;
  },
  moduller: readonly { key: string }[],
): boolean {
  if (mevcut.rol !== profil.rol) return false;
  for (const karar of profilModulKararlari(profil, moduller)) {
    if (mevcut.modulIstisnalari.get(karar.module_key) !== karar.can_access) return false;
  }
  return profil.acikYetkiler.every((key) => mevcut.yetkiIstisnalari.get(key) === true);
}
