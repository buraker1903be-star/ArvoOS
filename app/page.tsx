const products = [
  {
    no: "01", name: "ARVO", suffix: "OS", tag: "AKTİF ÜRÜN", kind: "os",
    title: <>Akademik operasyonlarınızı<br />tek merkezden yönetin.</>,
    copy: "CRM, teklif, sözleşme, finans, ekip ve iş akışları için uçtan uca kurum yönetim paneli.",
    items: ["CRM, talep ve teklif yönetimi", "Finans, sözleşme ve iş akışları", "Ekip ve kurum operasyonları"],
    link: "https://app.arvo-os.com", cta: "ArvoOS’a git"
  },
  {
    no: "02", name: "ARVO", suffix: "LAB", tag: "YENİ ÜRÜN", kind: "lab",
    title: <>Araştırmayı veriden<br />bilimsel çıktıya taşıyın.</>,
    copy: "Literatürden akademik yazıma, belge kontrolünden istatistiksel analize kadar bilimsel üretimi izlenebilir bir alanda buluşturan araştırma paneli.",
    items: ["Literatür, atıf ve kılavuz kontrolü", "Nicel ve nitel analiz merkezi", "Akademik yazım ve özgünlük ön kontrolü"],
    link: "#iletisim", cta: "ArvoLab’i keşfet"
  }
];

const Arrow = () => <span aria-hidden="true">↗</span>;
const Mark = () => <span className="mark" aria-hidden="true"><i /><i /><i /></span>;

export default function Home() {
  return <main>
    <nav className="nav shell" aria-label="Ana menü">
      <a className="brand" href="#top" aria-label="Arvo ana sayfa"><Mark /><span>ARVO</span></a>
      <div className="nav-links"><a href="#urunler">Ürünler</a><a href="#yaklasim">Yaklaşım</a><a href="#gelecek">Ekosistem</a><a href="#iletisim">İletişim</a></div>
      <a className="nav-cta" href="#urunler">Ürünleri keşfet <Arrow /></a>
    </nav>

    <section className="hero shell" id="top">
      <div className="eyebrow"><span>✦</span> ARVO AKADEMİK ÇALIŞMA EKOSİSTEMİ</div>
      <div className="hero-grid">
        <h1>Akademik çalışmanın<br />yeni ekosistemi.</h1>
        <div className="hero-copy">
          <p>Operasyondan araştırmaya, bugünün ve yarının akademik çalışma ihtiyaçlarını amaç odaklı ürünlerle tek bir çatı altında buluşturuyoruz.</p>
          <a className="text-link" href="#urunler">Ekosistemi incele <span>↓</span></a>
        </div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="orbit one" /><div className="orbit two" /><div className="hero-word">ARVO</div>
        <div className="signal signal-a"><b>01</b><span>OPERASYON</span></div>
        <div className="signal signal-b"><b>02</b><span>ARAŞTIRMA</span></div>
        <div className="signal signal-c"><b>+</b><span>YENİ ÜRÜNLER</span></div>
        <div className="core"><Mark /></div>
      </div>
      <div className="hero-foot"><span>BÜYÜYEN ÜRÜN AİLESİ</span><span>TEK EKOSİSTEM</span><span>AKADEMİK ODAK</span></div>
    </section>

    <section className="intro shell" id="urunler">
      <div className="section-index">01 / ÜRÜNLER</div>
      <div><p className="kicker">ARVO ÜRÜN AİLESİ</p><h2>Her ihtiyaca özel bir ürün.<br />Hepsinde aynı Arvo yaklaşımı.</h2></div>
    </section>

    <section className="products shell">
      {products.map((p) => <article className={"product product-" + p.kind} key={p.suffix}>
        <div className="product-top"><span>{p.no}</span><span className="status">{p.tag}</span></div>
        <div className="product-logo"><Mark /><span>{p.name}<em>{p.suffix}</em></span></div>
        <h3>{p.title}</h3><p>{p.copy}</p>
        <ul>{p.items.map(item => <li key={item}>{item}</li>)}</ul>
        <a className="product-link" href={p.link} target={p.link.startsWith("http") ? "_blank" : undefined} rel={p.link.startsWith("http") ? "noreferrer" : undefined}>{p.cta} <Arrow /></a>
        <div className={"pattern pattern-" + p.kind} aria-hidden="true"><span /><span /><span /><span /></div>
      </article>)}
      <article className="product future-card" id="gelecek">
        <div className="product-top"><span>03 →</span><span className="status">EKOSİSTEM BÜYÜYOR</span></div>
        <div className="future-plus">+</div>
        <h3>Yeni ihtiyaçlar,<br />yeni Arvo ürünleri.</h3>
        <p>Arvo ürün ailesi sabit değil. Gelecekte eklenecek her ürün; ortak tasarım dili, bağlantılı süreçler ve aynı akademik odakla bu ekosistemde yerini alacak.</p>
        <a className="product-link" href="#iletisim">Gelişmelerden haberdar olun <Arrow /></a>
      </article>
    </section>

    <section className="philosophy" id="yaklasim"><div className="shell philosophy-grid">
      <div className="section-index light">02 / YAKLAŞIM</div>
      <div><p className="kicker blue">NEDEN ARVO?</p><h2>Akademik süreçler karmaşık olabilir.<br />Kullandığınız sistem olmak zorunda değil.</h2>
        <div className="principles">
          <div><b>01</b><h3>Net</h3><p>Her rol için doğru bilgi, doğru anda.</p></div>
          <div><b>02</b><h3>Kontrollü</h3><p>Süreçlerin her aşamasında görünürlük.</p></div>
          <div><b>03</b><h3>Birlikte</h3><p>Ürünler ve çalışmalar arasında bütünlük.</p></div>
        </div>
      </div>
    </div></section>

    <section className="ecosystem shell">
      <div className="section-index">03 / EKOSİSTEM</div>
      <div><p className="kicker">BÜTÜNSEL ÇALIŞMA MODELİ</p><h2>Her ürün kendi işini iyi yapar.<br />Arvo çatısı hepsini birleştirir.</h2>
        <div className="eco-flow">
          <div><small>KURUMSAL SÜREÇ</small><strong>ArvoOS</strong></div><span>+</span>
          <div><small>ARAŞTIRMA SÜRECİ</small><strong>ArvoLab</strong></div><span>+</span>
          <div className="eco-result"><small>GELECEK ÜRÜNLER</small><strong>Büyüyen<br />ekosistem</strong></div>
        </div>
      </div>
    </section>

    <footer id="iletisim">
      <div className="shell footer-top"><p className="kicker blue">ARVO İLE TANIŞIN</p><h2>Çalışma biçiminizi<br />birlikte dönüştürelim.</h2><a href="mailto:info@arvo-os.com" className="footer-cta">Bize ulaşın <Arrow /></a></div>
      <div className="shell footer-bottom"><div className="brand"><Mark /><span>ARVO</span></div><p>Akademik çalışmanın büyüyen ürün ekosistemi.</p><div><a href="#urunler">Ürünler</a><a href="#yaklasim">Yaklaşım</a><a href="mailto:info@arvo-os.com">İletişim</a></div><small>© 2026 ArvoCulture Group. Tüm hakları saklıdır.</small></div>
    </footer>
  </main>;
}
