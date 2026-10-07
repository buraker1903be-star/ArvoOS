/*
  YETENEK (CAPABILITY) KATALOGU — kiracının kendi personelini sınırlayabildiği yer.

  Eskiden yetki iki katmandan ibaretti: RLS'teki rol listeleri ve
  `role_module_permissions` (6 modül × 4 rol, aç/kapa). Arada kalan
  "silebilir mi", "atama yapabilir mi", "maliyeti yönetebilir mi" gibi
  kararların tamamı kodda sabitti — panelde seksen kadar
  `["owner","admin"].includes(role)` satırı. Çok kiracılı bir sistemde bu,
  her kurumun aynı iş bölümüne zorlanması demekti: bir kurum satış
  personeline teklif silme yetkisi vermek, bir başkası yöneticisinden
  maliyet yönetimini almak isteyebilir ve ikisi de yapılamıyordu.

  Artık her karar bir ANAHTAR. Varsayılanı burada yazılı ve bugünkü
  davranışın birebir aynısı: hiçbir kurum ayar değiştirmezse hiçbir şey
  değişmez. Kurum isterse rol düzeyinde (role_capability_permissions) ya da
  tek bir kişi için (member_capability_permissions) bunu değiştirir.

  Üç kural değişmez:
   1. Kurum Sahibi (owner) kısıtlanamaz — kendi panelinden kilitlenmesin.
   2. Modülü kapalı olanın o modüldeki yetenekleri de kapalıdır; görmediği
      ekranda silme yetkisi anlamsız ve yanıltıcı olurdu.
   3. Kişi kuralı rol kuralını ezer — hem kısıtlamak hem (rolde kapalıyken)
      tek kişiye açmak için.

  Saf modül: testi tests/unit/yetkiler.test.ts.
*/

export type YetkiTanimi = {
  /** Kalıcı anahtar. Veritabanına bu yazılır; bir daha değiştirilmez. */
  key: string;
  /**
   * Bağlı olduğu modül anahtarı (PERMISSION_MODULES ile aynı küme) ya da
   * modülden bağımsızsa null. Modül kapalıysa yetenek de kapanır.
   */
  modul: string | null;
  label: string;
  aciklama: string;
  /** Kurum hiç ayar yapmadığında yetkiyi taşıyan roller. Bugünkü davranış. */
  varsayilan: readonly string[];
  /**
   * Aynı kuralı RLS de uyguluyor: bu yetki KISITLANABİLİR ama GEVŞETİLEMEZ.
   *
   * Teklif/sözleşme silme, finans kaydı, personel kaydı gibi işlemlerde
   * veritabanı politikası da rolü denetliyor. Panelden bir role bu yetkiyi
   * "açmak" düğmeyi görünür yapar, veritabanı satırı sessizce eler ve
   * kullanıcı "sildim ama silinmedi" ile kalır — bu hata bir kez yaşandı
   * (bkz. app/panel/crm/sales-shared.ts · DELETE_ROLES). O yüzden açma
   * yönünde hiçbir etkisi yok: varsayılan kapalıysa kapalı kalır.
   */
  rlsBagli?: true;
};

const YONETIM = ["admin"] as const;              // owner zaten her şeyi yapar
const YONETIM_VE_SEF = ["admin", "manager"] as const;
/* Satış personeli kendi talebini kapatabilsin: arşivleme kaydı SİLMİYOR,
   aşamayı "lost" yapıp sebebini yazıyor. Hangi talebi kapatabileceğini
   RLS söylüyor — yalnızca kendisine atanmış olanları. */
const YONETIM_SEF_VE_SATIS = ["admin", "manager", "member"] as const;
/* Ortak posta kutusunun amacı zaten "ekibin tamamı aynı kutuyu görsün":
   varsayılanı dar tutmak, özelliği kurduğumuz anda kullanılamaz yapardı.
   Kısıtlamak isteyen kurum rol ya da kişi düzeyinde kapatır. */
