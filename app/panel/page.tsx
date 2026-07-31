const metrics = [
  { label: "Açık talepler", value: "24", change: "+6 bu hafta" },
  { label: "Aktif iş akışları", value: "18", change: "%82 zamanında" },
  { label: "Bekleyen tahsilat", value: "₺420.000", change: "7 ödeme" },
  { label: "Ekip kapasitesi", value: "%74", change: "Dengeli" },
];

const work = [
  ["Yeni kurumsal müşteri kurulumu", "Operasyon", "Bugün", "68"],
  ["Temmuz tahsilat kontrolü", "Finans", "Yarın", "42"],
  ["Teklif onay akışı", "Satış", "2 Ağu", "86"],
];

export default function PanelHome() {
  return (
    <div className="panel-shell">
      <aside className="panel-sidebar">
        <a className="panel-brand" href="/"><img src="/arvoos-logo.png" alt="ArvoOS" /></a>
        <div className="tenant-card"><span>AE</span><div><small>AKTİF KURUM</small><b>ArvoOS Demo</b><em>Kurumsal Paket</em></div></div>
        <nav>
          <a className="active" href="/panel">⌂ <span>Genel Bakış</span></a>
          <a href="/panel">◎ <span>CRM & Satış</span></a>
          <a href="/panel">▦ <span>İş Akışları</span></a>
          <a href="/panel">₺ <span>Finans</span></a>
          <a href="/panel">◇ <span>İnsan Kaynakları</span></a>
          <a href="/panel">↗ <span>Raporlama</span></a>
        </nav>
        <div className="sidebar-bottom"><a href="/panel">⚙ <span>Ayarlar</span></a><small>ArvoOS v0.1</small></div>
      </aside>

      <main className="panel-main">
        <header className="panel-topbar">
          <div><small>31 Temmuz 2026, Cuma</small><h1>Günaydın, Arvo Yöneticisi</h1></div>
          <div className="top-actions"><button aria-label="Bildirimler">◌</button><span>AY</span></div>
        </header>

        <section className="metric-grid">
          {metrics.map((item) => <article key={item.label}><small>{item.label}</small><b>{item.value}</b><em>{item.change}</em></article>)}
        </section>

        <section className="panel-grid">
          <article className="overview-card">
            <div className="card-head"><div><small>OPERASYON ÖZETİ</small><h2>İşletmenizin genel görünümü</h2></div><button>Bu ay⌄</button></div>
            <div className="chart-area">
              <div className="chart-bars">{[44,58,51,72,65,84,78,91,76,88,82,96].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div>
              <div className="chart-labels"><span>Oca</span><span>Mar</span><span>May</span><span>Tem</span><span>Eyl</span><span>Kas</span></div>
            </div>
          </article>

          <article className="health-card">
            <div className="card-head"><div><small>SİSTEM DURUMU</small><h2>Operasyon skoru</h2></div></div>
            <div className="score-ring"><strong>92</strong><span>/100</span></div>
            <ul><li><i className="ok"/>Satış dönüşümü <b>%18,4</b></li><li><i className="ok"/>Tahsilat oranı <b>%87</b></li><li><i className="warn"/>Geciken iş <b>3</b></li></ul>
          </article>
        </section>

        <section className="work-card">
          <div className="card-head"><div><small>AKTİF İŞLER</small><h2>Devam eden iş akışları</h2></div><button>Tümünü görüntüle →</button></div>
          <div className="work-table">
            {work.map(([name,team,date,progress])=><div className="work-row" key={name}><b>{name}</b><span>{team}</span><span>{date}</span><div><i style={{width:`${progress}%`}}/><small>{progress}%</small></div></div>)}
          </div>
        </section>
      </main>
    </div>
  );
}
