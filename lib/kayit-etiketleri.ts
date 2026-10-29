/*
  KAYIT GEÇMİŞİ ETİKETLERİ — TEK KAYNAK (30.10.2026).

  Aynı olay iki ekranda yazılıyor ve iki ayrı listeden okunuyordu:

   - Kiracı panelinin kayıt geçmişi (app/panel/crm/record-history):
     cümle kuruyor, "<kişi> kaydını <etiket>" — "bir aşamaya sorumlu
     atadı".
   - Konsolun müşteri dosyası (platform/kiraci-dosyasi): tablo sütunu,
     öznesiz — "Aşamaya sorumlu atandı".

  Listeler SAPTI: operasyonun yazdığı sekiz kod (step_assign,
  stage_move, waiting_party…) yalnızca kiracı panelinin listesine
  eklenmişti. Konsolda aynı olay HAM KODLA görünüyordu — kurucu
  müşteri dosyasında "step_assign" okuyordu (30.10.2026, canlıda
  görüldü).

  İki dil de korunuyor çünkü ikisi de doğru: cümlenin içinde
  "Aşamaya sorumlu atandı" bozuk, sütun başlığının altında "bir
  aşamaya sorumlu atadı" bozuk. Ortak olan KODLARIN KÜMESİ; iki
  kayıt yan yana duruyor ki biri eklenip öteki unutulamasın.

  Saf modül; testi tests/unit/kayit-etiketleri.test.ts — orada
  uygulamanın YAZDIĞI bütün kodların burada karşılığı olduğu da
  sınanıyor (kaynak taranarak).
*/

export type EylemEtiketi = {
  /** Kişi cümlesi: "<ad> <varlık> kaydını <kisi>". */
  kisi: string;
  /** Öznesiz sütun hâli. */
  edilgen: string;
};

export const EYLEM_ETIKETLERI: Record<string, EylemEtiketi> = {
  create: { kisi: "oluşturdu", edilgen: "Oluşturuldu" },
  update: { kisi: "güncelledi", edilgen: "Güncellendi" },
  status: { kisi: "durumunu değiştirdi", edilgen: "Durum değişti" },
  stage: { kisi: "aşamasını değiştirdi", edilgen: "Aşama değişti" },
  assign: { kisi: "sorumlusunu değiştirdi", edilgen: "Sorumlu değişti" },
  convert: { kisi: "bir sonraki adıma dönüştürdü", edilgen: "Dönüştürüldü" },
  send: { kisi: "müşteriye gönderdi", edilgen: "Müşteriye gönderildi" },
  sign: { kisi: "imzaladı", edilgen: "İmzalandı" },
  archive: { kisi: "arşivledi", edilgen: "Arşivlendi" },
  restore: { kisi: "geri aldı", edilgen: "Geri alındı" },
  delete: { kisi: "sildi", edilgen: "Silindi" },
  accept: { kisi: "kabul etti", edilgen: "Kabul edildi" },
  reject: { kisi: "reddetti", edilgen: "Reddedildi" },
  cancel: { kisi: "iptal etti", edilgen: "İptal edildi" },
  complete: { kisi: "tamamladı", edilgen: "Tamamlandı" },
  invite: { kisi: "davet etti", edilgen: "Davet edildi" },
  activate: { kisi: "erişimini açtı", edilgen: "Erişim açıldı" },
  deactivate: { kisi: "erişimini kapattı", edilgen: "Erişim kapatıldı" },
  login: { kisi: "giriş yaptı", edilgen: "Giriş yapıldı" },
  payment: { kisi: "ödeme bildirdi", edilgen: "Ödeme bildirildi" },
  step: { kisi: "adım ekledi", edilgen: "Adım eklendi" },
  comment: { kisi: "not ekledi", edilgen: "Not eklendi" },
  /* Satışçı talebi listesinden kaldırdı / yönetici geri verdi (20261022135951). */
  release: { kisi: "listesinden kaldırdı", edilgen: "Listeden kaldırıldı" },
  release_undo: { kisi: "kaldırma uyarısını kaldırıp satışçıya geri verdi", edilgen: "Satışçıya geri verildi" },
  /*
    Operasyon olayları. Adım olayları ayrı bir varlık türü değil: işin
    kimliğiyle yazılıyor, adımın adı metadata'da (lib/activity-log).
  */
  step_dates: { kisi: "aşama tarihlerini işin takvimine dağıttı", edilgen: "Aşama tarihleri dağıtıldı" },
  stage_move: { kisi: "işi panoda başka aşamaya taşıdı", edilgen: "Panoda aşama değişti" },
  step_status: { kisi: "bir aşamanın durumunu değiştirdi", edilgen: "Aşama durumu değişti" },
  step_due: { kisi: "bir aşamanın tarihini değiştirdi", edilgen: "Aşama tarihi değişti" },
  step_assign: { kisi: "bir aşamaya sorumlu atadı", edilgen: "Aşamaya sorumlu atandı" },
  step_done: { kisi: "bir aşamayı tamamladı", edilgen: "Aşama tamamlandı" },
  step_undone: { kisi: "bir aşamayı yeniden açtı", edilgen: "Aşama yeniden açıldı" },
  work_type: { kisi: "çalışma türünü değiştirdi", edilgen: "Çalışma türü değişti" },
  waiting_party: { kisi: "topun kimde olduğunu değiştirdi", edilgen: "Bekleyen taraf değişti" },
  revision_days: { kisi: "revizyon süresini değiştirdi", edilgen: "Revizyon süresi değişti" },
  /* Konsolun kendi işlemleri (provisioning_audit_logs değil, etkinlik kaydı). */
  provision_organization: { kisi: "kurumu kurdu", edilgen: "Kurulum" },
  owner_access_link: { kisi: "sahibe giriş bağlantısı üretti", edilgen: "Giriş bağlantısı" },
};

export const VARLIK_ETIKETLERI: Record<string, string> = {
  crm_opportunity: "Talep",
  crm_proposal: "Teklif",
  crm_contract: "Sözleşme",
  operation_workflow: "İş akışı",
  organization_membership: "Üye erişimi",
  organization: "Kurum",
  payment_notification: "Ödeme bildirimi",
  hr_employee: "Personel",
  finance_transaction: "Finans hareketi",
};

/**
 * Karşılığı yoksa HAM KOD dönüyor: uydurma bir cümle yazmaktansa
 * kodu göstermek yeğdir — ekranda görülen kod buraya eklenir.
 */
export const eylemEtiketi = (kod: string, dil: keyof EylemEtiketi) => EYLEM_ETIKETLERI[kod]?.[dil] ?? kod;
export const varlikEtiketi = (kod: string) => VARLIK_ETIKETLERI[kod] ?? kod;
