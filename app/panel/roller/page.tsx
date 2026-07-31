"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import {
  getAllPermissions,
  getMyOrganizations,
  getOrganizationRoles,
  getRolePermissions,
  saveOrganizationRole,
  type OrganizationMembership,
  type Permission,
  type RoleSummary,
} from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

export default function RolesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleSummary | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      (groups[permission.module] ||= []).push(permission);
      return groups;
    }, {});
  }, [permissions]);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) {
      router.replace("/giris");
      return;
    }
    setSession(current);
    void loadPage(current);
  }, [router]);

  async function loadPage(current: SupabaseSession) {
    setLoading(true);
    setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const storedId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const active = memberships.find((item) => item.organization_id === storedId) || memberships[0] || null;
      if (!active) return router.replace("/panel");

      const myPermissions = await getRolePermissions(current, active.role?.id);
      if (!myPermissions.some((permission) => permission.code === "roles.manage")) {
        setMembership(active);
        setError("Bu sayfayı kullanmak için rol ve yetki yönetme izni gerekiyor.");
        return;
      }

      const [organizationRoles, allPermissions] = await Promise.all([
        getOrganizationRoles(current, active.organization_id),
        getAllPermissions(current),
      ]);
      setMembership(active);
      setRoles(organizationRoles);
      setPermissions(allPermissions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Rol bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function editRole(role: RoleSummary) {
    if (!session) return;
    setSelectedRole(role);
    setError("");
    setSuccess("");
    try {
      const rolePermissions = await getRolePermissions(session, role.id);
      setSelectedCodes(rolePermissions.map((permission) => permission.code));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Rol izinleri yüklenemedi.");
    }
  }

  function newRole() {
    setSelectedRole({ id: "", name: "", code: "", description: "", is_system: false });
    setSelectedCodes([]);
    setError("");
    setSuccess("");
  }

  function togglePermission(code: string) {
    setSelectedCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || !selectedRole || saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const code = String(form.get("code") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!name || !code) return setError("Rol adı ve rol kodu zorunludur.");

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveOrganizationRole(
        session,
        membership.organization_id,
        selectedRole.id || null,
        name,
        code,
        description,
        selectedCodes,
      );
      setSuccess("Rol ve yetkiler kaydedildi.");
      setSelectedRole(null);
      await loadPage(session);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Rol kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="panel-loading">Roller ve izinler yükleniyor...</main>;

  return (
    <main className="panel-content roles-page">
      <header className="panel-header">
        <div>
          <small>{membership?.organization.name.toUpperCase() || "ARVOOS"} · ROL YÖNETİMİ</small>
          <h1>Roller ve yetkiler</h1>
          <p>Kullanıcıların hangi modülleri görebileceğini ve hangi işlemleri yapabileceğini yönetin.</p>
        </div>
        <button className="team-back" type="button" onClick={() => router.push("/panel/ekip")}>Ekibe Dön</button>
      </header>

      {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}
      {success && <div className="panel-success panel-error-wide" role="status">{success}</div>}

      {!error && (
        <section className="roles-layout">
          <div className="roles-list-card">
            <div className="roles-card-head"><div><small>KURUM ROLLERİ</small><h2>{roles.length} rol tanımlı</h2></div><button type="button" onClick={newRole}>Yeni Rol</button></div>
            <div className="roles-list">
              {roles.map((role) => (
                <button key={role.id} type="button" onClick={() => void editRole(role)} className={selectedRole?.id === role.id ? "active" : ""}>
                  <span><b>{role.name}</b><small>{role.code}</small></span>
                  <em>{role.is_system ? "Sistem" : "Özel"}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="roles-editor-card">
            {!selectedRole ? (
              <div className="roles-empty"><h2>Bir rol seçin</h2><p>Mevcut bir rolü düzenleyin veya yeni bir rol oluşturun.</p></div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="roles-form-grid">
                  <label>Rol adı<input name="name" defaultValue={selectedRole.name} placeholder="Örn. Satış Uzmanı" /></label>
                  <label>Rol kodu<input name="code" defaultValue={selectedRole.code} placeholder="satis_uzmani" /></label>
                  <label className="wide">Açıklama<textarea name="description" defaultValue={selectedRole.description || ""} placeholder="Rolün sorumluluklarını yazın" /></label>
                </div>

                <div className="permission-groups">
                  {Object.entries(groupedPermissions).map(([module, modulePermissions]) => (
                    <section key={module}>
                      <h3>{module.toUpperCase()}</h3>
                      <div className="permission-grid">
                        {modulePermissions.map((permission) => (
                          <label key={permission.code} className={selectedCodes.includes(permission.code) ? "checked" : ""}>
                            <input type="checkbox" checked={selectedCodes.includes(permission.code)} onChange={() => togglePermission(permission.code)} />
                            <span><b>{permission.name}</b><small>{permission.description || permission.code}</small></span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="roles-actions"><button type="button" onClick={() => setSelectedRole(null)}>Vazgeç</button><button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Rolü Kaydet"}</button></div>
              </form>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
