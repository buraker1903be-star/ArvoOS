import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { YETKI_GRUPLARI, acilabilirMi, varsayilanAcikMi } from "@/lib/yetkiler";
import { updateCapabilityPermissions, updateModulePermissions } from "./actions";
import { StgIcon, StgSection } from "../settings-ui";
import "../settings.css";

const moduleMeta: Record<string, { icon: string; note: string }> = {
  crm: { icon: "users", note: "Talepler, teklifler, sözleşmeler" },
  operations: { icon: "briefcase", note: "İşler, termin, müşteri dosyaları" },
  finance: { icon: "wallet", note: "Cari, tahsilat, maliyet" },
  hr: { icon: "building", note: "Personel, prim, gizlilik" },
  documents: { icon: "folder", note: "Belge merkezi" },
  posta: { icon: "chat", note: "Ortak gelen kutusu" },
  reports: { icon: "chart", note: "Finans → Raporlar sekmesi" },
};

const ROL_ETIKETI = new Map<string, string>([
  ["owner", "Kurum Sahibi"],
  ...PERMISSION_ROLES.map((role) => [role.key, role.label] as [string, string]),
]);

type Uyelik = { user_id: string; role: string; is_active: boolean };
type Personel = { user_id: string | null; full_name: string; job_title: string | null };

