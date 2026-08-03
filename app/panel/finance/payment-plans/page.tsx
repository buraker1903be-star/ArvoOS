import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { collectPaymentInstallment } from "../actions";
import "../finance.css";

type Plan={id:string;contract_id:string;party_id:string;total_amount:number;currency:string;status:string;created_at:string};
type Installment={id:string;payment_plan_id:string;installment_no:number;due_date:string|null;amount:number;status:string;paid_at:string|null};
type Party={id:string;name:string;email:string|null;phone:string|null};
type Contract={id:string;contract_no:string;title:string};
const money=(value:number,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:0}).format(value/100);
const date=(value:string|null)=>value?new Date(value.includes("T")?value:value+"T00:00:00").toLocaleDateString("tr-TR"):"Vade yok";

export default async function PaymentPlansPage(){
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(m=>m.code==="finance")) throw new Error("Finans modülüne erişiminiz yok.");
 const org=membership.organization_id;
 const [{data:plans,error},{data:installments,error:installmentError}]=await Promise.all([
  supabase.from("payment_plans").select("id,contract_id,party_id,total_amount,currency,status,created_at").eq("organization_id",org).order("created_at",{ascending:false}),
  supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status,paid_at").eq("organization_id",org).order("due_date"),
 ]);
 if(error) throw new Error("Ödeme planları okunamadı: "+error.message);
 if(installmentError) throw new Error("Taksitler okunamadı: "+installmentError.message);
 const planRows=(plans??[]) as Plan[]; const installmentRows=(installments??[]) as Installment[];
 const partyIds=[...new Set(planRows.map(p=>p.party_id))]; const contractIds=[...new Set(planRows.map(p=>p.contract_id))];
 const [{data:parties},{data:contracts}]=await Promise.all([
  partyIds.length?supabase.from("account_parties").select("id,name,email,phone").in("id",partyIds):Promise.resolve({data:[]}),
  contractIds.length?supabase.from("crm_contracts").select("id,contract_no,title").in("id",contractIds):Promise.resolve({data:[]}),
 ]);
 const partyMap=new Map(((parties??[]) as Party[]).map(p=>[p.id,p])); const contractMap=new Map(((contracts??[]) as Contract[]).map(c=>[c.id,c]));
 const pending=installmentRows.filter(i=>i.status==="pending"); const paid=installmentRows.filter(i=>i.status==="paid"); const overdue=pending.filter(i=>i.due_date&&new Date(i.due_date+"T23:59:59").getTime()<Date.now());
 return <div className="finance-page-stack"><div className="panel-pagehead"><div><small className="panel-kicker">FİNANS / TAHSİLAT</small><h1>Ödeme Planları</h1><p>İmzalı sözleşmelerden otomatik oluşan taksitleri takip edin ve tahsilatları cari hesaba işleyin.</p></div><div className="panel-page-actions"><span className="status-pill">{planRows.length} plan</span><Link className="panel-secondary" href="/panel/finance">Finans merkezine dön</Link><Link className="panel-primary" href="/panel/finance/accounts">Cari hesaplar</Link></div></div>
 <section className="finance-metrics"><article><small>AKTİF PLAN</small><strong>{planRows.filter(p=>p.status==="active").length}</strong><span>Tahsilatı devam eden</span></article><article><small>BEKLEYEN TAHSİLAT</small><strong>{money(pending.reduce((s,i)=>s+Number(i.amount),0))}</strong><span>{pending.length} taksit</span></article><article><small>GECİKEN</small><strong>{money(overdue.reduce((s,i)=>s+Number(i.amount),0))}</strong><span>{overdue.length} gecikmiş taksit</span></article><article><small>TAHSİL EDİLEN</small><strong>{money(paid.reduce((s,i)=>s+Number(i.amount),0))}</strong><span>{paid.length} ödeme</span></article></section>
 <section className="finance-plan-list">{planRows.map(plan=>{const party=partyMap.get(plan.party_id);const contract=contractMap.get(plan.contract_id);const items=installmentRows.filter(i=>i.payment_plan_id===plan.id);const paidAmount=items.filter(i=>i.status==="paid").reduce((s,i)=>s+Number(i.amount),0);const progress=plan.total_amount?Math.min(100,Math.round(paidAmount/plan.total_amount*100)):0;return <article className="panel-card finance-plan-card" key={plan.id}><header><div><small>{contract?.contract_no||"SÖZLEŞME"}</small><h2>{party?.name||"Cari hesap"}</h2><p>{contract?.title||"Ödeme planı"}</p></div><div><span className="status-pill">{plan.status==="completed"?"Tamamlandı":"Aktif"}</span><strong>{money(plan.total_amount,plan.currency)}</strong></div></header><div className="finance-progress"><span style={{width:`${progress}%`}}/><small>%{progress} tahsil edildi</small></div><div className="finance-contact"><span>{party?.phone||"Telefon yok"}</span><span>{party?.email||"E-posta yok"}</span></div><div className="finance-installments">{items.map(item=>{const isOverdue=item.status==="pending"&&!!item.due_date&&new Date(item.due_date+"T23:59:59").getTime()<Date.now();return <div className={isOverdue?"finance-installment overdue":"finance-installment"} key={item.id}><div><b>{item.installment_no}. Taksit</b><small>{date(item.due_date)}{isOverdue?" · Gecikti":""}</small></div><strong>{money(item.amount,plan.currency)}</strong><span className={item.status==="paid"?"paid":"pending"}>{item.status==="paid"?`Tahsil edildi${item.paid_at?` · ${date(item.paid_at)}`:""}`:"Bekliyor"}</span>{item.status==="pending"?<form action={collectPaymentInstallment}><input type="hidden" name="installment_id" value={item.id}/><button className="panel-primary" type="submit">Tahsil Et</button></form>:null}</div>)}{!items.length?<p className="finance-empty">Bu planda taksit bulunmuyor.</p>:null}</div></article>})}{!planRows.length?<div className="panel-card finance-empty">Henüz ödeme planı yok. Sözleşme imzalandığında otomatik oluşur.</div>:null}</section></div>;
}
