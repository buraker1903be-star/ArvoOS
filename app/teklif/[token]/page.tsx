import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { respondToProposal } from "./actions";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value || 0) / 100);

const statusNames: Record<string, string> = {
  accepted: "Teklif kabul edildi",
  rejected: "Teklif reddedildi",
  expired: "Teklifin süresi doldu",
  archived: "Teklif arşivlendi",
};

const taxNames: Record<string, string> = {
  included: "KDV Dahil",
  excluded: "KDV Hariç",
  exempt: "KDV İstisna",
};

export default async function PublicProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { token } = await params;
  const { result } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_proposal", { public_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) notFound();

  await supabase.rpc("mark_crm_proposal_viewed", { public_token: token });
  const locked = ["accepted", "rejected", "expired", "archived"].includes(row.status);
  const validUntil = row.valid_until
    ? new Date(row.valid_until + "T00:00:00").toLocaleDateString("tr-TR")
    : "Belirtilmedi";

  return (
    <main className="proposal-page">
      <style>{`
        *{box-sizing:border-box}
        body{margin:0;background:#eef1ed;color:#17231d;font-family:Arial,Helvetica,sans-serif}
        .proposal-page{min-height:100vh;padding:28px 16px 48px}
        .proposal-toolbar{max-width:794px;margin:0 auto 12px;display:flex;justify-content:flex-end}
        .proposal-sheet{width:100%;max-width:794px;min-height:1123px;margin:0 auto;background:#fff;border:1px solid #d9dfda;box-shadow:0 24px 60px rgba(23,35,29,.12);padding:42px 48px 34px;display:flex;flex-direction:column}
        .proposal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #183f31;padding-bottom:18px}
        .brand{display:flex;align-items:center;gap:12px}.brand-mark{width:46px;height:46px;border:2px solid #183f31;border-radius:50%;display:grid;place-items:center;font:800 18px Georgia,serif;color:#183f31}.brand-name{font:700 21px Georgia,serif;letter-spacing:.02em}.brand-sub{font-size:10px;letter-spacing:.18em;color:#647168;margin-top:4px}
        .proposal-meta{text-align:right}.proposal-meta small{display:block;font-size:10px;letter-spacing:.14em;color:#7a857e}.proposal-meta strong{display:block;font-size:18px;margin:5px 0}.proposal-meta span{font-size:12px;color:#59665e}
        .proposal-title{padding:22px 0 16px}.proposal-title h1{font:700 28px Georgia,serif;margin:0 0 8px}.proposal-title p{margin:0;color:#5d6962;font-size:13px}
        .notice{padding:10px 12px;border-radius:8px;background:#edf6ef;border:1px solid #cfe2d4;margin-bottom:14px;font-size:12px}
        .section{border-top:1px solid #dfe4e0;padding:14px 0}.section-title{font-size:10px;letter-spacing:.16em;color:#526158;font-weight:800;margin:0 0 10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px}.field small{display:block;font-size:9px;letter-spacing:.11em;color:#879088;margin-bottom:4px}.field strong,.field span{font-size:12px;line-height:1.45}.scope{white-space:pre-wrap;font-size:12px;line-height:1.6;color:#34443b;margin:0}
        .price-box{display:grid;grid-template-columns:1fr auto;gap:8px 18px;align-items:center;background:#f5f7f5;border:1px solid #dfe4e0;border-radius:10px;padding:13px 15px}.price-box span{font-size:11px;color:#66716a}.price-box strong{font-size:14px}.price-box .total{font-size:18px;color:#183f31}
        .terms{font-size:11px;line-height:1.55;color:#55625a;margin:0}.proposal-footer{margin-top:auto;padding-top:16px;border-top:1px solid #dfe4e0;display:flex;justify-content:space-between;gap:20px;font-size:10px;color:#78827c}.decision-area{max-width:794px;margin:16px auto 0}.decision-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.decision-form button{padding:15px;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer}.accept{border:0;background:#183f31;color:#fff}.reject{border:1px solid #b8c0ba;background:#fff;color:#29362f}.decision-status{padding:14px;border-radius:10px;text-align:center;background:#fff;border:1px solid #d9dfda;font-weight:700}
        @media(max-width:680px){.proposal-sheet{min-height:auto;padding:28px 22px}.proposal-head{flex-direction:column}.proposal-meta{text-align:left}.grid,.decision-form{grid-template-columns:1fr}.proposal-title h1{font-size:24px}}
        @page{size:A4;margin:0}
        @media print{body{background:#fff}.print-hide{display:none!important}.proposal-page{padding:0}.proposal-sheet{width:210mm;height:297mm;min-height:297mm;max-width:none;margin:0;border:0;box-shadow:none;padding:14mm 15mm 12mm;overflow:hidden}.proposal-title{padding:14px 0 10px}.section{padding:10px 0}.proposal-footer{padding-top:10px}}
      `}</style>

      <div className="proposal-toolbar print-hide"><PrintDocumentButton /></div>

      <article className="proposal-sheet">
        <header className="proposal-head">
          <div className="brand">
            <div className="brand-mark">AM</div>
            <div>
              <div className="brand-name">AkademikMerkez</div>
              <div className="brand-sub">AKADEMİK DANIŞMANLIK</div>
            </div>
          </div>
          <div className="proposal-meta">
            <small>TEKLİF NUMARASI</small>
            <strong>{row.proposal_no}</strong>
            <span>Geçerlilik: {validUntil}</span>
          </div>
        </header>

        <section className="proposal-title">
          <h1>Hizmet Teklifi</h1>
          <p>{row.customer_name} için özel olarak hazırlanmıştır.</p>
        </section>

        {result ? <div className="notice print-hide">İşleminiz kaydedildi: <b>{result}</b></div> : null}

        <section className="section">
          <h2 className="section-title">MÜŞTERİ VE TEKLİF BİLGİLERİ</h2>
          <div className="grid">
            <div className="field"><small>MÜŞTERİ</small><strong>{row.customer_name}</strong></div>
            <div className="field"><small>TEKLİF BAŞLIĞI</small><strong>{row.title}</strong></div>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">HİZMET KAPSAMI</h2>
          <p className="scope">{row.scope || "Teklif kapsamında sunulacak hizmetler müşteri ile mutabık kalınan çalışma içeriğine göre yürütülecektir."}</p>
        </section>

        <section className="section">
          <h2 className="section-title">ÜCRETLENDİRME</h2>
          <div className="price-box">
            <span>Teklif Bedeli</span><strong>{money(row.net_amount || row.amount, row.currency)}</strong>
            <span>KDV Durumu</span><strong>{taxNames[row.tax_status] || "Belirtilmedi"}</strong>
            {Number(row.tax_amount || 0) > 0 ? <><span>KDV</span><strong>{money(row.tax_amount, row.currency)}</strong></> : null}
            <span>Genel Toplam</span><strong className="total">{money(row.gross_amount || row.amount, row.currency)}</strong>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">ÖDEME PLANI</h2>
          <p className="terms">{row.payment_plan || "Ödeme planı teklif onayı sonrasında taraflarca kesinleştirilecektir."}</p>
        </section>

        <section className="section">
          <h2 className="section-title">TEKLİF KOŞULLARI</h2>
          <p className="terms">Bu teklif belirtilen geçerlilik tarihine kadar geçerlidir. Çalışma, teklif onayı ve ödeme planının kesinleşmesi sonrasında başlatılır. Kapsam dışı ek talepler ayrıca değerlendirilir ve fiyatlandırılır.</p>
        </section>

        <footer className="proposal-footer">
          <span>AkademikMerkez · Profesyonel Akademik Danışmanlık</span>
          <span>Bu belge elektronik ortamda oluşturulmuştur.</span>
        </footer>
      </article>

      <section className="decision-area print-hide">
        {!locked ? (
          <form className="decision-form" action={respondToProposal.bind(null, token)}>
            <button className="accept" name="decision" value="accept">Teklifi Kabul Ediyorum</button>
            <button className="reject" name="decision" value="reject">Teklifi Reddediyorum</button>
          </form>
        ) : <div className="decision-status">{statusNames[row.status] || `Teklif durumu: ${row.status}`}</div>}
      </section>
    </main>
  );
}
