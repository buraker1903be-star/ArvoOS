import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { YETKI_GRUPLARI, acilabilirMi, gizliModulleriHesapla, varsayilanAcikMi } from "@/lib/yetkiler";
import { departmanaUygunProfiller, departmanTuru, profilUygulandiMi } from "@/lib/yetki-profilleri";
import { applyPermissionProfile, updateMemberPermissions } from "./actions";
import { StgIcon, StgSection } from "../settings-ui";
// Bileşen CSS'ini kendisi alıyor: personel detayındaki pencerede de
// kullanılıyor ve o rota settings.css'i başka yoldan yüklemiyor (AGENTS.md).
import "../settings.css";

/*
  KİŞİ YETKİLERİ — hazır profil, modül erişimi ve işlem yetkileri.

  İki yerde kullanılıyor: Ayarlar → Yetkilendirme → kişi sayfası ve
  (2026-10) personel detayında "Yetkiler" penceresi. Eskiden yalnızca
  Ayarlar'daydı; bir personelin neyi görebildiğine bakmak için personel
  sayfasından çıkıp Yetkilendirme'de kişiyi aramak gerekiyordu. Tek
  bileşen: iki ekran aynı kuralı ayrı ayrı yazıp zamanla ayrışmasın.

  Yetki: settings.yetki.yonet. Çağıran sayfa da denetliyor; burada
  ayrıca bakılıyor ki bileşen yeni bir yerde yetkisiz çizilmesin.
  Kaydetme işlemleri (updateMemberPermissions, applyPermissionProfile)
  yetkiyi sunucuda yeniden doğruluyor.
*/

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

