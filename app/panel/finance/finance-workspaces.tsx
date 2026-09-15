"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { saveInstallmentPaymentLink } from "./actions";
import { cancelPaytrPaymentLink, createPaytrPaymentLink } from "./paytr-actions";
import { PaymentShareActions } from "./payment-share-actions";
import { FinEmpty, FinIcon, FinPerson, FinWidget, initials } from "./finance-ui";

const PAGE_SIZE=10;
const money=(amount:number)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(amount/100);
const normalize=(value:string)=>value.toLocaleLowerCase("tr-TR");
const dueDate=(value:string|null)=>value?new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR"):"—";

export type ProfitRow={id:string;contractNo:string;customer:string;title:string;sales:string;operation:string;amount:number;cost:number;profit:number;margin:number;date:string};
export type PaymentRow={id:string;contractId:string;contractNo:string;installmentNo:number;customer:string;amount:number;dueDate:string|null;status:string;paymentUrl:string|null;linkSource:string|null;whatsappUrl:string|null;emailUrl:string|null;overdue:boolean};

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
  return (
    <section className="fin-card" aria-label="İş kârlılık tablosu">
      <header className="fin-card-head">
        <div>
          <h2>İş kârlılık tablosu</h2>
          <p>Ayrıntılı maliyet hareketleri için bir işe dokunun.</p>
        </div>
        <span className="status-pill">{filtered.length} iş</span>
      </header>
      <div className="fin-toolbar" role="search">
        <label className="fin-field is-grow"><span>Müşteri / iş</span><span className="fin-search"><FinIcon name="search" size={16}/><input value={query} onChange={e=>change(setQuery)(e.target.value)} placeholder="Müşteri adı veya iş konusu"/></span></label>
        <label className="fin-field"><span>Sözleşme no</span><input value={contract} onChange={e=>change(setContract)(e.target.value)} placeholder="SÖZ-2026-..."/></label>
        <label className="fin-field"><span>Başlangıç</span><input type="date" value={start} onChange={e=>change(setStart)(e.target.value)}/></label>
        <label className="fin-field"><span>Bitiş</span><input type="date" value={end} onChange={e=>change(setEnd)(e.target.value)}/></label>
        <button type="button" className="panel-secondary" disabled={!isFiltered} onClick={()=>{setQuery("");setContract("");setStart("");setEnd("");setPage(1)}}>Temizle</button>
      </div>
      {visible.length ? (
        <div className="fin-table-wrap">
          <table className="fin-table" data-cols="profit">
            <thead>
              <tr>
                <th scope="col">İş / Müşteri</th>
                <th scope="col">Satış</th>
                <th scope="col">Operasyon</th>
                <th scope="col" className="fin-num">Sözleşme</th>
                <th scope="col" className="fin-num">Maliyet</th>
                <th scope="col" className="fin-num">Kâr</th>
                <th scope="col" className="fin-num">Oran</th>
                <th scope="col"><span className="fin-sr">Detay</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row=>(
                <tr key={row.id}>
                  <td className="fin-col-main">
                    <Link className="fin-entity" href={`/panel/finance/costs/${row.id}`}>
                      <span className="fin-entity-text">
                        <small className="fin-ref">{row.contractNo}</small>
                        <b>{row.customer}</b>
                        <small>{row.title}</small>
                      </span>
                    </Link>
                  </td>
                  <td data-label="Satış"><FinPerson name={row.sales}/></td>
                  <td data-label="Operasyon"><FinPerson name={row.operation}/></td>
                  <td className="fin-num" data-label="Sözleşme">{money(row.amount)}</td>
                  <td className={row.cost?"fin-num fin-warn":"fin-num is-zero"} data-label="Maliyet">{money(row.cost)}</td>
                  <td className={`fin-num ${row.profit>=0?"fin-pos":"fin-neg"}`} data-label="Kâr">{money(row.profit)}</td>
                  <td className="fin-num" data-label="Kâr oranı"><span className="status-pill" data-tone={row.margin>=30?"success":row.margin>=0?"warning":"danger"}>%{row.margin.toFixed(1)}</span></td>
                  <td className="fin-col-chevron"><Link className="fin-chevron-link" href={`/panel/finance/costs/${row.id}`} aria-label={`${row.contractNo} maliyet detayı`}><FinIcon name="chevron" size={16}/></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <FinEmpty icon={isFiltered?"search":"briefcase"} title={isFiltered?"Filtreye uygun iş yok":"Henüz imzalı iş yok"}>
          {isFiltered?"Arama ölçütlerini değiştirin ya da Temizle ile tüm işleri gösterin.":"İmzalanan sözleşmeler maliyet ve kârlarıyla burada listelenir."}
        </FinEmpty>
      )}
      <Pager page={safePage} pages={pages} total={filtered.length} onChange={setPage}/>
    </section>
  );
}

