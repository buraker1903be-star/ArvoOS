"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import {
  getMyOrganizations,
  getOrganizationMembers,
  getOrganizationRoles,
  getRolePermissions,
  type OrganizationMember,
  type OrganizationMembership,
  type RoleSummary,
} from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

const statusLabels = {
  active: "Aktif",
  invited: "Davet Bekliyor",
  suspended: "Askıya Alındı",
} as const;

export default function TeamPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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

      if (!activeMembership) {
        router.replace("/panel");
        return;
      }

      const permissions = await getRolePermissions(current, activeMembership.role?.id);
      const permissionCodes = new Set(permissions.map((permission) => permission.code));

      if (!permissionCodes.has("users.read")) {
        setError("Bu sayfayı görüntülemek için kullanıcıları görüntüleme yetkisi gerekiyor.");
        setMembership(activeMembership);
        return;
      }

      const [organizationMembers, organizationRoles] = await Promise.all([
        getOrganizationMembers(current, activeMembership.organization_id),
        getOrganizationRoles(current, activeMembership.organization_id),
      ]);

      setMembership(activeMembership);
      setMembers(organizationMembers);
      setRoles(organizationRoles);
      setCanManage(permissionCodes.has("users.manage"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ekip bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    if (!normalizedQuery) return members;

    return members.filter((member) => {
      const searchable = [
        member.profile?.full_name,
        member.profile?.phone,
        member.role?.name,
        member.role?.code,
        member.status,
      ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");

      return searchable.includes(normalizedQuery);
    });
  }, [members, query]);

  const activeCount = members.filter((member) => member.status === "active").length;
  const invitedCount = members.filter((member) => member.status === "invited").length;

  if (loading) return <main className="panel-loading">Ekip ve yetkiler yükleniyor...</main>;

  return (
    <main className="panel-content team-page">
      <header className="panel-header">
        <div>
          <small>{membership?.organization.name.toUpperCase() || "ARVOOS"} · EKİP YÖNETİMİ</small>
          <h1>Ekip ve kullanıcılar</h1>
          <p>Kurum üyelerini, rollerini ve hesap durumlarını tek ekrandan takip edin.</p>
        </div>
        <button className="team-back" type="button" onClick={() => router.push("/panel")}>Panele Dön</button>
      </header>

      {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}

      {!error && (
        <>
          <section className="metric-grid team-metrics">
            <article><small>Toplam ekip üyesi</small><b>{members.length}</b><span>Aktif çalışma alanında</span></article>
            <article><small>Aktif kullanıcı</small><b>{activeCount}</b><span>Sisteme erişebilen</span></article>
            <article><small>Bekleyen davet</small><b>{invitedCount}</b><span>Katılım bekleyen</span></article>
            <article><small>Tanımlı rol</small><b>{roles.length}</b><span>Kurum rol yapısı</span></article>
          </section>

          <section className="team-toolbar">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ad, telefon, rol veya durum ara"
              aria-label="Ekipte ara"
            />
            <button type="button" disabled={!canManage} title={!canManage ? "Kullanıcı yönetme yetkisi gerekiyor" : undefined}>
              Yeni Kullanıcı Davet Et
            </button>
          </section>

          <section className="team-table-wrap">
            <table className="team-table">
              <thead>
                <tr>
                  <th>Kullanıcı</th>
                  <th>Rol</th>
                  <th>Durum</th>
                  <th>Katılım</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <div className="team-person">
                        <span>{(member.profile?.full_name || "K").slice(0, 2).toUpperCase()}</span>
                        <div><b>{member.profile?.full_name || "İsimsiz kullanıcı"}</b><small>{member.profile?.phone || member.user_id}</small></div>
                      </div>
                    </td>
                    <td><b>{member.role?.name || "Rol atanmamış"}</b><small>{member.role?.code || "-"}</small></td>
                    <td><span className={`team-status status-${member.status}`}>{statusLabels[member.status]}</span></td>
                    <td>{member.joined_at ? new Date(member.joined_at).toLocaleDateString("tr-TR") : "Henüz katılmadı"}</td>
                    <td><button type="button" disabled={!canManage}>Düzenle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMembers.length === 0 && <div className="team-empty">Aramanızla eşleşen ekip üyesi bulunamadı.</div>}
          </section>

          {!canManage && <p className="team-note">Bu sayfayı görüntüleyebilirsiniz; kullanıcı daveti, rol değişikliği ve askıya alma işlemleri için kullanıcı yönetme yetkisi gerekir.</p>}
        </>
      )}
    </main>
  );
}
