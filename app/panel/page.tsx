"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type ModuleKey = "overview" | "crm" | "workflow" | "purchasing" | "inventory" | "finance" | "team" | "documents" | "reports";
type Role = "Süper Yönetici" | "Yönetici" | "Satış" | "Operasyon" | "Finans";
type DealStage = "Talep" | "Teklif" | "Sözleşme" | "Ödeme" | "İş Akışı";
type Deal = { id: number; customer: string; service: string; owner: string; amount: number; stage: DealStage; updated: string };
type Workflow = { dealId: number; customer: string; owner: string; due: string; tasks: { id: number; title: string; done: boolean }[] };
type Purchase = { id: number; vendor: string; item: string; quantity: number; total: number; status: "Onay bekliyor" | "Sipariş verildi" | "Teslim alındı"; document: string };
type StockItem = { id: number; name: string; unit: string; quantity: number; minimum: number; unitCost: number };

const modules: { key: ModuleKey; icon: string; label: string; plans: string[] }[] = [
  { key: "overview", icon: "⌂", label: "Genel Bakış", plans: ["Başlangıç", "Büyüme", "Kurumsal"] },
  { key: "crm", icon: "◎", label: "CRM & Satış", plans: ["Başlangıç", "Büyüme", "Kurumsal"] },
  { key: "workflow", icon: "▦", label: "İş Akışları", plans: ["Büyüme", "Kurumsal"] },
  { key: "purchasing", icon: "⌑", label: "Satın Alma", plans: ["Büyüme", "Kurumsal"] },
  { key: "inventory", icon: "▤", label: "Stok & Katalog", plans: ["Büyüme", "Kurumsal"] },
  { key: "finance", icon: "₺", label: "Finans", plans: ["Büyüme", "Kurumsal"] },
  { key: "team", icon: "◇", label: "İnsan Kaynakları", plans: ["Kurumsal"] },
  { key: "documents", icon: "▧", label: "Belge Merkezi", plans: ["Başlangıç", "Büyüme", "Kurumsal"] },
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
  purchasing: { eyebrow: "SATIN ALMA", title: "Talep, onay ve tedarikçi yönetimi", description: "Satın alma taleplerini onaylayın; teslimat, stok ve gider bağlantısını tek yerden yönetin.", stats: [] },
  inventory: { eyebrow: "STOK & KATALOG", title: "Ürün, sarf ve hizmet kataloğu", description: "Mevcut miktarları, kritik seviyeleri ve stok değerini izleyin.", stats: [] },
  finance: { eyebrow: "FİNANS", title: "Gelir, gider ve tahsilat takibi", description: "Nakit akışını ve ödeme durumlarını anlık olarak izleyin.", stats: [{ label: "Aylık gelir", value: "₺1,24 Mn", change: "+%14,8" }, { label: "Tahsil edilen", value: "₺886 B", change: "%87 oran" }, { label: "Bekleyen ödeme", value: "₺420 B", change: "7 ödeme" }, { label: "Net nakit akışı", value: "₺312 B", change: "Pozitif" }] },
  team: { eyebrow: "İNSAN KAYNAKLARI", title: "Ekip ve kapasite yönetimi", description: "Personel dağılımını, izinleri ve iş yükünü dengede tutun.", stats: [{ label: "Aktif çalışan", value: "42", change: "5 departman" }, { label: "Ekip kapasitesi", value: "%74", change: "Dengeli" }, { label: "Bugün izinli", value: "3", change: "Planlı" }, { label: "Açık pozisyon", value: "4", change: "12 aday" }] },
  documents: { eyebrow: "BELGE MERKEZİ", title: "Tüm kurumsal belgeler tek merkezde", description: "Teklif, sözleşme, fatura ve satın alma belgelerini bağlantılı kayıtlarıyla bulun.", stats: [] },
  reports: { eyebrow: "RAPORLAMA", title: "Kurumsal performans raporları", description: "Tüm modüllerden gelen verileri karşılaştırın ve dışa aktarın.", stats: [{ label: "Hazır rapor", value: "12", change: "6 otomatik" }, { label: "Bu ay oluşturulan", value: "28", change: "+%16" }, { label: "Paylaşılan", value: "9", change: "3 departman" }, { label: "Son güncelleme", value: "Şimdi", change: "Canlı veri" }] },
};

