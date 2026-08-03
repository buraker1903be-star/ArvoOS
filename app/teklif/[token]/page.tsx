import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { normalizePaymentSchedule } from "@/lib/payment-schedule";
import { respondToProposal } from "./actions";

const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value || 0) / 100);
const date = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("tr-TR") : "—";
const statusNames: Record<string, string> = { accepted: "Teklif kabul edildi", rejected: "Teklif reddedildi", expired: "Teklifin süresi doldu", archived: "Teklif arşivlendi" };
const taxNames: Record<string, string> = { included: "KDV Dahil", excluded: "KDV", exempt: "KDV İstisna" };

export default async function PublicProposalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ result?: string }> }) {
  const { token } = await params;
  const { result } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_proposal", { public_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) notFound();
  await supabase.rpc("mark_crm_proposal_viewed", { public_token: token });

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "arvo-os.com";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const verificationUrl = `${protocol}://${host}/teklif/${token}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(verificationUrl)}`;
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(row.organization_primary_color || "") ? row.organization_primary_color : "#173f35";
  const locked = ["accepted", "rejected", "expired", "archived"].includes(row.status);
  const total = Number(row.gross_amount || row.amount || 0);
  const schedule = normalizePaymentSchedule(row.payment_schedule);
  const paymentRows = schedule.length ? schedule : [{ sequence: 1, label: row.payment_plan || "Peşin ödeme", due_date: row.valid_until || "", amount: total, percentage: 100 }];
  const scopeItems = String(row.scope || row.title || "Hizmet kapsamı").split(/\n|•/).map((item) => item.trim()).filter(Boolean);
  const contact = [row.organization_contact_phone, row.organization_contact_email, row.organization_website_url].filter(Boolean).join(" · ");

  return <main className="proposal-page" style={{ "--brand": brandColor } as CSSProperties}>
    <style>{`
      *{box-sizing:border-box}body{margin:0;background:#edf1ef;color:#24342f;font-family:Arial,Helvetica,sans-serif}.proposal-page{min-height:100vh;padding:24px 12px 44px}.toolbar{width:210mm;max-width:100%;margin:0 auto 12px;display:flex;justify-content:flex-end}.sheet{width:210mm;min-height:297mm;max-width:100%;margin:auto;background:#fff;box-shadow:0 18px 50px rgba(25,48,39,.12);display:flex;flex-direction:column;padding:13mm 14mm 0}.header{display:flex;justify-content:space-between;gap:12mm;align-items:flex-start;padding-bottom:7mm;border-bottom:1px solid #dce4e0}.logo{max-width:62mm;max-height:23mm;object-fit:contain;object-position:left center}.logo-fallback{font-size:25px;font-weight:800;color:var(--brand)}.meta{text-align:right;font-size:10px;color:#62706b;line-height:1.7}.meta strong{display:block;font-size:16px;color:var(--brand);margin-bottom:2px}.title-row{display:flex;justify-content:space-between;gap:8mm;align-items:flex-end;padding:8mm 0 6mm}.title-row h1{margin:0;color:var(--brand);font-size:28px;letter-spacing:-.03em}.title-row p{margin:2mm 0 0;color:#6c7874;font-size:11px}.badge{padding:2.5mm 4mm;border-radius:999px;background:#f1f6f3;color:var(--brand);font-size:9px;font-weight:800;white-space:nowrap}.section{margin-bottom:5mm}.section-title{margin:0 0 2.5mm;font-size:10px;letter-spacing:.12em;color:var(--brand)}.card{border:1px solid #dde5e1;border-radius:10px;background:#fbfcfb;padding:4mm}.customer-grid{display:grid;grid-template-columns:1.4fr 1fr 1.2fr;gap:4mm}.field small{display:block;color:#8a9591;font-size:8.5px;margin-bottom:1mm}.field strong,.field span{font-size:10.5px;color:#263833;word-break:break-word}.scope-table,.price-table,.payment-table{width:100%;border-collapse:collapse}.scope-table th,.price-table th,.payment-table th{background:#f2f6f4;color:#60706a;text-align:left;font-size:8.5px;font-weight:700;padding:2.4mm;border-bottom:1px solid #dde5e1}.scope-table td,.price-table td,.payment-table td{font-size:9.7px;padding:2.7mm;border-bottom:1px solid #e7ece9;vertical-align:top}.scope-table td:last-child,.price-table td:last-child,.payment-table td:last-child{text-align:right}.scope-table tr:last-child td,.price-table tr:last-child td,.payment-table tr:last-child td{border-bottom:0}.summary-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:5mm}.total-row td{background:var(--brand);color:#fff;font-weight:800}.plan-name{font-size:9px;color:#6d7974;margin:0 0 2mm}.terms-signature{display:grid;grid-template-columns:1.15fr .85fr;gap:5mm;align-items:stretch}.terms ul{margin:0;padding-left:5mm;color:#65716d;font-size:9px;line-height:1.55}.signature-card{display:grid;grid-template-columns:1fr 25mm;gap:4mm;align-items:center;text-align:center}.stamp{width:100%;height:25mm;object-fit:contain}.stamp-placeholder{height:22mm;border:1px dashed #cdd6d1;border-radius:7px;display:grid;place-items:center;color:#9aa49f;font-size:8px}.company-title{font-size:9px;font-weight:800;color:var(--brand);margin-top:1mm}.verify{border-left:1px solid #e0e6e3;padding-left:4mm}.verify img{width:22mm;height:22mm}.verify strong{display:block;font-size:7.5px;color:var(--brand);margin-top:1mm}.actions{display:grid;grid-template-columns:1fr 1fr auto;gap:3mm;margin-top:4mm}.actions button{height:40px;border:0;border-radius:8px;font-size:10px;font-weight:800;color:#fff;padding:0 6mm}.accept{background:#16a34a}.reject{background:#dc2626}.pdf-wrap button{background:#fff!important;color:#31423d!important;border:1px solid #cfd8d3!important}.notice,.decision{padding:3mm;margin-bottom:4mm;text-align:center;border-radius:8px;background:#eef7f1;color:#20613e;font-size:9.5px;font-weight:700}.footer{margin-top:auto;margin-left:-14mm;margin-right:-14mm;padding:5mm 14mm;background:#f4f7f5;border-top:1px solid #dde5e1;display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:7mm;color:#697570;font-size:8px;line-height:1.45}.footer strong{display:block;color:var(--brand);margin-bottom:1mm}.confidential{text-align:center;font-size:7.5px;color:#8a9490;padding:3mm 0}
      @media(max-width:760px){.sheet{width:100%;min-height:auto;padding:20px}.customer-grid,.summary-grid,.terms-signature,.footer{grid-template-columns:1fr}.header,.title-row{align-items:flex-start}.actions{grid-template-columns:1fr}.footer{margin-left:-20px;margin-right:-20px}.verify{border-left:0;border-top:1px solid #e0e6e3;padding:4mm 0 0}.signature-card{grid-template-columns:1fr}}
      @page{size:A4;margin:0}@media print{body{background:#fff}.proposal-page{padding:0}.print-hide{display:none!important}.sheet{width:210mm;height:297mm;min-height:297mm;max-width:none;box-shadow:none;margin:0}.footer{break-inside:avoid}}
    `}</style>

    <div className="toolbar print-hide"><PrintDocumentButton /></div>
    <article className="sheet">
      <header className="header">
        <div>{row.organization_logo_url ? <img className="logo" src={row.organization_logo_url} alt={`${row.organization_name} logosu`} /> : <div className="logo-fallback">{row.organization_name}</div>}</div>
        <div className="meta"><strong>{row.proposal_no}</strong><span>Teklif tarihi: {date(row.created_at)}</span><br /><span>Geçerlilik: {date(row.valid_until)}</span></div>
      </header>

      <section className="title-row"><div><h1>Hizmet Teklifi</h1><p>{row.customer_name} için hazırlanmıştır.</p></div><span className="badge">{row.payment_plan || "Ödeme planı"}</span></section>
      {result ? <div className="notice print-hide">İşleminiz kaydedildi: {result}</div> : null}

      <section className="section"><h2 className="section-title">MÜŞTERİ BİLGİLERİ</h2><div className="card customer-grid"><div className="field"><small>Ad Soyad / Unvan</small><strong>{row.customer_name}</strong></div><div className="field"><small>Telefon</small><span>{row.contact_phone || "—"}</span></div><div className="field"><small>E-posta</small><span>{row.contact_email || "—"}</span></div></div></section>

      <section className="section"><h2 className="section-title">HİZMET KAPSAMI</h2><div className="card"><table className="scope-table"><thead><tr><th>Açıklama</th><th style={{width:"18mm"}}>Adet</th><th style={{width:"28mm"}}>Tutar</th></tr></thead><tbody>{scopeItems.map((item, index) => <tr key={`${item}-${index}`}><td>{item}</td><td>1</td><td>{index === 0 ? money(row.net_amount || row.amount, row.currency) : "—"}</td></tr>)}</tbody></table></div></section>

      <section className="section summary-grid">
        <div><h2 className="section-title">ÜCRETLENDİRME</h2><div className="card"><table className="price-table"><tbody><tr><td>Hizmet bedeli</td><td>{money(row.net_amount || row.amount, row.currency)}</td></tr><tr><td>{taxNames[row.tax_status] || "KDV"}</td><td>{money(row.tax_amount || 0, row.currency)}</td></tr><tr className="total-row"><td>Genel toplam</td><td>{money(total, row.currency)}</td></tr></tbody></table></div></div>
        <div><h2 className="section-title">ÖDEME PLANI</h2><div className="card"><p className="plan-name">{row.payment_plan || "Belirtilmedi"}</p><table className="payment-table"><thead><tr><th>No</th><th>Ödeme</th><th>Vade</th><th>Tutar</th></tr></thead><tbody>{paymentRows.map((item) => <tr key={`${item.sequence}-${item.due_date}`}><td>{item.sequence}</td><td>{item.label}</td><td>{date(item.due_date)}</td><td>{money(item.amount, row.currency)}</td></tr>)}</tbody></table></div></div>
      </section>

      <section className="section terms-signature"><div className="card terms"><h2 className="section-title">TİCARİ KOŞULLAR</h2><ul><li>Teklif {date(row.valid_until)} tarihine kadar geçerlidir.</li><li>Çalışma, teklif onayı ve ödeme planının kesinleşmesiyle başlar.</li><li>Kapsam dışı talepler ayrıca değerlendirilir.</li><li>Ödeme planı teklif ve sözleşmede aynı şekilde uygulanır.</li></ul></div><div className="card signature-card"><div><h2 className="section-title">FİRMA KAŞE VE İMZASI</h2>{row.organization_signature_stamp_url ? <img className="stamp" src={row.organization_signature_stamp_url} alt="Firma kaşe ve imzası" /> : <div className="stamp-placeholder">KAŞE / İMZA</div>}<div className="company-title">{row.organization_name}</div></div><div className="verify"><img src={qrUrl} alt="Teklif doğrulama QR kodu" /><strong>TEKLİFİ DOĞRULA</strong></div></div></section>

      {!locked ? <form className="actions print-hide" action={respondToProposal.bind(null, token)}><button className="accept" name="decision" value="accept">TEKLİFİ KABUL EDİYORUM</button><button className="reject" name="decision" value="reject">TEKLİFİ REDDEDİYORUM</button><div className="pdf-wrap"><PrintDocumentButton /></div></form> : <div className="decision print-hide">{statusNames[row.status] || `Teklif durumu: ${row.status}`}</div>}
      <div className="confidential">Bu teklif yalnızca belirtilen alıcı için hazırlanmıştır.</div>
      <footer className="footer"><div><strong>{row.organization_name}</strong>{row.organization_document_footer || "Profesyonel hizmetler"}</div><div><strong>İletişim</strong>{contact || "Kurum iletişim bilgileri"}</div><div><strong>Doğrulama</strong>Bu belge elektronik ortamda oluşturulmuş ve QR kod ile doğrulanabilir.</div></footer>
    </article>
  </main>;
}