const HERKES = ["admin", "manager", "member", "operasyoncu"] as const;

export const YETKI_GRUPLARI: readonly { modul: string | null; baslik: string; yetkiler: readonly YetkiTanimi[] }[] = [
  {
    modul: "crm",
    baslik: "CRM · Müşteri ve Satış",
    yetkiler: [
      { key: "crm.kayit.ata", modul: "crm", label: "Kayıt atama", aciklama: "Talep, teklif ve sözleşmeyi başka bir personele atar", varsayilan: YONETIM_VE_SEF, rlsBagli: true },
      { key: "crm.talep.yonet", modul: "crm", label: "Talep yönetimi", aciklama: "Talep durumunu ve aşamasını değiştirir", varsayilan: YONETIM_VE_SEF },
      { key: "crm.talep.arsivle", modul: "crm", label: "Talep arşivleme", aciklama: "Talebi sebebiyle birlikte arşivler; kayıt silinmez, aşaması \"Arşivlendi\" olur", varsayilan: YONETIM_SEF_VE_SATIS },
      { key: "crm.teklif.yonet", modul: "crm", label: "Teklif yönetimi", aciklama: "Teklif oluşturur, revize eder, gönderir", varsayilan: YONETIM_VE_SEF },
      { key: "crm.teklif.sil", modul: "crm", label: "Teklif silme", aciklama: "Teklif kaydını siler", varsayilan: YONETIM, rlsBagli: true },
      { key: "crm.sozlesme.yonet", modul: "crm", label: "Sözleşme yönetimi", aciklama: "Sözleşme hazırlar, imzaya gönderir, ek düzenler", varsayilan: YONETIM_VE_SEF },
      { key: "crm.sozlesme.sil", modul: "crm", label: "Sözleşme silme", aciklama: "Sözleşme kaydını siler", varsayilan: YONETIM, rlsBagli: true },
      { key: "crm.firsat.sil", modul: "crm", label: "Talep/fırsat silme", aciklama: "Talep ve fırsat kaydını siler", varsayilan: YONETIM, rlsBagli: true },
      { key: "crm.musteri.sorgula", modul: "crm", label: "Müşteri sorgulama", aciklama: "Müşterinin tüm geçmişini (künye, teklif, sözleşme, iş) görür", varsayilan: YONETIM_VE_SEF, rlsBagli: true },
      { key: "crm.takvim.tum", modul: "crm", label: "Tüm ekibin takvimi", aciklama: "Kendi kayıtları değil, kurumun tamamının takvimini görür", varsayilan: YONETIM_VE_SEF },
      { key: "crm.yorum.yonet", modul: "crm", label: "Başkasının yorumunu silme", aciklama: "Kurum içi yorumlarda kendi yazdığından başkasını da siler", varsayilan: YONETIM_VE_SEF },
    ],
  },
  {
    modul: "operations",
    baslik: "Operasyon",
    yetkiler: [
      { key: "operations.is.yonet", modul: "operations", label: "İş yönetimi", aciklama: "İş açar, adımları ve terminleri düzenler", varsayilan: YONETIM_VE_SEF, rlsBagli: true },
      { key: "operations.is.sil", modul: "operations", label: "İş silme", aciklama: "İş kaydını siler", varsayilan: YONETIM, rlsBagli: true },
      { key: "operations.gorev.ata", modul: "operations", label: "Görev atama", aciklama: "İşi ve adımlarını personele atar", varsayilan: YONETIM_VE_SEF, rlsBagli: true },
      { key: "operations.sablon.yonet", modul: "operations", label: "Şablon yönetimi", aciklama: "İş adımı şablonlarını düzenler", varsayilan: YONETIM },
      { key: "operations.arsiv.yonet", modul: "operations", label: "Arşiv yönetimi", aciklama: "İşi arşivler, arşivden geri alır", varsayilan: YONETIM_VE_SEF },
    ],
  },
  {
    modul: "finance",
    baslik: "Finans",
    yetkiler: [
      { key: "finance.gor", modul: "finance", label: "Finans ekranlarını görme", aciklama: "Cari, tahsilat ve finans sekmelerini açar", varsayilan: YONETIM },
      { key: "finance.rapor.gor", modul: "reports", label: "Raporları görme", aciklama: "Finans → Raporlar sekmesi (satış ve kârlılık)", varsayilan: YONETIM },
      { key: "finance.kayit.yonet", modul: "finance", label: "Finans kaydı yönetimi", aciklama: "Tahsilat, gider ve hareket kaydı girer", varsayilan: YONETIM, rlsBagli: true },
      { key: "finance.maliyet.yonet", modul: "finance", label: "Maliyet yönetimi", aciklama: "İş maliyetlerini görür ve düzenler", varsayilan: YONETIM },
      { key: "finance.cari.yonet", modul: "finance", label: "Cari yönetimi", aciklama: "Cari hesap açar, hareket işler", varsayilan: YONETIM, rlsBagli: true },
      { key: "finance.cari.sil", modul: "finance", label: "Cari silme", aciklama: "Cari hesabı siler", varsayilan: YONETIM, rlsBagli: true },
      { key: "finance.banka.yonet", modul: "finance", label: "Banka yönetimi", aciklama: "Banka hesabı ve hareketlerini yönetir", varsayilan: YONETIM, rlsBagli: true },
      { key: "finance.odeme.saglayici", modul: "finance", label: "Ödeme sağlayıcı ayarları", aciklama: "Tami/PayTR anahtarlarını ve ödeme ayarlarını değiştirir", varsayilan: YONETIM },
      { key: "finance.lisans.yonet", modul: "finance", label: "Lisans ve ödeme", aciklama: "Kurumun Arvo lisansını ve kredi alımını yönetir", varsayilan: YONETIM },
    ],
  },
  {
    modul: "hr",
    baslik: "İnsan Kaynakları",
    yetkiler: [
      { key: "hr.ekip.yonet", modul: "hr", label: "Ekip yönetimi", aciklama: "Personel davet eder, rol atar, erişimi açıp kapatır", varsayilan: YONETIM },
      { key: "hr.personel.yonet", modul: "hr", label: "Personel kayıtları", aciklama: "Personel ve departman kayıtlarını düzenler", varsayilan: YONETIM, rlsBagli: true },
      { key: "hr.ozluk.yonet", modul: "hr", label: "Özlük dosyaları", aciklama: "Özlük belgelerini yükler, indirir, siler", varsayilan: YONETIM, rlsBagli: true },
      { key: "hr.prim.gor", modul: "hr", label: "Prim hesaplarını görme", aciklama: "Personel prim hesaplarını görüntüler", varsayilan: YONETIM_VE_SEF },
      { key: "hr.prim.yonet", modul: "hr", label: "Prim ödemesi", aciklama: "Prim ödemesi kaydeder", varsayilan: YONETIM, rlsBagli: true },
      { key: "hr.hareket.gor", modul: "hr", label: "Personel hareketleri", aciklama: "Personelin panel hareket geçmişini görür", varsayilan: YONETIM_VE_SEF },
      { key: "hr.gizlilik.gor", modul: "hr", label: "Gizlilik arşivi", aciklama: "İmzalı gizlilik sözleşmelerini görür", varsayilan: YONETIM_VE_SEF },
    ],
  },
  {
    modul: "posta",
    baslik: "Posta",
    yetkiler: [
      { key: "posta.gor", modul: "posta", label: "Ortak posta kutusu", aciklama: "Kurumun ortak gelen kutusunu görür", varsayilan: HERKES },
      { key: "posta.yanitla", modul: "posta", label: "Posta yazma", aciklama: "Ortak kutudan yanıt ve yeni posta gönderir", varsayilan: HERKES },
      { key: "posta.yonet", modul: "posta", label: "Konuşma yönetimi", aciklama: "Konuşmayı birine atar, yanıtlandı/kapandı olarak işaretler", varsayilan: YONETIM_VE_SEF },
    ],
  },
  {
    modul: null,
    baslik: "Kurum ayarları",
    yetkiler: [
      { key: "settings.kurum.yonet", modul: null, label: "Kurum ayarları", aciklama: "Kurum bilgileri, marka, alan adı ve yasal bilgiler", varsayilan: YONETIM },
      { key: "settings.yetki.yonet", modul: null, label: "Yetkilendirme", aciklama: "Bu sayfayı açar ve rol/kişi yetkilerini değiştirir", varsayilan: YONETIM },
      { key: "settings.entegrasyon.yonet", modul: null, label: "Entegrasyonlar", aciklama: "WhatsApp ve diğer entegrasyon ayarlarını yönetir", varsayilan: YONETIM },
      { key: "settings.kurulum.yonet", modul: null, label: "Kurulum sihirbazı", aciklama: "Kurum ilk kurulum adımlarını yürütür", varsayilan: YONETIM },
      { key: "bildirim.duyuru.gonder", modul: null, label: "Duyuru gönderme", aciklama: "Kurum içi duyuru yayınlar", varsayilan: YONETIM_VE_SEF },
    ],
  },
] as const;

