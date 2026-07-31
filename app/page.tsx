import ScrollEffects from "./scroll-effects";

const modules = [
  ["◎","CRM & Satış","Talepten teklife, sözleşmeden tahsilata satış sürecini tek akışta yönetin."],
  ["₺","Finans","Gelir, gider, cari, fatura ve nakit akışınızı gerçek zamanlı takip edin."],
  ["↗","İş Akışları","Görevleri, sorumluları ve ilerlemeyi otomatik olarak birbirine bağlayın."],
  ["◇","İnsan Kaynakları","Ekibinizi, izinleri, performansı ve organizasyon yapısını tek yerde yönetin."],
  ["▦","Raporlama","Tüm modüllerden gelen veriyi karar aldıran yönetim raporlarına dönüştürün."],
  ["⌁","Entegrasyonlar","Kullandığınız araçları ArvoOS merkezinde buluşturun, veri tekrarını bitirin."],
];

const sectors = [
  ["Sağlık Kurumları","Hasta ve danışan süreçlerinden ekip, tahsilat ve operasyon yönetimine kadar kurumunuza uyarlanan bütünsel yapı.","Randevu & Danışan","Şube Yönetimi","Finans"],
  ["Eğitim Kurumları","Aday, öğrenci, kayıt, ödeme ve eğitim operasyonlarını aynı sistem üzerinden güvenle yönetin.","Aday & Kayıt","Öğrenci Takibi","Tahsilat"],
  ["Danışmanlık & Hizmet","Müşteri taleplerini projeye, projeleri ölçülebilir iş akışlarına ve sürdürülebilir gelire dönüştürün.","CRM","Proje Akışları","Sözleşmeler"],
  ["Çok Şubeli İşletmeler","Tüm lokasyonları ortak standartlarla yönetin; merkezden görün, yerelde hızla harekete geçin.","Şube Performansı","Yetkilendirme","Merkezi Raporlama"],
];

const Logo=()=> <span className="logo"><img src="/arvoos-logo.png" alt="ArvoOS"/></span>;

