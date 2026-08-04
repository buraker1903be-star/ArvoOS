import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { createFinanceTransaction, updateFinanceTransactionStatus } from "./actions";
import { createEntry, createParty } from "../accounts/actions";
import { createBankAccount, createBankTransaction, reconcileBankTransaction } from "../banking/actions";
import "./finance.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const statusNames: Record<string, string> = { planned: "Planlandı", paid: "Ödendi", canceled: "İptal" };

type Transaction = { id: string; transaction_type: "income" | "expense"; status: string; title: string; counterparty: string | null; category: string | null; amount: number; due_date: string | null; created_at: string; notes: string | null };
type Invoice = { id: string; status: string; total: number; due_at: string | null; paid_at: string | null; created_at: string };
type ContractLink = { contract_no: string; invoice_id: string | null };
type BankAccount = { id: string; bank_name: string; account_name: string | null; iban: string; currency: string; opening_balance: number };
type BankTransaction = { bank_account_id: string; direction: "inflow" | "outflow"; amount: number; reconciliation_status: string; transaction_date: string };
type AccountEntry = { entry_type: "debit" | "credit"; amount: number; due_date: string | null; transaction_date: string; party_id: string };
type Party = { id: string; name: string; party_type: string; tax_number: string | null; account_entries: AccountEntry[] };
type DetailedBankTransaction = { id: string; bank_account_id: string; direction: "inflow" | "outflow"; amount: number; transaction_date: string; description: string; reference_no: string | null; reconciliation_status: string; matched_invoice_id: string | null; matched_party_id: string | null };

