import { getPanelContext } from "@/lib/panel-context";
import { createFinanceTransaction, updateFinanceTransactionStatus } from "./actions";
import "./finance.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const statusNames: Record<string,string> = { planned: "Planlandı", paid: "Ödendi", canceled: "İptal" };
type Transaction = { id: string; transaction_type: "income"|"expense"; status: string; title: string; counterparty: string|null; category: string|null; amount: number; due_date: string|null; created_at: string };
type Invoice = { id:string; status:string; total:number; due_at:string|null; paid_at:string|null; created_at:string };
type BankAccount = { id:string; bank_name:string; account_name:string|null; iban:string; currency:string; opening_balance:number };
type BankTransaction = { bank_account_id:string; direction:"inflow"|"outflow"; amount:number; reconciliation_status:string; transaction_date:string };
type AccountEntry = { entry_type:"debit"|"credit"; amount:number; due_date:string|null; transaction_date:string; party_id:string };
function daysOverdue(date:string|null) { if (!date) return 0; const due = new Date(date.includes("T") ? date : `${date}T00:00:00`); return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000)); }

export default async function FinancePage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "finance")) throw new Error("Finans modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const [{ data: transactions, error }, { data: invoices }, { data: bankAccounts }, { data: bankTransactions }, { data: accountEntries }] = await Promise.all([
    supabase.from("finance_transactions").select("id,transaction_type,status,title,counterparty,category,amount,due_date,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("billing_invoices").select("id,status,total,due_at,paid_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("organization_bank_accounts").select("id,bank_name,account_name,iban,currency,opening_balance").eq("organization_id", organizationId).eq("is_active", true).order("created_at"),
    supabase.from("bank_transactions").select("bank_account_id,direction,amount,reconciliation_status,transaction_date").eq("organization_id", organizationId),
    supabase.from("account_entries").select("entry_type,amount,due_date,transaction_date,party_id").eq("organization_id", organizationId),
  ]);
  if (error) throw new Error("Finans kayıtları okunamadı: " + error.message);
  const items = (transactions ?? []) as Transaction[]; const invoiceItems = (invoices ?? []) as Invoice[]; const accountList = (bankAccounts ?? []) as BankAccount[]; const bankMoves = (bankTransactions ?? []) as BankTransaction[]; const ledger = (accountEntries ?? []) as AccountEntry[];
  const paidIncome = items.filter((item) => item.transaction_type === "income" && item.status === "paid").reduce((sum,item) => sum + Number(item.amount),0) + invoiceItems.filter((item) => item.status === "paid").reduce((sum,item) => sum + Number(item.total ?? 0),0);
  const paidExpense = items.filter((item) => item.transaction_type === "expense" && item.status === "paid").reduce((sum,item) => sum + Number(item.amount),0);
  const expectedIncome = items.filter((item) => item.transaction_type === "income" && item.status === "planned").reduce((sum,item) => sum + Number(item.amount),0) + invoiceItems.filter((item) => item.status === "open").reduce((sum,item) => sum + Number(item.total ?? 0),0);
  const expectedExpense = items.filter((item) => item.transaction_type === "expense" && item.status === "planned").reduce((sum,item) => sum + Number(item.amount),0);
  const bankOpening = accountList.reduce((sum,item) => sum + Number(item.opening_balance ?? 0),0); const bankInflows = bankMoves.filter((item) => item.direction === "inflow").reduce((sum,item) => sum + Number(item.amount),0); const bankOutflows = bankMoves.filter((item) => item.direction === "outflow").reduce((sum,item) => sum + Number(item.amount),0); const bankBalance = bankOpening + bankInflows - bankOutflows; const unmatchedCount = bankMoves.filter((item) => item.reconciliation_status === "unmatched").length;
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 }; for (const entry of ledger.filter((item) => item.entry_type === "debit")) { const overdue = daysOverdue(entry.due_date); const amount = Number(entry.amount); if (!entry.due_date || overdue === 0) aging.current += amount; else if (overdue <= 30) aging.d30 += amount; else if (overdue <= 60) aging.d60 += amount; else if (overdue <= 90) aging.d90 += amount; else aging.over90 += amount; }
  const upcoming = [...items.filter((item) => item.status === "planned" && item.due_date).map((item) => ({ id:`tx-${item.id}`, label:item.title, amount:item.amount, date:item.due_date!, type:item.transaction_type })), ...invoiceItems.filter((item) => item.status === "open" && item.due_at).map((item) => ({ id:`inv-${item.id}`, label:"Açık fatura", amount:item.total, date:item.due_at!, type:"income" as const }))].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0,6);
  const canManage = ["owner","admin"].includes(membership.role); const projectedCash = paidIncome - paidExpense + expectedIncome - expectedExpense;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">FİNANS</small><h1>Finans Merkezi</h1><p>Nakit durumunu, yaklaşan vadeleri ve mutabakat bekleyen kayıtları izleyin.</p></div><div className="panel-page-actions"><span className="status-pill">{items.length + invoiceItems.length} kayıt</span>{canManage ? <a className="panel-primary" href="#new-finance-record">+ Yeni hareket</a> : null}</div></div>
    <section className="finance-metrics">
      <article><small>BANKA BAKİYESİ</small><strong>{money(bankBalance)}</strong><span>{accountList.length} aktif hesap</span></article>
      <article><small>TAHSİL EDİLEN</small><strong>{money(paidIncome)}</strong><span>Gerçekleşen giriş</span></article>
      <article><small>BEKLENEN TAHSİLAT</small><strong>{money(expectedIncome)}</strong><span>Açık gelir ve faturalar</span></article>
      <article><small>TAHMİNİ NET NAKİT</small><strong>{money(projectedCash)}</strong><span>Planlananlar dahil</span></article>
    </section>
    <section className="finance-insights">
      <article className="panel-card aging-card"><div><small>CARİ YAŞLANDIRMA</small><h3>Alacakların vade dağılımı</h3></div><div className="aging-grid"><span><b>{money(aging.current)}</b><small>Vadesi gelmedi</small></span><span><b>{money(aging.d30)}</b><small>1–30 gün</small></span><span><b>{money(aging.d60)}</b><small>31–60 gün</small></span><span><b>{money(aging.d90)}</b><small>61–90 gün</small></span><span className="risk"><b>{money(aging.over90)}</b><small>90+ gün</small></span></div></article>
      <article className="panel-card due-card"><div><small>YAKLAŞAN VADELER</small><h3>Öncelikli hareketler</h3></div>{upcoming.map((item) => <div className="due-row" key={item.id}><div><b>{item.label}</b><small>{new Date(item.date).toLocaleDateString("tr-TR")}</small></div><strong className={item.type === "expense" ? "negative" : "positive"}>{item.type === "expense" ? "-" : "+"}{money(Number(item.amount))}</strong></div>)}{!upcoming.length ? <p className="finance-empty">Yaklaşan kayıt yok.</p> : null}</article>
    </section>
    {canManage ? <details className="panel-card finance-create" id="new-finance-record"><summary>Yeni gelir veya gider kaydı</summary><form className="panel-form finance-form" action={createFinanceTransaction}>
      <label>Tür<select name="transaction_type" defaultValue="income"><option value="income">Gelir</option><option value="expense">Gider</option></select></label><label>Başlık<input name="title" required minLength={2} maxLength={180} /></label><label>Cari / karşı taraf<input name="counterparty" maxLength={180} /></label><label>Kategori<input name="category" maxLength={120} /></label><label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Vade<input name="due_date" type="date" /></label><label className="wide">Not<textarea name="notes" maxLength={1000} /></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Kaydı oluştur</button></div>
    </form></details> : null}
    <section className="finance-grid"><div className="panel-card finance-list"><header><div><small>HAREKETLER</small><h3>Gelir ve gider kayıtları</h3></div><span className="status-pill">{unmatchedCount} eşleşmeyen</span></header>{items.map((item) => <article key={item.id}><div><span className={"finance-type " + item.transaction_type}>{item.transaction_type === "income" ? "Gelir" : "Gider"}</span><h4>{item.title}</h4><p>{item.counterparty || item.category || "Bilgi yok"}</p></div><div className="finance-amount"><strong>{item.transaction_type === "expense" ? "-" : "+"}{money(Number(item.amount))}</strong><small>{item.due_date ? new Date(item.due_date + "T00:00:00").toLocaleDateString("tr-TR") : "Vade yok"}</small></div>{canManage ? <form action={updateFinanceTransactionStatus}><input type="hidden" name="transaction_id" value={item.id} /><select name="status" defaultValue={item.status}><option value="planned">Planlandı</option><option value="paid">Ödendi</option><option value="canceled">İptal</option></select><button type="submit">Güncelle</button></form> : <span>{statusNames[item.status]}</span>}</article>)}{!items.length ? <p className="finance-empty">Henüz kayıt yok.</p> : null}</div>
      <aside className="panel-card finance-side"><small>BANKA HESAPLARI</small><h3>Aktif hesaplar</h3>{accountList.map((account) => { const moves = bankMoves.filter((move) => move.bank_account_id === account.id); const balance = Number(account.opening_balance ?? 0) + moves.filter((move) => move.direction === "inflow").reduce((sum,move) => sum + Number(move.amount),0) - moves.filter((move) => move.direction === "outflow").reduce((sum,move) => sum + Number(move.amount),0); return <div className="bank-card" key={account.id}><b>{account.bank_name}</b><span>{account.account_name || "Hesap sahibi belirtilmedi"}</span><code>{String(account.iban).replace(/(.{4})/g,"$1 ").trim()}</code><strong>{money(balance)}</strong></div>})}<hr /><small>AÇIK FATURALAR</small><strong>{invoiceItems.filter((item) => item.status === "open").length}</strong><p>Tahsilat bekleyen kayıtlar.</p></aside>
    </section>
  </>;
}