export default function Home(){
return <main id="top">
  <ScrollEffects/>
  <header><a className="brand" href="#top"><Logo/></a><nav><a href="#urun">Ürün</a><a href="#moduller">Modüller</a><a href="#sektorler">Sektörler</a><a href="#cozumler">Çözümler</a><a href="#fiyat">Paketler</a></nav><div className="head"><a href="#giris">Giriş Yap</a><a className="btn sm" href="#demo">Demo Talep Et</a></div><details><summary>☰</summary><div><a href="#urun">Ürün</a><a href="#moduller">Modüller</a><a href="#sektorler">Sektörler</a><a href="#cozumler">Çözümler</a><a href="#demo">Demo Talep Et</a></div></details></header>

  <section className="hero">
    <div className="hero-copy"><div className="kicker">HİZMET İŞLETMELERİ İÇİN YENİ NESİL YÖNETİM SİSTEMİ</div><h1>İşletmenizi büyüten her süreç. <em>ArvoOS ile uyum içinde.</em></h1><p>Müşteri deneyiminden finansa, ekip yönetiminden günlük operasyonlara kadar işletmenizin tamamını daha hızlı, görünür ve kârlı yönetin.</p><div className="actions"><a className="btn" href="#demo">Size Özel Demoyu Görün →</a><a className="btn ghost" href="#sektorler">Sektörünüzü Keşfedin</a></div><div className="trust"><span>AY</span><span>MK</span><span>SE</span><p><b>Kontrol sizde, süreçler uyum içinde</b><br/>Ekibiniz için güçlü bir çalışma deneyimi</p></div></div>
    <div className="stage">
      <div className="dash"><aside><b>A</b><i>⌂</i><i>▦</i><i>▥</i><i>♙</i><i>✓</i><i>⚙</i></aside><div className="dashbody"><div className="dashtop"><b>Genel Bakış</b><span>Hoş geldiniz, Arvo Yöneticisi</span><i>●</i></div><div className="metrics"><div><small>Toplam Ciro</small><b>₺32.450.000</b><em>↑ %18.6</em></div><div><small>Tahsilat</small><b>%87.4</b><em>↑ %6.3</em></div><div><small>Açık Fatura</small><b>₺4.210.000</b><em>↓ %12.4</em></div></div><div className="chart"><b>Ciro Trendi</b><div>{[20,35,47,60,72,88].map(n=><i key={n} style={{height:`${n}%`}}/>)}</div><small>Şub　 Mar　 Nis　 May　 Haz　 Tem</small></div><div className="metrics two"><div><small>Toplam Müşteri</small><b>1.240</b><em>↑ %14.2</em></div><div><small>Tamamlanan İş Akışı</small><b>356</b><em>↑ %22.1</em></div></div></div></div>
      <div className="float crm"><h3><i>♙</i> CRM <span>•••</span></h3><small>Satış Pipeline&apos;ı</small><section><b>32<small>Yeni</small></b><b>18<small>Teklif</small></b><b>14<small>Görüşme</small></b><b>9<small>Kazanıldı</small></b></section><hr/></div>
      <div className="float finance"><h3><i>₺</i> Finans <span>•••</span></h3><small>Net Nakit Akışı</small><section><b>₺28.6M<small>Giriş</small></b><b>₺18.3M<small>Çıkış</small></b><b>₺10.3M<small>Net Nakit</small></b></section></div>
      <div className="float hr"><h3><i>◇</i> İK <span>•••</span></h3><section><div className="donut"><b>186<small>Çalışan</small></b></div><p>● Operasyon　<b>56</b><br/>● Satış　　　　<b>42</b><br/>● Finans　　　 <b>28</b></p></section></div>
    </div>
  </section>

  <section className="formula"><p>Dağınık araçlardan <b>tek bir operasyon merkezine</b></p><div>CRM ＋ Finans ＋ İK ＋ İş Akışları ＝ <b>ArvoOS</b></div></section>
  <section className="section intro" id="urun"><div className="kicker">ARVOOS İLE ÇALIŞMANIN YENİ YOLU</div><h2>Ekibiniz aynı hedefe odaklanır.<em>İşletmeniz daha güçlü ilerler.</em></h2><p className="lead">ArvoOS; dağınık iş adımlarını sade, bağlantılı ve yönetilebilir bir düzene dönüştürür. Ekibiniz operasyon yüküyle değil, müşterileriniz ve büyümenizle ilgilenir.</p><div className="benefits"><article><small>01</small><h3>Kesintisiz iş birliği</h3><p>Departmanlar güncel bilgilere anında ulaşır, işler beklemeden ilerler.</p></article><article><small>02</small><h3>Size göre şekillenir</h3><p>İhtiyacınız olan modüllerle başlayın, işletmeniz büyüdükçe genişleyin.</p></article><article><small>03</small><h3>Sonuç odaklı yönetim</h3><p>Performansı net görün, fırsatları erken yakalayın ve güvenle karar verin.</p></article></div></section>

  <section className="modules" id="moduller"><div className="section"><div className="sectionhead"><div><div className="kicker">BAĞLANTILI MODÜLLER</div><h2>İhtiyacınız kadar başlayın.<em>Birlikte büyütün.</em></h2></div><p>Her modül tek başına güçlü, birlikte ise işletmenizin tamamını yöneten kusursuz bir sistem.</p></div><div className="modulegrid">{modules.map(([icon,title,text],i)=><article className={i===0?"featured":""} key={title}><span>{icon}</span><small>BAĞLANTILI MODÜL</small><h3>{title}</h3><p>{text}</p><a href="#demo">İncele ↗</a></article>)}</div></div></section>

  <section className="section sectors" id="sektorler"><div className="sectionhead"><div><div className="kicker">SEKTÖRÜNÜZE UYARLANAN ARVOOS</div><h2>Her işletmenin işleyişi farklı.<em>ArvoOS buna hazır.</em></h2></div><p>Modüller, ekranlar ve iş akışları kurumunuzun çalışma modeline göre yapılandırılır. Böylece genel bir yazılım değil, işletmenize ait bir yönetim sistemi kullanırsınız.</p></div><div className="sectorgrid">{sectors.map(([title,text,...tags],i)=><article key={title}><small>0{i+1}</small><h3>{title}</h3><p>{text}</p><div>{tags.map(tag=><span key={tag}>{tag}</span>)}</div><a href="#demo">Sektör çözümünü inceleyin →</a></article>)}</div></section>

  <section className="section solution" id="cozumler"><div><div className="kicker">YÖNETİCİLER İÇİN TASARLANDI</div><h2>Operasyonun nabzı<em>her an elinizde.</em></h2><p className="lead">Eksik bilgiyle karar vermeyin. Kritik göstergeler ve darboğazlar siz sormadan önünüze gelsin.</p><ul><li>✓　Gerçek zamanlı yönetim görünümü</li><li>✓　Rol bazlı güvenli erişim</li><li>✓　Otomatik bildirim ve onay akışları</li></ul></div><div className="insight"><div className="insighthead"><b>Yönetici Özeti</b><small>Bugün, 09:41</small></div><div className="score"><p><small>Operasyon Skoru</small><b>92<sup>/100</sup></b></p><span>92</span></div><article>↗ <p><b>Satış dönüşümü yükseldi</b><small>Geçen aya göre %8,4 artış</small></p></article><article>! <p><b>3 iş akışı dikkat bekliyor</b><small>Termin riski oluşmadan aksiyon alın</small></p></article><article>✓ <p><b>Tahsilat hedefi yakalandı</b><small>Aylık hedefin %104&apos;ü tamamlandı</small></p></article></div></section>

  <section className="price" id="fiyat"><div><div className="kicker">İŞLETMENİZE ÖZEL</div><h2>İhtiyacınız kadar başlayın.<br/>Gücünüz kadar büyüyün.</h2></div><p>Modüllerinizi, kullanıcı sayınızı ve kurumunuza özel akışları birlikte belirleyelim. En üst pakette ArvoOS deneyimini kendi alan adınız ve kurumsal kimliğinizle müşterilerinize sunun.</p><div className="priceaction"><span>◆ Kurumunuza özel alan adı</span><a className="btn white" href="#demo">Planınızı Oluşturun →</a></div></section>
  <section className="demo" id="demo"><div className="democard"><div><div className="kicker">ARVOOS’U YAKINDAN TANIYIN</div><h2>İşletmenizi tek sistemde<em>buluşturmaya hazır mısınız?</em></h2><p>30 dakikalık kişisel demoda süreçlerinizi dinleyelim ve ArvoOS’un işletmenizde nasıl çalışacağını gösterelim.</p></div><form><label>Ad Soyad<input placeholder="Adınız ve soyadınız"/></label><label>İş E-postası<input type="email" placeholder="siz@sirketiniz.com"/></label><label>Telefon<input placeholder="+90 5__ ___ __ __"/></label><label>Şirket<input placeholder="Şirket adı"/></label><button type="button" className="btn">Demo Talebini Gönder →</button><small>Bilgileriniz yalnızca demo talebiniz için kullanılır.</small></form></div></section>
  <footer><div><Logo/><p>İşletmenizin tüm operasyonunu birbirine bağlayan yeni nesil yönetim sistemi.</p></div><nav><b>Ürün</b><a href="#urun">ArvoOS nedir?</a><a href="#moduller">Modüller</a><a href="#cozumler">Çözümler</a></nav><nav><b>Şirket</b><a href="#demo">Demo talep et</a><a href="mailto:merhaba@arvo-os.com">İletişim</a></nav><nav><b>Yasal</b><a href="#top">Gizlilik</a><a href="#top">KVKK</a></nav><small>© 2026 ArvoOS. Tüm hakları saklıdır.</small></footer>
</main>}
