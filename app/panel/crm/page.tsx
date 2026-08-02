import { getPanelContext } from "@/lib/panel-context";
import { createOpportunity, moveOpportunity } from "./actions";
import { OpenNewRequestButton } from "./open-new-request-button";
import "./crm.css";

const columns = [
  { code: "lead", name: "Yeni Talep" },
  { code: "qualified", name: "Görüşme" },
  { code: "proposal", name: "Teklif" },
  { code: "contract", name: "Sözleşme" },
  { code: "payment", name: "Tahsilat" },
  { code: "won", name: "Kazanıldı" },
];

type Opportunity = {
  id: string;
  title: string;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  estimated_value: number;
  probability: number;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  lost_reason: string | null;
  updated_at: string;
};

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);

export default async function CrmPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  const { data, error } = await supabase.from("crm_opportunities")
    .select("id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,expected_close_date,source,notes,lost_reason,updated_at")
    .eq("organization_id", membership.organization_id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("CRM talepleri okunamadı: " + error.message);

  const opportunities = (data ?? []) as Opportunity[];
  const active = opportunities.filter((item) => !["won", "lost"].includes(item.stage));
  const newRequests = opportunities.filter((item) => item.stage === "lead");
  const activeValue = active.reduce((sum, item) => sum + item.estimated_value, 0);
  const weightedValue = active.reduce((sum, item) => sum + Math.round(item.estimated_value * item.probability / 100), 0);
  const won = opportunities.filter((item) => item.stage === "won");
  const lost = opportunities.filter((item) => item.stage === "lost");
  const conversion = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : 0;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">MÜŞTERİ VE SATIŞ</small><h1>CRM</h1><p>Yeni talepleri kaydedin, görüşmeden tahsilata kadar tüm süreci tek akışta yönetin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{newRequests.length} yeni talep</span><OpenNewRequestButton /></div>
    </div>

    <section className="crm-metrics">
      <article><small>YENİ TALEP</small><strong>{newRequests.length}</strong><span>İlk değerlendirmeyi bekliyor</span></article>
      <article><small>AKTİF SÜREÇ</small><strong>{active.length}</strong><span>Devam eden müşteri süreci</span></article>
      <article><small>TAHMİNİ GELİR</small><strong>{money(weightedValue)}</strong><span>Olasılığa göre</span></article>
      <article><small>KAZANMA ORANI</small><strong>%{conversion}</strong><span>Sonuçlanan kayıtlar</span></article>
    </section>

    <details className="panel-card crm-create" id="new-request-panel">
      <summary><span><b>+ Yeni talep</b><small>Müşteri veya kurum talebini kaydedin</small></span><em>Aç</em></summary>
      <form className="panel-form" action={createOpportunity}>
        <label>Talep konusu<input name="title" required minLength={2} maxLength={180} placeholder="Örn. Kurumsal paket bilgi talebi" /></label>
        <label>Müşteri / kurum<input name="customer_name" required minLength={2} maxLength={180} /></label>
        <label>E-posta<input name="contact_email" type="email" /></label>
        <label>Telefon<input name="contact_phone" /></label>
        <label>Beklenen tutar<input name="estimated_value" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label>Planlanan sonuç tarihi<input name="expected_close_date" type="date" /></label>
        <label>Talep kaynağı<input name="source" placeholder="Web sitesi, telefon, referans..." /></label>
        <label className="wide">Talep notu<textarea name="notes" maxLength={2000} /></label>
        <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Talebi kaydet</button></div>
      </form>
    </details>

    <div className="section-heading"><div><small className="panel-kicker">SÜREÇ TAKİBİ</small><h2>Talep ve satış aşamaları</h2></div><span>{opportunities.length} toplam kayıt · {money(activeValue)} aktif değer</span></div>
    <section className="crm-board">
      {columns.map((column) => {
        const cards = opportunities.filter((item) => item.stage === column.code);
        const total = cards.reduce((sum, item) => sum + item.estimated_value, 0);
        return <section className="crm-column" key={column.code}>
          <header><div><small>{column.name.toUpperCase()}</small><strong>{cards.length}</strong></div><span>{money(total)}</span></header>
          <div className="crm-cards">
            {cards.map((item) => <article className="panel-card crm-card" key={item.id}>
              <div className="crm-card-top"><small>%{item.probability}</small>{item.source ? <span>{item.source}</span> : null}</div>
              <h3>{item.title}</h3><p>{item.customer_name}</p>
              <strong>{money(item.estimated_value)}</strong>
              {item.expected_close_date ? <small>Hedef: {new Date(item.expected_close_date + "T00:00:00").toLocaleDateString("tr-TR")}</small> : null}
              <form action={moveOpportunity}>
                <input type="hidden" name="opportunity_id" value={item.id} />
                <label>Aşama<select name="stage" defaultValue={item.stage} aria-label="Talep aşaması">
                  {columns.map((stage) => <option value={stage.code} key={stage.code}>{stage.name}</option>)}
                  <option value="lost">Kaybedildi</option>
                </select></label>
                <label>Kayıp nedeni<input name="lost_reason" placeholder="Yalnızca kaybedildiyse" aria-label="Kayıp nedeni" /></label>
                <button className="panel-secondary" type="submit">Değişikliği kaydet</button>
              </form>
            </article>)}
            {!cards.length ? <div className="crm-empty">Bu aşamada kayıt yok</div> : null}
          </div>
        </section>;
      })}
    </section>

    {lost.length ? <section className="panel-card crm-lost"><small>KAYBEDİLEN TALEPLER</small>{lost.map((item) => <p key={item.id}><b>{item.customer_name}</b> · {item.title} · {item.lost_reason || "Neden belirtilmedi"}</p>)}</section> : null}
  </div>;
}
