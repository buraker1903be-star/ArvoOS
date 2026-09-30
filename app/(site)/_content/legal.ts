// Mesafeli satış sözleşmesi, iptal-iade koşulları ve teslimat (hizmetin ifası).
//
// Bu metinler TEK BİR ÜRÜNÜN değil, Arvo'nun bütün abonelik ürünlerinin
// sözleşmesidir: ürün adları PRODUCT_APPS'ten okunur, yeni ürün eklendiğinde
// metinlere kendiliğinden girer (lib/site/routes.ts → productList).
//
// Künye alanları (telefon, vergi dairesi/numarası, MERSİS) COMPANY'de boşsa
// ilgili satır hiç yazılmaz: uydurulmuş bir künye göstermektense eksik
// göstermek doğru. Ödeme kuruluşu canlı mod incelemesinde bu alanları arar.
import { COMPANY, PRODUCT_APPS, productList, ROUTES } from "@/lib/site/routes";
import type { PrivacyContent } from "./privacy";

export const LEGAL_UPDATED = "2026-09-30";
const guncelTr = "Son güncelleme: 30 Eylül 2026";
const updatedEn = "Last updated: 30 September 2026";

/** Künyenin dolu satırları; boş alan satır üretmez. */
function kunye(locale: "tr" | "en"): string[] {
  const tr = locale === "tr";
  const satirlar: [string, string][] = [
    [tr ? "Unvan" : "Legal name", COMPANY.legalName],
    [tr ? "Adres" : "Address", COMPANY.address.display],
    [tr ? "E-posta" : "Email", COMPANY.email],
    [tr ? "Telefon" : "Phone", COMPANY.phone],
    [tr ? "Vergi dairesi" : "Tax office", COMPANY.taxOffice],
    [tr ? "Vergi numarası" : "Tax number", COMPANY.taxNumber],
    ["MERSİS", COMPANY.mersis],
  ];
  return satirlar.filter(([, deger]) => deger).map(([ad, deger]) => `${ad}: ${deger}`);
}

const urunlerTr = productList("tr");
const urunlerEn = productList("en");

/* Erişim adresleri de ürün listesinden üretilir; yeni ürün elle eklenmesin. */
const erisimSatirlari = Object.values(PRODUCT_APPS).map((u) => `${u.name}: ${u.host}`);

