import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../finance.css";

type Party={id:string;name:string;party_type:string;email:string|null;phone:string|null;tax_number:string|null;tax_office:string|null;is_active:boolean};
type Entry={party_id:string;entry_type:"debit"|"credit";amount:number;currency:string;description:string;reference_no:string|null;transaction_date:string;due_date:string|null};
const money=(value:number,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:0}).format(value/100);

export default async function FinanceAccountsPage(){
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(m=>m.code==="finance")) throw new Error("Finans modülüne erişiminiz yok.");
 const [{data:parties,error},{data:entries,error:entryError}]=await Promise.all([
  supabase.from("account_parties").select("id,name,party_type,email,phone,tax_number,tax_office,is_active").eq("organization_id",membership.organization_id).eq("is_active",true).order("name"),
  supabase.from("account_entries").select("party_id,entry_type,amount,currency,description,reference_no,transaction_date,due_date").eq("organization_id",membership.organization_id).order("transaction_date",{ascending:false}),
 ]);
 if(error) throw new Error("Cari hesaplar okunamadı: "+error.message);
 if(entryError) throw new Error("Cari hareketler okunamadı: "+entryError.message);
 const rows=(parties??[]) as Party[]; const ledger=(entries??[]) as Entry[];
 const balances=rows.map(p=>{const items=ledger.filter(e=>e.party_id===p.id);const debit=items.filter(e=>e.entry_type==="debit").reduce((s,e)=>s+Number(e.amount),0);const credit=items.filter(e=>e.entry_type==="credit").reduce((s,e)=>s+Number(e.amount),0);return{party:p,debit,credit,balance:debit-credit,items};});
 const receivable=balances.reduce((s,r)=>s+Math.max(0,r.balance),0);
 return <div className="finance-page-stack"><div className="panel-pagehead"><div><small className="panel-kicker">FİNANS / CARİ HESAPLAR</small><h1>Cari Hesaplar</h1><p>Müşteri bakiyelerini, sözleşme alacaklarını ve tahsilat hareketlerini tek yerde izleyin.</p></div><div className="panel-page-actions"><span className="status-pill">{rows.length} cari</span><Link className="panel-secondary" href="/panel/finance">Finans merkezine dön</Link><Link className="panel-primary" href="/panel/finance/payment-plans">Ödeme planları</Link></div></div>
 <section className="finance-metrics"><article><small>CARİ SAYISI</small><strong>{rows.length}</strong><span>Aktif müşteri ve kurum</span></article><article><small>AÇIK ALACAK</small><strong>{money(receivable)}</strong><span>Tahsil edilmemiş bakiye</span></article><article><small>TOPLAM BORÇLANDIRMA</small><strong>{money(balances.reduce((s,r)=>s+r.debit,0))}</strong><span>Sözleşme ve fatura kayıtları</span></article><article><small>TOPLAM TAHSİLAT</small><strong>{money(balances.reduce((s,r)=>s+r.credit,0))}</strong><span>Cari hesaba işlenen ödemeler</span></article></section>
 <section className="finance-account-grid">{balances.map(({party,debit,credit,balance,items})=><article className="panel-card finance-account-card" key={party.id}><header><div><small>{party.party_type==="customer"?"MÜŞTERİ":"CARİ"}</small><h2>{party.name}</h2></div><span className={balance>0?"finance-balance open":"finance-balance settled"}>{balance>0?money(balance):"Kapandı"}</span></header><div className="finance-contact"><span>{party.phone||"Telefon yok"}</span><span>{party.email||"E-posta yok"}</span><span>{party.tax_number?`${party.tax_office||"Vergi"} · ${party.tax_number}`:"Vergi bilgisi yok"}</span></div><div className="finance-account-summary"><span><small>BORÇ</small><b>{money(debit)}</b></span><span><small>TAHSİLAT</small><b>{money(credit)}</b></span><span><small>HAREKET</small><b>{items.length}</b></span></div><details><summary>Son hareketleri göster</summary><div className="finance-ledger">{items.slice(0,6).map((entry,index)=><div key={`${entry.transaction_date}-${index}`}><div><b>{entry.description}</b><small>{new Date(entry.transaction_date+"T00:00:00").toLocaleDateString("tr-TR")}{entry.reference_no?` · ${entry.reference_no}`:""}</small></div><strong className={entry.entry_type==="credit"?"positive":"negative"}>{entry.entry_type==="credit"?"-":"+"}{money(Number(entry.amount),entry.currency)}</strong></div>)}{!items.length?<p>Henüz cari hareket yok.</p>:null}</div></details></article>)}{!rows.length?<div className="panel-card finance-empty">Henüz cari hesap oluşmadı. İlk imzalı sözleşmede otomatik açılır.</div>:null}</section></div>;
}
