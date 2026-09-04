"use client";

import type { ChangeEvent } from "react";
import type { PanelWorkspace } from "@/lib/panel-context";

type Props = {
  workspaces: PanelWorkspace[];
  activeOrganizationId: string;
  variant?: "topbar" | "card";
};

// Kurumun kendi markası. Eskiden burada iki kiracı varsayımı gömülüydü
// ("arvo-os" değilse hep "AkademikMerkez"), bu yüzden üçüncü bir marka
// eklendiğinde seçicide yanlış isim çıkıyordu.
function getLabel(organization: PanelWorkspace["organization"]) {
  return organization.display_name || organization.name;
}

export function WorkspaceSwitcher({ workspaces, activeOrganizationId, variant = "topbar" }: Props) {
  if (workspaces.length < 2) return null;

  if (variant === "card") {
    const activeWorkspace = workspaces.find((workspace) => workspace.organizationId === activeOrganizationId) ?? workspaces[0];

    function handleChange(event: ChangeEvent<HTMLSelectElement>) {
      const organizationId = event.target.value;
      if (!organizationId || organizationId === activeOrganizationId) return;
      window.location.assign(`/panel/switch?organization_id=${encodeURIComponent(organizationId)}`);
    }

    return <div className="workspace-card-select">
      <small>ÇALIŞMA ALANI</small>
      <div className="workspace-card-control">
        <span>{getLabel(activeWorkspace.organization).slice(0, 1)}</span>
        <select
          aria-label="Çalışma alanını değiştir"
          value={activeOrganizationId}
          onChange={handleChange}
        >
          {workspaces.map((workspace) => <option key={workspace.organizationId} value={workspace.organizationId}>
            {getLabel(workspace.organization)}
          </option>)}
        </select>
        <i aria-hidden="true">⌄</i>
      </div>
      <em>{activeWorkspace.organization.plan_code} paket</em>
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
        const label = getLabel(workspace.organization);
        return active
          ? <div className="workspace-switcher-item active" key={workspace.organizationId} aria-current="page"><span>{label.slice(0, 1)}</span><p><b>{label}</b><small>Aktif</small></p><i>✓</i></div>
          : <button className="workspace-switcher-item" key={workspace.organizationId} type="button" onClick={() => window.location.assign(`/panel/switch?organization_id=${encodeURIComponent(workspace.organizationId)}`)}><span>{label.slice(0, 1)}</span><p><b>{label}</b><small>Geçiş yap</small></p><i>→</i></button>;
      })}
    </div>
  </details>;
}
