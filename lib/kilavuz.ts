/*
  KULLANIM KILAVUZU — metin ve süzme kuralı (30.10.2026). Saf modül:
  sayfa (app/panel/kilavuz) yalnızca çiziyor, birim testi
  tests/unit/kilavuz.test.ts.

  NEDEN KODDA, BİR CMS'TE DEĞİL: kılavuzun en sık bozulma yolu ekranın
  değişip metnin eskimesi. Burada her bağlantı testte gerçek bir sayfaya
  karşı sınanıyor ve her yetki anahtarı katalogla karşılaştırılıyor;
  ekranı değiştiren kişi metni de aynı değişiklikte görüyor.

  YAZIM KURALI: düğme ve sekme adları EKRANDAKİ yazımıyla, tırnak
  içinde. Bir ekranı değiştirirken buradaki adı da değiştirin; kullanıcı
  kılavuzdaki kelimeyi ekranda arıyor.
*/
import { aramaAnahtari } from "@/app/panel/os/os-apps";

export type KilavuzKonusu = {
  id: string;
  baslik: string;
  /** Açıklama paragrafları. */
  metin?: string[];
  /** Sıralı adımlar ("şunu yapın, sonra şunu"). */
  adimlar?: string[];
  /** Kurallar, ipuçları, dikkat edilecekler. */
  notlar?: string[];
  baglanti?: { href: string; etiket: string };
  /** Verilirse konu yalnızca bu yetkisi olana görünür (lib/yetkiler). */
  yetki?: string;
};

export type KilavuzBolumu = {
  id: string;
  baslik: string;
  /** Dock uygulaması (panel-navigation-config anahtarı ya da "posta"); null herkes için. */
  uygulama: string | null;
  giris: string;
  konular: KilavuzKonusu[];
};

export type KilavuzErisimi = { uygulamalar: ReadonlySet<string>; yetkiler: ReadonlySet<string> };