export async function KisiYetkileri({ hedef }: { hedef: string }) {
  const { supabase, membership, izin } = await getPanelContext();
  if (!izin("settings.yetki.yonet")) {
    return <div className="stg-empty"><StgIcon name="lock" size={22} /><p>Kişi yetkilerini görüntüleme yetkiniz yok.</p></div>;
  }

  const org = membership.organization_id;
  const [{ data: uyelikVerisi, error: uyelikHatasi }, { data: personelSatiri }] = await Promise.all([
    supabase.from("organization_memberships").select("user_id,role,is_active")
      .eq("organization_id", org).eq("user_id", hedef).maybeSingle(),
    supabase.from("hr_employees").select("hr_departments(name)")
      .eq("organization_id", org).eq("user_id", hedef).maybeSingle(),
  ]);
  if (uyelikHatasi) throw new Error("Üyelik okunamadı: " + uyelikHatasi.message);
  if (!uyelikVerisi) return <div className="stg-empty"><StgIcon name="lock" size={22} /><p>Bu kişinin kurumda panel üyeliği yok.</p></div>;
  const uyelik = uyelikVerisi as { user_id: string; role: string; is_active: boolean };

  if (uyelik.role === "owner") {
    return <div className="stg-empty"><StgIcon name="shield" size={22} /><p>Kurum Sahibi kısıtlanamaz: kurumun tek kalan yetkilisi kendini dışarıda bırakabilirse kurum yönetilemez hâle gelir.</p></div>;
  }

  const [rolModulSonuc, rolYetkiSonuc, kisiModulSonuc, kisiYetkiSonuc] = await Promise.all([
    supabase.from("role_module_permissions").select("module_key,can_access").eq("organization_id", org).eq("role", uyelik.role),
    supabase.from("role_capability_permissions").select("capability_key,allowed").eq("organization_id", org).eq("role", uyelik.role),
    supabase.from("member_module_permissions").select("module_key,can_access").eq("organization_id", org).eq("user_id", hedef),
    supabase.from("member_capability_permissions").select("capability_key,allowed").eq("organization_id", org).eq("user_id", hedef),
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
  const istisnaSayisi = kisiModul.size + kisiYetki.size;
  const rolAdi = ROL_ETIKETI.get(uyelik.role) ?? uyelik.role;

  /* Özet: kişinin BUGÜN görebildiği modüller (rol kuralı + kişi istisnası,
     panelin kendi hesabıyla aynı: gizliModulleriHesapla). */
  const gizli = gizliModulleriHesapla({
    rol: uyelik.role,
    rolSatirlari: (rolModulSonuc.data ?? []) as { module_key: string; can_access: boolean }[],
    kisiSatirlari: (kisiModulSonuc.data ?? []) as { module_key: string; can_access: boolean }[],
  });
  const acikModuller = PERMISSION_MODULES.filter((m) => !gizli.has(m.key)).map((m) => m.label);

  /* Profiller kişinin departmanına göre: satış departmanı Satış Müdürü,
     operasyon departmanı Operasyon Müdürü (lib/yetki-profilleri.ts). İşlem
     de aynı kuralla reddediyor; burada yalnızca uymayanı göstermiyoruz. */
  const iliski = (personelSatiri as { hr_departments?: { name: string } | { name: string }[] | null } | null)?.hr_departments;
  const departmanAdi = Array.isArray(iliski) ? iliski[0]?.name : iliski?.name;
  const profiller = departmanaUygunProfiller(departmanAdi);
  const departmanNotu = departmanTuru(departmanAdi)
    ? `Departmanı (${departmanAdi}) için uygun profil gösteriliyor.`
    : "Departmanı satış ya da operasyon olarak tanınmadığı için iki profil de gösteriliyor.";

  return <div className="stg kisi-yetkileri">
    <p className="stg-muted kisi-yetki-ozet">
      <b>{rolAdi}</b>{uyelik.is_active ? "" : " · erişim kapalı"} · görebildiği modüller: {acikModuller.length ? acikModuller.join(", ") : "hiçbiri"}
      {istisnaSayisi ? ` · ${istisnaSayisi} kişisel istisna` : ""}
    </p>

    {/*
      HAZIR PROFİL. Aşağıdaki kutucukları tek tek işaretlemek esnek ama
      tekrar eden bir iş: "bu kişi operasyon müdürü olacak" dendiğinde aynı
      on beş karar elle veriliyor ve ikinci müdürde biri atlanıyor. Profil
      rolü, bütün modülleri ve tanım yeteneklerini bir adımda yazıyor;
      sonrasında her şey yine elle değiştirilebilir.
    */}
    <StgSection
      id="kisi-profil" wide icon="shield" tone="success"
      kicker="HAZIR KÜME" title="Yetki profili"
      description={`Sık kullanılan yetki kümelerini tek adımda uygular: rol, modül erişimleri ve profilin tanım yetenekleri. Profil dışındaki kişisel yetenek istisnaları silinir, geri kalan her şey rolden gelir. ${departmanNotu}`}
    >
      <div className="stg-list">
        {profiller.map((profil) => {
          const uygulandi = profilUygulandiMi(profil, {
            rol: uyelik.role,
            modulIstisnalari: kisiModul,
            yetkiIstisnalari: kisiYetki,
          }, PERMISSION_MODULES);
          return (
            <div key={profil.key}>
              <dt>{profil.label}</dt>
              <dd>
                <p className="stg-muted">{profil.aciklama}</p>
                <form action={applyPermissionProfile}>
                  <input type="hidden" name="user_id" value={hedef} />
                  <input type="hidden" name="profil" value={profil.key} />
                  {uygulandi ? <span className="stg-readonly"><StgIcon name="shield" size={14} />Bu profil uygulanmış</span> : null}
                  <button className={uygulandi ? "panel-secondary" : "panel-primary"} type="submit">
                    {uygulandi ? "Yeniden uygula" : `${profil.label} yap`}
                  </button>
                </form>
              </dd>
            </div>
          );
        })}
      </div>
    </StgSection>

    <form action={updateMemberPermissions}>
      <input type="hidden" name="user_id" value={hedef} />

      <StgSection
        id="kisi-modul" wide icon="grid" tone="info"
        kicker="KİŞİYE ÖZEL" title="Modül erişimi"
        description={`Varsayılan olarak her satır "${rolAdi}" rolünün kuralını izler. Bir modülü yalnızca bu kişi için açabilir ya da kapatabilirsiniz.`}
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
    </form>
  </div>;
}
