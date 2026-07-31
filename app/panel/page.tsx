"use client";

import { useMemo, useState } from "react";

type ModuleKey = "overview" | "crm" | "workflow" | "finance" | "team" | "reports";
type Role = "Süper Yönetici" | "Yönetici" | "Satış" | "Operasyon" | "Finans";

const modules: { key: ModuleKey; icon: string; label: string; plans: string[] }[] = [
  { key: "overview", icon: "⌂", label: "Genel Bakış", plans: ["Başlangıç", "Büyüme", "Kurumsal"] },
  { key: "crm", icon: "◎", label: "CRM & Satış", plans: ["Başlangıç", "Büyüme", "Kurumsal"] },
  { key: "workflow", icon: "▦", label: "İş Akışları", plans: ["Büyüme", "Kurumsal"] },
  { key: "finance", icon: "₺", label: "Finans", plans: ["Büyüme", "Kurumsal"] },
  { key: "team", icon: "◇", label: "İnsan Kaynakları", plans: ["Kurumsal"] },
  { key: "reports", icon: "↗", label: "Raporlama", plans: ["Kurumsal"] },
];

const organizations = [
  { id: "demo", name: "ArvoOS Demo", initials: "AD", plan: "Kurumsal", domain: "demo.arvoos.com" },
  { id: "nova", name: "Nova Danışmanlık", initials: "ND", plan: "Büyüme", domain: "nova.arvoos.com" },
  { id: "atlas", name: "Atlas Sağlık", initials: "AS", plan: "Başlangıç", domain: "atlas.arvoos.com" },
];

const moduleContent: Record<ModuleKey, { eyebrow: string; title: string; description: string; stats: { label: string; value: string; change: string }[] }> = {
  overview: { eyebrow: "YÖNETİCİ ÖZETİ", title: "İşletmenizin genel görünümü", description: "Satış, operasyon ve finans performansını tek merkezden izleyin.", stats: [{ label: "Açık talepler", value: "24", change: "+6 bu hafta" }, { label: "Aktif iş akışları", value: "18", change: "%82 zamanında" }, { label: "Bekleyen tahsilat", value: "₺420.000", change: "7 ödeme" }, { label: "Ekip kapasitesi", value: "%74", change: "Dengeli" }] },
  crm: { eyebrow: "CRM & SATIŞ", title: "Satış hattı ve müşteri ilişkileri", description: "Talepten sözleşmeye kadar tüm satış sürecini yönetin.", stats: [{ label: "Yeni talepler", value: "36", change: "+12 bu ay" }, { label: "Açık teklifler", value: "14", change: "₺1,8 Mn değer" }, { label: "Dönüşüm oranı", value: "%18,4", change: "+2,1 puan" }, { label: "Aktif müşteriler", value: "128", change: "+9 bu ay" }] },
  workflow: { eyebrow: "İŞ AKIŞLARI", title: "Operasyon ve görev yönetimi", description: "Ekip sorumluluklarını, teslim tarihlerini ve ilerlemeyi yönetin.", stats: [{ label: "Aktif işler", value: "18", change: "15 zamanında" }, { label: "Bugünkü görevler", value: "11", change: "7 tamamlandı" }, { label: "Ortalama süre", value: "4,2 gün", change: "-0,8 gün" }, { label: "Geciken işler", value: "3", change: "İnceleme gerekli" }] },
  finance: { eyebrow: "FİNANS", title: "Gelir, gider ve tahsilat takibi", description: "Nakit akışını ve ödeme durumlarını anlık olarak izleyin.", stats: [{ label: "Aylık gelir", value: "₺1,24 Mn", change: "+%14,8" }, { label: "Tahsil edilen", value: "₺886 B", change: "%87 oran" }, { label: "Bekleyen ödeme", value: "₺420 B", change: "7 ödeme" }, { label: "Net nakit akışı", value: "₺312 B", change: "Pozitif" }] },
  team: { eyebrow: "İNSAN KAYNAKLARI", title: "Ekip ve kapasite yönetimi", description: "Personel dağılımını, izinleri ve iş yükünü dengede tutun.", stats: [{ label: "Aktif çalışan", value: "42", change: "5 departman" }, { label: "Ekip kapasitesi", value: "%74", change: "Dengeli" }, { label: "Bugün izinli", value: "3", change: "Planlı" }, { label: "Açık pozisyon", value: "4", change: "12 aday" }] },
  reports: { eyebrow: "RAPORLAMA", title: "Kurumsal performans raporları", description: "Tüm modüllerden gelen verileri karşılaştırın ve dışa aktarın.", stats: [{ label: "Hazır rapor", value: "12", change: "6 otomatik" }, { label: "Bu ay oluşturulan", value: "28", change: "+%16" }, { label: "Paylaşılan", value: "9", change: "3 departman" }, { label: "Son güncelleme", value: "Şimdi", change: "Canlı veri" }] },
};