export const TUM_YETKILER: readonly YetkiTanimi[] = YETKI_GRUPLARI.flatMap((grup) => grup.yetkiler);

const YETKI_HARITASI = new Map(TUM_YETKILER.map((yetki) => [yetki.key, yetki]));

export function yetkiTanimi(key: string): YetkiTanimi | undefined {
  return YETKI_HARITASI.get(key);
}

export type YetkiKurali = { capability_key: string; allowed: boolean };
export type ModulKurali = { module_key: string; can_access: boolean };

/**
 * Kişiye ait gizli modül kümesi. Rol satırı ve kişi satırı birlikte okunur;
 * kişi satırı rolü ezer. Eskiden yalnızca rol satırları okunuyordu ve
 * `can_access = false` olanlar sorguda filtreleniyordu: bu yüzden "rolde
 * kapalı ama bu kişide açık" ifade edilemiyordu.
 */
export function gizliModulleriHesapla(girdi: {
  rol: string;
  rolSatirlari?: readonly ModulKurali[];
  kisiSatirlari?: readonly ModulKurali[];
}): Set<string> {
  const gizli = new Set<string>();
  if (girdi.rol === "owner") return gizli;

  const karar = new Map<string, boolean>();
  for (const satir of girdi.rolSatirlari ?? []) karar.set(satir.module_key, satir.can_access);
  for (const satir of girdi.kisiSatirlari ?? []) karar.set(satir.module_key, satir.can_access);
  for (const [anahtar, acik] of karar) if (!acik) gizli.add(anahtar);
  return gizli;
}

