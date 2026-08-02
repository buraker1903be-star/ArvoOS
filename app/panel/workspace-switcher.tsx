import { switchWorkspace } from "./actions";
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
        return <form action={switchWorkspace} key={workspace.organizationId}>
          <input type="hidden" name="organization_id" value={workspace.organizationId} />
          <button type="submit" className={active ? "active" : ""} disabled={active}>
            <span>{workspace.organization.name.slice(0, 1).toUpperCase()}</span>
            <p><b>{workspace.organization.slug === "arvo-os" ? "ArvoOS Platform" : workspace.organization.name}</b><small>{workspace.role === "owner" ? "Owner" : workspace.role}</small></p>
            <i>{active ? "✓" : "→"}</i>
          </button>
        </form>;
      })}
    </div>
  </details>;
}
