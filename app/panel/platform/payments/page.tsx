import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { StgIcon, StgSection, StgValueRow, StgWidget, type StgTone } from "../../settings/settings-ui";
import { PAKET_ADI, para, tarihSaat } from "../bicim";
import { reviewBankTransferPayment } from "./actions";
import "../../settings/settings.css";
import "../platform.css";

const statusLabels: Record<string, string> = { pending: "İnceleme bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };
const statusTones: Record<string, StgTone> = { pending: "warning", approved: "success", rejected: "danger" };

export default async function PaymentApprovalsPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const incidents = await getPaymentIncidents();

  const { data, error } = await supabase
    .from("organization_payment_requests")
    .select("id,organization_id,plan_code,product,amount,currency,status,payment_method,receipt_path,reference_no,customer_note,review_note,created_at,organizations(name,slug),platform_bank_accounts(bank_name,iban)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Ödeme bildirimleri okunamadı: ${error.message}`);

  const payments = await Promise.all((data ?? []).map(async (payment) => {
    // Kartla (PayTR) ödemede dekont yoktur
    const { data: signed } = payment.receipt_path
      ? await supabase.storage.from("payment-receipts").createSignedUrl(payment.receipt_path, 900)
      : { data: null };
    return { ...payment, receiptUrl: signed?.signedUrl ?? null };
  }));
  // Bekleyenler en üstte
  payments.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  const pending = payments.filter((payment) => payment.status === "pending");
  const pendingTotal = pending.reduce((sum, payment) => sum + payment.amount, 0);
  const approved = payments.filter((payment) => payment.status === "approved");
  const approvedTotal = approved.reduce((sum, payment) => sum + payment.amount, 0);
  const rejected = payments.filter((payment) => payment.status === "rejected").length;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · FİNANS</small><h1>Ödeme Onayları</h1><p>Havale/EFT dekontlarını inceleyin; onaylanan ödemede lisans ve abonelik otomatik etkinleşir.</p></div>
    </div>

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "karşılıksız
      bildirim yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}
    <div className="stg-widgets" aria-label="Ödeme özeti">
      <StgWidget tone={pending.length ? "warning" : "neutral"} icon="wallet" label="İnceleme bekliyor" value={pending.length} note={pending.length ? `${para(pendingTotal)} tutarında` : "Bekleyen dekont yok"} />
      <StgWidget tone="success" icon="check" label="Onaylanan" value={para(approvedTotal)} note={`${approved.length} bildirim`} />
      <StgWidget tone={rejected ? "info" : "neutral"} icon="doc" label="Reddedilen" value={rejected} note={rejected ? "Müşteriye not yazıldı" : "Reddedilen bildirim yok"} />
      <StgWidget tone={incidents.length ? "danger" : "neutral"} icon="shield" label="Karşılıksız" value={incidents.length} note={incidents.length ? "PayTR ödedi, kayıt oluşmadı" : "İşlenemeyen bildirim yok"} />
    </div>

    {incidents.length ? (
      <StgSection
        id="karsiliksiz" wide icon="shield" tone="danger"
        kicker="MÜDAHALE BEKLİYOR" title={`${incidents.length} ödeme bildirimi işlenemedi`}
        description="PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; her birini PayTR panelinden doğrulayın."
      >
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Kurum</th><th>Sebep</th><th>Tutar</th><th>PayTR no</th><th>Tarih</th></tr></thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>{incident.organizationName ?? "—"}</td>
                  <td>
                    <span className="status-pill" data-tone="danger">{incidentLabels[incident.result] ?? incident.result}</span>
                    <small className="plt-substatus">{incidentNotes[incident.result] ?? ""}</small>
                  </td>
                  <td>{incident.paymentAmount !== null ? para(incident.paymentAmount) : "—"}</td>
                  <td className="plt-mono">{incident.merchantOid}</td>
                  <td>{tarihSaat(incident.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StgSection>
    ) : null}

    {payments.length ? (
      <div className="stg-grid">
        {payments.map((payment) => {
          const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
          const account = Array.isArray(payment.platform_bank_accounts) ? payment.platform_bank_accounts[0] : payment.platform_bank_accounts;
          const tone = statusTones[payment.status] ?? "neutral";
          return (
            <StgSection
              key={payment.id} id={`odeme-${payment.id}`} icon="wallet" tone={tone}
              kicker={organization?.slug ?? "KURUM"} title={`${organization?.name ?? "Kurum"} · ${para(payment.amount, payment.currency)}`}
              aside={
                <span className="plt-row-uc">
                  <span className="status-pill" data-tone={tone}>{statusLabels[payment.status] ?? payment.status}</span>
                  {/* Dekontu incelerken kiracının tamamına bakmak gerekebilir:
                      lisansı ne durumda, kaç kullanıcısı var. */}
                  <Link className="kiraci-baglanti" href={`/panel/platform?organization=${payment.organization_id}`}>Kiracı →</Link>
                </span>
              }
            >
              <dl className="stg-list">
                <StgValueRow label="Ürün" value={productName(payment.product ?? "arvoos")} />
                <StgValueRow label="Paket" value={PAKET_ADI[payment.plan_code] ?? payment.plan_code} />
                <StgValueRow label="Ödeme yolu" value={payment.payment_method === "paytr" ? "Kartla (PayTR)" : "Havale / EFT"} />
                <StgValueRow label="Banka" value={account?.bank_name ?? null} />
                <StgValueRow label="Referans" value={payment.reference_no ?? null} mono />
                <StgValueRow label="Bildirim" value={tarihSaat(payment.created_at)} />
              </dl>
              {payment.customer_note ? <p className="plt-quote">“{payment.customer_note}”</p> : null}
              {payment.payment_method === "paytr"
                ? <p className="stg-muted"><StgIcon name="check" size={16} />PayTR ile kartla ödendi; otomatik onaylandı.</p>
                : payment.receiptUrl
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
    ) : <div className="stg-empty"><StgIcon name="wallet" size={22} /><p>Henüz ödeme bildirimi yok. Kurumlar panelden havale bildirdiğinde ya da kartla ödediğinde burada görünür.</p></div>}
  </div>;
}
