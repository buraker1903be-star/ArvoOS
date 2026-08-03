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
    title: "Taraflar ve Sözleşmenin Bütünlüğü",
    paragraphs: [
      "Bu sözleşme, belgede bilgileri yer alan hizmet sağlayıcı ile müşteri arasında elektronik ortamda kurulmuştur. Teklif, hizmet kapsamı ve ödeme planı bu sözleşmenin ayrılmaz ekleridir.",
      "Taraflar, iletişim ve bildirim bilgilerinin güncel tutulmasından sorumludur. Bildirim bilgilerindeki değişiklikler karşı tarafa yazılı veya kayıt altına alınabilir elektronik yöntemlerle bildirilir.",
    ],
  },
  {
    title: "Ücret, Vergiler ve Ödeme",
    paragraphs: [
      "Toplam bedel ve ödeme takvimi bu sözleşmede yer alan tabloda gösterilmiştir. Ödemeler belirtilen vadelerde ve kararlaştırılan yöntemle yapılır.",
      "Kanunen uygulanması gereken vergi, harç ve benzeri mali yükümlülükler ilgili mevzuata ve düzenlenen belgelere göre uygulanır. Vadesinde yapılmayan ödemelerde hizmet sağlayıcı, hizmeti askıya alma ve yasal haklarını kullanma hakkını saklı tutar.",
    ],
  },
  {
    title: "Gizlilik ve Kişisel Veriler",
    paragraphs: [
      "Taraflar, sözleşme kapsamında öğrendikleri ticari sırları, kişisel verileri ve gizli bilgileri yalnızca hizmetin yürütülmesi amacıyla kullanır ve yetkisiz kişilerle paylaşmaz.",
      "Kişisel veriler, uygulanabilir veri koruma mevzuatı uyarınca; belirli, açık ve meşru amaçlarla, ölçülü şekilde ve gerekli süre boyunca işlenir. İlgili kişilere yönelik aydınlatma yükümlülükleri ayrıca yerine getirilir.",
    ],
  },
  {
    title: "Mücbir Sebep",
    paragraphs: [
      "Tarafların makul kontrolü dışında gelişen; doğal afet, salgın, savaş, kamu otoritesi kararı, yaygın altyapı veya iletişim kesintisi gibi olaylar mücbir sebep sayılır. Etkilenen taraf durumu gecikmeksizin bildirir ve etkileri azaltmak için makul çabayı gösterir.",
    ],
  },
  {
    title: "Fesih ve Sonuçları",
    paragraphs: [
      "Taraflardan birinin esaslı yükümlülüğünü ihlal etmesi ve yazılı bildirime rağmen makul süre içinde ihlali gidermemesi halinde diğer taraf sözleşmeyi feshedebilir.",
      "Fesih tarihine kadar tamamlanan hizmetler ve doğmuş ödeme yükümlülükleri devam eder. Gizlilik, kişisel veriler ve fikri haklara ilişkin hükümler niteliği gereği sözleşme sonrasında da yürürlükte kalır.",
    ],
  },
  {
    title: "Elektronik Onay, Kayıtlar ve Delil",
    paragraphs: [
      "Müşteri, sözleşme ekranındaki onay kutusunu işaretleyip onay işlemini tamamladığında sözleşme elektronik ortamda kabul edilmiş sayılır. Bu işlem güvenli elektronik imza yerine geçmez; ancak tarafların irade açıklamasını ve işlem kaydını gösteren elektronik kayıt niteliğindedir.",
      "Sistem tarafından tutulan tarih, saat, kullanıcı beyanı, işlem ve doğrulama kayıtları; yürürlükteki usul hukuku çerçevesinde değerlendirilmek üzere saklanabilir.",
    ],
  },
  {
    title: "Uygulanacak Hukuk ve Uyuşmazlıklar",
    paragraphs: [
      "Sözleşmeye Türkiye Cumhuriyeti hukuku uygulanır. Emredici tüketici hükümleri saklı kalmak kaydıyla, uyuşmazlıklarda hizmet sağlayıcının merkezinin bulunduğu yer mahkemeleri ve icra daireleri yetkilidir.",
    ],
  },
];

