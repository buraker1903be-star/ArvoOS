import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { canSeeHrRecords } from "../hr-tabs";
import { relativeTime } from "../../crm/last-contact";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, seriBaslangici, simdi } from "../../os/genel-bakis";

// İK genel bakış: ekip durumunun özeti. Ana ekranla aynı şablon
// (os/genel-bakis.tsx, 2026-10): son 14 günde panele giren kişi grafiği ve
// dört liste. Eskiden üstte beş sayı kartı vardı. Her kart, ayrıntısını gösteren
// sayfanın yetki kuralıyla görünür: panel erişimi ve davetler Kurum Sahibi
// ve Yönetici'ye (Personel sayfasıyla aynı), çevrimiçi durum ve gizlilik
// sözleşmeleri sahip/yönetici/sınırlı yöneticiye (Hareketler ve Gizlilik
// sayfalarıyla aynı). Departman dağılımı herkese açık.
//
// 2026-10: Hareketler ve Gizlilik ayrı sayfa olmaktan çıktı, personel
// detayına taşındı; satırlar artık o kişinin detayını açıyor (hareket
// satırı "Hareketler" sekmesini). Eskiden hepsi kurum geneli listeye gidiyordu.

type Employee = { id: string; user_id: string | null; department_id: string | null; full_name: string; job_title: string | null; email: string | null; employment_status: string; can_receive_sales_requests: boolean };
type Department = { id: string; name: string; is_active: boolean };
type Member = { user_id: string; is_active: boolean };
type Invitation = { id: string; email: string; status: string; expires_at: string };
type Presence = { user_id: string; last_seen_at: string };
type Agreement = { employee_id: string; status: string };
type Tone = "info" | "gold" | "success" | "danger" | "warning" | "brand" | "neutral";

const ONLINE_MS = 2 * 60 * 1000; // Personel Hareketleri ile aynı: son 2 dakikada aktif

// Zamana bağlı değerler (saat bileşen gövdesinde okunmaz)
function clock() {
  const now = Date.now();
  return { now, onlineCutoff: now - ONLINE_MS };
}

