const Arrow = () => <span aria-hidden="true">↗</span>;
const Logo = ({ light = false }: { light?: boolean }) => (
  <span className={"logo" + (light ? " logo-light" : "")}>
    <img src="/arvoos-logo.png" alt="ArvoOS" />
  </span>
);

const products = [
  {
    id: "01", name: "ArvoOS", label: "Kurumsal işletim sistemi", tone: "dark",
    title: "İşletmenizin tamamı. Tek bir akışta.",
    text: "CRM, teklifler, sözleşmeler, finans, ekipler ve operasyonlar için birbirine bağlı yönetim sistemi.",
    features: ["CRM ve satış", "Finans ve sözleşmeler", "Ekip ve operasyon"],
    href: "https://app.arvo-os.com", action: "ArvoOS’a giriş"
  },
  {
    id: "02", name: "ArvoLab", label: "Research operating system", tone: "light",
    title: "Araştırma için daha güçlü bir çalışma alanı.",
    text: "Literatürden akademik yazıma, belge kontrolünden veri analizine kadar bilimsel üretimin her aşaması.",
    features: ["Literatür ve atıf", "Akademik yazım", "Nicel ve nitel analiz"],
    href: "#iletisim", action: "ArvoLab’i keşfet"
  }
];

export default function Home() {
  return <main>
    <header className="topbar">
      <nav className="shell nav" aria-label="Ana menü">
        <a href="#top" aria-label="ArvoOS ana sayfa"><Logo /></a>
        <div className="nav-links"><a href="#urunler">Ürünler</a><a href="#vizyon">Vizyon</a><a href="#ekosistem">Ekosistem</a></div>
        <a className="pill pill-dark" href="#iletisim">Bize ulaşın <Arrow /></a>
      </nav>
    </header>

    <section className="hero shell" id="top">
      <p className="overline">ARVO ÜRÜN EKOSİSTEMİ</p>
      <h1>Daha iyi çalışmak için<br/><span>daha iyi sistemler.</span></h1>
      <p className="hero-lead">Arvo; kurumların ve akademik ekiplerin karmaşık süreçlerini sakin, güçlü ve kusursuz çalışma deneyimlerine dönüştürür.</p>
      <div className="hero-actions"><a className="pill pill-dark" href="#urunler">Ürünleri keşfedin <span>↓</span></a><span>ArvoOS · ArvoLab · ve daha fazlası</span></div>
      <div className="hero-canvas" aria-label="Arvo ürün ailesi">
        <div className="halo halo-a"/><div className="halo halo-b"/>
        <div className="canvas-copy"><small>TEK VİZYON</small><strong>ARVO</strong><p>Bağlantılı ürünler.<br/>Sınırsız olasılık.</p></div>
        <div className="device device-os"><div className="device-head"><b>ArvoOS</b><span>● ● ●</span></div><div className="device-grid"><i/><i/><i/></div><div className="device-chart">{[42,68,54,82,76,96].map(n=><i key={n} style={{height:n+"%"}}/>)}</div></div>
        <div className="device device-lab"><div className="device-head"><b>ArvoLab</b><span>RESEARCH</span></div><div className="lab-lines"><i/><i/><i/><i/></div><div className="lab-score"><span>Analiz</span><b>98<small>%</small></b></div></div>
      </div>
    </section>

    <section className="statement shell" id="vizyon">
      <p className="overline">TEKNOLOJİ, İNSAN İÇİN</p>
      <h2>Karmaşıklığı arka planda bırakır.<br/><span>Size yalnızca ilerlemek kalır.</span></h2>
      <div className="statement-copy"><p>Her Arvo ürünü tek bir ilkeyle tasarlanır: en kapsamlı süreçleri bile doğal ve anlaşılır hissettirmek.</p><p>Kurumunuz büyürken ürün ailesi de sizinle birlikte genişler.</p></div>
    </section>

    <section className="product-section" id="urunler">
      <div className="shell">
        <div className="section-heading"><div><p className="overline">ÜRÜN AİLESİ</p><h2>Bugün için güçlü.<br/>Yarın için hazır.</h2></div><p>Her biri kendi alanında uzman. Birlikte, çalışma biçiminizin tamamını dönüştüren bir ekosistem.</p></div>
        <div className="product-grid">
          {products.map(product => <article className={"product-card "+product.tone} key={product.name}>
            <div className="card-top"><span>{product.id}</span><small>{product.label}</small></div>
            <div className="card-brand">{product.name === "ArvoOS" ? <Logo light /> : <strong>ARVO<span>LAB</span></strong>}</div>
            <div className="card-content"><h3>{product.title}</h3><p>{product.text}</p><ul>{product.features.map(f=><li key={f}>{f}</li>)}</ul></div>
            <a href={product.href} target={product.href.startsWith("http")?"_blank":undefined} rel="noreferrer">{product.action} <Arrow /></a>
            <div className="card-glow" aria-hidden="true"/>
          </article>)}
        </div>
      </div>
    </section>

    <section className="ecosystem shell" id="ekosistem">
      <div className="eco-intro"><p className="overline">BÜYÜYEN EKOSİSTEM</p><h2>İki ürün.<br/>Tek başlangıç.</h2><p>Arvo ürün ailesi, geleceğin çalışma ihtiyaçlarına göre büyümek üzere tasarlandı.</p></div>
      <div className="eco-map">
        <div className="eco-center">ARVO</div>
        <div className="eco-node node-one"><small>01</small><b>ArvoOS</b><span>Operasyon</span></div>
        <div className="eco-node node-two"><small>02</small><b>ArvoLab</b><span>Araştırma</span></div>
        <div className="eco-node node-three"><small>03+</small><b>Yeni ürünler</b><span>Yakında</span></div>
      </div>
    </section>

    <section className="values">
      <div className="shell value-grid">
        <article><span>01</span><h3>Sade</h3><p>Gereksiz hiçbir şey yok. İhtiyacınız olan her şey tam yerinde.</p></article>
        <article><span>02</span><h3>Güçlü</h3><p>Kritik süreçler için güvenilir, kontrollü ve ölçeklenebilir altyapı.</p></article>
        <article><span>03</span><h3>Bütünsel</h3><p>Ürünler, ekipler ve veriler arasında kesintisiz bir çalışma düzeni.</p></article>
      </div>
    </section>

    <footer id="iletisim">
      <div className="shell footer-main"><Logo light/><h2>Geleceğin çalışma<br/>sistemlerini birlikte kuralım.</h2><a className="pill pill-light" href="mailto:info@arvo-os.com">İletişime geçin <Arrow /></a></div>
      <div className="shell footer-bottom"><p>ArvoCulture Group Teknoloji Sanayi ve Ticaret Limited Şirketi</p><div><a href="#urunler">Ürünler</a><a href="#vizyon">Vizyon</a><a href="mailto:info@arvo-os.com">info@arvo-os.com</a></div><small>© 2026 ArvoCulture Group</small></div>
    </footer>
  </main>;
}
