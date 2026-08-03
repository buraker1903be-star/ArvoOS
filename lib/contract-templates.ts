export type ContractClause = {
  title: string;
  paragraphs: string[];
};

export type ContractTemplate = {
  key: "arvoos_general" | "akademikmerkez_academic";
  name: string;
  version: string;
  clauses: ContractClause[];
};

const commonClauses: ContractClause[] = [
  {
    title: "Taraflar, Ekler ve Sözleşmenin Bütünlüğü",
    paragraphs: [
      "Bu sözleşme; sözleşme özetinde bilgileri bulunan hizmet sağlayıcı ile müşteri arasında, teklif, hizmet kapsamı, ödeme planı ve varsa sonradan yazılı olarak kabul edilen değişiklik kayıtlarıyla birlikte bir bütün olarak kurulmuştur.",
      "Taraflar, sözleşmede ve sistemde kayıtlı iletişim bilgilerinin doğru ve güncel olduğunu kabul eder. Adres veya iletişim bilgisi değişiklikleri karşı tarafa yazılı ya da doğrulanabilir elektronik yöntemle bildirilmedikçe mevcut bilgilere yapılan bildirimler geçerli kabul edilir.",
      "Emredici mevzuat hükümleri saklıdır. Sözleşmenin herhangi bir hükmünün geçersiz olması, diğer hükümlerin geçerliliğini etkilemez; geçersiz hüküm, tarafların ortak amacı ve mevzuata en yakın geçerli düzenlemeyle uygulanır.",
    ],
  },
  {
    title: "Ücret, Vergiler, Faturalama ve Ödeme",
    paragraphs: [
      "Toplam sözleşme bedeli, para birimi, vergi durumu ve ödeme takvimi sözleşme özetinde gösterilmiştir. Ödemeler belirtilen vadelerde, kararlaştırılan yöntem ve para birimiyle yapılır.",
      "Kanunen uygulanması gereken vergi, harç ve benzeri mali yükümlülükler ilgili mevzuata göre fatura veya mali belgelerde ayrıca gösterilir. Ödeme planında yapılacak değişiklikler ancak tarafların doğrulanabilir yazılı veya elektronik mutabakatıyla geçerli olur.",
      "Müşterinin temerrüdü halinde hizmet sağlayıcı, mevzuattan doğan hakları saklı kalmak üzere, makul bildirim sonrasında hizmeti askıya alabilir. Tüketici işlemlerinde uygulanacak temerrüt, faiz, masraf ve bildirim hükümleri emredici tüketici mevzuatına tabidir.",
    ],
  },
  {
    title: "Teslim, İnceleme, Kabul ve Ayıp Bildirimi",
    paragraphs: [
      "Teslim veya ara teslimler sistem, e-posta ya da tarafların kararlaştırdığı başka bir kayıtlı kanal üzerinden müşteriye bildirilir. Müşteri teslimi makul süre içinde inceleyerek kapsamla açıkça çelişen somut eksiklikleri yazılı olarak bildirir.",
      "Bildirilen uygunluk sorunları hizmet kapsamındaysa makul süre içinde giderilir. Müşterinin yeni talebi, kapsam genişlemesi, ek veri, yeni yöntem veya sonradan değişen talimatları ayrıca süre ve ücret değerlendirmesine tabidir.",
      "Tüketici işlemlerinde ayıplı hizmete ilişkin seçimlik haklar ve diğer emredici korumalar saklıdır; bu sözleşme söz konusu hakları ortadan kaldıracak şekilde yorumlanamaz.",
    ],
  },
  {
    title: "Gizlilik",
    paragraphs: [
      "Taraflar; sözleşme kapsamında öğrendikleri ticari sırları, fiyatlandırma bilgilerini, müşteri verilerini, proje dokümanlarını, erişim bilgilerini ve açıkça gizli olduğu belirtilen diğer bilgileri yalnızca sözleşmenin kurulması ve ifası amacıyla kullanır.",
      "Kanuni zorunluluk, yetkili makam talebi veya hakkın tesisi, kullanılması ya da korunması için zorunlu açıklamalar bu hükmün istisnasıdır. Açıklama yapılması halinde, hukuken mümkün olduğu ölçüde karşı taraf önceden bilgilendirilir.",
      "Gizlilik yükümlülüğü sözleşmenin sona ermesinden sonra niteliği gereği devam eder.",
    ],
  },
  {
    title: "Kişisel Verilerin Korunması",
    paragraphs: [
      "Kişisel veriler, 6698 sayılı Kişisel Verilerin Korunması Kanunu ve ilgili ikincil mevzuat uyarınca; sözleşmenin kurulması veya ifası, hukuki yükümlülüklerin yerine getirilmesi, bir hakkın tesisi, kullanılması veya korunması ve varsa diğer uygun işleme şartları kapsamında işlenir.",
      "Veri sorumlusu sıfatını taşıyan taraf, kişisel verilerin elde edilmesi sırasında aydınlatma yükümlülüğünü ayrıca, açık ve sade bir metinle yerine getirir. Aydınlatma ile açık rıza süreçleri, gerektiğinde birbirinden ayrı yürütülür.",
      "Kişisel veriler amaçla bağlantılı, sınırlı ve ölçülü şekilde işlenir; gerekli teknik ve idari tedbirler uygulanır. Taraflar, hizmet için zorunlu olmayan özel nitelikli verileri paylaşmamayı ve paylaşılan veriler bakımından gerekli hukuki şartları sağlamayı kabul eder.",
    ],
  },
  {
    title: "Fikri ve Sınai Haklar",
    paragraphs: [
      "Tarafların sözleşme öncesinde sahip oldukları yazılım, yöntem, şablon, veri, marka, içerik, know-how ve diğer fikri veya sınai haklar ilgili tarafın mülkiyetinde kalır.",
      "Müşteri için üretilen çıktıların kullanım, lisans veya devir kapsamı; teklif, hizmet kapsamı ve varsa proje eklerinde açıkça belirtilir. Açıkça kararlaştırılmayan mali hak devri gerçekleşmiş sayılmaz.",
      "Üçüncü taraf yazılım, veri tabanı, yayın, görsel, kütüphane veya içerikler kendi lisans ve kullanım koşullarına tabidir.",
    ],
  },
  {
    title: "Müşteri Yükümlülükleri ve İş Birliği",
    paragraphs: [
      "Müşteri, hizmet için gerekli bilgi, belge, veri, erişim, onay ve kararları doğru, eksiksiz ve zamanında sağlar. Müşteriden kaynaklanan gecikmeler teslim takvimini aynı ölçüde etkileyebilir.",
      "Müşteri, sağladığı içerik, veri ve talimatların hukuka uygunluğundan; gerekli izin, lisans, yetki ve üçüncü kişi onaylarının mevcut olmasından sorumludur.",
    ],
  },
  {
    title: "Mücbir Sebep ve Beklenmeyen Haller",
    paragraphs: [
      "Tarafların makul kontrolü dışında gelişen doğal afet, salgın, savaş, terör, grev, kamu otoritesi kararı, yaygın enerji, altyapı veya iletişim kesintisi ve benzeri olaylar mücbir sebep sayılır.",
      "Etkilenen taraf durumu makul sürede bildirir ve etkileri azaltmak için gereken çabayı gösterir. Mücbir sebep devam ettiği sürece etkilenen yükümlülükler askıya alınır; olayun sözleşmenin amacını kalıcı olarak ortadan kaldırması halinde taraflar fesih ve tasfiye koşullarını iyi niyetle belirler.",
    ],
  },
  {
    title: "Süre, Askıya Alma, Fesih ve Sonuçları",
    paragraphs: [
      "Sözleşme elektronik onay tarihinde yürürlüğe girer ve işin niteliğine göre teslim, kabul, ödeme ve devam eden yükümlülüklerin tamamlanmasına kadar yürürlükte kalır.",
      "Taraflardan birinin esaslı yükümlülüğünü ihlal etmesi ve yazılı bildirime rağmen verilen makul süre içinde ihlali gidermemesi halinde diğer taraf sözleşmeyi haklı nedenle feshedebilir.",
      "Fesih tarihine kadar usulüne uygun tamamlanan hizmetler, doğmuş ödeme yükümlülükleri ve yapılan zorunlu masraflar tasfiyede dikkate alınır. Gizlilik, kişisel veriler, fikri haklar, kayıtlar ve uyuşmazlık hükümleri niteliği gereği sözleşme sonrasında da yürürlükte kalır.",
    ],
  },
  {
    title: "Tüketici İşlemleri ve Mesafeli Sözleşmeler",
    paragraphs: [
      "Müşterinin tüketici sıfatını taşıdığı işlemlerde 6502 sayılı Tüketicinin Korunması Hakkında Kanun, Mesafeli Sözleşmeler Yönetmeliği ve diğer emredici tüketici hükümleri öncelikle uygulanır.",
      "Ön bilgilendirme, cayma hakkı, istisnalar, ayıplı hizmet ve başvuru yolları ilgili işleme ve hizmetin niteliğine göre ayrıca sağlanır. Müşterinin kanundan doğan haklarından peşinen feragat ettiği şeklinde yorumlanabilecek hiçbir sözleşme hükmü uygulanmaz.",
      "Cayma süresi dolmadan hizmete başlanması isteniyorsa, mevzuatın aradığı hallerde müşterinin açık talebi ve bilgilendirilmiş onayı ayrıca alınır.",
    ],
  },
  {
    title: "Elektronik Onay, Kayıtlar ve Delil Niteliği",
    paragraphs: [
      "Müşteri, sözleşme ekranındaki onay kutusunu işaretleyip ad-soyad bilgisini girerek onay işlemini tamamladığında sözleşme metnini, kapsamı ve ödeme planını elektronik ortamda kabul ettiğini beyan eder.",
      "Bu işlem 5070 sayılı Elektronik İmza Kanunu anlamında güvenli elektronik imza olduğu iddiasını taşımaz. Bununla birlikte tarih, saat, işlem kaydı, belge sürümü, IP, kullanıcı beyanı ve doğrulama kayıtları taraf iradesini gösteren elektronik kayıtlar olarak saklanabilir ve yürürlükteki usul hukuku çerçevesinde değerlendirilir.",
      "Taraflardan biri güvenli elektronik imza veya ıslak imza talep ederse, sözleşme ayrıca bu yöntemlerden biriyle imzalanabilir.",
    ],
  },
  {
    title: "Bildirimler ve Değişiklikler",
    paragraphs: [
      "Sözleşme kapsamındaki operasyonel bildirimler kayıtlı e-posta, panel veya tarafların belirlediği elektronik kanal üzerinden yapılabilir. Temerrüt, fesih ve benzeri önemli bildirimler, ispatlanabilir yazılı veya elektronik yöntemle gerçekleştirilir.",
      "Sözleşme değişiklikleri, tarafların yetkili temsilcileri tarafından yazılı veya doğrulanabilir elektronik biçimde kabul edilmedikçe geçerli olmaz.",
    ],
  },
  {
    title: "Uygulanacak Hukuk ve Uyuşmazlıkların Çözümü",
    paragraphs: [
      "Sözleşmeye Türkiye Cumhuriyeti hukuku uygulanır.",
      "Müşterinin tüketici olduğu işlemlerde tüketici hakem heyetleri, tüketici mahkemeleri ve emredici yetki kuralları saklıdır. Ticari veya mesleki amaçlı işlemlerde, dava şartı arabuluculuk hükümleri saklı kalmak üzere, hizmet sağlayıcının merkezinin bulunduğu yer mahkemeleri ve icra daireleri yetkilidir.",
    ],
  },
];

