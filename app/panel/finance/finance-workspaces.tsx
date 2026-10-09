"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FinIcon } from "./finance-ui";
import { SatirTiklama } from "../crm/satir-tiklama";

const PAGE_SIZE=10;
const money=(amount:number)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(amount/100);
const normalize=(value:string)=>value.toLocaleLowerCase("tr-TR");

export type ProfitRow={id:string;contractNo:string;customer:string;title:string;sales:string;operation:string;amount:number;cost:number;profit:number;margin:number;date:string};

function Pager({page,pages,total,onChange}:{page:number;pages:number;total:number;onChange:(page:number)=>void}){
  if(pages<=1)return null;
  const from=(page-1)*PAGE_SIZE+1;
  const to=Math.min(page*PAGE_SIZE,total);
  return (
    <nav className="fin-pager" aria-label="Sayfalar">
      <span>{from}–{to} / {total} kayıt</span>
      <div>
        <button type="button" disabled={page===1} onClick={()=>onChange(page-1)}>Önceki</button>
        <b>{page} / {pages}</b>
        <button type="button" disabled={page===pages} onClick={()=>onChange(page+1)}>Sonraki</button>
      </div>
    </nav>
  );
}

export function ProfitabilityWorkspace({rows}:{rows:ProfitRow[]}){
  const [query,setQuery]=useState("");const [contract,setContract]=useState("");const [start,setStart]=useState("");const [end,setEnd]=useState("");const [page,setPage]=useState(1);
  const filtered=useMemo(()=>rows.filter(row=>(!query||normalize(`${row.customer} ${row.title}`).includes(normalize(query)))&&(!contract||normalize(row.contractNo).includes(normalize(contract)))&&(!start||row.date>=start)&&(!end||row.date<=end)),[rows,query,contract,start,end]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,pages);const visible=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const change=(setter:(value:string)=>void)=>(value:string)=>{setter(value);setPage(1)};
  const isFiltered=Boolean(query||contract||start||end);
  /*
    Panel kalıbı: liste kartı + ortak tablo. Eskiden bu ekran kendi
    tasarım dilini (fin-card, fin-table, fin-toolbar) kullanıyordu ve
    panelin diğer listelerine benzemiyordu — aynı işi yapan iki ayrı
    tablo dili, biri değişince öteki geride kalıyordu.
  */
  return (
    <section className="panel-card talep-bilgi" aria-label="İş kârlılık tablosu">
      <div className="ekip-suzgec talep-suzgec">
        <span className="talep-suzgec-etiket">{filtered.length} iş</span>
        <label className="fin-field is-grow">
          <span className="fin-sr">Müşteri / iş</span>
          <span className="fin-search"><FinIcon name="search" size={16}/><input value={query} onChange={e=>change(setQuery)(e.target.value)} placeholder="Müşteri adı veya iş konusu"/></span>
        </label>
        <label className="fin-field"><span className="fin-sr">Sözleşme no</span><input value={contract} onChange={e=>change(setContract)(e.target.value)} placeholder="SÖZ-2026-..."/></label>
        <label className="fin-field"><span className="fin-sr">Başlangıç</span><input type="date" aria-label="Başlangıç tarihi" value={start} onChange={e=>change(setStart)(e.target.value)}/></label>
        <label className="fin-field"><span className="fin-sr">Bitiş</span><input type="date" aria-label="Bitiş tarihi" value={end} onChange={e=>change(setEnd)(e.target.value)}/></label>
        {isFiltered ? <button type="button" className="panel-secondary" onClick={()=>{setQuery("");setContract("");setStart("");setEnd("");setPage(1)}}>Temizle</button> : null}
      </div>

      {visible.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table">
            <thead>
              <tr>
                <th>İş / Müşteri</th>
                <th>Satış</th>
                <th>Operasyon</th>
                <th className="crm-col-amount">Sözleşme</th>
                <th className="crm-col-amount">Maliyet</th>
                <th className="crm-col-amount">Kâr</th>
                <th className="crm-col-amount">Oran</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row=>(
                <tr key={row.id}>
                  <td data-label="İş / Müşteri">
                    <Link className="crm-row-link" href={`/panel/finance?gorunum=maliyet&maliyet=${row.id}`} scroll={false} aria-label={`${row.contractNo} maliyet detayı`}>
                      <span className="crm-table-title" title={row.customer}>{row.customer}</span>
                      <span className="crm-table-sub">{row.contractNo} · {row.title}</span>
                    </Link>
                  </td>
                  <td data-label="Satış"><span className="crm-table-sub">{row.sales}</span></td>
                  <td data-label="Operasyon"><span className="crm-table-sub">{row.operation}</span></td>
                  <td data-label="Sözleşme" className="crm-table-mono">{money(row.amount)}</td>
                  <td data-label="Maliyet" className="crm-table-mono">{row.cost ? money(row.cost) : <span className="talep-bos">—</span>}</td>
                  <td data-label="Kâr" className="crm-table-mono"><b className={row.profit>=0?"fin-pos":"fin-neg"}>{money(row.profit)}</b></td>
                  <td data-label="Oran" className="crm-table-mono">
                    <span className="status-pill" data-tone={row.margin>=30?"success":row.margin>=0?"warning":"danger"}>%{row.margin.toFixed(1)}</span>
                  </td>
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
      ) : (
        <div className="crm-empty-state talep-bos-kutu">
          <p>{isFiltered?"Filtreye uygun iş yok":"Henüz imzalı iş yok"}</p>
          <small>{isFiltered?"Arama ölçütlerini değiştirin ya da Temizle ile tüm işleri gösterin.":"İmzalanan sözleşmeler maliyet ve kârlarıyla burada listelenir."}</small>
        </div>
      )}
      <Pager page={safePage} pages={pages} total={filtered.length} onChange={setPage}/>
    </section>
  );
}
