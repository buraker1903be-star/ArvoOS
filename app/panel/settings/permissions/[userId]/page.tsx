import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { YETKI_GRUPLARI, acilabilirMi, varsayilanAcikMi } from "@/lib/yetkiler";
import { updateMemberPermissions } from "../actions";
import { StgIcon, StgSection } from "../../settings-ui";
import "../../settings.css";

const ROL_ETIKETI = new Map(PERMISSION_ROLES.map((role) => [role.key as string, role.label as string]));

/*
  Üç değerli seçim. "Rolden gelen" bir KARAR değil, kararın yokluğu: istisna
  satırı silinir ve kişi rolün bugünkü kuralını izler. Rol kuralı sonradan
  değişince de izlemeye devam eder — iki değerli bir kutucuk bunu ifade
  edemezdi, kişiyi sessizce eski kararda dondururdu.
*/
function UcDurum({ ad, deger, rolDegeri, etiket }: { ad: string; deger: "rolden" | "acik" | "kapali"; rolDegeri: boolean; etiket: string }) {
  return (
    <select className="stg-ucdurum" name={ad} defaultValue={deger} aria-label={etiket} data-deger={deger}>
      <option value="rolden">Rolden gelen ({rolDegeri ? "açık" : "kapalı"})</option>
      <option value="acik">Açık</option>
      <option value="kapali">Kapalı</option>
    </select>
  );
}