export const arvoOSGeneralTemplate: ContractTemplate = {
  key: "arvoos_general",
  name: "ArvoOS Yazılım ve Profesyonel Hizmet Sözleşmesi",
  version: "2.0",
  clauses: [
    {
      title: "Sözleşmenin Konusu ve Hizmet Modeli",
      paragraphs: [
        "Bu sözleşme; teklif ve hizmet kapsamında belirtilen yazılım aboneliği, lisans, kurulum, yapılandırma, veri aktarımı, eğitim, danışmanlık, bakım, destek, özel geliştirme veya diğer profesyonel hizmetlerin koşullarını düzenler.",
        "Hizmetin kapsamı, kullanıcı veya modül sayıları, saklama alanı, destek seviyesi, teslimler ve özel gereksinimler teklifte veya hizmet ekinde belirtilir.",
      ],
    },
    {
      title: "Hesaplar, Yetkilendirme ve Bilgi Güvenliği",
      paragraphs: [
        "Müşteri, kullanıcı hesaplarının yalnızca yetkili kişilerce kullanılmasını; parola, çok faktörlü doğrulama ve erişim bilgilerinin korunmasını sağlar. Yetkisiz kullanım veya güvenlik olayı şüphesinde hizmet sağlayıcı gecikmeksizin bilgilendirilir.",
        "Hizmet sağlayıcı, hizmetin niteliğine uygun makul teknik ve idari güvenlik tedbirlerini uygular. Hiçbir internet veya bilgi sistemi için kesintisizlik ya da mutlak güvenlik garantisi verilmez.",
      ],
    },
    {
      title: "Hizmet Seviyesi, Bakım ve Kesintiler",
      paragraphs: [
        "Varsa hizmet seviyesi, destek saatleri, yanıt hedefleri ve planlı bakım koşulları teklif veya hizmet ekinde gösterilir. Planlı bakım, güvenlik güncellemesi veya üçüncü taraf altyapı kesintileri hizmet sürekliliğini geçici olarak etkileyebilir.",
        "Hizmet sağlayıcı, kritik güvenlik veya mevzuat gereksinimleri nedeniyle gerekli teknik değişiklikleri yapabilir; önemli etkiler makul ölçüde önceden bildirilir.",
      ],
    },
    {
      title: "Veri Sahipliği, Yedekleme ve İade",
      paragraphs: [
        "Müşterinin sisteme aktardığı veriler üzerindeki haklar müşteride veya ilgili hak sahibinde kalır. Müşteri, sisteme aktardığı veriler için gerekli hukuki yetkiye sahip olduğunu beyan eder.",
        "Yedekleme, dışa aktarma ve sözleşme sonunda veri iadesi koşulları paket veya hizmet ekinde belirtilir. Kanuni saklama yükümlülükleri ve güvenlik kayıtları saklı kalmak üzere veriler, ilgili politika ve mevzuata göre silinir, yok edilir veya anonim hale getirilir.",
      ],
    },
    {
      title: "Özel Geliştirmeler ve Değişiklik Yönetimi",
      paragraphs: [
        "Kapsam dışı geliştirme, entegrasyon, rapor, veri dönüşümü ve özel iş akışları değişiklik talebi olarak değerlendirilir. Süre, ücret, kabul ölçütleri ve teknik etkiler yazılı onayla kesinleşir.",
        "Açıkça aksi kararlaştırılmadıkça genel amaçlı altyapı, kütüphane, yöntem ve yeniden kullanılabilir bileşenlere ilişkin haklar hizmet sağlayıcıda kalır.",
      ],
    },
    ...commonClauses,
  ],
};

