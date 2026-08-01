"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getRolePermissions, type OrganizationMembership } from "@/lib/arvoos-core";
import { getSalesShipments, type SalesShipment } from "@/lib/arvoos-shipping";
import { createSalesDeliveryNote, getSalesDeliveryNotes, setSalesDeliveryNoteStatus, type SalesDeliveryNote } from "@/lib/arvoos-delivery-notes";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const labels = { draft: "Taslak", issued: "Kesinleşti", cancelled: "İptal" } as const;

export default function DeliveryNotesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [notes, setNotes] = useState<SalesDeliveryNote[]>([]);
  const [shipments, setShipments] = useState<SalesShipment[]>([]);
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
      if (!codes.has("delivery_notes.read")) throw new Error("İrsaliyeleri görüntüleme yetkisi gerekiyor.");
      setMembership(active); setCanManage(codes.has("delivery_notes.manage"));
      const [noteRows, shipmentRows] = await Promise.all([getSalesDeliveryNotes(current, active.organization_id), getSalesShipments(current, active.organization_id)]);
      setNotes(noteRows); setShipments(shipmentRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "İrsaliyeler yüklenemedi."); }
    finally { setLoading(false); }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError("");
    try {
      await createSalesDeliveryNote(session, membership.organization_id, {
        shipment_id: String(form.get("shipment_id") || ""), delivery_note_no: String(form.get("delivery_note_no") || "").trim(),
        issue_date: String(form.get("issue_date") || new Date().toISOString().slice(0,10)), delivery_date: String(form.get("delivery_date") || "") || null,
        delivery_address: String(form.get("delivery_address") || ""), notes: String(form.get("notes") || ""),
      });
      setModalOpen(false); setNotice("İrsaliye oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "İrsaliye oluşturulamadı."); }
    finally { setSaving(false); }
  }

  async function changeStatus(id: string, status: SalesDeliveryNote["status"]) {
    if (!session || !membership) return;
    try { await setSalesDeliveryNoteStatus(session, membership.organization_id, id, status); setNotice(`İrsaliye durumu: ${labels[status]}`); await load(session); }
    catch (statusError) { setError(statusError instanceof Error ? statusError.message : "Durum değiştirilemedi."); }
  }

  const availableShipments = useMemo(() => shipments.filter((row) => row.status === "shipped" && !notes.some((note) => note.shipment_id === row.id)), [shipments, notes]);
  const issued = notes.filter((row) => row.status === "issued").length;
  const drafts = notes.filter((row) => row.status === "draft").length;

  if (loading) return <main className="panel-loading">İrsaliyeler yükleniyor...</main>;

  return <main className="panel-content delivery-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · SATIŞ OPERASYONU</small><h1>İrsaliyeler</h1><p>Sevk edilmiş siparişlerden irsaliye oluşturun, kesinleştirin ve yazdırın.</p></div></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}{notice && <div className="team-notice">{notice}</div>}
    <section className="metric-grid team-metrics"><article><small>Toplam irsaliye</small><b>{notes.length}</b><span>Tüm dönem</span></article><article><small>Taslak</small><b>{drafts}</b><span>İşlem bekliyor</span></article><article><small>Kesinleşen</small><b>{issued}</b><span>Geçerli belge</span></article><article><small>İrsaliyesiz sevkiyat</small><b>{availableShipments.length}</b><span>Belge oluşturulabilir</span></article></section>
    <section className="delivery-toolbar"><button disabled={!canManage || availableShipments.length === 0} onClick={() => setModalOpen(true)}>Yeni İrsaliye</button></section>
    <section className="delivery-list">{notes.map((note) => <article key={note.id} className="delivery-card"><div><span className={`delivery-status status-${note.status}`}>{labels[note.status]}</span><h2>{note.delivery_note_no}</h2><p>{note.customer?.name || "Müşteri bulunamadı"}</p><small>{note.order?.order_no} · {note.shipment?.shipment_no} · {new Date(note.issue_date).toLocaleDateString("tr-TR")}</small></div><div><b>{note.items.length} kalem</b><small>{note.carrier_name || "Taşıyıcı yok"}{note.tracking_no ? ` · ${note.tracking_no}` : ""}</small></div><div className="delivery-actions">{note.status === "draft" && canManage && <><button onClick={() => void changeStatus(note.id,"issued")}>Kesinleştir</button><button className="danger" onClick={() => void changeStatus(note.id,"cancelled")}>İptal</button></>}<button onClick={() => window.print()}>Yazdır</button></div></article>)}{notes.length === 0 && <div className="team-empty">Henüz irsaliye yok.</div>}</section>
    {modalOpen && <div className="team-modal-backdrop" onMouseDown={() => setModalOpen(false)}><section className="team-modal delivery-modal" onMouseDown={(event) => event.stopPropagation()}><small>YENİ İRSALİYE</small><h2>Sevkiyattan irsaliye oluştur</h2><form onSubmit={handleCreate}><label>Sevkiyat<select name="shipment_id" required><option value="">Seçiniz</option>{availableShipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.shipment_no} · {shipment.order?.customer?.name || shipment.order?.order_no}</option>)}</select></label><div className="delivery-form-grid"><label>İrsaliye no<input name="delivery_note_no" required defaultValue={`IRS-${new Date().getFullYear()}-`} /></label><label>Düzenleme tarihi<input name="issue_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></label></div><label>Teslim tarihi<input name="delivery_date" type="date" /></label><label>Teslim adresi<textarea name="delivery_address" rows={3} /></label><label>Not<textarea name="notes" rows={3} /></label><div className="team-modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "İrsaliyeyi Oluştur"}</button></div></form></section></div>}
  </main>;
}
