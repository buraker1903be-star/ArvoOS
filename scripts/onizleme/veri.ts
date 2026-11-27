/*
  ÖNİZLEMENİN ÖRNEK VERİSİ (27.11.2026). Yalnızca `npm run onizleme`
  içinde yüklenir (next.config.ts → ARVOOS_ONIZLEME).

  GERÇEK MÜŞTERİ VERİSİ DEĞİL, hiçbiri: adlar, e-postalar, tutarlar ve
  kimlikler uydurma. Ekranları gerçek bileşenle görmek ve rotanın
  açıldığını sınamak için yeterli kadar satır var; sorgu doğruluğunu
  tests/db sınıyor.

  Kurucunun oturumu: `arvo-os` kurumunda `owner` — isPlatformOwner
  kararı buradan çıkıyor (lib/panel-context: rol owner VE slug
  arvo-os). Kapsam satırı yok, yani konsolun altı alanı da açık.
*/

import { SOZLESME_SURUMU } from "@/lib/sozlesme/kullanim-sozlesmesi";

const ARVO = "00000000-0000-4000-8000-000000000001";
const K1 = "11111111-1111-4111-8111-111111111111";
const K2 = "22222222-2222-4222-8222-222222222222";
const K3 = "33333333-3333-4333-8333-333333333333";
const K4 = "44444444-4444-4444-8444-444444444444";
const KURUCU = "99999999-9999-4999-8999-999999999999";

export const ORNEK_KULLANICI = { id: KURUCU, email: "kurucu@ornek.test" };

const gun = (fark: number) => new Date(Date.now() + fark * 86_400_000).toISOString();

/* Kimlikler UUID: rotalar biçimi doğruluyor ve UUID olmayan bir
   kimlik notFound() veriyor — "t1" ile açılan görüşme rotası
   önizlemede 404 dönüyordu. */
/* Kurum künyeleri tek yerde: liste görünümü, organizations tablosu ve
   gömülü seçimler aynı adları taşısın. */
const KURUMLAR = [
  { id: K1, name: "Akademi Yayıncılık", display_name: "Akademi Yayıncılık A.Ş.", slug: "akademi", plan_code: "kurumsal", kind: "kurumsal", monthly_fee: 450_000, user_limit: 25, aktif_uye: 18, phone: "0212 555 0101" },
  { id: K2, name: "Ege Danışmanlık", display_name: "Ege Danışmanlık Ltd.", slug: "ege", plan_code: "baslangic", kind: "kurumsal", monthly_fee: 180_000, user_limit: 10, aktif_uye: 7, phone: "0232 555 0202" },
  { id: K3, name: "Kuzey Mimarlık", display_name: null, slug: "kuzey", plan_code: "profesyonel", kind: "kurumsal", monthly_fee: 320_000, user_limit: 15, aktif_uye: 15, phone: "0312 555 0303" },
  { id: K4, name: "Deniz Eğitim Kurumları", display_name: "Deniz Eğitim", slug: "deniz", plan_code: "kurumsal", kind: "kurumsal", monthly_fee: 540_000, user_limit: 40, aktif_uye: 31, phone: "0224 555 0404" },
];