/**
 * Kişinin sahip olduğu yetenek anahtarları. Sıra: katalog varsayılanı →
 * rol kuralı → kişi kuralı → modül kapısı (kapalı modülün yetenekleri de
 * kapalı).
 */
export function etkinYetkiler(girdi: {
  rol: string;
  gizliModuller?: ReadonlySet<string>;
  rolKurallari?: readonly YetkiKurali[];
  kisiKurallari?: readonly YetkiKurali[];
}): Set<string> {
  const sonuc = new Set<string>();
  // Kurum Sahibi kısıtlanamaz: kurumun tek kalan yetkilisi kendini
  // dışarıda bırakabilirse kurum yönetilemez hâle gelir.
  if (girdi.rol === "owner") {
    for (const yetki of TUM_YETKILER) sonuc.add(yetki.key);
    return sonuc;
  }

  const rolKurali = new Map((girdi.rolKurallari ?? []).map((satir) => [satir.capability_key, satir.allowed]));
  const kisiKurali = new Map((girdi.kisiKurallari ?? []).map((satir) => [satir.capability_key, satir.allowed]));
  const gizli = girdi.gizliModuller ?? new Set<string>();

  for (const yetki of TUM_YETKILER) {
    const varsayilanAcik = yetki.varsayilan.includes(girdi.rol);
    let acik = varsayilanAcik;
    if (rolKurali.has(yetki.key)) acik = rolKurali.get(yetki.key)!;
    if (kisiKurali.has(yetki.key)) acik = kisiKurali.get(yetki.key)!;
    // RLS de aynı kuralı uyguluyorsa açma yönünde etkisi olamaz: panel
    // düğmeyi gösterir, veritabanı satırı eler, kullanıcı sebebini bilmez.
    if (yetki.rlsBagli && !varsayilanAcik) acik = false;
    if (acik && yetki.modul && gizli.has(yetki.modul)) acik = false;
    if (acik) sonuc.add(yetki.key);
  }
  return sonuc;
}

