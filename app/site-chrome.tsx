const Arrow = () => <span aria-hidden="true">↗</span>;

export const links = {
  arvoOSLogin: "https://app.arvo-os.com/login",
  arvoLabLogin: "https://lab.arvo-os.com",
};

export function Logo({ light = false }: { light?: boolean }) {
  return <span className={"logo" + (light ? " logo-light" : "")}><img src="/arvoos-logo.png" alt="ArvoOS" /></span>;
}

export function SiteHeader() {
  return <header className="topbar">
    <nav className="shell nav" aria-label="Ana menü">
      <a href="/" aria-label="Arvo ana sayfa"><Logo /></a>
      <div className="nav-links">
        <a href="/urunler/arvoos">ArvoOS</a><a href="/urunler/arvolab">ArvoLab</a><a href="/hizmetler">Hizmetler</a><a href="/hakkimizda">Hakkımızda</a><a href="/iletisim">İletişim</a>
      </div>
      <div className="nav-actions">
        <a className="login-link" href={links.arvoLabLogin} target="_blank" rel="noreferrer">ArvoLab Giriş</a>
        <a className="pill pill-dark" href={links.arvoOSLogin} target="_blank" rel="noreferrer">ArvoOS Giriş <Arrow /></a>
      </div>
      <details className="mobile-menu">
        <summary aria-label="Menüyü aç veya kapat"><span></span><span></span><span></span></summary>
        <div className="mobile-menu-panel">
          <div className="mobile-menu-label">Ürünler</div>
          <a href="/urunler/arvoos">ArvoOS <Arrow /></a>
          <a href="/urunler/arvolab">ArvoLab <Arrow /></a>
          <div className="mobile-menu-label">Kurumsal</div>
          <a href="/hizmetler">Hizmetler <Arrow /></a>
          <a href="/hizmetler/web-sitesi-tasarimi">Web sitesi tasarımı <Arrow /></a>
          <a href="/hakkimizda">Hakkımızda <Arrow /></a>
          <a href="/iletisim">İletişim <Arrow /></a>
          <div className="mobile-menu-actions">
            <a className="pill pill-outline" href={links.arvoLabLogin} target="_blank" rel="noreferrer">ArvoLab Giriş</a>
            <a className="pill pill-dark" href={links.arvoOSLogin} target="_blank" rel="noreferrer">ArvoOS Giriş <Arrow /></a>
          </div>
        </div>
      </details>
    </nav>
  </header>;
}

export function SiteFooter() {
  return <footer>
    <div className="shell footer-main"><Logo light/><h2>Geleceğin çalışma<br/>sistemlerini birlikte kuralım.</h2><a className="pill pill-light" href="/iletisim">İletişime geçin <Arrow /></a></div>
    <div className="shell footer-links">
      <div><b>Ürünler</b><a href="/urunler/arvoos">ArvoOS</a><a href="/urunler/arvolab">ArvoLab</a></div>
      <div><b>Hizmetler</b><a href="/hizmetler">Tüm hizmetler</a><a href="/hizmetler/web-sitesi-tasarimi">Web sitesi tasarımı</a></div>
      <div><b>Kurumsal</b><a href="/hakkimizda">Hakkımızda</a><a href="/iletisim">İletişim</a></div>
      <div><b>Panel</b><a href={links.arvoOSLogin} target="_blank" rel="noreferrer">ArvoOS Giriş</a><a href={links.arvoLabLogin} target="_blank" rel="noreferrer">ArvoLab Giriş</a></div>
    </div>
    <div className="shell footer-bottom"><p>ArvoCulture Group Teknoloji Sanayi ve Ticaret Limited Şirketi</p><a href="mailto:info@arvo-os.com">info@arvo-os.com</a><small>© 2026 ArvoCulture Group</small></div>
  </footer>;
}

export { Arrow };
