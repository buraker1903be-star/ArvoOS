import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { respondToProposal } from "./actions";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency}).format(value/100);
export default async function PublicProposalPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{result?:string}>}){
  const {token}=await params; const {result}=await searchParams; const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_public_crm_proposal",{public_token:token});
  const row=Array.isArray(data)?data[0]:data; if(error||!row) notFound();
  const locked=["accepted","rejected","expired","archived"].includes(row.status);
  return <main style={{minHeight:"100vh",background:"#f4f7f4",padding:"40px 20px"}}><section style={{maxWidth:820,margin:"0 auto",background:"white",border:"1px solid #dde5dd",borderRadius:18,padding:32,boxShadow:"0 18px 50px rgba(20,40,30,.08)"}}>
    <small style={{fontWeight:800,letterSpacing:".12em",color:"#607080"}}>{row.organization_name}</small><h1 style={{fontSize:32,margin:"12px 0 4px"}}>Teklif {row.proposal_no}</h1><p style={{color:"#667085"}}>{row.customer_name} adına hazırlanmıştır.</p>
    {result?<div style={{padding:14,borderRadius:10,background:"#eef7ee",margin:"20px 0"}}>İşleminiz kaydedildi: <b>{result}</b></div>:null}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,margin:"24px 0"}}><div><small>TEKLİF BAŞLIĞI</small><h2>{row.title}</h2></div><div><small>TOPLAM BEDEL</small><h2>{money(row.amount,row.currency)}</h2></div></div>
    <article style={{whiteSpace:"pre-wrap",lineHeight:1.75,color:"#344054",padding:"20px 0",borderTop:"1px solid #edf0ed",borderBottom:"1px solid #edf0ed"}}>{row.scope||"Kapsam belirtilmedi."}</article>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:20}}><p><b>Ödeme planı</b><br/>{row.payment_plan||"Belirtilmedi"}</p><p><b>Geçerlilik</b><br/>{row.valid_until?new Date(row.valid_until+"T00:00:00").toLocaleDateString("tr-TR"):"Belirtilmedi"}</p></div>
    {!locked?<form action={respondToProposal.bind(null,token)} style={{display:"flex",gap:12,marginTop:28,flexWrap:"wrap"}}><button name="decision" value="accept" style={{flex:1,minWidth:220,padding:14,border:0,borderRadius:10,background:"#123d2b",color:"white",fontWeight:800,cursor:"pointer"}}>Kabul Ediyorum</button><button name="decision" value="reject" style={{flex:1,minWidth:220,padding:14,border:"1px solid #cfd7cf",borderRadius:10,background:"white",fontWeight:800,cursor:"pointer"}}>Reddediyorum</button></form>:<p style={{marginTop:24,fontWeight:700}}>Bu teklif için karar verilmiştir: {row.status}</p>}
  </section></main>;
}