// ------------------------------------------------------------------
// Mesafeli satış sözleşmesi
// ------------------------------------------------------------------
export const DISTANCE_SALES_TR: PrivacyContent = {
  meta: {
    title: "Mesafeli Satış Sözleşmesi",
    description: `Arvo abonelik hizmetlerinin (${urunlerTr}) mesafeli satışına ilişkin sözleşme: taraflar, hizmetin konusu, bedel, ödeme, ifa ve cayma hakkı.`,
  },
  hero: {
    eyebrow: "Mesafeli satış", title: "Mesafeli Satış", subtitle: "Sözleşmesi",
    lead: `Bu sözleşme, Arvo'nun abonelik ile sunduğu yazılım hizmetlerinin (${urunlerTr} ve sonradan eklenecek ürünler) internet üzerinden satışına uygulanır.`,
    actions: [],
  },
  updated: guncelTr,
  sections: [
    { h: "1. Taraflar", p: ["Hizmet sağlayıcı (Satıcı):"], list: kunye("tr") },
    { h: "", p: ["Abone (Alıcı): Hizmete abone olan ve hesabı açılan gerçek veya tüzel kişi. Alıcı, abonelik sırasında verdiği bilgilerin doğru ve güncel olduğunu kabul eder."] },
    { h: "2. Sözleşmenin konusu", p: [
      `Sözleşmenin konusu, Alıcı'nın Satıcı'ya ait ${urunlerTr} ürünlerinden birine veya birkaçına internet üzerinden abone olması ve tarafların 6502 sayılı Tüketicinin Korunması Hakkında Kanun ile Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca hak ve yükümlülükleridir.`,
      "Hizmetler bulut tabanlıdır; kurulum gerektirmez ve tarayıcı üzerinden kullanılır. Fiziksel bir ürün teslimi söz konusu değildir.",
    ] },
    { h: "3. Hizmetin niteliği ve kapsamı", list: [
      "Abonelik, seçilen ürün ve pakete göre tanımlanan modülleri ve kullanıcı sayısını kapsar.",
      `Paket içerikleri, dahil olan kullanıcı / şube / mağaza / ürün sayıları ve güncel liste ücretleri {ROUTES.pricing.tr} sayfasında ve panel içindeki abonelik ekranında gösterilir.`,
      "Satıcı, hizmeti geliştirmek amacıyla özelliklerde değişiklik yapabilir; abonenin kullanımını esaslı biçimde kısıtlayan değişiklikler 5. maddedeki bildirim süresine tabidir.",
    ] },
    { h: "4. Bedel ve ödeme", list: [
      `Abonelik bedeli, ${ROUTES.pricing.tr} sayfasında yayımlanan liste fiyatıdır; kuruma özel kapsamlarda (teklif usulü basamaklar) teklifte belirtilen bedeldir.`,
      "Bedel Türk lirası üzerindendir ve liste fiyatlarına KDV dâhil değildir; faturada yürürlükteki oranda KDV eklenir.",
      "Aylık abonelikte bedel her dönemin başında faturalanır. Yıllık abonelikte 12 (on iki) aylık kullanım için 10 (on) aylık bedel, dönemin başında tek seferde faturalanır.",
      "Pakette dahil olan kullanıcı, şube, mağaza ve ürün sayıları aşıldığında yalnızca aynı sayfada yayımlanan ek kalem ücretleri uygulanır; paket bedeli kendiliğinden değişmez.",
      "Ödeme, Satıcı'nın anlaşmalı ödeme kuruluşu üzerinden kredi/banka kartı ile veya havale/EFT ile yapılır. Kart bilgileri Satıcı tarafından saklanmaz.",
      "Otomatik yenilenen bir çekim yapılmaz; her dönem için ödeme bağlantısı abonenin onayıyla kullanılır.",
      "Ödeme alınamadığında Satıcı, hizmeti askıya alma hakkını saklı tutar; askı öncesinde abone bilgilendirilir.",
    ] },
    /*
      Fiyat değişikliği kuralı 30.09.2026'da eklendi: liste fiyatları
      yayımlandığı an "fiyat ne zaman, nasıl değişir" sorusunun cevabı
      sözleşmede yazılı olmak zorunda. Yürürlükteki dönemin korunması ve
      30 gün önceden bildirim, aboneye zam karşısında iptal hakkı bırakır.
    */
    { h: "5. Fiyat ve paket değişikliği", list: [
      "Satıcı liste fiyatlarını güncelleyebilir. Fiyat değişikliği, abonenin yürürlükteki (ödenmiş) dönemini etkilemez.",
      "Değişiklik, abonenin kayıtlı e-posta adresine en az 30 (otuz) gün önce bildirilir ve yalnızca bildirimden sonra başlayan dönemde uygulanır. Abone yeni bedeli kabul etmezse, dönem sonunda aboneliğini iptal edebilir.",
      "Paket yükseltmesi talep edildiği gün yürürlüğe girer; yalnızca dönemin kalan günlerine karşılık gelen fark tahsil edilir.",
      "Paket düşürmesi, içinde bulunulan dönemin sonunda yürürlüğe girer; başlamış dönem için iade doğmaz.",
    ] },
    { h: "6. İfa ve hizmetin başlangıcı", p: [
      "Ödemenin onaylanmasının ardından hesap en geç 1 (bir) iş günü içinde kullanıma açılır; çoğu durumda açılış anında gerçekleşir. Hizmetin ifası, hesabın kullanıma açılmasıyla başlar.",
      `Ayrıntı için ${ROUTES.delivery.tr} sayfasına bakınız.`,
    ] },
    { h: "7. Cayma hakkı", p: [
      "Alıcı, sözleşmenin kurulduğu tarihten itibaren 14 (on dört) gün içinde gerekçe göstermeksizin cayma hakkına sahiptir.",
      "Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca, elektronik ortamda anında ifa edilen hizmetlerde cayma hakkı, Alıcı'nın onayıyla ifaya başlanmışsa kullanılamaz. Abone, hesabın hemen açılmasını talep ederek ifanın başlamasına onay verdiğinde bu istisna uygulanır.",
      "Cayma hakkının kullanılabildiği hâllerde talep, e-posta ile iletilir ve tahsil edilen bedel 14 gün içinde aynı ödeme aracına iade edilir.",
    ] },
    { h: "8. İptal ve iade", p: [`Abonelik iptali ve iade koşulları ${ROUTES.refund.tr} sayfasında ayrıca düzenlenmiştir ve bu sözleşmenin ayrılmaz parçasıdır.`] },
    { h: "9. Abonenin yükümlülükleri", list: [
      "Hesap bilgilerinin ve kullanıcı erişimlerinin güvenliğini sağlamak.",
      "Hizmeti mevzuata aykırı, üçüncü kişilerin haklarını ihlal eden veya sistemin işleyişini bozan biçimde kullanmamak.",
      "Sisteme yüklediği verilerin toplanması ve işlenmesi bakımından gerekli hukuki dayanağa sahip olmak.",
    ] },
    { h: "10. Veri ve gizlilik", p: [
      `Abonenin sisteme girdiği veriler abonenin kendisine aittir. Kişisel verilerin işlenmesine ilişkin esaslar ${ROUTES.privacy.tr} sayfasındaki aydınlatma metninde açıklanmıştır.`,
      "Abonelik sona erdiğinde veriler, mevzuatın öngördüğü saklama süreleri saklı kalmak üzere, abonenin talebi üzerine dışa aktarılır ve silinir.",
    ] },
    { h: "11. Sorumluluk", p: [
      "Satıcı, hizmeti makul özen ve teknik yeterlilikle sunar; kesintisiz ve hatasız çalışacağını taahhüt etmez. Planlı bakımlar önceden duyurulur.",
      "Satıcı'nın sorumluluğu, her hâlükârda ilgili abonenin son 12 (on iki) ayda ödediği abonelik bedeliyle sınırlıdır. Dolaylı zararlardan ve kâr kaybından sorumluluk kabul edilmez.",
    ] },
    { h: "12. Sözleşmenin süresi ve feshi", p: [
      "Sözleşme, abonelik devam ettiği sürece yürürlüktedir. Taraflar, dönem sonunda bildirimle sözleşmeyi sona erdirebilir.",
      "Abonenin bu sözleşmeye esaslı aykırılığı hâlinde Satıcı, bildirimde bulunarak sözleşmeyi feshedebilir.",
    ] },
    { h: "13. Uyuşmazlık", p: [
      "Uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar çerçevesinde Alıcı'nın veya Satıcı'nın yerleşim yerindeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir.",
      "Alıcı'nın tüketici sıfatını taşımadığı hâllerde İstanbul mahkemeleri ve icra daireleri yetkilidir.",
    ] },
    { h: "14. Yürürlük", p: ["Alıcı, abonelik adımında bu sözleşmeyi okuduğunu ve kabul ettiğini beyan eder. Sözleşme, elektronik ortamda onaylandığı anda yürürlüğe girer."] },
  ],
};

