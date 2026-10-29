/*
  ARVOOS KULLANIM SÖZLEŞMESİ (29.10.2026, kurum sahibinin isteği).

  ArvoLab'daki sözleşmenin (ArvoLab lib/sozlesme/kullanim-sozlesmesi.ts)
  ArvoOS'taki karşılığı. Amaç aynı: kullanıcının sözleşmeyi gördüğünü,
  sonuna kadar okuduğunu ve onayladığını sonradan bir itirazda delil
  olarak gösterebilmek. Onay penceresi (app/panel/sozlesme-onayi.tsx)
  metni kaydırılabilir bir kutuda gösterir; düğme ancak sona gelince
  etkinleşir. Onay; sürüm, metnin SHA-256 özeti, zaman, IP, cihaz ve
  yaklaşık konumla değiştirilemez bir kayda yazılır (sozlesme_onaylari,
  20261029162437) ve kopyası kullanıcıya e-postayla gider.

  ArvoLab'dan FARKI: ArvoOS kurumlara satılan bir iş yazılımı. Taraflar
  Şirket, lisansı alan Kurum ve Kurum adına panele giren Kullanıcı
  (sahip, yönetici, personel). Kurumun müşteri verilerinde Kurum veri
  sorumlusu, Şirket veri işleyendir (KVKK m.12); ArvoLab'daki akademik
  dürüstlük ve asistan maddeleri burada yok, yerine müşteriyle iletişim
  (WhatsApp, e-posta, ticari ileti) ve kurumun verisinin iadesi var.

  SÜRÜM KURALI: Metinde tek bir harf değişirse SURUM da değişmeli. Özet
  metinden hesaplandığı için değişiklik kayıtta zaten görünür, ama sürüm
  değişmezse yeni metin onay istemeden yürürlüğe girmiş olur. Yeni sürüm
  yayımlanınca herkesten yeniden onay alınır.

  Şirket künyesi tek kaynaktan (lib/site/routes.ts COMPANY). Künye
  değişirse metin de değişir ve özet tutmaz: SÜRÜM artırılmalı.

  Panel Türkçe; metin yalnızca Türkçe ("dil" alanı ileride İngilizce
  panel için duruyor).

  Hukuki not: Metin sitedeki Mesafeli Satış Sözleşmesi, İptal ve İade
  Koşulları ve Gizlilik metniyle uyumlu yazıldı; yayımdan önce bir
  hukukçunun gözden geçirmesi gerekir.

  Saf modül: hem istemcide (gösterim) hem sunucuda (özet) kullanılır.
*/
import { absoluteUrl, COMPANY, pathFor } from "@/lib/site/routes";

/* 2026-10-29.2 (aynı gün): 5. madde otomatik yenilemeyi anlatıyordu; otomatik
   çekim aynı gün kapatıldı, her kartlı ödeme 3D Secure (lib/paytr-kart-akisi
   otomatikYenilemeAcik). ArvoLab'daki sürüm adlandırmasıyla aynı biçim. */
export const SOZLESME_SURUMU = "2026-10-29.2";

export type SozlesmeBolumu = { baslik: string; paragraflar: string[] };
export type SozlesmeMetni = { baslik: string; giris: string; bolumler: SozlesmeBolumu[] };

const adres = (sayfa: "distance-sales" | "refund" | "privacy") => absoluteUrl(pathFor(sayfa, "tr"));

