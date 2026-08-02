import { getPanelContext } from "@/lib/panel-context";
import { createFinanceTransaction, updateFinanceTransactionStatus } from "./actions";
import "./finance.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const statusNames: Record<string,string> = { planned: "Planlandı", paid: "Ödendi", canceled: "İptal" };

type Transaction = {
  id: string; transaction_type: "income"|"expense"; status: string; title: string;
  counterparty: string|null; category: string|null; amount: number; due_date: string|null; created_at: string;
};

export default async function FinancePage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "finance")) throw new Error("Finans modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;

  const [{ data: transactions, error }, { data: invoices }, { data: bankAccounts }] = await Promise.all([
    supabase.from("finance_transactions").select("id,transaction_type,status,title,counterparty,category,amount,due_date,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("billing_invoices").select("id,status,total,due_at,paid_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("platform_bank_accounts").select("id,bank_name,account_holder,iban,currency").eq("is_active", true).order("sort_order"),
  ]);
  if (error) throw new Error("Finans kayıtları okunamadı: " + error.message);

  const items = (transactions ?? []) as Transaction[];
  const paidIncome = items.filter((item) => item.transaction_type === "income" && item.status === "paid").reduce((sum,item) => sum + Number(item.amount),0)
    + (invoices ?? []).filter((item) => item.status === "paid").reduce((sum,item) => sum + Number(item.total ?? 0),0);
  const paidExpense = items.filter((item) => item.transaction_type === "expense" && item.status === "paid").reduce((sum,item) => sum + Number(item.amount),0);
  const expectedIncome = items.filter((item) => item.transaction_type === "income" && item.status === "planned").reduce((sum,item) => sum + Number(item.amount),0)
    + (invoices ?? []).filter((item) => item.status === "open").reduce((sum,item) => sum + Number(item.total ?? 0),0);
  const expectedExpense = items.filter((item) => item.transaction_type === "expense" && item.status === "planned").reduce((sum,item) => sum + Number(item.amount),0);
  const canManage = ["owner","admin"].includes(membership.role);

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">FİNANS MERKEZİ</small><h1>Nakit akışını tek ekranda yönetin</h1><p>Gelir, gider, açık tahsilat ve banka bilgilerini kurum bazında izleyin.</p></div><span className="status-pill">{items.length} manuel kayıt</span></div>

    <section className="finance-metrics">
      <article><small>TAHSİL EDİLEN</small><strong>{money(paidIncome)}</strong><span>Ödenmiş gelir ve faturalar</span></article>
      <article><small>ÖDENEN GİDER</small><strong>{money(paidExpense)}</strong><span>Gerçekleşen çıkışlar</span></article>
      <article><small>BEKLENEN TAHSİLAT</small><strong>{money(expectedIncome)}</strong><span>Açık gelir ve faturalar</span></article>
      <article><small>TAHMİNİ NET NAKİT</small><strong>{money(paidIncome - paidExpense + expectedIncome - expectedExpense)}</strong><span>Planlanan hareketler dahil</span></article>
    </section>

    {canManage ? <section className="panel-card finance-create"><div><small>YENİ HAREKET</small><h3>Gelir veya gider kaydı oluştur</h3></div><form className="panel-form finance-form" action={createFinanceTransaction}>
      <label>Tür<select name="transaction_type" defaultValue="income"><option value="income">Gelir</option><option value="expense">Gider</option></select></label>
      <label>Başlık<input name="title" required minLength={2} maxLength={180} placeholder="Örn. Ağustos kira gideri" /></label>
      <label>Cari / karşı taraf<input name="counterparty" maxLength={180} /></label>
      <label>Kategori<input name="category" maxLength={120} placeholder="Satış, kira, yazılım..." /></label>
      <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label>Vade<input name="due_date" type="date" /></label>
      <label className="wide">Not<textarea name="notes" maxLength={1000} /></label>
      <button className="panel-primary" type="submit">Kaydı oluştur</button>
    </form></section> : null}

    <section className="finance-grid">
      <div className="panel-card finance-list"><header><div><small>NAKİT HAREKETLERİ</small><h3>Gelir ve gider kayıtları</h3></div></header>{items.map((item) => <article key={item.id}><div><span className={"finance-type " + item.transaction_type}>{item.transaction_type === "income" ? "Gelir" : "Gider"}</span><h4>{item.title}</h4><p>{item.counterparty || item.category || "Karşı taraf belirtilmedi"}</p></div><div className="finance-amount"><strong>{item.transaction_type === "expense" ? "-" : "+"}{money(Number(item.amount))}</strong><small>{item.due_date ? new Date(item.due_date + "T00:00:00").toLocaleDateString("tr-TR") : "Vade yok"}</small></div>{canManage ? <form action={updateFinanceTransactionStatus}><input type="hidden" name="transaction_id" value={item.id} /><select name="status" defaultValue={item.status}><option value="planned">Planlandı</option><option value="paid">Ödendi</option><option value="canceled">İptal</option></select><button type="submit">Güncelle</button></form> : <span>{statusNames[item.status]}</span>}</article>)}{!items.length ? <p className="finance-empty">Henüz manuel finans kaydı yok.</p> : null}</div>

      <aside className="panel-card finance-side"><small>BANKA HESAPLARI</small><h3>Aktif tahsilat hesapları</h3>{(bankAccounts ?? []).map((account) => <div className="bank-card" key={account.id}><b>{account.bank_name}</b><span>{account.account_holder || "ArvoOS"}</span><code>{String(account.iban).replace(/(.{4})/g,"$1 ").trim()}</code></div>)}<hr /><small>AÇIK FATURALAR</small><strong>{(invoices ?? []).filter((item) => item.status === "open").length}</strong><p>CRM ve abonelik akışından oluşan tahsilat kayıtları.</p></aside>
    </section>
  </>;
}
