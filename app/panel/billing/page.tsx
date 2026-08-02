import { getPanelContext } from "@/lib/panel-context";
import { submitBankTransferPayment } from "./actions";

function formatTry(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
}

function formatIban(iban: string) {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { supabase, organization, membership } = await getPanelContext();
  const params = await searchParams;

  const [{ data: bankAccounts }, { data: payments }, { data: license }] = await Promise.all([
    supabase.from("platform_bank_accounts").select("id,bank_name,account_holder,iban,currency").eq("is_active", true).order("sort_order"),
    supabase.from("organization_payment_requests").select("id,plan_code,amount,currency,status,reference_no,review_note,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("organization_licenses").select("plan_code,license_status,current_period_end").eq("organization_id", organization.id).maybeSingle(),
  ]);

  const canSubmit = membership && ["owner", "admin"].includes(membership.role);

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">FİNANS VE ABONELİK</small><h1>Ödeme ve Lisans</h1><p>Havale/EFT bilgilerini görüntüleyin, dekont gönderin veya PayTR ile online ödeme yapın.</p></div>
      <div className="management-actions"><a className="panel-primary" href="/panel/billing/paytr">PayTR ile öde</a><span className="status-pill">{license?.license_status ?? "trialing"}</span></div>
    </div>

    {params.submitted === "1" ? <div className="team-notice">Dekontunuz alındı. Kurucu onayından sonra lisansınız otomatik etkinleştirilecek.</div> : null}

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>BANKA HESABI</small><h2>Havale / EFT</h2></div><span className="status-pill">TRY</span></div>
        {(bankAccounts ?? []).map((account) => <div className="platform-note" key={account.id}><span>₺</span><p><b>{account.bank_name}</b>{account.account_holder ? ` · ${account.account_holder}` : ""}<br />IBAN: <strong>{formatIban(account.iban)}</strong></p></div>)}
        <p className="panel-muted">Açıklama alanına kurum adınızı ve seçtiğiniz paket adını yazın. Ödeme sonrasında dekontu aşağıdaki formdan gönderin.</p>
      </article>

      <article className="panel-card management-card">
        <div className="management-heading"><div><small>MEVCUT LİSANS</small><h2>{organization.name}</h2></div><span className="status-pill">{license?.plan_code ?? organization.plan_code}</span></div>
        <dl className="billing-summary">
          <div><dt>Durum</dt><dd>{license?.license_status ?? "trialing"}</dd></div>
          <div><dt>Paket</dt><dd>{license?.plan_code ?? organization.plan_code}</dd></div>
          <div><dt>Dönem sonu</dt><dd>{license?.current_period_end ? new Date(license.current_period_end).toLocaleDateString("tr-TR") : "—"}</dd></div>
        </dl>
      </article>
    </section>

    {canSubmit ? <section className="panel-card management-card">
      <div className="management-heading"><div><small>ÖDEME BİLDİRİMİ</small><h2>Dekont gönder</h2></div><span className="status-pill">Manuel onay</span></div>
      <form className="panel-form" action={submitBankTransferPayment}>
        <label>Banka hesabı<select name="bank_account_id" required>{(bankAccounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.bank_name} · {formatIban(account.iban)}</option>)}</select></label>
        <label>Paket<select name="plan_code" defaultValue={license?.plan_code ?? organization.plan_code}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></label>
        <label>Tutar (TL)<input name="amount" inputMode="decimal" min="1" step="0.01" required placeholder="0,00" /></label>
        <label>İşlem / referans no<input name="reference_no" maxLength={120} placeholder="Opsiyonel" /></label>
        <label className="wide">Dekont<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
        <label className="wide">Not<textarea name="customer_note" maxLength={1000} rows={3} placeholder="Ödemeyle ilgili açıklama" /></label>
        <div className="wide management-submit"><small>PDF, JPG, PNG veya WEBP · en fazla 10 MB</small><button className="panel-primary" type="submit">Dekontu gönder</button></div>
      </form>
    </section> : <div className="platform-note"><span>i</span><p>Dekont gönderimi yalnızca kurum sahibi veya yöneticisi tarafından yapılabilir.</p></div>}

    <section className="panel-card management-card">
      <div className="management-heading"><div><small>ÖDEME GEÇMİŞİ</small><h2>Bildirimler</h2></div><span className="status-pill">{payments?.length ?? 0} kayıt</span></div>
      <div className="module-control-list">
        {(payments ?? []).map((payment) => <div className="module-control" key={payment.id}><div><b>{payment.plan_code} · {formatTry(payment.amount)}</b><small>{new Date(payment.created_at).toLocaleString("tr-TR")}{payment.reference_no ? ` · ${payment.reference_no}` : ""}{payment.review_note ? ` · ${payment.review_note}` : ""}</small></div><span className="status-pill">{payment.status}</span></div>)}
        {!payments?.length ? <p className="panel-muted">Henüz ödeme bildirimi bulunmuyor.</p> : null}
      </div>
    </section>
  </>;
}
