"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, signOut, type SupabaseSession } from "@/lib/supabase-auth";
import { bootstrapOrganization, getMyOrganizations, getRolePermissions, type OrganizationMembership, type Permission } from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

const modules = [
  { name: "CRM & Satış", description: "Müşteri, talep ve teklif süreçleri", permission: "crm.read", href: "/panel/crm" },
  { name: "Arvos İş Takibi", description: "Projeler, görevler, sorumlular ve ilerleme", permission: "work.read", href: "/panel/isler" },
  { name: "Finans", description: "Tahsilat, gider ve nakit akışı", permission: "finance.read", href: "/panel/finans" },
  { name: "Satın Alma", description: "Tedarikçi, onay ve teslimat", permission: "inventory.read", href: null },
  { name: "Stok", description: "Ürün, hizmet ve kritik seviye", permission: "inventory.read", href: null },
  { name: "Organizasyon Yapısı", description: "Şube, lokasyon ve departman yönetimi", permission: "organization.manage", href: "/panel/organizasyon" },
  { name: "Ekip Yönetimi", description: "Kullanıcı, rol ve hesap durumları", permission: "users.read", href: "/panel/ekip" },
  { name: "Rol ve Yetkiler", description: "Rol bazlı modül ve işlem izinleri", permission: "roles.manage", href: "/panel/roller" },
  { name: "Aktivite Kayıtları", description: "Kullanıcı ve sistem işlemlerinin denetim geçmişi", permission: "audit.read", href: "/panel/aktivite" },
];

const planLabels = { trial: "Deneme Paketi", starter: "Başlangıç Paketi", professional: "Profesyonel Paket", enterprise: "Kurumsal Paket" } as const;