export const DISTANCE_SALES_EN: PrivacyContent = {
  meta: {
    title: "Distance Sales Agreement",
    description: `Agreement for the distance sale of Arvo subscription services (${urunlerEn}): parties, scope, price, payment, performance and withdrawal.`,
  },
  hero: {
    eyebrow: "Distance sales", title: "Distance Sales", subtitle: "Agreement",
    lead: `This agreement applies to the online sale of Arvo's subscription software services (${urunlerEn} and products added later).`,
    actions: [],
  },
  updated: updatedEn,
  sections: [
    { h: "1. Parties", p: ["Service provider (Seller):"], list: kunye("en") },
    { h: "", p: ["Subscriber (Buyer): the natural or legal person who subscribes and for whom an account is opened."] },
    { h: "2. Subject", p: [`Subscription to one or more of ${urunlerEn}, and the parties' rights and obligations under Turkish Consumer Protection Law no. 6502 and the Distance Contracts Regulation. The services are cloud-based and used in a browser; no physical goods are delivered.`] },
    { h: "3. Price and payment", list: [
      `The subscription fee is the list price published at ${ROUTES.pricing.en}; for scoped (quote-based) tiers it is the amount stated in the offer.`,
      "Amounts are in Turkish lira and exclude VAT; VAT is added on the invoice at the rate in force.",
      "Monthly subscriptions are invoiced at the start of each period. Annual subscriptions are invoiced once at the start of the 12-month period, for 10 months of fees.",
      "Where a plan's included users, branches, stores or products are exceeded, only the add-on fees published on the same page apply; the plan fee itself does not change.",
      "Payment is made by credit/debit card through the Seller's payment provider, or by bank transfer. Card details are not stored by the Seller.",
      "There is no automatic recurring charge; each period is paid through a link the subscriber approves.",
    ] },
    { h: "4. Price and plan changes", list: [
      "The Seller may update list prices. A price change does not affect the subscriber's current (paid) period.",
      "Changes are announced to the subscriber's registered email address at least 30 days in advance and apply only from the period starting after that notice. A subscriber who does not accept the new fee may cancel at the end of the period.",
      "An upgrade takes effect on the day it is requested; only the difference for the remaining days of the period is charged.",
      "A downgrade takes effect at the end of the current period; no refund arises for a period already started.",
    ] },
    { h: "5. Performance", p: [`The account is made available within one business day after payment is confirmed, usually immediately. See ${ROUTES.delivery.en}.`] },
    { h: "6. Right of withdrawal", p: [
      "The Buyer may withdraw within 14 days without giving a reason.",
      "Under Article 15/1-(ğ) of the Distance Contracts Regulation, the right of withdrawal does not apply to services performed instantly in electronic form once performance has begun with the Buyer's consent — which is the case when the account is opened immediately at the subscriber's request.",
    ] },
    { h: "7. Cancellation and refund", p: [`Set out separately at ${ROUTES.refund.en}, forming an integral part of this agreement.`] },
    { h: "8. Data and privacy", p: [`Data entered by the subscriber belongs to the subscriber. Personal data processing is explained at ${ROUTES.privacy.en}.`] },
    { h: "9. Liability", p: ["The Seller provides the service with reasonable care but does not warrant uninterrupted or error-free operation. Liability is limited to the subscription fees paid in the last 12 months."] },
    { h: "10. Governing law and disputes", p: ["Turkish law applies. Consumer arbitration committees and consumer courts are competent within the monetary limits announced by the Ministry of Trade; otherwise the courts of İstanbul."] },
  ],
};

