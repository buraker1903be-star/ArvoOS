"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, signOut, type SupabaseSession } from "@/lib/supabase-auth";
import { bootstrapOrganization, getMyOrganizations, type OrganizationMembership } from "@/lib/arvoos-core";

const ACTIVE_ORGANIZATION_KEY = "arvoos.activeOrganizationId";

const modules = [
  ["CRM & Satış", "Müşteri, talep ve teklif süreçleri"],
  ["İş Akışları", "Görevler, sorumlular ve ilerleme"],
  ["Finans", "Tahsilat, gider ve nakit akışı"],
  ["Satın Alma", "Tedarikçi, onay ve teslimat"],
  ["Stok", "Ürün, hizmet ve kritik seviye"],
  ["İnsan Kaynakları", "Ekip, rol ve izin yönetimi"],
];

const planLabels = {
  trial: "Deneme Paketi",
  starter: "Başlangıç Paketi",
  professional: "Profesyonel Paket",
  enterprise: "Kurumsal Paket",
} as const;

export default function PanelPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [checking, setChecking] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function loadOrganizations(current: SupabaseSession) {
    try {
      const organizations = await getMyOrganizations(current);
      const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      const active = organizations.find((item) => item.organization_id === storedOrganizationId) || organizations[0] || null;
      setMemberships(organizations);
      setMembership(active);
      if (active) window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, active.organization_id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Çalışma alanı yüklenemedi.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const current = getStoredSession();
    if (!current) {
      router.replace("/giris");
      return;
    }

    setSession(current);
    void loadOrganizations(current);
  }, [router]);

  function handleOrganizationChange(organizationId: string) {
    const nextMembership = memberships.find((item) => item.organization_id === organizationId);
    if (!nextMembership) return;
    window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
    setMembership(nextMembership);
    setError("");
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || creating) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const slug = String(form.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

    if (!name || !slug) {
      setError("Firma adı ve çalışma alanı kodu zorunludur.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const organizationId = await bootstrapOrganization(session, name, slug);
      window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
      await loadOrganizations(session);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Firma oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    window.localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
    await signOut();
    router.replace("/giris");
  }

  if (checking) {
    return <main className="panel-loading">Çalışma alanı doğrulanıyor...</main>;
  }

  if (!membership) {
    return (
      <main className="panel-setup-page">
        <section className="panel-setup-card">
          <img src="/arvoos-logo.png" alt="ArvoOS" />
          <small>ARVOOS KURULUM SİHİRBAZI</small>
          <h1>İlk çalışma alanınızı oluşturun</h1>
          <p>Bu firma, ArvoOS içindeki kullanıcılarınızın, rollerinizin ve tüm işletme verilerinizin ana çalışma alanı olacaktır.</p>
          <form onSubmit={handleCreateOrganization}>
            <label>Firma adı<input name="name" placeholder="Örn. Arvo Culture" autoComplete="organization" /></label>
            <label>Çalışma alanı kodu<input name="slug" placeholder="arvo-culture" autoCapitalize="none" /></label>
            {error && <div className="panel-error" role="alert">{error}</div>}
            <button type="submit" disabled={creating}>{creating ? "Oluşturuluyor..." : "Çalışma Alanını Oluştur"}</button>
          </form>
          <button className="setup-logout" type="button" onClick={handleLogout}>Farklı hesapla giriş yap</button>
        </section>
      </main>
    );
  }

  const organization = membership.organization;
  const roleName = membership.role?.name || "Standart Kullanıcı";

  return (
    <main className="panel-shell">
      <aside className="panel-sidebar">
        <a className="panel-logo" href="/"><img src="/arvoos-logo.png" alt="ArvoOS" /></a>
        <div className="panel-company">
          <small>AKTİF ÇALIŞMA ALANI</small>
          {memberships.length > 1 ? (
            <select aria-label="Aktif çalışma alanı" value={membership.organization_id} onChange={(event) => handleOrganizationChange(event.target.value)}>
              {memberships.map((item) => <option key={item.organization_id} value={item.organization_id}>{item.organization.name}</option>)}
            </select>
          ) : <b>{organization.name}</b>}
          <span>{planLabels[organization.plan]}</span>
        </div>
        <nav><button className="active">Genel Bakış</button>{modules.map(([name]) => <button key={name}>{name}</button>)}</nav>
        <button className="logout" type="button" onClick={handleLogout}>Çıkış Yap</button>
      </aside>

      <section className="panel-content">
        <header className="panel-header">
          <div><small>{organization.name.toUpperCase()} OPERASYON MERKEZİ</small><h1>Hoş geldiniz</h1><p>{session?.user.email} · {roleName}</p></div>
          <span>{session?.user.email?.slice(0, 2).toUpperCase()}</span>
        </header>

        {error && <div className="panel-error panel-error-wide" role="alert">{error}</div>}

        <section className="hero-card">
          <div><small>SİSTEM DURUMU</small><h2>{organization.name} çalışma alanı aktif.</h2><p>Organizasyon, üyelik ve rol bilgileriniz Supabase üzerinden doğrulanıyor. Firma verileri diğer müşterilerden tenant bazında izole ediliyor.</p></div>
          <strong>{organization.is_active ? "Aktif" : "Askıda"}</strong>
        </section>

        <section className="metric-grid">
          <article><small>Açık talepler</small><b>0</b><span>CRM veri modeli sırada</span></article>
          <article><small>Aktif iş akışları</small><b>0</b><span>Görev altyapısı hazırlanıyor</span></article>
          <article><small>Bekleyen tahsilat</small><b>₺0</b><span>Finans modülü hazırlanıyor</span></article>
          <article><small>Yetki seviyeniz</small><b className="role-metric">{roleName}</b><span>{membership.role?.code || "member"}</span></article>
        </section>

        <section className="module-grid">
          {modules.map(([name, description]) => <article key={name}><small>MODÜL</small><h3>{name}</h3><p>{description}</p><button type="button">Kurulum sırasına alındı</button></article>)}
        </section>
      </section>
    </main>
  );
}