export default async function PermissionsPage() {
  const { supabase, membership, userId, izin } = await getPanelContext();

  if (!izin("settings.yetki.yonet")) {
    return <div className="stg">
      <div className="panel-pagehead"><div><small className="panel-kicker">YÖNETİM</small><h1>Yetkilendirme</h1></div><div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings">← Ayarlara dön</Link></div></div>
      <div className="stg-empty"><StgIcon name="lock" size={22} /><p>Bu sayfayı görüntüleme yetkiniz yok.</p></div>
    </div>;
  }

  const [modulSonuc, yetkiSonuc, uyelikSonuc, personelSonuc, kisiYetkiSonuc, kisiModulSonuc] = await Promise.all([
    supabase.from("role_module_permissions").select("role,module_key,can_access").eq("organization_id", membership.organization_id),
    supabase.from("role_capability_permissions").select("role,capability_key,allowed").eq("organization_id", membership.organization_id),
    supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", membership.organization_id),
    supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", membership.organization_id),
    supabase.from("member_capability_permissions").select("user_id").eq("organization_id", membership.organization_id),
    supabase.from("member_module_permissions").select("user_id").eq("organization_id", membership.organization_id),
  ]);
  // Sessiz boş liste yetkiyi "kısıt yok" gibi gösterir; okunamadıysa söyle.
  for (const [sonuc, ad] of [
    [modulSonuc, "Modül erişimi"], [yetkiSonuc, "Rol yetkileri"], [uyelikSonuc, "Ekip üyeleri"],
    [personelSonuc, "Personel kayıtları"], [kisiYetkiSonuc, "Kişi yetki istisnaları"], [kisiModulSonuc, "Kişi modül istisnaları"],
  ] as const) {
    if (sonuc.error) throw new Error(`${ad} okunamadı: ${sonuc.error.message}`);
  }

  // Bir satır olmaması "erişebilir" (varsayılan açık) anlamına gelir.
  const modulKapali = new Set((modulSonuc.data ?? []).filter((row) => row.can_access === false).map((row) => `${row.role}:${row.module_key}`));
  const yetkiKurali = new Map((yetkiSonuc.data ?? []).map((row) => [`${row.role}:${row.capability_key}`, row.allowed as boolean]));

  const uyelikler = ((uyelikSonuc.data ?? []) as Uyelik[]).filter((uyelik) => uyelik.role !== "owner");
  const personelAdi = new Map(((personelSonuc.data ?? []) as Personel[])
    .filter((personel) => personel.user_id)
    .map((personel) => [personel.user_id as string, personel]));
  const istisnaliKisiler = new Set([
    ...(kisiYetkiSonuc.data ?? []).map((row) => row.user_id as string),
    ...(kisiModulSonuc.data ?? []).map((row) => row.user_id as string),
  ]);

  const yetkiAcikMi = (rol: string, key: string) =>
    yetkiKurali.has(`${rol}:${key}`) ? yetkiKurali.get(`${rol}:${key}`)! : varsayilanAcikMi(rol, key);

  return <div className="stg">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM · AYARLAR</small><h1>Yetkilendirme</h1><p>Hangi rol hangi modülü görür, hangi işlemi yapar; gerekirse tek bir kişi için istisna tanımlayın.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings">← Ayarlara dön</Link></div>
    </div>

    <StgSection
      id="yetki-matrisi" wide icon="shield" tone="success"
      kicker="ROL VE MODÜL ERİŞİMİ" title="Modül erişimi"
      description="Açık anahtar, o rolün modülü menüde görüp kullanabileceği anlamına gelir. Kapatılan modülün sayfaları, sunucu işlemleri ve o modüle bağlı yetkilerin tamamı o role kapanır."
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
                      const kapali = modulKapali.has(`${role.key}:${module.key}`);
                      return <td key={role.key} data-label={role.label}>
                        <label className="stg-switch">
                          <input type="checkbox" role="switch" name={`perm:${role.key}:${module.key}`} defaultChecked={!kapali} aria-label={`${role.label} · ${module.label}`} />
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
          <button className="panel-primary" type="submit">Modül Erişimini Kaydet</button>
        </div>
      </form>
    </StgSection>

    <StgSection
      id="yetenek-matrisi" wide icon="grid" tone="info"
      kicker="İŞLEM YETKİLERİ" title="Rol yetkileri"
      description="Modülü görmek ile o modülde iş yapmak ayrı sorular. Buradaki her satır tek bir işleme karşılık gelir; kapatıldığında hem düğme kaybolur hem sunucu işlemi reddeder. Modülü kapalı olan rolde, o modülün yetkileri de kapalıdır."
    >
      <form action={updateCapabilityPermissions}>
        {YETKI_GRUPLARI.map((grup) => (
          <div className="stg-perm-group" key={grup.baslik}>
            <h3>{grup.baslik}</h3>
            <div className="stg-perm-scroll">
              <table className="stg-perm">
                <thead>
                  <tr>
                    <th scope="col">Yetki</th>
                    {PERMISSION_ROLES.map((role) => <th scope="col" key={role.key}>{role.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grup.yetkiler.map((yetki) => (
                    <tr key={yetki.key}>
                      <th scope="row">
                        <span className="stg-perm-module">
                          <span><b>{yetki.label}</b><small>{yetki.aciklama}</small></span>
                        </span>
                      </th>
                      {PERMISSION_ROLES.map((role) => {
                        const modulKapaliMi = Boolean(yetki.modul) && modulKapali.has(`${role.key}:${yetki.modul}`);
                        /* RLS de aynı kuralı uyguluyorsa bu hücre açılamaz: açık
                           bir anahtar düğmeyi gösterir, veritabanı satırı eler.
                           Kapanmayan bir anahtar yerine kilit gösteriyoruz. */
                        if (!acilabilirMi(role.key, yetki.key)) {
                          return <td key={role.key} data-label={role.label}>
                            <span className="stg-kilit" title="Bu işlemi veritabanı kuralı da sınırlıyor; panelden açılamaz.">
                              <StgIcon name="lock" size={14} />
                            </span>
                          </td>;
                        }
                        return <td key={role.key} data-label={role.label}>
                          <label className="stg-switch" title={modulKapaliMi ? "Bu rolde modül kapalı: yetki açık olsa da kullanılamaz." : undefined}>
                            <input type="checkbox" role="switch" name={`cap:${role.key}:${yetki.key}`} defaultChecked={yetkiAcikMi(role.key, yetki.key)} aria-label={`${role.label} · ${yetki.label}`} />
                            <span aria-hidden="true" data-pasif={modulKapaliMi ? "evet" : undefined} />
                          </label>
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <div className="stg-savebar">
          <p><StgIcon name="lock" size={16} />Kilitli hücreler veritabanı kuralına bağlı: kısıtlanabilir, açılamaz. Kendi Yetkilendirme yetkinizi de kapatamazsınız.</p>
          <button className="panel-primary" type="submit">Yetkileri Kaydet</button>
        </div>
      </form>
    </StgSection>

    <StgSection
      id="kisi-yetkileri" wide icon="users" tone="gold"
      kicker="KİŞİ BAZLI İSTİSNA" title="Kişiler"
      description="Rol kuralı ekibin tamamı için geçerli. Bir kişiye fazladan yetki vermek ya da onda kapatmak için satırı açın; istisna o kişinin rol kuralını ezer."
    >
      {uyelikler.length === 0
        ? <div className="stg-empty"><StgIcon name="users" size={22} /><p>Kurum Sahibi dışında kayıtlı ekip üyesi yok.</p></div>
        : <div className="stg-list">
            {uyelikler.map((uyelik) => {
              const personel = personelAdi.get(uyelik.user_id);
              const ad = personel?.full_name ?? "Adı personel kaydında yok";
              const istisna = istisnaliKisiler.has(uyelik.user_id);
              const notlar = [
                ROL_ETIKETI.get(uyelik.role) ?? uyelik.role,
                personel?.job_title || null,
                uyelik.is_active ? null : "erişim kapalı",
                istisna ? "kişiye özel istisna var" : null,
              ].filter(Boolean).join(" · ");
              return <Link className="stg-link-row" key={uyelik.user_id} href={`/panel/settings/permissions/${uyelik.user_id}`}>
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone={istisna ? "gold" : "neutral"}><StgIcon name="users" size={16} /></span>
                  <span><b>{ad}{uyelik.user_id === userId ? " (siz)" : ""}</b><small>{notlar}</small></span>
                </span>
                <StgIcon name="chevron" size={16} />
              </Link>;
            })}
          </div>}
    </StgSection>
  </div>;
}