// ------------------------------------------------------------------
// İptal ve iade koşulları
// ------------------------------------------------------------------
export const REFUND_TR: PrivacyContent = {
  meta: {
    title: "İptal ve İade Koşulları",
    description: "Arvo abonelik hizmetlerinde iptal, cayma ve iade koşulları; deneme süresi, dönem sonu ve hatalı tahsilat.",
  },
  hero: {
    eyebrow: "İptal ve iade", title: "İptal ve İade", subtitle: "Koşulları",
    lead: `Bu koşullar, Arvo'nun abonelik ürünlerinde (${urunlerTr} ve sonradan eklenecek ürünler) iptal ve iade süreçlerini açıklar.`,
    actions: [],
  },
  updated: guncelTr,
  sections: [
    { h: "1. Aboneliğin iptali", list: [
      "Abonelik, panel içindeki abonelik ekranından ya da " + COMPANY.email + " adresine yazılı bildirimle iptal edilebilir.",
      "İptal, içinde bulunulan ödenmiş dönemin sonunda yürürlüğe girer; dönem sonuna kadar hizmet kullanılmaya devam eder.",
      "İptal sonrasında otomatik bir çekim yapılmaz; yeni dönem için ödeme bağlantısı gönderilmez.",
      "Yıllık abonelikte dönem 12 aydır; yıl dolmadan yapılan iptalde 5. maddedeki hesaplama uygulanır.",
    ] },
    { h: "2. Deneme süresi", p: ["Deneme süresi ücretsizdir ve sonunda kendiliğinden ücrete dönüşmez. Deneme bitiminde ödeme yapılmazsa hesap yalnızca kapanır; herhangi bir tahsilat yapılmaz."] },
    { h: "3. Cayma hakkı", p: [
      "Tüketici sıfatını taşıyan aboneler, sözleşmenin kurulmasından itibaren 14 gün içinde cayma hakkına sahiptir.",
      "Hizmet, abonenin talebiyle anında kullanıma açıldığında — yani ifaya başlandığında — Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca cayma hakkı sona erer. Bu durum abonelik adımında ayrıca belirtilir.",
    ] },
    { h: "4. İade", list: [
      "Cayma hakkının geçerli olduğu hâllerde tahsil edilen bedel, talebin ulaşmasından itibaren 14 gün içinde iade edilir.",
      "İade, ödemenin yapıldığı yöntemle ve aynı karta/hesaba yapılır; abone için ek bir masraf doğmaz.",
      "Aylık abonelikte kullanılmış dönemler için kısmi iade yapılmaz; başlamış ayın bedeli iade edilmez ve hizmet dönem sonuna kadar açık kalır.",
      "Yıllık abonelikte erken iptal 5. maddeye göre hesaplanır; peşin ödenen bedelin kullanılmayan kısmı abonede kalmaz, iade edilir.",
    ] },
    /*
      Yıllık peşin tahsilatın erken iptalinde ne olacağı 30.09.2026'da
      yazıldı. "Başlamış dönem iade edilmez" kuralı aylık abonelikte
      bir aylık bedel demekti; yıllık listeyle birlikte aynı cümle
      11 ayın iadesiz kalması anlamına gelirdi — tüketici karşısında
      savunulabilir değil. Kullanılan aylar AYLIK liste fiyatından
      hesaplanır: yıllık indirim yalnızca kullanılmayan aylar için
      geri alınır.
    */
    { h: "5. Yıllık abonelikte erken iptal", list: [
      "Yıllık abonelik peşin ödenir: 12 aylık kullanım için 10 aylık bedel tahsil edilir.",
      "Abone yıl dolmadan iptal ederse, hizmetin açık kaldığı aylar aylık liste fiyatı üzerinden yeniden hesaplanır. Tahsil edilen bedelden bu tutar düşülür ve kalan bakiye iade edilir. Başlamış ay tam ay sayılır.",
      "Hesap sonucu sıfırın altına inemez: kullanılan ayların aylık liste bedeli, peşin ödenen tutarı aşarsa abone ek bir ödeme yapmaz; yalnızca iade doğmaz.",
      "İade, talebin ulaşmasından itibaren 14 gün içinde ödemenin yapıldığı yöntemle gerçekleştirilir.",
    ] },
    { h: "6. Paket değişikliği", list: [
      "Paket yükseltmesi talep edildiği gün yürürlüğe girer; yalnızca dönemin kalan günlerine karşılık gelen fark tahsil edilir, iade doğmaz.",
      "Paket düşürmesi, içinde bulunulan dönemin sonunda yürürlüğe girer; başlamış dönem için iade yapılmaz.",
      "Bir üründen tamamen çıkılması hâlinde, o üründe yıllık abonelik varsa 5. maddedeki hesaplama uygulanır.",
    ] },
    { h: "7. Hatalı veya mükerrer tahsilat", p: [
      `Yanlışlıkla ya da iki kez yapılan tahsilatlar, tespit edilmesi hâlinde herhangi bir koşula bağlı olmaksızın iade edilir. Bildirim: ${COMPANY.email}.`,
      "Bankaya bağlı olarak iade tutarının karta yansıması birkaç iş günü sürebilir.",
    ] },
    { h: "8. Arvo kaynaklı kesinti", p: ["Hizmetin Arvo'dan kaynaklanan bir nedenle uzun süre kullanılamaması hâlinde, kullanılamayan süreye karşılık gelen bedel abonenin talebi üzerine iade edilir ya da sonraki döneme mahsup edilir."] },
    { h: "9. Verilerin dışa aktarılması", p: ["Abonelik sona erdiğinde abone, verilerinin dışa aktarılmasını talep edebilir. Talep, mevzuatın öngördüğü saklama yükümlülükleri saklı kalmak üzere karşılanır ve ardından veriler silinir."] },
    { h: "10. İletişim", p: [`İptal ve iade talepleri: ${COMPANY.email}${COMPANY.phone ? ` · ${COMPANY.phone}` : ""} · ${COMPANY.address.display}`] },
  ],
};