export const ORNEK: Record<string, Record<string, unknown>[]> = {
  /* Kurucunun kendi kurumu listede yok (konsol onu göstermiyor). */
  platform_kiraci_liste: KURUMLAR.map((k, i) => ({
    id: k.id, name: k.name, display_name: k.display_name, kind: k.kind,
    provisioning_state: i === 3 ? "pending" : "ready",
    license_status: i === 1 ? "past_due" : i === 2 ? "trialing" : "active",
    plan_code: k.plan_code, monthly_fee: k.monthly_fee,
    current_period_end: gun(i === 1 ? -4 : 20 + i), trial_ends_at: i === 2 ? gun(6) : null,
    user_limit: k.user_limit, aktif_uye: k.aktif_uye, contact_phone: k.phone,
    grup_markasi: null, davet_eposta: i === 3 ? "bilgi@ornek.test" : null,
  })),
  organizations: [
    { id: ARVO, created_at: gun(-900), slug: "arvo-os", name: "Arvo", display_name: "Arvo", legal_name: "Arvo Yazılım A.Ş.", legal_address: "Örnek Mah. 1", legal_district: "Çankaya", legal_city: "Ankara", tax_office: "Çankaya", tax_number: "1234567890", contact_email: "kurumsal@ornek.test" },
    ...KURUMLAR.map((k, i) => ({
      id: k.id, created_at: gun(-300 + i * 40), slug: k.slug, name: k.name, display_name: k.display_name,
      /* Üçüncü kurumun resmi bilgisi eksik: "Resmi bilgi eksik" süzgeci
         ve proforma uyarısı örnek veriyle de görülebilsin. */
      legal_name: i === 2 ? null : k.name, legal_address: i === 2 ? null : "Örnek Cad. " + (i + 2),
      legal_district: i === 2 ? null : "Merkez", legal_city: i === 2 ? null : "İstanbul",
      tax_office: i === 2 ? null : "Merkez", tax_number: i === 2 ? null : "98765432" + i,
      contact_email: `bilgi@${k.slug}.test`,
    })),
  ],
  organization_product_licenses: [
    { organization_id: K1, product: "arvolab", status: "active", monthly_fee: 120_000, current_period_end: gun(20), trial_ends_at: null },
    { organization_id: K1, product: "randevu", status: "trialing", monthly_fee: 0, current_period_end: null, trial_ends_at: gun(9) },
    { organization_id: K2, product: "arc", status: "past_due", monthly_fee: 90_000, current_period_end: gun(-4), trial_ends_at: null },
    { organization_id: K4, product: "arvolab", status: "active", monthly_fee: 150_000, current_period_end: gun(23), trial_ends_at: null },
  ],
  product_subscribers: [
    { id: "s1", product: "arvolab", email: "ayse@ornek.test", full_name: "Ayşe Y.", status: "active", trial_ends_at: null, current_period_end: gun(12), created_at: gun(-60), kurum_id: null },
    { id: "s2", product: "arvolab", email: "mehmet@ornek.test", full_name: "Mehmet K.", status: "trialing", trial_ends_at: gun(3), current_period_end: null, created_at: gun(-5), kurum_id: null },
    { id: "s3", product: "arc", email: "zeynep@ornek.test", full_name: "Zeynep A.", status: "canceled", trial_ends_at: null, current_period_end: gun(-11), created_at: gun(-200), kurum_id: null },
  ],
  product_plans: [
    { product: "arvolab", individual_monthly_fee: 29_900 },
    { product: "arc", individual_monthly_fee: 19_900 },
    { product: "randevu", individual_monthly_fee: 14_900 },
  ],
  plans: [
    { code: "baslangic", name: "Başlangıç", is_active: true, created_at: gun(-500) },
    { code: "profesyonel", name: "Profesyonel", is_active: true, created_at: gun(-499) },
    { code: "kurumsal", name: "Kurumsal", is_active: true, created_at: gun(-498) },
  ],

  /* ---- Finans: ödeme bildirimleri ---- */
  organization_payment_requests: [
    { id: "bbbbbbb1-0000-4000-8000-000000000001", organization_id: K1, plan_code: "kurumsal", product: "core", amount: 450_000, currency: "TRY", status: "pending", payment_method: "bank_transfer", receipt_path: "dekont/p1.pdf", reference_no: "ARV-2026-0141", customer_note: "Havale bugün yapıldı, dekont ekte.", review_note: null, created_at: gun(-1), reviewed_at: null, organizations: { name: "Akademi Yayıncılık", slug: "akademi" }, platform_bank_accounts: { bank_name: "Örnek Bank", iban: "TR00 0000 0000 0000 0000 0000 01" } },
    { id: "bbbbbbb1-0000-4000-8000-000000000002", organization_id: K4, plan_code: "kurumsal", product: "arvolab", amount: 150_000, currency: "TRY", status: "pending", payment_method: "bank_transfer", receipt_path: null, reference_no: "ARV-2026-0142", customer_note: null, review_note: null, created_at: gun(-2), reviewed_at: null, organizations: { name: "Deniz Eğitim Kurumları", slug: "deniz" }, platform_bank_accounts: { bank_name: "Örnek Bank", iban: "TR00 0000 0000 0000 0000 0000 01" } },
    { id: "bbbbbbb1-0000-4000-8000-000000000003", organization_id: K2, plan_code: "baslangic", product: "core", amount: 180_000, currency: "TRY", status: "approved", payment_method: "bank_transfer", receipt_path: "dekont/p3.pdf", reference_no: "ARV-2026-0120", customer_note: null, review_note: "Hesapta görüldü.", created_at: gun(-20), reviewed_at: gun(-19), organizations: { name: "Ege Danışmanlık", slug: "ege" }, platform_bank_accounts: { bank_name: "Örnek Bank", iban: "TR00 0000 0000 0000 0000 0000 01" } },
    { id: "bbbbbbb1-0000-4000-8000-000000000004", organization_id: K3, plan_code: "profesyonel", product: "core", amount: 320_000, currency: "TRY", status: "rejected", payment_method: "bank_transfer", receipt_path: null, reference_no: "ARV-2026-0118", customer_note: "Dekontu sonra yükleyeceğim.", review_note: "Dekont gelmedi.", created_at: gun(-26), reviewed_at: gun(-24), organizations: { name: "Kuzey Mimarlık", slug: "kuzey" }, platform_bank_accounts: null },
  ],
  platform_subscription_requests: [
    { id: "a1", organization_id: K4, status: "pending", plan_code: "kurumsal", created_at: gun(-3) },
  ],
  platform_bank_accounts: [
    { id: "b1", bank_name: "Örnek Bank", iban: "TR00 0000 0000 0000 0000 0000 01", is_active: true },
  ],

  /* ---- Destek ---- */
  support_tickets: [
    { id: "aaaaaaa1-0000-4000-8000-000000000001", subject: "Fatura adresi güncellenmiyor", category: "billing", priority: "high", status: "open", last_message_at: gun(-1.2), created_at: gun(-2), organization_id: K2, organizations: { name: "Ege Danışmanlık", display_name: "Ege Danışmanlık Ltd.", contact_phone: "0232 555 0202" }, support_messages: [
      { id: "m1", body: "Fatura adresimizi değiştirdik ama proformada eski adres görünüyor.", is_staff: false, created_at: gun(-2) },
      { id: "m2", body: "Merhaba, kaydı güncelliyoruz; yeni proformada doğru görünecek.", is_staff: true, created_at: gun(-1.8) },
      { id: "m3", body: "Hâlâ eski adres çıkıyor.", is_staff: false, created_at: gun(-1.2) },
    ] },
    { id: "aaaaaaa1-0000-4000-8000-000000000002", subject: "ArvoLab kullanıcı limiti", category: "account", priority: "normal", status: "waiting_customer", last_message_at: gun(-0.4), created_at: gun(-4), organization_id: K1, organizations: { name: "Akademi Yayıncılık", display_name: "Akademi Yayıncılık A.Ş.", contact_phone: "0212 555 0101" }, support_messages: [
      { id: "m4", body: "25 kullanıcıyı doldurduk, artırmak istiyoruz.", is_staff: false, created_at: gun(-4) },
      { id: "m5", body: "Paketi Kurumsal 40'a geçirebiliriz; onaylıyor musunuz?", is_staff: true, created_at: gun(-0.4) },
    ] },
    { id: "aaaaaaa1-0000-4000-8000-000000000003", subject: "Randevu bağlantısı açılmıyor", category: "technical", priority: "urgent", status: "open", last_message_at: gun(-2.6), created_at: gun(-3), organization_id: K4, organizations: { name: "Deniz Eğitim Kurumları", display_name: "Deniz Eğitim", contact_phone: "0224 555 0404" }, support_messages: [
      { id: "m6", body: "cal.arvo-os.com adresi bizde açılmıyor.", is_staff: false, created_at: gun(-3) },
    ] },
    { id: "aaaaaaa1-0000-4000-8000-000000000004", subject: "Eğitim videosu talebi", category: "other", priority: "low", status: "resolved", last_message_at: gun(-30), created_at: gun(-40), organization_id: K3, organizations: { name: "Kuzey Mimarlık", display_name: null, contact_phone: "0312 555 0303" }, support_messages: [
      { id: "m7", body: "Ekip için tanıtım videosu var mı?", is_staff: false, created_at: gun(-40) },
      { id: "m8", body: "Kılavuzda video bölümü var, bağlantıyı paylaştım.", is_staff: true, created_at: gun(-30) },
    ] },
  ],
  support_messages: [
    { ticket_id: "aaaaaaa1-0000-4000-8000-000000000001", is_staff: true, created_at: gun(-1.8) },
    { ticket_id: "aaaaaaa1-0000-4000-8000-000000000002", is_staff: true, created_at: gun(-0.4) },
    { ticket_id: "aaaaaaa1-0000-4000-8000-000000000004", is_staff: true, created_at: gun(-30) },
  ],
  platform_hazir_yanitlar: [
    { id: "h1", baslik: "Fatura adresi güncelleme", metin: "Merhaba, fatura bilgilerinizi güncelledik. Yeni proformada doğru görünecek." },
    { id: "h2", baslik: "Paket yükseltme", metin: "Paketinizi yükseltebiliriz; onayınızla birlikte yeni dönem ücreti geçerli olur." },
  ],

  /* ---- Kabuk (panel/layout.tsx) ---- */
  notifications: [],
  hr_employees: [],
  hr_confidentiality_agreements: [],
  mail_threads: [],
  user_presence: [],
  organization_modules: [
    { module_code: "crm", is_enabled: true, organization_id: ARVO, arvo_modules: { name: "Müşteri ve Satış", description: "", sort_order: 1 } },
    { module_code: "finance", is_enabled: true, organization_id: ARVO, arvo_modules: { name: "Finans", description: "", sort_order: 2 } },
    { module_code: "support", is_enabled: true, organization_id: ARVO, arvo_modules: { name: "Destek Merkezi", description: "", sort_order: 3 } },
  ],
  organization_licenses: [
    { organization_id: ARVO, license_status: "active", suspension_reason: null },
  ],
  /* Kapsam satırı YOK: kurucunun altı alanı da açık (lib/konsol-alanlari). */
  platform_kurucu_alanlari: [],
  /*
    Kullanım Sözleşmesi ONAYLI. Satır olmayınca panelin her sayfası
    tam ekran onay penceresiyle açılıyor ve altındaki ekran hiç
    görülemiyordu (lib/sozlesme/onay-durumu). Sürüm oradan okunuyor;
    sürüm GERÇEK sabitten okunuyor: elle yazılsaydı sürüm
    değiştiğinde önizleme sessizce pencereyi geri getirirdi.
  */
  sozlesme_onaylari: [
    { id: "o1", user_id: KURUCU, belge: "kullanim_sozlesmesi", surum: SOZLESME_SURUMU, onaylandi: gun(-30), ip: null, kullanici_araci: null },
  ],
  /* Ortak posta kutusu kurulu değil: kabuktaki okunmamış sayacı sıfır. */
  mail_accounts: [],
  activity_logs: [],
};

export const ORNEK_RPC: Record<string, unknown> = {
  get_my_workspaces: [
    {
      organization_id: ARVO, role: "owner", id: ARVO, name: "Arvo", slug: "arvo-os",
      status: "active", plan_code: "kurumsal", sector: "yazilim", custom_domain: null,
      logo_url: null, brand_color: null, display_name: "Arvo",
    },
  ],
};