export const akademikMerkezTemplate: ContractTemplate = {
  key: "akademikmerkez_academic",
  name: "AkademikMerkez Akademik Danışmanlık ve Profesyonel Hizmet Sözleşmesi",
  version: "2.0",
  clauses: [
    {
      title: "Sözleşmenin Konusu ve Hizmetin Niteliği",
      paragraphs: [
        "Bu sözleşme; teklif ve hizmet kapsamında belirtilen akademik danışmanlık, araştırma tasarımı desteği, literatür tarama desteği, dil ve biçim düzenleme, istatistiksel analiz desteği, eğitim, yayın süreci danışmanlığı veya benzeri profesyonel destek hizmetlerinin koşullarını düzenler.",
        "Hizmet sağlayıcı, müşterinin yerine sınav, ödev, tez, makale veya akademik eser üretmeyi; sahte veri oluşturmayı; intihal, yazarlık ihlali, yanıltıcı beyan veya diğer akademik etik ihlallerini gerçekleştirmeyi taahhüt etmez.",
      ],
    },
    {
      title: "Akademik Etik, Araştırma İzinleri ve Müşteri Sorumluluğu",
      paragraphs: [
        "Müşteri; sunduğu veri, belge, kaynak, izin ve beyanların doğruluğundan; etik kurul, kurum izni, katılımcı onamı, telif, atıf, yazarlık ve araştırma bütünlüğü yükümlülüklerine uygunluğundan sorumludur.",
        "Hizmetler danışmanlık ve profesyonel destek niteliğindedir. Nihai metin, analiz, kaynak, yorum ve teslimlerin akademik veya kurumsal mercilere sunulmasından önce müşteri tarafından kontrol edilmesi gerekir.",
      ],
    },
    {
      title: "Yayın, Kabul ve Sonuç Garantisi Verilmemesi",
      paragraphs: [
        "Dergi kabulü, tez veya proje onayı, hakem değerlendirmesi, etik kurul kararı, indekslenme, atıf, burs, akademik unvan, savunma başarısı veya benzeri üçüncü taraf sonuçları garanti edilmez. Bu sonuçlar ilgili kurumların, editörlerin, hakemlerin ve bağımsız değerlendiricilerin takdirindedir.",
      ],
    },
    {
      title: "Veri, Analiz ve Yöntemsel Sınırlamalar",
      paragraphs: [
        "Müşteri, analiz için gerekli ham veri, veri sözlüğü, değişken açıklaması, örneklem bilgisi ve izinleri eksiksiz sağlar. Veri kalitesi, örneklem büyüklüğü, ölçüm hatası, yöntem seçimi ve eksik bilgiler sonuçları etkileyebilir.",
        "Analiz ve yöntem önerileri mevcut veri ve müşteri beyanları esas alınarak hazırlanır. Yeni veri seti, yeni hipotez, yöntem değişikliği, ek bölüm veya kapsam genişlemesi ayrıca değerlendirilir.",
      ],
    },
    {
      title: "Revizyon, Teslim ve Müşteri Geri Bildirimi",
      paragraphs: [
        "Revizyon sayısı, kapsamı ve süresi teklifte belirtilir. Revizyon, başlangıçta kararlaştırılan kapsam içindeki düzeltmeleri ifade eder; yeni araştırma sorusu, yeni analiz, yeni bölüm veya baştan yazım talebi revizyon kapsamında sayılmaz.",
        "Müşteri, teslimleri makul sürede inceleyip açık ve toplu geri bildirim sağlar. Parçalı, çelişkili veya gecikmiş geri bildirim teslim tarihini etkileyebilir.",
      ],
    },
    {
      title: "İntihal, Kaynak Doğrulama ve Yapay Zekâ Kullanımı",
      paragraphs: [
        "Kaynakların doğruluğu, erişilebilirliği, nihai atıf biçimi ve yayın kurallarına uygunluğu müşteri tarafından son kez kontrol edilir. Benzerlik oranı tek başına akademik etik uygunluğunun ölçüsü değildir ve belirli bir oran garanti edilmez.",
        "Yapay zekâ destekli araçların kullanılması halinde kullanım kapsamı, ilgili kurum veya yayın politikasına ve hizmetin niteliğine göre belirlenir. Yapay zekâ çıktıları nihai kaynak veya doğrulanmış bilimsel sonuç kabul edilmez; insan değerlendirmesi ve kaynak doğrulaması zorunludur.",
      ],
    },
    {
      title: "Akademik İçerikte Fikri Haklar ve Kullanım",
      paragraphs: [
        "Müşterinin sağladığı özgün veri, araştırma materyali ve eserler üzerindeki haklar müşteride veya ilgili hak sahibinde kalır. Hizmet sağlayıcının önceden sahip olduğu yöntem, şablon, eğitim içeriği ve genel bilgi birikimi üzerindeki haklar hizmet sağlayıcıda kalır.",
        "Teslim edilen içeriklerin kullanım kapsamı hizmetin niteliğine göre belirlenir. Üçüncü taraf yayın, veri tabanı, görsel, ölçek ve diğer materyallerin lisans ve telif koşulları saklıdır.",
      ],
    },
    ...commonClauses,
  ],
};

export function getContractTemplate(organizationSlug?: string | null) {
  const normalized = String(organizationSlug || "").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
  return normalized.includes("akademikmerkez") ? akademikMerkezTemplate : arvoOSGeneralTemplate;
}
