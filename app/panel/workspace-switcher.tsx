import Link from "next/link";
import type { PanelWorkspace } from "@/lib/panel-context";

type Props = {
  workspaces: PanelWorkspace[];
  activeOrganizationId: string;
};

export function WorkspaceSwitcher({ workspaces, activeOrganizationId }: Props) {
  if (workspaces.length < 2) return null;

  return <details className="workspace-switcher">
    <summary aria-label="Çalışma alanını değiştir">
      <span aria-hidden="true">⇄</span>
      <b>Çalışma Alanı</b>
    </summary>
    <div className="workspace-switcher-menu">
      <small>ÇALIŞMA ALANLARI</small>
      {workspaces.map((workspace) => {
        const active = workspace.organizationId === activeOrganizationId;
        const label = workspace.organization.slug === "arvo-os" ? "ArvoOS Platform" : "AkademikMerkez";

        if (active) {
          return <div className="workspace-switcher-item active" key={workspace.organizationId} aria-current="page">
            <span>{label.slice(0, 1).toUpperCase()}</span>
            <p><b>{label}</b><small>{workspace.role === "owner" ? "Owner" : workspace.role}</small></p>
            <i>✓</i>
          </div>;
        }

        return <Link
          className="workspace-switcher-item"
          href={`/panel/switch?organization_id=${encodeURIComponent(workspace.organizationId)}`}
          key={workspace.organizationId}
          prefetch={false}
        >
          <span>{label.slice(0, 1).toUpperCase()}</span>
          <p><b>{label}</b><small>{workspace.role === "owner" ? "Owner" : workspace.role}</small></p>
          <i>→</i>
        </Link>;
      })}
    </div>
  </details>;
}
