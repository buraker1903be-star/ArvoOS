"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getRolePermissions, type OrganizationMembership } from "@/lib/arvoos-core";
import { createPurchaseRequest, getInventoryItems, getPurchaseRequests, getSuppliers, saveSupplier, setPurchaseRequestStatus, type InventoryItem, type PurchaseRequest, type Supplier } from "@/lib/arvoos-inventory";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels: Record<PurchaseRequest["status"], string> = {
  draft: "Taslak", submitted: "Onay bekliyor", approved: "Onaylandı", rejected: "Reddedildi",
  ordered: "Sipariş verildi", partially_received: "Kısmi teslim", received: "Teslim alındı", cancelled: "İptal",
};

export default function PurchasingPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supplierModal, setSupplierModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) return router.replace("/giris");
    setSession(current); void load(current);
  }, [router]);

  async function load(current: SupabaseSession) {
    setLoading(true); setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const active = memberships.find((row) => row.organization_id === window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY)) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((row) => row.code));
      if (!codes.has("purchasing.read")) throw new Error("Satın alma modülünü görüntüleme yetkisi gerekiyor.");
      setMembership(active); setCanManage(codes.has("purchasing.manage")); setCanApprove(codes.has("purchasing.approve"));
      const [supplierRows, itemRows, requestRows] = await Promise.all([
        getSuppliers(current, active.organization_id), getInventoryItems(current, active.organization_id), getPurchaseRequests(current, active.organization_id),
      ]);
      setSuppliers(supplierRows); setItems(itemRows); setRequests(requestRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Satın alma verileri yüklenemedi."); }
    finally { setLoading(false); }
  }

  const pendingCount = useMemo(() => requests.filter((row) => row.status === "submitted").length, [requests]);
  const approvedValue = useMemo(() => requests.filter((row) => ["approved", "ordered", "partially_received", "received"].includes(row.status)).reduce((sum, row) => sum + row.items.reduce((lineSum, item) => lineSum + Number(item.quantity) * Number(item.unit_price), 0), 0), [requests]);

  async function handleSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership) return;
    const form = new FormData(event.currentTarget);
    try {
      await saveSupplier(session, membership.organization_id, {
        name: String(form.get("name") || "").trim(), tax_number: String(form.get("tax_number") || "") || null,
        tax_office: String(form.get("tax_office") || "") || null, contact_name: String(form.get("contact_name") || "") || null,
        email: String(form.get("email") || "") || null, phone: String(form.get("phone") || "") || null,
        city: String(form.get("city") || "") || null, address: String(form.get("address") || "") || null,
        payment_terms: String(form.get("payment_terms") || "") || null, is_active: true,
      });
      setSupplierModal(false); setNotice("Tedarikçi kartı oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Tedarikçi kaydedilemedi."); }
  }

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership) return;
    const form = new FormData(event.currentTarget);
    const selectedItem = items.find((row) => row.id === String(form.get("item_id")));
    try {
      await createPurchaseRequest(session, membership.organization_id, session.user.id, {
        request_no: String(form.get("request_no") || "").trim(), supplier_id: String(form.get("supplier_id") || "") || null,
        requested_date: String(form.get("requested_date")), needed_date: String(form.get("needed_date") || "") || null,
        currency: String(form.get("currency") || "TRY"), notes: String(form.get("notes") || ""),
        item: { item_id: selectedItem?.id || null, description: String(form.get("description") || selectedItem?.name || "").trim(), quantity: Number(form.get("quantity") || 0), unit: String(form.get("unit") || selectedItem?.unit || "adet"), unit_price: Number(form.get("unit_price") || 0) },
      });
      setRequestModal(false); setNotice("Satın alma talebi taslak olarak oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Talep oluşturulamadı."); }
  }

  async function changeStatus(requestId: string, status: PurchaseRequest["status"]) {
    if (!session || !membership) return;
    try { await setPurchaseRequestStatus(session, membership.organization_id, requestId, status); setNotice(`Talep durumu: ${statusLabels[status]}`); await load(session); }
    catch (statusError) { setError(statusError instanceof Error ? statusError.message : "Durum değiştirilemedi."); }
  }

  if (loading) return <main className="panel-loading">Satın alma yönetimi yükleniyor...</main>;

  return <main className="panel-content inventory-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · SATIN ALMA</small><h1>Satın alma ve tedarikçi yönetimi</h1><p>Talep, onay, sipariş ve teslimat sürecini uçtan uca yönetin.</p></div></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}
    {notice && <div className="panel-success panel-error-wide">{notice}</div>}

    <section className="metric-grid team-metrics">
      <article><small>Tedarikçi</small><b>{suppliers.length}</b><span>Aktif kart</span></article>
      <article><small>Toplam talep</small><b>{requests.length}</b><span>Tüm dönem</span></article>
      <article><small>Onay bekleyen</small><b>{pendingCount}</b><span>İşlem gerekli</span></article>
      <article><small>Onaylı hacim</small><b>{approvedValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺</b><span>Talep kalemleri</span></article>
    </section>

    <section className="inventory-actions"><button disabled={!canManage} onClick={() => setSupplierModal(true)}>Yeni Tedarikçi</button><button disabled={!canManage} onClick={() => setRequestModal(true)}>Yeni Satın Alma Talebi</button></section>

    <section className="inventory-layout purchasing-layout">
      <article className="inventory-card"><div className="inventory-card-head"><div><small>TEDARİKÇİ AĞI</small><h2>Tedarikçiler</h2></div></div><div className="supplier-grid">{suppliers.map((supplier) => <div key={supplier.id}><b>{supplier.name}</b><span>{supplier.contact_name || "Yetkili belirtilmedi"}</span><small>{supplier.phone || "Telefon yok"} · {supplier.city || "Şehir yok"}</small></div>)}{suppliers.length === 0 && <p className="inventory-empty">Henüz tedarikçi yok.</p>}</div></article>
      <article className="inventory-card"><div className="inventory-card-head"><div><small>TALEP AKIŞI</small><h2>Satın alma talepleri</h2></div></div><div className="purchase-list">{requests.map((request) => {
        const total = request.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
        return <div key={request.id} className="purchase-row"><div><span className={`purchase-status status-${request.status}`}>{statusLabels[request.status]}</span><b>{request.request_no}</b><small>{request.supplier?.name || "Tedarikçi seçilmedi"} · {new Date(request.requested_date).toLocaleDateString("tr-TR")}</small></div><div className="purchase-total"><b>{total.toLocaleString("tr-TR")} {request.currency}</b><small>{request.items.length} kalem</small></div><div className="purchase-actions">{request.status === "draft" && canManage && <button onClick={() => void changeStatus(request.id, "submitted")}>Onaya Gönder</button>}{request.status === "submitted" && canApprove && <><button onClick={() => void changeStatus(request.id, "approved")}>Onayla</button><button className="danger" onClick={() => void changeStatus(request.id, "rejected")}>Reddet</button></>}{request.status === "approved" && canManage && <button onClick={() => void changeStatus(request.id, "ordered")}>Sipariş Verildi</button>}{request.status === "ordered" && canManage && <button onClick={() => void changeStatus(request.id, "received")}>Teslim Alındı</button>}</div></div>;
      })}{requests.length === 0 && <p className="inventory-empty">Henüz satın alma talebi yok.</p>}</div></article>
    </section>

    {supplierModal && <Modal title="Yeni tedarikçi" onClose={() => setSupplierModal(false)}><form onSubmit={handleSupplier} className="inventory-form"><label>Tedarikçi adı<input name="name" required /></label><label>Yetkili kişi<input name="contact_name" /></label><label>Vergi no<input name="tax_number" /></label><label>Vergi dairesi<input name="tax_office" /></label><label>E-posta<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label><label>Şehir<input name="city" /></label><label>Ödeme koşulu<input name="payment_terms" /></label><label className="wide">Adres<input name="address" /></label><button type="submit">Tedarikçiyi Kaydet</button></form></Modal>}
    {requestModal && <Modal title="Yeni satın alma talebi" onClose={() => setRequestModal(false)}><form onSubmit={handleRequest} className="inventory-form"><label>Talep no<input name="request_no" required defaultValue={`SAT-${new Date().getFullYear()}-`} /></label><label>Tedarikçi<select name="supplier_id"><option value="">Seçiniz</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Talep tarihi<input name="requested_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>İhtiyaç tarihi<input name="needed_date" type="date" /></label><label>Ürün/hizmet<select name="item_id"><option value="">Serbest açıklama</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label><label>Açıklama<input name="description" required /></label><label>Miktar<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Birim<input name="unit" defaultValue="adet" /></label><label>Birim fiyat<input name="unit_price" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Para birimi<input name="currency" defaultValue="TRY" /></label><label className="wide">Not<input name="notes" /></label><button type="submit">Talebi Oluştur</button></form></Modal>}
  </main>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="team-modal-backdrop" onMouseDown={onClose}><section className="team-modal inventory-modal" onMouseDown={(event) => event.stopPropagation()}><div className="inventory-modal-head"><h2>{title}</h2><button type="button" onClick={onClose}>×</button></div>{children}</section></div>;
}
