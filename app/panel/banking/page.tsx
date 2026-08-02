import { getPanelContext } from "@/lib/panel-context";
import { createBankAccount, createBankTransaction, reconcileBankTransaction } from "./actions";

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);

export default async function BankingPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "banking")) throw new Error("Banka modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;

  const [{ data: accounts }, { data: transactions }, { data: invoices }, { data: parties }] = await Promise.all([
    supabase.from("organization_bank_accounts").select("id,bank_name,account_name,iban,opening_balance,is_active").eq("organization_id", organizationId).order("created_at"),
    supabase.from("bank_transactions").select("id,bank_account_id,direction,amount,transaction_date,description,reference_no,reconciliation_status,matched_invoice_id,matched_party_id").eq("organization_id", organizationId).order("transaction_date", { ascending: false }).limit(100),
    supabase.from("billing_invoices").select("id,total,status,created_at").eq("organization_id", organizationId).in("status", ["open","paid"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("account_parties").select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
  ]);

  const incoming = (transactions ?? []).filter((item) => item.direction === "inflow").reduce((sum, item) => sum + Number(item.amount), 0);
  const outgoing = (transactions ?? []).filter((item) => item.direction === "outflow").reduce((sum, item) => sum + Number(item.amount), 0);
  const opening = (accounts ?? []).reduce((sum, item) => sum + Number(item.opening_balance ?? 0), 0);
  const unmatched = (transactions ?? []).filter((item) => item.reconciliation_status === "unmatched").length;

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">FİNANS</small><h1>Banka ve mutabakat</h1><p>Hesapları, hareketleri ve eşleşmeleri yönetin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{unmatched} eşleşmeyen</span></div>
    </div>

    <section className="metric-strip">
      <article><div><small>BAKİYE</small><strong>{money(opening + incoming - outgoing)}</strong><p>Tahmini toplam</p></div></article>
      <article><div><small>GİRİŞ</small><strong>{money(incoming)}</strong><p>Toplam para girişi</p></div></article>
      <article><div><small>ÇIKIŞ</small><strong>{money(outgoing)}</strong><p>Toplam para çıkışı</p></div></article>
      <article><div><small>EŞLEŞMEYEN</small><strong>{unmatched}</strong><p>Mutabakat bekliyor</p></div></article>
    </section>

    <div className="panel-action-row">
      <details className="panel-card panel-action-details"><summary>+ Banka hesabı</summary><form className="panel-form" action={createBankAccount}>
        <label>Banka adı<input name="bank_name" required minLength={2} /></label>
        <label>Hesap sahibi<input name="account_name" /></label>
        <label>IBAN<input name="iban" required minLength={15} /></label>
        <label>Açılış bakiyesi<input name="opening_balance" type="number" step="0.01" defaultValue="0" /></label>
        <div className="form-actions wide"><button className="panel-primary" type="submit">Hesabı kaydet</button></div>
      </form></details>
      <details className="panel-card panel-action-details"><summary>+ Banka hareketi</summary><form className="panel-form" action={createBankTransaction}>
        <label>Hesap<select name="bank_account_id" required>{(accounts ?? []).map((item) => <option key={item.id} value={item.id}>{item.bank_name} · {item.iban}</option>)}</select></label>
        <label>Yön<select name="direction"><option value="inflow">Para girişi</option><option value="outflow">Para çıkışı</option></select></label>
        <label>Tutar<input name="amount" type="number" step="0.01" required min="0.01" /></label>
        <label>Tarih<input name="transaction_date" type="date" /></label>
        <label className="wide">Açıklama<input name="description" required minLength={2} /></label>
        <label>Referans<input name="reference_no" /></label>
        <div className="form-actions wide"><button className="panel-primary" type="submit">Hareketi kaydet</button></div>
      </form></details>
    </div>

    <section className="panel-card">
      <div className="section-heading"><div><small className="panel-kicker">HAREKETLER</small><h2>Mutabakat listesi</h2></div><span>Son 100 kayıt</span></div>
      <div className="panel-table"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Tutar</th><th>Durum</th><th>Eşleştirme</th></tr></thead><tbody>
        {(transactions ?? []).map((item) => <tr key={item.id}>
          <td>{new Date(item.transaction_date + "T00:00:00").toLocaleDateString("tr-TR")}</td>
          <td><b>{item.description}</b><br/><small>{item.reference_no || "Referans yok"}</small></td>
          <td><strong>{item.direction === "inflow" ? "+" : "-"}{money(Number(item.amount))}</strong></td>
          <td><span className="status-pill">{item.reconciliation_status === "matched" ? "Eşleşti" : item.reconciliation_status === "ignored" ? "Yok sayıldı" : "Bekliyor"}</span></td>
          <td><form className="reconciliation-form" action={reconcileBankTransaction}>
            <input type="hidden" name="transaction_id" value={item.id}/>
            <select name="status" defaultValue={item.reconciliation_status}><option value="unmatched">Bekliyor</option><option value="matched">Eşleşti</option><option value="ignored">Yok say</option></select>
            <select name="invoice_id" defaultValue={item.matched_invoice_id ?? ""}><option value="">Fatura</option>{(invoices ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{money(Number(invoice.total))} · {invoice.status}</option>)}</select>
            <select name="party_id" defaultValue={item.matched_party_id ?? ""}><option value="">Cari</option>{(parties ?? []).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select>
            <button className="panel-secondary" type="submit">Kaydet</button>
          </form></td>
        </tr>)}
        {!(transactions ?? []).length ? <tr><td colSpan={5} className="panel-empty">Henüz banka hareketi yok.</td></tr> : null}
      </tbody></table></div>
    </section>
  </>;
}