/* Kuruma özel durum sorgulama sayfalarının (/durum/[slug] ve özel alan
   adındaki /is-durumu) ortak kabuğu. Veri çekmez; sayfa kurumu bulur ve
   buraya verir. */

import type { CSSProperties, ReactNode } from "react";
import { IconLock, IconSearch, IconShield } from "./status-view";

type OrgBranding = { name: string; logo_url?: string | null; primary_color?: string | null };

export function OrgLookupShell({ org, title, description, children }: { org: OrgBranding; title: string; description: string; children: ReactNode }) {
  // Kurum rengi yoksa değişken basılmaz; CSS şampanya altınına düşer.
  const style = org.primary_color ? ({ "--status-accent": org.primary_color } as CSSProperties) : undefined;
  return (
    <main className="status-lookup-shell" style={style}>
      <header className="trk-topbar">
        <div className="trk-topbar-inner">
          <div className="trk-org">
            {org.logo_url ? (
              // Kurum logosu harici, boyutu bilinmeyen bir URL (bkz. eslint.config.mjs).
              <img src={org.logo_url} alt={org.name} className="trk-org-logo" />
            ) : (
              <span className="trk-org-name">{org.name}</span>
            )}
          </div>
          <span className="trk-secure"><IconLock size={14} />Güvenli bağlantı</span>
        </div>
      </header>
      <div className="trk-org-page">
        <section className="trk-card trk-lookup-card" aria-labelledby="trk-lookup-title">
          <span className="trk-card-icon" aria-hidden="true"><IconSearch size={22} /></span>
          <h1 id="trk-lookup-title">{title}</h1>
          <p className="trk-lookup-lead">{description}</p>
          {children}
          <p className="trk-privacy"><IconShield />Bilgileriniz şifreli bağlantı üzerinden korunur.</p>
        </section>
      </div>
    </main>
  );
}

/* Kurum bilgisi gelene kadar gösterilen iskelet (loading.tsx). */
export function OrgLookupLoading() {
  return (
    <main className="status-lookup-shell" aria-busy="true">
      <div className="trk-topbar">
        <div className="trk-topbar-inner"><span className="trk-skel" style={{ width: 132, height: 24 }} /></div>
      </div>
      <div className="trk-org-page">
        <section className="trk-card trk-lookup-card">
          <span className="trk-sr" role="status">Sayfa yükleniyor…</span>
          <div className="trk-skeleton" aria-hidden="true">
            <span className="trk-skel" style={{ width: 48, height: 48, borderRadius: 14 }} />
            <span className="trk-skel" style={{ width: "55%", height: 28 }} />
            <span className="trk-skel" style={{ width: "90%", height: 16 }} />
            <span className="trk-skel" style={{ height: 60, borderRadius: 14 }} />
            <span className="trk-skel" style={{ height: 52, borderRadius: 14 }} />
          </div>
        </section>
      </div>
    </main>
  );
}
