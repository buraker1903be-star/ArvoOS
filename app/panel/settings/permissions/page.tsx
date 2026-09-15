import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { updateModulePermissions } from "./actions";
import { StgIcon, StgSection } from "../settings-ui";
import "../settings.css";

const moduleMeta: Record<string, { icon: string; note: string }> = {
  crm: { icon: "users", note: "Talepler, teklifler, sözleşmeler" },
  operations: { icon: "briefcase", note: "İşler, termin, müşteri dosyaları" },
  finance: { icon: "wallet", note: "Cari, tahsilat, maliyet" },
  hr: { icon: "building", note: "Personel, prim, gizlilik" },
  documents: { icon: "folder", note: "Belge merkezi" },
  // Raporlar Finans'ın sekmesi; Finans'ı yalnızca Kurum Sahibi ve Yönetici görür
  reports: { icon: "chart", note: "Finans → Raporlar sekmesi · yalnızca Kurum Sahibi ve Yönetici" },
};

export default async function PermissionsPage() {
  const { supabase, membership } = await getPanelContext();
  const canManage = ["owner", "admin"].includes(membership.role);

  if (!canManage) {
    return <div className="stg">
      <div className="panel-pagehead"><div><small className="panel-kicker">YÖNETİM</small><h1>Yetkilendirme</h1></div><div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings">← Ayarlara dön</Link></div></div>
      <div className="stg-empty"><StgIcon name="lock" size={22} /><p>Bu sayfayı yalnızca kurum sahibi veya yönetici görüntüleyebilir.</p></div>
    </div>;
  }

  const { data: permissionRows } = await supabase
    .from("role_module_permissions")
    .select("role,module_key,can_access")
    .eq("organization_id", membership.organization_id);

  // Bir satır olmaması "erişebilir" (varsayılan açık) anlamına gelir.
  const deniedSet = new Set(
    (permissionRows ?? []).filter((row) => row.can_access === false).map((row) => `${row.role}:${row.module_key}`)
  );

  return <div className="stg">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM · AYARLAR</small><h1>Yetkilendirme</h1><p>Hangi personel rolünün hangi modülleri görebileceğini belirleyin.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings">← Ayarlara dön</Link></div>
    </div>

    <StgSection
      id="yetki-matrisi" wide icon="shield" tone="success"
      kicker="ROL VE MODÜL ERİŞİMİ" title="Erişim matrisi"
      description="Açık anahtar, o rolün modülü menüde görüp kullanabileceği anlamına gelir. Kapatılan modülün sayfaları ve işlemleri o role kapanır."
    >
      <div className="stg-roles" aria-label="Roller">
        <span className="is-owner"><StgIcon name="shield" size={14} />Kurum Sahibi · her zaman tam erişim</span>
        {PERMISSION_ROLES.map((role) => <span key={role.key}>{role.label}</span>)}
      </div>

      <form action={updateModulePermissions}>
        <div className="stg-perm-scroll">
          <table className="stg-perm">
            <thead>
              <tr>
                <th scope="col">Modül</th>
                {PERMISSION_ROLES.map((role) => <th scope="col" key={role.key}>{role.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((module) => {
                const meta = moduleMeta[module.key] ?? { icon: "grid", note: "" };
                return (
                  <tr key={module.key}>
                    <th scope="row">
                      <span className="stg-perm-module">
                        <span className="stg-row-icon" data-tone="info"><StgIcon name={meta.icon} size={16} /></span>
                        <span><b>{module.label}</b>{meta.note ? <small>{meta.note}</small> : null}</span>
                      </span>
                    </th>
                    {PERMISSION_ROLES.map((role) => {
                      const denied = deniedSet.has(`${role.key}:${module.key}`);
                      return <td key={role.key} data-label={role.label}>
                        <label className="stg-switch">
                          <input type="checkbox" role="switch" name={`perm:${role.key}:${module.key}`} defaultChecked={!denied} aria-label={`${role.label} · ${module.label}`} />
                          <span aria-hidden="true" />
                        </label>
                      </td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="stg-savebar">
          <p><StgIcon name="lock" size={16} />Kurum Sahibi kısıtlanamaz; kimse kurumun dışında kalmaz.</p>
          <button className="panel-primary" type="submit">Yetkilendirmeyi Kaydet</button>
        </div>
      </form>
    </StgSection>
  </div>;
}
