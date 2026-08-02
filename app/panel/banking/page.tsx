import { getPanelContext } from "@/lib/panel-context";
import { createBankAccount, createBankTransaction, reconcileBankTransaction } from "./actions";

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);

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
    <div className="panel-pagehead"><div><small className="panel-kicker">BANKA VE MUTABAKAT</small><h1>Banka hareketlerini finans ve cari kayıtlarla eşleştirin</h1><p>Hesap bakiyelerini, giriş-çıkışları ve eşleşmeyen hareketleri tek merkezden yönetin.</p></div><span className="status-pill">{unmatched} eşleşmeyen hareket</span></div>

    <section className="metric-strip">
      <article><div><small>TAHMİNİ BAKİYE</small><strong>{money(opening + incoming - outgoing)}</strong><p>Açılış ve hareket toplamı</p></div></article>
      <article><div><small>GİRİŞ</small><strong>{money(incoming)}</strong><p>Kayıtlı para girişleri</p></div></article>
      <article><div><small>ÇIKIŞ</small><strong>{money(outgoing)}</strong><p>Kayıtlı para çıkışları</p></div></article>
      <article><div><small>MUTABAKAT BEKLİYOR</small><strong>{unmatched}</strong><p>Fatura veya cari eşleşmesi yok</p></div></article>
    </section>

    <section className="panel-card"><h3>Yeni banka hesabı</h3><form className="panel-form" action={createBankAccount}>
      <label>Banka adı<input name="bank_name" required minLength={2} /></label>
      <label>Hesap adı<input name="account_name" /></label>
      <label>IBAN<input name="iban" required minLength={15} /></label>
      <label>Açılış bakiyesi<input name="opening_balance" type="number" step="0.01" defaultValue="0" /></label>
      <button className="panel-primary" type="submit">Hesabı ekle</button>
    </form></section>

    <section className="panel-card"><h3>Yeni banka hareketi</h3><form className="panel-form" action={createBankTransaction}>
      <label>Hesap<select name="bank_account_id" required>{(accounts ?? []).map((item) => <option key={item.id} value={item.id}>{item.bank_name} · {item.iban}</option>)}</select></label>
      <label>Yön<select name="direction"><option value="inflow">Para girişi</option><option value="outflow">Para çıkışı</option></select></label>
      <label>Tutar<input name="amount" type="number" step="0.01" required min="0.01" /></label>
      <label>Tarih<input name="transaction_date" type="date" /></label>
      <label>Açıklama<input name="description" required minLength={2} /></label>
      <label>Referans<input name="reference_no" /></label>
      <button className="panel-primary" type="submit">Hareketi kaydet</button>
    </form></section>

    <section className="panel-card"><div className="section-heading"><div><small className="panel-kicker">SON HAREKETLER</small><h2>Mutabakat listesi</h2></div></div>
      <div className="panel-table"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Tutar</th><th>Durum</th><th>Eşleştirme</th></tr></thead><tbody>
        {(transactions ?? []).map((item) => <tr key={item.id}><td>{new Date(item.transaction_date + "T00:00:00").toLocaleDateString("tr-TR")}</td><td>{item.description}<br/><small>{item.reference_no || "Referans yok"}</small></td><td>{item.direction === "inflow" ? "+" : "-"}{money(Number(item.amount))}</td><td>{item.reconciliation_status}</td><td><form action={reconcileBankTransaction}><input type="hidden" name="transaction_id" value={item.id}/><select name="status" defaultValue={item.reconciliation_status}><option value="unmatched">Eşleşmedi</option><option value="matched">Eşleşti</option><option value="ignored">Yok say</option></select><select name="invoice_id" defaultValue={item.matched_invoice_id ?? ""}><option value="">Fatura seç</option>{(invoices ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{money(Number(invoice.total))} · {invoice.status}</option>)}</select><select name="party_id" defaultValue={item.matched_party_id ?? ""}><option value="">Cari seç</option>{(parties ?? []).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select><button type="submit">Kaydet</button></form></td></tr>)}
        {!(transactions ?? []).length ? <tr><td colSpan={5}>Henüz banka hareketi yok.</td></tr> : null}
      </tbody></table></div>
    </section>
  </>;
}