export const REFUND_EN: PrivacyContent = {
  meta: {
    title: "Cancellation and Refund Policy",
    description: "Cancellation, withdrawal and refund terms for Arvo subscription services, including trials, period ends and incorrect charges.",
  },
  hero: {
    eyebrow: "Cancellation", title: "Cancellation and", subtitle: "Refund Policy",
    lead: `How cancellations and refunds work across Arvo's subscription products (${urunlerEn} and products added later).`,
    actions: [],
  },
  updated: updatedEn,
  sections: [
    { h: "1. Cancelling a subscription", list: [
      `Subscriptions can be cancelled from the panel or by writing to ${COMPANY.email}.`,
      "Cancellation takes effect at the end of the paid period; the service stays available until then.",
      "No automatic charge is taken after cancellation.",
      "An annual subscription runs for 12 months; cancelling before the year is out is settled under section 5.",
    ] },
    { h: "2. Trials", p: ["Trials are free and do not convert into a paid subscription automatically. If no payment is made, the account simply closes."] },
    { h: "3. Right of withdrawal", p: ["Consumers may withdraw within 14 days. Where the account is opened immediately at the subscriber's request, performance has begun and the right of withdrawal no longer applies (Distance Contracts Regulation, Art. 15/1-(ğ))."] },
    { h: "4. Refunds", list: [
      "Where withdrawal applies, the amount is refunded within 14 days to the original payment method.",
      "On monthly subscriptions, partial refunds are not made for a period already started; the service remains available until the end of that period.",
      "On annual subscriptions, early cancellation is settled under section 5; the unused part of the prepaid amount is refunded.",
    ] },
    { h: "5. Cancelling an annual plan early", list: [
      "An annual subscription is paid up front: 10 months of fees for 12 months of use.",
      "If the subscriber cancels before the year is out, the months the service stayed available are recalculated at the monthly list price. That amount is deducted from what was paid and the remaining balance is refunded. A month already started counts as a full month.",
      "The calculation cannot go below zero: if the monthly-rate value of the months used exceeds the prepaid amount, the subscriber owes nothing further — there is simply no refund.",
      "Refunds are made within 14 days of the request, to the original payment method.",
    ] },
    { h: "6. Plan changes", list: [
      "An upgrade takes effect on the day it is requested; only the difference for the remaining days of the period is charged and no refund arises.",
      "A downgrade takes effect at the end of the current period; no refund is made for a period already started.",
      "If a product is dropped entirely and it was on an annual plan, section 5 applies.",
    ] },
    { h: "7. Incorrect or duplicate charges", p: [`Refunded in full once identified, without conditions. Contact: ${COMPANY.email}.`] },
    { h: "8. Outages caused by Arvo", p: ["If the service is unavailable for an extended period due to Arvo, the corresponding amount is refunded or credited to the next period on request."] },
  ],
};