const initialUsers = [
  { name: "Arvo Yöneticisi", email: "yonetici@arvoos.com", role: "Süper Yönetici" as Role, status: "Aktif" },
  { name: "Deniz Kaya", email: "deniz@arvoos.com", role: "Satış" as Role, status: "Aktif" },
  { name: "Mert Akın", email: "mert@arvoos.com", role: "Operasyon" as Role, status: "Davet bekliyor" },
];

const initialDeals: Deal[] = [
  { id: 1, customer: "Luna Eğitim", service: "Kurumsal danışmanlık", owner: "Deniz Kaya", amount: 185000, stage: "Talep", updated: "12 dk önce" },
  { id: 2, customer: "Vera Sağlık", service: "Süreç kurulumu", owner: "Deniz Kaya", amount: 240000, stage: "Teklif", updated: "Bugün, 09:20" },
  { id: 3, customer: "Mira Akademi", service: "Yıllık hizmet paketi", owner: "Arvo Yöneticisi", amount: 320000, stage: "Sözleşme", updated: "Dün, 16:45" },
  { id: 4, customer: "Kuzey Danışmanlık", service: "Operasyon yönetimi", owner: "Arvo Yöneticisi", amount: 148000, stage: "Ödeme", updated: "Dün, 11:10" },
  { id: 5, customer: "Atlas Grup", service: "Dijital dönüşüm", owner: "Deniz Kaya", amount: 410000, stage: "İş Akışı", updated: "30 Tem 2026" },
];
const stageOrder: DealStage[] = ["Talep", "Teklif", "Sözleşme", "Ödeme", "İş Akışı"];
const stageActions: Record<DealStage, string> = { Talep: "Teklif oluştur", Teklif: "Teklifi onayla", Sözleşme: "Sözleşmeyi imzala", Ödeme: "Ödemeyi tamamla", "İş Akışı": "İşi görüntüle" };
const initialWorkflows: Workflow[] = [{ dealId: 5, customer: "Atlas Grup", owner: "Mert Akın", due: "6 Ağu", tasks: [
  { id: 1, title: "Başlangıç toplantısı", done: true }, { id: 2, title: "İhtiyaç analizi", done: true },
  { id: 3, title: "Süreç tasarımı", done: false }, { id: 4, title: "Müşteri onayı", done: false },
] }];
const initialPurchases: Purchase[] = [
  { id: 101, vendor: "Tekno Ofis", item: "Dizüstü bilgisayar", quantity: 3, total: 126000, status: "Onay bekliyor", document: "SAT-2026-0101" },
  { id: 102, vendor: "Mavi Kırtasiye", item: "A4 fotokopi kağıdı", quantity: 20, total: 5400, status: "Sipariş verildi", document: "SAT-2026-0102" },
  { id: 103, vendor: "Bulut Yazılım", item: "Yıllık sunucu paketi", quantity: 1, total: 48000, status: "Teslim alındı", document: "SAT-2026-0103" },
];
const initialStock: StockItem[] = [
  { id: 1, name: "Dizüstü bilgisayar", unit: "Adet", quantity: 8, minimum: 5, unitCost: 42000 },
  { id: 2, name: "A4 fotokopi kağıdı", unit: "Paket", quantity: 12, minimum: 15, unitCost: 270 },
  { id: 3, name: "Kurumsal danışmanlık", unit: "Saat", quantity: 240, minimum: 80, unitCost: 1800 },
];
function currency(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value); }
function progressOf(item: Workflow) { return item.tasks.length ? Math.round(item.tasks.filter((task) => task.done).length / item.tasks.length * 100) : 0; }

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
  const [deals, setDeals] = useState(initialDeals);
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [purchases, setPurchases] = useState(initialPurchases);
  const [stock, setStock] = useState(initialStock);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const organization = organizations.find((item) => item.id === organizationId) ?? organizations[0];
  const paidDeals = deals.filter((deal) => deal.stage === "İş Akışı");
  const openDeals = deals.filter((deal) => deal.stage !== "İş Akışı");
  const collected = paidDeals.reduce((sum, deal) => sum + deal.amount, 0);
  const pending = deals.filter((deal) => deal.stage === "Ödeme").reduce((sum, deal) => sum + deal.amount, 0);
  const completedTasks = workflows.reduce((sum, item) => sum + item.tasks.filter((task) => task.done).length, 0);
  const totalTasks = workflows.reduce((sum, item) => sum + item.tasks.length, 0);
  const averageProgress = workflows.length ? Math.round(workflows.reduce((sum, item) => sum + progressOf(item), 0) / workflows.length) : 0;
  const receivedPurchases = purchases.filter((purchase) => purchase.status === "Teslim alındı");
  const purchasingExpense = receivedPurchases.reduce((sum, purchase) => sum + purchase.total, 0);
  const stockValue = stock.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const criticalStock = stock.filter((item) => item.quantity <= item.minimum);
  const sellers = useMemo(() => Array.from(new Set(deals.map((deal) => deal.owner))).map((owner) => {
    const ownerDeals = deals.filter((deal) => deal.owner === owner);
    const ownerPaid = ownerDeals.filter((deal) => deal.stage === "İş Akışı");
    return { owner, sales: ownerPaid.length, revenue: ownerPaid.reduce((sum, deal) => sum + deal.amount, 0), pipeline: ownerDeals.reduce((sum, deal) => sum + deal.amount, 0) };
  }).sort((a, b) => b.revenue - a.revenue), [deals]);
  const dynamicStats: Partial<Record<ModuleKey, { label: string; value: string; change: string }[]>> = {
    overview: [{ label: "Açık talepler", value: String(openDeals.length), change: `${deals.length} toplam kayıt` }, { label: "Aktif iş akışları", value: String(workflows.length), change: `%${averageProgress} ilerleme` }, { label: "Bekleyen tahsilat", value: currency(pending), change: "Ödeme aşaması" }, { label: "Tahsil edilen", value: currency(collected), change: `${paidDeals.length} satış` }],
    workflow: [{ label: "Aktif işler", value: String(workflows.length), change: "Operasyon" }, { label: "Tamamlanan görev", value: String(completedTasks), change: `${totalTasks} toplam` }, { label: "Ortalama ilerleme", value: `%${averageProgress}`, change: "Görevlerden hesaplanır" }, { label: "Bekleyen görev", value: String(totalTasks - completedTasks), change: "İş kuyruğu" }],
    purchasing: [{ label: "Onay bekleyen", value: String(purchases.filter((item) => item.status === "Onay bekliyor").length), change: "Yönetici onayı" }, { label: "Aktif sipariş", value: String(purchases.filter((item) => item.status === "Sipariş verildi").length), change: "Tedarik sürecinde" }, { label: "Teslim alınan", value: String(receivedPurchases.length), change: currency(purchasingExpense) }, { label: "Tedarikçi", value: String(new Set(purchases.map((item) => item.vendor)).size), change: "Aktif kayıt" }],
    inventory: [{ label: "Katalog kaydı", value: String(stock.length), change: "Ürün ve hizmet" }, { label: "Kritik stok", value: String(criticalStock.length), change: criticalStock.length ? "Sipariş gerekli" : "Stok yeterli" }, { label: "Toplam stok değeri", value: currency(stockValue), change: "Ortalama maliyet" }, { label: "Son hareket", value: receivedPurchases.at(-1)?.item ?? "—", change: "Satın almadan" }],
    finance: [{ label: "Tahsil edilen", value: currency(collected), change: `${paidDeals.length} ödeme` }, { label: "Satın alma gideri", value: currency(purchasingExpense), change: `${receivedPurchases.length} teslimat` }, { label: "Bekleyen ödeme", value: currency(pending), change: "Tahsilat kuyruğu" }, { label: "Net nakit akışı", value: currency(collected - purchasingExpense), change: "Satış − satın alma" }],
    documents: [{ label: "Toplam belge", value: String(deals.length + purchases.length), change: "Bağlantılı kayıt" }, { label: "Sözleşme", value: String(deals.filter((item) => stageOrder.indexOf(item.stage) >= 2).length), change: "Satış sürecinden" }, { label: "Satın alma belgesi", value: String(purchases.length), change: "Otomatik numaralı" }, { label: "Arşivlenen", value: String(paidDeals.length), change: "Tamamlanan süreç" }],
    reports: [{ label: "Toplam satış", value: currency(collected), change: "Tahsil edilen" }, { label: "En yüksek satıcı", value: sellers[0]?.owner ?? "—", change: sellers[0] ? currency(sellers[0].revenue) : "Satış yok" }, { label: "İş ilerlemesi", value: `%${averageProgress}`, change: `${completedTasks}/${totalTasks} görev` }, { label: "Açık portföy", value: currency(openDeals.reduce((sum, deal) => sum + deal.amount, 0)), change: `${openDeals.length} kayıt` }],
  };
  const content = { ...moduleContent[activeModule], stats: dynamicStats[activeModule] ?? moduleContent[activeModule].stats };
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
  function advanceDeal(deal: Deal) {
    if (deal.stage === "İş Akışı") { setActiveModule("workflow"); setSelectedDeal(null); showToast(`${deal.customer} iş akışı açıldı`); return; }
    const nextStage = stageOrder[stageOrder.indexOf(deal.stage) + 1];
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, stage: nextStage, updated: "Şimdi" } : item));
    if (nextStage === "İş Akışı") setWorkflows((current) => current.some((item) => item.dealId === deal.id) ? current : [...current, { dealId: deal.id, customer: deal.customer, owner: "Mert Akın", due: "7 gün içinde", tasks: [
      { id: 1, title: "Başlangıç toplantısı", done: false }, { id: 2, title: "Belgeleri teslim al", done: false },
      { id: 3, title: "Operasyon planını oluştur", done: false }, { id: 4, title: "Müşteri onayını al", done: false },
    ] }]);
    setSelectedDeal({ ...deal, stage: nextStage, updated: "Şimdi" });
    showToast(nextStage === "İş Akışı" ? "Ödeme tamamlandı; talep arşivlenip iş akışı oluşturuldu" : `${deal.customer}: ${nextStage} aşamasına geçti`);
  }
  function toggleTask(dealId: number, taskId: number) {
    setWorkflows((current) => current.map((item) => item.dealId === dealId ? { ...item, tasks: item.tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task) } : item));
  }
  function advancePurchase(id: number) {
    const current = purchases.find((item) => item.id === id);
    if (!current || current.status === "Teslim alındı") return;
    const next = current.status === "Onay bekliyor" ? "Sipariş verildi" : "Teslim alındı";
    setPurchases((items) => items.map((item) => item.id === id ? { ...item, status: next } : item));
    if (next === "Teslim alındı") {
      setStock((items) => items.map((item) => item.name === current.item ? { ...item, quantity: item.quantity + current.quantity } : item));
      showToast("Teslimat stok ve finans kayıtlarına işlendi");
    } else showToast("Satın alma onaylandı ve siparişe dönüştü");
  }
  function submitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setUsers((current) => [...current, { name: String(data.get("name")), email: String(data.get("email")), role: String(data.get("role")) as Role, status: "Davet bekliyor" }]);
    setUserOpen(false); showToast("Kullanıcı daveti hazırlandı");
  }

  return (
    <div className={`panel-shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="panel-sidebar">
        <Link className="panel-brand" href="/" aria-label="ArvoOS ana sayfa"><img src="/arvoos-logo.png" alt="ArvoOS" /></Link>
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
        {(activeModule === "overview" || activeModule === "crm") && <section className="pipeline-card"><div className="card-head"><div><small>SATIŞ VE OPERASYON AKIŞI</small><h2>Talepten iş akışına</h2></div><span>{deals.filter((deal) => deal.stage !== "İş Akışı").length} açık kayıt · {currency(deals.reduce((sum, deal) => sum + deal.amount, 0))}</span></div><div className="pipeline-steps">{stageOrder.map((stage, index) => <div key={stage} className={stage === "İş Akışı" ? "completed-stage" : ""}><i>{index + 1}</i><span>{stage}</span><b>{deals.filter((deal) => deal.stage === stage).length}</b></div>)}</div><div className="deal-list">{deals.map((deal) => <button key={deal.id} type="button" onClick={() => setSelectedDeal(deal)}><span className={`deal-stage stage-${stageOrder.indexOf(deal.stage)}`}>{deal.stage}</span><div><b>{deal.customer}</b><small>{deal.service} · {deal.owner}</small></div><strong>{currency(deal.amount)}</strong><em>{deal.updated}</em><i>→</i></button>)}</div></section>}
        <section className="panel-grid"><article className="overview-card"><div className="card-head"><div><small>OPERASYON ÖZETİ</small><h2>Son 12 aylık performans</h2></div><button type="button">Bu yıl ⌄</button></div><div className="chart-area"><div className="chart-bars">{[44,58,51,72,65,84,78,91,76,88,82,96].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div><div className="chart-labels"><span>Oca</span><span>Mar</span><span>May</span><span>Tem</span><span>Eyl</span><span>Kas</span></div></div></article><article className="health-card"><div className="card-head"><div><small>SİSTEM DURUMU</small><h2>Operasyon skoru</h2></div></div><div className="score-ring"><strong>92</strong><span>/100</span></div><ul><li><i className="ok"/>Satış dönüşümü <b>%18,4</b></li><li><i className="ok"/>Tahsilat oranı <b>%87</b></li><li><i className="warn"/>Geciken iş <b>3</b></li></ul></article></section>
        {(activeModule === "overview" || activeModule === "workflow") && <section className="work-card"><div className="card-head"><div><small>AKTİF İŞLER</small><h2>Görevlerden hesaplanan ilerleme</h2></div><span className="live-note">Canlı ortak veri</span></div><div className="work-table"><div className="work-heading"><span>İş akışı</span><span>Sorumlu</span><span>Teslim</span><span>Durum</span><span>İlerleme</span></div>{workflows.map((item) => { const progress = progressOf(item); return <button className="work-row" type="button" key={item.dealId} onClick={() => setSelectedWorkflowId(item.dealId)}><b>{item.customer}</b><span>{item.owner}</span><span>{item.due}</span><em>{progress === 100 ? "Tamamlandı" : "Devam ediyor"}</em><div><i style={{width:`${progress}%`}}/><small>{progress}%</small></div></button>; })}</div></section>}
        {activeModule === "purchasing" && <section className="data-card"><div className="card-head"><div><small>SATIN ALMA TALEPLERİ</small><h2>Onaydan teslimata ortak süreç</h2></div><span className="live-note">Stok ve finansa bağlı</span></div><div className="data-table purchase-table"><div className="data-heading"><span>Belge / Tedarikçi</span><span>Kalem</span><span>Adet</span><span>Durum</span><span>Tutar / İşlem</span></div>{purchases.map((purchase) => <div className="data-row" key={purchase.id}><div><b>{purchase.document}</b><small>{purchase.vendor}</small></div><span>{purchase.item}</span><span>{purchase.quantity}</span><em>{purchase.status}</em><div className="row-action"><strong>{currency(purchase.total)}</strong>{purchase.status !== "Teslim alındı" && <button type="button" onClick={() => advancePurchase(purchase.id)}>{purchase.status === "Onay bekliyor" ? "Onayla" : "Teslim al"}</button>}</div></div>)}</div></section>}
        {activeModule === "inventory" && <section className="data-card"><div className="card-head"><div><small>STOK VE HİZMET KATALOĞU</small><h2>Gerçek zamanlı miktar ve değer</h2></div><span className="live-note">{criticalStock.length} kritik kayıt</span></div><div className="data-table"><div className="data-heading"><span>Ürün / Hizmet</span><span>Birim</span><span>Mevcut</span><span>Minimum</span><span>Stok değeri</span></div>{stock.map((item) => <div className="data-row" key={item.id}><b>{item.name}</b><span>{item.unit}</span><strong>{item.quantity}</strong><em className={item.quantity <= item.minimum ? "critical" : ""}>{item.minimum}{item.quantity <= item.minimum ? " · Kritik" : ""}</em><strong>{currency(item.quantity * item.unitCost)}</strong></div>)}</div></section>}
        {activeModule === "finance" && <section className="data-card"><div className="card-head"><div><small>FİNANS HAREKETLERİ</small><h2>Satış tahsilatları ve satın alma giderleri</h2></div><span className="live-note">{paidDeals.length + receivedPurchases.length} hareket</span></div><div className="data-table"><div className="data-heading"><span>Firma</span><span>Kaynak</span><span>Tarih</span><span>Durum</span><span>Tutar</span></div>{paidDeals.map((deal) => <div className="data-row" key={deal.id}><b>{deal.customer}</b><span>Satış · {deal.owner}</span><span>{deal.updated}</span><em>Tahsil edildi</em><strong className="income">+{currency(deal.amount)}</strong></div>)}{receivedPurchases.map((purchase) => <div className="data-row" key={`expense-${purchase.id}`}><b>{purchase.vendor}</b><span>Satın alma · {purchase.document}</span><span>31 Tem 2026</span><em>Gider işlendi</em><strong className="expense">−{currency(purchase.total)}</strong></div>)}</div></section>}
        {activeModule === "documents" && <section className="data-card"><div className="card-head"><div><small>BAĞLANTILI BELGELER</small><h2>Kurumsal belge merkezi</h2></div><span className="live-note">Tek kaynaktan izlenir</span></div><div className="data-table"><div className="data-heading"><span>Belge</span><span>Tür</span><span>Bağlantılı kayıt</span><span>Durum</span><span>Güncelleme</span></div>{deals.map((deal) => <div className="data-row" key={`deal-${deal.id}`}><b>SAT-{String(deal.id).padStart(4, "0")}</b><span>{deal.stage === "Talep" ? "Talep" : deal.stage === "Teklif" ? "Teklif" : "Sözleşme"}</span><span>{deal.customer}</span><em>{deal.stage === "İş Akışı" ? "Arşivlendi" : "Aktif"}</em><span>{deal.updated}</span></div>)}{purchases.map((purchase) => <div className="data-row" key={`purchase-${purchase.id}`}><b>{purchase.document}</b><span>Satın alma</span><span>{purchase.vendor}</span><em>{purchase.status}</em><span>31 Tem 2026</span></div>)}</div></section>}
        {activeModule === "reports" && <section className="data-card"><div className="card-head"><div><small>SATICI PERFORMANSI</small><h2>Tahsilata göre gerçekleşen satışlar</h2></div><span className="live-note">Finans ile eş zamanlı</span></div><div className="data-table"><div className="data-heading"><span>Satıcı</span><span>Satış</span><span>Tahsil edilen</span><span>Toplam portföy</span><span>Pay</span></div>{sellers.map((seller) => <div className="data-row" key={seller.owner}><b>{seller.owner}</b><span>{seller.sales}</span><strong>{currency(seller.revenue)}</strong><span>{currency(seller.pipeline)}</span><em>%{collected ? Math.round(seller.revenue / collected * 100) : 0}</em></div>)}</div></section>}
      </main>
      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section className="drawer" role="dialog" aria-modal="true" aria-label="Kurum ayarları" onMouseDown={(e) => e.stopPropagation()}><header><div><small>KURUM YÖNETİMİ</small><h2>{organization.name}</h2></div><button type="button" onClick={() => setSettingsOpen(false)}>×</button></header><div className="settings-grid"><article><small>PAKET</small><b>{organization.plan}</b><p>{enabledModules.length} modül kullanıma açık</p></article><article><small>ÖZEL ALAN ADI</small><b>{organization.domain}</b><p>Bağlantı doğrulandı</p></article></div><div className="drawer-head"><div><small>KULLANICILAR VE ROLLER</small><h3>{users.length} ekip üyesi</h3></div><button type="button" onClick={() => setUserOpen(true)}>+ Kullanıcı ekle</button></div><div className="user-list">{users.map((user) => <div key={user.email}><span>{user.name.split(" ").map((x) => x[0]).join("").slice(0,2)}</span><div><b>{user.name}</b><small>{user.email}</small></div><em>{user.role}</em><i>{user.status}</i></div>)}</div></section></div>}
      {createOpen && <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}><form className="mini-modal" onSubmit={submitRecord} onMouseDown={(e) => e.stopPropagation()}><header><div><small>{content.eyebrow}</small><h2>{activeModule === "crm" ? "Yeni müşteri oluştur" : "Yeni kayıt oluştur"}</h2></div><button type="button" onClick={() => setCreateOpen(false)}>×</button></header><label>Kayıt adı<input name="title" required placeholder={activeModule === "crm" ? "Firma veya kişi adı" : "Kayıt başlığı"} /></label><label>Sorumlu<select name="owner"><option>Arvo Yöneticisi</option><option>Deniz Kaya</option><option>Mert Akın</option></select></label><label>Not<textarea name="note" placeholder="Kısa açıklama" /></label><footer><button type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button><button type="submit">Kaydı oluştur</button></footer></form></div>}
      {userOpen && <div className="modal-backdrop top" onMouseDown={() => setUserOpen(false)}><form className="mini-modal" onSubmit={submitUser} onMouseDown={(e) => e.stopPropagation()}><header><div><small>YENİ EKİP ÜYESİ</small><h2>Kullanıcı davet et</h2></div><button type="button" onClick={() => setUserOpen(false)}>×</button></header><label>Ad soyad<input name="name" required placeholder="Ad Soyad" /></label><label>E-posta<input type="email" name="email" required placeholder="ornek@firma.com" /></label><label>Rol<select name="role"><option>Yönetici</option><option>Satış</option><option>Operasyon</option><option>Finans</option></select></label><footer><button type="button" onClick={() => setUserOpen(false)}>Vazgeç</button><button type="submit">Davet oluştur</button></footer></form></div>}
      {selectedDeal && <div className="modal-backdrop" onMouseDown={() => setSelectedDeal(null)}><section className="deal-drawer" role="dialog" aria-modal="true" aria-label="Satış kaydı" onMouseDown={(e) => e.stopPropagation()}><header><div><small>SATIŞ KAYDI #{selectedDeal.id.toString().padStart(4, "0")}</small><h2>{selectedDeal.customer}</h2><p>{selectedDeal.service}</p></div><button type="button" onClick={() => setSelectedDeal(null)}>×</button></header><div className="deal-progress">{stageOrder.map((stage, index) => <div key={stage} className={index <= stageOrder.indexOf(selectedDeal.stage) ? "done" : ""}><i>{index < stageOrder.indexOf(selectedDeal.stage) ? "✓" : index + 1}</i><span>{stage}</span></div>)}</div><div className="deal-details"><article><small>TUTAR</small><b>{currency(selectedDeal.amount)}</b></article><article><small>SORUMLU</small><b>{selectedDeal.owner}</b></article><article><small>SON İŞLEM</small><b>{selectedDeal.updated}</b></article><article><small>DURUM</small><b>{selectedDeal.stage}</b></article></div>{selectedDeal.stage === "İş Akışı" && <div className="archive-note"><b>Talep arşivlendi</b><p>Satış süreci tamamlandı. Bu kayıt açık taleplerde görünmez ve operasyon ekibinin aktif iş akışlarında izlenir.</p></div>}<footer><button type="button" onClick={() => setSelectedDeal(null)}>Kapat</button><button type="button" onClick={() => advanceDeal(selectedDeal)}>{stageActions[selectedDeal.stage]} →</button></footer></section></div>}
      {selectedWorkflowId !== null && (() => { const workflow = workflows.find((item) => item.dealId === selectedWorkflowId); if (!workflow) return null; const progress = progressOf(workflow); return <div className="modal-backdrop" onMouseDown={() => setSelectedWorkflowId(null)}><section className="deal-drawer" role="dialog" aria-modal="true" aria-label="İş akışı görevleri" onMouseDown={(e) => e.stopPropagation()}><header><div><small>İŞ AKIŞI #{workflow.dealId.toString().padStart(4, "0")}</small><h2>{workflow.customer}</h2><p>{workflow.owner} · Teslim {workflow.due}</p></div><button type="button" onClick={() => setSelectedWorkflowId(null)}>×</button></header><div className="workflow-summary"><div><span style={{width:`${progress}%`}} /></div><b>%{progress}</b><small>{workflow.tasks.filter((task) => task.done).length}/{workflow.tasks.length} görev tamamlandı</small></div><div className="task-list">{workflow.tasks.map((task) => <label key={task.id} className={task.done ? "done" : ""}><input type="checkbox" checked={task.done} onChange={() => toggleTask(workflow.dealId, task.id)} /><span>{task.title}</span><em>{task.done ? "Tamamlandı" : "Bekliyor"}</em></label>)}</div><div className="archive-note"><b>Bağlantılı kayıtlar güncel</b><p>Görev değişikliği iş takvimindeki ilerleme oranına ve raporlama özetine anında yansır.</p></div><footer><button type="button" onClick={() => setSelectedWorkflowId(null)}>Kapat</button></footer></section></div>; })()}
      {toast && <div className="panel-toast" role="status">✓ {toast}</div>}
      {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat" />}
    </div>
  );
}

