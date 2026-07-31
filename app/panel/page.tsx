"use client";

import { useMemo, useState } from "react";

type ModuleKey = "overview" | "crm" | "workflow" | "finance" | "team" | "reports";

const modules: { key: ModuleKey; icon: string; label: string }[] = [
  { key: "overview", icon: "⌂", label: "Genel Bakış" },
  { key: "crm", icon: "◎", label: "CRM & Satış" },
  { key: "workflow", icon: "▦", label: "İş Akışları" },
  { key: "finance", icon: "₺", label: "Finans" },
  { key: "team", icon: "◇", label: "İnsan Kaynakları" },
  { key: "reports", icon: "↗", label: "Raporlama" },
];

const moduleContent: Record<ModuleKey, {
  eyebrow: string;
  title: string;
  description: string;
  stats: { label: string; value: string; change: string }[];
}> = {
  overview: {
    eyebrow: "YÖNETİCİ ÖZETİ",
    title: "İşletmenizin genel görünümü",
    description: "Satış, operasyon ve finans performansını tek merkezden izleyin.",
    stats: [
      { label: "Açık talepler", value: "24", change: "+6 bu hafta" },
      { label: "Aktif iş akışları", value: "18", change: "%82 zamanında" },
      { label: "Bekleyen tahsilat", value: "₺420.000", change: "7 ödeme" },
      { label: "Ekip kapasitesi", value: "%74", change: "Dengeli" },
    ],
  },
  crm: {
    eyebrow: "CRM & SATIŞ",
    title: "Satış hattı ve müşteri ilişkileri",
    description: "Talepten sözleşmeye kadar tüm satış sürecini yönetin.",
    stats: [
      { label: "Yeni talepler", value: "36", change: "+12 bu ay" },
      { label: "Açık teklifler", value: "14", change: "₺1,8 Mn değer" },
      { label: "Dönüşüm oranı", value: "%18,4", change: "+2,1 puan" },
      { label: "Aktif müşteriler", value: "128", change: "+9 bu ay" },
    ],
  },
  workflow: {
    eyebrow: "İŞ AKIŞLARI",
    title: "Operasyon ve görev yönetimi",
    description: "Ekip sorumluluklarını, teslim tarihlerini ve ilerlemeyi yönetin.",
    stats: [
      { label: "Aktif işler", value: "18", change: "15 zamanında" },
      { label: "Bugünkü görevler", value: "11", change: "7 tamamlandı" },
      { label: "Ortalama süre", value: "4,2 gün", change: "-0,8 gün" },
      { label: "Geciken işler", value: "3", change: "İnceleme gerekli" },
    ],
  },
  finance: {
    eyebrow: "FİNANS",
    title: "Gelir, gider ve tahsilat takibi",
    description: "Nakit akışını ve ödeme durumlarını anlık olarak izleyin.",
    stats: [
      { label: "Aylık gelir", value: "₺1,24 Mn", change: "+%14,8" },
      { label: "Tahsil edilen", value: "₺886 B", change: "%87 oran" },
      { label: "Bekleyen ödeme", value: "₺420 B", change: "7 ödeme" },
      { label: "Net nakit akışı", value: "₺312 B", change: "Pozitif" },
    ],
  },
  team: {
    eyebrow: "İNSAN KAYNAKLARI",
    title: "Ekip ve kapasite yönetimi",
    description: "Personel dağılımını, izinleri ve iş yükünü dengede tutun.",
    stats: [
      { label: "Aktif çalışan", value: "42", change: "5 departman" },
      { label: "Ekip kapasitesi", value: "%74", change: "Dengeli" },
      { label: "Bugün izinli", value: "3", change: "Planlı" },
      { label: "Açık pozisyon", value: "4", change: "12 aday" },
    ],
  },
  reports: {
    eyebrow: "RAPORLAMA",
    title: "Kurumsal performans raporları",
    description: "Tüm modüllerden gelen verileri karşılaştırın ve dışa aktarın.",
    stats: [
      { label: "Hazır rapor", value: "12", change: "6 otomatik" },
      { label: "Bu ay oluşturulan", value: "28", change: "+%16" },
      { label: "Paylaşılan", value: "9", change: "3 departman" },
      { label: "Son güncelleme", value: "Şimdi", change: "Canlı veri" },
    ],
  },
};

