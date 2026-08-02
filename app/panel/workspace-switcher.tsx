import type { PanelWorkspace } from "@/lib/panel-context";

type Props = {
  workspaces: PanelWorkspace[];
  activeOrganizationId: string;
  variant?: "topbar" | "sidebar";
};

function getLabel(slug: string) {
  return slug === "arvo-os" ? "ArvoOS Platform" : "AkademikMerkez";
}

function SwitchForm({ workspace, className, children }: { workspace: PanelWorkspace; className: string; children: React.ReactNode }) {
  return <form action="/panel/switch" method="get" className="workspace-switch-form">
    <input type="hidden" name="organization_id" value={workspace.organizationId} />
    <button type="submit" className={className}>{children}</button>
  </form>;
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
            : <SwitchForm className="sidebar-workspace-item" key={workspace.organizationId} workspace={workspace}>{content}</SwitchForm>;
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
        const content = <>
          <span>{label.slice(0, 1).toUpperCase()}</span>
          <p><b>{label}</b><small>{workspace.role === "owner" ? "Owner" : workspace.role}</small></p>
          <i>{active ? "✓" : "→"}</i>
        </>;

        return active
          ? <div className="workspace-switcher-item active" key={workspace.organizationId} aria-current="page">{content}</div>
          : <SwitchForm className="workspace-switcher-item" key={workspace.organizationId} workspace={workspace}>{content}</SwitchForm>;
      })}
    </div>
  </details>;
}
