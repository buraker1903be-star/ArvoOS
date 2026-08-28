import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { updateInvoiceStatus } from "../actions";
import { FinanceNavigation } from "../finance-navigation";
import "../finance.css";

type Invoice={id:string;status:string;currency:string;subtotal:number;tax:number;total:number;due_at:string|null;paid_at:string|null;created_at:string};
type Contract={id:string;contract_no:string;title:string;invoice_id:string|null;crm_opportunities:{customer_name:string}|null};
const statuses=["draft","open","paid","void"];
const labels:Record<string,string>={draft:"Taslak",open:"Açık",paid:"Ödendi",void:"İptal"};
const money=(value:number,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(value/100);
const date=(value:string|null)=>value?new Date(value).toLocaleDateString("tr-TR"):"Tarih yok";

export default async function InvoicesPage(){
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(m=>m.code==="finance")) throw new Error("Finans modülüne erişiminiz yok.");
 const organizationId=membership.organization_id;
 const [{data:invoices,error},{data:contracts}]=await Promise.all([
  supabase.from("billing_invoices").select("id,status,currency,subtotal,tax,total,due_at,paid_at,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}),
  supabase.from("crm_contracts").select("id,contract_no,title,invoice_id,crm_opportunities(customer_name)").eq("organization_id",organizationId).not("invoice_id","is",null),
 ]);
 if(error) throw new Error("Faturalar okunamadı: "+error.message);
 const rows=(invoices??[]) as Invoice[];
 const contractRows=(contracts??[]) as unknown as Contract[];
 const contractMap=new Map(contractRows.filter(c=>c.invoice_id).map(c=>[c.invoice_id!,c]));
 const openTotal=rows.filter(r=>r.status==="open").reduce((s,r)=>s+Number(r.total),0);
 const draftTotal=rows.filter(r=>r.status==="draft").reduce((s,r)=>s+Number(r.total),0);
 const paidTotal=rows.filter(r=>r.status==="paid").reduce((s,r)=>s+Number(r.total),0);
 const overdue=rows.filter(r=>r.status==="open"&&r.due_at&&new Date(r.due_at).getTime()<Date.now());
 const canManage=["owner","admin"].includes(membership.role);
 return <div className="finance-page-stack">
  <div className="panel-pagehead"><div><small className="panel-kicker">FİNANS / FATURALAR</small><h1>Faturalar</h1><p>Sözleşmelerden oluşan fatura taslaklarını kontrol edin, açın ve tahsilat durumunu yönetin.</p></div><div className="panel-page-actions"><span className="status-pill">{rows.length} fatura</span><Link className="panel-primary" href="/panel/finance/payment-plans">Ödeme Planları</Link></div></div>
  <FinanceNavigation active="invoices" hasAccounts={modules.some(m=>m.code==="accounts")} hasBanking={modules.some(m=>m.code==="banking")} />
  <section className="finance-metrics"><article><small>TASLAK</small><strong>{money(draftTotal)}</strong><span>{rows.filter(r=>r.status==="draft").length} kayıt</span></article><article><small>AÇIK ALACAK</small><strong>{money(openTotal)}</strong><span>{rows.filter(r=>r.status==="open").length} fatura</span></article><article><small>TAHSİL EDİLEN</small><strong>{money(paidTotal)}</strong><span>{rows.filter(r=>r.status==="paid").length} fatura</span></article><article><small>GECİKEN</small><strong>{money(overdue.reduce((s,r)=>s+Number(r.total),0))}</strong><span>{overdue.length} fatura</span></article></section>
  <section className="finance-invoice-list">{rows.map(row=>{const contract=contractMap.get(row.id);const isOverdue=row.status==="open"&&!!row.due_at&&new Date(row.due_at).getTime()<Date.now();return <article className="panel-card finance-invoice-card" key={row.id}><div><div className="finance-record-heading"><span className="status-pill">{labels[row.status]??row.status}</span>{isOverdue?<span className="status-pill finance-risk">Gecikti</span>:null}</div><h2>{contract?.crm_opportunities?.customer_name||"Müşteri bilgisi yok"}</h2><h3>{contract?.title||"Fatura kaydı"}</h3><p>{contract?.contract_no||"Sözleşme bağlantısı yok"} · Oluşturma: {date(row.created_at)} · Vade: {date(row.due_at)}</p></div><div className="finance-invoice-value"><small>TOPLAM</small><strong>{money(row.total,row.currency)}</strong><span>Ara toplam {money(row.subtotal,row.currency)} · Vergi {money(row.tax,row.currency)}</span>{row.paid_at?<span>Ödeme: {date(row.paid_at)}</span>:null}</div>{canManage?<form action={updateInvoiceStatus}><input type="hidden" name="invoice_id" value={row.id}/><select name="status" defaultValue={row.status}>{statuses.map(status=><option key={status} value={status}>{labels[status]}</option>)}</select><button className="panel-primary" type="submit">Durumu Güncelle</button></form>:null}</article>})}{!rows.length?<div className="panel-card finance-empty">Henüz fatura taslağı yok. Sözleşme imzalandığında otomatik oluşur.</div>:null}</section>
 </div>;
}