// ------------------------------------------------------------------
// Teslimat / hizmetin ifası
// ------------------------------------------------------------------
export const DELIVERY_TR: PrivacyContent = {
  meta: {
    title: "Teslimat ve Hizmetin İfası",
    description: "Arvo abonelik hizmetlerinde hesabın ne zaman açıldığı, erişimin nasıl sağlandığı ve fiziksel teslimat olmadığı hakkında bilgi.",
  },
  hero: {
    eyebrow: "Teslimat", title: "Teslimat ve", subtitle: "Hizmetin İfası",
    lead: `Arvo ürünleri (${urunlerTr} ve sonradan eklenecek ürünler) bulut tabanlıdır: fiziksel teslimat yoktur, hizmet hesabın kullanıma açılmasıyla ifa edilir.`,
    actions: [],
  },
  updated: guncelTr,
  sections: [
    { h: "1. Fiziksel teslimat yoktur", p: ["Satışa konu hizmetler dijitaldir. Kargo, teslimat ücreti veya teslim adresi söz konusu değildir; hizmet internet üzerinden sunulur."] },
    { h: "2. Hesabın açılma süresi", list: [
      "Ödeme onaylandıktan sonra hesap en geç 1 (bir) iş günü içinde kullanıma açılır; çoğu durumda açılış anında gerçekleşir.",
      "Kurumsal kurulum (kullanıcıların tanımlanması, modül ayarları, veri aktarımı) gerektiren durumlarda süre teklifte ayrıca belirtilir.",
      "Hesap açıldığında yetkili kullanıcıya e-posta ile giriş bağlantısı ve şifre belirleme adımı gönderilir.",
    ] },
    { h: "3. Erişim adresleri", p: ["Hizmete tarayıcıdan aşağıdaki adreslerden erişilir:"], list: erisimSatirlari },
    { h: "4. Kullanım koşulları", p: [
      "Hizmet, güncel bir tarayıcı ve internet bağlantısı ile kullanılır; kurulum gerektirmez.",
      "Planlı bakımlar önceden duyurulur ve mümkün olduğunca mesai dışına alınır.",
    ] },
    { h: "5. Sorun bildirimi", p: [`Hesabınız zamanında açılmadıysa ya da erişimde sorun yaşıyorsanız ${COMPANY.email}${COMPANY.phone ? ` veya ${COMPANY.phone}` : ""} üzerinden bize ulaşın.`] },
  ],
};