export const arvoOSGeneralTemplate: ContractTemplate = {
  key: "arvoos_general",
  name: "ArvoOS Genel Hizmet Sözleşmesi",
  version: "1.0",
  clauses: [
    {
      title: "Sözleşmenin Konusu",
      paragraphs: [
        "Bu sözleşmenin konusu; teklif ve hizmet kapsamı bölümünde belirtilen yazılım, danışmanlık, kurulum, eğitim, bakım, destek veya diğer profesyonel hizmetlerin şartlarının belirlenmesidir.",
      ],
    },
    {
      title: "Hizmetin Yürütülmesi ve Değişiklik Yönetimi",
      paragraphs: [
        "Hizmet sağlayıcı, hizmetleri mesleki özen ve makul teknik standartlara uygun biçimde yürütür. Müşteri, hizmet için gerekli bilgi, erişim, onay ve materyalleri zamanında sağlar.",
        "Kapsam dışı talepler, süre ve ücret etkisi değerlendirilerek ayrıca yazılı onaya sunulur. Onaylanan değişiklikler sözleşmenin eki sayılır.",
      ],
    },
    {
      title: "Teslim, Kabul ve Destek",
      paragraphs: [
        "Teslim veya ara teslimler müşteriye bildirildiğinde müşteri makul süre içinde inceleme yapar ve varsa somut uygunsuzlukları bildirir. Süresinde bildirim yapılmaması, emredici hükümler saklı kalmak kaydıyla teslimin kabul edildiği şeklinde değerlendirilebilir.",
        "Bakım ve destek kapsamı, hizmet seviyeleri ve müdahale süreleri teklifte veya ek hizmet tanımında ayrıca belirlenir.",
      ],
    },
    {
      title: "Fikri ve Sınai Haklar",
      paragraphs: [
        "Hizmet sağlayıcının önceden sahip olduğu yazılım, yöntem, şablon, kütüphane, teknik bilgi ve genel amaçlı bileşenlere ilişkin haklar hizmet sağlayıcıda kalır.",
        "Müşteri için özel olarak üretilen çıktıların kullanım veya devir kapsamı teklif ve proje eklerinde belirtilir. Üçüncü taraf bileşenler kendi lisans koşullarına tabidir.",
      ],
    },
    {
      title: "Bilgi Güvenliği ve Erişimler",
      paragraphs: [
        "Taraflar, kendilerine tahsis edilen hesap ve erişim bilgilerini korur. Yetkisiz kullanım veya güvenlik olayı şüphesinde karşı taraf gecikmeksizin bilgilendirilir.",
      ],
    },
    ...commonClauses,
  ],
};

export const akademikMerkezTemplate: ContractTemplate = {
  key: "akademikmerkez_academic",
  name: "AkademikMerkez Akademik Hizmet Sözleşmesi",
  version: "1.0",
  clauses: [
    {
      title: "Sözleşmenin Konusu ve Hizmetin Niteliği",
      paragraphs: [
        "Bu sözleşme; teklif ve hizmet kapsamı bölümünde belirtilen akademik danışmanlık, dil ve biçim düzenleme, istatistiksel analiz desteği, literatür tarama desteği, yayın süreci danışmanlığı veya benzeri profesyonel destek hizmetlerinin şartlarını düzenler.",
        "Hizmet sağlayıcı, müşterinin yerine sınav, ödev, tez, makale veya akademik çalışma üretmeyi; sahte veri oluşturmayı, sonuç uydurmayı, yazarlık veya etik kuralları ihlal eden işlem yapmayı taahhüt etmez.",
      ],
    },
    {
      title: "Akademik Etik ve Müşteri Sorumluluğu",
      paragraphs: [
        "Müşteri, sunduğu veri, belge, kaynak, izin ve beyanların doğruluğundan; araştırma etiği, kurum kuralları, yazar katkısı, atıf ve telif yükümlülüklerine uygunluğundan sorumludur.",
        "Hizmetler akademik destek ve danışmanlık niteliğindedir. Nihai metnin, analizlerin, sonuçların ve teslimlerin akademik veya kurumsal mercilere sunulmasından önce müşteri tarafından kontrol edilmesi gerekir.",
      ],
    },
    {
      title: "Yayın, Kabul ve Başarı Garantisi",
      paragraphs: [
        "Dergi kabulü, tez onayı, hakem değerlendirmesi, etik kurul kararı, indekslenme, atıf, akademik unvan veya benzeri üçüncü taraf sonuçları garanti edilmez. Bu süreçler ilgili kurumların ve bağımsız değerlendiricilerin takdirindedir.",
      ],
    },
    {
      title: "Veri, Analiz ve Revizyon Süreçleri",
      paragraphs: [
        "Müşteri, analiz için gerekli ham verileri ve veri sözlüğünü eksiksiz sağlar. Veri kalitesi, örneklem, yöntem seçimi ve izinlere ilişkin sınırlamalar sonuçları etkileyebilir.",
        "Revizyon sayısı, kapsamı ve süresi teklifte belirtilir. Yeni analiz, yeni veri seti, yöntem değişikliği, ek bölüm veya kapsam genişlemesi ayrıca değerlendirilir.",
      ],
    },
    {
      title: "İntihal, Kaynaklar ve Yapay Zekâ Kullanımı",
      paragraphs: [
        "Kaynakların doğruluğu ve nihai atıf kontrolü müşteri tarafından yapılır. Benzerlik oranı tek başına akademik etik uygunluğunun ölçüsü değildir ve belirli bir oran garanti edilmez.",
        "Yapay zekâ destekli araçlar kullanılıyorsa, kullanımın kapsamı hizmetin niteliğine, kurum veya yayın politikalarına ve müşterinin talimatlarına göre belirlenir. Nihai doğrulama ve uygunluk kontrolü insan değerlendirmesiyle yapılır.",
      ],
    },
    {
      title: "Fikri Haklar ve Kullanım",
      paragraphs: [
        "Müşterinin sağladığı özgün veri ve materyaller üzerindeki haklar müşteride kalır. Hizmet sağlayıcının önceden sahip olduğu yöntem, şablon, eğitim içeriği ve genel bilgi birikimi üzerindeki haklar hizmet sağlayıcıda kalır.",
        "Teslim edilen çıktıların kullanım kapsamı hizmetin niteliğine göre belirlenir; üçüncü taraf kaynakların lisans ve telif koşulları saklıdır.",
      ],
    },
    ...commonClauses,
  ],
};

export function getContractTemplate(organizationSlug?: string | null) {
  const normalized = String(organizationSlug || "").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
  return normalized.includes("akademikmerkez") ? akademikMerkezTemplate : arvoOSGeneralTemplate;
}
