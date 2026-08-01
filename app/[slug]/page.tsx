import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type PageData = {
  eyebrow: string;
  title: string;
  accent: string;
  intro: string;
  stats: [string,string][];
  sections: { title:string; text:string; items:string[] }[];
};

const pages: Record<string, PageData> = {
  urun: {
    eyebrow:"KURUMSAL İŞLETİM SİSTEMİ", title:"İşletmenizin tamamı", accent:"tek çalışma düzeninde.", intro:"ArvoOS; satıştan finansa, ekipten operasyona kadar dağınık süreçleri ortak veri, ortak sorumluluk ve ölçülebilir sonuçlarla birleştirir.",
    stats:[["Tek merkez","Tüm departmanlar"],["Gerçek zamanlı","Yönetim görünümü"],["Kuruma özel","Rol ve iş akışları"]],
    sections:[
      {title:"Süreçler birbirini tamamlar",text:"Bir departmanda başlayan işlem, tekrar veri girişi olmadan bir sonraki ekibe aktarılır.",items:["Talep → teklif → sözleşme","Ödeme → iş akışı → teslim","Performans → rapor → karar"]},
      {title:"Her ekip için ortak çalışma alanı",text:"Yöneticiler bütünü görürken ekipler yalnızca sorumlu oldukları işlemlere erişir.",items:["Rol bazlı yetkilendirme","Şube ve kurum ayrımı","Kayıt geçmişi ve izlenebilirlik"]},
      {title:"İşletmenizle birlikte gelişir",text:"İhtiyacınız olan modüllerle başlayın; kullanıcı, şube ve süreç sayınız arttıkça sistemi genişletin.",items:["Modüler kurulum","Kuruma özel otomasyon","Entegrasyona hazır yapı"]}
    ]
  },
  moduller: {
    eyebrow:"BAĞLANTILI MODÜLLER", title:"Ayrı araçlar değil,", accent:"birlikte çalışan modüller.", intro:"Her modül kendi işini güçlü biçimde yapar; ArvoOS çekirdeğinde birleştiğinde işletmenizin uçtan uca çalışma sistemine dönüşür.",
    stats:[["CRM & Satış","Talep ve teklif"],["Finans","Gelir ve tahsilat"],["Operasyon","İş ve görev takibi"]],
    sections:[
      {title:"CRM & Satış",text:"Talebi müşteriye, müşteriyi gelire dönüştüren bütün satış akışı.",items:["Talep ve müşteri kayıtları","Teklif ve sözleşme yönetimi","E-posta, WhatsApp ve müşteri onayı"]},
      {title:"Finans",text:"Güncel finansal tabloyu satış ve operasyon verileriyle birlikte izleyin.",items:["Gelir, gider ve cari hesap","Fatura ve tahsilat takibi","Nakit akışı ve raporlama"]},
      {title:"İş Akışları",text:"Her işi sorumlu, termin ve tamamlanma oranıyla görünür hâle getirin.",items:["Görev ve kontrol listeleri","Otomatik aşama geçişleri","Gecikme ve risk bildirimleri"]},
      {title:"İnsan Kaynakları",text:"Ekip yapısı, izinler ve performans süreçlerini ortak düzende yönetin.",items:["Çalışan ve birim yapısı","İzin ve devam süreçleri","Performans görünümü"]},
      {title:"Raporlama",text:"Farklı modüllerden gelen veriyi anlaşılır yönetim göstergelerine dönüştürün.",items:["Canlı yönetici özeti","Şube ve ekip karşılaştırması","Dışa aktarılabilir raporlar"]},
      {title:"Entegrasyonlar",text:"Kurumunuzun kullandığı servisleri tek veri akışında buluşturun.",items:["E-posta ve mesajlaşma","Ödeme ve muhasebe bağlantıları","API tabanlı özel entegrasyonlar"]}
    ]
  },
  sektorler: {
    eyebrow:"SEKTÖRÜNÜZE UYARLANIR", title:"Genel bir yazılım değil,", accent:"kurumunuza ait bir sistem.", intro:"ArvoOS’un modülleri, ekranları ve yetkileri sektörünüzün gerçek çalışma biçimine göre yapılandırılır.",
    stats:[["Sağlık","Danışan ve şube"],["Eğitim","Aday ve öğrenci"],["Hizmet","Müşteri ve proje"]],
    sections:[
      {title:"Sağlık Kurumları",text:"Danışan, randevu, ekip, şube ve tahsilat süreçlerini bütünsel yönetin.",items:["Danışan ve randevu akışları","Şube ve personel yönetimi","Tahsilat ve performans"]},
      {title:"Eğitim Kurumları",text:"Adaydan kayda, öğrenciden ödemeye kadar eğitim operasyonunu birleştirin.",items:["Aday ve kayıt yönetimi","Öğrenci süreçleri","Ödeme planı ve tahsilat"]},
      {title:"Danışmanlık & Hizmet",text:"Müşteri taleplerini planlı, ölçülebilir ve kârlı projelere dönüştürün.",items:["CRM ve teklif yönetimi","Proje ve teslim akışları","Sözleşme ve finans"]},
      {title:"Çok Şubeli İşletmeler",text:"Merkezi standartları korurken her şubenin kendi operasyonunu hızlandırın.",items:["Merkezden ortak görünüm","Şube bazlı yetkilendirme","Karşılaştırmalı performans"]}
    ]
  },
  cozumler: {
    eyebrow:"İŞLETME İHTİYAÇLARI", title:"Her darboğaza", accent:"bağlantılı bir çözüm.", intro:"ArvoOS yalnızca kayıt tutmaz; satış, finans ve operasyon arasındaki kopuklukları gidererek işin doğru zamanda doğru kişiye ulaşmasını sağlar.",
    stats:[["Satış","Daha hızlı dönüşüm"],["Operasyon","Net sorumluluk"],["Yönetim","Erken risk görünümü"]],
    sections:[
      {title:"Satış ve müşteri yönetimi",text:"Fırsatları kaybetmeden takip edin, teklif ve sözleşme süreçlerini hızlandırın.",items:["Merkezi müşteri geçmişi","Onay ve imza bağlantıları","Satış aşaması otomasyonu"]},
      {title:"Operasyon yönetimi",text:"Satışı tamamlanan işi ekiplerin uygulayabileceği standart akışa dönüştürün.",items:["Otomatik iş akışı açılışı","Sorumlu ve termin takibi","Tamamlanma oranı"]},
      {title:"Finansal kontrol",text:"Geliri, tahsilatı ve yükümlülükleri gerçekleştiği anda görün.",items:["Satış-finans bağlantısı","Vade ve tahsilat görünümü","Yönetici finans özeti"]},
      {title:"Kurumsal yönetişim",text:"Yetki, kayıt ve raporlama düzenini büyüyen kurum yapısına uygun kurun.",items:["Rol bazlı güvenlik","Kurum ve şube izolasyonu","Denetlenebilir işlem geçmişi"]}
    ]
  },
  paketler: {
    eyebrow:"ESNEK PAKET YAPISI", title:"İhtiyacınız kadar başlayın,", accent:"gücünüz kadar büyüyün.", intro:"Paketiniz; gerekli modüller, kullanıcı sayısı, şube yapısı ve kuruma özel iş akışlarına göre birlikte belirlenir.",
    stats:[["Başlangıç","Temel süreçler"],["Kurumsal","Bağlantılı yönetim"],["Özel","Markanıza ait deneyim"]],
    sections:[
      {title:"Başlangıç",text:"Temel müşteri, iş ve finans süreçlerini tek düzende yönetmek isteyen ekipler için.",items:["Seçili temel modüller","Standart rol yapısı","Kurulum ve başlangıç desteği"]},
      {title:"Kurumsal",text:"Birden çok ekip veya şubeyi bağlantılı süreçlerle yönetmek isteyen kurumlar için.",items:["Geniş modül seçimi","Gelişmiş raporlama","Şube ve yetki yönetimi"]},
      {title:"Özel Kurum",text:"ArvoOS’u kendi çalışma modeli ve kurumsal kimliğiyle kullanmak isteyen yapılar için.",items:["Kuruma özel iş akışları","Özel entegrasyonlar","Kuruma özel alan adı"]},
      {title:"Doğru planı birlikte oluşturalım",text:"İhtiyacınız olmayan özelliklere değil, doğrudan iş sonuçlarınıza yatırım yapın.",items:["İhtiyaç analizi","Kişisel ürün demosu","Ölçeklenebilir geçiş planı"]}
    ]
  }
};

