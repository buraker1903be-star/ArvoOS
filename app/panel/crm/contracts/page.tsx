import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../crm.css";

type Opportunity = { id: string; title: string; customer_name: string; stage: string; estimated_value: number; expected_close_date: string | null; updated_at: string };
const contractStages = ["contract", "contract_ready", "payment", "payment_pending", "payment_approved"];
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);

export default async function ContractsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase.from("crm_opportunities")
    .select("id,title,customer_name,stage,estimated_value,expected_close_date,updated_at")
    .eq("organization_id", membership.organization_id)
    .in("stage", contractStages)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Sözleşme kayıtları okunamadı: " + error.message);
  const rows = (data ?? []) as Opportunity[];
  const total = rows.reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0);
  const signed = rows.filter((row) => ["payment", "payment_pending", "payment_approved"].includes(row.stage));

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">CRM / SÖZLEŞMELER</small><h1>Sözleşmeler</h1><p>Hazırlanan, imza bekleyen ve ödeme sürecine geçen sözleşmeleri takip edin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{rows.length} sözleşme</span><Link className="panel-primary" href="/panel/crm/proposals">Tekliflere git</Link></div>
    </div>
    <section className="crm-metrics">
      <article><small>TOPLAM SÖZLEŞME</small><strong>{rows.length}</strong><span>Aktif sözleşme kayıtları</span></article>
      <article><small>SÖZLEŞME DEĞERİ</small><strong>{money(total)}</strong><span>Toplam kayıt bedeli</span></article>
      <article><small>İMZA BEKLEYEN</small><strong>{rows.length - signed.length}</strong><span>Onay sürecinde</span></article>
      <article><small>İMZALANAN</small><strong>{signed.length}</strong><span>Ödeme veya iş açılışına hazır</span></article>
    </section>
    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">SÖZLEŞME LİSTESİ</small><h2>Sözleşme kayıtları</h2></div></div>
      <div className="dashboard-actions">
        {rows.map((row) => <Link href="/panel/crm" key={row.id}><span><b>{row.customer_name}</b><small>{row.title} · {row.stage.replaceAll("_", " ")}</small></span><b>{money(row.estimated_value)}</b></Link>)}
        {!rows.length ? <p>Henüz sözleşme aşamasında kayıt bulunmuyor.</p> : null}
      </div>
    </section>
  </div>;
}
