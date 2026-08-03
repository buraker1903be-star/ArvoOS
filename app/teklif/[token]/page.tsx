import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { respondToProposal } from "./actions";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency}).format(Number(value||0)/100);
const statusNames:Record<string,string>={accepted:"Teklif kabul edildi",rejected:"Teklif reddedildi",expired:"Teklifin süresi doldu",archived:"Teklif arşivlendi"};
const taxNames:Record<string,string>={included:"KDV Dahil",excluded:"KDV Hariç",exempt:"KDV İstisna"};

export default async function PublicProposalPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{result?:string}>}){
  const {token}=await params;const {result}=await searchParams;const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_public_crm_proposal",{public_token:token});const row=Array.isArray(data)?data[0]:data;if(error||!row)notFound();
  await supabase.rpc("mark_crm_proposal_viewed",{public_token:token});
  const locked=["accepted","rejected","expired","archived"].includes(row.status);
  const validUntil=row.valid_until?new Date(row.valid_until+"T00:00:00").toLocaleDateString("tr-TR"):"Belirtilmedi";
  const brandColor=/^#[0-9a-fA-F]{6}$/.test(row.organization_primary_color||"")?row.organization_primary_color:"#183f31";
  const contact=[row.organization_contact_phone,row.organization_contact_email,row.organization_website_url].filter(Boolean).join(" · ");

  return <main className="proposal-page" style={{"--brand":brandColor} as React.CSSProperties}>
    <style>{`
      *{box-sizing:border-box}body{margin:0;background:#edf0ed;color:#17231d;font-family:Arial,Helvetica,sans-serif}.proposal-page{min-height:100vh;padding:28px 16px 48px}.proposal-toolbar{width:210mm;max-width:100%;margin:0 auto 12px;display:flex;justify-content:flex-end}.proposal-sheet{width:210mm;min-height:297mm;max-width:100%;margin:0 auto;background:#fff;border:1px solid #d9dfda;box-shadow:0 24px 60px rgba(23,35,29,.13);padding:17mm 18mm 15mm;display:flex;flex-direction:column}.proposal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid var(--brand);padding-bottom:14px}.brand-logo{max-width:210px;max-height:68px;object-fit:contain;object-position:left center}.brand-fallback{font:700 23px Georgia,serif;color:var(--brand)}.proposal-meta{text-align:right}.proposal-meta small,.section-title,.field small{display:block;font-size:9px;letter-spacing:.15em;color:#7a857e;font-weight:800}.proposal-meta strong{display:block;font-size:18px;margin:5px 0}.proposal-meta span{font-size:11px;color:#59665e}.proposal-title{padding:20px 0 14px}.proposal-title h1{font:700 27px Georgia,serif;margin:0 0 6px;color:var(--brand)}.proposal-title p{margin:0;color:#5d6962;font-size:12px}.notice{padding:10px 12px;border-radius:8px;background:#edf6ef;border:1px solid #cfe2d4;margin-bottom:12px;font-size:12px}.section{border-top:1px solid #dfe4e0;padding:12px 0}.section-title{margin:0 0 9px;color:var(--brand)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px}.field small{margin-bottom:4px}.field strong,.field span{font-size:12px;line-height:1.45}.scope{white-space:pre-wrap;font-size:11px;line-height:1.58;color:#34443b;margin:0}.price-table{width:100%;border-collapse:collapse;border:1px solid #dfe4e0}.price-table td{padding:9px 11px;border-bottom:1px solid #e8ece9;font-size:11px}.price-table td:last-child{text-align:right;font-weight:700}.price-table tr:last-child td{font-size:15px;color:var(--brand);font-weight:800;background:#f6f8f6}.terms{font-size:10.5px;line-height:1.52;color:#55625a;margin:0}.proposal-footer{margin-top:auto;padding-top:14px;border-top:1px solid #dfe4e0;display:flex;justify-content:space-between;gap:20px;font-size:9.5px;color:#78827c}.proposal-footer span:last-child{text-align:right}.decision-area{width:210mm;max-width:100%;margin:16px auto 0}.decision-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.decision-form button{padding:15px;border:0;border-radius:10px;font-weight:800;font-size:14px;color:#fff;cursor:pointer}.accept{background:#16a34a}.reject{background:#dc2626}.decision-status{padding:14px;border-radius:10px;text-align:center;background:#fff;border:1px solid #d9dfda;font-weight:700}.pdf-label{font-weight:800}
      @media(max-width:680px){.proposal-sheet{width:100%;min-height:auto;padding:26px 20px}.proposal-head{flex-direction:column}.proposal-meta{text-align:left}.grid,.decision-form{grid-template-columns:1fr}.proposal-title h1{font-size:23px}}
      @page{size:A4;margin:0}
      @media print{body{background:#fff}.print-hide{display:none!important}.proposal-page{padding:0}.proposal-sheet{width:210mm;height:297mm;min-height:297mm;max-width:none;margin:0;border:0;box-shadow:none;padding:14mm 15mm 12mm;overflow:hidden}.proposal-title{padding:14px 0 10px}.section{padding:9px 0}.proposal-footer{padding-top:9px}}
    `}</style>

    <div className="proposal-toolbar print-hide"><PrintDocumentButton /></div>
    <article className="proposal-sheet">
      <header className="proposal-head">
        <div>{row.organization_logo_url?<img className="brand-logo" src={row.organization_logo_url} alt="Kurum logosu"/>:<div className="brand-fallback">{row.organization_name}</div>}</div>
        <div className="proposal-meta"><small>TEKLİF NUMARASI</small><strong>{row.proposal_no}</strong><span>Geçerlilik: {validUntil}</span></div>
      </header>

      <section className="proposal-title"><h1>Hizmet Teklifi</h1><p>{row.customer_name} için özel olarak hazırlanmıştır.</p></section>
      {result?<div className="notice print-hide">İşleminiz kaydedildi: <b>{result}</b></div>:null}

      <section className="section"><h2 className="section-title">MÜŞTERİ VE TEKLİF BİLGİLERİ</h2><div className="grid"><div className="field"><small>MÜŞTERİ</small><strong>{row.customer_name}</strong></div><div className="field"><small>TEKLİF BAŞLIĞI</small><strong>{row.title}</strong></div>{row.contact_phone?<div className="field"><small>TELEFON</small><span>{row.contact_phone}</span></div>:null}{row.contact_email?<div className="field"><small>E-POSTA</small><span>{row.contact_email}</span></div>:null}</div></section>
      <section className="section"><h2 className="section-title">HİZMET KAPSAMI</h2><p className="scope">{row.scope||"Teklif kapsamında sunulacak hizmetler, taraflarca mutabık kalınan çalışma içeriğine göre yürütülecektir."}</p></section>
      <section className="section"><h2 className="section-title">ÜCRETLENDİRME</h2><table className="price-table"><tbody><tr><td>Hizmet Bedeli</td><td>{money(row.net_amount||row.amount,row.currency)}</td></tr><tr><td>{taxNames[row.tax_status]||"KDV"}</td><td>{money(row.tax_amount||0,row.currency)}</td></tr><tr><td>Genel Toplam</td><td>{money(row.gross_amount||row.amount,row.currency)}</td></tr></tbody></table></section>
      <section className="section"><h2 className="section-title">ÖDEME PLANI</h2><p className="terms">{row.payment_plan||"Ödeme planı teklif onayı sonrasında taraflarca kesinleştirilecektir."}</p></section>
      <section className="section"><h2 className="section-title">TEKLİF KOŞULLARI</h2><p className="terms">Bu teklif belirtilen geçerlilik tarihine kadar geçerlidir. Çalışma, teklif onayı ve ödeme planının kesinleşmesi sonrasında başlatılır. Kapsam dışı ek talepler ayrıca değerlendirilir ve fiyatlandırılır.</p></section>
      <footer className="proposal-footer"><span>{row.organization_document_footer||row.organization_name}</span><span>{contact||"Bu belge elektronik ortamda oluşturulmuştur."}</span></footer>
    </article>

    <section className="decision-area print-hide">{!locked?<form className="decision-form" action={respondToProposal.bind(null,token)}><button className="accept" name="decision" value="accept">Teklifi Kabul Ediyorum</button><button className="reject" name="decision" value="reject">Teklifi Reddediyorum</button></form>:<div className="decision-status">{statusNames[row.status]||`Teklif durumu: ${row.status}`}</div>}</section>
  </main>;
}
