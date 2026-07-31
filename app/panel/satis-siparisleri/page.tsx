"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getCrmCustomers, getMyOrganizations, getRolePermissions, type CrmCustomer, type OrganizationMembership } from "@/lib/arvoos-core";
import { getInventoryItems, type InventoryItem } from "@/lib/arvoos-inventory";
import { createSalesOrder, getSalesOrders, setSalesOrderStatus, type SalesOrder } from "@/lib/arvoos-sales";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels: Record<SalesOrder["status"], string> = { draft: "Taslak", confirmed: "Onaylandı", partially_fulfilled: "Kısmi teslim", fulfilled: "Tamamlandı", cancelled: "İptal" };

export default function SalesOrdersPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { const current = getStoredSession(); if (!current) return router.replace("/giris"); setSession(current); void load(current); }, [router]);

  async function load(current: SupabaseSession) {
    setLoading(true); setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const active = memberships.find((row) => row.organization_id === window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY)) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((row) => row.code));
      if (!codes.has("sales.read")) throw new Error("Satış siparişlerini görüntüleme yetkisi gerekiyor.");
      setMembership(active); setCanManage(codes.has("sales.manage"));
      const [customerRows, itemRows, orderRows] = await Promise.all([
        getCrmCustomers(current, active.organization_id), getInventoryItems(current, active.organization_id), getSalesOrders(current, active.organization_id),
      ]);
      setCustomers(customerRows); setItems(itemRows); setOrders(orderRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Satış siparişleri yüklenemedi."); }
    finally { setLoading(false); }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError("");
    try {
      const selectedItem = items.find((row) => row.id === String(form.get("item_id") || ""));
      await createSalesOrder(session, membership.organization_id, {
        customer_id: String(form.get("customer_id") || ""), order_no: String(form.get("order_no") || "").trim(),
        order_date: String(form.get("order_date") || new Date().toISOString().slice(0,10)), expected_delivery_date: String(form.get("expected_delivery_date") || "") || null,
        currency: String(form.get("currency") || "TRY"), notes: String(form.get("notes") || ""), item_id: selectedItem?.id || null,
        description: String(form.get("description") || selectedItem?.name || "").trim(), quantity: Number(form.get("quantity") || 0),
        unit: String(form.get("unit") || selectedItem?.unit || "adet"), unit_price: Number(form.get("unit_price") || selectedItem?.sale_price || 0), tax_rate: Number(form.get("tax_rate") || 20),
      });
      setModalOpen(false); setNotice("Satış siparişi oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Sipariş oluşturulamadı."); }
    finally { setSaving(false); }
  }

  async function changeStatus(id: string, status: SalesOrder["status"]) {
    if (!session || !membership) return;
    try { await setSalesOrderStatus(session, membership.organization_id, id, status); setNotice(`Sipariş durumu: ${statusLabels[status]}`); await load(session); }
    catch (statusError) { setError(statusError instanceof Error ? statusError.message : "Durum değiştirilemedi."); }
  }

  const openOrders = useMemo(() => orders.filter((row) => ["draft","confirmed","partially_fulfilled"].includes(row.status)).length, [orders]);
  const confirmedValue = useMemo(() => orders.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + row.items.reduce((lineSum, item) => lineSum + Number(item.quantity) * Number(item.unit_price) * (1 + Number(item.tax_rate) / 100), 0), 0), [orders]);
  const dueSoon = useMemo(() => orders.filter((row) => row.expected_delivery_date && row.status !== "fulfilled" && row.status !== "cancelled" && new Date(row.expected_delivery_date).getTime() <= Date.now() + 7 * 86400000).length, [orders]);

  if (loading) return <main className="panel-loading">Satış siparişleri yükleniyor...</main>;

  return <main className="panel-content sales-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · SATIŞ OPERASYONU</small><h1>Satış siparişleri</h1><p>Müşteri siparişlerini, teslim tarihlerini ve satış hacmini yönetin.</p></div><button className="team-back" onClick={() => router.push("/panel")}>Panele Dön</button></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}{notice && <div className="team-notice">{notice}</div>}
    <section className="metric-grid team-metrics"><article><small>Toplam sipariş</small><b>{orders.length}</b><span>Tüm dönem</span></article><article><small>Açık sipariş</small><b>{openOrders}</b><span>Takip gerekiyor</span></article><article><small>7 gün içinde teslim</small><b>{dueSoon}</b><span>Yaklaşan plan</span></article><article><small>Sipariş hacmi</small><b>{confirmedValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺</b><span>KDV dahil</span></article></section>
    <section className="sales-toolbar"><button disabled={!canManage || customers.length === 0} onClick={() => setModalOpen(true)}>Yeni Satış Siparişi</button></section>
    {customers.length === 0 && <div className="finance-hint">Sipariş oluşturmak için önce CRM modülünde müşteri kartı oluşturun.</div>}
    <section className="sales-list">{orders.map((order) => {
      const total = order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price) * (1 + Number(item.tax_rate) / 100), 0);
      return <article key={order.id} className="sales-order-card"><div><span className={`sales-status status-${order.status}`}>{statusLabels[order.status]}</span><h2>{order.order_no}</h2><p>{order.customer?.name || "Müşteri bulunamadı"}</p><small>{new Date(order.order_date).toLocaleDateString("tr-TR")}{order.expected_delivery_date ? ` · Teslim: ${new Date(order.expected_delivery_date).toLocaleDateString("tr-TR")}` : ""}</small></div><div><b>{total.toLocaleString("tr-TR")} {order.currency}</b><small>{order.items.length} kalem</small></div><div className="sales-actions">{order.status === "draft" && canManage && <><button onClick={() => void changeStatus(order.id,"confirmed")}>Onayla</button><button className="danger" onClick={() => void changeStatus(order.id,"cancelled")}>İptal</button></>}{order.status === "confirmed" && canManage && <button className="danger" onClick={() => void changeStatus(order.id,"cancelled")}>İptal</button>}</div></article>;
    })}{orders.length === 0 && <div className="team-empty">Henüz satış siparişi yok.</div>}</section>
    {modalOpen && <div className="team-modal-backdrop" onMouseDown={() => setModalOpen(false)}><section className="team-modal sales-modal" onMouseDown={(e) => e.stopPropagation()}><small>YENİ SATIŞ SİPARİŞİ</small><h2>Müşteri siparişi oluştur</h2><form onSubmit={handleCreate}><label>Müşteri<select name="customer_id" required><option value="">Seçiniz</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><div className="sales-form-grid"><label>Sipariş no<input name="order_no" required defaultValue={`SIP-${new Date().getFullYear()}-`} /></label><label>Sipariş tarihi<input name="order_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></label></div><div className="sales-form-grid"><label>Beklenen teslim<input name="expected_delivery_date" type="date" /></label><label>Para birimi<input name="currency" defaultValue="TRY" /></label></div><label>Ürün / hizmet<select name="item_id"><option value="">Serbest açıklama</option>{items.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label><label>Açıklama<input name="description" required /></label><div className="sales-form-grid"><label>Miktar<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Birim<input name="unit" defaultValue="adet" /></label></div><div className="sales-form-grid"><label>Birim fiyat<input name="unit_price" type="number" min="0" step="0.01" required /></label><label>KDV oranı<input name="tax_rate" type="number" min="0" step="0.01" defaultValue="20" /></label></div><label>Not<input name="notes" /></label><div className="team-modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "Siparişi Oluştur"}</button></div></form></section></div>}
  </main>;
}
