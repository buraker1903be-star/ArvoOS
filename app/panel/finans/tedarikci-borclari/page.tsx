"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getRolePermissions, type OrganizationMembership } from "@/lib/arvoos-core";
import { getFinanceAccounts, type FinanceAccount } from "@/lib/arvoos-finance";
import { getPurchaseRequests, getSuppliers, type PurchaseRequest, type Supplier } from "@/lib/arvoos-inventory";
import { createSupplierInvoice, getSupplierInvoices, paySupplierInvoice, type SupplierInvoice } from "@/lib/arvoos-payables";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels: Record<SupplierInvoice["status"], string> = {
  open: "Açık",
  partially_paid: "Kısmi ödendi",
  paid: "Ödendi",
  cancelled: "İptal",
};

export default function SupplierPayablesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<SupplierInvoice | null>(null);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) return router.replace("/giris");
    setSession(current);
    void load(current);
  }, [router]);

  async function load(current: SupabaseSession) {
    setLoading(true);
    setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const active = memberships.find((row) => row.organization_id === window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY)) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((row) => row.code));
      if (!codes.has("finance.read")) throw new Error("Tedarikçi borçlarını görüntüleme yetkisi gerekiyor.");
      setMembership(active);
      setCanManage(codes.has("finance.manage"));
      const [invoiceRows, supplierRows, requestRows, accountRows] = await Promise.all([
        getSupplierInvoices(current, active.organization_id),
        getSuppliers(current, active.organization_id),
        getPurchaseRequests(current, active.organization_id),
        getFinanceAccounts(current, active.organization_id),
      ]);
      setInvoices(invoiceRows);
      setSuppliers(supplierRows);
      setRequests(requestRows.filter((row) => ["approved", "ordered", "partially_received", "received"].includes(row.status)));
      setAccounts(accountRows.filter((row) => row.is_active));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Tedarikçi borçları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => invoices.reduce((acc, invoice) => {
    const total = Number(invoice.total_amount);
    const paid = Number(invoice.paid_amount);
    acc.total += total;
    acc.paid += paid;
    if (invoice.status !== "paid" && invoice.status !== "cancelled") acc.open += total - paid;
    if (invoice.due_date && new Date(invoice.due_date) < new Date(new Date().toISOString().slice(0, 10)) && invoice.status !== "paid" && invoice.status !== "cancelled") acc.overdue += total - paid;
    return acc;
  }, { total: 0, paid: 0, open: 0, overdue: 0 }), [invoices]);

  async function handleInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await createSupplierInvoice(session, membership.organization_id, {
        supplier_id: String(form.get("supplier_id") || ""),
        purchase_request_id: String(form.get("purchase_request_id") || "") || null,
        invoice_no: String(form.get("invoice_no") || "").trim(),
        invoice_date: String(form.get("invoice_date") || ""),
        due_date: String(form.get("due_date") || "") || null,
        currency: String(form.get("currency") || "TRY"),
        subtotal: Number(form.get("subtotal") || 0),
        tax_amount: Number(form.get("tax_amount") || 0),
        notes: String(form.get("notes") || ""),
      });
      setInvoiceModal(false);
      setNotice("Tedarikçi faturası kaydedildi.");
      await load(session);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Fatura kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || !paymentInvoice || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await paySupplierInvoice(session, membership.organization_id, {
        invoice_id: paymentInvoice.id,
        account_id: String(form.get("account_id") || ""),
        amount: Number(form.get("amount") || 0),
        payment_date: String(form.get("payment_date") || ""),
        reference_no: String(form.get("reference_no") || ""),
      });
      setPaymentInvoice(null);
      setNotice("Tedarikçi ödemesi finans hareketine işlendi.");
      await load(session);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ödeme kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const money = (value: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value);
  if (loading) return <main className="panel-loading">Tedarikçi borçları yükleniyor...</main>;

  return <main className="panel-content finance-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · FİNANS</small><h1>Tedarikçi borçları</h1><p>Alış faturalarını, vadeleri ve ödemeleri finans hesaplarıyla birlikte yönetin.</p></div><button className="team-back" onClick={() => router.push("/panel/finans")}>Finansa Dön</button></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}
    {notice && <div className="team-notice">{notice}</div>}

    <section className="metric-grid team-metrics">
      <article><small>Toplam fatura</small><b>{money(totals.total)}</b><span>{invoices.length} kayıt</span></article>
      <article><small>Ödenen</small><b>{money(totals.paid)}</b><span>Gerçekleşen ödeme</span></article>
      <article><small>Açık borç</small><b>{money(totals.open)}</b><span>Ödenmesi gereken</span></article>
      <article><small>Vadesi geçen</small><b>{money(totals.overdue)}</b><span>Gecikmiş bakiye</span></article>
    </section>

    <section className="finance-toolbar"><div><button disabled={!canManage} onClick={() => setInvoiceModal(true)}>Yeni Tedarikçi Faturası</button></div></section>

    <section className="finance-table">
      <header><span>Fatura tarihi</span><span>Fatura no</span><span>Tedarikçi</span><span>Vade</span><span>Durum</span><span>Bakiye</span></header>
      {invoices.map((invoice) => {
        const balance = Number(invoice.total_amount) - Number(invoice.paid_amount);
        return <article key={invoice.id}>
          <span>{new Date(invoice.invoice_date).toLocaleDateString("tr-TR")}</span>
          <span><b>{invoice.invoice_no}</b><small>{invoice.purchase_request?.request_no || "Bağımsız fatura"}</small></span>
          <span>{invoice.supplier?.name || "-"}</span>
          <span>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("tr-TR") : "Vade yok"}</span>
          <span>{statusLabels[invoice.status]}</span>
          <strong className="expense">{money(balance, invoice.currency)}{balance > 0 && canManage && <button type="button" onClick={() => setPaymentInvoice(invoice)}>Öde</button>}</strong>
        </article>;
      })}
    </section>
    {invoices.length === 0 && <div className="team-empty">Henüz tedarikçi faturası bulunmuyor.</div>}

    {invoiceModal && <div className="team-modal-backdrop" onMouseDown={() => setInvoiceModal(false)}><section className="team-modal finance-modal" onMouseDown={(event) => event.stopPropagation()}><small>YENİ ALIŞ FATURASI</small><h2>Tedarikçi faturası kaydet</h2><form onSubmit={handleInvoice}><label>Tedarikçi<select name="supplier_id" required><option value="">Seçiniz</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Satın alma talebi<select name="purchase_request_id"><option value="">Bağımsız fatura</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.request_no}</option>)}</select></label><div className="finance-form-grid"><label>Fatura no<input name="invoice_no" required /></label><label>Para birimi<input name="currency" defaultValue="TRY" required /></label></div><div className="finance-form-grid"><label>Fatura tarihi<input name="invoice_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Vade tarihi<input name="due_date" type="date" /></label></div><div className="finance-form-grid"><label>Matrah<input name="subtotal" type="number" min="0.01" step="0.01" required /></label><label>Vergi/KDV<input name="tax_amount" type="number" min="0" step="0.01" defaultValue="0" /></label></div><label>Not<input name="notes" /></label><div className="team-modal-actions"><button type="button" onClick={() => setInvoiceModal(false)}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "Faturayı Kaydet"}</button></div></form></section></div>}

    {paymentInvoice && <div className="team-modal-backdrop" onMouseDown={() => setPaymentInvoice(null)}><section className="team-modal finance-modal" onMouseDown={(event) => event.stopPropagation()}><small>TEDARİKÇİ ÖDEMESİ</small><h2>{paymentInvoice.invoice_no} numaralı faturayı öde</h2><form onSubmit={handlePayment}><label>Finans hesabı<select name="account_id" required><option value="">Seçiniz</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="finance-form-grid"><label>Ödeme tutarı<input name="amount" type="number" min="0.01" max={Number(paymentInvoice.total_amount) - Number(paymentInvoice.paid_amount)} step="0.01" defaultValue={Number(paymentInvoice.total_amount) - Number(paymentInvoice.paid_amount)} required /></label><label>Ödeme tarihi<input name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label></div><label>Referans no<input name="reference_no" /></label><div className="team-modal-actions"><button type="button" onClick={() => setPaymentInvoice(null)}>Vazgeç</button><button disabled={saving || accounts.length === 0}>{saving ? "Kaydediliyor..." : "Ödemeyi Kaydet"}</button></div></form></section></div>}
  </main>;
}
