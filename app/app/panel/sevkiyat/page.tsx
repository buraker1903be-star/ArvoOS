"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getRolePermissions, type OrganizationMembership } from "@/lib/arvoos-core";
import { getWarehouses, type Warehouse } from "@/lib/arvoos-inventory";
import { getSalesOrders, type SalesOrder } from "@/lib/arvoos-sales";
import { createSalesShipment, getSalesShipments, setSalesShipmentStatus, type SalesShipment } from "@/lib/arvoos-shipping";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels: Record<SalesShipment["status"], string> = {
  draft: "Taslak",
  ready: "Hazır",
  shipped: "Sevk edildi",
  cancelled: "İptal",
};

export default function ShippingPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [shipments, setShipments] = useState<SalesShipment[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      if (!codes.has("shipping.read")) throw new Error("Sevkiyatları görüntülemek için shipping.read yetkisi gerekiyor.");

      setMembership(active);
      setCanManage(codes.has("shipping.manage"));
      const [shipmentRows, orderRows, warehouseRows] = await Promise.all([
        getSalesShipments(current, active.organization_id),
        getSalesOrders(current, active.organization_id),
        getWarehouses(current, active.organization_id),
      ]);
      setShipments(shipmentRows);
      setOrders(orderRows.filter((row) => row.status === "confirmed" || row.status === "partially_fulfilled"));
      setWarehouses(warehouseRows.filter((row) => row.is_active));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Sevkiyat verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await createSalesShipment(session, membership.organization_id, {
        sales_order_id: String(form.get("sales_order_id") || ""),
        warehouse_id: String(form.get("warehouse_id") || ""),
        shipment_no: String(form.get("shipment_no") || "").trim(),
        shipment_date: String(form.get("shipment_date") || new Date().toISOString().slice(0, 10)),
        tracking_no: String(form.get("tracking_no") || "").trim(),
        carrier_name: String(form.get("carrier_name") || "").trim(),
        notes: String(form.get("notes") || "").trim(),
        sales_order_item_id: String(form.get("sales_order_item_id") || ""),
        quantity: Number(form.get("quantity") || 0),
      });
      setModalOpen(false);
      setSelectedOrderId("");
      setNotice("Sevkiyat emri oluşturuldu.");
      await load(session);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Sevkiyat oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: SalesShipment["status"]) {
    if (!session || !membership || saving) return;
    setSaving(true);
    setError("");
    try {
      await setSalesShipmentStatus(session, membership.organization_id, id, status);
      setNotice(`Sevkiyat durumu: ${statusLabels[status]}`);
      await load(session);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Sevkiyat durumu değiştirilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const selectedOrder = orders.find((row) => row.id === selectedOrderId) || null;
  const selectableItems = selectedOrder?.items.filter((item) => item.item_id && Number(item.fulfilled_quantity) < Number(item.quantity)) || [];
  const filtered = useMemo(() => shipments.filter((shipment) => {
    const matchesStatus = statusFilter === "all" || shipment.status === statusFilter;
    const text = [shipment.shipment_no, shipment.order?.order_no, shipment.order?.customer?.name, shipment.warehouse?.name, shipment.tracking_no, shipment.carrier_name]
      .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
    return matchesStatus && text.includes(query.trim().toLocaleLowerCase("tr-TR"));
  }), [shipments, query, statusFilter]);

  const draftCount = shipments.filter((row) => row.status === "draft").length;
  const readyCount = shipments.filter((row) => row.status === "ready").length;
  const shippedToday = shipments.filter((row) => row.status === "shipped" && row.shipment_date === new Date().toISOString().slice(0, 10)).length;
  const openOrderCount = orders.length;

  if (loading) return <main className="panel-loading">Sevkiyat operasyonları yükleniyor...</main>;

  return <main className="panel-content shipping-page">
    <header className="panel-header">
      <div>
        <small>{membership?.organization.name.toUpperCase()} · DEPO VE LOJİSTİK</small>
        <h1>Sevkiyat operasyon merkezi</h1>
        <p>Onaylı siparişleri depodan hazırlayın, stok çıkışını yapın ve teslimat sürecini takip edin.</p>
      </div>
    </header>

    {error && <div className="panel-error panel-error-wide">{error}</div>}
    {notice && <div className="team-notice">{notice}</div>}

    <section className="metric-grid team-metrics">
      <article><small>Taslak sevkiyat</small><b>{draftCount}</b><span>Hazırlanmayı bekliyor</span></article>
      <article><small>Sevke hazır</small><b>{readyCount}</b><span>Depo çıkışı bekliyor</span></article>
      <article><small>Bugün sevk edilen</small><b>{shippedToday}</b><span>Tamamlanan çıkış</span></article>
      <article><small>Açık satış siparişi</small><b>{openOrderCount}</b><span>Sevkiyata uygun</span></article>
    </section>

    <section className="shipping-toolbar">
      <div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sevkiyat, sipariş, müşteri veya takip no ara" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Tüm durumlar</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <button disabled={!canManage || orders.length === 0 || warehouses.length === 0} onClick={() => setModalOpen(true)}>Yeni Sevkiyat</button>
    </section>

    {(orders.length === 0 || warehouses.length === 0) && <div className="finance-hint">
      Yeni sevkiyat için onaylı bir satış siparişi ve aktif bir depo bulunmalıdır.
    </div>}

    <section className="shipping-list">
      {filtered.map((shipment) => <article key={shipment.id} className="shipping-card">
        <div className="shipping-card-main">
          <span className={`shipping-status status-${shipment.status}`}>{statusLabels[shipment.status]}</span>
          <h2>{shipment.shipment_no}</h2>
          <p>{shipment.order?.customer?.name || "Müşteri bulunamadı"}</p>
          <small>{shipment.order?.order_no || "Sipariş yok"} · {shipment.warehouse?.name || "Depo yok"}</small>
        </div>
        <div className="shipping-card-meta">
          <b>{new Date(shipment.shipment_date).toLocaleDateString("tr-TR")}</b>
          <small>{shipment.carrier_name || "Taşıyıcı belirtilmedi"}</small>
          <small>{shipment.tracking_no || "Takip no yok"}</small>
        </div>
        <div className="shipping-items">
          {shipment.items.map((line) => <span key={line.id}>{line.item?.name || line.order_item?.description || "Ürün"} · {Number(line.quantity).toLocaleString("tr-TR")} {line.item?.unit || line.order_item?.unit}</span>)}
        </div>
        <div className="shipping-actions">
          {shipment.status === "draft" && canManage && <>
            <button disabled={saving} onClick={() => void changeStatus(shipment.id, "ready")}>Hazırla</button>
            <button className="danger" disabled={saving} onClick={() => void changeStatus(shipment.id, "cancelled")}>İptal</button>
          </>}
          {shipment.status === "ready" && canManage && <button disabled={saving} onClick={() => void changeStatus(shipment.id, "shipped")}>Depodan Çıkar ve Sevk Et</button>}
        </div>
      </article>)}
      {filtered.length === 0 && <div className="team-empty">Bu filtreye uygun sevkiyat bulunamadı.</div>}
    </section>

    {modalOpen && <div className="team-modal-backdrop" onMouseDown={() => setModalOpen(false)}>
      <section className="team-modal shipping-modal" onMouseDown={(event) => event.stopPropagation()}>
        <small>YENİ SEVKİYAT EMRİ</small>
        <h2>Siparişten sevkiyat oluştur</h2>
        <form onSubmit={handleCreate}>
          <label>Satış siparişi
            <select name="sales_order_id" required value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
              <option value="">Sipariş seçiniz</option>
              {orders.map((order) => <option key={order.id} value={order.id}>{order.order_no} · {order.customer?.name}</option>)}
            </select>
          </label>
          <label>Sipariş kalemi
            <select name="sales_order_item_id" required disabled={!selectedOrder}>
              <option value="">Kalem seçiniz</option>
              {selectableItems.map((item) => <option key={item.id} value={item.id}>{item.description} · Kalan {(Number(item.quantity) - Number(item.fulfilled_quantity)).toLocaleString("tr-TR")} {item.unit}</option>)}
            </select>
          </label>
          <div className="shipping-form-grid">
            <label>Depo<select name="warehouse_id" required><option value="">Depo seçiniz</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}</select></label>
            <label>Miktar<input name="quantity" type="number" min="0.001" step="0.001" required /></label>
          </div>
          <div className="shipping-form-grid">
            <label>Sevkiyat no<input name="shipment_no" required defaultValue={`SVK-${new Date().getFullYear()}-`} /></label>
            <label>Sevkiyat tarihi<input name="shipment_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          </div>
          <div className="shipping-form-grid">
            <label>Taşıyıcı<input name="carrier_name" placeholder="Kargo / Nakliye firması" /></label>
            <label>Takip no<input name="tracking_no" /></label>
          </div>
          <label>Not<input name="notes" /></label>
          <div className="team-modal-actions">
            <button type="button" onClick={() => setModalOpen(false)}>Vazgeç</button>
            <button disabled={saving}>{saving ? "Kaydediliyor..." : "Sevkiyat Oluştur"}</button>
          </div>
        </form>
      </section>
    </div>}
  </main>;
}