export const KILAVUZ: KilavuzBolumu[] = [
  {
    id: "baslarken",
    baslik: "Başlarken",
    uygulama: null,
    giris: "Panel bir masaüstü gibi çalışır: altta uygulamalar (dock), üstte durum çubuğu. Her modül bir uygulamadır; kurumunuzda açık olan ve rolünüzün gördüğü uygulamalar listelenir.",
    konular: [
      {
        id: "dock",
        baslik: "Uygulamalar ve bölümler",
        metin: [
          "Alttaki çubukta CRM, Operasyon, Finans, İnsan Kaynakları gibi uygulamalar durur. Bir uygulamanın üstüne gelince (telefonda dokununca) bölümleri açılır: ör. CRM → Genel Bakış, Talepler, Teklifler, Sözleşmeler, Takvim.",
          "WhatsApp, Posta ve Mesajlar gibi gün içinde gidip gelinen ekranlar \"Tüm uygulamalar\" içindedir.",
        ],
        notlar: ["Bir uygulamayı ya da bölümü göremiyorsanız kurumunuzda kapalıdır ya da rolünüzün yetkisi yoktur; yetkiyi Kurum Sahibi veya Yönetici Ayarlar → Yetkilendirme'den açar."],
      },
      {
        id: "arama",
        baslik: "Hızlı arama (Ctrl+K)",
        metin: ["Klavyede Ctrl+K (Mac'te ⌘K) ya da üst çubuktaki arama kutusu: uygulamalar, bölümler ve komutlar tek kutuda. Yazdığınız kelimeyle Türkçe harf farkı gözetmeden arar; \"sozlesme\" yazmak \"Sözleşmeler\"i bulur."],
      },
      {
        id: "ust-cubuk",
        baslik: "Üst çubuk: bildirimler, mesajlar, hesap",
        metin: [
          "Üst çubukta açık olan uygulama, çevrimiçi ekip arkadaşlarınız, mesajlar ve bildirimler görünür. Sağdaki adınıza tıklayınca hesap menüsü açılır: çalışma alanı değiştirme, Ayarlar, Bildirimler, Sözleşmelerim, Kullanım kılavuzu ve çıkış.",
          "Liste ve özet ekranları kendiliğinden tazelenir: bir ekip arkadaşınız talep ya da iş eklediğinde sayfayı yenilemeniz gerekmez.",
        ],
      },
      {
        id: "kurulum",
        baslik: "İlk kurulum",
        yetki: "settings.kurulum.yonet",
        metin: ["Ana ekrandaki \"Kurulumu tamamlayın\" kartı adım adım ilerletir: kurum ve marka bilgileri, resmi bilgiler ve IBAN, logo ve kaşe-imza, ekibinizi davet etmek ve ilk talebi girmek. Teklif ve sözleşme belgeleri bu bilgilerle basıldığı için önce bunları tamamlayın."],
        baglanti: { href: "/panel/settings", etiket: "Ayarlar" },
      },
      {
        id: "bildirimler",
        baslik: "Bildirimler ve telefona anlık bildirim",
        metin: [
          "Zil simgesi ve Bildirimler sayfası; talepler, operasyon, müşteri mesajları, posta, ödemeler gibi başlıklara ayrılır. \"Tümünü okundu işaretle\" ve \"Okunanları kaldır\" listeyi temizler.",
          "Telefonunuza anlık bildirim için Bildirimler sayfasında \"Bu cihazı ekle\" deyin ve \"Deneme bildirimi gönder\" ile sınayın. iPhone'da önce Safari → Paylaş → \"Ana Ekrana Ekle\" gerekir.",
        ],
        baglanti: { href: "/panel/notifications", etiket: "Bildirimler" },
      },
      {
        id: "mesajlar",
        baslik: "Ekip içi mesajlar",
        metin: ["Üst çubuktaki mesaj simgesinden ekip arkadaşlarınıza birebir ya da grup halinde yazarsınız (kurumunuzda Mesajlar açıksa). Kendi mesajınızı düzenleyip silebilir, 10 MB'a kadar dosya gönderebilirsiniz. Grubun adını ve üyelerini yalnızca grubu kuran değiştirir."],
      },
      {
        id: "tutar",
        baslik: "Tutar ve tarih yazımı",
        metin: ["Tutarlar Türkçe yazımla girilir: binlik ayırıcı nokta, kuruş virgül. \"30.000,00\" otuz bin liradır; \"1.500\" bin beş yüz liradır, bir buçuk değil."],
        notlar: ["Saatler ve günler Türkiye saatiyle gösterilir."],
      },
      {
        id: "telefon",
        baslik: "Telefonda kullanım",
        metin: ["Paneli telefonun ana ekranına ekleyebilirsiniz (tarayıcının paylaş menüsü → \"Ana ekrana ekle\"). Bu kipte üst çubukta geri düğmesi görünür; tablolar telefonda kart olarak çizilir."],
      },
    ],
  },
  {
    id: "crm",
    baslik: "CRM: talepten sözleşmeye",
    uygulama: "crm",
    giris: "Satışın akışı: müşteriden gelen talep → teklif → müşterinin kabulü → sözleşme ve imza → operasyonda iş. Her aşama bir öncekinden açılır; talep detayındaki çizgi işin nerede olduğunu gösterir.",
    konular: [
      {
        id: "talep",
        baslik: "Yeni talep girmek",
        adimlar: [
          "CRM → Talepler → \"Yeni talep\".",
          "\"Talep konusu\" ve \"Müşteri / kurum\" zorunludur; telefon, e-posta, planlanan teslim tarihi, talep kaynağı (WhatsApp, Telefon, Web sitesi…) ve not isteğe bağlı.",
          "\"Talebi kaydet\". Satış temsilcisi seçme yetkiniz yoksa talep size atanır.",
        ],
        notlar: [
          "Talepler sayfasındaki aşama şeridi (Yeni talep, İnceleniyor, Teklife devredildi, Arşivlendi, Atanmamış) bir sayıya tıklayınca listeyi süzer.",
          "Daha önce gelmiş bir müşteriyi \"Müşteri sorgula\" ile ya da Ctrl+K'ya adını yazarak bulabilirsiniz.",
        ],
        baglanti: { href: "/panel/crm", etiket: "Talepler" },
      },
      {
        id: "talep-detayi",
        baslik: "Talep detayı: atama, yorum, arşiv",
        metin: [
          "Talep detayındaki ana düğme aşamaya göre değişir: önce \"Teklif oluştur\", sonra \"Teklife git\", \"Sözleşmeye git\", \"İşe git\". Buradan müşteriyi arayabilir, WhatsApp ya da e-posta açabilir, ekip içi yorum yazabilirsiniz (müşteri yorumları görmez).",
          "\"⋯\" menüsünde \"Düzenle\", \"Temsilci ata\", \"Direkt sözleşme oluştur\" (müşteri teklifi onaylamadan sözleşme açar) ve \"Arşivle\" bulunur. Arşivlemek kaydı silmez; sebep yazılması gerekir.",
        ],
        notlar: ["Size atanmış bir talebi bırakmak istiyorsanız \"Listemden kaldır\"; sebep yazılır ve talep yöneticinize uyarıyla görünür. Yönetici \"Satışçıya geri ver\" diyebilir."],
      },
      {
        id: "teklif",
        baslik: "Teklif hazırlamak",
        adimlar: [
          "Talep detayında \"Teklif oluştur\".",
          "\"Teklif başlığı\", \"Hizmet kapsamı\" ve \"Teklif tutarı (₺)\" girin; KDV durumunu seçin (KDV Hariç: %20 eklenir, KDV Dahil: içinden ayrılır, KDV İstisna).",
          "Ödeme planını seçin: peşin, ön + son, ön + ara + son ya da \"Özel ödeme planı (taksitli)\" (yüzdelerin toplamı %100 olmalı).",
          "\"Tahmini teslim tarihi\" ve geçerlilik tarihini girip \"Teklifi Oluştur\". Formun altındaki özet ara toplamı, KDV'yi ve genel toplamı canlı gösterir.",
        ],
        notlar: ["Teklif Teklifler listesinden değil, talepten oluşturulur; liste yalnızca izlemek içindir."],
      },
      {
        id: "teklif-gonder",
        baslik: "Teklifi müşteriye göndermek ve kabul",
        metin: [
          "Teklif detayında \"Müşteriye gönder\" bir bağlantı oluşturur; \"E-posta ile gönder\" ya da \"WhatsApp ile gönder\" ile müşteriye iletin, \"Önizle\" ile müşterinin göreceğini görün. Teklifin kaç kez görüntülendiği ve geçerliliğine kaç gün kaldığı detayda yazar.",
          "Müşteri bağlantıda \"TEKLİFİ KABUL EDİYORUM\" derse sözleşme kendiliğinden oluşur ve müşteri doğrudan imza sayfasına geçer. Müşteri onayı telefonda verdiyse \"Sözleşmeye dönüştür\" ile siz kabul edersiniz.",
        ],
        notlar: [
          "Gönderilmiş teklifi \"Düzenle\" ile değiştirirseniz müşterinin bağlantısındaki teklif de değişir.",
          "Kabul edilmiş, reddedilmiş ya da arşivlenmiş teklif kilitlidir. Teklif silinmez, \"Teklifi kapat\" ile Reddedildi / Süresi Doldu / Hatalı Kayıt olarak kapatılır; bağlı sözleşmesi olan teklif hiç silinemez.",
        ],
        baglanti: { href: "/panel/crm/proposals", etiket: "Teklifler" },
      },
      {
        id: "sozlesme",
        baslik: "Sözleşme ve elektronik imza",
        adimlar: [
          "Sözleşme detayında bilgileri (fatura adresi, vergi no) \"Düzenle\" ile, ödeme ve iş planını kendi menülerinden kontrol edin.",
          "\"İmzaya gönder\" → oluşan bağlantıyı \"E-posta ile gönder\" ya da \"WhatsApp ile gönder\".",
          "Müşteri bağlantıda adını yazar, imzasını ekrana çizer, sözleşme ve KVKK onaylarını işaretler ve \"Sözleşmeyi İmzala\" der. Sözleşme \"İmzalandı\" olur.",
        ],
        notlar: [
          "İmzalı sözleşme değiştirilemez ve geri alınamaz. İş planı ya da vade değişecekse \"Ek protokol\" gönderilir; müşteri onaylar ya da değişiklik ister.",
          "Müşteriyle yazışması, ödeme planı, işi ya da maliyet kalemi olan sözleşme silinemez; yanlış açıldıysa \"Sözleşmeyi kapat\" ile İptal'e alın.",
          "Sözleşme metninin kendisi Ayarlar → Belge metinleri'nden değiştirilir; metin imza anında belgeye kopyalandığı için eski sözleşmeler etkilenmez.",
        ],
        baglanti: { href: "/panel/crm/contracts", etiket: "Sözleşmeler" },
      },
      {
        id: "musteri",
        baslik: "Müşteri sayfası",
        metin: ["Bir müşterinin bütün talepleri, teklifleri, sözleşmeleri, işleri ve açık bakiyesi tek sayfadadır. \"Cari hesap\" tahsilat ve hareketleri açar; iletişim bilgisi CRM ve Finans arasında ortaktır."],
      },
      {
        id: "takvim",
        baslik: "Satış takvimi",
        metin: ["CRM → Takvim'de \"Yeni randevu\" ile konu, kiminle, telefon, tarih ve saat girilir (Türkiye saati). Randevu \"Tamamlandı\" ya da \"İptal\" olarak işaretlenir. Yetkisi olan bütün ekibin takvimini görür; diğerleri kendi randevularını."],
        baglanti: { href: "/panel/crm/takvim", etiket: "Satış takvimi" },
      },
      {
        id: "whatsapp",
        baslik: "WhatsApp",
        metin: [
          "Tüm uygulamalar → WhatsApp'ta müşteri sohbetleri listelenir; ad, numara ya da mesaj metniyle aranır. Dosya ve görsel gönderilebilir, \"Hazır mesajlar\" ile sık yazılan metinler tek tıkla eklenir. Enter gönderir, Shift+Enter alt satıra geçer.",
          "Meta'nın kuralı: müşteri son 24 saat içinde size yazmadıysa \"Yanıt penceresi kapalı\" görünür ve serbest metin gönderilemez; yalnızca onaylı şablon mesajlar gider.",
        ],
        notlar: ["Kurumunuzun kendi numarası bağlı değilse mesajlar ArvoOS'un ortak numarasından gider; bağlamak için Ayarlar → Entegrasyonlar."],
        baglanti: { href: "/panel/crm/whatsapp", etiket: "WhatsApp" },
      },
    ],
  },
  {
    id: "belgeler",
    baslik: "Belge Merkezi",
    uygulama: "documents",
    giris: "Bütün teklif ve sözleşme belgeleri tek listede: hangisi yanıt ya da imza bekliyor, müşteri ne zaman açtı.",
    konular: [
      {
        id: "belge",
        baslik: "Belgeyi açmak, PDF almak, erişim geçmişi",
        metin: [
          "Satırdaki \"Önizle\" belgeyi açar, \"PDF olarak indir\" ile kaydedersiniz. Belge detayında talepten tahsilata bütün süreç ve taksitlerin durumu görünür.",
          "\"Erişim geçmişi\" müşterinin belgeyi ne zaman, hangi cihazdan açtığını, PDF aldığını ve bağlantının ne zaman paylaşıldığını listeler.",
        ],
        baglanti: { href: "/panel/documents", etiket: "Belge Merkezi" },
      },
    ],
  },
  {
    id: "posta",
    baslik: "Posta (ortak kutu)",
    uygulama: "posta",
    giris: "Kurumun ortak e-posta kutusu panelde: gelen yazışmalar, ekip içinde kimin ilgilendiği, yanıtlar ve talebe dönüştürme.",
    konular: [
      {
        id: "okumak",
        baslik: "Gelen kutusu ve yanıt",
        metin: [
          "Tüm uygulamalar → Posta. Gelen kutusu, gönderilenler, taslaklar ve çöp kutusu arasında geçilir; konu ve gönderene göre (isterseniz gövdede de) aranır. Birden çok yazışma seçilip okundu/okunmadı yapılabilir ya da çöpe atılabilir.",
          "Yazışmada \"Yanıt yaz\" (Cc ve ek dosya eklenebilir) → \"Yanıtı gönder\"; yarım kalan yanıtı \"Taslak kaydet\". \"Ben ilgileniyorum\" ekip arkadaşlarınıza yazışmayı sizin üstlendiğinizi gösterir.",
        ],
        notlar: [
          "\"Bu yazışma bir talep mi?\" → \"Talep aç\" talep formunu doldurulmuş açar; kaydedince yazışma talebe bağlanır.",
          "Çöpe atılan yazışma kalıcı silinmez, \"Çöpten geri al\" ile döner.",
          "\"Hazır cevaplar\"da {{musteri}}, {{ben}}, {{kurum}} yer tutucuları yazışmadaki adlarla dolar.",
        ],
        baglanti: { href: "/panel/posta", etiket: "Posta" },
      },
    ],
  },
  {
    id: "operasyon",
    baslik: "Operasyon",
    uygulama: "operations",
    giris: "Satılan işin yürütülmesi: işler, görevler (aşamalar), termin, müşteriyle yazışma ve müşterinin takip ekranı.",
    konular: [
      {
        id: "yeni-is",
        baslik: "Yeni iş açmak",
        adimlar: [
          "Operasyon → İşler → \"Yeni iş\".",
          "\"İş başlığı\", \"Müşteri / kurum\" (boş bırakılırsa kurum içi iş), \"Operasyon sorumlusu\", \"Öncelik\", \"Başlangıç durumu\" ve \"Termin\"i girin.",
          "\"İşi oluştur\". Görev listesi Adım şablonu'ndan gelir.",
        ],
        notlar: ["Termin, başlangıç tarihinden önce olamaz."],
        baglanti: { href: "/panel/operations/isler", etiket: "İşler" },
      },
      {
        id: "is-detayi",
        baslik: "İş detayı: durum, görevler, termin",
        metin: [
          "Üst şeritteki \"Durum\" (Planlandı, Devam ediyor, Beklemede, Tamamlandı, İptal), \"Top kimde\" (Bizde, Müşteride, Üçüncü tarafta) ve \"Revizyon\" seçildiği anda kaydedilir. Top bizde değilse \"Ne bekleniyor?\" sorulur.",
          "Görevin kutucuğuna tıklamak onu tamamlar ve kimin, ne zaman tamamladığını yazar. Her görevde teslim tarihi ve sorumlu seçilir; termine üç gün kalınca \"Yaklaştı\", geçince \"Gecikti\" etiketi çıkar. Yeni görev \"Yeni görev ekle\" ile eklenir.",
          "\"Tarihleri dağıt\", tarihi olmayan görevleri başlangıç ile termin arasına yayar; elle girdiğiniz tarihlere dokunmaz. Bunun için işin termini girilmiş olmalı.",
        ],
        notlar: [
          "Termini yalnızca yönetici ya da işin sorumlusu değiştirebilir.",
          "Menüdeki \"Sorumluları ata\" ile asıl ve ek sorumlular seçilir; ek sorumlu işi görür ama asıl sorumluyu değiştiremez.",
          "\"Türü değiştir\" tamamlanmamış görevleri kaldırır, tamamlananlar kalır.",
          "Prim doğmuş bir iş silinemez.",
        ],
      },
      {
        id: "musteri-takip",
        baslik: "Müşteri takip ekranı, mesajlar ve dosyalar",
        metin: [
          "Her işin bir takip kodu vardır. \"Kodu kopyala\" ile müşteriye gönderin; müşteri takip ekranından işin durumunu görür ve size yazar. \"Takip ekranını aç\" ile müşterinin gördüğünü siz de görürsünüz.",
          "Sağ sütundaki müşteri mesajlarına yazdığınız yanıt müşterinin takip ekranında görünür (Ctrl+Enter ile gönderilir). Sözleşmesi olmayan işte müşteri mesajlaşması kapalıdır.",
          "\"Fotoğraf / dosya ekle\" ile dosya \"Ekip içi\" ya da \"Müşteriye gönder\" olarak eklenir. Teslim edilecek son evrak \"Nihai evrak teslimi\" bölümünden yüklenir ve müşterinin \"Dosyalarınız\" alanına düşer (en fazla 50 MB).",
        ],
      },
      {
        id: "pano",
        baslik: "Pano (sürükle-bırak)",
        metin: ["Her sütun bir aşamadır; kartı sürükleyerek işi ilerletirsiniz. İleri bir sütuna bırakmak aradaki aşamaları da kapatır, sürüklerken kaç aşamanın kapanacağı yazar. Telefonda kartın \"Tamamla\" ve \"←\" düğmeleri kullanılır."],
        notlar: ["Kartı yalnızca yöneticiler ve işin sorumlusu taşıyabilir."],
        baglanti: { href: "/panel/operations/pano", etiket: "Pano" },
      },
      {
        id: "takvim-ekip",
        baslik: "Takvim ve ekip yükü",
        metin: [
          "İş takvimi ay görünümünde görevlerin teslim günlerini ve önümüzdeki 14 günü gösterir; sorumluya göre süzülebilir.",
          "Ekip yükü kişi başına açık işleri, termini geçenleri, bu hafta teslim edilecekleri ve geciken adımları sayar. Kişinin burada görünmesi için İK'da operasyon departmanına bağlı olması gerekir.",
        ],
        baglanti: { href: "/panel/operations/takvim", etiket: "İş takvimi" },
      },
      {
        id: "arsiv",
        baslik: "Arşiv",
        metin: ["Yalnızca \"Tamamlandı\" durumundaki iş arşivlenir (iş detayı menüsü → \"Arşivle\"). Arşivdeki iş aktif listelerde görünmez ve değiştirilemez; \"Arşivden çıkar\" ile geri gelir."],
        baglanti: { href: "/panel/operations/arsiv", etiket: "Arşiv" },
      },
      {
        id: "sablon",
        baslik: "Adım şablonu: işlerin görev listesi",
        yetki: "operations.sablon.yonet",
        metin: [
          "Yeni açılan her iş görev listesini buradan alır. \"Çalışma türleri\" ile farklı hizmetler için farklı listeler tutabilirsiniz (\"Tür ekle\", \"Öntanımlı yap\"). Her satır bir aşama, görev ve başlangıçtan kaç gün sonra teslim edileceğidir.",
          "Hangi hizmet türünün hangi çalışma türünü otomatik seçeceğini \"Eşlemeyi kaydet\" ile belirlersiniz. Sözleşmesinde ara teslim takvimi olan iş, görevlerini o takvimden alır.",
        ],
        baglanti: { href: "/panel/operations/sablon", etiket: "Adım şablonu" },
      },
    ],
  },
  {
    id: "finans",
    baslik: "Finans",
    uygulama: "finance",
    giris: "Müşteri cari hesapları, tahsilat, taksitler, ödeme bağlantıları, iş maliyetleri ve raporlar.",
    konular: [
      {
        id: "tahsilat",
        baslik: "Tahsilat kaydetmek",
        adimlar: [
          "Finans → Müşteriler'de müşteriyi bulun (ad, telefon, e-posta ya da vergi numarasıyla).",
          "Açık bakiyesi olan satırda \"Tahsilat\" → tutar, tarih, referans ve açıklama.",
          "\"Tahsilatı kaydet\". Tutar en eski vadeli taksitten başlayarak taksitlere dağıtılır.",
        ],
        notlar: ["Satış primi tahsilattan doğar: tahsilatı doğru tarihle girmek, satış personelinin primini de doğru hesaplatır."],
        baglanti: { href: "/panel/finance", etiket: "Müşteriler" },
      },
      {
        id: "cari",
        baslik: "Cari hesap: iade, ek hizmet, hareketler",
        metin: [
          "Müşteri detayındaki \"Cari hesap\" penceresinde tahsilatın yanında \"İade\" (tutar ve neden) ve \"Ek hizmet\" (sözleşme dışı ek iş, \"Cari hesaba ekle\") girilir. Ek hizmet \"Ek hizmeti taksitlere dağıt\" ile ödeme planına eklenebilir.",
          "\"Hareket dökümü\"nde elle girilen bir hareket \"Ayrıntı\"dan düzeltilir ya da silinir. Sözleşmeden ya da kartlı ödemeden gelen hareketler buradan değiştirilemez.",
        ],
        notlar: ["İletişim ve fatura bilgileri CRM ile ortaktır; \"Bilgileri düzenle\"de değiştirdiğiniz her iki yerde de görünür."],
      },
      {
        id: "taksit",
        baslik: "Ödeme planı (taksitler)",
        metin: [
          "Taksitin durumu elle seçilmez: net tahsilat (tahsilat eksi iade) en eski vadeden başlayarak dağıtılır ve her taksit Ödendi, Kısmen ödendi, Bekliyor ya da Gecikti olur.",
          "\"Taksit seçeneğini değiştir\" ile taksit sayısı (1–36), aralık (her ay, iki ayda bir…) ve ilk vade yeniden kurulur; ödenmiş kısım korunur, kalan eşit bölünür. Bir taksiti \"Düzenle\" ile değiştirirseniz fark sonraki taksitlere aktarılır ve toplam sözleşme tutarında kalır.",
        ],
      },
      {
        id: "odeme-linki",
        baslik: "Ödeme bağlantısı göndermek",
        metin: ["Kurumunuzun kartlı ödeme altyapısı bağlıysa müşteri satırında ya da cari hesapta \"Ödeme linki\" görünür. Tutarı yazıp \"Yalnızca oluştur\", \"Oluştur, WhatsApp'tan gönder\" ya da \"Oluştur, e-postayla gönder\"i seçin. Müşteri ödediğinde tahsilat cari hesaba kendiliğinden işlenir."],
      },
      {
        id: "maliyet",
        baslik: "İş maliyetleri ve kârlılık",
        yetki: "finance.maliyet.yonet",
        metin: ["Finans → İş Maliyetleri, sözleşme başına maliyeti, kârı ve kâr oranını gösterir. Satıra tıklayıp \"Maliyet kalemi ekle\" ile kategori (Personel, Dış hizmet, Yazılım, Lisans, Belge, Resmî gider, Diğer), tutar, tarih ve durum (Planlandı / Ödendi) girersiniz."],
        notlar: ["Maaş ve hakediş ödemeleri kendi ekranlarından finansa gider olarak yazılır; ayrıca maliyet kalemi girmeniz gerekmez."],
        baglanti: { href: "/panel/finance?gorunum=maliyet", etiket: "İş maliyetleri" },
      },
      {
        id: "raporlar",
        baslik: "Raporlar",
        yetki: "finance.rapor.gor",
        metin: [
          "Finans → Raporlar'da dönemi seçin (geçen ay, bu yıl ya da \"Özel aralık\" → \"Uygula\") ve rapor kartından \"Raporu aç\". Raporlar: Yönetici Kokpiti, Satış Analitiği, CRM ve Müşteri Analitiği, Tahsilat ve Alacak, Finansal Performans, Personel Performansı, Operasyon ve İş Akışı, Teklif ve Sözleşme.",
          "Her raporun ayrı yetkisi vardır; Excel'e aktarma da ayrı bir yetkidir.",
        ],
        baglanti: { href: "/panel/finance/raporlar", etiket: "Raporlar" },
      },
    ],
  },
  {
    id: "ik",
    baslik: "İnsan Kaynakları",
    uygulama: "hr",
    giris: "Personel kayıtları, departmanlar, satış hedefleri; yetkisi olana maaş ve hakediş takibi.",
    konular: [
      {
        id: "personel",
        baslik: "Personel eklemek ve panele davet etmek",
        adimlar: [
          "İnsan Kaynakları → Personel → \"Yeni personel\".",
          "Ad soyad, departman, durum, çalışma tipi (Tam zamanlı, Yarı zamanlı, Sözleşmeli, Stajyer), pozisyon, iletişim ve prim oranlarını girin.",
          "Personel sayfasında \"Panele davet et\": kişiye 7 gün geçerli bir bağlantı gider. \"Panel rolü\"nü (Satış Personeli, Operasyon Personeli, Yönetici) seçip \"Rolü kaydet\".",
        ],
        notlar: [
          "Kayıttan sonra gizlilik sözleşmesi kendiliğinden hazırlanır; kişi panele ilk girişte imzalar.",
          "Prim oranını değiştirmek geçmiş primleri değiştirmez.",
          "Kaydı olan personel silinemez; durumunu \"İşten ayrıldı\" yapın.",
        ],
        baglanti: { href: "/panel/hr", etiket: "Personel" },
      },
      {
        id: "prim",
        baslik: "Prim: nasıl hesaplanır, nasıl ödenir",
        yetki: "hr.prim.gor",
        metin: [
          "Satış primi müşteriden gerçekleşen tahsilattan, tahsilat günündeki oranla doğar. Operasyon primi iş tamamlanınca hak edilir. Açık prim = hak edilen − yapılan ödemeler; henüz hak edilmemiş işe yapılan ödeme \"avans\" olarak görünür.",
          "Personel sayfasındaki \"Prim\" penceresinden \"Ödeme kaydet\" ile tutar, tarih, yöntem ve hangi işlere istinaden ödendiği girilir. Prim dökümü PDF ve Excel olarak alınabilir.",
        ],
      },
      {
        id: "departman",
        baslik: "Departmanlar",
        metin: ["İnsan Kaynakları → Departmanlar'da \"Yeni departman\" ile ad ve kısa kod girilir. Adında \"Satış\" ya da \"Operasyon\" geçen departmana o alanın müdür yetki profili atanabilir; operasyon ekibinin Ekip yükü ekranında görünmesi de departmana bağlıdır."],
        baglanti: { href: "/panel/hr/departmanlar", etiket: "Departmanlar" },
      },
      {
        id: "hedef",
        baslik: "Satış hedefleri",
        metin: ["Ayı seçip personel başına \"Aylık hedef (₺)\" girin ve \"Hedefleri kaydet\". Ekranda gerçekleşen satış ve kalan tutar görünür; Personel Performansı raporu da bu hedefe göre hesaplanır. Boş bırakmak hedefi kaldırır, sıfır hedef için 0 yazın."],
        baglanti: { href: "/panel/hr/hedefler", etiket: "Hedefler" },
      },
      {
        id: "maaslar",
        baslik: "Maaşlar (kadrolu personel)",
        yetki: "hr.maas.yonet",
        metin: [
          "ArvoOS bordro HESAPLAMAZ: SGK ve vergiyi mali müşaviriniz hesaplar. Bu ekran ayın maaş listesini ve ödemeyi tutar. Listede tam zamanlı, yarı zamanlı ve stajyer personel bulunur; sözleşmeli çalışanlar Hakedişler'dedir.",
          "\"Müşavir neti\" girilirse ödenecek tutar ondan, girilmezse \"Anlaşılan net\"ten hesaplanır; ek ödeme eklenir, avans ve kesinti düşülür. Eksik gün (ücretsiz izin + rapor) onaylı izinlerden, o ay ödenen prim de prim ödemelerinden kendiliğinden gelir.",
        ],
        adimlar: [
          "İnsan Kaynakları → Maaşlar'da ayı seçin.",
          "Anlaşılan neti girin; geçen ay girdiyseniz \"… maaşlarını kopyala\" ile aktarın.",
          "\"Müşavir dosyası (CSV)\" ile listeyi indirip müşavirinize gönderin; hesapladığı neti \"Müşavir neti\" kutusuna yazın ve \"Maaşları kaydet\".",
          "Ödemeyi yapınca satırdaki \"Öde\" → tarih ve yöntem → \"Ödendi olarak kaydet\". Finansa \"Personel Maaşı\" gideri yazılır.",
        ],
        notlar: [
          "Ödenmiş satır değiştirilemez; yanlışsa \"Geri al\" ile ödemeyi (ve finanstaki gideri) kaldırıp düzeltin.",
          "Bu ekranı yalnızca Kurum Sahibi ve Yönetici görür; personel yalnızca kendi kaydını görebilir.",
        ],
        baglanti: { href: "/panel/hr/maaslar", etiket: "Maaşlar" },
      },
      {
        id: "hakedisler",
        baslik: "Hakedişler (sözleşmeli / serbest çalışan)",
        yetki: "hr.maas.yonet",
        metin: ["Sözleşmeli çalışan bordroya girmez; iş başına ödenir. Hakediş; yapılan iş, tutar, belge (fatura ya da serbest meslek makbuzu) ve müşavirin söylediği stopajla girilir. Ödenecek tutar = tutar − stopaj."],
        adimlar: [
          "İnsan Kaynakları → Hakedişler → \"Yeni hakediş\".",
          "Çalışanı, işi, tutarı ve varsa stopajı girip \"Kaydet\".",
          "Ödeyince satırdaki \"Öde\" ile tarihi ve yöntemi kaydedin; finansa \"Serbest Çalışan Hakedişi\" gideri yazılır.",
        ],
        notlar: [
          "Özet şeridindeki \"Bu ayın stopajı\" müşavirinize bildireceğiniz tutardır.",
          "Ödenmiş hakediş silinmez; önce \"Geri al\".",
          "Çalışan listesinde personel kaydında çalışma tipi \"Sözleşmeli\" olanlar çıkar.",
        ],
        baglanti: { href: "/panel/hr/hakedisler", etiket: "Hakedişler" },
      },
    ],
  },
  {
    id: "ayarlar",
    baslik: "Ayarlar ve yetkiler",
    uygulama: null,
    giris: "Kurum bilgileri, kurumsal görünüm, belge metinleri, entegrasyonlar ve kimin neyi yapabileceği.",
    konular: [
      {
        id: "kurum",
        baslik: "Kurum bilgileri ve kurumsal kimlik",
        yetki: "settings.kurum.yonet",
        metin: [
          "Ayarlar'ın sekmeleri: Genel, Resmi bilgiler, Kurumsal kimlik, Belge metinleri, Hizmet türleri, Alan adı, Entegrasyonlar.",
          "Kurumsal kimlikte logo, kurumsal renk, sekme simgesi ve kaşe/imza yüklenir (PNG, JPG ya da WEBP, en fazla 5 MB); teklif ve sözleşme belgeleri bunlarla basılır.",
          "Alan adı sekmesinde kendi adresinizi yazar, gösterilen DNS kaydını alan adı sağlayıcınıza ekler ve \"Doğrulamayı kontrol et\" dersiniz.",
        ],
        baglanti: { href: "/panel/settings", etiket: "Ayarlar" },
      },
      {
        id: "entegrasyon",
        baslik: "Entegrasyonlar: ortak posta kutusu ve WhatsApp",
        yetki: "settings.entegrasyon.yonet",
        metin: ["Ayarlar → Entegrasyonlar'dan kurumun Gmail ortak posta kutusu ve WhatsApp Business bağlanır. Bağlandıktan sonra gelen e-postalar Posta uygulamasında, WhatsApp konuşmaları WhatsApp uygulamasında görünür."],
      },
      {
        id: "yetkiler",
        baslik: "Yetkilendirme: rol ve kişi yetkileri",
        yetki: "settings.yetki.yonet",
        metin: [
          "Ayarlar → Yetkilendirme'de her rol için hangi modüllerin açık olduğu ve hangi işlemlerin (ör. teklif silme, tahsilat kaydı) yapılabileceği belirlenir. Bir kişiye rolünden farklı yetki vermek için kişinin satırına girip her yetkiyi Açık, Kapalı ya da \"Rolden gelen\" olarak işaretleyin.",
        ],
        notlar: [
          "Kurum Sahibi hiçbir zaman kısıtlanamaz.",
          "Kişiye özel ayar rol ayarını ezer.",
          "Kilitli hücreler veritabanı kuralına bağlıdır: kapatılabilir ama rolün izninin ötesine açılamaz.",
          "Kendi Yetkilendirme yetkinizi kapatamazsınız.",
          "Modülü kapalı olan kişinin o modüldeki yetkileri de kapalıdır.",
        ],
        baglanti: { href: "/panel/settings/permissions", etiket: "Yetkilendirme" },
      },
      {
        id: "abonelik",
        baslik: "Abonelik ve ödeme",
        yetki: "finance.lisans.yonet",
        metin: [
          "Hesap menüsü → \"Abonelik ve faturalama\". Ürün başına \"Kartla öde\" ile 3D Secure'lu kart ödemesi yapılır. Havale/EFT ile ödediyseniz \"Havale / EFT\" sekmesinden tutarı, referans numarasını ve dekontu (PDF, JPG, PNG, WEBP; en fazla 10 MB) gönderin; ödeme onaylanınca lisans uzar.",
          "Yenilemeden önce kesilen proformalar ve faturalar aynı sayfada listelenir; proforma \"Yazdır / PDF olarak kaydet\" ile alınır.",
        ],
        baglanti: { href: "/panel/billing", etiket: "Abonelik ve faturalama" },
      },
    ],
  },
  {
    id: "analitik",
    baslik: "Analitik",
    uygulama: "analitik",
    giris: "Web sitenizin ziyaretçileri, kaynakları ve form dönüşümleri.",
    konular: [
      {
        id: "kurulum",
        baslik: "Siteyi bağlamak",
        yetki: "analitik.yonet",
        adimlar: [
          "Analitik → Kurulum → site adını ve alan adını yazıp \"Siteyi ekle\".",
          "Verilen kodu sitenizin <head> bölümüne yapıştırın. Kod çerez kullanmaz.",
        ],
        baglanti: { href: "/panel/analitik/kurulum", etiket: "Kurulum" },
      },
      {
        id: "okumak",
        baslik: "Raporu okumak",
        metin: ["Genel Bakış ziyaretçi, sayfa görüntüleme, form gönderimi ve dönüşüm oranını; ziyaretçilerin geldiği kaynakları, kampanyaları, sayfaları ve konumları gösterir. \"Canlı\" sekmesi son 30 dakikayı 15 saniyede bir yeniler."],
        baglanti: { href: "/panel/analitik", etiket: "Analitik" },
      },
    ],
  },
  {
    id: "hesap",
    baslik: "Hesabım ve destek",
    uygulama: null,
    giris: "Kişisel kayıtlarınız ve yardım alma yolları.",
    konular: [
      {
        id: "sozlesmelerim",
        baslik: "Kullanım sözleşmesi ve onay kaydım",
        metin: ["Panele ilk girişte Kullanım Sözleşmesi'ni okuyup onaylarsınız. Onayınızın zamanı, sürümü, IP adresi, yaklaşık konumu ve cihaz bilgisi kayıt altına alınır; bir kopyası e-postanıza gider. Hesap menüsü → \"Sözleşmelerim\" sayfasında kaydı ve yürürlükteki metni her zaman görebilirsiniz."],
        baglanti: { href: "/panel/sozlesmelerim", etiket: "Sözleşmelerim" },
      },
      {
        id: "destek",
        baslik: "Destek talebi açmak",
        metin: ["Teknik, faturalama ya da ürünle ilgili sorularınız için Destek ekranından talep açın; yanıtlar aynı konuşmada gelir ve talebin durumunu oradan izlersiniz."],
        baglanti: { href: "/panel/support", etiket: "Destek" },
      },
    ],
  },
];

/** Kişinin görebildiği bölümler ve konular; boş kalan bölüm düşer. */
export function kilavuzBolumleri(e: KilavuzErisimi): KilavuzBolumu[] {
  return KILAVUZ
    .filter((b) => b.uygulama === null || e.uygulamalar.has(b.uygulama))
    .map((b) => ({ ...b, konular: b.konular.filter((k) => !k.yetki || e.yetkiler.has(k.yetki)) }))
    .filter((b) => b.konular.length > 0);
}

/** Aramanın baktığı metin: bölüm adı + konu başlığı + bütün içerik, Türkçe harf duyarsız. */
export function aramaMetni(b: KilavuzBolumu, k: KilavuzKonusu): string {
  return aramaAnahtari([b.baslik, b.uygulama ?? "", k.baslik, ...(k.metin ?? []), ...(k.adimlar ?? []), ...(k.notlar ?? [])].join(" "));
}
