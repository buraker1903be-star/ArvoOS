"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getCrmCustomers, getMyOrganizations, getRolePermissions, type CrmCustomer, type OrganizationMembership } from "@/lib/arvoos-core";
import { getFinanceAccounts, getFinanceTransactions, saveFinanceAccount, saveFinanceTransaction, type FinanceAccount, type FinanceTransaction } from "@/lib/arvoos-finance";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels: Record<FinanceTransaction["status"], string> = { planned: "Planlandı", pending: "Bekliyor", completed: "Tamamlandı", cancelled: "İptal" };
const typeLabels: Record<FinanceTransaction["transaction_type"], string> = { income: "Gelir", expense: "Gider" };

export default function FinancePage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [accountOpen, setAccountOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) return router.replace("/giris");
    setSession(current);
    void load(current);
  }, [router]);

  async function load(current: SupabaseSession) {
    setLoading(true); setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const activeId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const active = memberships.find((item) => item.organization_id === activeId) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((permission) => permission.code));
      setMembership(active); setCanManage(codes.has("finance.manage"));
      if (!codes.has("finance.read")) return setError("Finans ekranını görüntülemek için finance.read yetkisi gerekiyor.");
      const [accountRows, transactionRows, customerRows] = await Promise.all([
        getFinanceAccounts(current, active.organization_id),
        getFinanceTransactions(current, active.organization_id),
        getCrmCustomers(current, active.organization_id),
      ]);
      setAccounts(accountRows); setTransactions(transactionRows); setCustomers(customerRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Finans verileri yüklenemedi."); }
    finally { setLoading(false); }
  }

  async function handleAccountSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError("");
    try {
      await saveFinanceAccount(session, membership.organization_id, {
        name: String(form.get("name") || "").trim(), code: String(form.get("code") || "").trim().toLowerCase(),
        account_type: String(form.get("accountType") || "cash") as FinanceAccount["account_type"], currency: String(form.get("currency") || "TRY"),
        opening_balance: Number(form.get("openingBalance") || 0), is_active: true,
      });
      setAccountOpen(false); setNotice("Finans hesabı oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Hesap kaydedilemedi."); }
    finally { setSaving(false); }
  }

  async function handleTransactionSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError("");
    try {
      await saveFinanceTransaction(session, membership.organization_id, {
        account_id: String(form.get("accountId") || ""), customer_id: String(form.get("customerId") || "") || null,
        transaction_type: String(form.get("transactionType") || "income") as FinanceTransaction["transaction_type"],
        status: String(form.get("status") || "completed") as FinanceTransaction["status"], category: String(form.get("category") || "").trim(),
        description: String(form.get("description") || "").trim(), amount: Number(form.get("amount") || 0), currency: String(form.get("currency") || "TRY"),
        transaction_date: String(form.get("transactionDate") || new Date().toISOString().slice(0, 10)), due_date: String(form.get("dueDate") || "") || null,
        reference_no: String(form.get("referenceNo") || "").trim() || null,
      });
      setTransactionOpen(false); setNotice("Finans hareketi kaydedildi."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Hareket kaydedilemedi."); }
    finally { setSaving(false); }
  }

  const completed = transactions.filter((item) => item.status === "completed");
  const income = completed.filter((item) => item.transaction_type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
  const expense = completed.filter((item) => item.transaction_type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = transactions.filter((item) => item.status === "pending" || item.status === "planned").reduce((sum, item) => sum + Number(item.amount), 0);
  const filtered = useMemo(() => transactions.filter((item) => {
    const matchesType = typeFilter === "all" || item.transaction_type === typeFilter;
    const text = [item.description, item.category, item.reference_no, item.account?.name, item.customer?.name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
    return matchesType && text.includes(query.trim().toLocaleLowerCase("tr-TR"));
  }), [transactions, query, typeFilter]);
  const money = (value: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);

  if (loading) return <main className="panel-loading">Finans merkezi yükleniyor...</main>;

  return <main className="panel-content finance-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · MALİ OPERASYON</small><h1>Finans merkezi</h1><p>Tahsilatları, giderleri, hesapları ve yaklaşan ödemeleri tek ekrandan yönetin.</p></div><button className="team-back" onClick={() => router.push("/panel")}>Panele Dön</button></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}{notice && <div className="team-notice">{notice}</div>}
    {!error && <>
      <section className="metric-grid team-metrics"><article><small>Tamamlanan gelir</small><b>{money(income)}</b><span>Tahsil edilen</span></article><article><small>Tamamlanan gider</small><b>{money(expense)}</b><span>Ödenen</span></article><article><small>Net nakit hareketi</small><b>{money(income - expense)}</b><span>Gelir eksi gider</span></article><article><small>Bekleyen hareket</small><b>{money(pending)}</b><span>Planlanan ve bekleyen</span></article></section>
      <section className="finance-toolbar"><div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Açıklama, kategori, hesap veya müşteri ara"/><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Tüm hareketler</option><option value="income">Gelirler</option><option value="expense">Giderler</option></select></div><div><button disabled={!canManage} onClick={() => setAccountOpen(true)}>Yeni Hesap</button><button disabled={!canManage || accounts.length === 0} onClick={() => setTransactionOpen(true)}>Yeni Hareket</button></div></section>
      {accounts.length === 0 && <div className="finance-hint">İlk finans hareketini eklemek için önce kasa, banka veya POS hesabı oluşturun.</div>}
      <section className="finance-table"><header><span>Tarih</span><span>Tür</span><span>Açıklama</span><span>Hesap</span><span>Durum</span><span>Tutar</span></header>{filtered.map((item) => <article key={item.id}><span>{new Date(item.transaction_date).toLocaleDateString("tr-TR")}</span><span className={`finance-type ${item.transaction_type}`}>{typeLabels[item.transaction_type]}</span><span><b>{item.description}</b><small>{item.category}{item.customer?.name ? ` · ${item.customer.name}` : ""}</small></span><span>{item.account?.name || "-"}</span><span>{statusLabels[item.status]}</span><strong className={item.transaction_type}>{item.transaction_type === "expense" ? "-" : "+"}{money(Number(item.amount), item.currency)}</strong></article>)}</section>
      {filtered.length === 0 && <div className="team-empty">Bu filtreye uygun finans hareketi bulunamadı.</div>}
    </>}
    {(accountOpen || transactionOpen) && <div className="team-modal-backdrop" onMouseDown={() => { setAccountOpen(false); setTransactionOpen(false); }}><section className="team-modal finance-modal" onMouseDown={(e) => e.stopPropagation()}><small>{accountOpen ? "YENİ FİNANS HESABI" : "YENİ FİNANS HAREKETİ"}</small><h2>{accountOpen ? "Kasa veya banka hesabı oluştur" : "Gelir veya gider kaydet"}</h2>{accountOpen ? <form onSubmit={handleAccountSave}><label>Hesap adı<input name="name" required placeholder="Ana Banka Hesabı"/></label><div className="finance-form-grid"><label>Hesap kodu<input name="code" required placeholder="banka-01"/></label><label>Hesap türü<select name="accountType"><option value="cash">Kasa</option><option value="bank">Banka</option><option value="pos">POS</option><option value="other">Diğer</option></select></label></div><div className="finance-form-grid"><label>Para birimi<input name="currency" defaultValue="TRY" required/></label><label>Açılış bakiyesi<input name="openingBalance" type="number" step="0.01" defaultValue="0"/></label></div><div className="team-modal-actions"><button type="button" onClick={() => setAccountOpen(false)}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "Hesabı Oluştur"}</button></div></form> : <form onSubmit={handleTransactionSave}><div className="finance-form-grid"><label>Tür<select name="transactionType"><option value="income">Gelir</option><option value="expense">Gider</option></select></label><label>Durum<select name="status" defaultValue="completed">{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label></div><label>Hesap<select name="accountId" required>{accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Müşteri<select name="customerId"><option value="">Müşteri seçilmedi</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="finance-form-grid"><label>Kategori<input name="category" required placeholder="Satış tahsilatı"/></label><label>Tutar<input name="amount" type="number" step="0.01" min="0.01" required/></label></div><label>Açıklama<input name="description" required/></label><div className="finance-form-grid"><label>İşlem tarihi<input name="transactionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required/></label><label>Vade tarihi<input name="dueDate" type="date"/></label></div><div className="finance-form-grid"><label>Referans no<input name="referenceNo"/></label><label>Para birimi<input name="currency" defaultValue="TRY" required/></label></div><div className="team-modal-actions"><button type="button" onClick={() => setTransactionOpen(false)}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "Hareketi Kaydet"}</button></div></form>}</section></div>}
  </main>;
}