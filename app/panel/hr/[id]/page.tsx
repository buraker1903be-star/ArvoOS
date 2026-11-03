import Link from "next/link";
import { kimlikMi } from "@/lib/kimlik";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { statusTone } from "@/lib/status-tone";
import { formatPhone } from "@/lib/format-phone";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { isManagementDepartmentName, MANAGEMENT_EMPLOYMENT_STATUSES } from "@/lib/management-department";
import { PanelDrawer } from "../../components/panel-drawer";
import { PanelModal } from "../../components/panel-modal";
import { KisiYetkileri } from "../../settings/permissions/kisi-yetkileri";
import { ledgerTotals } from "@/lib/commission-ledger";
import { primVerisi } from "../prim-verisi";
import { DAVET_DURUM_ADLARI, kisininDaveti, OKUNAN_DAVET_DURUMLARI } from "../davet-durumu";
import { PrimPenceresi } from "../prim-penceresi";
import { PersonelHareketleri } from "../personel-hareketleri";
import { personelSil, updateEmployee } from "../actions";
import { PersonelFormu } from "../personel-formu";
import { erisimDegistir, updateTeamMemberAccess, cancelInvitation } from "../team-actions";
import { applyPermissionProfile } from "../../settings/permissions/actions";
import { departmanaUygunProfiller, profilUygulandiMi } from "@/lib/yetki-profilleri";
import { PERMISSION_MODULES } from "@/lib/role-permissions";
import { InviteTeamForm } from "../invite-team-form";
import { TeamInviteLink } from "../invite-link";
import { uploadEmployeeDocument, deleteEmployeeDocument } from "../documents-actions";
import { roleNames } from "../role-names";
import { HrIcon, initials } from "../hr-icons";
import { requestStageNames } from "../../crm/request-status";
import { workflowStatusNames } from "../../operations/ops-shared";
import { teklifGrubu } from "@/lib/teklif-grubu";
import { gunOnce, oran } from "@/lib/liste-istatistik";
import { tamPara } from "../../crm/istatistik-karti";
import { simdi } from "../../os/genel-bakis";
import { KanalDugmesi } from "../../crm/kayit-detay/kanal-dugmesi";
import { ozetZamani } from "../../crm/kayit-detay/akis-kanallari";
import { PostaAkisi, WhatsappAkisi, musteriPostalari, musteriWhatsapp } from "../../crm/musteri-yazismalari";
import "../hr.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../components/kayit-formu.css";
import { modulGerek } from "@/lib/modul-kapisi";
import { ayinSonGunu } from "@/lib/rapor-donemi";
import { sozlesmeleriBagla } from "@/lib/rapor-personel";
import { gerceklesme } from "@/lib/personel-hedefi";

/*
  PERSONEL DETAYI (2026-10): talep, teklif, sözleşme, iş ve cari
  detayıyla aynı iskelet.

  2026-10 (finanstaki Müşteriler düzeni gibi): İK'nın dört ayrı sayfası
  personelin içine taşındı — Prim Hesaplama ile Prim Hesabı tek "Prim"
  penceresinde, Personel Hareketleri orta sütunda sekme, Gizlilik
  Sözleşmesi özlük dosyasında. Eski adresler buraya yönleniyor. Eskiden personelin ayrı bir sayfası yoktu;
  her şey ekip listesindeki kartın içinde ve iki çekmecedeydi (Düzenle,
  Özlük Dosyaları), personelin üstündeki talepler ve işler hiçbir yerde
  bir arada görünmüyordu.

  Üstte ad ve "Düzenle"; altında özet şeridi (durum, çalışma tipi,
  kıdem, panel erişimi). Solda kişi ve iletişim, ortada üstündeki açık
  talepler ve yürüttüğü işler, sağda panel erişimi ve özlük dosyaları.
*/

type Department = { id: string; name: string; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean; commission_rate: number; operation_commission_rate: number };
type Member = { user_id: string; role: string; is_active: boolean };
type Invitation = { id: string; email: string; role: string; status: string; expires_at: string; error_message: string | null; created_at: string };
type Doc = { id: string; file_name: string; file_size: number | null; created_at: string };
type Talep = { id: string; title: string | null; customer_name: string | null; stage: string | null; created_at: string };
type Is = { id: string; title: string; customer_name: string | null; status: string; due_date: string | null };
type Gizlilik = { id: string; agreement_no: string; status: string; created_at: string; signed_at: string | null; signer_name: string | null };
const GIZLILIK_DURUMU: Record<string, [string, string]> = { signed: ["İmzalandı", "success"], revoked: ["İptal", "danger"] };
const money = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(kurus / 100);

