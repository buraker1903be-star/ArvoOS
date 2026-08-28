import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { createCollection, createRefund } from "../actions";
import "../../finance/finance.css";

const money = (n:number) => new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY" }).format(n/100);
const date = (v:string) => new Intl.DateTimeFormat("tr-TR", { day:"2-digit", month:"long", year:"numeric" }).format(new Date(v));
type Entry={id:string;entry_type:"debit"|"credit";amount:number;description:string;reference_no:string|null;source_type:string|null;transaction_date:string;created_at:string};
type Party={id:string;name:string;email:string|null;phone:string|null;tax_number:string|null;tax_office:string|null;account_entries:Entry[]};
type Contract={id:string;contract_no:string;title:string;amount:number;status:string;signed_at:string|null};

export default async function AccountDetailPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const {supabase,membership,modules}=await getPanelContext();
  if(!modules.some((m)=>m.code==="accounts")) throw new Error("Cari hesap modülüne erişiminiz yok.");
  const [{data:party,error},{data:contracts,error:contractError}]=await Promise.all([
    supabase.from("account_parties").select("id,name,email,phone,tax_number,tax_office,account_entries(id,entry_type,amount,description,reference_no,source_type,transaction_date,created_at)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle(),
    supabase.from("crm_contracts").select("id,contract_no,title,amount,status,signed_at").eq("party_id",id).eq("organization_id",membership.organization_id).in("status",["signed","completed"]).order("created_at",{ascending:false}),
  ]);
  if(error||!party) notFound();
  if(contractError) throw new Error("Sözleşmeler okunamadı: "+contractError.message);
  const current=party as Party;
  const entries=[...(current.account_entries??[])].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date)||b.created_at.localeCompare(a.created_at));
  const debt=(contracts??[]).reduce((sum,c)=>sum+Number(c.amount),0)||entries.filter((e)=>e.entry_type==="debit"&&e.source_type!=="adjustment").reduce((s,e)=>s+Number(e.amount),0);
  const recorded=entries.filter((e)=>e.entry_type==="credit").reduce((s,e)=>s+Number(e.amount),0);
  const refunds=entries.filter((e)=>e.entry_type==="debit"&&e.source_type==="adjustment").reduce((s,e)=>s+Number(e.amount),0);
  const collections=Math.min(recorded,debt+refunds);
  const balance=Math.max(0,debt+refunds-collections);
  return <main className="finance-ledger-page finance-account-detail">
    <header className="panel-pagehead"><div><small className="panel-kicker">CARİ HESAP</small><h1>{current.name}</h1><p>{[current.phone,current.email,current.tax_number].filter(Boolean).join(" · ")||"Müşteri cari hareket dökümü"}</p></div><div className="panel-page-actions"><Link className="panel-secondary" href="/panel/finance">← Cari hesaplar</Link></div></header>
    <section className="finance-ledger-summary"><article><span>Sözleşme toplamı</span><strong>{money(debt)}</strong><small>{contracts?.length??0} imzalı sözleşme</small></article><article><span>Toplam tahsilat</span><strong>{money(collections)}</strong><small>Bakiyeye uygulanan</small></article><article><span>Toplam iade</span><strong>{money(refunds)}</strong><small>Müşteriye geri ödenen</small></article><article className="is-primary"><span>Açık bakiye</span><strong>{money(balance)}</strong><small>{balance>0?"Tahsilat bekliyor":"Cari kapandı"}</small></article></section>
    <section className="panel-card finance-account-toolbar"><div><small className="panel-kicker">İŞLEMLER</small><h2>Cari işlemleri</h2></div><div className="finance-ledger-actions"><PanelDrawer triggerLabel="+ Tahsilat Ekle" title={`${current.name} · Tahsilat`} description={`Açık bakiye: ${money(balance)}`}><form className="panel-form" action={createCollection}><input type="hidden" name="party_id" value={id}/><label>Tahsilat tutarı<input name="amount" type="number" min="0.01" max={balance/100} step="0.01" required/></label><label>Tarih<input name="transaction_date" type="date"/></label><label>Referans / dekont no<input name="reference_no"/></label><label className="wide">Açıklama<input name="description" defaultValue="Müşteri tahsilatı" required/></label><div className="form-actions wide"><button className="panel-primary" disabled={!balance}>Tahsilatı kaydet</button></div></form></PanelDrawer><PanelDrawer triggerLabel="İade İşlemi" title={`${current.name} · İade`} description={`İade edilebilir: ${money(Math.max(0,collections-refunds))}`}><form className="panel-form" action={createRefund}><input type="hidden" name="party_id" value={id}/><label>İade tutarı<input name="amount" type="number" min="0.01" max={Math.max(0,collections-refunds)/100} step="0.01" required/></label><label>Tarih<input name="transaction_date" type="date"/></label><label>Referans / dekont no<input name="reference_no"/></label><label className="wide">İade nedeni<input name="description" required/></label><div className="form-actions wide"><button className="panel-primary" disabled={collections<=refunds}>İadeyi kaydet</button></div></form></PanelDrawer></div></section>
    <section className="panel-card finance-account-statement"><div className="section-heading"><div><small className="panel-kicker">HAREKET DÖKÜMÜ</small><h2>Tüm cari hareketler</h2></div><span className="status-pill">{entries.length} hareket</span></div><div className="panel-table"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th>Referans</th><th>Tutar</th></tr></thead><tbody>{entries.map((e)=><tr key={e.id}><td>{date(e.transaction_date)}</td><td><span className="status-pill">{e.source_type==="adjustment"?"İade":e.entry_type==="credit"?"Tahsilat":"Sözleşme"}</span></td><td>{e.description}</td><td>{e.reference_no||"—"}</td><td><strong className={e.entry_type==="credit"?"statement-credit":"statement-debit"}>{e.entry_type==="credit"?"−":"+"}{money(Number(e.amount))}</strong></td></tr>)}{!entries.length?<tr><td colSpan={5} className="panel-empty">Henüz cari hareket bulunmuyor.</td></tr>:null}</tbody></table></div></section>
    {(contracts??[]).length?<section className="panel-card finance-contract-list"><div className="section-heading"><div><small className="panel-kicker">SÖZLEŞMELER</small><h2>Bakiyeyi oluşturan sözleşmeler</h2></div></div>{(contracts as Contract[]).map((c)=><div key={c.id}><span><b>{c.contract_no}</b><small>{c.title} · {c.signed_at?date(c.signed_at):"İmzalı"}</small></span><strong>{money(Number(c.amount))}</strong></div>)}</section>:null}
  </main>;
}
