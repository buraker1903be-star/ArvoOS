import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signContract } from "./actions";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency}).format(value/100);
export default async function PublicContractPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{signed?:string;workflow?:string;created?:string}>}){
  const {token}=await params; const query=await searchParams; const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_public_crm_contract",{public_token:token});
  const row=Array.isArray(data)?data[0]:data; if(error||!row) notFound(); const signed=row.status==="signed";
  return <main style={{minHeight:"100vh",background:"#f4f7f4",padding:"40px 20px"}}><section style={{maxWidth:860,margin:"0 auto",background:"white",border:"1px solid #dde5dd",borderRadius:18,padding:32,boxShadow:"0 18px 50px rgba(20,40,30,.08)"}}>
    <small style={{fontWeight:800,letterSpacing:".12em",color:"#607080"}}>{row.organization_name}</small><h1 style={{fontSize:32,margin:"12px 0 4px"}}>Sözleşme {row.contract_no}</h1><p style={{color:"#667085"}}>{row.customer_name} adına düzenlenmiştir.</p>
    {query.created?<div style={{padding:14,borderRadius:10,background:"#eef7ee",margin:"20px 0"}}>Teklif kabul edildi. Sözleşme imzaya hazırlandı.</div>:null}
    {query.signed?<div style={{padding:14,borderRadius:10,background:"#eef7ee",margin:"20px 0"}}>Sözleşme imzalandı ve iş akışı oluşturuldu.</div>:null}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,margin:"24px 0"}}><div><small>SÖZLEŞME KONUSU</small><h2>{row.title}</h2></div><div><small>TOPLAM BEDEL</small><h2>{money(row.amount,row.currency)}</h2></div></div>
    <article style={{whiteSpace:"pre-wrap",lineHeight:1.75,color:"#344054",padding:"20px 0",borderTop:"1px solid #edf0ed",borderBottom:"1px solid #edf0ed"}}>{row.scope||"Kapsam belirtilmedi."}</article>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginTop:20}}><p><b>Ödeme planı</b><br/>{row.payment_plan||"Belirtilmedi"}</p><p><b>Başlangıç</b><br/>{row.start_date?new Date(row.start_date+"T00:00:00").toLocaleDateString("tr-TR"):"Belirtilmedi"}</p><p><b>Teslim</b><br/>{row.due_date?new Date(row.due_date+"T00:00:00").toLocaleDateString("tr-TR"):"Belirtilmedi"}</p></div>
    {!signed?<form action={signContract.bind(null,token)} style={{marginTop:28}}><label style={{display:"block",fontWeight:700}}>Ad Soyad<input name="signer_name" required minLength={2} style={{display:"block",width:"100%",marginTop:8,padding:12,border:"1px solid #cfd7cf",borderRadius:10}}/></label><label style={{display:"flex",gap:10,alignItems:"flex-start",margin:"18px 0"}}><input type="checkbox" name="accepted" required/><span>Sözleşme içeriğini okudum, kabul ediyorum ve elektronik olarak imzalıyorum.</span></label><button style={{width:"100%",padding:14,border:0,borderRadius:10,background:"#123d2b",color:"white",fontWeight:800,cursor:"pointer"}}>Sözleşmeyi İmzala</button></form>:<div style={{marginTop:24,padding:16,background:"#eef7ee",borderRadius:10}}><b>İmzalandı</b><br/>{row.signed_name} · {row.signed_at?new Date(row.signed_at).toLocaleString("tr-TR"):""}</div>}
  </section></main>;
}
