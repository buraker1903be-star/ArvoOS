import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { StgIcon, StgSection, StgValueRow, StgWidget, type StgTone } from "../../settings/settings-ui";
import { reviewBankTransferPayment } from "./actions";
import "../../settings/settings.css";
import "../platform.css";

const formatTry = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
const dateTime = (value: string) => new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" });
const statusLabels: Record<string, string> = { pending: "İnceleme bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };
const statusTones: Record<string, StgTone> = { pending: "warning", approved: "success", rejected: "danger" };
const planLabels: Record<string, string> = { starter: "Başlangıç", professional: "Profesyonel", enterprise: "Kurumsal" };

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
  // Bekleyenler en üstte
  payments.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  const pendingCount = payments.filter((payment) => payment.status === "pending").length;
  const pendingTotal = payments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + payment.amount, 0);
  const approvedTotal = payments.filter((payment) => payment.status === "approved").reduce((sum, payment) => sum + payment.amount, 0);

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · FİNANS</small><h1>Ödeme Onayları</h1><p>Havale/EFT dekontlarını inceleyin; onaylanan ödemede lisans ve abonelik otomatik etkinleşir.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/platform">Platform yönetimi</Link></div>
    </div>

    <section className="stg-widgets" aria-label="Ödeme özeti">
      <StgWidget tone={pendingCount ? "warning" : "neutral"} icon="wallet" label="İnceleme bekleyen" value={pendingCount} note={pendingCount ? formatTry(pendingTotal) : "Bekleyen dekont yok"} />
      <StgWidget tone="success" icon="check" label="Onaylanan toplam" value={formatTry(approvedTotal)} note="Son 100 bildirim" />
      <StgWidget tone="info" icon="doc" label="Bildirim" value={payments.length} note="Toplam kayıt" />
      <StgWidget tone="gold" icon="lock" label="Dekont erişimi" value="15 dk" note="Süreli, özel bağlantı" />
    </section>

    {payments.length ? (
      <div className="stg-grid">
        {payments.map((payment) => {
          const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
          const account = Array.isArray(payment.platform_bank_accounts) ? payment.platform_bank_accounts[0] : payment.platform_bank_accounts;
          const tone = statusTones[payment.status] ?? "neutral";
          return (
            <StgSection
              key={payment.id} id={`odeme-${payment.id}`} icon="wallet" tone={tone}
              kicker={organization?.slug ?? "KURUM"} title={`${organization?.name ?? "Kurum"} · ${formatTry(payment.amount)}`}
              aside={<span className="status-pill" data-tone={tone}>{statusLabels[payment.status] ?? payment.status}</span>}
            >
              <dl className="stg-list">
                <StgValueRow label="Paket" value={planLabels[payment.plan_code] ?? payment.plan_code} />
                <StgValueRow label="Banka" value={account?.bank_name ?? null} />
                <StgValueRow label="Referans" value={payment.reference_no ?? null} mono />
                <StgValueRow label="Bildirim" value={dateTime(payment.created_at)} />
              </dl>
              {payment.customer_note ? <p className="plt-quote">“{payment.customer_note}”</p> : null}
              {payment.receiptUrl
                ? <a className="panel-secondary plt-receipt" href={payment.receiptUrl} target="_blank" rel="noreferrer"><StgIcon name="doc" size={16} />Dekontu görüntüle</a>
                : <p className="stg-muted"><StgIcon name="lock" size={16} />Dekont bağlantısı oluşturulamadı.</p>}
              {payment.status === "pending" ? (
                <form className="panel-form" action={reviewBankTransferPayment}>
                  <input type="hidden" name="payment_id" value={payment.id} />
                  <label className="wide">İnceleme notu<textarea name="review_note" rows={2} maxLength={1000} placeholder="Onay ya da red açıklaması (müşteri görür)" /></label>
                  <div className="wide panel-form-actions"><button className="panel-secondary" name="decision" value="rejected" type="submit">Reddet</button><button className="panel-primary" name="decision" value="approved" type="submit">Ödemeyi onayla</button></div>
                </form>
              ) : payment.review_note ? <p className="plt-quote">{payment.review_note}</p> : null}
            </StgSection>
          );
        })}
      </div>
    ) : <div className="stg-empty"><StgIcon name="wallet" size={22} /><p>Henüz ödeme bildirimi yok.</p></div>}
  </div>;
}