/** Varsayılan (hiç ayar yapılmamış) durumda bir rolün yetkileri. Matris için. */
export function varsayilanAcikMi(rol: string, key: string): boolean {
  return Boolean(YETKI_HARITASI.get(key)?.varsayilan.includes(rol));
}

/**
 * Bu rol/yetki ikilisi panelden AÇILABİLİR mi. RLS'e bağlı bir yetki
 * varsayılan olarak kapalıysa açılamaz; matris o hücrede anahtar yerine
 * kilit gösterir, yoksa kapanmayan bir anahtar kullanıcıyı yanıltır.
 */
export function acilabilirMi(rol: string, key: string): boolean {
  const tanim = YETKI_HARITASI.get(key);
  if (!tanim) return false;
  return !tanim.rlsBagli || tanim.varsayilan.includes(rol);
}

/**
 * Yetki değişikliğini uygulamadan önceki kilitlenme koruması.
 *
 * Yetkilendirme sayfasını açan Yönetici kendi "Yetkilendirme" kutucuğunu
 * kapatırsa sayfaya bir daha giremez; geri açacak tek kişi Kurum Sahibi
 * olur ve küçük kurumlarda o kişi aynı kişidir. Teknik olarak mümkün,
 * hiçbir senaryoda istenmez.
 */
export function yetkiDegisikligiEngeli(girdi: {
  /** İşlemi yapan kişinin rolü. */
  rol: string;
  /** Hedef: kendi rolü/kendisi mi değiştiriliyor. */
  kendisiMi: boolean;
  /** Değişiklik sonrası "settings.yetki.yonet" açık kalıyor mu. */
  yetkiYonetimiAcikKaliyor: boolean;
}): string | null {
  if (girdi.rol === "owner") return null;
  if (!girdi.kendisiMi) return null;
  if (girdi.yetkiYonetimiAcikKaliyor) return null;
  return "Kendi Yetkilendirme yetkinizi buradan kapatamazsınız; sayfaya bir daha giremezsiniz.";
}

/**
 * Sunucu işlemleri için kapı. Hata metni yetkinin ADINI söylüyor: "Bu işlem
 * için yetkiniz yok." diyen eski mesajlar yüzünden hangi kutucuğun
 * kapatıldığını bulmak kurum yöneticisi için de, bizim için de tahmine
 * kalıyordu (02.10.2026'da üç kişinin yorum yazamamasının sebebini bulmak
 * iki gün aldı).
 */
export function assertYetki(yetkiler: ReadonlySet<string>, key: string) {
  if (yetkiler.has(key)) return;
  const tanim = YETKI_HARITASI.get(key);
  throw new Error(tanim
    ? `Bu işlem "${tanim.label}" yetkisi istiyor; kurum ayarlarında rolünüze kapatılmış.`
    : "Bu işlem için yetkiniz yok.");
}
