import Link from "next/link";
import { kimlikMi } from "@/lib/kimlik";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_ROLES } from "@/lib/role-permissions";
import { KisiYetkileri } from "../kisi-yetkileri";
import { StgIcon } from "../../settings-ui";
import "../../settings.css";

const ROL_ETIKETI = new Map(PERMISSION_ROLES.map((role) => [role.key as string, role.label as string]));

/*
  Ayarlar → Yetkilendirme → kişi. Gövde (profil, modüller, işlem
  yetkileri) ortak bileşende (../kisi-yetkileri.tsx): aynı ekran
  2026-10'dan beri personel detayında "Yetkiler" penceresi olarak da
  açılıyor. Burada yalnızca sayfa başlığı ve geri dönüş bağlantısı kaldı.
*/
export default async function MemberPermissionsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: hedef } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa onu çökme ekranına çeviriyordu. */
  if (!kimlikMi(hedef)) notFound();
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
  const ad = personel?.full_name ?? "Adı personel kaydında yok";

  return <div className="stg">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">YÖNETİM · YETKİLENDİRME</small>
        <h1>{ad}{hedef === userId ? " (siz)" : ""}</h1>
        <p>{[ROL_ETIKETI.get(uyelik.role) ?? uyelik.role, personel?.job_title, personel?.email, uyelik.is_active ? null : "erişim kapalı"].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/settings/permissions">← Yetkilendirmeye dön</Link></div>
    </div>
    <KisiYetkileri hedef={hedef} />
  </div>;
}