const STATUS_FILTERS=[["all","Tümü","neutral"],["overdue","Gecikmiş","danger"],["pending","Bekleyen","warning"],["paid","Ödenen","success"]] as const;

export function PaytrWorkspace({rows,paytrReady=false}:{rows:PaymentRow[];paytrReady?:boolean}){
  const [query,setQuery]=useState("");const [status,setStatus]=useState("all");const [page,setPage]=useState(1);
  const filtered=useMemo(()=>rows.filter(row=>(!query||normalize(`${row.customer} ${row.contractNo}`).includes(normalize(query)))&&(status==="all"||status==="overdue"&&row.overdue||status==="pending"&&row.status!=="paid"&&!row.overdue||status==="paid"&&row.status==="paid")),[rows,query,status]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const safePage=Math.min(page,pages);const visible=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const pending=rows.filter(row=>row.status!=="paid");const overdue=pending.filter(row=>row.overdue);const paidRows=rows.filter(row=>row.status==="paid");
  const collected=paidRows.reduce((sum,row)=>sum+row.amount,0);const outstanding=pending.reduce((sum,row)=>sum+row.amount,0);
  const missingLinks=pending.filter(row=>!row.paymentUrl).length;
  const counts:Record<string,number>={all:rows.length,overdue:overdue.length,pending:pending.length-overdue.length,paid:paidRows.length};
  return (
    <>
      <section className="fin-widgets" aria-label="PAYTR tahsilat özeti">
        <FinWidget tone="success" icon="check" label="Tahsil edilen" value={money(collected)} note={`${paidRows.length} ödeme`}/>
        <FinWidget tone="warning" icon="clock" label="Bekleyen" value={money(outstanding)} note={`${pending.length} ödeme`}/>
        <FinWidget tone="danger" icon="alert" label="Gecikmiş" value={money(overdue.reduce((sum,row)=>sum+row.amount,0))} note={overdue.length?`${overdue.length} ödemenin vadesi geçti`:"Geciken ödeme yok"} emphasis={overdue.length>0}/>
        <FinWidget tone="gold" icon="link" label="Bağlantısı eksik" value={missingLinks} note="Ödeme bağlantısı bekliyor"/>
      </section>
      <section className="fin-card" aria-label="PAYTR ödeme merkezi">
        <header className="fin-card-head">
          <div>
            <h2>PAYTR ödeme merkezi</h2>
            <p>Bağlantıyı kaydedin, WhatsApp veya e-postayla müşteriye iletin.</p>
          </div>
          <span className="status-pill" data-tone={pending.length?"warning":"success"}>{pending.length} bekleyen</span>
        </header>
        <div className="fin-toolbar" role="search">
          <label className="fin-field is-grow"><span>Ödeme ara</span><span className="fin-search"><FinIcon name="search" size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Müşteri veya sözleşme no"/></span></label>
          <nav className="fin-chips" aria-label="Ödeme durumu">
            {STATUS_FILTERS.map(([value,label,tone])=>(
              <button key={value} type="button" data-tone={tone} className={status===value?"is-active":""} aria-pressed={status===value} onClick={()=>{setStatus(value);setPage(1)}}>{label}<b>{counts[value]}</b></button>
            ))}
          </nav>
        </div>
        {visible.length ? (
          <div className="fin-table-wrap">
            <table className="fin-table" data-cols="payments">
              <thead>
                <tr>
                  <th scope="col">Ödeme</th>
                  <th scope="col">Vade</th>
                  <th scope="col" className="fin-num">Tutar</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Ödeme bağlantısı</th>
                  <th scope="col"><span className="fin-sr">Paylaş</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row=>(
                  <tr key={row.id} className={row.overdue?"is-overdue":undefined}>
                    <td className="fin-col-main">
                      <span className="fin-entity">
                        <span className="fin-avatar" aria-hidden="true">{initials(row.customer)}</span>
                        <span className="fin-entity-text">
                          <small className="fin-ref">{row.contractNo} · {row.installmentNo}. ödeme</small>
                          <b>{row.customer}</b>
                        </span>
                      </span>
                    </td>
                    <td className={row.overdue?"fin-neg":undefined} data-label="Vade">{dueDate(row.dueDate)}</td>
                    <td className="fin-num" data-label="Tutar">{money(row.amount)}</td>
                    <td data-label="Durum"><span className="status-pill" data-tone={row.status==="paid"?"success":row.overdue?"danger":"warning"}>{row.status==="paid"?"Ödendi":row.overdue?"Gecikmiş":"Bekliyor"}</span></td>
                    {row.status!=="paid"?(
                      <>
                        <td className="fin-col-wide" data-label="Ödeme bağlantısı">
                          {paytrReady ? (
                            // PayTR bağlı: bağlantı PayTR'de oluşturulur, ödeme gelince tahsilat kendiliğinden işlenir
                            <div className="fin-link-form fin-paytr-actions">
                              {row.paymentUrl ? <a className="fin-link" href={row.paymentUrl} target="_blank" rel="noreferrer">{row.linkSource==="paytr"?"PayTR bağlantısı":"Ödeme bağlantısı"}<FinIcon name="chevron" size={14}/></a> : null}
                              <form action={createPaytrPaymentLink}>
                                <input type="hidden" name="installment_id" value={row.id}/>
                                <input type="hidden" name="contract_id" value={row.contractId}/>
                                <button className={row.linkSource==="paytr"?"panel-secondary":"panel-primary"}>{row.linkSource==="paytr"?"Yenile":"PayTR bağlantısı oluştur"}</button>
                              </form>
                              {row.linkSource==="paytr" ? (
                                <form action={cancelPaytrPaymentLink}>
                                  <input type="hidden" name="installment_id" value={row.id}/>
                                  <input type="hidden" name="contract_id" value={row.contractId}/>
                                  <button className="panel-secondary">İptal</button>
                                </form>
                              ) : null}
                            </div>
                          ) : (
                            <form className="fin-link-form" action={saveInstallmentPaymentLink}>
                              <input type="hidden" name="installment_id" value={row.id}/>
                              <input type="hidden" name="contract_id" value={row.contractId}/>
                              <input name="payment_url" type="url" defaultValue={row.paymentUrl||""} placeholder="PAYTR ödeme bağlantısı" aria-label={`${row.customer} için PAYTR ödeme bağlantısı`}/>
                              <button className="panel-secondary">Kaydet</button>
                            </form>
                          )}
                        </td>
                        <td className="fin-col-actions">
                          <PaymentShareActions installmentId={row.id} contractId={row.contractId} whatsappUrl={row.whatsappUrl} emailUrl={row.emailUrl} overdue={row.overdue}/>
                        </td>
                      </>
                    ):(
                      <td className="fin-paid-cell fin-col-wide"><span className="fin-paid-note"><FinIcon name="check" size={16}/>Tahsilat tamamlandı</span></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <FinEmpty icon={rows.length?"search":"wallet"} title={rows.length?"Filtreye uygun ödeme yok":"Henüz ödeme planı yok"}>
            {rows.length?"Arama ya da durum filtresini değiştirin.":"Sözleşmeye ödeme planı eklendiğinde taksitler burada görünür."}
          </FinEmpty>
        )}
        <Pager page={safePage} pages={pages} total={filtered.length} onChange={setPage}/>
      </section>
    </>
  );
}