const TZ = "Europe/Istanbul";
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };
const statusTones: Record<string, string> = { active: "success", on_leave: "warning", inactive: "neutral", terminated: "danger" };
const typeNames: Record<string, string> = { full_time: "Tam zamanlı", part_time: "Yarı zamanlı", contractor: "Sözleşmeli", intern: "Stajyer" };
const fileSize = (bytes: number | null) => { if (!bytes) return ""; const kb = bytes / 1024; return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`; };
const shortDate = (value: string) => new Date(value.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
/** Kıdem: işe girişten bugüne (Türkiye takvimiyle) yıl ve ay. */
function kidem(baslangic: string, bugun: string) {
  const [by, ba] = baslangic.split("-").map(Number);
  const [y, a] = bugun.split("-").map(Number);
  const ay = (y - by) * 12 + (a - ba);
  if (ay < 1) return "Bu ay başladı";
  const yil = Math.floor(ay / 12);
  return [yil ? `${yil} yıl` : "", ay % 12 ? `${ay % 12} ay` : ""].filter(Boolean).join(" ");
}
/* Davetin durumu tek yerde (davet-durumu.ts): bekleyen varsa o, yoksa
   SORUNLU olan sebebiyle gelir. Gönderilemeyen davet eskiden hiç
   okunmuyordu; kart "bu personel panele giriş yapamıyor" deyip
   geçiyor, yöneticinin bir önceki denemesinin niye tutmadığı hiçbir
   yerde yazmıyordu. E-posta eşleşmesi JS tarafında: ilike, adresteki
   "_" karakterini joker sayardı. */
/*
  Açık talep: talepler listesinin "Aktif" kümesi (yeni + inceleniyor).
  Eskiden kazanılan ve kaybedilen dışındaki her aşama sayılıyordu
  (teklif ve sözleşme aşamaları dahil): başlıkta 58 yazıp "tümünü gör"
  talepler listesinde 4 kayıt açıyordu.
*/
const AKTIF_ASAMALAR = ["lead", "qualified"];
/*
  Üstündeki iş: işler listesinde görünen küme (arşivlenmemiş, iptal
  edilmemiş; tamamlanıp arşive gönderilmeyi bekleyen dahil). Eskiden
  tamamlananlar sayılmıyordu: burada 10, "tümünü gör"de 11 iş çıkıyordu.
*/
const LISTEDEKI_IS_DURUMLARI = ["planned", "in_progress", "blocked", "completed"];
const LISTE = 6;

type Arama = { pencere?: string; prim?: string; prim_bas?: string; prim_bit?: string; prim_is?: string; prim_kart?: string; hareket?: string; hsayfa?: string };

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Arama> }) {
  const { id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa onu çökme ekranına çeviriyordu. */
  if (!kimlikMi(id)) notFound();
  const arama = await searchParams;
  const { supabase, membership, userId, modules, organization, izin, isPlatformOwner } = await getPanelContext();
  modulGerek(modules, "hr");
  const canManageTeam = izin("hr.ekip.yonet");
  const crmVar = modules.some((module) => module.code === "crm");
  const opsVar = modules.some((module) => module.code === "operations");
  const org = membership.organization_id;

  const primGorebilir = isPlatformOwner || izin("hr.prim.gor");
  const gizlilikGorur = izin("hr.gizlilik.gor");
  const hareketGorur = izin("hr.hareket.gor");

  /*
    SORGULAR İKİ ADIMDA (2026-10). Personel kaydına bağlı olmayan her şey —
    belgeler, açık talepler ve işler, performans, prim, gizlilik — adresteki
    kimlikle (id) personel kaydıyla AYNI ANDA okunuyor. Eskiden beş ayrı
    aşamaydı (personel → listeler → performans → prim/gizlilik → yazışmalar),
    her biri öncekini bekliyordu. İkinci adımda yalnızca personel kaydındaki
    alanlara (hesap, e-posta, telefon) bağlı olanlar kaldı.

    Sayılar ayrı "count" sorgularından: listeler LISTE kadar satır okuyor
    ve sınırlı listeden sayım almak, sınıra ulaşınca yanlış rakam gösterir
    (check:rakamlar).
  */
  const bos = Promise.resolve({ data: [], count: 0 });
  const maasGorur = izin("hr.maas.yonet");
  const buAyBasi = `${todayInIstanbul().slice(0, 7)}-01`;
  const [
    { data: employeeData, error: employeeError },
    { data: departmentData },
    docResult, talepResult, talepSayisi, isResult, isSayisi,
    sozlesmeSonuc, teklifSonuc, isSonuc,
    prim, gizlilikSonuc, hedefSonuc, maasSonuc, hakedisSonuc,
  ] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,employee_no,full_name,job_title,email,phone,employment_type,employment_status,start_date,can_receive_sales_requests,commission_rate,operation_commission_rate").eq("id", id).eq("organization_id", org).maybeSingle(),
    supabase.from("hr_departments").select("id,name,is_active").eq("organization_id", org).order("name"),
    canManageTeam ? supabase.from("hr_employee_documents").select("id,file_name,file_size,created_at").eq("organization_id", org).eq("employee_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as Doc[] }),
    crmVar ? supabase.from("crm_opportunities").select("id,title,customer_name,stage,created_at").eq("organization_id", org).eq("assigned_employee_id", id).in("stage", AKTIF_ASAMALAR).order("created_at", { ascending: false }).limit(LISTE) : bos,
    crmVar ? supabase.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("assigned_employee_id", id).in("stage", AKTIF_ASAMALAR) : bos,
    opsVar ? supabase.from("operation_workflows").select("id,title,customer_name,status,due_date").eq("organization_id", org).eq("assigned_employee_id", id).in("status", LISTEDEKI_IS_DURUMLARI).order("due_date", { ascending: true, nullsFirst: false }).limit(LISTE) : bos,
    opsVar ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("assigned_employee_id", id).in("status", LISTEDEKI_IS_DURUMLARI) : bos,
    /*
      PERFORMANS (2026-10, liste sayfalarındaki istatistik kartıyla aynı
      hesaplar): satışta imzalanan sözleşmeler ve teklif kabul oranı (bu
      personele atanmış taleplerden), operasyonda teslim edilen işler ve
      zamanında teslim oranı. Okunamayan modül (RLS) boş kalır.
    */
    crmVar ? supabase.from("crm_contracts").select("id,contract_no,title,opportunity_id,amount,status,signed_at,created_at,crm_opportunities!inner(assigned_employee_id,customer_name)").eq("organization_id", org).eq("crm_opportunities.assigned_employee_id", id).in("status", ["signed", "completed"]) : bos,
    crmVar ? supabase.from("crm_proposals").select("status,archive_reason,superseded_by,crm_opportunities!inner(assigned_employee_id)").eq("organization_id", org).eq("crm_opportunities.assigned_employee_id", id) : bos,
    opsVar ? supabase.from("operation_workflows").select("id,title,customer_name,due_date,delivered_at").eq("organization_id", org).eq("assigned_employee_id", id).not("delivered_at", "is", null) : bos,
    /* Prim (tahakkuk kurum genelinden hesaplanıyor) ve gizlilik sözleşmeleri
       yalnızca yetkisi olana okunur. */
    primGorebilir ? primVerisi(supabase, org) : Promise.resolve(null),
    gizlilikGorur ? supabase.from("hr_confidentiality_agreements").select("id,agreement_no,status,created_at,signed_at,signer_name").eq("organization_id", org).eq("employee_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    /*
      KARTLAR (03.11.2026): bu ayın satış hedefi (Hedefler ekranıyla aynı
      kayıt) ve maaş/hakediş durumu (Maaşlar ve Hakedişler ekranlarıyla
      aynı tablolar; yalnızca hr.maas.yonet). Çalışma tipi personel
      kaydıyla aynı anda okunduğu için ikisi birden soruluyor.
    */
    crmVar ? supabase.from("hr_personel_hedefleri").select("tutar").eq("organization_id", org).eq("employee_id", id).eq("donem", buAyBasi).maybeSingle() : Promise.resolve({ data: null, error: null }),
    maasGorur ? supabase.from("hr_maaslar").select("anlasilan_net,odendi_on,odenen").eq("organization_id", org).eq("employee_id", id).eq("donem", buAyBasi).maybeSingle() : Promise.resolve({ data: null, error: null }),
    maasGorur ? supabase.from("hr_hakedisler").select("tutar").eq("organization_id", org).eq("employee_id", id).eq("durum", "bekliyor") : Promise.resolve({ data: [], error: null }),
  ]);
  if (employeeError) throw new Error("Personel okunamadı: " + employeeError.message);
  if (!employeeData) notFound();
  const employee = employeeData as Employee;
  const departments = (departmentData ?? []) as Department[];
  const departmentName = employee.department_id ? departments.find((item) => item.id === employee.department_id)?.name ?? "Departman" : null;

  /*
    İkinci adım: personel kaydındaki alanlara bağlı olanlar. Kişiyle
    yazışmalar (WhatsApp ve Postalar sekmeleri) müşteri ve kayıt
    sayfalarıyla aynı kural (crm/musteri-yazismalari.tsx); numara ve adres
    personel kaydından. Postada kişinin ÜSTLENDİĞİ yazışmalar da geliyor:
    personel sayfasında asıl soru "kimlerle yazışıyor, neyi üstlendi".
    WhatsApp'ı CRM modülü olan görür (WhatsApp ekranının kuralı), postayı
    ortak kutuyu görebilen (posta.gor).
  */
  const postaGorur = izin("posta.gor");
  /* Hazır profil düğmesinin "uygulandı" durumu için kişinin istisnaları
     (yalnızca yetki yönetebilene ve panel hesabı olana). */
  const profilOkunur = izin("settings.yetki.yonet") && Boolean(employee.user_id);
  const bosIstisna = Promise.resolve({ data: [] as { key: string; acik: boolean }[] });
  const [memberResult, invitationResult, { numara: whatsappNumarasi, mesajlar: whatsappMesajlari }, postalar, kisiModulSonuc, kisiYetkiSonuc] = await Promise.all([
    canManageTeam && employee.user_id ? supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", org).eq("user_id", employee.user_id).maybeSingle() : Promise.resolve({ data: null }),
    canManageTeam && !employee.user_id && employee.email ? supabase.from("organization_invitations").select("id,email,role,status,expires_at,error_message,created_at").eq("organization_id", org).in("status", [...OKUNAN_DAVET_DURUMLARI]) : Promise.resolve({ data: [] as Invitation[] }),
    crmVar ? musteriWhatsapp(org, employee.phone) : Promise.resolve({ numara: null, mesajlar: [] }),
    postaGorur ? musteriPostalari(supabase, org, { talepIdleri: [], eposta: employee.email, ilgilenenKullanici: employee.user_id }) : Promise.resolve([]),
    profilOkunur ? supabase.from("member_module_permissions").select("module_key,can_access").eq("organization_id", org).eq("user_id", employee.user_id!) : bosIstisna,
    profilOkunur ? supabase.from("member_capability_permissions").select("capability_key,allowed").eq("organization_id", org).eq("user_id", employee.user_id!) : bosIstisna,
  ]);
  const kisiModul = new Map(((kisiModulSonuc.data ?? []) as { module_key?: string; can_access?: boolean }[]).map((r) => [String(r.module_key), Boolean(r.can_access)]));
  const kisiYetki = new Map(((kisiYetkiSonuc.data ?? []) as { capability_key?: string; allowed?: boolean }[]).map((r) => [String(r.capability_key), Boolean(r.allowed)]));
  const member = memberResult.data as Member | null;
  const { davet: pendingInvite, sebep: davetSebebi } = kisininDaveti(
    (invitationResult.data ?? []) as Invitation[], employee.email, simdi(),
  );
  const docs = (docResult.data ?? []) as Doc[];
  const talepler = (talepResult.data ?? []) as Talep[];
  const isler = (isResult.data ?? []) as Is[];
  const acikTalep = talepSayisi.count ?? 0;
  const acikIs = isSayisi.count ?? 0;

  const an = simdi();
  const bugunAnahtari = todayInIstanbul();
  type Imzali = { id: string; contract_no: string | null; title: string | null; opportunity_id: string | null; amount: number; status: string; signed_at: string | null; created_at: string; crm_opportunities: { customer_name: string | null } | null };
  const imzalananlar = ((sozlesmeSonuc.data ?? []) as unknown as Imzali[]).sort((a, b) => (b.signed_at ?? b.created_at).localeCompare(a.signed_at ?? a.created_at));
  const satisToplami = imzalananlar.reduce((sum, s) => sum + Number(s.amount), 0);
  const son90Imza = imzalananlar.filter((s) => s.signed_at && gunOnce(s.signed_at, an) < 90);
  const son90Deger = son90Imza.reduce((sum, s) => sum + Number(s.amount), 0);
  const teklifGruplari = ((teklifSonuc.data ?? []) as { status: string; archive_reason: string | null; superseded_by: string | null }[]).map(teklifGrubu);
  const kabul = teklifGruplari.filter((g) => g === "accepted").length;
  const kabulOrani = oran(kabul, teklifGruplari.filter((g) => g === "accepted" || g === "rejected" || g === "expired").length);
  const teslimler = ((isSonuc.data ?? []) as { id: string; title: string; customer_name: string | null; due_date: string | null; delivered_at: string }[]).sort((a, b) => b.delivered_at.localeCompare(a.delivered_at));
  const son90Teslim = teslimler.filter((t) => gunOnce(t.delivered_at, an) < 90).length;
  const teslimGunu = (deger: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(Date.parse(deger));
  const terminli = teslimler.filter((t) => t.due_date);
  const zamaninda = oran(terminli.filter((t) => teslimGunu(t.delivered_at) <= t.due_date!).length, terminli.length);
  const primToplami = prim ? ledgerTotals(employee.id, prim.accruals, prim.payments) : null;
  const gizlilikler = (gizlilikSonuc.data ?? []) as Gizlilik[];
  /* Aylık hedef: gerçekleşen Hedefler ekranının kuralıyla (imza günü bu ay). */
  const hedefTutari = hedefSonuc.error ? null : ((hedefSonuc.data as { tutar: number } | null)?.tutar ?? null);
  const buAyDonemi = { startKey: buAyBasi, endKey: ayinSonGunu(Number(buAyBasi.slice(0, 4)), Number(buAyBasi.slice(5, 7))), key: "ay" };
  const buAyGerceklesen = sozlesmeleriBagla({
    sozlesmeler: imzalananlar,
    talebinPersoneli: new Map(imzalananlar.flatMap((c) => (c.opportunity_id ? [[c.opportunity_id, employee.id] as [string, string]] : []))),
    donem: buAyDonemi,
  }).get(employee.id) ?? { adet: 0, tutar: 0 };
  const hedefOrani = gerceklesme(buAyGerceklesen.tutar, hedefTutari);
  const hakedisli = employee.employment_type === "contractor";
  const buAyMaas = maasSonuc.error ? null : (maasSonuc.data as { anlasilan_net: number | null; odendi_on: string | null; odenen: number | null } | null);
  const bekleyenHakedis = hakedisSonuc.error ? null : ((hakedisSonuc.data ?? []) as { tutar: number }[]);
  const gecikenIs = isler.filter((is) => is.due_date && is.due_date.slice(0, 10) < bugunAnahtari).length;
  const temelAdres = `/panel/hr/${employee.id}`;
  const pencere = arama.pencere === "prim" || arama.pencere === "yetki" ? arama.pencere : null;
  /*
    YETKİLER PENCERESİ (2026-10): kişinin hangi modülleri görebildiği ve
    hangi işlemleri yapabildiği, Ayarlar → Yetkilendirme → kişi sayfasıyla
    aynı bileşen (settings/permissions/kisi-yetkileri.tsx). Eskiden yalnızca
    Ayarlar'daydı. Yalnızca panel hesabı olan personel için: yetki üyeliğe
    yazılıyor, hesabı olmayanın üyeliği yok.
  */
  const yetkiDuzenler = izin("settings.yetki.yonet") && Boolean(employee.user_id);

  const isOwner = membership.role === "owner";
  // Yönetici departmanındaki aktif/izinli çalışanın rolü departmandan gelir
  // (Kurum Sahibi); elle değiştirilemez (ekip listesindeki kuralla aynı).
  const managedByDepartment = MANAGEMENT_EMPLOYMENT_STATUSES.includes(employee.employment_status) && isManagementDepartmentName(departmentName ?? "");
  const organizationName = organization.display_name || organization.name;
  const erisim = member ? (member.is_active ? roleNames[member.role] ?? member.role : "Erişim kapalı") : pendingInvite ? "Davet bekliyor" : "Erişim yok";
  const bugun = todayInIstanbul();

  const sonPosta = postalar.map((posta) => posta.son_mesaj_at ?? "").sort().at(-1) || null;

  /* DÜZEN (2026-10): talep, teklif ve sözleşme çekmeceleriyle aynı ortak
     form (components/kayit-formu.css): bölüm ayırıcıları, zorunlu alan
     işareti, alt kaydet çubuğu. hr-form sınıfı bilerek yok: onun alan kuralı
     özgüllükte ortak formun açılır liste okunu eziyordu (hr.css). */
  const editForm = <PersonelFormu action={updateEmployee} departmanlar={departments} personel={employee} />;

  return (
    <main className="talep cari personel kd-tek-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{employee.employee_no ? `PERSONEL · NO ${employee.employee_no}` : "PERSONEL"}</small>
          <h1>{employee.full_name}</h1>
        </div>
        {/* ÖZET ŞERİDİ başlıkta, diğer detaylardaki aşama çizgisinin yerinde. */}
        <div className="kd-bas-asama kd-bas-ozet">
      <section className="kayit-serit" aria-label="Personel özeti">
        <dl>
          <div><dt>Durum</dt><dd><span className="status-pill" data-tone={statusTones[employee.employment_status] ?? "neutral"}>{statusNames[employee.employment_status] ?? employee.employment_status}</span></dd></div>
          <div><dt>Çalışma tipi</dt><dd>{typeNames[employee.employment_type] ?? "—"}</dd></div>
          <div><dt>Kıdem</dt><dd>{employee.start_date ? kidem(employee.start_date, bugun) : "—"}</dd></div>
          {crmVar ? <div><dt>Açık talep</dt><dd>{acikTalep}</dd></div> : null}
          {opsVar ? <div><dt>Üstündeki iş</dt><dd>{acikIs}</dd></div> : null}
          {canManageTeam ? <div><dt>Panel erişimi</dt><dd>{erisim}</dd></div> : null}
        </dl>
      </section>
        </div>
        <div className="talep-bas-eylem">
          {/* Prim ve Yetkiler eskiden burada düğmeydi; ikisinin de artık kendi kartı var (prim kartı, Yetkiler kartı). */}
          {canManageTeam ? (
            <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary kd-bas-dugme" kicker={`PERSONEL · ${employee.full_name}`} title="Personeli düzenle" description="Kimlik, görev, iletişim ve prim oranları. Panel rolü ve yetkiler ayrı yerden değişir.">{editForm}</PanelDrawer>
          ) : null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary kd-bas-dugme" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              <Link className="os-menu-item" href="/panel/hr">Ekip listesi</Link>
              {/* Yanlış açılan kaydı silme: yalnızca panel hesabı olmayan
                  personelde; bağlı kaydı olanı işlem reddediyor (actions.ts). */}
              {izin("hr.personel.yonet") && !employee.user_id ? (
                <PanelDrawer triggerLabel="Personeli sil" triggerClassName="os-menu-item is-danger" kicker={`PERSONEL · ${employee.full_name}`} title="Personeli sil" description="Silme geri alınamaz.">
                  <div className="panel-danger-zone">
                    <p>Yalnızca yanlış açılmış, hiçbir kaydı olmayan personel silinir. Talep, iş, randevu, prim, belge ya da imzalı sözleşmesi olan personel silinmez; onun durumunu &quot;İşten ayrıldı&quot; yapın.</p>
                    <form action={personelSil}>
                      <input type="hidden" name="employee_id" value={employee.id} />
                      <button className="panel-danger" type="submit">Evet, {employee.full_name} kaydını sil</button>
                    </form>
                  </div>
                </PanelDrawer>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      <div className="kd-duzen-v4 kd-tek-ekran">
        {/*
          DÜZEN (03.11.2026, kurum sahibinin isteği: "personel detayını da
          aynı kalitede birebir düzenle"). Sözleşme, teklif ve müşteri
          detayıyla aynı iskelet: solda kimlik ve iletişim kanalları, altta
          prim ile erişim/özlük kartları, sağda "Üstündekiler". Eskiden üç
          sekmeli sütun vardı; WhatsApp, posta ve hareketler orta sütunun
          sekmelerindeydi, panel erişimi ve özlük dosyası sağ sütunun.
          Artık her biri karttaki düğmeden ortada açılan pencerede; sayfa
          kaymıyor.
        */}
        <section className="panel-card opd-kart opd-musteri kd-musteri" aria-label="Personel">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{initials(employee.full_name)}</span>
            <div>
              <h2>{employee.full_name}</h2>
              <small>{employee.job_title || "Pozisyon belirtilmedi"}{departmentName ? ` · ${departmentName}` : ""}</small>
            </div>
          </div>
          {employee.phone || employee.email ? (
            <div className="opd-iletisim-dugmeleri">
              {employee.phone ? <a className="panel-secondary" href={`tel:${employee.phone.replace(/\s+/g, "")}`}>Ara</a> : null}
              {employee.email ? <a className="panel-secondary" href={`mailto:${employee.email}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste opd-musteri-liste">
            <div><dt>Telefon</dt><dd>{employee.phone ? <a href={`tel:${employee.phone.replace(/\s+/g, "")}`}>{formatPhone(employee.phone)}</a> : <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{employee.email ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : <em>Yok</em>}</dd></div>
            <div><dt>Departman</dt><dd>{departmentName || <em>Yok</em>}</dd></div>
          </dl>
          <PanelModal
            triggerClassName="panel-secondary opd-ayrinti-dugme"
            triggerLabel="Personel ayrıntıları"
            title={employee.full_name}
            description="Kimlik, görev ve iletişim bilgileri. Değiştirmek için başlıktaki “Düzenle”."
            kicker={employee.employee_no ? `PERSONEL · NO ${employee.employee_no}` : "PERSONEL"}
            boy="buyuk"
          >
            <div className="opd-ayrinti">
              <section className="opd-ayrinti-bolum">
                <h3>Kimlik</h3>
                <dl className="talep-liste">
                  <div><dt>Personel no</dt><dd>{employee.employee_no || <em>Yok</em>}</dd></div>
                  <div><dt>İşe giriş</dt><dd>{employee.start_date ? shortDate(employee.start_date) : <em>Belirtilmedi</em>}</dd></div>
                  <div><dt>Kıdem</dt><dd>{employee.start_date ? kidem(employee.start_date, bugun) : <em>—</em>}</dd></div>
                  <div><dt>Çalışma tipi</dt><dd>{typeNames[employee.employment_type] ?? <em>—</em>}</dd></div>
                  <div><dt>Durum</dt><dd><span className="status-pill" data-tone={statusTones[employee.employment_status] ?? "neutral"}>{statusNames[employee.employment_status] ?? employee.employment_status}</span></dd></div>
                </dl>
              </section>
              <section className="opd-ayrinti-bolum">
                <h3>Görev ve iletişim</h3>
                <dl className="talep-liste">
                  <div><dt>Pozisyon</dt><dd>{employee.job_title || <em>Belirtilmedi</em>}</dd></div>
                  <div><dt>Departman</dt><dd>{departmentName || <em>Yok</em>}</dd></div>
                  <div><dt>Telefon</dt><dd>{employee.phone ? formatPhone(employee.phone) : <em>Yok</em>}</dd></div>
                  <div><dt>E-posta</dt><dd>{employee.email || <em>Yok</em>}</dd></div>
                </dl>
              </section>
            </div>
          </PanelModal>
        </section>

        {/* İLETİŞİM: kanallar düğme, içerik ortada açılan pencerede (iş detayıyla aynı). */}
        <section className="panel-card opd-kart kd-iletisim" aria-label="İletişim">
          <h2 className="opd-kart-baslik">İletişim</h2>
          {crmVar ? (
            <>
              <h3 className="opd-kanal-grup">WhatsApp</h3>
              <p className="opd-kanal-ozet">
                {whatsappMesajlari[0]?.createdAt ? <>Son mesaj <time dateTime={whatsappMesajlari[0].createdAt}>{ozetZamani(whatsappMesajlari[0].createdAt)}</time></> : "Henüz yazışma yok"}
              </p>
              <KanalDugmesi
                anahtar={`kanal:personel:${employee.id}:whatsapp`}
                etiket="WhatsApp"
                olaylar={whatsappMesajlari[0]?.direction === "inbound" ? [whatsappMesajlari[0].createdAt] : []}
                title={employee.full_name}
                kicker="WHATSAPP"
              >
                <WhatsappAkisi mesajlar={whatsappMesajlari} numara={whatsappNumarasi} musteri={employee.full_name} kisi="personel" />
              </KanalDugmesi>
            </>
          ) : null}
          {postaGorur ? (
            <>
              <h3 className="opd-kanal-grup">Posta</h3>
              <p className="opd-kanal-ozet">
                {sonPosta ? <>Son posta <time dateTime={sonPosta}>{ozetZamani(sonPosta)}</time></> : "Henüz posta yok"}
              </p>
              <KanalDugmesi
                anahtar={`kanal:personel:${employee.id}:posta`}
                etiket="Postalar"
                olaylar={postalar.filter((posta) => posta.okunmamis).map((posta) => posta.son_mesaj_at ?? "").filter(Boolean)}
                title={employee.full_name}
                kicker="POSTALAR"
              >
                <PostaAkisi postalar={postalar} epostaVar={Boolean(employee.email)} kisi="personel" />
              </KanalDugmesi>
            </>
          ) : null}
          {!crmVar && !postaGorur ? <p className="talep-bos">Görebileceğiniz bir iletişim kanalı yok.</p> : null}
        </section>

        {/* PRİM VE SATIŞ: bakiye büyük rakam, oranlar altında; hareketler Prim penceresinde. */}
        <section className="panel-card opd-kart kd-alt-sol" aria-label="Prim ve satış">
          {/*
            Sıkı yerleşim (03.11.2026): kart alt satırda kalan yüksekliğe
            sığmalı, kaydırma yok. Eskiden oranlar ve talep ataması üç ayrı
            satırdı ve kartın içinde kaydırma çubuğu çıkıyordu; atama durumu
            artık başlığın yanında, iki oran yan yana.
          */}
          <div className="kd-kart-bas">
            <h3 className="opd-kanal-grup">Prim ve satış</h3>
            <span className="status-pill" data-tone={employee.can_receive_sales_requests ? "success" : "neutral"} title="Satış talebi ataması">{employee.can_receive_sales_requests ? "Talep atanabilir" : "Talep atanmaz"}</span>
          </div>
          {primToplami ? (
            <p className="kd-buyuk-rakam" data-tone={primToplami.balance < 0 ? "warning" : undefined}>
              {money(primToplami.balance)}
              <small>prim bakiyesi</small>
            </p>
          ) : null}
          <dl className="kd-oranlar">
            <div><dt>Satış primi</dt><dd>%{percent(employee.commission_rate)}</dd></div>
            <div><dt>Operasyon primi</dt><dd>%{percent(employee.operation_commission_rate)}</dd></div>
          </dl>
          {prim && primToplami ? (
            <PanelModal
              triggerLabel="Prim hareketleri"
              triggerClassName="panel-secondary opd-ayrinti-dugme"
              kicker="PRİM HESABI"
              title={employee.full_name}
              description={`Ödenecek bakiye ${money(primToplami.balance)}`}
              boy="ekran"
              baslangicAcik={pencere === "prim"}
              kapaninca={pencere === "prim" ? temelAdres : undefined}
            >
              <PrimPenceresi veri={prim} employeeId={employee.id} temelAdres={temelAdres} donemKodu={arama.prim} baslangic={arama.prim_bas} bitis={arama.prim_bit} isSekmesi={arama.prim_is} kart={arama.prim_kart} />
            </PanelModal>
          ) : null}
        </section>

        {/*
          PANEL: erişim ve panel hareketleri. Özlük dosyası 03.11.2026'da
          ana bölümdeki kendi kartına taşındı; hareketler iletişim kartından
          buraya geldi (bir kanal değil, panel kullanımı).
        */}
        <section className="panel-card opd-kart kd-alt-sag" aria-label="Panel erişimi ve hareketleri">
          {canManageTeam ? (
            <>
              <h3 className="opd-kanal-grup">Panel erişimi</h3>
              <p className="opd-kanal-ozet">{erisim}{member ? (member.is_active ? " · açık" : "") : ""}</p>
              <PanelModal
                triggerLabel="Erişimi yönet"
                triggerClassName="opd-kanal"
                kicker="PANEL ERİŞİMİ"
                title={employee.full_name}
                description="Panel rolü, erişimin açılıp kapanması ve hazır yetki profilleri."
                boy="orta"
              >
                <div className="personel personel-sag">
              <div className="ps-panel">
              <header className="phr-bas ps-bas">
                <h2>Rol {member ? <span className="status-pill" data-tone={member.is_active ? "success" : "danger"}>{member.is_active ? "Erişim açık" : "Erişim kapalı"}</span> : null}</h2>
                {yetkiDuzenler ? <Link className="pu-tumu" href={`${temelAdres}?pencere=yetki`} scroll={false}>Yetkileri düzenle →</Link> : null}
              </header>
              <div className="personel-erisim">
                {member ? (
                  employee.user_id === userId ? (
                    <span className="status-pill" data-tone="gold">{roleNames[member.role] ?? member.role} · Siz</span>
                  ) : managedByDepartment ? (
                    <span className="status-pill" data-tone="gold">Kurum Sahibi · Yönetici departmanı</span>
                  ) : member.role === "owner" && !isOwner ? (
                    <span className="status-pill" data-tone="gold">{roleNames.owner}</span>
                  ) : (
                    /* Eskiden rolün yanında bir "Aktif" kutusu vardı ve altındaki
                       "Erişimi kapat/aç" düğmesiyle aynı işi yapıyordu; dar
                       ekranda rol adı "Operasyon Per…" diye kesiliyordu. Erişim
                       artık yalnızca o düğmeden değişiyor; burada mevcut durum
                       gizli alanla korunuyor (işlem kutu yoksa "kapalı" sayıyor). */
                    <form className="hr-access-form" action={updateTeamMemberAccess}>
                      <input type="hidden" name="user_id" value={employee.user_id ?? ""} />
                      {member.is_active ? <input type="hidden" name="is_active" value="on" /> : null}
                      <select name="role" defaultValue={member.role} aria-label="Panel rolü">
                        <option value="member">Satış Personeli</option>
                        <option value="operasyoncu">Operasyon Personeli</option>
                        <option value="admin">Yönetici</option>
                        {/* manager seçenekte yoktu; kaydedince sessizce Satış Personeli'ne düşüyordu. */}
                        {member.role === "manager" ? <option value="manager">Yönetici (sınırlı)</option> : null}
                        {isOwner ? <option value="owner">Kurum Sahibi</option> : null}
                      </select>
                      <button className="panel-secondary" type="submit">Rolü kaydet</button>
                    </form>
                  )
                ) : pendingInvite ? (
                  <>
                    <span className="status-pill" data-tone={davetSebebi ? "danger" : statusTone(pendingInvite.status)}>
                      {davetSebebi ? (DAVET_DURUM_ADLARI[pendingInvite.status] ?? "Davet sorunlu") : pendingInvite.status === "sent" ? "Davet gönderildi" : "Davet gönderiliyor"}
                    </span>
                    {/* Sorunun sebebi kartın üstünde: yönetici "neden gitmedi"yi
                        başka hiçbir yerde göremiyordu. */}
                    {davetSebebi ? <p className="talep-uyari cari-not">{davetSebebi}</p> : null}
                    <div className="talep-iletisim">
                      {davetSebebi ? (
                        <PanelDrawer triggerLabel="Yeniden davet et" triggerClassName="panel-secondary" kicker="PANEL ERİŞİMİ" title={`${employee.full_name} için panel erişimi`} description="Adresi düzeltip yeniden davet edebilirsiniz; önceki davet geçersiz olur.">
                          <InviteTeamForm employeeId={employee.id} fullName={employee.full_name} defaultEmail={employee.email ?? ""} />
                        </PanelDrawer>
                      ) : (
                        <PanelDrawer triggerLabel="Giriş bağlantısı" triggerClassName="panel-secondary" kicker="PANEL ERİŞİMİ" title={`${employee.full_name} için giriş bağlantısı`} description="Davet e-postası ulaşmadıysa bağlantıyı WhatsApp veya e-postayla kendiniz gönderin.">
                          <TeamInviteLink invitationId={pendingInvite.id} organizationName={organizationName} personName={employee.full_name} email={pendingInvite.email} />
                        </PanelDrawer>
                      )}
                      <form action={cancelInvitation}><input type="hidden" name="invitation_id" value={pendingInvite.id} /><button className="panel-secondary" type="submit">Daveti iptal et</button></form>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="talep-bos cari-not">Bu personel panele giriş yapamıyor.</p>
                    <div className="talep-iletisim">
                      <PanelDrawer triggerLabel="Panele davet et" triggerClassName="panel-secondary" kicker="PANEL ERİŞİMİ" title={`${employee.full_name} için panel erişimi`} description="Bu personele gerçek bir davet e-postası gönderilir.">
                        <InviteTeamForm employeeId={employee.id} fullName={employee.full_name} defaultEmail={employee.email ?? ""} />
                      </PanelDrawer>
                    </div>
                  </>
                )}
                {/*
                  ERİŞİM VE MÜDÜRLÜK (2026-10). Erişimi kapatıp açmak tek
                  düğme: rol formundaki "Aktif" kutucuğu gözden kaçıyordu.
                  Müdürlük, kişinin departmanına uygun hazır profil: satış
                  departmanı Satış Müdürü, operasyon departmanı Operasyon
                  Müdürü (lib/yetki-profilleri.ts; işlem de aynı kuralla
                  reddediyor). Kişinin kendisine, Kurum Sahibi'ne ve yönetim
                  departmanına gösterilmiyor — onların rolü elle değişmez.
                */}
                {member && employee.user_id !== userId && !managedByDepartment && member.role !== "owner" ? (
                  <div className="personel-erisim-eylem">
                    <small className="ps-etiket">Hızlı işlemler</small>
                    <form action={erisimDegistir}>
                      <input type="hidden" name="user_id" value={employee.user_id ?? ""} />
                      <input type="hidden" name="ac" value={member.is_active ? "0" : "1"} />
                      <button className={member.is_active ? "panel-danger" : "panel-primary"} type="submit">{member.is_active ? "Erişimi kapat" : "Erişimi aç"}</button>
                    </form>
                    {profilOkunur ? departmanaUygunProfiller(departmentName).map((profil) => {
                      const uygulandi = profilUygulandiMi(profil, { rol: member.role, modulIstisnalari: kisiModul, yetkiIstisnalari: kisiYetki }, PERMISSION_MODULES);
                      return uygulandi ? (
                        <span key={profil.key} className="status-pill" data-tone="success">{profil.label}</span>
                      ) : (
                        <form key={profil.key} action={applyPermissionProfile}>
                          <input type="hidden" name="user_id" value={employee.user_id ?? ""} />
                          <input type="hidden" name="profil" value={profil.key} />
                          <button className="panel-secondary" type="submit" title={profil.aciklama}>{profil.label} yap</button>
                        </form>
                      );
                    }) : null}
                  </div>
                ) : null}
              </div>
              </div>
                </div>
              </PanelModal>
            </>
          ) : null}
          {hareketGorur ? (
            <>
              <h3 className="opd-kanal-grup">Panel hareketleri</h3>
              <p className="opd-kanal-ozet">Giriş, görüntüleme ve işlem kayıtları</p>
              {/* Aralık ve sayfa bağlantıları sayfayı yeniden yüklüyor; adreste ?hareket= varsa pencere açık gelir. */}
              <PanelModal
                triggerLabel="Panel hareketleri"
                triggerClassName="opd-kanal"
                kicker="PANEL HAREKETLERİ"
                title={employee.full_name}
                boy="buyuk"
                baslangicAcik={Boolean(arama.hareket || arama.hsayfa)}
                kapaninca={arama.hareket || arama.hsayfa ? temelAdres : undefined}
              >
                <PersonelHareketleri supabase={supabase} orgId={org} userId={employee.user_id} temelAdres={temelAdres} aralik={arama.hareket} sayfa={arama.hsayfa} />
              </PanelModal>
            </>
          ) : null}
          {!canManageTeam && !hareketGorur ? <p className="talep-bos">Panel erişimini görme yetkiniz yok.</p> : null}
        </section>

        <section className="panel-card talep-bilgi kd-ana" aria-label="Üstündekiler">
          <div className="kd-tutar-satir">
            <div><h2 className="kd-ana-baslik">Üstündekiler</h2></div>
          </div>
          {/*
            KARTLAR (03.11.2026, kurum sahibinin çizimi). Eskiden performans
            şeridinin altında açık talepler ve yürüttüğü işler alt alta liste
            olarak duruyordu ve kart kendi içinde kayıyordu. Artık iki sıra
            dört kart: üstte satış ve operasyon (talepler, satışlar, işler,
            tamamlanan işler; performans sayıları kartların içinde), altta
            yetkiler, özlük dosyası, aylık hedef ve maaş/hakediş. Karta
            basınca liste ortada açılan pencerede.
          */}
          <div className="kd-kutular kd-kutular-personel">
            {crmVar ? (
              <PanelModal
                triggerClassName="kd-kutu"
                triggerLabel="Elindeki talepler"
                tetik={<>
                  <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Elindeki talepler</span><span className="kd-kutu-cip">{kabulOrani === null ? "kabul —" : `kabul %${kabulOrani}`}</span></span>
                  <span className={acikTalep ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{acikTalep}<small>açık talep</small></span>
                  <span className="kd-kutu-satirlar">
                    {talepler.slice(0, 2).map((t) => <span key={t.id}><b>{t.customer_name || t.title || "Talep"}</b><small>{requestStageNames[t.stage ?? ""] ?? t.stage}</small></span>)}
                  </span>
                  <span className="kd-kutu-dip"><span>{kabul} teklif kabul</span><span className="kd-kutu-ac">Aç →</span></span>
                </>}
                kicker={`PERSONEL · ${employee.full_name}`}
                title="Elindeki talepler"
                description={`${acikTalep} açık talep · teklif kabul oranı ${kabulOrani === null ? "—" : `%${kabulOrani}`}`}
                boy="buyuk"
              >
                <div className="personel personel-ustunde kd-pencere-liste">
                  {talepler.length ? (
                    <ul className="pu-liste">
                      {talepler.map((talep) => (
                        <li key={talep.id}>
                          <Link href={`/panel/crm/requests/${talep.id}`}>
                            <span className="pu-govde">
                              <b>{talep.customer_name || talep.title || "Talep"}</b>
                              <small>{[talep.customer_name ? talep.title : null, `Açılış ${shortDate(talep.created_at)}`].filter(Boolean).join(" · ")}</small>
                            </span>
                            <span className="status-pill" data-tone={statusTone(talep.stage ?? "")}>{requestStageNames[talep.stage ?? ""] ?? talep.stage}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="pu-bos">Üstünde açık talep yok.</p>}
                  <Link className="pu-tumu" href={`/panel/crm?temsilci=${employee.id}`}>{acikTalep > talepler.length ? `Tümünü listede gör (${acikTalep})` : "Listede aç"} →</Link>
                </div>
              </PanelModal>
            ) : null}
            {crmVar ? (
              <PanelModal
                triggerClassName="kd-kutu"
                triggerLabel="Satışa dönen talepler"
                tetik={<>
                  <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Satışlar</span><span className="kd-kutu-cip">son 90 gün {son90Imza.length}</span></span>
                  <span className={imzalananlar.length ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{imzalananlar.length}<small>imzalı sözleşme</small></span>
                  <span className="kd-kutu-satirlar">
                    {imzalananlar.slice(0, 2).map((c) => <span key={c.id}><b>{c.crm_opportunities?.customer_name || c.title || c.contract_no}</b><small>{tamPara(Number(c.amount))}</small></span>)}
                  </span>
                  <span className="kd-kutu-dip"><span>{satisToplami ? tamPara(satisToplami) : "—"} toplam</span><span className="kd-kutu-ac">Aç →</span></span>
                </>}
                kicker={`PERSONEL · ${employee.full_name}`}
                title="Satışa dönen talepler"
                description={`${imzalananlar.length} imzalı sözleşme · son 90 günde ${son90Imza.length} (${son90Deger ? tamPara(son90Deger) : "—"})`}
                boy="buyuk"
              >
                <div className="personel personel-ustunde kd-pencere-liste">
                  {imzalananlar.length ? (
                    <ul className="pu-liste">
                      {imzalananlar.map((c) => (
                        <li key={c.id}>
                          <Link href={`/panel/crm/contracts/${c.id}`}>
                            <span className="pu-govde">
                              <b>{c.crm_opportunities?.customer_name || c.title || "Sözleşme"}</b>
                              <small>{[c.contract_no, c.title, c.signed_at ? `İmza ${shortDate(c.signed_at)}` : null].filter(Boolean).join(" · ")}</small>
                            </span>
                            <span className="pu-tutar">{tamPara(Number(c.amount))}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="pu-bos">Henüz satışa dönen talebi yok.</p>}
                </div>
              </PanelModal>
            ) : null}
            {opsVar ? (
              <PanelModal
                triggerClassName="kd-kutu"
                triggerLabel="Yürüttüğü işler"
                tetik={<>
                  <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Yürüttüğü işler</span><span className="kd-kutu-cip" data-tone={gecikenIs ? "warning" : undefined}>{gecikenIs ? `${gecikenIs} gecikti` : "gecikme yok"}</span></span>
                  <span className={acikIs ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{acikIs}<small>açık iş</small></span>
                  <span className="kd-kutu-satirlar">
                    {isler.slice(0, 2).map((is) => <span key={is.id}><b>{is.title}</b><small>{is.due_date ? `Termin ${shortDate(is.due_date)}` : "Termin yok"}</small></span>)}
                  </span>
                  <span className="kd-kutu-dip"><span>{workflowStatusNames[isler[0]?.status ?? ""] ?? ""}</span><span className="kd-kutu-ac">Aç →</span></span>
                </>}
                kicker={`PERSONEL · ${employee.full_name}`}
                title="Yürüttüğü işler"
                description={`${acikIs} açık iş${gecikenIs ? ` · ${gecikenIs} gecikmiş` : ""}`}
                boy="buyuk"
              >
                <div className="personel personel-ustunde kd-pencere-liste">
                  {isler.length ? (
                    <ul className="pu-liste">
                      {isler.map((is) => {
                        const gecikti = Boolean(is.due_date && is.due_date.slice(0, 10) < bugun);
                        return (
                          <li key={is.id}>
                            <Link href={`/panel/operations/${is.id}`}>
                              <span className="pu-govde">
                                <b>{is.title}</b>
                                <small>
                                  {is.customer_name ? `${is.customer_name} · ` : ""}
                                  {is.due_date ? <span data-tone={gecikti ? "danger" : undefined}>{gecikti ? "Gecikti · " : "Termin "}{shortDate(is.due_date)}</span> : "Termin yok"}
                                </small>
                              </span>
                              <span className="status-pill" data-tone={statusTone(is.status)}>{workflowStatusNames[is.status] ?? is.status}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="pu-bos">Üstünde iş yok.</p>}
                  <Link className="pu-tumu" href={`/panel/operations/isler?sorumlu=${employee.id}`}>{acikIs > isler.length ? `Tümünü listede gör (${acikIs})` : "Listede aç"} →</Link>
                </div>
              </PanelModal>
            ) : null}
            {opsVar ? (
              <PanelModal
                triggerClassName="kd-kutu"
                triggerLabel="Tamamladığı işler"
                tetik={<>
                  <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Tamamladığı işler</span><span className="kd-kutu-cip" data-tone={zamaninda !== null && zamaninda < 70 ? "warning" : undefined}>{zamaninda === null ? "zamanında —" : `zamanında %${zamaninda}`}</span></span>
                  <span className={teslimler.length ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{teslimler.length}<small>teslim</small></span>
                  <span className="kd-kutu-satirlar">
                    {teslimler.slice(0, 2).map((t) => <span key={t.id}><b>{t.title}</b><small>{shortDate(t.delivered_at)}</small></span>)}
                  </span>
                  <span className="kd-kutu-dip"><span>son 90 gün {son90Teslim}</span><span className="kd-kutu-ac">Aç →</span></span>
                </>}
                kicker={`PERSONEL · ${employee.full_name}`}
                title="Tamamladığı işler"
                description={`${teslimler.length} teslim · son 90 günde ${son90Teslim} · ${terminli.length} terminli işte zamanında ${zamaninda === null ? "—" : `%${zamaninda}`}`}
                boy="buyuk"
              >
                <div className="personel personel-ustunde kd-pencere-liste">
                  {teslimler.length ? (
                    <ul className="pu-liste">
                      {teslimler.map((t) => {
                        const gec = Boolean(t.due_date && teslimGunu(t.delivered_at) > t.due_date);
                        return (
                          <li key={t.id}>
                            <Link href={`/panel/operations/${t.id}`}>
                              <span className="pu-govde">
                                <b>{t.title}</b>
                                <small>{[t.customer_name, `Teslim ${shortDate(t.delivered_at)}`, t.due_date ? `termin ${shortDate(t.due_date)}` : null].filter(Boolean).join(" · ")}</small>
                              </span>
                              <span className="status-pill" data-tone={gec ? "warning" : "success"}>{t.due_date ? (gec ? "Geç teslim" : "Zamanında") : "Terminsiz"}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="pu-bos">Henüz teslim ettiği iş yok.</p>}
                </div>
              </PanelModal>
            ) : null}

            {/* İKİNCİ SIRA: yetkiler, özlük dosyası, aylık hedef, maaş/hakediş. */}
            {yetkiDuzenler && employee.user_id ? (
              <PanelModal
                triggerClassName="kd-kutu"
                triggerLabel="Yetkiler"
                tetik={<>
                  <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Yetkiler</span><span className="kd-kutu-cip" data-tone={member && !member.is_active ? "danger" : undefined}>{member ? (member.is_active ? "erişim açık" : "erişim kapalı") : "hesap yok"}</span></span>
                  <span className="kd-kutu-deger kd-kutu-deger-metin">{erisim}</span>
                  <span className="kd-kutu-ozet">Görebildiği modüller ve yapabildiği işlemler; rol kuralı ya da kişiye özel istisna.</span>
                  <span className="kd-kutu-dip"><span /><span className="kd-kutu-ac">Düzenle →</span></span>
                </>}
                kicker="YETKİLER"
                title={employee.full_name}
                description="Görebildiği modüller ve yapabildiği işlemler; rol kuralı ya da kişiye özel istisna."
                boy="tam"
                baslangicAcik={pencere === "yetki"}
                kapaninca={pencere === "yetki" ? temelAdres : undefined}
              >
                <KisiYetkileri hedef={employee.user_id} />
              </PanelModal>
            ) : (
              <div className="kd-kutu is-kapali" aria-disabled="true">
                <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Yetkiler</span></span>
                <span className="kd-kutu-deger kd-kutu-deger-metin">{erisim}</span>
                <span className="kd-kutu-ozet">{employee.user_id ? "Yetkileri değiştirme izniniz yok." : "Panel hesabı yok; davet edilince yetkileri buradan düzenlenir."}</span>
              </div>
            )}
            {canManageTeam || gizlilikGorur ? (
              <PanelModal
                triggerClassName="kd-kutu"
                triggerLabel="Özlük dosyası"
                tetik={<>
                  <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Özlük dosyası</span>{gizlilikGorur ? <span className="kd-kutu-cip" data-tone={gizlilikler.some((g) => g.signed_at) ? undefined : "warning"}>{gizlilikler.some((g) => g.signed_at) ? "gizlilik imzalı" : "gizlilik imzasız"}</span> : null}</span>
                  <span className={docs.length ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{docs.length}<small>belge</small></span>
                  <span className="kd-kutu-satirlar">
                    {docs.slice(0, 2).map((doc) => <span key={doc.id}><b>{doc.file_name}</b><small>{shortDate(doc.created_at)}</small></span>)}
                  </span>
                  <span className="kd-kutu-dip"><span>{gizlilikGorur ? `${gizlilikler.length} gizlilik sözleşmesi` : ""}</span><span className="kd-kutu-ac">Aç →</span></span>
                </>}
                kicker="ÖZLÜK DOSYASI"
                title={employee.full_name}
                description="Gizlilik sözleşmesi ve yüklenen belgeler; yalnızca yetkili ekip görür."
                boy="buyuk"
              >
                <div className="personel personel-sag">
            <div className="ps-panel">
              {/* ÖZLÜK DOSYASI: gizlilik sözleşmesi (eskiden ayrı arşiv sayfasıydı,
                  /panel/hr/confidentiality) ve yüklenen belgeler. İkisi de gizli:
                  sözleşmeyi hr.gizlilik.gor, belgeleri ekip yönetme yetkisi görür. */}
              {gizlilikGorur ? (
                <div className="personel-ozluk">
                  <h3 className="ps-alt">Gizlilik sözleşmesi <small className="pu-sayi">{gizlilikler.length}</small></h3>
                  {gizlilikler.length ? (
                    <ul className="cari-hareketler ps-liste">
                      {gizlilikler.map((g) => {
                        const [ad, ton] = GIZLILIK_DURUMU[g.status] ?? ["İmza bekliyor", "warning"];
                        return (
                          <li key={g.id}>
                            <Link href={`/panel/confidentiality/${g.id}`}>
                              <span className="hr-doc-icon"><HrIcon name="shield" size={17} /></span>
                              <span className="cari-hareket-metin"><b>{g.agreement_no}</b><small>{g.signed_at ? `İmza ${shortDate(g.signed_at)}${g.signer_name ? ` · ${g.signer_name}` : ""}` : `Hazırlandı ${shortDate(g.created_at)}`}</small></span>
                              <span className="status-pill" data-tone={ton}>{ad}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="pu-bos">Gizlilik sözleşmesi yok; yeni personel kaydında otomatik hazırlanır.</p>}
                </div>
              ) : null}
              {canManageTeam ? (
              <div className="personel-ozluk">
                <h3 className="ps-alt">Belgeler <small className="pu-sayi">{docs.length}</small></h3>
                {docs.length ? (
                  <ul className="cari-hareketler ps-liste">
                    {docs.map((doc) => (
                      <li key={doc.id}>
                        <Link href={`/panel/hr/documents/${doc.id}`} target="_blank">
                          <span className="hr-doc-icon"><HrIcon name="doc" size={17} /></span>
                          <span className="cari-hareket-metin"><b>{doc.file_name}</b><small>{[fileSize(doc.file_size), shortDate(doc.created_at)].filter(Boolean).join(" · ")}</small></span>
                        </Link>
                        {/* Özlük dosyası: silinen belge depodan da gidiyor, geri gelmiyor. */}
                        <form action={deleteEmployeeDocument}><input type="hidden" name="document_id" value={doc.id} /><ConfirmDeleteButton label="Sil" confirmMessage={`${doc.file_name} dosyasını kalıcı olarak silmek istediğinize emin misiniz?`} /></form>
                      </li>
                    ))}
                  </ul>
                ) : <p className="pu-bos">Henüz dosya yüklenmedi. Sözleşme, kimlik fotokopisi, diploma gibi belgeleri aşağıdan ekleyin.</p>}
                <form className="personel-yukle" action={uploadEmployeeDocument}>
                  <input type="hidden" name="employee_id" value={employee.id} />
                  <label className="ps-dosya">
                    <span className="ps-dosya-simge" aria-hidden="true"><HrIcon name="doc" size={16} /></span>
                    <span><b>Belge ekle</b><small>En fazla 15 MB · yalnızca ekip yöneticileri görür</small></span>
                    <input type="file" name="file" required aria-label="Özlük dosyası" />
                  </label>
                  <button className="panel-primary" type="submit">Yükle</button>
                </form>
              </div>
              ) : null}
            </div>
                </div>
              </PanelModal>
            ) : null}
            {crmVar ? (
              <Link className="kd-kutu" href="/panel/hr/hedefler">
                <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Bu ayın hedefi</span><span className="kd-kutu-cip" data-tone={hedefOrani !== null && hedefOrani < 50 ? "warning" : undefined}>{hedefOrani === null ? "hedef yok" : `%${hedefOrani}`}</span></span>
                <span className={buAyGerceklesen.tutar ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{tamPara(buAyGerceklesen.tutar)}<small>{hedefTutari ? `/ ${tamPara(hedefTutari)}` : "gerçekleşen"}</small></span>
                {hedefTutari ? <span className="kd-kutu-cubuk" aria-hidden="true"><i style={{ width: `${Math.min(100, hedefOrani ?? 0)}%` }} /></span> : null}
                <span className="kd-kutu-ozet">{hedefSonuc.error ? "Hedef okunamadı." : hedefTutari ? `${buAyGerceklesen.adet} sözleşme imzalandı.` : "Bu ay için satış hedefi girilmemiş."}</span>
                <span className="kd-kutu-dip"><span /><span className="kd-kutu-ac">Hedefler →</span></span>
              </Link>
            ) : null}
            {maasGorur ? (
              <Link className="kd-kutu" href={hakedisli ? "/panel/hr/hakedisler" : "/panel/hr/maaslar"}>
                {hakedisli ? (
                  <>
                    <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Hakediş</span><span className="kd-kutu-cip" data-tone={bekleyenHakedis?.length ? "warning" : undefined}>{bekleyenHakedis === null ? "okunamadı" : bekleyenHakedis.length ? `${bekleyenHakedis.length} bekliyor` : "bekleyen yok"}</span></span>
                    <span className={bekleyenHakedis?.length ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{tamPara((bekleyenHakedis ?? []).reduce((t, h) => t + Number(h.tutar), 0))}<small>ödeme bekleyen</small></span>
                    <span className="kd-kutu-ozet">Sözleşmeli çalışan bordroya girmez; ödemesi hakedişle yapılır.</span>
                    <span className="kd-kutu-dip"><span /><span className="kd-kutu-ac">Hakedişler →</span></span>
                  </>
                ) : (
                  <>
                    <span className="kd-kutu-ust"><span className="kd-kutu-etiket">Bu ayın maaşı</span><span className="kd-kutu-cip" data-tone={buAyMaas && !buAyMaas.odendi_on ? "warning" : undefined}>{maasSonuc.error ? "okunamadı" : !buAyMaas ? "girilmemiş" : buAyMaas.odendi_on ? "ödendi" : "bekliyor"}</span></span>
                    <span className={buAyMaas?.anlasilan_net ? "kd-kutu-deger" : "kd-kutu-deger is-sessiz"}>{buAyMaas?.anlasilan_net ? tamPara(buAyMaas.anlasilan_net) : "—"}<small>anlaşılan net</small></span>
                    <span className="kd-kutu-ozet">{buAyMaas?.odendi_on ? `Ödendi ${shortDate(buAyMaas.odendi_on)}${buAyMaas.odenen ? ` · ${tamPara(buAyMaas.odenen)}` : ""}` : "Bordro Maaşlar ekranında hazırlanır."}</span>
                    <span className="kd-kutu-dip"><span /><span className="kd-kutu-ac">Maaşlar →</span></span>
                  </>
                )}
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
