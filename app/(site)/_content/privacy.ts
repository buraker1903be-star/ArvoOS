// Gizlilik ve KVKK Aydınlatma Metni (web sitesi + demo formu) — tip + Türkçe.
// Form alanları ve IP özeti app/_site/lead-actions.ts ile uyumludur.
import { COMPANY } from "@/lib/site/routes";
import type { Hero, Meta } from "./types";

export type PrivacyContent = {
  meta: Meta; hero: Hero; updated: string;
  sections: { h: string; p?: string[]; list?: string[] }[];
};

export const PRIVACY_UPDATED = "2026-09-13";

export const PRIVACY_TR: PrivacyContent = {
  meta: { title: "Gizlilik ve KVKK Aydınlatma Metni", description: "arvo-os.com web sitesi ve demo / iletişim formu kapsamında kişisel verilerin 6698 sayılı KVKK uyarınca nasıl işlendiğine dair aydınlatma metni." },
  hero: {
    eyebrow: "Gizlilik", title: "Gizlilik ve KVKK", subtitle: "Aydınlatma Metni",
    lead: "Bu metin, arvo-os.com web sitesini ziyaret ettiğinizde ve demo / iletişim formunu kullandığınızda kişisel verilerinizin 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca nasıl işlendiğini açıklar.",
    actions: [],
  },
  updated: "Son güncelleme: 28 Ekim 2026",
  sections: [
    { h: "1. Veri sorumlusu", p: [`Veri sorumlusu ${COMPANY.legalName}’dir (“ArvoOS”). Adres: ${COMPANY.address.display}. E-posta: ${COMPANY.email}.`] },
    { h: "2. İşlenen kişisel veriler", p: ["Demo / iletişim formunu gönderdiğinizde:"], list: [
      "Kimlik ve iletişim: ad soyad, e-posta adresi, telefon numarası, kurum adı (kurum ve telefon isteğe bağlıdır).",
      "Talep bilgileri: ilgilendiğiniz ürün veya hizmet, mesajınız, formun gönderildiği sayfa ve dil.",
      "Onay kaydı: Aydınlatma Metni’ni okuduğunuza ilişkin işaretleme.",
      "Güvenlik: kötüye kullanımı önlemek için IP adresinizin günlük olarak değişen, tek yönlü şifrelenmiş özeti. Ham IP adresi saklanmaz.",
    ] },
    { h: "3. İşleme amaçları", list: [
      "Demo, erişim, bilgi ve proje taleplerinizi almak, değerlendirmek ve size dönüş yapmak",
      "Talep ettiğiniz durumda teklif ve sözleşme süreçlerini başlatmak",
      "Formun otomatik ve kötü amaçlı gönderimlere karşı korunması, bilgi güvenliğinin sağlanması",
      "Mevzuattan doğan yükümlülüklerin yerine getirilmesi",
    ] },
    { h: "4. Hukuki sebepler", p: ["Kişisel verileriniz KVKK m.5/2 kapsamında şu hukuki sebeplere dayanılarak işlenir:"], list: [
      "(c) Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması — talebinizin yanıtlanması, demo ve teklif hazırlığı",
      "(f) İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati — form güvenliği ve talep yönetimi",
      "(ç) Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi",
    ] },
    { h: "5. Toplama yöntemi", p: ["Veriler, web sitesindeki form aracılığıyla elektronik ortamda sizden ve form gönderimi sırasında tarayıcınızdan otomatik olarak toplanır. Talebiniz, kendi ArvoOS panelimizde müşteri talebi olarak kaydedilir."] },
    { h: "6. Aktarım", p: [
      "Kişisel verileriniz satılmaz ve pazarlama amacıyla üçüncü kişilerle paylaşılmaz.",
      "Veriler, web sitesinin ve panelin barındırıldığı bulut altyapı ve veritabanı hizmet sağlayıcılarının sunucularında saklanır; bu sunucular yurt dışında bulunabilir. Bu aktarım KVKK m.9’a uygun olarak gerçekleştirilir. Yetkili kamu kurum ve kuruluşlarına ise yalnızca mevzuatın gerektirdiği hallerde aktarım yapılabilir.",
    ] },
    { h: "7. Saklama süresi", p: ["Form verileri, talebinizin değerlendirilmesi ve olası iş ilişkisinin yürütülmesi için gerekli süre ile ilgili mevzuatta öngörülen süreler boyunca saklanır; süre sona erdiğinde silinir, yok edilir veya anonim hale getirilir. Güvenlik amaçlı IP özetleri kısa süre (birkaç gün) içinde otomatik olarak silinir."] },
    { h: "8. Çerezler", p: ["Bu web sitesi reklam, analiz veya profilleme amaçlı çerez ya da izleme aracı kullanmaz. Yalnızca sitenin güvenli çalışması için gerekli olabilecek teknik çerezler ve seçtiğiniz dili hatırlayan bir tercih çerezi (arvo_site_dil, bir yıl) kullanılır."] },
    { h: "9. KVKK m.11 kapsamındaki haklarınız", p: ["Veri sorumlusuna başvurarak:"], list: [
      "Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme",
      "İşlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme",
      "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme",
      "Eksik veya yanlış işlenmişse düzeltilmesini isteme",
      "KVKK m.7’deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme",
      "Düzeltme, silme ve yok etme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme",
      "Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme",
      "Kanuna aykırı işleme sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme",
    ] },
    { h: "10. Başvuru", p: [`Haklarınıza ilişkin taleplerinizi ${COMPANY.email} adresine e-posta ile veya ${COMPANY.address.display} adresine yazılı olarak iletebilirsiniz. Başvurular, niteliğine göre en geç otuz gün içinde ücretsiz olarak sonuçlandırılır (KVKK m.13).`] },
    { h: "11. Avrupa Ekonomik Alanı ve Birleşik Krallık'taki ziyaretçiler (GDPR)", p: [
      "AEA'da ya da Birleşik Krallık'ta bulunuyorsanız ve size hizmet sunuyorsak, kişisel verileriniz ayrıca Genel Veri Koruma Tüzüğü (AB) 2016/679 (GDPR) ve Birleşik Krallık GDPR kapsamında işlenir. Veri sorumlusu yukarıda 1. bölümde yazılı olan ArvoOS'tur.",
      "Hukuki sebepler (GDPR m.6/1): talebinize yanıt vermek ve demo ile teklif hazırlamak için sözleşme öncesi adımlar (b), form güvenliği ve talep yönetimi için meşru menfaat (f), yasal yükümlülükler için (c).",
      "Verileriniz Türkiye'de ve barındırma sağlayıcılarının AEA dışındaki sunucularında işlenebilir. Bu aktarımlarda dayanılan güvenceler hakkında bilgi almak için bize yazabilirsiniz. Başvurularınızı 10. bölümdeki kanallardan iletebilirsiniz; GDPR kapsamındaki başvurular bir ay içinde yanıtlanır.",
      "GDPR kapsamındaki haklarınız:",
    ], list: [
      "Verilerinize erişim ve bir kopyasını alma (m.15)",
      "Yanlış verilerin düzeltilmesi (m.16) ve silinmesi (m.17)",
      "İşlemenin kısıtlanması (m.18)",
      "Veri taşınabilirliği (m.20)",
      "Meşru menfaate dayanan işlemeye itiraz (m.21)",
      "Yaşadığınız ya da çalıştığınız AEA ülkesindeki veri koruma denetim makamına, Birleşik Krallık'ta ise Information Commissioner's Office'e (ICO) şikâyet",
    ] },
    { h: "12. Değişiklikler", p: ["Bu metin gerektiğinde güncellenebilir; güncel sürüm her zaman bu sayfada yayımlanır."] },
  ],
};