const work = [
  { name: "Yeni kurumsal müşteri kurulumu", team: "Operasyon", date: "Bugün", progress: 68, status: "Devam ediyor" },
  { name: "Temmuz tahsilat kontrolü", team: "Finans", date: "Yarın", progress: 42, status: "Kontrol bekliyor" },
  { name: "Teklif onay akışı", team: "Satış", date: "2 Ağu", progress: 86, status: "Onay bekliyor" },
];

const initialUsers = [
  { name: "Arvo Yöneticisi", email: "yonetici@arvoos.com", role: "Süper Yönetici" as Role, status: "Aktif" },
  { name: "Deniz Kaya", email: "deniz@arvoos.com", role: "Satış" as Role, status: "Aktif" },
  { name: "Mert Akın", email: "mert@arvoos.com", role: "Operasyon" as Role, status: "Davet bekliyor" },
];

export default function PanelHome() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [organizationId, setOrganizationId] = useState("demo");
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [users, setUsers] = useState(initialUsers);
  const [toast, setToast] = useState("");
  const organization = organizations.find((item) => item.id === organizationId) ?? organizations[0];
  const content = moduleContent[activeModule];
  const enabledModules = modules.filter((item) => item.plans.includes(organization.plan));
  const activeLabel = useMemo(() => modules.find((item) => item.key === activeModule)?.label ?? "Genel Bakış", [activeModule]);

  function showToast(message: string) { setToast(message); setTimeout(() => setToast(""), 2200); }
  function switchOrganization(id: string) {
    const next = organizations.find((item) => item.id === id) ?? organizations[0];
    setOrganizationId(id); setTenantOpen(false);
    if (!modules.find((item) => item.key === activeModule)?.plans.includes(next.plan)) setActiveModule("overview");
    showToast(`${next.name} kurumuna geçildi`);
  }
  function submitRecord(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setCreateOpen(false); showToast(activeModule === "crm" ? "Yeni müşteri kaydı oluşturuldu" : "Yeni kayıt oluşturuldu"); }
  function submitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setUsers((current) => [...current, { name: String(data.get("name")), email: String(data.get("email")), role: String(data.get("role")) as Role, status: "Davet bekliyor" }]);
    setUserOpen(false); showToast("Kullanıcı daveti hazırlandı");
  }

  return (
    <div className={`panel-shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="panel-sidebar">
        <a className="panel-brand" href="/" aria-label="ArvoOS ana sayfa"><img src="/arvoos-logo.png" alt="ArvoOS" /></a>
        <div className="tenant-wrap"><button className="tenant-card" type="button" onClick={() => setTenantOpen(!tenantOpen)} aria-expanded={tenantOpen}><span>{organization.initials}</span><div><small>AKTİF KURUM</small><b>{organization.name}</b><em>{organization.plan} Paket</em></div><i>⌄</i></button>
          {tenantOpen && <div className="tenant-popover">{organizations.map((item) => <button key={item.id} type="button" className={item.id === organization.id ? "selected" : ""} onClick={() => switchOrganization(item.id)}><span>{item.initials}</span><div><b>{item.name}</b><small>{item.plan} · {item.domain}</small></div></button>)}</div>}
        </div>
        <nav aria-label="Panel modülleri">{modules.map((item) => { const enabled = enabledModules.some((module) => module.key === item.key); return <button className={activeModule === item.key ? "active" : ""} type="button" key={item.key} disabled={!enabled} title={!enabled ? `${organization.plan} pakette kullanılamaz` : undefined} onClick={() => { if (enabled) { setActiveModule(item.key); setMenuOpen(false); } }}><i>{item.icon}</i><span>{item.label}</span>{!enabled && <small>⌕</small>}</button>; })}</nav>
        <div className="sidebar-bottom"><button type="button" onClick={() => setSettingsOpen(true)}><i>⚙</i><span>Ayarlar</span></button><small>ArvoOS Panel · Ürün Prototipi</small></div>
      </aside>
      <main className="panel-main">
        <header className="panel-topbar"><button className="mobile-menu" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menüyü aç">☰</button><div><small>31 TEMMUZ 2026, CUMA · {activeLabel.toUpperCase()}</small><h1>Günaydın, Arvo Yöneticisi</h1></div><div className="top-actions"><div className="notice-wrap"><button type="button" aria-label="Bildirimler" onClick={() => setNoticeOpen(!noticeOpen)}>◌<i /></button>{noticeOpen && <div className="notice-popover"><b>Bildirimler</b><p>3 iş akışı bugün teslim edilecek.</p><p>2 ödeme onayınızı bekliyor.</p></div>}</div><span>AY</span></div></header>
        <section className="context-strip"><span><i />{organization.name}</span><span>{organization.plan} Paket</span><span>{enabledModules.length}/{modules.length} modül aktif</span><span>{organization.domain}</span></section>
        <section className="module-intro"><div><small>{content.eyebrow}</small><h2>{content.title}</h2><p>{content.description}</p></div><button type="button" onClick={() => setCreateOpen(true)}>+ Yeni oluştur</button></section>
        <section className="metric-grid" aria-label={`${activeLabel} metrikleri`}>{content.stats.map((item) => <article key={item.label}><small>{item.label}</small><b>{item.value}</b><em>{item.change}</em></article>)}</section>
        <section className="panel-grid"><article className="overview-card"><div className="card-head"><div><small>OPERASYON ÖZETİ</small><h2>Son 12 aylık performans</h2></div><button type="button">Bu yıl ⌄</button></div><div className="chart-area"><div className="chart-bars">{[44,58,51,72,65,84,78,91,76,88,82,96].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div><div className="chart-labels"><span>Oca</span><span>Mar</span><span>May</span><span>Tem</span><span>Eyl</span><span>Kas</span></div></div></article><article className="health-card"><div className="card-head"><div><small>SİSTEM DURUMU</small><h2>Operasyon skoru</h2></div></div><div className="score-ring"><strong>92</strong><span>/100</span></div><ul><li><i className="ok"/>Satış dönüşümü <b>%18,4</b></li><li><i className="ok"/>Tahsilat oranı <b>%87</b></li><li><i className="warn"/>Geciken iş <b>3</b></li></ul></article></section>
        <section className="work-card"><div className="card-head"><div><small>AKTİF İŞLER</small><h2>Devam eden iş akışları</h2></div><button type="button">Tümünü görüntüle →</button></div><div className="work-table"><div className="work-heading"><span>İş akışı</span><span>Ekip</span><span>Teslim</span><span>Durum</span><span>İlerleme</span></div>{work.map((item)=><div className="work-row" key={item.name}><b>{item.name}</b><span>{item.team}</span><span>{item.date}</span><em>{item.status}</em><div><i style={{width:`${item.progress}%`}}/><small>{item.progress}%</small></div></div>)}</div></section>
      </main>
      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section className="drawer" role="dialog" aria-modal="true" aria-label="Kurum ayarları" onMouseDown={(e) => e.stopPropagation()}><header><div><small>KURUM YÖNETİMİ</small><h2>{organization.name}</h2></div><button type="button" onClick={() => setSettingsOpen(false)}>×</button></header><div className="settings-grid"><article><small>PAKET</small><b>{organization.plan}</b><p>{enabledModules.length} modül kullanıma açık</p></article><article><small>ÖZEL ALAN ADI</small><b>{organization.domain}</b><p>Bağlantı doğrulandı</p></article></div><div className="drawer-head"><div><small>KULLANICILAR VE ROLLER</small><h3>{users.length} ekip üyesi</h3></div><button type="button" onClick={() => setUserOpen(true)}>+ Kullanıcı ekle</button></div><div className="user-list">{users.map((user) => <div key={user.email}><span>{user.name.split(" ").map((x) => x[0]).join("").slice(0,2)}</span><div><b>{user.name}</b><small>{user.email}</small></div><em>{user.role}</em><i>{user.status}</i></div>)}</div></section></div>}
      {createOpen && <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}><form className="mini-modal" onSubmit={submitRecord} onMouseDown={(e) => e.stopPropagation()}><header><div><small>{content.eyebrow}</small><h2>{activeModule === "crm" ? "Yeni müşteri oluştur" : "Yeni kayıt oluştur"}</h2></div><button type="button" onClick={() => setCreateOpen(false)}>×</button></header><label>Kayıt adı<input name="title" required placeholder={activeModule === "crm" ? "Firma veya kişi adı" : "Kayıt başlığı"} /></label><label>Sorumlu<select name="owner"><option>Arvo Yöneticisi</option><option>Deniz Kaya</option><option>Mert Akın</option></select></label><label>Not<textarea name="note" placeholder="Kısa açıklama" /></label><footer><button type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button><button type="submit">Kaydı oluştur</button></footer></form></div>}
      {userOpen && <div className="modal-backdrop top" onMouseDown={() => setUserOpen(false)}><form className="mini-modal" onSubmit={submitUser} onMouseDown={(e) => e.stopPropagation()}><header><div><small>YENİ EKİP ÜYESİ</small><h2>Kullanıcı davet et</h2></div><button type="button" onClick={() => setUserOpen(false)}>×</button></header><label>Ad soyad<input name="name" required placeholder="Ad Soyad" /></label><label>E-posta<input type="email" name="email" required placeholder="ornek@firma.com" /></label><label>Rol<select name="role"><option>Yönetici</option><option>Satış</option><option>Operasyon</option><option>Finans</option></select></label><footer><button type="button" onClick={() => setUserOpen(false)}>Vazgeç</button><button type="submit">Davet oluştur</button></footer></form></div>}
      {toast && <div className="panel-toast" role="status">✓ {toast}</div>}
      {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat" />}
    </div>
  );
}