export function generateStaticParams(){ return Object.keys(pages).map(slug=>({slug})); }

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params; const page=pages[slug]; if(!page) return {};
  return {title: page.title+" "+page.accent, description:page.intro};
}

const Logo=()=> <span className="logo"><img src="/arvoos-logo.png" alt="ArvoOS"/></span>;

export default async function MarketingPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params; const page=pages[slug]; if(!page) notFound();
  return <main className="corporate-page">
    <header>
      <Link className="brand" href="/"><Logo/></Link>
      <nav><Link href="/urun">Ürün</Link><Link href="/moduller">Modüller</Link><Link href="/sektorler">Sektörler</Link><Link href="/cozumler">Çözümler</Link><Link href="/paketler">Paketler</Link></nav>
      <div className="head"><Link href="/panel">Giriş Yap</Link><Link className="btn sm" href="/#demo">Demo Talep Et</Link></div>
      <details><summary>☰</summary><div><Link href="/urun">Ürün</Link><Link href="/moduller">Modüller</Link><Link href="/sektorler">Sektörler</Link><Link href="/cozumler">Çözümler</Link><Link href="/paketler">Paketler</Link><Link href="/#demo">Demo Talep Et</Link></div></details>
    </header>
    <section className="page-hero"><div><div className="kicker">{page.eyebrow}</div><h1>{page.title}<em>{page.accent}</em></h1><p>{page.intro}</p><div className="actions"><Link className="btn" href="/#demo">Size Özel Demoyu Görün →</Link><Link className="btn ghost" href="/moduller">Modülleri İnceleyin</Link></div></div></section>
    <section className="page-stats">{page.stats.map(([value,label])=><div key={value}><b>{value}</b><span>{label}</span></div>)}</section>
    <section className="page-content"><div className="sectionhead"><div><div className="kicker">ARVOOS YAKLAŞIMI</div><h2>İşletmeniz için net,<em>ölçeklenebilir ve güçlü.</em></h2></div><p>Kurulumdan günlük kullanıma kadar her adım, ekibinizin daha kolay çalışması ve yöneticilerin daha güvenli karar vermesi için tasarlanır.</p></div><div className="page-grid">{page.sections.map((section,i)=><article key={section.title}><small>0{i+1}</small><h3>{section.title}</h3><p>{section.text}</p><ul>{section.items.map(item=><li key={item}>✓ {item}</li>)}</ul></article>)}</div></section>
    <section className="page-cta"><div><div className="kicker">KURUMUNUZA ÖZEL DEMO</div><h2>ArvoOS’un işletmenizde nasıl çalışacağını birlikte tasarlayalım.</h2></div><Link className="btn white" href="/#demo">Demo Talep Edin →</Link></section>
    <footer><div><Logo/><p>İşletmenizin tüm operasyonunu birbirine bağlayan yeni nesil yönetim sistemi.</p></div><nav><b>Ürün</b><Link href="/urun">ArvoOS nedir?</Link><Link href="/moduller">Modüller</Link><Link href="/cozumler">Çözümler</Link></nav><nav><b>Sektörler</b><Link href="/sektorler">Sektör çözümleri</Link><Link href="/paketler">Paketler</Link></nav><nav><b>Şirket</b><Link href="/#demo">Demo talep et</Link><a href="mailto:merhaba@arvo-os.com">İletişim</a></nav><small>© 2026 ArvoOS. Tüm hakları saklıdır.</small></footer>
  </main>;
}
