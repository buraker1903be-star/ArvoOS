"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import {
  createOrganizationInvitation,
  getMyOrganizations,
  getOrganizationMembers,
  getOrganizationRoles,
  getRolePermissions,
  updateMemberAccess,
  type OrganizationMember,
  type OrganizationMembership,
  type RoleSummary,
} from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels = { active: "Aktif", invited: "Davet Bekliyor", suspended: "Askıya Alındı" } as const;

export default function TeamPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<OrganizationMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) {
      router.replace("/giris");
      return;
    }
    setSession(current);
    void loadTeam(current);
  }, [router]);

  async function loadTeam(current: SupabaseSession) {
    setLoading(true);
    setError("");
    try {
      const memberships = await getMyOrganizations(current);
      const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const activeMembership = memberships.find((item) => item.organization_id === storedOrganizationId) || memberships[0] || null;
      if (!activeMembership) return router.replace("/panel");

      const permissions = await getRolePermissions(current, activeMembership.role?.id);
      const permissionCodes = new Set(permissions.map((permission) => permission.code));
      setMembership(activeMembership);
      setCanManage(permissionCodes.has("users.manage"));

      if (!permissionCodes.has("users.read")) {
        setError("Bu sayfayı görüntülemek için kullanıcıları görüntüleme yetkisi gerekiyor.");
        return;
      }

      const [organizationMembers, organizationRoles] = await Promise.all([
        getOrganizationMembers(current, activeMembership.organization_id),
        getOrganizationRoles(current, activeMembership.organization_id),
      ]);
      setMembers(organizationMembers);
      setRoles(organizationRoles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ekip bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMemberSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || !editing || saving) return;
    const form = new FormData(event.currentTarget);
    const roleId = String(form.get("roleId") || "");
    const status = String(form.get("status") || "active") as OrganizationMember["status"];
    if (!roleId) return setError("Bir rol seçmelisiniz.");

    setSaving(true);
    setError("");
    try {
      await updateMemberAccess(session, membership.organization_id, editing.user_id, roleId, status);
      await loadTeam(session);
      setEditing(null);
      setNotice("Kullanıcının rolü ve hesap durumu güncellendi.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kullanıcı güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const roleId = String(form.get("roleId") || "");
    if (!email || !roleId) return setError("E-posta ve rol zorunludur.");

    setSaving(true);
    setError("");
    try {
      await createOrganizationInvitation(session, membership.organization_id, email, roleId);
      setInviteOpen(false);
      setNotice(`${email} için davet kaydı oluşturuldu.`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Davet oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    if (!normalizedQuery) return members;
    return members.filter((member) => [member.profile?.full_name, member.profile?.phone, member.role?.name, member.role?.code, member.status]
      .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(normalizedQuery));
  }, [members, query]);

  const activeCount = members.filter((member) => member.status === "active").length;
  const invitedCount = members.filter((member) => member.status === "invited").length;
  if (loading) return <main className="panel-loading">Ekip ve yetkiler yükleniyor...</main>;

  return (
    <main className="panel-content team-page">
      <header className="panel-header">
        <div><small>{membership?.organization.name.toUpperCase() || "ARVOOS"} · EKİP YÖNETİMİ</small><h1>Ekip ve kullanıcılar</h1><p>Kurum üyelerini, rollerini ve hesap durumlarını tek ekrandan yönetin.</p></div>
        <button className="team-back" type="button" onClick={() => router.push("/panel")}>Panele Dön</button>
      </header>

      {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}
      {notice && <div className="team-notice" role="status">{notice}</div>}

      {!error && <>
        <section className="metric-grid team-metrics">
          <article><small>Toplam ekip üyesi</small><b>{members.length}</b><span>Aktif çalışma alanında</span></article>
          <article><small>Aktif kullanıcı</small><b>{activeCount}</b><span>Sisteme erişebilen</span></article>
          <article><small>Bekleyen davet</small><b>{invitedCount}</b><span>Katılım bekleyen</span></article>
          <article><small>Tanımlı rol</small><b>{roles.length}</b><span>Kurum rol yapısı</span></article>
        </section>

        <section className="team-toolbar">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, telefon, rol veya durum ara" aria-label="Ekipte ara" />
          <button type="button" disabled={!canManage} onClick={() => setInviteOpen(true)}>Yeni Kullanıcı Davet Et</button>
        </section>

        <section className="team-table-wrap">
          <table className="team-table">
            <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>Katılım</th><th>İşlem</th></tr></thead>
            <tbody>{filteredMembers.map((member) => (
              <tr key={member.user_id}>
                <td><div className="team-person"><span>{(member.profile?.full_name || "K").slice(0, 2).toUpperCase()}</span><div><b>{member.profile?.full_name || "İsimsiz kullanıcı"}</b><small>{member.profile?.phone || member.user_id}</small></div></div></td>
                <td><b>{member.role?.name || "Rol atanmamış"}</b><small>{member.role?.code || "-"}</small></td>
                <td><span className={`team-status status-${member.status}`}>{statusLabels[member.status]}</span></td>
                <td>{member.joined_at ? new Date(member.joined_at).toLocaleDateString("tr-TR") : "Henüz katılmadı"}</td>
                <td><button type="button" disabled={!canManage} onClick={() => setEditing(member)}>Düzenle</button></td>
              </tr>
            ))}</tbody>
          </table>
          {filteredMembers.length === 0 && <div className="team-empty">Aramanızla eşleşen ekip üyesi bulunamadı.</div>}
        </section>
      </>}

      {(editing || inviteOpen) && <div className="team-modal-backdrop" role="presentation" onMouseDown={() => { setEditing(null); setInviteOpen(false); }}>
        <section className="team-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <small>{editing ? "KULLANICI ERİŞİMİ" : "YENİ DAVET"}</small>
          <h2>{editing ? editing.profile?.full_name || "Kullanıcıyı düzenle" : "Ekip üyesi davet et"}</h2>
          <form onSubmit={editing ? handleMemberSave : handleInvite}>
            {!editing && <label>E-posta<input name="email" type="email" required placeholder="kullanici@firma.com" /></label>}
            <label>Rol<select name="roleId" defaultValue={editing?.role?.id || roles[0]?.id || ""}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            {editing && <label>Hesap durumu<select name="status" defaultValue={editing.status}><option value="active">Aktif</option><option value="invited">Davet bekliyor</option><option value="suspended">Askıya alındı</option></select></label>}
            <div className="team-modal-actions"><button type="button" onClick={() => { setEditing(null); setInviteOpen(false); }}>Vazgeç</button><button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : editing ? "Değişiklikleri Kaydet" : "Davet Kaydı Oluştur"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