export const DELIVERY_EN: PrivacyContent = {
  meta: {
    title: "Delivery and Performance",
    description: "When accounts are opened, how access is provided, and why there is no physical delivery for Arvo subscription services.",
  },
  hero: {
    eyebrow: "Delivery", title: "Delivery and", subtitle: "Performance",
    lead: `Arvo products (${urunlerEn} and products added later) are cloud-based: there is no physical delivery; the service is performed when the account is made available.`,
    actions: [],
  },
  updated: updatedEn,
  sections: [
    { h: "1. No physical delivery", p: ["The services sold are digital. There is no shipping, delivery fee or delivery address; the service is provided over the internet."] },
    { h: "2. When the account opens", list: [
      "Within one business day after payment is confirmed, usually immediately.",
      "Where setup work is agreed (users, module settings, data migration), the timeline is stated in the offer.",
      "The authorised user receives a sign-in link and a password setup step by email.",
    ] },
    { h: "3. Access addresses", p: ["The services are used in a browser at:"], list: erisimSatirlari },
    { h: "4. Requirements", p: ["A current browser and an internet connection; nothing to install. Planned maintenance is announced in advance."] },
    { h: "5. Problems", p: [`If your account is not opened on time or you cannot sign in, contact ${COMPANY.email}.`] },
  ],
};