export default async function MemberPermissionsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: hedef } = await params;
  const { supabase, membership, userId, izin } = await getPanelContext();

  if (!izin("settings.yetki.yonet")) {
    return <div className="stg">
      <div className="panel-pagehead"><div><small className="panel-kicker">YÖNETİM</small><h1>Kişi yetkileri</h1></div></div>
      <div className="stg-empty"><StgIcon name="lock" size={22} /><p>Bu sayfayı görüntüleme yetkiniz yok.</p></div>
    </div>;
  }

  const [uyelikSonuc, personelSonuc] = await Promise.all([
    supabase.from("organization_memberships").select("user_id,role,is_active")
      .eq("organization_id", membership.organization_id).eq("user_id", hedef).maybeSingle(),
    supabase.from("hr_employees").select("full_name,job_title,email")
      .eq("organization_id", membership.organization_id).eq("user_id", hedef).maybeSingle(),
  ]);
  if (uyelikSonuc.error) throw new Error("Üyelik okunamadı: " + uyelikSonuc.error.message);
  if (!uyelikSonuc.data) notFound();
  const uyelik = uyelikSonuc.data as { user_id: string; role: string; is_active: boolean };
  const personel = personelSonuc.data as { full_name: string; job_title: string | null; email: string | null } | null;

  const [rolModulSonuc, rolYetkiSonuc, kisiModulSonuc, kisiYetkiSonuc] = await Promise.all([
    supabase.from("role_module_permissions").select("module_key,can_access")
      .eq("organization_id", membership.organization_id).eq("role", uyelik.role),
    supabase.from("role_capability_permissions").select("capability_key,allowed")
      .eq("organization_id", membership.organization_id).eq("role", uyelik.role),
    supabase.from("member_module_permissions").select("module_key,can_access")
      .eq("organization_id", membership.organization_id).eq("user_id", hedef),
    supabase.from("member_capability_permissions").select("capability_key,allowed")
      .eq("organization_id", membership.organization_id).eq("user_id", hedef),
  ]);
  for (const [sonuc, ad] of [
    [rolModulSonuc, "Rol modül erişimi"], [rolYetkiSonuc, "Rol yetkileri"],
    [kisiModulSonuc, "Kişi modül istisnaları"], [kisiYetkiSonuc, "Kişi yetki istisnaları"],
  ] as const) {
    if (sonuc.error) throw new Error(`${ad} okunamadı: ${sonuc.error.message}`);
  }

  const rolModul = new Map((rolModulSonuc.data ?? []).map((row) => [row.module_key as string, row.can_access as boolean]));
  const rolYetki = new Map((rolYetkiSonuc.data ?? []).map((row) => [row.capability_key as string, row.allowed as boolean]));
  const kisiModul = new Map((kisiModulSonuc.data ?? []).map((row) => [row.module_key as string, row.can_access as boolean]));
  const kisiYetki = new Map((kisiYetkiSonuc.data ?? []).map((row) => [row.capability_key as string, row.allowed as boolean]));

  const durum = (istisna: Map<string, boolean>, key: string): "rolden" | "acik" | "kapali" =>
    !istisna.has(key) ? "rolden" : istisna.get(key)! ? "acik" : "kapali";

  const ad = personel?.full_name ?? "Adı personel kaydında yok";
  const istisnaSayisi = kisiModul.size + kisiYetki.size;
  const sahipMi = uyelik.role === "owner";

  return <div className="stg">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">YÖNETİM · YETKİLENDİRME</small>
        <h1>{ad}{hedef === userId ? " (siz)" : ""}</h1>
        <p>{[ROL_ETIKETI.get(uyelik.role) ?? uyelik.role, personel?.job_title, personel?.email, uyelik.is_active ? null : "erişim kapalı"].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings/permissions">← Yetkilendirmeye dön</Link></div>
    </div>

    {sahipMi
      ? <div className="stg-empty"><StgIcon name="shield" size={22} /><p>Kurum Sahibi kısıtlanamaz: kurumun tek kalan yetkilisi kendini dışarıda bırakabilirse kurum yönetilemez hâle gelir.</p></div>
      : <form action={updateMemberPermissions}>
          <input type="hidden" name="user_id" value={hedef} />

          <StgSection
            id="kisi-modul" wide icon="grid" tone="info"
            kicker="KİŞİYE ÖZEL" title="Modül erişimi"
            description={`Varsayılan olarak her satır "${ROL_ETIKETI.get(uyelik.role) ?? uyelik.role}" rolünün kuralını izler. Bir modülü yalnızca bu kişi için açabilir ya da kapatabilirsiniz.`}
            aside={istisnaSayisi ? <span className="stg-readonly"><StgIcon name="shield" size={14} />{istisnaSayisi} istisna</span> : null}
          >
            <div className="stg-list">
              {PERMISSION_MODULES.map((module) => (
                <div key={module.key}>
                  <dt>{module.label}</dt>
                  <dd>
                    <UcDurum
                      ad={`mmod:${module.key}`}
                      deger={durum(kisiModul, module.key)}
                      rolDegeri={rolModul.has(module.key) ? rolModul.get(module.key)! : true}
                      etiket={`${module.label} · modül erişimi`}
                    />
                  </dd>
                </div>
              ))}
            </div>
          </StgSection>

          {YETKI_GRUPLARI.map((grup) => (
            <StgSection
              key={grup.baslik} id={`kisi-${grup.baslik}`} wide icon="shield" tone="neutral"
              kicker="KİŞİYE ÖZEL YETKİ" title={grup.baslik}
              description="Modülü kapalı olanın o modüldeki yetkileri de kapalıdır; görmediği ekranda silme yetkisi işe yaramaz."
            >
              <div className="stg-list">
                {grup.yetkiler.map((yetki) => (
                  <div key={yetki.key}>
                    <dt><b>{yetki.label}</b><small>{yetki.aciklama}</small></dt>
                    <dd>
                      {acilabilirMi(uyelik.role, yetki.key)
                        ? <UcDurum
                            ad={`mcap:${yetki.key}`}
                            deger={durum(kisiYetki, yetki.key)}
                            rolDegeri={rolYetki.has(yetki.key) ? rolYetki.get(yetki.key)! : varsayilanAcikMi(uyelik.role, yetki.key)}
                            etiket={`${yetki.label} · kişi yetkisi`}
                          />
                        /* Veritabanı politikası da bu rolü dışarıda bıraktığı için
                           tek kişiye açmak işe yaramaz; açıkça söylüyoruz. */
                        : <span className="stg-readonly"><StgIcon name="lock" size={14} />Veritabanı kuralı gereği kapalı</span>}
                    </dd>
                  </div>
                ))}
              </div>
            </StgSection>
          ))}

          <div className="stg-savebar">
            <p><StgIcon name="lock" size={16} />İstisna rol kuralını ezer. &quot;Rolden gelen&quot; seçilen satırın istisnası silinir.</p>
            <button className="panel-primary" type="submit">Kişi Yetkilerini Kaydet</button>
          </div>
        </form>}
  </div>;
}