export default async function HrOverviewPage() {
  const { supabase, membership, modules, isPlatformOwner, yetkiler, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const access = { yetkiler, isPlatformOwner };
  const canManageTeam = izin("hr.ekip.yonet");
  const canSeeRecords = canSeeHrRecords(access);
  /* Grafik oturum kayıtlarından: Personel Hareketleri sayfasıyla aynı yetki. */
  const canSeeActivity = izin("hr.hareket.gor");
  const time = clock();
  const none = Promise.resolve({ data: [] as never[], error: null });

  const [
    { data: employeeData, error: employeeError },
    { data: departmentData, error: departmentError },
    { data: memberData },
    { data: invitationData },
    { data: presenceData },
    { data: agreementData },
    { data: girisData, error: girisError },
  ] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,full_name,job_title,email,employment_status,can_receive_sales_requests").eq("organization_id", organizationId).order("full_name"),
    supabase.from("hr_departments").select("id,name,is_active").eq("organization_id", organizationId).order("name"),
    canManageTeam ? supabase.from("organization_memberships").select("user_id,is_active").eq("organization_id", organizationId) : none,
    canManageTeam ? supabase.from("organization_invitations").select("id,email,status,expires_at").eq("organization_id", organizationId).in("status", ["pending", "sent"]) : none,
    canSeeRecords ? supabase.from("user_presence").select("user_id,last_seen_at").eq("organization_id", organizationId) : none,
    canSeeRecords ? supabase.from("hr_confidentiality_agreements").select("employee_id,status").eq("organization_id", organizationId) : none,
    /* Son 28 günün girişleri (14 gün + önceki 14 günle kıyas). Sınırsız:
       sayı bu satırlardan çıkıyor. */
    canSeeActivity ? supabase.from("user_session_logs").select("user_id,login_at").eq("organization_id", organizationId).gte("login_at", seriBaslangici()) : none,
  ]);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (departmentError) throw new Error("Departmanlar okunamadı: " + departmentError.message);

  const employees = (employeeData ?? []) as Employee[];
  const departments = (departmentData ?? []) as Department[];
  const departmentName = new Map(departments.map((row) => [row.id, row.name]));
  const active = employees.filter((row) => row.employment_status === "active");
  const onLeave = employees.filter((row) => row.employment_status === "on_leave");
  // Çalışmaya devam edenler (aktif + izinli): erişim ve sözleşme bunlar için anlamlı
  const working = employees.filter((row) => row.employment_status === "active" || row.employment_status === "on_leave");
  const roleOf = (row: Employee) => row.job_title || (row.department_id ? departmentName.get(row.department_id) : null) || "Personel";

  // ---- Panel erişimi (sahip/yönetici)
  const memberActive = new Map(((memberData ?? []) as Member[]).map((row) => [row.user_id, row.is_active]));
  const invitations = ((invitationData ?? []) as Invitation[]).filter((row) => Date.parse(row.expires_at) > time.now);
  const invitedEmails = new Set(invitations.map((row) => row.email.toLowerCase()));
  const withAccess = working.filter((row) => row.user_id && memberActive.get(row.user_id));
  const withoutAccess = working
    .filter((row) => !row.user_id)
    .map((row) => ({ ...row, state: !row.email ? "no-email" : invitedEmails.has(row.email.toLowerCase()) ? "invited" : "not-invited" }))
    // Davet edilmemişler üstte: yapılacak iş onlarda
    .sort((a, b) => (a.state === "not-invited" ? 0 : a.state === "no-email" ? 1 : 2) - (b.state === "not-invited" ? 0 : b.state === "no-email" ? 1 : 2) || a.full_name.localeCompare(b.full_name, "tr"));

  // ---- Çevrimiçi (sahip/yönetici/sınırlı yönetici)
  const lastSeen = new Map(((presenceData ?? []) as Presence[]).map((row) => [row.user_id, row.last_seen_at]));
  const connected = working.filter((row) => row.user_id && lastSeen.has(row.user_id));
  const online = connected.filter((row) => Date.parse(lastSeen.get(row.user_id!)!) >= time.onlineCutoff);
  const recent = [...connected].sort((a, b) => lastSeen.get(b.user_id!)!.localeCompare(lastSeen.get(a.user_id!)!));

  // ---- Gizlilik sözleşmeleri
  const agreements = (agreementData ?? []) as Agreement[];
  const signedIds = new Set(agreements.filter((row) => row.status === "signed").map((row) => row.employee_id));
  const pendingIds = new Set(agreements.filter((row) => row.status !== "signed" && row.status !== "revoked").map((row) => row.employee_id));
  const unsigned = working.filter((row) => !signedIds.has(row.id)).sort((a, b) => Number(pendingIds.has(b.id)) - Number(pendingIds.has(a.id)) || a.full_name.localeCompare(b.full_name, "tr"));

  // ---- Departman dağılımı (herkes)
  const departmentCounts = departments
    .filter((row) => row.is_active)
    .map((row) => ({ id: row.id, name: row.name, count: working.filter((employee) => employee.department_id === row.id).length }))
    .concat([{ id: "none", name: "Departmansız", count: working.filter((employee) => !employee.department_id || !departmentName.has(employee.department_id)).length }])
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  /* Grafik: her gün panele giren FARKLI kişi sayısı. Aynı kişinin gün
     içindeki birden çok girişi (sekme, cihaz) tek sayılır; aksi halde
     grafik ekip büyüklüğünü değil oturum sayısını gösterirdi. */
  const gunKisi = new Map<string, string>();
  for (const satir of (girisData ?? []) as { user_id: string; login_at: string }[]) {
    if (!satir.login_at) continue;
    const anahtar = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(satir.login_at))}|${satir.user_id}`;
    if (!gunKisi.has(anahtar)) gunKisi.set(anahtar, satir.login_at);
  }
  const seri = gunlukSeri([...gunKisi.values()], simdi());

  const stateLabel: Record<string, { tone: Tone; label: string }> = {
    "not-invited": { tone: "warning", label: "Davet edilmedi" },
    "no-email": { tone: "neutral", label: "E-posta yok" },
    invited: { tone: "info", label: "Davet gönderildi" },
  };

  return (
    <GenelBakis
      gizliBaslik="İnsan Kaynakları genel bakış"
      uyari={girisError ? ["Panel girişleri"] : []}
    >
      {canSeeActivity ? <SeriKarti baslik="Panele giren kişi" alt="Son 14 gün · günde farklı kişi" seri={seri} adet="kişi" /> : null}

      <ListeIzgarasi etiket="Ekip durumu">
        {canSeeRecords ? (
          <ListeKarti baslik="Son görülenler" alt={online.length ? `${online.length} kişi şu an çevrimiçi` : "Şu an çevrimiçi kimse yok"} bos="Henüz panele giriş yapan personel yok." href="/panel/hr" hrefEtiket="Personele git" sayi={recent.length}>
            {recent.slice(0, GENEL_BAKIS_SATIR).map((row) => {
              const seen = lastSeen.get(row.user_id!)!;
              const isOnline = Date.parse(seen) >= time.onlineCutoff;
              return (
                <ListeSatiri
                  key={row.id}
                  href={`/panel/hr/${row.id}?hareket=7`}
                  baslik={formatPersonName(row.full_name)}
                  alt={roleOf(row)}
                  sag={<span className="status-pill" data-tone={isOnline ? "success" : "neutral"}>{isOnline ? "Çevrimiçi" : relativeTime(seen)}</span>}
                />
              );
            })}
          </ListeKarti>
        ) : null}

        {canManageTeam ? (
          <ListeKarti baslik="Panel erişimi olmayanlar" alt={withoutAccess.length ? `${withAccess.length} kişi giriş yapabiliyor · ${withoutAccess.length} erişimsiz` : "Tüm personel panele giriş yapabiliyor"} bos="Tüm personel panele giriş yapabiliyor." href="/panel/hr" hrefEtiket="Personele git" sayi={withoutAccess.length}>
            {withoutAccess.slice(0, GENEL_BAKIS_SATIR).map((row) => (
              <ListeSatiri
                key={row.id}
                href={`/panel/hr/${row.id}`}
                baslik={formatPersonName(row.full_name)}
                alt={`${roleOf(row)}${row.email ? ` · ${row.email}` : ""}`}
                sag={<span className="status-pill" data-tone={stateLabel[row.state].tone}>{stateLabel[row.state].label}</span>}
              />
            ))}
          </ListeKarti>
        ) : null}

        {canSeeRecords ? (
          <ListeKarti baslik="Gizlilik sözleşmesi eksik" alt={unsigned.length ? `${working.length - unsigned.length}/${working.length} personel imzaladı` : "Tüm personel imzaladı"} bos="Tüm personelin gizlilik sözleşmesi imzalı." href="/panel/hr" hrefEtiket="Personele git" sayi={unsigned.length}>
            {unsigned.slice(0, GENEL_BAKIS_SATIR).map((row) => (
              <ListeSatiri
                key={row.id}
                href={`/panel/hr/${row.id}`}
                baslik={formatPersonName(row.full_name)}
                alt={roleOf(row)}
                sag={<span className="status-pill" data-tone={pendingIds.has(row.id) ? "info" : "warning"}>{pendingIds.has(row.id) ? "İmza bekliyor" : "Sözleşme yok"}</span>}
              />
            ))}
          </ListeKarti>
        ) : null}

        <ListeKarti baslik="Departmanlar" alt={`${active.length} aktif${onLeave.length ? ` · ${onLeave.length} izinli` : ""} personel`} bos="Henüz personel kaydı yok. Personel sekmesinden “+ Yeni Personel” ile ekleyin." href="/panel/hr" hrefEtiket="Personele git" sayi={departmentCounts.length}>
          {departmentCounts.slice(0, GENEL_BAKIS_SATIR).map((row) => (
            <ListeSatiri
              key={row.id}
              href="/panel/hr"
              baslik={row.name}
              alt={`%${Math.round((row.count / Math.max(1, working.length)) * 100)} · ekibin payı`}
              sag={<span className="status-pill" data-tone="neutral">{row.count} kişi</span>}
            />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
