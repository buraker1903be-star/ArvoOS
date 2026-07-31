"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getRolePermissions, type OrganizationMembership } from "@/lib/arvoos-core";
import { getInventoryBalances, getInventoryItems, getStockMovements, getWarehouses, recordStockMovement, saveInventoryItem, saveWarehouse, type InventoryBalance, type InventoryItem, type StockMovement, type Warehouse } from "@/lib/arvoos-inventory";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

export default function StockPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [itemModal, setItemModal] = useState(false);
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [movementModal, setMovementModal] = useState(false);

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
      const active = memberships.find((row) => row.organization_id === window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY)) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((row) => row.code));
      if (!codes.has("inventory.read")) throw new Error("Stok modülünü görüntüleme yetkisi gerekiyor.");
      setMembership(active); setCanManage(codes.has("inventory.manage"));
      const [itemRows, warehouseRows, balanceRows, movementRows] = await Promise.all([
        getInventoryItems(current, active.organization_id), getWarehouses(current, active.organization_id),
        getInventoryBalances(current, active.organization_id), getStockMovements(current, active.organization_id),
      ]);
      setItems(itemRows); setWarehouses(warehouseRows); setBalances(balanceRows); setMovements(movementRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Stok verileri yüklenemedi."); }
    finally { setLoading(false); }
  }

  const lowStock = useMemo(() => balances.filter((row) => row.item && row.item.item_type === "product" && Number(row.quantity) <= Number(row.item.minimum_stock)), [balances]);
  const totalQuantity = useMemo(() => balances.reduce((sum, row) => sum + Number(row.quantity), 0), [balances]);

  async function handleItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership) return;
    const form = new FormData(event.currentTarget);
    try {
      await saveInventoryItem(session, membership.organization_id, {
        item_type: String(form.get("item_type")) as InventoryItem["item_type"], name: String(form.get("name") || "").trim(),
        sku: String(form.get("sku") || "").trim(), barcode: String(form.get("barcode") || "") || null,
        unit: String(form.get("unit") || "adet"), category: String(form.get("category") || "") || null,
        purchase_price: Number(form.get("purchase_price") || 0), sale_price: Number(form.get("sale_price") || 0),
        currency: String(form.get("currency") || "TRY"), minimum_stock: Number(form.get("minimum_stock") || 0), is_active: true,
      });
      setItemModal(false); setNotice("Ürün/hizmet kartı oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Kart kaydedilemedi."); }
  }

  async function handleWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership) return;
    const form = new FormData(event.currentTarget);
    try {
      await saveWarehouse(session, membership.organization_id, { name: String(form.get("name") || "").trim(), code: String(form.get("code") || "").trim(), location: String(form.get("location") || "") || null, is_active: true });
      setWarehouseModal(false); setNotice("Depo oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Depo kaydedilemedi."); }
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership) return;
    const form = new FormData(event.currentTarget);
    const movementType = String(form.get("movement_type")) as StockMovement["movement_type"];
    try {
      await recordStockMovement(session, membership.organization_id, {
        warehouse_id: String(form.get("warehouse_id")), destination_warehouse_id: movementType === "transfer" ? String(form.get("destination_warehouse_id") || "") : null,
        item_id: String(form.get("item_id")), movement_type: movementType, quantity: Number(form.get("quantity") || 0),
        unit_cost: Number(form.get("unit_cost") || 0), note: String(form.get("note") || ""), movement_date: String(form.get("movement_date")),
      });
      setMovementModal(false); setNotice("Stok hareketi kaydedildi."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Stok hareketi kaydedilemedi."); }
  }

  if (loading) return <main className="panel-loading">Stok yönetimi yükleniyor...</main>;

  return <main className="panel-content inventory-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · STOK</small><h1>Stok ve depo yönetimi</h1><p>Ürün, hizmet, depo, bakiye ve hareketleri tek merkezden yönetin.</p></div></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}
    {notice && <div className="panel-success panel-error-wide">{notice}</div>}

    <section className="metric-grid team-metrics">
      <article><small>Ürün/hizmet</small><b>{items.length}</b><span>Tanımlı kart</span></article>
      <article><small>Depo</small><b>{warehouses.length}</b><span>Aktif lokasyon</span></article>
      <article><small>Toplam stok</small><b>{totalQuantity.toLocaleString("tr-TR")}</b><span>Tüm depolarda</span></article>
      <article><small>Kritik stok</small><b>{lowStock.length}</b><span>Minimum seviyede</span></article>
    </section>

    <section className="inventory-actions">
      <button disabled={!canManage} onClick={() => setItemModal(true)}>Yeni Ürün/Hizmet</button>
      <button disabled={!canManage} onClick={() => setWarehouseModal(true)}>Yeni Depo</button>
      <button disabled={!canManage || items.length === 0 || warehouses.length === 0} onClick={() => setMovementModal(true)}>Stok Hareketi</button>
    </section>

    <section className="inventory-layout">
      <article className="inventory-card"><div className="inventory-card-head"><div><small>ANLIK DURUM</small><h2>Depo stokları</h2></div></div>
        <div className="inventory-table-wrap"><table><thead><tr><th>Ürün</th><th>SKU</th><th>Depo</th><th>Miktar</th><th>Durum</th></tr></thead><tbody>
          {balances.map((row) => <tr key={`${row.warehouse_id}-${row.item_id}`}><td>{row.item?.name}</td><td>{row.item?.sku}</td><td>{row.warehouse?.name}</td><td>{Number(row.quantity).toLocaleString("tr-TR")} {row.item?.unit}</td><td><span className={row.item && Number(row.quantity) <= Number(row.item.minimum_stock) ? "inventory-badge danger" : "inventory-badge ok"}>{row.item && Number(row.quantity) <= Number(row.item.minimum_stock) ? "Kritik" : "Normal"}</span></td></tr>)}
          {balances.length === 0 && <tr><td colSpan={5}>Henüz stok bakiyesi yok.</td></tr>}
        </tbody></table></div>
      </article>

      <article className="inventory-card"><div className="inventory-card-head"><div><small>SON İŞLEMLER</small><h2>Stok hareketleri</h2></div></div>
        <div className="movement-list">{movements.slice(0, 12).map((row) => <div key={row.id}><span className={`movement-type ${row.movement_type}`}>{row.movement_type.toUpperCase()}</span><div><b>{row.item?.name}</b><small>{row.warehouse?.name}{row.destination ? ` → ${row.destination.name}` : ""} · {new Date(row.movement_date).toLocaleDateString("tr-TR")}</small></div><strong>{Number(row.quantity).toLocaleString("tr-TR")} {row.item?.unit}</strong></div>)}{movements.length === 0 && <p className="inventory-empty">Henüz hareket yok.</p>}</div>
      </article>
    </section>

    {itemModal && <Modal title="Yeni ürün/hizmet" onClose={() => setItemModal(false)}><form onSubmit={handleItem} className="inventory-form"><label>Tür<select name="item_type"><option value="product">Ürün</option><option value="service">Hizmet</option></select></label><label>Ad<input name="name" required /></label><label>SKU<input name="sku" required /></label><label>Barkod<input name="barcode" /></label><label>Birim<input name="unit" defaultValue="adet" /></label><label>Kategori<input name="category" /></label><label>Alış fiyatı<input name="purchase_price" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Satış fiyatı<input name="sale_price" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Para birimi<input name="currency" defaultValue="TRY" /></label><label>Minimum stok<input name="minimum_stock" type="number" min="0" step="0.001" defaultValue="0" /></label><button type="submit">Kaydet</button></form></Modal>}
    {warehouseModal && <Modal title="Yeni depo" onClose={() => setWarehouseModal(false)}><form onSubmit={handleWarehouse} className="inventory-form"><label>Depo adı<input name="name" required /></label><label>Depo kodu<input name="code" required /></label><label className="wide">Konum<input name="location" /></label><button type="submit">Kaydet</button></form></Modal>}
    {movementModal && <Modal title="Stok hareketi" onClose={() => setMovementModal(false)}><form onSubmit={handleMovement} className="inventory-form"><label>Hareket<select name="movement_type"><option value="in">Giriş</option><option value="out">Çıkış</option><option value="transfer">Transfer</option><option value="adjustment">Düzeltme</option></select></label><label>Ürün<select name="item_id" required>{items.filter((item) => item.item_type === "product").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label><label>Kaynak depo<select name="warehouse_id" required>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label>Hedef depo<select name="destination_warehouse_id"><option value="">Seçiniz</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label>Miktar<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Birim maliyet<input name="unit_cost" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Tarih<input name="movement_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label className="wide">Not<input name="note" /></label><button type="submit">Hareketi Kaydet</button></form></Modal>}
  </main>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="team-modal-backdrop" onMouseDown={onClose}><section className="team-modal inventory-modal" onMouseDown={(event) => event.stopPropagation()}><div className="inventory-modal-head"><h2>{title}</h2><button type="button" onClick={onClose}>×</button></div>{children}</section></div>;
}
