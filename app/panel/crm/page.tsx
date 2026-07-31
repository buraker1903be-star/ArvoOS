"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getCrmCustomers, getMyOrganizations, getOrganizationMembers, getRolePermissions, saveCrmCustomer, type CrmCustomer, type OrganizationMember, type OrganizationMembership } from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const emptyCustomer: Partial<CrmCustomer> & Pick<CrmCustomer, "customer_type" | "status" | "name"> = { customer_type: "company", status: "lead", name: "" };
const statusLabels = { lead: "Potansiyel", active: "Aktif", passive: "Pasif" } as const;

export default function CrmPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<(Partial<CrmCustomer> & Pick<CrmCustomer, "customer_type" | "status" | "name">) | null>(null);

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
      const active = memberships.find((item) => item.organization_id === window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY)) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((item) => item.code));
      setMembership(active);
      setCanManage(codes.has("crm.manage"));
      if (!codes.has("crm.read")) return setError("CRM kayıtlarını görüntüleme yetkisi gerekiyor.");
      const [customerRows, memberRows] = await Promise.all([
        getCrmCustomers(current, active.organization_id),
        getOrganizationMembers(current, active.organization_id),
      ]);
      setCustomers(customerRows);
      setMembers(memberRows.filter((member) => member.status === "active"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "CRM verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || !editing || saving) return;
    const form = new FormData(event.currentTarget);
    const customer = {
      ...editing,
      name: String(form.get("name") || "").trim(),
      customer_type: String(form.get("customer_type") || "company") as CrmCustomer["customer_type"],
      status: String(form.get("status") || "lead") as CrmCustomer["status"],
      tax_number: String(form.get("tax_number") || ""),
      tax_office: String(form.get("tax_office") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      website: String(form.get("website") || ""),
      city: String(form.get("city") || ""),
      address: String(form.get("address") || ""),
      notes: String(form.get("notes") || ""),
      assigned_user_id: String(form.get("assigned_user_id") || "") || null,
    };
    if (!customer.name) return setError("Müşteri adı zorunludur.");
    setSaving(true);
    setError("");
    try {
      await saveCrmCustomer(session, membership.organization_id, customer);
      await load(session);
      setEditing(null);
      setNotice(editing.id ? "Müşteri kartı güncellendi." : "Yeni müşteri kartı oluşturuldu.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Müşteri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return customers.filter((customer) => {
      const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
      const searchable = [customer.name, customer.email, customer.phone, customer.tax_number, customer.city, customer.assigned_user?.full_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      return matchesStatus && (!normalized || searchable.includes(normalized));
    });
  }, [customers, query, statusFilter]);

  if (loading) return <main className="panel-loading">CRM ve müşteri kayıtları yükleniyor...</main>;

  return <main className="panel-content crm-page">
    <header className="panel-header">
      <div><small>{membership?.organization.name.toUpperCase() || "ARVOOS"} · CRM</small><h1>Müşteriler ve cari kartlar</h1><p>Firma ve kişi müşterileri, iletişim bilgileri ve sorumluları tek yerde yönetin.</p></div>
      <button className="team-back" type="button" onClick={() => router.push("/panel")}>Panele Dön</button>
    </header>

    {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}
    {notice && <div className="team-notice" role="status">{notice}</div>}

    {!error && <>
      <section className="metric-grid team-metrics">
        <article><small>Toplam müşteri</small><b>{customers.length}</b><span>Tüm müşteri kartları</span></article>
        <article><small>Aktif müşteri</small><b>{customers.filter((item) => item.status === "active").length}</b><span>Devam eden ilişkiler</span></article>
        <article><small>Potansiyel</small><b>{customers.filter((item) => item.status === "lead").length}</b><span>Satış fırsatı olan</span></article>
        <article><small>Firma müşterisi</small><b>{customers.filter((item) => item.customer_type === "company").length}</b><span>Kurumsal hesaplar</span></article>
      </section>

      <section className="crm-toolbar">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, telefon, e-posta, vergi no veya şehir ara" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tüm durumlar</option><option value="lead">Potansiyel</option><option value="active">Aktif</option><option value="passive">Pasif</option></select>
        <button type="button" disabled={!canManage} onClick={() => setEditing({ ...emptyCustomer })}>Yeni Müşteri</button>
      </section>

      <section className="crm-grid">
        {filtered.map((customer) => <article key={customer.id} className="crm-card">
          <div className="crm-card-head"><span>{customer.customer_type === "company" ? "KURUM" : "KİŞİ"}</span><em className={`crm-status crm-${customer.status}`}>{statusLabels[customer.status]}</em></div>
          <h3>{customer.name}</h3>
          <p>{customer.city || "Şehir belirtilmedi"}{customer.tax_number ? ` · VKN/TCKN ${customer.tax_number}` : ""}</p>
          <dl><div><dt>Telefon</dt><dd>{customer.phone || "-"}</dd></div><div><dt>E-posta</dt><dd>{customer.email || "-"}</dd></div><div><dt>Sorumlu</dt><dd>{customer.assigned_user?.full_name || "Atanmamış"}</dd></div><div><dt>Oluşturma</dt><dd>{new Date(customer.created_at).toLocaleDateString("tr-TR")}</dd></div></dl>
          <button type="button" disabled={!canManage} onClick={() => setEditing(customer)}>Müşteri Kartını Aç</button>
        </article>)}
        {filtered.length === 0 && <div className="team-empty">Filtrelerle eşleşen müşteri bulunamadı.</div>}
      </section>
    </>}

    {editing && <div className="team-modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
      <section className="team-modal crm-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <small>CRM MÜŞTERİ KARTI</small><h2>{editing.id ? "Müşteriyi düzenle" : "Yeni müşteri oluştur"}</h2>
        <form onSubmit={handleSave}>
          <div className="crm-form-grid">
            <label>Müşteri türü<select name="customer_type" defaultValue={editing.customer_type}><option value="company">Firma</option><option value="person">Kişi</option></select></label>
            <label>Durum<select name="status" defaultValue={editing.status}><option value="lead">Potansiyel</option><option value="active">Aktif</option><option value="passive">Pasif</option></select></label>
            <label className="crm-wide">Müşteri adı<input name="name" required defaultValue={editing.name} /></label>
            <label>Vergi/T.C. no<input name="tax_number" defaultValue={editing.tax_number || ""} /></label>
            <label>Vergi dairesi<input name="tax_office" defaultValue={editing.tax_office || ""} /></label>
            <label>E-posta<input name="email" type="email" defaultValue={editing.email || ""} /></label>
            <label>Telefon<input name="phone" defaultValue={editing.phone || ""} /></label>
            <label>Web sitesi<input name="website" defaultValue={editing.website || ""} /></label>
            <label>Şehir<input name="city" defaultValue={editing.city || ""} /></label>
            <label className="crm-wide">Sorumlu<select name="assigned_user_id" defaultValue={editing.assigned_user_id || ""}><option value="">Atanmamış</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.full_name || member.user_id}</option>)}</select></label>
            <label className="crm-wide">Adres<textarea name="address" defaultValue={editing.address || ""} /></label>
            <label className="crm-wide">Notlar<textarea name="notes" defaultValue={editing.notes || ""} /></label>
          </div>
          <div className="team-modal-actions"><button type="button" onClick={() => setEditing(null)}>Vazgeç</button><button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Müşteri Kartını Kaydet"}</button></div>
        </form>
      </section>
    </div>}
  </main>;
}
