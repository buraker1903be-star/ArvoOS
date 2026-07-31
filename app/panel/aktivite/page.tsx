"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import { getMyOrganizations, getOrganizationActivityLogs, getRolePermissions, type ActivityLog, type OrganizationMembership } from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

const actionLabels: Record<string, string> = {
  "organization.created": "Organizasyon oluşturuldu",
  "member.updated": "Kullanıcı erişimi güncellendi",
  "invitation.created": "Kullanıcı daveti oluşturuldu",
  "role.created": "Rol oluşturuldu",
  "role.updated": "Rol güncellendi",
  "branch.created": "Şube oluşturuldu",
  "branch.updated": "Şube güncellendi",
  "department.created": "Departman oluşturuldu",
  "department.updated": "Departman güncellendi",
};

function formatMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata || {}).filter(([, value]) => value !== null && value !== "");
  if (!entries.length) return "Ek bilgi yok";
  return entries.map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

export default function ActivityPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    const current = getStoredSession();
    if (!current) {
      router.replace("/giris");
      return;
    }
    setSession(current);
    void loadLogs(current);
  }, [router]);

  async function loadLogs(current: SupabaseSession) {
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
      if (!permissions.some((permission) => permission.code === "audit.read")) {
        setMembership(activeMembership);
        setError("Bu sayfayı görüntülemek için aktivite kayıtlarını görüntüleme yetkisi gerekiyor.");
        return;
      }

      setMembership(activeMembership);
      setLogs(await getOrganizationActivityLogs(current, activeMembership.organization_id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Aktivite kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);
  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        actionLabels[log.action] || log.action,
        log.action,
        log.entity_type,
        log.entity_id,
        log.actor?.full_name,
        log.actor?.phone,
        formatMetadata(log.metadata),
      ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      return searchable.includes(normalizedQuery);
    });
  }, [logs, query, actionFilter]);

  const todayCount = logs.filter((log) => new Date(log.created_at).toDateString() === new Date().toDateString()).length;
  const actorCount = new Set(logs.map((log) => log.actor_user_id).filter(Boolean)).size;
  const entityCount = new Set(logs.map((log) => log.entity_type)).size;

  if (loading) return <main className="panel-loading">Aktivite kayıtları yükleniyor...</main>;

  return <main className="panel-content audit-page">
    <header className="panel-header">
      <div><small>{membership?.organization.name.toUpperCase() || "ARVOOS"} · DENETİM</small><h1>Aktivite kayıtları</h1><p>Kullanıcı, rol, organizasyon ve yapı değişikliklerini tek ekrandan izleyin.</p></div>
      <div className="audit-header-actions"><button type="button" onClick={() => session && void loadLogs(session)}>Yenile</button><button type="button" onClick={() => router.push("/panel")}>Panele Dön</button></div>
    </header>

    {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}

    {!error && <>
      <section className="metric-grid audit-metrics">
        <article><small>Toplam kayıt</small><b>{logs.length}</b><span>Son 200 işlem</span></article>
        <article><small>Bugünkü işlem</small><b>{todayCount}</b><span>Bugün oluşturulan</span></article>
        <article><small>İşlem yapan kullanıcı</small><b>{actorCount}</b><span>Benzersiz kullanıcı</span></article>
        <article><small>Varlık türü</small><b>{entityCount}</b><span>İşlem gören alan</span></article>
      </section>

      <section className="audit-toolbar">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kullanıcı, işlem veya kayıt ara" aria-label="Aktivite kayıtlarında ara" />
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="İşlem türü filtresi">
          <option value="all">Tüm işlem türleri</option>
          {actionOptions.map((action) => <option key={action} value={action}>{actionLabels[action] || action}</option>)}
        </select>
      </section>

      <section className="audit-list">
        {filteredLogs.map((log) => <article key={log.id} className="audit-item">
          <div className="audit-icon">{log.entity_type.slice(0, 2).toUpperCase()}</div>
          <div className="audit-main">
            <div className="audit-title"><b>{actionLabels[log.action] || log.action}</b><span>{new Date(log.created_at).toLocaleString("tr-TR")}</span></div>
            <p>{log.actor?.full_name || "Sistem kullanıcısı"} · {log.entity_type}{log.entity_id ? ` · ${log.entity_id}` : ""}</p>
            <small>{formatMetadata(log.metadata)}</small>
          </div>
        </article>)}
        {filteredLogs.length === 0 && <div className="audit-empty">Filtrelerle eşleşen aktivite kaydı bulunamadı.</div>}
      </section>
    </>}
  </main>;
}
