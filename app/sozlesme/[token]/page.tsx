import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { getContractTemplate } from "@/lib/contract-templates";
import { normalizePaymentSchedule } from "@/lib/payment-schedule";
import { signContract } from "./actions";

const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value || 0) / 100);
const date = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("tr-TR") : "—";

export default async function PublicContractPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ signed?: string; workflow?: string; created?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_contract", { public_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) notFound();

  await supabase.rpc("mark_crm_contract_viewed", { public_token: token });
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "arvo-os.com";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const verificationUrl = `${protocol}://${host}/sozlesme/${token}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(verificationUrl)}`;
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(row.organization_primary_color || "") ? row.organization_primary_color : "#173f35";
  const signed = row.status === "signed";
  const template = getContractTemplate(row.organization_slug);
  const schedule = normalizePaymentSchedule(row.payment_schedule);
  const paymentRows = schedule.length ? schedule : [{ sequence: 1, label: row.payment_plan || "Ödeme", due_date: row.due_date || "", amount: Number(row.amount || 0), percentage: 100 }];
  const contact = [row.organization_contact_phone, row.organization_contact_email, row.organization_website_url].filter(Boolean).join(" · ");

  return <main className="contract-page" style={{ "--brand": brandColor } as CSSProperties}>
    <style>{`
      *{box-sizing:border-box}body{margin:0;background:#edf1ef;color:#263632;font-family:Arial,Helvetica,sans-serif}.contract-page{min-height:100vh;padding:24px 12px 48px}.toolbar{width:210mm;max-width:100%;margin:0 auto 12px;display:flex;justify-content:flex-end}.document{width:210mm;max-width:100%;margin:auto;background:#fff;box-shadow:0 18px 50px rgba(25,48,39,.12);padding:13mm 14mm 0}.header{position:relative;width:100%;min-height:25mm;padding:0 0 7mm;border-bottom:1px solid #dce4e0}.brand-block{position:absolute;left:0;top:0;width:74mm;height:22mm;overflow:hidden;text-align:left}.logo{display:block;width:74mm;max-width:none;height:auto;max-height:22mm;margin:0;transform:translateX(-7mm);object-fit:contain;object-position:left top}.logo-fallback{margin:0;font-size:25px;font-weight:800;color:var(--brand);text-align:left}.meta{position:absolute;right:0;top:0;width:62mm;margin:0;text-align:right;font-size:9px;color:#68756f;line-height:1.65}.meta strong,.meta span{display:block;width:100%;text-align:right}.meta strong{font-size:16px;color:var(--brand)}.title{padding:7mm 0 5mm}.title h1{margin:0;color:var(--brand);font-size:27px}.title p{margin:2mm 0 0;color:#697670;font-size:10px}.notice{padding:3mm;margin-bottom:4mm;text-align:center;border-radius:8px;background:#eef7f1;color:#20613e;font-size:9.5px;font-weight:700}.section{margin-bottom:5mm}.section-title{margin:0 0 2.5mm;font-size:10px;letter-spacing:.12em;color:var(--brand)}.card{border:1px solid #dde5e1;border-radius:10px;background:#fbfcfb;padding:4mm}.party-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.party h3{font-size:10px;margin:0 0 2mm;color:var(--brand)}.party p{font-size:9px;line-height:1.55;margin:0;color:#5f6c67}.summary-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4mm}.summary-item small{display:block;font-size:8px;color:#89948f;margin-bottom:1mm}.summary-item strong{font-size:10px;color:#263833}.scope{white-space:pre-wrap;font-size:9.5px;line-height:1.6;color:#53605b}.payment-table{width:100%;border-collapse:collapse}.payment-table th{background:#f2f6f4;color:#60706a;text-align:left;font-size:8.5px;padding:2.4mm;border-bottom:1px solid #dde5e1}.payment-table td{font-size:9.3px;padding:2.5mm;border-bottom:1px solid #e7ece9}.payment-table th:last-child,.payment-table td:last-child{text-align:right}.payment-table tr:last-child td{border-bottom:0}.clauses{counter-reset:clause}.clause{counter-increment:clause;padding:4mm 0;border-bottom:1px solid #e7ece9;break-inside:avoid}.clause:last-child{border-bottom:0}.clause h2{font-size:11px;color:var(--brand);margin:0 0 2mm}.clause h2:before{content:counter(clause) ". ";}.clause p{font-size:9.2px;line-height:1.62;color:#52605a;margin:0 0 2mm}.clause p:last-child{margin-bottom:0}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-items:stretch}.provider-sign,.customer-sign{min-height:44mm;text-align:center}.stamp{width:100%;height:27mm;object-fit:contain}.stamp-placeholder{height:25mm;border:1px dashed #ccd5d0;border-radius:7px;display:grid;place-items:center;font-size:8px;color:#9ba59f}.sign-title{font-size:9px;font-weight:800;color:var(--brand);margin-top:1mm}.customer-sign p{font-size:9px;color:#65716d;line-height:1.5}.verify-row{display:grid;grid-template-columns:26mm 1fr;gap:4mm;align-items:center;text-align:left}.verify-row img{width:24mm;height:24mm}.verify-row strong{font-size:9px;color:var(--brand)}.verify-row small{display:block;font-size:7.5px;word-break:break-all;color:#77827d;margin-top:1mm}.sign-form{margin-top:5mm;border:1px solid #dbe3df;border-radius:10px;padding:4mm;background:#fbfcfb}.sign-form label{display:block;font-size:9px;font-weight:700}.sign-form input[type=text]{display:block;width:100%;margin-top:2mm;padding:3mm;border:1px solid #ccd6d1;border-radius:7px}.accept-line{display:flex!important;gap:2mm;align-items:flex-start;margin:4mm 0;font-weight:400!important;line-height:1.45}.sign-form button{width:100%;height:42px;border:0;border-radius:8px;background:var(--brand);color:#fff;font-weight:800}.signed-box{margin-top:5mm;padding:4mm;border-radius:9px;background:#eef7f1;color:#275d43;font-size:9.5px}.legal-note{font-size:7.8px;line-height:1.45;color:#7b8681;margin-top:4mm}.footer{margin-top:8mm;margin-left:-14mm;margin-right:-14mm;padding:5mm 14mm;background:#f4f7f5;border-top:1px solid #dde5e1;display:grid;grid-template-columns:1.2fr 1.4fr 1fr;gap:7mm;color:#697570;font-size:8px;line-height:1.45}.footer strong{display:block;color:var(--brand);margin-bottom:1mm}
      @media(max-width:760px){.document{width:100%;padding:20px}.header{min-height:29mm}.brand-block{width:58%}.logo{width:68mm;transform:translateX(-6mm)}.meta{width:42%}.party-grid,.summary-grid,.signature-grid,.footer{grid-template-columns:1fr}.footer{margin-left:-20px;margin-right:-20px}}
      @page{size:A4;margin:12mm}@media print{body{background:#fff}.contract-page{padding:0}.print-hide{display:none!important}.document{width:auto;max-width:none;box-shadow:none;margin:0;padding:0}.header{break-inside:avoid}.card,.clause,.signature-grid{break-inside:avoid}.footer{margin-left:0;margin-right:0}}
    `}</style>

    <div className="toolbar print-hide"><PrintDocumentButton documentType="contract" documentId={row.id} documentNumber={row.contract_no} /></div>
    <article className="document">
      <header className="header"><div className="brand-block">{row.organization_logo_url ? <img className="logo" src={row.organization_logo_url} alt={`${row.organization_name} logosu`} /> : <div className="logo-fallback">{row.organization_name}</div>}</div><div className="meta"><strong>{row.contract_no}</strong><span>Düzenleme: {date(row.created_at)}</span><span>Şablon: {template.name}</span><span>Sürüm: {template.version}</span></div></header>
      <section className="title"><h1>{template.name}</h1><p>{row.customer_name} ile {row.organization_name} arasında düzenlenmiştir.</p></section>
      {query.created ? <div className="notice">Teklif kabul edildi. Sözleşme imzaya hazırlandı.</div> : null}
      {query.signed ? <div className="notice">Sözleşme imzalandı ve iş akışı oluşturuldu.</div> : null}

      <section className="section"><h2 className="section-title">TARAFLAR</h2><div className="party-grid"><div className="card party"><h3>Hizmet Sağlayıcı</h3><p><strong>{row.organization_name}</strong><br/>{contact || "Kurum iletişim bilgileri"}</p></div><div className="card party"><h3>Müşteri</h3><p><strong>{row.customer_name}</strong><br/>{row.contact_phone || "—"}<br/>{row.contact_email || "—"}</p></div></div></section>

      <section className="section"><h2 className="section-title">SÖZLEŞME ÖZETİ</h2><div className="card summary-grid"><div className="summary-item"><small>Konu</small><strong>{row.title}</strong></div><div className="summary-item"><small>Toplam Bedel</small><strong>{money(row.amount, row.currency)}</strong></div><div className="summary-item"><small>Süre</small><strong>{date(row.start_date)} – {date(row.due_date)}</strong></div></div></section>

      <section className="section"><h2 className="section-title">HİZMET KAPSAMI</h2><div className="card scope">{row.scope || "Kapsam belirtilmedi."}</div></section>

      <section className="section"><h2 className="section-title">ÖDEME PLANI</h2><div className="card"><table className="payment-table"><thead><tr><th>No</th><th>Açıklama</th><th>Vade</th><th>Tutar</th></tr></thead><tbody>{paymentRows.map((item) => <tr key={`${item.sequence}-${item.due_date}`}><td>{item.sequence}</td><td>{item.label}</td><td>{date(item.due_date)}</td><td>{money(item.amount, row.currency)}</td></tr>)}</tbody></table></div></section>

      <section className="section"><h2 className="section-title">SÖZLEŞME HÜKÜMLERİ</h2><div className="card clauses">{template.clauses.map((clause) => <section className="clause" key={clause.title}><h2>{clause.title}</h2>{clause.paragraphs.map((paragraph, index) => <p key={`${clause.title}-${index}`}>{paragraph}</p>)}</section>)}</div></section>

      <section className="section"><h2 className="section-title">ONAY VE DOĞRULAMA</h2><div className="signature-grid"><div className="card provider-sign"><div className="section-title">HİZMET SAĞLAYICI KAŞE VE İMZASI</div>{row.organization_signature_stamp_url ? <img className="stamp" src={row.organization_signature_stamp_url} alt="Firma kaşe ve imzası" /> : <div className="stamp-placeholder">KAŞE / İMZA</div>}<div className="sign-title">{row.organization_name}</div></div><div className="card customer-sign"><div className="section-title">MÜŞTERİ ONAYI</div><div className="verify-row"><img src={qrUrl} alt="Sözleşme doğrulama QR kodu"/><div><strong>Sözleşmeyi doğrula</strong><small>{verificationUrl}</small></div></div>{signed ? <div className="signed-box"><strong>Elektronik olarak onaylandı</strong><br/>{row.signed_name}<br/>{row.signed_at ? new Date(row.signed_at).toLocaleString("tr-TR") : ""}</div> : <p>Elektronik onay, aşağıdaki form tamamlandığında işlem kaydıyla birlikte saklanır.</p>}</div></div></section>

      {!signed ? <form className="sign-form print-hide" action={signContract.bind(null, token)}><label>Ad Soyad<input type="text" name="signer_name" required minLength={2}/></label><label className="accept-line"><input type="checkbox" name="accepted" required/><span>Sözleşmenin tamamını, hizmet kapsamını ve ödeme planını okudum; kendi irademle kabul ediyorum.</span></label><button>Sözleşmeyi Elektronik Olarak Onayla</button></form> : null}
      <p className="legal-note">Bu elektronik onay işlemi, 5070 sayılı Elektronik İmza Kanunu kapsamında güvenli elektronik imza olduğu iddiasını taşımaz. İşlem, taraf iradesini gösteren elektronik kayıt olarak saklanır. Emredici mevzuat ve tüketici hakları saklıdır.</p>
      <footer className="footer"><div><strong>{row.organization_name}</strong>{row.organization_document_footer || "Profesyonel hizmetler"}</div><div><strong>İletişim</strong>{contact || "Kurum iletişim bilgileri"}</div><div><strong>Belge Bilgisi</strong>{row.contract_no} · {template.version}</div></footer>
    </article>
  </main>;
}
