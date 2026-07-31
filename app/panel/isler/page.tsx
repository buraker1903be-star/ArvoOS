"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, type SupabaseSession } from "@/lib/supabase-auth";
import {
  getMyOrganizations,
  getOrganizationMembers,
  getRolePermissions,
  getWorkItems,
  getWorkProjects,
  saveWorkItem,
  saveWorkProject,
  type OrganizationMember,
  type OrganizationMembership,
  type WorkItem,
  type WorkProject,
} from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";
const statusLabels: Record<WorkItem["status"], string> = { backlog: "Havuz", planned: "Planlandı", in_progress: "Devam Ediyor", blocked: "Engelli", review: "Kontrol", done: "Tamamlandı", cancelled: "İptal" };
const priorityLabels: Record<WorkItem["priority"], string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };

export default function WorkPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [projects, setProjects] = useState<WorkProject[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemOpen, setItemOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);

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
      const activeId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const active = memberships.find((item) => item.organization_id === activeId) || memberships[0] || null;
      if (!active) return router.replace("/panel");
      const permissions = await getRolePermissions(current, active.role?.id);
      const codes = new Set(permissions.map((permission) => permission.code));
      setMembership(active);
      setCanManage(codes.has("work.manage"));
      if (!codes.has("work.read")) return setError("İş takip ekranını görüntülemek için work.read yetkisi gerekiyor.");
      const [projectRows, itemRows, memberRows] = await Promise.all([
        getWorkProjects(current, active.organization_id),
        getWorkItems(current, active.organization_id),
        getOrganizationMembers(current, active.organization_id),
      ]);
      setProjects(projectRows);
      setItems(itemRows);
      setMembers(memberRows.filter((member) => member.status === "active"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "İşler yüklenemedi.");
    } finally { setLoading(false); }
  }

  async function handleProjectSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      await saveWorkProject(session, membership.organization_id, {
        name: String(form.get("name") || "").trim(),
        code: String(form.get("code") || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        description: String(form.get("description") || "").trim(),
        owner_user_id: String(form.get("ownerUserId") || "") || null,
        is_active: true,
      });
      setProjectOpen(false); setNotice("Proje oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Proje kaydedilemedi."); }
    finally { setSaving(false); }
  }

  async function handleItemSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !membership || saving) return;
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status") || "backlog") as WorkItem["status"];
    setSaving(true); setError("");
    try {
      await saveWorkItem(session, membership.organization_id, {
        id: editingItem?.id,
        project_id: String(form.get("projectId") || "") || null,
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim(),
        status,
        priority: String(form.get("priority") || "normal") as WorkItem["priority"],
        assignee_user_id: String(form.get("assigneeUserId") || "") || null,
        progress: status === "done" ? 100 : Number(form.get("progress") || 0),
        start_date: String(form.get("startDate") || "") || null,
        due_date: String(form.get("dueDate") || "") || null,
      });
      setItemOpen(false); setEditingItem(null); setNotice(editingItem ? "İş güncellendi." : "Yeni iş oluşturuldu."); await load(session);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "İş kaydedilemedi."); }
    finally { setSaving(false); }
  }

  const filtered = useMemo(() => items.filter((item) => {
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    const text = [item.title, item.description, item.project?.name, item.assignee?.full_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
    return matchStatus && text.includes(query.trim().toLocaleLowerCase("tr-TR"));
  }), [items, query, statusFilter]);

  const activeItems = items.filter((item) => ["planned", "in_progress", "blocked", "review"].includes(item.status)).length;
  const overdue = items.filter((item) => item.due_date && new Date(item.due_date) < new Date() && item.status !== "done").length;
  const done = items.filter((item) => item.status === "done").length;

  if (loading) return <main className="panel-loading">Arvos işleri yükleniyor...</main>;

  return <main className="panel-content work-page">
    <header className="panel-header"><div><small>{membership?.organization.name.toUpperCase()} · İÇ OPERASYON</small><h1>Arvos iş takip merkezi</h1><p>Projeleri, görevleri, sorumluları ve teslim tarihlerini tek panelden yönetin.</p></div><button className="team-back" onClick={() => router.push("/panel")}>Panele Dön</button></header>
    {error && <div className="panel-error panel-error-wide">{error}</div>}
    {notice && <div className="team-notice">{notice}</div>}
    {!error && <>
      <section className="metric-grid team-metrics"><article><small>Aktif proje</small><b>{projects.filter((p) => p.is_active).length}</b><span>Arvos çalışma alanında</span></article><article><small>Devam eden iş</small><b>{activeItems}</b><span>Takip gerektiren</span></article><article><small>Geciken iş</small><b>{overdue}</b><span>Teslim tarihi geçen</span></article><article><small>Tamamlanan</small><b>{done}</b><span>Toplam iş</span></article></section>
      <section className="work-toolbar"><div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İş, proje veya sorumlu ara"/><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Tüm durumlar</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><button disabled={!canManage} onClick={() => setProjectOpen(true)}>Yeni Proje</button><button disabled={!canManage} onClick={() => { setEditingItem(null); setItemOpen(true); }}>Yeni İş</button></div></section>
      <section className="work-board">{filtered.map((item) => <article key={item.id} onClick={() => canManage && (setEditingItem(item), setItemOpen(true))}><div className="work-card-top"><span className={`work-priority priority-${item.priority}`}>{priorityLabels[item.priority]}</span><span>{statusLabels[item.status]}</span></div><h3>{item.title}</h3><p>{item.project?.name || "Projesiz iş"}</p><div className="work-progress"><i style={{ width: `${item.progress}%` }} /></div><footer><span>{item.assignee?.full_name || "Sorumlu yok"}</span><b>{item.due_date ? new Date(item.due_date).toLocaleDateString("tr-TR") : "Tarih yok"}</b></footer></article>)}</section>
      {filtered.length === 0 && <div className="team-empty">Bu filtreye uygun iş bulunamadı.</div>}
    </>}

    {(itemOpen || projectOpen) && <div className="team-modal-backdrop" onMouseDown={() => { setItemOpen(false); setProjectOpen(false); setEditingItem(null); }}><section className="team-modal work-modal" onMouseDown={(e) => e.stopPropagation()}><small>{projectOpen ? "YENİ PROJE" : editingItem ? "İŞİ DÜZENLE" : "YENİ İŞ"}</small><h2>{projectOpen ? "Arvos projesi oluştur" : editingItem?.title || "Yeni iş oluştur"}</h2>{projectOpen ? <form onSubmit={handleProjectSave}><label>Proje adı<input name="name" required /></label><label>Proje kodu<input name="code" required placeholder="arvos-web" /></label><label>Sorumlu<select name="ownerUserId"><option value="">Sorumlu seçilmedi</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.user_id}</option>)}</select></label><label>Açıklama<textarea name="description" /></label><div className="team-modal-actions"><button type="button" onClick={() => setProjectOpen(false)}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "Projeyi Oluştur"}</button></div></form> : <form onSubmit={handleItemSave}><label>İş başlığı<input name="title" required defaultValue={editingItem?.title || ""} /></label><label>Proje<select name="projectId" defaultValue={editingItem?.project_id || ""}><option value="">Projesiz</option>{projects.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="work-form-grid"><label>Durum<select name="status" defaultValue={editingItem?.status || "backlog"}>{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Öncelik<select name="priority" defaultValue={editingItem?.priority || "normal"}>{Object.entries(priorityLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label></div><label>Sorumlu<select name="assigneeUserId" defaultValue={editingItem?.assignee_user_id || ""}><option value="">Sorumlu seçilmedi</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.user_id}</option>)}</select></label><div className="work-form-grid"><label>Başlangıç<input name="startDate" type="date" defaultValue={editingItem?.start_date || ""} /></label><label>Teslim<input name="dueDate" type="date" defaultValue={editingItem?.due_date || ""} /></label></div><label>İlerleme (%)<input name="progress" type="number" min="0" max="100" defaultValue={editingItem?.progress || 0} /></label><label>Açıklama<textarea name="description" defaultValue={editingItem?.description || ""} /></label><div className="team-modal-actions"><button type="button" onClick={() => { setItemOpen(false); setEditingItem(null); }}>Vazgeç</button><button disabled={saving}>{saving ? "Kaydediliyor..." : "İşi Kaydet"}</button></div></form>}</section></div>}
  </main>;
}