export default function PanelPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [checking, setChecking] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const permissionCodes = useMemo(() => new Set(permissions.map((permission) => permission.code)), [permissions]);
  const visibleModules = modules.filter((module) => permissionCodes.has(module.permission));

  async function activateMembership(current: SupabaseSession, nextMembership: OrganizationMembership | null) {
    setMembership(nextMembership); setPermissions([]); if (!nextMembership) return;
    window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, nextMembership.organization_id);
    setPermissions(await getRolePermissions(current, nextMembership.role?.id));
  }

  async function loadOrganizations(current: SupabaseSession) {
    try {
      const organizations = await getMyOrganizations(current);
      const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const active = organizations.find((item) => item.organization_id === storedOrganizationId) || organizations[0] || null;
      setMemberships(organizations); await activateMembership(current, active);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Çalışma alanı yüklenemedi."); }
    finally { setChecking(false); }
  }

  useEffect(() => { const current = getStoredSession(); if (!current) return router.replace("/giris"); setSession(current); void loadOrganizations(current); }, [router]);

  async function handleOrganizationChange(organizationId: string) {
    if (!session) return; const nextMembership = memberships.find((item) => item.organization_id === organizationId); if (!nextMembership) return;
    setChecking(true); setError(""); try { await activateMembership(session, nextMembership); } catch (permissionError) { setError(permissionError instanceof Error ? permissionError.message : "Yetkiler yüklenemedi."); } finally { setChecking(false); }
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || creating) return;
    const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); const slug = String(form.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!name || !slug) return setError("Firma adı ve çalışma alanı kodu zorunludur.");
    setCreating(true); setError("");
    try { const organizationId = await bootstrapOrganization(session, name, slug); window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId); await loadOrganizations(session); }
    catch (createError) { setError(createError instanceof Error ? createError.message : "Firma oluşturulamadı."); }
    finally { setCreating(false); }
  }

  async function handleLogout() { window.localStorage.removeItem(ACTIVE_ORGANIZATION_KEY); await signOut(); router.replace("/giris"); }
  function openModule(href: string | null) { if (href) router.push(href); }

  if (checking) return <main className="panel-loading">Çalışma alanı ve yetkiler doğrulanıyor...</main>;
  if (!membership) return <main className="panel-setup-page"><section className="panel-setup-card"><img src="/arvoos-logo.png" alt="ArvoOS" /><small>ARVOOS KURULUM SİHİRBAZI</small><h1>İlk çalışma alanınızı oluşturun</h1><p>Bu firma, ArvoOS içindeki kullanıcılarınızın, rollerinizin ve tüm işletme verilerinizin ana çalışma alanı olacaktır.</p><form onSubmit={handleCreateOrganization}><label>Firma adı<input name="name" placeholder="Örn. Arvos" autoComplete="organization" /></label><label>Çalışma alanı kodu<input name="slug" placeholder="arvos" autoCapitalize="none" /></label>{error && <div className="panel-error" role="alert">{error}</div>}<button type="submit" disabled={creating}>{creating ? "Oluşturuluyor..." : "Çalışma Alanını Oluştur"}</button></form><button className="setup-logout" type="button" onClick={handleLogout}>Farklı hesapla giriş yap</button></section></main>;

  const organization = membership.organization; const roleName = membership.role?.name || "Standart Kullanıcı";
  return <main className="panel-shell"><aside className="panel-sidebar"><a className="panel-logo" href="/"><img src="/arvoos-logo.png" alt="ArvoOS" /></a><div className="panel-company"><small>AKTİF ÇALIŞMA ALANI</small>{memberships.length > 1 ? <select aria-label="Aktif çalışma alanı" value={membership.organization_id} onChange={(event) => void handleOrganizationChange(event.target.value)}>{memberships.map((item) => <option key={item.organization_id} value={item.organization_id}>{item.organization.name}</option>)}</select> : <b>{organization.name}</b>}<span>{planLabels[organization.plan]}</span></div><nav><button className="active">Genel Bakış</button>{visibleModules.map((module) => <button key={module.name} type="button" onClick={() => openModule(module.href)}>{module.name}</button>)}</nav><button className="logout" type="button" onClick={handleLogout}>Çıkış Yap</button></aside><section className="panel-content"><header className="panel-header"><div><small>{organization.name.toUpperCase()} OPERASYON MERKEZİ</small><h1>Hoş geldiniz</h1><p>{session?.user.email} · {roleName}</p></div><span>{session?.user.email?.slice(0, 2).toUpperCase()}</span></header>{error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}<section className="hero-card"><div><small>SİSTEM DURUMU</small><h2>{organization.name} çalışma alanı aktif.</h2><p>Arvos'un kendi projeleri, görevleri, ekip sorumlulukları ve müşteri süreçleri artık bu çalışma alanından yönetilebilir.</p></div><strong>{organization.is_active ? "Aktif" : "Askıda"}</strong></section><section className="metric-grid"><article><small>Erişilebilir modül</small><b>{visibleModules.length}</b><span>Rol izinlerine göre</span></article><article><small>Tanımlı izin</small><b>{permissions.length}</b><span>Aktif çalışma alanında</span></article><article><small>Bağlı firma</small><b>{memberships.length}</b><span>Tenant üyelikleriniz</span></article><article><small>Yetki seviyeniz</small><b className="role-metric">{roleName}</b><span>{membership.role?.code || "member"}</span></article></section><section className="module-grid">{visibleModules.length > 0 ? visibleModules.map((module) => <article key={module.name}><small>YETKİLİ MODÜL</small><h3>{module.name}</h3><p>{module.description}</p><button type="button" disabled={!module.href} onClick={() => openModule(module.href)}>{module.href ? "Modülü Aç" : "Geliştirme Sırasında"}</button></article>) : <article><small>ERİŞİM SINIRLI</small><h3>Henüz modül yetkiniz yok</h3><p>Kurum yöneticiniz rolünüze görüntüleme veya yönetim izni verdiğinde ilgili modüller burada açılacaktır.</p><button type="button" disabled>Yetki bekleniyor</button></article>}</section></section></main>;
}
