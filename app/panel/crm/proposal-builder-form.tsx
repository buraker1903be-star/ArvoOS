"use client";

import { useMemo, useState } from "react";
import { createProposal } from "./sales-actions";

type Props={opportunityId:string;title:string;scope:string};
type Tax="excluded"|"included"|"exempt";
type Plan="cash"|"half"|"thirds"|"custom";
const money=(v:number)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(v);

export function ProposalBuilderForm({opportunityId,title,scope}:Props){
 const [amount,setAmount]=useState(0); const [tax,setTax]=useState<Tax>("excluded"); const [plan,setPlan]=useState<Plan>("cash"); const [custom,setCustom]=useState("");
 const calc=useMemo(()=>{const gross=tax==="included"?amount:tax==="excluded"?amount*1.2:amount;const net=tax==="included"?amount/1.2:amount;const vat=tax==="exempt"?0:gross-net;return{gross,net,vat}},[amount,tax]);
 const schedule=useMemo(()=>{if(plan==="cash")return[{label:"Peşin ödeme",amount:calc.gross}];if(plan==="half"){const first=Math.round(calc.gross*50)/100;return[{label:"Peşin",amount:first},{label:"Teslim öncesi",amount:calc.gross-first}]};if(plan==="thirds"){const first=Math.floor(calc.gross*100/3)/100;return[{label:"Peşin",amount:first},{label:"Ara ödeme",amount:first},{label:"Teslim öncesi",amount:calc.gross-first*2}]};return[]},[calc.gross,plan]);
 const planText=plan==="cash"?"Peşin Ödeme":plan==="half"?"%50 Peşin - %50 Teslim Öncesi":plan==="thirds"?"1/3 Peşin - Ara Ödeme - Teslim Öncesi":custom;
 return <form className="panel-form proposal-builder" action={createProposal}>
  <input type="hidden" name="opportunity_id" value={opportunityId}/><input type="hidden" name="payment_schedule" value={JSON.stringify(schedule)}/><input type="hidden" name="payment_plan" value={planText}/>
  <label>Teklif başlığı<input name="title" required defaultValue={title}/></label>
  <label>Teklif tutarı<input name="amount" type="number" min="0" step="0.01" required onChange={e=>setAmount(Number(e.target.value)||0)}/></label>
  <label>KDV durumu<select name="tax_status" value={tax} onChange={e=>setTax(e.target.value as Tax)}><option value="excluded">KDV Hariç</option><option value="included">KDV Dahil</option><option value="exempt">KDV İstisna</option></select></label>
  <label>Ödeme planı<select name="payment_plan_type" value={plan} onChange={e=>setPlan(e.target.value as Plan)}><option value="cash">Peşin Ödeme</option><option value="half">%50 Peşin - %50 Teslim Öncesi</option><option value="thirds">1/3 Peşin - Ara Ödeme - Teslim Öncesi</option><option value="custom">Özel Ödeme Planı</option></select></label>
  {plan==="custom"?<label className="wide">Özel ödeme planı<textarea value={custom} onChange={e=>setCustom(e.target.value)} required placeholder="Ödeme tutarlarını ve vadeleri yazın"/></label>:null}
  <label className="wide">Hizmet kapsamı<textarea name="scope" required defaultValue={scope}/></label><label>Geçerlilik tarihi<input name="valid_until" type="date"/></label>
  <section className="proposal-live-summary wide"><div><span>Ara toplam</span><b>{money(calc.net)}</b></div><div><span>KDV</span><b>{money(calc.vat)}</b></div><div><span>Genel toplam</span><strong>{money(calc.gross)}</strong></div>{schedule.map((item,i)=><div key={i}><span>{item.label}</span><b>{money(item.amount)}</b></div>)}</section>
  <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Teklifi oluştur</button></div>
 </form>
}
