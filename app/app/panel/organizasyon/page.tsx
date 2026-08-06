"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import {
  getMyOrganizations,
  getOrganizationBranches,
  getOrganizationDepartments,
  getRolePermissions,
  saveBranch,
  saveDepartment,
  type Branch,
  type Department,
  type OrganizationMembership,
} from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

type EditState = { kind: "branch"; item: Branch | null } | { kind: "department"; item: Department | null } | null;

export default function OrganizationStructurePage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<EditState>(null);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) return router.replace("/giris");
    setSession(current);
    void loadStructure(current);
  }, [router]);

  async function loadStructure(current: SupabaseSession) {
    setLoading(true);
    setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const storedId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const active = memberships.find((item) => item.organization_id === storedId) || memberships[0] || null;
      if (!active) return router.replace("/panel");

      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((permission) => permission.code));
      setMembership(active);
      setCanManage(codes.has("organization.manage"));

      const [branchRows, departmentRows] = await Promise.all([
        getOrganizationBranches(current, active.organization_id),
        getOrganizationDepartments(current, active.organization_id),
      ]);
      setBranches(branchRows);
      setDepartments(departmentRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Organizasyon yapısı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || !editing || saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const code = String(form.get("code") || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const isActive = form.get("isActive") === "on";
    if (!name || !code) return setError("Ad ve kod zorunludur.");

    setSaving(true);
    setError("");
    try {
      if (editing.kind === "branch") {
        await saveBranch(session, membership.organization_id, {
          id: editing.item?.id,
          name,
          code,
          address: String(form.get("address") || "").trim(),
          is_active: isActive,
        });
      } else {
        await saveDepartment(session, membership.organization_id, {
          id: editing.item?.id,
          name,
          code,
          branch_id: String(form.get("branchId") || "") || null,
          is_active: isActive,
        });
      }
      await loadStructure(session);
      setNotice(editing.kind === "branch" ? "Şube kaydedildi." : "Departman kaydedildi.");
      setEditing(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kayıt tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="panel-loading">Organizasyon yapısı yükleniyor...</main>;

  return (
    <main className="panel-content structure-page">
      <header className="panel-header">
        <div><small>{membership?.organization.name.toUpperCase() || "ARVOOS"} · ORGANİZASYON</small><h1>Şube ve departmanlar</h1><p>Operasyon yapınızı, lokasyonlarınızı ve ekip birimlerinizi yönetin.</p></div>
        <button className="team-back" type="button" onClick={() => router.push("/panel")}>Panele Dön</button>
      </header>

      {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}
      {notice && <div className="team-notice" role="status">{notice}</div>}

      <section className="metric-grid team-metrics">
        <article><small>Toplam şube</small><b>{branches.length}</b><span>{branches.filter((item) => item.is_active).length} aktif</span></article>
        <article><small>Toplam departman</small><b>{departments.length}</b><span>{departments.filter((item) => item.is_active).length} aktif</span></article>
        <article><small>Şubesiz departman</small><b>{departments.filter((item) => !item.branch_id).length}</b><span>Merkez birimleri</span></article>
        <article><small>Yönetim yetkisi</small><b className="role-metric">{canManage ? "Var" : "Yok"}</b><span>organization.manage</span></article>
      </section>

      <section className="structure-grid">
        <article className="structure-card">
          <header><div><small>LOKASYONLAR</small><h2>Şubeler</h2></div><button type="button" disabled={!canManage} onClick={() => setEditing({ kind: "branch", item: null })}>Yeni Şube</button></header>
          <div className="structure-list">{branches.map((branch) => (
            <button key={branch.id} type="button" className="structure-row" disabled={!canManage} onClick={() => setEditing({ kind: "branch", item: branch })}>
              <span><b>{branch.name}</b><small>{branch.code} · {branch.address || "Adres girilmemiş"}</small></span><em className={branch.is_active ? "active" : "passive"}>{branch.is_active ? "Aktif" : "Pasif"}</em>
            </button>
          ))}{branches.length === 0 && <p className="team-empty">Henüz şube tanımlanmadı.</p>}</div>
        </article>

        <article className="structure-card">
          <header><div><small>ORGANİZASYON BİRİMLERİ</small><h2>Departmanlar</h2></div><button type="button" disabled={!canManage} onClick={() => setEditing({ kind: "department", item: null })}>Yeni Departman</button></header>
          <div className="structure-list">{departments.map((department) => (
            <button key={department.id} type="button" className="structure-row" disabled={!canManage} onClick={() => setEditing({ kind: "department", item: department })}>
              <span><b>{department.name}</b><small>{department.code} · {department.branch?.name || "Merkez"}</small></span><em className={department.is_active ? "active" : "passive"}>{department.is_active ? "Aktif" : "Pasif"}</em>
            </button>
          ))}{departments.length === 0 && <p className="team-empty">Henüz departman tanımlanmadı.</p>}</div>
        </article>
      </section>

      {editing && <div className="team-modal-backdrop" onMouseDown={() => setEditing(null)}>
        <section className="team-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <small>{editing.kind === "branch" ? "ŞUBE KAYDI" : "DEPARTMAN KAYDI"}</small>
          <h2>{editing.item ? "Kaydı düzenle" : editing.kind === "branch" ? "Yeni şube" : "Yeni departman"}</h2>
          <form onSubmit={handleSave}>
            <label>Ad<input name="name" required defaultValue={editing.item?.name || ""} /></label>
            <label>Kod<input name="code" required defaultValue={editing.item?.code || ""} /></label>
            {editing.kind === "branch" ? <label>Adres<textarea name="address" defaultValue={editing.item?.address || ""} /></label> : <label>Şube<select name="branchId" defaultValue={editing.item?.branch_id || ""}><option value="">Merkez / Şubesiz</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
            <label className="structure-check"><input name="isActive" type="checkbox" defaultChecked={editing.item?.is_active ?? true} /> Aktif</label>
            <div className="team-modal-actions"><button type="button" onClick={() => setEditing(null)}>Vazgeç</button><button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
