import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { updateModulePermissions } from "./actions";

export default async function PermissionsPage() {
  const { supabase, membership } = await getPanelContext();
  const canManage = ["owner", "admin"].includes(membership.role);

  if (!canManage) {
    return <>
      <div className="panel-pagehead"><div><small className="panel-kicker">YÖNETİM</small><h1>Yetkilendirme</h1></div></div>
      <div className="panel-card panel-empty">Bu sayfayı görüntüleme yetkiniz yok.</div>
    </>;
  }

  const { data: permissionRows } = await supabase
    .from("role_module_permissions")
    .select("role,module_key,can_access")
    .eq("organization_id", membership.organization_id);

  // Bir satır olmaması "erişebilir" (varsayılan açık) anlamına gelir.
  const deniedSet = new Set(
    (permissionRows ?? []).filter((row) => row.can_access === false).map((row) => `${row.role}:${row.module_key}`)
  );

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM</small><h1>Yetkilendirme</h1><p>Hangi personel rolünün hangi modülleri görebileceğini belirleyin. Kurum Sahibi her zaman tüm modüllere erişir.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings">← Ayarlara dön</Link></div>
    </div>

    <form className="panel-card permissions-form" action={updateModulePermissions}>
      <table className="permissions-table">
        <thead>
          <tr>
            <th>Modül</th>
            {PERMISSION_ROLES.map((role) => <th key={role.key}>{role.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((module) => (
            <tr key={module.key}>
              <td className="permissions-module-name">{module.label}</td>
              {PERMISSION_ROLES.map((role) => {
                const denied = deniedSet.has(`${role.key}:${module.key}`);
                return <td key={role.key} className="permissions-cell">
                  <label className="permissions-checkbox">
                    <input type="checkbox" name={`perm:${role.key}:${module.key}`} defaultChecked={!denied} />
                  </label>
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="panel-form-actions"><button className="panel-primary" type="submit">Yetkilendirmeyi Kaydet</button></div>
    </form>
  </>;
}