export function kullanimSozlesmesi(): SozlesmeMetni {
  return {
    baslik: "ArvoOS Kullanım Sözleşmesi",
    giris:
      `Sürüm: ${SOZLESME_SURUMU}. Bu sözleşme, ArvoOS kurumsal yönetim yazılımının (app.arvo-os.com ve kurumların kendi alan adlarındaki paneller) kullanımına ilişkin koşulları düzenler. `
      + "Lütfen sonuna kadar okuyunuz; onay düğmesi metnin sonuna ulaştığınızda etkinleşir.",
    bolumler: [
      {
        baslik: "1. Taraflar",
        paragraflar: [
          `Hizmet sağlayıcı: ${COMPANY.legalName} ("Şirket"). Adres: ${COMPANY.address.display}. E-posta: ${COMPANY.email}. Telefon: ${COMPANY.phone}. `
            + `Vergi dairesi / no: ${COMPANY.taxOffice} / ${COMPANY.taxNumber}. MERSİS: ${COMPANY.mersis}.`,
          "Kurum: ArvoOS lisansını alan ve panelini kendi işinde kullanan gerçek ya da tüzel kişi (\"Kurum\").",
          "Kullanıcı: Kurum'un yetkilendirmesiyle panele giren gerçek kişi — Kurum Sahibi, yönetici ya da personel (\"Kullanıcı\"). Kullanıcı bu sözleşmeyi hem kendi adına hem de Kurum'un yetkilisi ise Kurum adına onaylar.",
        ],
      },
      {
        baslik: "2. Tanımlar",
        paragraflar: [
          "Platform: ArvoOS yazılımı ve ona bağlı hizmetler (CRM, teklif ve sözleşme, operasyon, finans, cari hesap, insan kaynakları, ortak posta kutusu, WhatsApp ile mesaj, müşteri portalı ve diğer modüller). "
            + "Kurum Verisi: Kurum'un ve Kullanıcılar'ın Platform'a girdiği müşteri, personel, finans ve iş kayıtları ile yüklenen dosyalar. Panel: Kurum'a ait çalışma alanı.",
        ],
      },
      {
        baslik: "3. Sözleşmenin konusu ve ekleri",
        paragraflar: [
          "Bu sözleşme, Kullanıcı'nın ve Kurum'un Platform'u kullanma koşullarını ve tarafların hak ve yükümlülüklerini düzenler.",
          `Mesafeli Satış Sözleşmesi (${adres("distance-sales")}), İptal ve İade Koşulları (${adres("refund")}) ve Kişisel Verilerin Korunması Aydınlatma Metni (${adres("privacy")}) bu sözleşmenin ayrılmaz parçasıdır. Kurum ile Şirket arasında ayrıca imzalanmış bir abonelik sözleşmesi varsa, çelişen hükümlerde o sözleşme uygulanır.`,
        ],
      },
      {
        baslik: "4. Hesap, yetki ve güvenlik",
        paragraflar: [
          "Kullanıcı hesapları Kurum tarafından açılır ve kapatılır; hangi Kullanıcı'nın hangi bölüme erişeceğini Kurum belirler. Kurum, yetkilendirdiği Kullanıcılar'ın işlemlerinden Şirket'e karşı sorumludur.",
          "Hesap kişiseldir; giriş bilgileri başkasıyla paylaşılamaz. Kullanıcı, kendi hesabı üzerinden yapılan işlemlerden sorumludur ve yetkisiz kullanımı fark ettiğinde derhâl Kurum'a ve Şirket'e bildirir.",
          "Kurum Sahibi rolündeki Kullanıcı, Kurum'un lisans, ödeme ve kullanıcı yönetimi kararlarını Kurum adına verme yetkisine sahip olduğunu beyan eder.",
        ],
      },
      {
        baslik: "5. Lisans, ücret ve ödeme",
        paragraflar: [
          "Platform, Kurum'un seçtiği paket ve ek kalemler (ör. paket sınırını aşan kullanıcılar) için aylık ya da yıllık lisans bedeli karşılığında sunulur. Bedel, dönem başında proforma ile bildirilir ve havale/EFT ya da Şirket'in anlaşmalı ödeme kuruluşu aracılığıyla kartla ödenir. Kart bilgileri Şirket tarafından saklanmaz.",
          "Kartla yapılan her ödeme 3D Secure ile, kartı çıkaran bankanın doğrulamasıyla alınır. Karttan otomatik çekim yapılmaz; her dönemin bedeli Kurum'un kendi onayıyla ödenir.",
          "Dönem bedeli ödenmezse Şirket önce hatırlatır; ödeme yapılmadıkça Panel'in kullanımı kısıtlanabilir. Kısıtlama Kurum Verisi'ni silmez; ödeme, giriş ve destek yolları açık kalır.",
        ],
      },
      {
        baslik: "6. Cayma hakkı ve iade",
        paragraflar: [
          "Kurum'un tacir ya da kamu tüzel kişisi olarak işlem yaptığı hâllerde tüketici mevzuatındaki cayma hakkı uygulanmaz. Tüketici sıfatıyla işlem yapan Kurum bakımından, Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca elektronik ortamda anında ifa edilen hizmetlerde, ifaya onayla başlanmışsa cayma hakkı kullanılamaz.",
          "İade talepleri İptal ve İade Koşulları'na göre değerlendirilir.",
        ],
      },
      {
        baslik: "7. Kurum Verisi ve kişisel verilerin korunması",
        paragraflar: [
          "Kurum Verisi Kurum'a aittir. Şirket, Kurum Verisi'ni yalnızca Hizmet'i sunmak, güvenliğini sağlamak ve Kurum'un talimatlarını yerine getirmek amacıyla işler; Kurum'un izni olmadan üçüncü kişilerle paylaşmaz ve kendi amaçları için kullanmaz.",
          "Kurum'un müşterilerine ve personeline ait kişisel veriler bakımından Kurum veri sorumlusu, Şirket veri işleyendir (6698 sayılı Kanun m.12). Kurum; ilgili kişileri aydınlatmaktan, gereken açık rızaları almaktan ve veriyi hukuka uygun biçimde Platform'a girmekten sorumludur.",
          "Kullanıcı'nın kendi kişisel verileri (hesap, giriş ve işlem kayıtları) Aydınlatma Metni'ne uygun olarak işlenir.",
        ],
      },
      {
        baslik: "8. Müşteriyle iletişim",
        paragraflar: [
          "Platform üzerinden gönderilen e-posta, WhatsApp ve diğer iletilerin içeriğinden ve alıcının izninden Kurum sorumludur. Ticari elektronik iletiler 6563 sayılı Kanun ve İleti Yönetim Sistemi kurallarına; WhatsApp iletileri Meta'nın kurallarına (işletmenin başlattığı iletilerin onaylı şablonla gönderilmesi dâhil) uygun gönderilir.",
          "Müşteriye gönderilen teklif ve sözleşmelerin içeriği ve hukuki sonuçları Kurum'a aittir; Platform bu belgeleri oluşturma ve imzalatma aracıdır.",
        ],
      },
      {
        baslik: "9. Fikri mülkiyet",
        paragraflar: [
          "Platform'un yazılımı, tasarımı, markası ve belgeleri (Kurum Verisi hariç) Şirket'e aittir; izinsiz kopyalanamaz, çoğaltılamaz, kiralanamaz ve tersine mühendislik yapılamaz. Kurum'a verilen hak, lisans süresince ve kendi işinde kullanımla sınırlı, devredilemez bir kullanım hakkıdır.",
          "Kurum'un yüklediği logo, marka ve belgeler Kurum'a aittir; Şirket'e yalnızca Hizmet'in sunulması için kullanım izni verilir.",
        ],
      },
      {
        baslik: "10. Yasaklı kullanımlar",
        paragraflar: [
          "Platform mevzuata aykırı amaçlarla, izinsiz toplu ileti göndermek için, sistemin güvenliğini ve işleyişini bozacak biçimde, otomatik araçlarla aşırı yük oluşturarak, başka bir kurumun ya da kişinin verisine yetkisiz erişmek için ya da Şirket'in hizmetiyle rekabet eden bir ürün geliştirmek amacıyla kullanılamaz.",
          "Bu yasaklara aykırılık hâlinde Şirket, ilgili hesabı ya da Panel'i askıya alma veya sözleşmeyi feshetme hakkına sahiptir.",
        ],
      },
      {
        baslik: "11. Hizmetin sürekliliği ve değişiklikler",
        paragraflar: [
          "Şirket, hizmeti makul özen ve teknik yeterlilikle sunar; kesintisiz ve hatasız çalışacağını taahhüt etmez. Planlı bakımlar mümkün olduğunca önceden duyurulur.",
          "Şirket, Platform'un özelliklerini geliştirmek amacıyla değiştirebilir; Kurum'un ödediği dönem içinde paketin temel işlevlerini kaldırmaz.",
        ],
      },
      {
        baslik: "12. Sorumluluğun sınırı",
        paragraflar: [
          "Emredici hükümler saklı kalmak kaydıyla, Şirket'in sorumluluğu Kurum'un son 12 (on iki) ayda ödediği lisans bedeliyle sınırlıdır. Dolaylı zararlardan, kâr ve müşteri kaybından, Kurum Verisi'nin Kurum ya da Kullanıcılar tarafından hatalı girilmesinden veya silinmesinden doğan zararlardan sorumluluk kabul edilmez.",
          "Kurum, kritik kayıtlarını dışa aktararak yedeklemekten kendisi sorumludur; Platform dışa aktarma olanakları sunar.",
        ],
      },
      {
        baslik: "13. Süre, fesih ve verinin iadesi",
        paragraflar: [
          "Sözleşme, Kullanıcı'nın hesabı açık ve Kurum'un lisansı yürürlükte kaldığı sürece geçerlidir. Kurum lisansı sona erdiğinde ya da feshedildiğinde Kurum, makul bir süre içinde Kurum Verisi'nin dışa aktarımını talep edebilir; bu sürenin sonunda veri silinir.",
          "Mevzuatın saklanmasını zorunlu tuttuğu kayıtlar (ödeme ve fatura kayıtları ile bu sözleşmenin onay kaydı) yasal süre boyunca saklanır.",
        ],
      },
      {
        baslik: "14. Delil sözleşmesi ve elektronik onay kaydı",
        paragraflar: [
          "Kullanıcı, bu sözleşmeyi onayladığı anda aşağıdaki bilgilerin kayıt altına alındığını bilir ve kabul eder: onay tarihi ve saati, sözleşmenin sürümü ve metninin özeti (SHA-256), Kullanıcı'nın hesap, ad ve e-posta bilgisi, onay anında açık olan Kurum, IP adresi, IP adresinden belirlenen yaklaşık konum (ülke, bölge, şehir ve koordinat), cihaz ve tarayıcı bilgisi, panelin açıldığı adres ve metnin sonuna kadar görüntülendiği bilgisi. Onayın bir kopyası Kullanıcı'nın e-posta adresine gönderilir.",
          "Taraflar, 6100 sayılı Hukuk Muhakemeleri Kanunu m.193 uyarınca, Şirket'in sistemlerinde tutulan bu elektronik kayıtların, e-posta yazışmalarının ve işlem kayıtlarının uyuşmazlıklarda delil teşkil edeceğini kabul eder; karşı delil sunma hakkı saklıdır.",
        ],
      },
      {
        baslik: "15. Sözleşme değişiklikleri",
        paragraflar: [
          "Şirket bu sözleşmeyi güncelleyebilir. Yeni sürüm, Platform'a bir sonraki girişte Kullanıcı'ya gösterilir ve Kullanıcı onaylayana kadar Panel'in kullanımı bu onaya bağlanır. Onaylanmayan sürüm Kullanıcı bakımından yürürlüğe girmez.",
        ],
      },
      {
        baslik: "16. Uyuşmazlıkların çözümü",
        paragraflar: [
          "Bu sözleşmeye Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda İstanbul mahkemeleri ve icra daireleri yetkilidir; tüketici sıfatını taşıyan taraflar bakımından tüketici mevzuatındaki yetki kuralları saklıdır.",
        ],
      },
      {
        baslik: "17. Yürürlük",
        paragraflar: [
          "Kullanıcı, bu metni sonuna kadar okuduğunu, anladığını ve \"Okudum ve onaylıyorum\" düğmesine basarak elektronik ortamda kabul ettiğini beyan eder. Sözleşme, onay anında yürürlüğe girer.",
        ],
      },
    ],
  };
}

/**
 * Özeti alınan, kayda geçen düz metin. Gösterilen metinle BİREBİR aynı
 * içerik: başlık, giriş ve her bölüm; satır sonlarıyla birleşik.
 */
export function sozlesmeDuzMetni(): string {
  const m = kullanimSozlesmesi();
  return [m.baslik, m.giris, ...m.bolumler.flatMap((b) => [b.baslik, ...b.paragraflar])].join("\n");
}
