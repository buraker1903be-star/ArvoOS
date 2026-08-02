import { headers } from "next/headers";
import { getPanelContext } from "@/lib/panel-context";
import { createPaytrRequestToken, getPaytrCredentials } from "@/lib/paytr";
import { createPaytrOrder } from "./actions";

function formatTry(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
}

export default async function PaytrPage({ searchParams }: { searchParams: Promise<{ order?: string; result?: string }> }) {
  const { supabase, organization, membership } = await getPanelContext();
  const params = await searchParams;
  const { data: invoices } = await supabase
    .from("billing_invoices")
    .select("id,total,currency,due_at,created_at")
    .eq("organization_id", organization.id)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  let iframeToken: string | null = null;
  let orderError: string | null = null;
  if (params.order) {
    const { data: order } = await supabase
      .from("paytr_payment_orders")
      .select("merchant_oid,amount,currency,customer_email,customer_name,customer_phone,customer_address,status")
      .eq("organization_id", organization.id)
      .eq("merchant_oid", params.order)
      .maybeSingle();

    if (!order || order.status !== "pending") {
      orderError = "Ödeme siparişi bulunamadı veya daha önce sonuçlandı.";
    } else {
      const requestHeaders = await headers();
      const userIp = (requestHeaders.get("x-forwarded-for")?.split(",")[0] || requestHeaders.get("x-real-ip") || "127.0.0.1").trim();
      const credentials = getPaytrCredentials();
      const userBasket = Buffer.from(JSON.stringify([[`ArvoOS ${organization.name}`, (order.amount / 100).toFixed(2), 1]])).toString("base64");
      const testMode = process.env.PAYTR_TEST_MODE === "1" ? "1" : "0";
      const noInstallment = "0";
      const maxInstallment = "0";
      const token = createPaytrRequestToken({
        merchantId: credentials.merchantId,
        merchantKey: credentials.merchantKey,
        merchantSalt: credentials.merchantSalt,
        userIp,
        merchantOid: order.merchant_oid,
        email: order.customer_email,
        paymentAmount: String(order.amount),
        userBasket,
        noInstallment,
        maxInstallment,
        currency: order.currency,
        testMode,
      });
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.arvo-os.com";
      const body = new URLSearchParams({
        merchant_id: credentials.merchantId,
        user_ip: userIp,
        merchant_oid: order.merchant_oid,
        email: order.customer_email,
        payment_amount: String(order.amount),
        paytr_token: token,
        user_basket: userBasket,
        debug_on: testMode,
        no_installment: noInstallment,
        max_installment: maxInstallment,
        user_name: order.customer_name,
        user_address: order.customer_address,
        user_phone: order.customer_phone,
        merchant_ok_url: `${baseUrl}/panel/billing/paytr?result=success`,
        merchant_fail_url: `${baseUrl}/panel/billing/paytr?result=failed`,
        timeout_limit: "30",
        currency: order.currency,
        test_mode: testMode,
        lang: "tr",
      });
      const response = await fetch("https://www.paytr.com/odeme/api/get-token", { method: "POST", body, cache: "no-store" });
      const result = await response.json() as { status: string; token?: string; reason?: string };
      if (result.status === "success" && result.token) iframeToken = result.token;
      else orderError = result.reason || "PayTR ödeme formu başlatılamadı.";
    }
  }

  const canPay = membership && ["owner", "admin"].includes(membership.role);
  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">ONLINE TAHSİLAT</small><h1>PayTR ile Ödeme</h1><p>Açık faturayı güvenli PayTR ödeme formu üzerinden ödeyin.</p></div><span className="status-pill">PayTR</span></div>
    {params.result === "success" ? <div className="team-notice">Ödeme ekranı tamamlandı. Kesin sonuç PayTR bildirimi geldikten sonra faturaya yansıyacaktır.</div> : null}
    {params.result === "failed" ? <div className="platform-note"><span>!</span><p>Ödeme tamamlanamadı. Tekrar deneyebilirsiniz.</p></div> : null}
    {orderError ? <div className="platform-note"><span>!</span><p>{orderError}</p></div> : null}

    {iframeToken ? <section className="panel-card management-card"><iframe title="PayTR güvenli ödeme" src={`https://www.paytr.com/odeme/guvenli/${iframeToken}`} style={{ width: "100%", minHeight: 760, border: 0 }} allow="payment" /></section> : null}

    {!params.order && canPay ? <section className="panel-card management-card">
      <div className="management-heading"><div><small>ÖDEME BAŞLAT</small><h2>Açık fatura seçin</h2></div><span className="status-pill">Güvenli iFrame</span></div>
      <form action={createPaytrOrder} className="panel-form">
        <label className="wide">Açık fatura<select name="invoice_id" required>{(invoices ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{formatTry(invoice.total)} · {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString("tr-TR") : "Vade yok"}</option>)}</select></label>
        <label>Ad soyad<input name="customer_name" required maxLength={60} /></label>
        <label>E-posta<input name="customer_email" type="email" required maxLength={100} /></label>
        <label>Telefon<input name="customer_phone" required maxLength={20} /></label>
        <label className="wide">Fatura adresi<textarea name="customer_address" required maxLength={400} rows={3} /></label>
        <div className="wide management-submit"><small>Ödeme sonucu yalnızca PayTR callback doğrulamasıyla kesinleşir.</small><button className="panel-primary" type="submit" disabled={!invoices?.length}>PayTR ödeme ekranını aç</button></div>
      </form>
      {!invoices?.length ? <p className="panel-muted">Ödenebilir açık fatura bulunmuyor.</p> : null}
    </section> : null}
  </>;
}
