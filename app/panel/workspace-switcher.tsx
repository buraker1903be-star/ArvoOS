import Link from "next/link";
import type { PanelWorkspace } from "@/lib/panel-context";

type Props = {
  workspaces: PanelWorkspace[];
  activeOrganizationId: string;
  variant?: "topbar" | "sidebar";
};

function getLabel(slug: string) {
  return slug === "arvo-os" ? "ArvoOS Platform" : "AkademikMerkez";
}

export function WorkspaceSwitcher({ workspaces, activeOrganizationId, variant = "topbar" }: Props) {
  if (workspaces.length < 2) return null;

  if (variant === "sidebar") {
    return <div className="sidebar-workspace-switcher" aria-label="Çalışma alanları">
      <small>ÇALIŞMA ALANI SEÇ</small>
      <div className="sidebar-workspace-list">
        {workspaces.map((workspace) => {
          const active = workspace.organizationId === activeOrganizationId;
          const label = getLabel(workspace.organization.slug);
          const content = <>
            <span>{label.slice(0, 1)}</span>
            <p><b>{label}</b><small>{active ? "Aktif çalışma alanı" : "Geçiş yap"}</small></p>
            <i>{active ? "✓" : "→"}</i>
          </>;

          return active
            ? <div className="sidebar-workspace-item active" key={workspace.organizationId} aria-current="page">{content}</div>
            : <Link className="sidebar-workspace-item" href={`/panel/switch?organization_id=${encodeURIComponent(workspace.organizationId)}`} key={workspace.organizationId} prefetch={false}>{content}</Link>;
        })}
      </div>
    </div>;
  }

  return <details className="workspace-switcher">
    <summary aria-label="Çalışma alanını değiştir">
      <span aria-hidden="true">⇄</span>
      <b>Çalışma Alanı</b>
    </summary>
    <div className="workspace-switcher-menu">
      <small>ÇALIŞMA ALANLARI</small>
      {workspaces.map((workspace) => {
        const active = workspace.organizationId === activeOrganizationId;
        const label = getLabel(workspace.organization.slug);

        if (active) {
          return <div className="workspace-switcher-item active" key={workspace.organizationId} aria-current="page">
            <span>{label.slice(0, 1).toUpperCase()}</span>
            <p><b>{label}</b><small>{workspace.role === "owner" ? "Owner" : workspace.role}</small></p>
            <i>✓</i>
          </div>;
        }

        return <Link className="workspace-switcher-item" href={`/panel/switch?organization_id=${encodeURIComponent(workspace.organizationId)}`} key={workspace.organizationId} prefetch={false}>
          <span>{label.slice(0, 1).toUpperCase()}</span>
          <p><b>{label}</b><small>{workspace.role === "owner" ? "Owner" : workspace.role}</small></p>
          <i>→</i>
        </Link>;
      })}
    </div>
  </details>;
}
