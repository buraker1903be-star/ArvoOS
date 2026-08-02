import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { reviewBankTransferPayment } from "./actions";

function formatTry(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
}

export default async function PaymentApprovalsPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { data, error } = await supabase
    .from("organization_payment_requests")
    .select("id,organization_id,plan_code,amount,currency,status,receipt_path,reference_no,customer_note,review_note,created_at,organizations(name,slug),platform_bank_accounts(bank_name,iban)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Ödeme bildirimleri okunamadı: ${error.message}`);

  const payments = await Promise.all((data ?? []).map(async (payment) => {
    const { data: signed } = await supabase.storage.from("payment-receipts").createSignedUrl(payment.receipt_path, 900);
    return { ...payment, receiptUrl: signed?.signedUrl ?? null };
  }));

  const pendingCount = payments.filter((payment) => payment.status === "pending").length;
  const approvedTotal = payments.filter((payment) => payment.status === "approved").reduce((sum, payment) => sum + payment.amount, 0);

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">KURUCU FİNANS OPERASYONU</small><h1>Ödeme Onayları</h1><p>Havale/EFT dekontlarını inceleyin; onaylanan ödemelerde lisans ve abonelik otomatik etkinleşir.</p></div><span className="owner-badge">◇ KURUCU YETKİSİ</span></div>

    <section className="platform-overview"><div><small>ÖDEME MERKEZİ</small><h2>Manuel tahsilat</h2><p>Dekontlar özel Supabase Storage alanında tutulur ve yalnızca süreli bağlantılarla görüntülenir.</p></div><dl><div><dt>BEKLEYEN</dt><dd>{pendingCount}</dd></div><div><dt>ONAYLANAN TOPLAM</dt><dd>{formatTry(approvedTotal)}</dd></div><div><dt>KAYIT</dt><dd>{payments.length}</dd></div></dl></section>

    <section className="module-control-list">
      {payments.map((payment) => {
        const organizationRelation = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
        const accountRelation = Array.isArray(payment.platform_bank_accounts) ? payment.platform_bank_accounts[0] : payment.platform_bank_accounts;
        return <article className="panel-card management-card" key={payment.id}>
          <div className="management-heading"><div><small>{organizationRelation?.slug ?? payment.organization_id}</small><h2>{organizationRelation?.name ?? "Kurum"} · {formatTry(payment.amount)}</h2></div><span className="status-pill">{payment.status}</span></div>
          <dl className="billing-summary"><div><dt>Paket</dt><dd>{payment.plan_code}</dd></div><div><dt>Banka</dt><dd>{accountRelation?.bank_name ?? "—"}</dd></div><div><dt>Referans</dt><dd>{payment.reference_no ?? "—"}</dd></div><div><dt>Tarih</dt><dd>{new Date(payment.created_at).toLocaleString("tr-TR")}</dd></div></dl>
          {payment.customer_note ? <div className="platform-note"><span>i</span><p>{payment.customer_note}</p></div> : null}
          {payment.receiptUrl ? <p><a className="panel-primary" href={payment.receiptUrl} target="_blank" rel="noreferrer">Dekontu görüntüle</a></p> : <p className="panel-muted">Dekont bağlantısı oluşturulamadı.</p>}
          {payment.status === "pending" ? <form className="panel-form" action={reviewBankTransferPayment}>
            <input type="hidden" name="payment_id" value={payment.id} />
            <label className="wide">İnceleme notu<textarea name="review_note" rows={2} maxLength={1000} placeholder="Onay veya red açıklaması" /></label>
            <div className="wide management-submit"><button className="panel-primary" name="decision" value="approved" type="submit">Ödemeyi onayla</button><button className="panel-secondary" name="decision" value="rejected" type="submit">Reddet</button></div>
          </form> : payment.review_note ? <div className="platform-note"><span>✓</span><p>{payment.review_note}</p></div> : null}
        </article>;
      })}
      {!payments.length ? <div className="panel-card management-card"><p className="panel-muted">Henüz ödeme bildirimi bulunmuyor.</p></div> : null}
    </section>
  </>;
}