function daysOverdue(date: string | null) { if (!date) return 0; const due = new Date(date.includes("T") ? date : `${date}T00:00:00`); return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000)); }
function contractNumberFromNotes(notes: string | null) { return notes?.match(/Sözleşme\s+(SOZ-[A-Z0-9-]+)/i)?.[1]?.toUpperCase() ?? null; }

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string; tur?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "finance")) throw new Error("Finans modülüne erişiminiz yok.");
  const hasCari = modules.some((module) => module.code === "accounts");
  const hasBanking = modules.some((module) => module.code === "banking");
  const tab = (params.tab === "cari" && hasCari) ? "cari" : (params.tab === "banka" && hasBanking) ? "banka" : "genel";
  const organizationId = membership.organization_id;
  const canManage = ["owner", "admin"].includes(membership.role);

  const [{ data: transactions, error }, { data: invoices }, { data: contracts }, { data: bankAccounts }, { data: bankTransactions }, { data: accountEntries }, { data: partyData, error: partyError }, { data: detailedBankTransactions }, { data: reconciliationInvoices }, { data: reconciliationParties }] = await Promise.all([
    supabase.from("finance_transactions").select("id,transaction_type,status,title,counterparty,category,amount,due_date,created_at,notes").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("billing_invoices").select("id,status,total,due_at,paid_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("crm_contracts").select("contract_no,invoice_id").eq("organization_id", organizationId).not("invoice_id", "is", null),
    supabase.from("organization_bank_accounts").select("id,bank_name,account_name,iban,currency,opening_balance").eq("organization_id", organizationId).eq("is_active", true).order("created_at"),
    supabase.from("bank_transactions").select("bank_account_id,direction,amount,reconciliation_status,transaction_date").eq("organization_id", organizationId),
    supabase.from("account_entries").select("entry_type,amount,due_date,transaction_date,party_id").eq("organization_id", organizationId),
    hasCari
      ? supabase.from("account_parties").select("id,name,party_type,tax_number,account_entries(id,party_id,entry_type,amount,description,transaction_date)").eq("organization_id", organizationId).eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as Party[], error: null }),
    hasBanking
      ? supabase.from("bank_transactions").select("id,bank_account_id,direction,amount,transaction_date,description,reference_no,reconciliation_status,matched_invoice_id,matched_party_id").eq("organization_id", organizationId).order("transaction_date", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as DetailedBankTransaction[] }),
    hasBanking
      ? supabase.from("billing_invoices").select("id,total,status,created_at").eq("organization_id", organizationId).in("status", ["open", "paid"]).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as { id: string; total: number; status: string }[] }),
    hasBanking
      ? supabase.from("account_parties").select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  if (error) throw new Error("Finans kayıtları okunamadı: " + error.message);
  if (partyError) throw new Error("Cari hesaplar okunamadı: " + partyError.message);

  const items = (transactions ?? []) as Transaction[]; const invoiceItems = (invoices ?? []) as Invoice[]; const contractLinks = (contracts ?? []) as ContractLink[]; const accountList = (bankAccounts ?? []) as BankAccount[]; const bankMoves = (bankTransactions ?? []) as BankTransaction[]; const ledger = (accountEntries ?? []) as AccountEntry[];
  const invoiceById = new Map(invoiceItems.map((invoice) => [invoice.id, invoice]));
  const invoiceBackedContractNos = new Set(contractLinks.filter((contract) => contract.invoice_id && invoiceById.has(contract.invoice_id)).map((contract) => contract.contract_no.toUpperCase()));
  const isInvoiceBackedContractTransaction = (item: Transaction) => { const contractNo = contractNumberFromNotes(item.notes); return Boolean(contractNo && invoiceBackedContractNos.has(contractNo)); };
  const standaloneItems = items.filter((item) => !isInvoiceBackedContractTransaction(item));
  const paidIncome = standaloneItems.filter((item) => item.transaction_type === "income" && item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0) + invoiceItems.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total ?? 0), 0);
  const paidExpense = items.filter((item) => item.transaction_type === "expense" && item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0);
  const expectedIncome = standaloneItems.filter((item) => item.transaction_type === "income" && item.status === "planned").reduce((sum, item) => sum + Number(item.amount), 0) + invoiceItems.filter((item) => ["draft", "open"].includes(item.status)).reduce((sum, item) => sum + Number(item.total ?? 0), 0);
  const expectedExpense = items.filter((item) => item.transaction_type === "expense" && item.status === "planned").reduce((sum, item) => sum + Number(item.amount), 0);
  const bankOpening = accountList.reduce((sum, item) => sum + Number(item.opening_balance ?? 0), 0); const bankInflows = bankMoves.filter((item) => item.direction === "inflow").reduce((sum, item) => sum + Number(item.amount), 0); const bankOutflows = bankMoves.filter((item) => item.direction === "outflow").reduce((sum, item) => sum + Number(item.amount), 0); const bankBalance = bankOpening + bankInflows - bankOutflows; const unmatchedCount = bankMoves.filter((item) => item.reconciliation_status === "unmatched").length;
  const partyLedger = new Map<string, { net: number; earliestDue: string | null }>();
  for (const entry of ledger) {
    const key = entry.party_id;
    const current = partyLedger.get(key) ?? { net: 0, earliestDue: null };
    const amount = Number(entry.amount);
    current.net += entry.entry_type === "debit" ? amount : -amount;
    if (entry.entry_type === "debit" && entry.due_date && (!current.earliestDue || entry.due_date < current.earliestDue)) current.earliestDue = entry.due_date;
    partyLedger.set(key, current);
  }
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  for (const { net, earliestDue } of partyLedger.values()) {
    if (net <= 0) continue;
    const overdue = daysOverdue(earliestDue);
    if (!earliestDue || overdue === 0) aging.current += net;
    else if (overdue <= 30) aging.d30 += net;
    else if (overdue <= 60) aging.d60 += net;
    else if (overdue <= 90) aging.d90 += net;
    else aging.over90 += net;
  }
  const upcoming = [...standaloneItems.filter((item) => item.status === "planned" && item.due_date).map((item) => ({ id: `tx-${item.id}`, label: item.title, amount: item.amount, date: item.due_date!, type: item.transaction_type })), ...invoiceItems.filter((item) => ["draft", "open"].includes(item.status) && item.due_at).map((item) => ({ id: `inv-${item.id}`, label: "Açık fatura", amount: item.total, date: item.due_at!, type: "income" as const }))].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6);
  const projectedCash = paidIncome - paidExpense + expectedIncome - expectedExpense;
  const overdueTotal = aging.d30 + aging.d60 + aging.d90 + aging.over90;
  const nextDue = upcoming[0] ?? null;
  const recentItems = items.slice(0, 12);

  const parties = (partyData ?? []) as Party[];
  const partyTotals = parties.map((party) => {
    const debit = (party.account_entries ?? []).filter((entry) => entry.entry_type === "debit").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credit = (party.account_entries ?? []).filter((entry) => entry.entry_type === "credit").reduce((sum, entry) => sum + Number(entry.amount), 0);
    return { ...party, balance: debit - credit };
  });
  const receivable = partyTotals.filter((party) => party.balance > 0).reduce((sum, party) => sum + party.balance, 0);
  const payable = partyTotals.filter((party) => party.balance < 0).reduce((sum, party) => sum + Math.abs(party.balance), 0);
  const filteredParties = partyTotals.filter((party) => {
    if (!params.tur || params.tur === "tumu") return true;
    if (params.tur === "musteri") return ["customer", "both"].includes(party.party_type);
    if (params.tur === "tedarikci") return ["supplier", "both"].includes(party.party_type);
    return true;
  });

  const bankTxRows = (detailedBankTransactions ?? []) as DetailedBankTransaction[];
  const bankTxUnmatched = bankTxRows.filter((item) => item.reconciliation_status === "unmatched").length;
  const bankTxIncoming = bankTxRows.filter((item) => item.direction === "inflow").reduce((sum, item) => sum + Number(item.amount), 0);
  const bankTxOutgoing = bankTxRows.filter((item) => item.direction === "outflow").reduce((sum, item) => sum + Number(item.amount), 0);
  const bankTxOpening = accountList.reduce((sum, item) => sum + Number(item.opening_balance ?? 0), 0);

  const tabHref = (target: string) => `/panel/finance?tab=${target}`;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">FİNANS</small><h1>Finans Merkezi</h1><p>Nakit durumu, cari bakiyeler ve vadeler tek ekranda.</p></div>
      <div className="panel-page-actions">
        <span className="status-pill">{tab === "cari" ? `${partyTotals.length} cari` : tab === "banka" ? `${bankTxUnmatched} eşleşmeyen` : `${items.length + invoiceItems.length} kayıt`}</span>
        {tab === "genel" && canManage ? <PanelDrawer triggerLabel="+ Yeni hareket" title="Yeni gelir veya gider kaydı" description="Planlanan veya gerçekleşen bir finansal hareket ekleyin.">
          <form className="panel-form finance-form" action={createFinanceTransaction}>
            <label>Tür<select name="transaction_type" defaultValue="income"><option value="income">Gelir</option><option value="expense">Gider</option></select></label>
            <label>Başlık<input name="title" required minLength={2} maxLength={180} /></label>
            <label className="wide">Cari (varsa)<select name="party_id" defaultValue=""><option value="">— Cari seçme, aşağıya serbest yaz —</option>{partyTotals.map((party) => <option key={party.id} value={party.id}>{party.name}{party.party_type === "supplier" ? " · Tedarikçi" : party.party_type === "both" ? " · Müşteri/Tedarikçi" : " · Müşteri"}</option>)}</select></label>
            <label>Cari adı (cari seçmediyseniz)<input name="counterparty" maxLength={180} placeholder="Serbest yazı" /></label>
            <label>Kategori<input name="category" maxLength={120} /></label>
            <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Vade<input name="due_date" type="date" /></label>
            <label className="wide">Not<textarea name="notes" maxLength={1000} /></label>
            <p className="wide finance-form-hint">Cari seçerseniz bu hareket otomatik olarak Cari Hesaplar bakiyesine de işlenir.</p>
            <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Kaydı oluştur</button></div>
          </form>
        </PanelDrawer> : null}
        {tab === "cari" && canManage ? <>
          <PanelDrawer triggerLabel="+ Yeni cari" title="Yeni cari" description="Müşteri veya tedarikçi kartı oluşturun.">
            <form className="panel-form" action={createParty}>
              <label>Cari adı<input name="name" required minLength={2} maxLength={180} /></label>
              <label>Tür<select name="party_type"><option value="customer">Müşteri</option><option value="supplier">Tedarikçi</option><option value="both">Her ikisi</option></select></label>
              <label>Vergi no<input name="tax_number" /></label><label>Vergi dairesi<input name="tax_office" /></label>
              <label>E-posta<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label>
              <div className="form-actions wide"><button className="panel-primary" type="submit">Cariyi kaydet</button></div>
            </form>
          </PanelDrawer>
          <PanelDrawer triggerLabel="+ Yeni hareket" title="Yeni cari hareketi" description="Seçili cariye borç veya alacak hareketi ekleyin.">
            <form className="panel-form" action={createEntry}>
              <label>Cari<select name="party_id" required>{partyTotals.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
              <label>Hareket<select name="entry_type"><option value="debit">Borçlandır</option><option value="credit">Alacaklandır</option></select></label>
              <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label>
              <label>Tarih<input name="transaction_date" type="date" /></label><label>Vade<input name="due_date" type="date" /></label>
              <label>Referans<input name="reference_no" /></label><label className="wide">Açıklama<input name="description" required minLength={2} maxLength={500} /></label>
              <div className="form-actions wide"><button className="panel-primary" type="submit">Hareketi kaydet</button></div>
            </form>
          </PanelDrawer>
        </> : null}
        {tab === "banka" && canManage ? <>
          <PanelDrawer triggerLabel="+ Banka hesabı" title="Yeni banka hesabı" description="Kurumun kullanacağı banka hesabını kaydedin.">
            <form className="panel-form" action={createBankAccount}>
              <label>Banka adı<input name="bank_name" required minLength={2} /></label>
              <label>Hesap sahibi<input name="account_name" /></label>
              <label>IBAN<input name="iban" required minLength={15} /></label>
              <label>Açılış bakiyesi<input name="opening_balance" type="number" step="0.01" defaultValue="0" /></label>
              <div className="form-actions wide"><button className="panel-primary" type="submit">Hesabı kaydet</button></div>
            </form>
          </PanelDrawer>
          <PanelDrawer triggerLabel="+ Banka hareketi" title="Yeni banka hareketi" description="Para girişini veya çıkışını ilgili hesaba ekleyin.">
            <form className="panel-form" action={createBankTransaction}>
              <label>Hesap<select name="bank_account_id" required>{accountList.map((item) => <option key={item.id} value={item.id}>{item.bank_name} · {item.iban}</option>)}</select></label>
              <label>Yön<select name="direction"><option value="inflow">Para girişi</option><option value="outflow">Para çıkışı</option></select></label>
              <label>Tutar<input name="amount" type="number" step="0.01" required min="0.01" /></label>
              <label>Tarih<input name="transaction_date" type="date" /></label>
              <label className="wide">Açıklama<input name="description" required minLength={2} /></label>
              <label>Referans<input name="reference_no" /></label>
              <div className="form-actions wide"><button className="panel-primary" type="submit">Hareketi kaydet</button></div>
            </form>
          </PanelDrawer>
        </> : null}
      </div>
    </div>

    {(hasCari || hasBanking) ? (
      <div className="finance-tabs">
        <a className={tab === "genel" ? "active" : ""} href={tabHref("genel")}>Genel Bakış</a>
        {hasCari ? <a className={tab === "cari" ? "active" : ""} href={tabHref("cari")}>Cari Hesaplar</a> : null}
        {hasBanking ? <a className={tab === "banka" ? "active" : ""} href={tabHref("banka")}>Banka ve Mutabakat</a> : null}
      </div>
    ) : null}

    <div className="finance-tab-panel">
    {tab === "genel" ? <>
      <section className="finance-metrics">
        <article><small>BANKA BAKİYESİ</small><strong>{money(bankBalance)}</strong><span>{accountList.length} aktif hesap</span></article>
        <article><small>TAHSİL EDİLEN</small><strong>{money(paidIncome)}</strong><span>Gerçekleşen giriş</span></article>
        <article><small>BEKLENEN TAHSİLAT</small><strong>{money(expectedIncome)}</strong><span>Tekilleştirilmiş açık alacaklar</span></article>
        <article><small>TAHMİNİ NET NAKİT</small><strong>{money(projectedCash)}</strong><span>Planlananlar dahil</span></article>
      </section>
      {(overdueTotal > 0 || nextDue) ? (
        <section className="finance-priority">
          {overdueTotal > 0 ? <div className="finance-priority-item risk"><span>!</span><div><b>{money(overdueTotal)}</b><small>Vadesi geçmiş cari bakiye — takip gerekiyor</small></div></div> : null}
          {nextDue ? <div className="finance-priority-item"><span>→</span><div><b>{nextDue.label} · {money(Number(nextDue.amount))}</b><small>En yakın vade: {new Date(nextDue.date).toLocaleDateString("tr-TR")}</small></div></div> : null}
        </section>
      ) : null}
      <section className="finance-insights">
        <article className="panel-card aging-card"><div><small>CARİ YAŞLANDIRMA</small><h3>Alacakların vade dağılımı</h3></div><div className="aging-grid"><span><b>{money(aging.current)}</b><small>Vadesi gelmedi</small></span><span><b>{money(aging.d30)}</b><small>1–30 gün</small></span><span><b>{money(aging.d60)}</b><small>31–60 gün</small></span><span><b>{money(aging.d90)}</b><small>61–90 gün</small></span><span className="risk"><b>{money(aging.over90)}</b><small>90+ gün</small></span></div></article>
        <article className="panel-card due-card"><div><small>YAKLAŞAN VADELER</small><h3>Öncelikli hareketler</h3></div>{upcoming.map((item) => <div className="due-row" key={item.id}><div><b>{item.label}</b><small>{new Date(item.date).toLocaleDateString("tr-TR")}</small></div><strong className={item.type === "expense" ? "negative" : "positive"}>{item.type === "expense" ? "-" : "+"}{money(Number(item.amount))}</strong></div>)}{!upcoming.length ? <p className="finance-empty">Yaklaşan kayıt yok.</p> : null}</article>
      </section>
      <section className="finance-grid"><div className="panel-card finance-list"><header><div><small>HAREKETLER</small><h3>Gelir ve gider kayıtları</h3></div><span className="status-pill">{unmatchedCount} eşleşmeyen</span></header>{recentItems.map((item) => <article key={item.id}><div><span className={"finance-type " + item.transaction_type}>{item.transaction_type === "income" ? "Gelir" : "Gider"}</span><h4>{item.title}</h4><p>{item.counterparty || item.category || "Bilgi yok"}</p></div><div className="finance-amount"><strong>{item.transaction_type === "expense" ? "-" : "+"}{money(Number(item.amount))}</strong><small>{item.due_date ? new Date(item.due_date + "T00:00:00").toLocaleDateString("tr-TR") : "Vade yok"}</small></div>{canManage ? <form action={updateFinanceTransactionStatus}><input type="hidden" name="transaction_id" value={item.id} /><select name="status" defaultValue={item.status}><option value="planned">Planlandı</option><option value="paid">Ödendi</option><option value="canceled">İptal</option></select><button type="submit">Güncelle</button></form> : <span>{statusNames[item.status]}</span>}</article>)}{!items.length ? <p className="finance-empty">Henüz kayıt yok.</p> : null}{items.length > recentItems.length ? <p className="finance-more-note">+{items.length - recentItems.length} daha eski kayıt var</p> : null}</div>
        <aside className="panel-card finance-side"><small>BANKA HESAPLARI</small><h3>Aktif hesaplar</h3>{accountList.map((account) => { const moves = bankMoves.filter((move) => move.bank_account_id === account.id); const balance = Number(account.opening_balance ?? 0) + moves.filter((move) => move.direction === "inflow").reduce((sum, move) => sum + Number(move.amount), 0) - moves.filter((move) => move.direction === "outflow").reduce((sum, move) => sum + Number(move.amount), 0); return <div className="bank-card" key={account.id}><b>{account.bank_name}</b><span>{account.account_name || "Hesap sahibi belirtilmedi"}</span><code>{String(account.iban).replace(/(.{4})/g, "$1 ").trim()}</code><strong>{money(balance)}</strong></div>; })}<hr /><small>AÇIK FATURALAR</small><strong>{invoiceItems.filter((item) => ["draft", "open"].includes(item.status)).length}</strong><p>Tahsilat bekleyen kayıtlar.</p></aside>
      </section>
    </> : null}

    {tab === "banka" ? <>
      <section className="metric-strip">
        <article><div><small>BAKİYE</small><strong>{money(bankTxOpening + bankTxIncoming - bankTxOutgoing)}</strong><p>Tahmini toplam</p></div></article>
        <article><div><small>GİRİŞ</small><strong>{money(bankTxIncoming)}</strong><p>Toplam para girişi</p></div></article>
        <article><div><small>ÇIKIŞ</small><strong>{money(bankTxOutgoing)}</strong><p>Toplam para çıkışı</p></div></article>
        <article><div><small>EŞLEŞMEYEN</small><strong>{bankTxUnmatched}</strong><p>Mutabakat bekliyor</p></div></article>
      </section>
      <section className="panel-card">
        <div className="section-heading"><div><small className="panel-kicker">HAREKETLER</small><h2>Mutabakat listesi</h2></div><span>Son 100 kayıt</span></div>
        <div className="panel-table"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Tutar</th><th>Durum</th><th>Eşleştirme</th></tr></thead><tbody>
          {bankTxRows.map((item) => <tr key={item.id}>
            <td>{new Date(item.transaction_date + "T00:00:00").toLocaleDateString("tr-TR")}</td>
            <td><b>{item.description}</b><br /><small>{item.reference_no || "Referans yok"}</small></td>
            <td><strong>{item.direction === "inflow" ? "+" : "-"}{money(Number(item.amount))}</strong></td>
            <td><span className="status-pill">{item.reconciliation_status === "matched" ? "Eşleşti" : item.reconciliation_status === "ignored" ? "Yok sayıldı" : "Bekliyor"}</span></td>
            <td><form className="reconciliation-form" action={reconcileBankTransaction}>
              <input type="hidden" name="transaction_id" value={item.id} />
              <select name="status" defaultValue={item.reconciliation_status}><option value="unmatched">Bekliyor</option><option value="matched">Eşleşti</option><option value="ignored">Yok say</option></select>
              <select name="invoice_id" defaultValue={item.matched_invoice_id ?? ""}><option value="">Fatura</option>{(reconciliationInvoices ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{money(Number(invoice.total))} · {invoice.status}</option>)}</select>
              <select name="party_id" defaultValue={item.matched_party_id ?? ""}><option value="">Cari</option>{(reconciliationParties ?? []).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select>
              <button className="panel-secondary" type="submit">Kaydet</button>
            </form></td>
          </tr>)}
          {!bankTxRows.length ? <tr><td colSpan={5} className="panel-empty">Henüz banka hareketi yok.</td></tr> : null}
        </tbody></table></div>
      </section>
    </> : null}

    {tab === "cari" ? <>
      <section className="metric-strip">
        <article><div><small>ALACAK</small><strong>{money(receivable)}</strong><p>Tahsil edilecek</p></div></article>
        <article><div><small>BORÇ</small><strong>{money(payable)}</strong><p>Ödenecek</p></div></article>
        <article><div><small>NET BAKİYE</small><strong>{money(receivable - payable)}</strong><p>Toplam pozisyon</p></div></article>
        <article><div><small>AKTİF CARİ</small><strong>{partyTotals.length}</strong><p>Müşteri ve tedarikçi</p></div></article>
      </section>
      <div className="section-heading"><div><small className="panel-kicker">CARİ LİSTESİ</small><h2>Bakiyeler</h2></div>
        <div className="finance-tabs finance-tabs-sub">
          <a className={!params.tur || params.tur === "tumu" ? "active" : ""} href={`${tabHref("cari")}&tur=tumu`}>Tümü</a>
          <a className={params.tur === "musteri" ? "active" : ""} href={`${tabHref("cari")}&tur=musteri`}>Müşteriler</a>
          <a className={params.tur === "tedarikci" ? "active" : ""} href={`${tabHref("cari")}&tur=tedarikci`}>Tedarikçiler</a>
        </div>
      </div>
      <section className="panel-modules">{filteredParties.map((party) => <article className="panel-card account-summary-card" key={party.id}>
        <small>{party.party_type === "supplier" ? "TEDARİKÇİ" : party.party_type === "both" ? "MÜŞTERİ / TEDARİKÇİ" : "MÜŞTERİ"}</small>
        <h3>{party.name}</h3><p>{party.tax_number || "Vergi numarası yok"}</p>
        <strong>{money(Math.abs(party.balance))}</strong><span>{party.balance >= 0 ? "Alacak" : "Borç"}</span>
        <Link className="panel-text-link" href={`/panel/accounts/${party.id}`}>Hareket dökümü →</Link>
      </article>)}{!filteredParties.length ? <div className="panel-card panel-empty">{partyTotals.length ? "Bu filtreye uygun cari yok." : "Henüz cari kart yok."}</div> : null}</section>
    </> : null}
    </div>
  </>;
}
