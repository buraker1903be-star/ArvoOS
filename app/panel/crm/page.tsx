import { getPanelContext } from "@/lib/panel-context";
import { createOpportunity, moveOpportunity } from "./actions";
import "./crm.css";

const columns = [
  { code: "lead", name: "Lead" },
  { code: "qualified", name: "Nitelikli" },
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
  if (error) throw new Error("CRM fırsatları okunamadı: " + error.message);

  const opportunities = (data ?? []) as Opportunity[];
  const active = opportunities.filter((item) => !["won", "lost"].includes(item.stage));
  const activeValue = active.reduce((sum, item) => sum + item.estimated_value, 0);
  const weightedValue = active.reduce((sum, item) => sum + Math.round(item.estimated_value * item.probability / 100), 0);
  const won = opportunities.filter((item) => item.stage === "won");
  const lost = opportunities.filter((item) => item.stage === "lost");
  const conversion = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : 0;

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">SATIŞ</small><h1>CRM</h1><p>Fırsatları aşamalarına göre takip edin ve satış sürecini yönetin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{active.length} aktif fırsat</span><a className="panel-primary" href="#new-opportunity">Yeni fırsat</a></div>
    </div>

    <section className="crm-metrics">
      <article><small>AKTİF FIRSAT</small><strong>{active.length}</strong><span>Devam eden satış</span></article>
      <article><small>PIPELINE</small><strong>{money(activeValue)}</strong><span>Toplam tahmini değer</span></article>
      <article><small>TAHMİNİ GELİR</small><strong>{money(weightedValue)}</strong><span>Olasılığa göre</span></article>
      <article><small>KAZANMA ORANI</small><strong>%{conversion}</strong><span>Sonuçlanan fırsatlar</span></article>
    </section>

    <details className="panel-card crm-create" id="new-opportunity">
      <summary><span>Yeni fırsat oluştur</span><small>Müşteri ve satış bilgilerini ekleyin</small></summary>
      <form className="panel-form" action={createOpportunity}>
        <label>Fırsat adı<input name="title" required minLength={2} maxLength={180} placeholder="Örn. Professional paket satışı" /></label>
        <label>Müşteri / kurum<input name="customer_name" required minLength={2} maxLength={180} /></label>
        <label>E-posta<input name="contact_email" type="email" /></label>
        <label>Telefon<input name="contact_phone" /></label>
        <label>Tahmini tutar<input name="estimated_value" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label>Beklenen kapanış<input name="expected_close_date" type="date" /></label>
        <label>Kaynak<input name="source" placeholder="Web sitesi, referans, etkinlik..." /></label>
        <label className="wide">Not<textarea name="notes" maxLength={2000} /></label>
        <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Fırsatı oluştur</button></div>
      </form>
    </details>

    <div className="section-heading"><div><small className="panel-kicker">PIPELINE</small><h2>Satış aşamaları</h2></div><span>{opportunities.length} toplam kayıt</span></div>
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
              {item.expected_close_date ? <small>Kapanış: {new Date(item.expected_close_date + "T00:00:00").toLocaleDateString("tr-TR")}</small> : null}
              <form action={moveOpportunity}>
                <input type="hidden" name="opportunity_id" value={item.id} />
                <select name="stage" defaultValue={item.stage} aria-label="Satış aşaması">
                  {columns.map((stage) => <option value={stage.code} key={stage.code}>{stage.name}</option>)}
                  <option value="lost">Kaybedildi</option>
                </select>
                <input name="lost_reason" placeholder="Kayıp nedeni" aria-label="Kayıp nedeni" />
                <button className="panel-secondary" type="submit">Güncelle</button>
              </form>
            </article>)}
            {!cards.length ? <div className="crm-empty">Kayıt yok</div> : null}
          </div>
        </section>;
      })}
    </section>

    {lost.length ? <section className="panel-card crm-lost"><small>KAYBEDİLEN FIRSATLAR</small>{lost.map((item) => <p key={item.id}><b>{item.customer_name}</b> · {item.title} · {item.lost_reason || "Neden belirtilmedi"}</p>)}</section> : null}
  </>;
}