const work = [
  { name: "Yeni kurumsal müşteri kurulumu", team: "Operasyon", date: "Bugün", progress: 68, status: "Devam ediyor" },
  { name: "Temmuz tahsilat kontrolü", team: "Finans", date: "Yarın", progress: 42, status: "Kontrol bekliyor" },
  { name: "Teklif onay akışı", team: "Satış", date: "2 Ağu", progress: 86, status: "Onay bekliyor" },
];

export default function PanelHome() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const content = moduleContent[activeModule];
  const activeLabel = useMemo(
    () => modules.find((item) => item.key === activeModule)?.label ?? "Genel Bakış",
    [activeModule],
  );

  return (
    <div className={`panel-shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="panel-sidebar">
        <a className="panel-brand" href="/" aria-label="ArvoOS ana sayfa">
          <img src="/arvoos-logo.png" alt="ArvoOS" />
        </a>
        <button className="tenant-card" type="button" aria-label="Aktif kurum: ArvoOS Demo">
          <span>AD</span>
          <div><small>AKTİF KURUM</small><b>ArvoOS Demo</b><em>Kurumsal Paket</em></div>
          <i>⌄</i>
        </button>
        <nav aria-label="Panel modülleri">
          {modules.map((item) => (
            <button
              className={activeModule === item.key ? "active" : ""}
              type="button"
              key={item.key}
              onClick={() => { setActiveModule(item.key); setMenuOpen(false); }}
            >
              <i>{item.icon}</i><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button"><i>⚙</i><span>Ayarlar</span></button>
          <small>ArvoOS Panel · Önizleme</small>
        </div>
      </aside>

      <main className="panel-main">
        <header className="panel-topbar">
          <button className="mobile-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menüyü aç">☰</button>
          <div><small>31 TEMMUZ 2026, CUMA · {activeLabel.toUpperCase()}</small><h1>Günaydın, Arvo Yöneticisi</h1></div>
          <div className="top-actions">
            <div className="notice-wrap">
              <button type="button" aria-label="Bildirimler" onClick={() => setNoticeOpen(!noticeOpen)}>◌<i /></button>
              {noticeOpen && <div className="notice-popover"><b>Bildirimler</b><p>3 iş akışı bugün teslim edilecek.</p><p>2 ödeme onayınızı bekliyor.</p></div>}
            </div>
            <span>AY</span>
          </div>
        </header>

        <section className="module-intro">
          <div><small>{content.eyebrow}</small><h2>{content.title}</h2><p>{content.description}</p></div>
          <button type="button">+ Yeni oluştur</button>
        </section>

        <section className="metric-grid" aria-label={`${activeLabel} metrikleri`}>
          {content.stats.map((item) => <article key={item.label}><small>{item.label}</small><b>{item.value}</b><em>{item.change}</em></article>)}
        </section>

        <section className="panel-grid">
          <article className="overview-card">
            <div className="card-head"><div><small>OPERASYON ÖZETİ</small><h2>Son 12 aylık performans</h2></div><button type="button">Bu yıl ⌄</button></div>
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
          <div className="card-head"><div><small>AKTİF İŞLER</small><h2>Devam eden iş akışları</h2></div><button type="button">Tümünü görüntüle →</button></div>
          <div className="work-table">
            <div className="work-heading"><span>İş akışı</span><span>Ekip</span><span>Teslim</span><span>Durum</span><span>İlerleme</span></div>
            {work.map((item)=><div className="work-row" key={item.name}><b>{item.name}</b><span>{item.team}</span><span>{item.date}</span><em>{item.status}</em><div><i style={{width:`${item.progress}%`}}/><small>{item.progress}%</small></div></div>)}
          </div>
        </section>
      </main>
      {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat" />}
    </div>
  );
}
