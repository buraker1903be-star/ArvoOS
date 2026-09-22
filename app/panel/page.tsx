import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";
import { requestStageNames } from "./crm/request-status";
import { relativeTime } from "./crm/last-contact";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { legalDetailsFrom, validateLegalDetails } from "./settings/legal-details";
import "./dashboard.css";

// Ana sayfa: günün özeti. iOS widget'ları gibi dokunulabilir kartlar, son
// 14 günün talep grafiği, aşama dağılımı, odak listesi ve son hareketler.
// Her bölüm yalnızca ilgili modül açıksa sorgulanır ve gösterilir; tahsilat
// rakamları finans sayfasıyla aynı kurala (Kurum Sahibi / Yönetici) bağlı.

const TZ = "Europe/Istanbul";
const DAY = 24 * 60 * 60 * 1000;

const money = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const dayKey = (value: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

const academicActiveStages = [
  "lead", "pre_review", "academic_review", "proposal_ready", "proposal_approved",
  "contract_ready", "payment_pending", "payment_approved", "work_opened",
  "expert_assigned", "delivery",
];
const academicStageNames: Record<string, string> = {
  lead: "Yeni talep",
  pre_review: "Ön inceleme",
  academic_review: "Akademik değerlendirme",
  proposal_ready: "Teklif hazır",
  proposal_approved: "Teklif onaylandı",
  contract_ready: "Sözleşme hazır",
  payment_pending: "Ödeme bekleniyor",
  payment_approved: "Ödeme onaylandı",
  work_opened: "İş açıldı",
  expert_assigned: "Uzman atandı",
  delivery: "Teslim aşamasında",
};
const generalActiveStages = ["lead", "qualified", "proposal", "contract"];

// Son hareketler: "Meral teklifi müşteriye gönderdi"
const NOUN: Record<string, string> = { crm_opportunity: "talep", crm_proposal: "teklif", crm_contract: "sözleşme", operation_workflow: "iş akışı" };
const ACC: Record<string, string> = { crm_opportunity: "talebi", crm_proposal: "teklifi", crm_contract: "sözleşmeyi", operation_workflow: "iş akışını" };
const GEN: Record<string, string> = { crm_opportunity: "talebin", crm_proposal: "teklifin", crm_contract: "sözleşmenin", operation_workflow: "iş akışının" };
const DAT: Record<string, string> = { crm_opportunity: "talebe", crm_proposal: "teklife", crm_contract: "sözleşmeye", operation_workflow: "iş akışına" };
function activityVerb(action: string, entity: string) {
  const acc = ACC[entity] ?? "kaydı";
  const phrases: Record<string, string> = {
    create: `yeni bir ${NOUN[entity] ?? "kayıt"} oluşturdu`,
    update: `${acc} güncelledi`,
    assign: `${DAT[entity] ?? "kayda"} temsilci atadı`,
    status: `${GEN[entity] ?? "kaydın"} durumunu değiştirdi`,
    stage: `${GEN[entity] ?? "kaydın"} aşamasını değiştirdi`,
    send: `${acc} müşteriye gönderdi`,
    convert: `${acc} sözleşmeye dönüştürdü`,
    archive: `${acc} arşivledi`,
    delete: `${acc} sildi`,
  };
  return phrases[action] ?? `${acc} güncelledi`;
}
function activityHref(entity: string, id: string | null, action: string) {
  if (!id || action === "delete") return null;
  if (entity === "crm_proposal") return `/panel/crm/proposals/${id}`;
  if (entity === "crm_contract") return `/panel/crm/contracts/${id}`;
  if (entity === "crm_opportunity") return `/panel/crm/requests/${id}`;
  return null;
}

// Zamana bağlı yardımcılar (bileşen gövdesinde saat okunmaz).
// Sunucu UTC'de çalışıyor: eskiden gün ve ay sınırı sunucu saatinden
// alınıyordu. Gece 00:00–03:00 arasında "bugün" bir önceki günü gösteriyor,
// ayın 1'inde o saatlerde ödenen fatura "bu ay"a girmiyordu.
function dateWindow() {
  const now = Date.now();
  const today = todayInIstanbul(new Date(now));
  return {
    monthStartIso: istanbulMidnight(`${today.slice(0, 7)}-01`).toISOString(),
    today,
    weekEnd: todayInIstanbul(new Date(now + 7 * DAY)),
  };
}
function greetingLine() {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  const greeting = hour < 5 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : hour < 23 ? "İyi akşamlar" : "İyi geceler";
  const date = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  return { greeting, date };
}
function requestTrend(createdAt: string[]) {
  const now = Date.now();
  const keys = new Map<string, number>();
  const days = Array.from({ length: 14 }, (_, index) => {
    const at = now - (13 - index) * DAY;
    const key = dayKey(at);
    keys.set(key, index);
    return {
      key,
      count: 0,
      day: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric" }).format(new Date(at)),
      title: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(at)),
      isToday: index === 13,
    };
  });
  let previous = 0;
  for (const value of createdAt) {
    const index = keys.get(dayKey(value));
    if (index !== undefined) days[index].count += 1;
    else {
      const age = now - Date.parse(value);
      if (age >= 14 * DAY && age < 28 * DAY) previous += 1;
    }
  }
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return { days, total, previous, today: days[13].count, max: Math.max(1, ...days.map((day) => day.count)) };
}

// ---------------------------------------------------------------
// Simgeler
// ---------------------------------------------------------------
const iconPaths: Record<string, ReactNode> = {
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></>,
  review: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  spark: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  wallet: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}
const Chevron = () => (
  <svg className="dash-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

type Tone = "info" | "gold" | "success" | "danger" | "brand" | "neutral";
type Widget = { label: string; value: string | number; note: string; href: string; icon: string; tone: Tone };
type FocusItem = { label: string; count: number; href: string; icon: string; tone: Tone; urgent?: boolean };
type LogRow = { id: number; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string; metadata: { opportunity_id?: string } | null };

export default async function PanelPage() {
  const { supabase, organization, isPlatformOwner, membership, hiddenModuleKeys, userId } = await getPanelContext();
  const organizationId = organization.id;
  const window = dateWindow();

  const isOwner = isPlatformOwner || membership.role === "owner";
  const canSee = (moduleKey: string) => isOwner || !hiddenModuleKeys.has(moduleKey);
  const canSeeCrm = canSee("crm");
  const canSeeOperations = canSee("operations");
  const canSeeReports = canSee("reports");
  const canSeeFinance = isPlatformOwner || (["owner", "admin"].includes(membership.role) && canSee("finance"));
  // Kurulum kartı yalnızca kurum sahibi/yöneticisine; platform kurucusu görmez.
  const canSetup = !isPlatformOwner && ["owner", "admin"].includes(membership.role);
  const none = Promise.resolve({ data: null, count: 0, error: null });

  const { data: verticalProfile } = await supabase
    .from("organization_vertical_profiles")
    .select("vertical_code")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const isAcademic = verticalProfile?.vertical_code === "academic_services";

  const [
    { data: opportunities, error: opportunitiesError },
    { count: openWorkflowCount, error: openWorkflowError },
    { count: dueThisWeekCount, error: dueThisWeekError },
    { count: overdueWorkflowCount, error: overdueWorkflowError },
    { count: pendingPaymentCount, error: pendingPaymentError },
    { count: unreadNotificationCount, error: unreadNotificationError },
    { data: paidInvoices, error: paidInvoicesError },
    { data: logRows, error: logRowsError },
    { data: me, error: meError },
    { data: onboardingRow, error: onboardingError },
    { data: setupOrganization, error: setupOrganizationError },
    { count: memberCount, error: memberCountError },
  ] = await Promise.all([
    canSeeCrm ? supabase.from("crm_opportunities").select("stage,estimated_value,probability,created_at").eq("organization_id", organizationId) : none,
    canSeeOperations ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress", "blocked"]) : none,
    canSeeOperations ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress"]).gte("due_date", window.today).lte("due_date", window.weekEnd) : none,
    canSeeOperations ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["planned", "in_progress", "blocked"]).lt("due_date", window.today) : none,
    !canSeeFinance
      ? none
      : isPlatformOwner
        ? supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
        : supabase.from("organization_payment_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    isPlatformOwner
      ? supabase.from("notifications").select("id", { count: "exact", head: true }).eq("audience", "founder").is("read_at", null)
      : supabase.rpc("arvo_unread_notification_count", { p_organization_id: organizationId }).then(({ data, error }) => ({ count: Number(data ?? 0), error })),
    !canSeeFinance
      ? none
      : isPlatformOwner
        /*
          Kurucunun ayı: platformun TAHSİL ETTİĞİ para. Eskiden burada tüm
          kurumların billing_invoices toplamı okunuyordu — o tablo kiracının
          KENDİ MÜŞTERİLERİNE kestiği faturalar (Finans modülü oraya yazıyor).
          Kurucu ekranı, müşterilerinin cirosunu kendi geliri gibi
          gösteriyordu.
        */
        ? supabase.from("organization_payment_requests").select("amount").eq("status", "approved").gte("reviewed_at", window.monthStartIso)
        : supabase.from("billing_invoices").select("total").eq("organization_id", organizationId).eq("status", "paid").gte("paid_at", window.monthStartIso),
    canSeeCrm
      ? supabase.from("activity_logs").select("id,actor_user_id,action,entity_type,entity_id,created_at,metadata").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(7)
      : none,
    supabase.from("hr_employees").select("full_name").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    canSetup ? supabase.from("organization_onboarding").select("completed_at").eq("organization_id", organizationId).maybeSingle() : none,
    canSetup ? supabase.from("organizations").select(`${ORGANIZATION_LEGAL_COLUMNS},logo_url,signature_stamp_url`).eq("id", organizationId).maybeSingle() : none,
    canSetup ? supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true) : none,
  ]);

  /*
    Supabase istemcisi hata fırlatmaz, yalnızca error alanına yazar. Eskiden
    burada sadece data/count okunuyordu: RLS engeli ya da yanlış sütun adı
    "hiç kayıt yok" gibi görünüyor, ana sayfa sıfır gösterip susuyordu
    (Platform → Ödemeler bu yüzden iki gün "sorun yok" gösterdi).
  */
  const failedQueries = ([
    ["Talepler", opportunitiesError],
    ["Açık işler", openWorkflowError],
    ["Bu hafta teslim", dueThisWeekError],
    ["Geciken işler", overdueWorkflowError],
    ["Bekleyen ödemeler", pendingPaymentError],
    ["Bildirimler", unreadNotificationError],
    ["Tahsilatlar", paidInvoicesError],
    ["Son hareketler", logRowsError],
    ["Çalışan kaydı", meError],
    ["Kurulum durumu", onboardingError],
    ["Kurum bilgileri", setupOrganizationError],
    ["Ekip sayısı", memberCountError],
  ] as [string, { message: string } | null | undefined][])
    .filter((row): row is [string, { message: string }] => Boolean(row[1]));
  if (failedQueries.length)
    console.error("[panel] ana sayfa sorguları okunamadı", {
      organizationId,
      role: membership.role,
      failures: failedQueries.map(([label, error]) => `${label}: ${error.message}`),
    });

  // Son hareketler için kişi ve müşteri adları
  const logs = (logRows ?? []) as LogRow[];
  const actorIds = [...new Set(logs.map((log) => log.actor_user_id).filter((id): id is string => Boolean(id)))];
  const opportunityIds = [...new Set(logs.map((log) => log.metadata?.opportunity_id).filter((id): id is string => Boolean(id)))];
  const [{ data: actorRows }, { data: customerRows }] = await Promise.all([
    actorIds.length ? supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", organizationId).in("user_id", actorIds) : Promise.resolve({ data: [] }),
    opportunityIds.length ? supabase.from("crm_opportunities").select("id,customer_name").in("id", opportunityIds) : Promise.resolve({ data: [] }),
  ]);
  const actorName = new Map(((actorRows ?? []) as { user_id: string; full_name: string }[]).map((row) => [row.user_id, formatPersonName(row.full_name)]));
  const customerName = new Map(((customerRows ?? []) as { id: string; customer_name: string | null }[]).map((row) => [row.id, formatPersonName(row.customer_name)]));

  const items = (opportunities ?? []) as { stage: string; estimated_value: number | null; probability: number | null; created_at: string }[];
  /* Kurucuda alan adı "amount" (tahsilat), kurumda "total" (fatura). */
  const monthlyRevenue = ((paidInvoices ?? []) as { total?: number | null; amount?: number | null }[])
    .reduce((sum, satir) => sum + Number(satir.total ?? satir.amount ?? 0), 0);
  const stageCount = (stage: string) => items.filter((item) => item.stage === stage).length;
  const activeOpportunities = items.filter((item) => !["won", "lost", "completed"].includes(item.stage));
  const pipelineValue = activeOpportunities.reduce((sum, item) => sum + Number(item.estimated_value ?? 0), 0);
  const weightedForecast = activeOpportunities.reduce((sum, item) => sum + Math.round(Number(item.estimated_value ?? 0) * Number(item.probability ?? 0) / 100), 0);
  const trend = requestTrend(items.map((item) => item.created_at).filter(Boolean));
  const overdue = overdueWorkflowCount ?? 0;
  const unread = unreadNotificationCount ?? 0;

  // Kurulum adımları: belgeler ve müşteri ekranı eksiksiz görünene kadar
  // gösterilir; hepsi tamamlanınca kart kendiliğinden kaybolur. Ölçütler
  // Ayarlar'daki "Belge kimliği" ile aynıdır.
  // Ekip adımı isteğe bağlı: tek kişilik işletmelerde kart hiç kaybolmazdı.
  type SetupStep = { key: string; title: string; note: string; href: string; done: boolean; optional?: boolean };
  const setupSteps: SetupStep[] = [];
  if (canSetup && setupOrganization) {
    const row = setupOrganization as Record<string, unknown> & { logo_url?: string | null; signature_stamp_url?: string | null };
    const legal = legalDetailsFrom(row);
    const legalFilled = [legal.legal_address, legal.legal_city, legal.tax_office, legal.tax_number, legal.iban].filter(Boolean).length;
    const legalComplete = legalFilled === 5 && !Object.keys(validateLegalDetails(legal)).length;
    const hasLogo = Boolean(row.logo_url);
    const hasSignature = Boolean(row.signature_stamp_url);
    const members = memberCount ?? 0;
    setupSteps.push(
      { key: "kurum", title: "Kurum ve marka", note: "Resmi ad, iletişim, logo ve marka rengi", href: "/panel/onboarding", done: Boolean((onboardingRow as { completed_at?: string | null } | null)?.completed_at) },
      { key: "resmi", title: "Resmi bilgiler ve IBAN", note: legalComplete ? "Belgelere otomatik yazılıyor" : `${legalFilled}/5 zorunlu alan dolu`, href: "/panel/settings#resmi-bilgiler", done: legalComplete },
      { key: "kimlik", title: "Logo ve kaşe-imza", note: hasLogo && hasSignature ? "Belgelerde görünüyor" : hasLogo ? "Kaşe-imza görseli eksik" : hasSignature ? "Logo eksik" : "Logo ve kaşe-imza görseli eksik", href: "/panel/settings#kurumsal-kimlik", done: hasLogo && hasSignature },
      { key: "ekip", title: "Ekibinizi davet edin", note: members > 1 ? `${members} kişi panelde` : "Satış ve operasyon ekibinizi ekleyin", href: "/panel/hr", done: members > 1, optional: true },
    );
    if (canSeeCrm) setupSteps.push({ key: "talep", title: "İlk talebinizi girin", note: items.length ? `${items.length} talep kayıtlı` : "Teklif, sözleşme ve takip buradan başlar", href: "/panel/crm", done: items.length > 0 });
  }
  const requiredSteps = setupSteps.filter((step) => !step.optional);
  const setupDone = requiredSteps.filter((step) => step.done).length;
  const showSetup = requiredSteps.length > 0 && setupDone < requiredSteps.length;

  // Widget'lar ve odak listesi (kurum türüne göre)
  const proposalWaiting = stageCount("proposal_ready") + stageCount("proposal_approved");
  const widgets: Widget[] = [];
  const focus: FocusItem[] = [];
  if (isAcademic) {
    if (canSeeCrm) {
      widgets.push(
        { label: "Yeni talep", value: stageCount("lead"), note: "İlk incelemeyi bekliyor", href: "/panel/crm", icon: "inbox", tone: "info" },
        { label: "Değerlendirme", value: stageCount("pre_review") + stageCount("academic_review"), note: "Ön ve akademik inceleme", href: "/panel/crm", icon: "review", tone: "brand" },
        { label: "Teklif bekleyen", value: proposalWaiting, note: `${money(weightedForecast)} tahmini değer`, href: "/panel/crm/proposals", icon: "doc", tone: "gold" },
        { label: "Tahsilat bekleyen", value: stageCount("payment_pending"), note: canSeeFinance ? `${money(monthlyRevenue)} bu ay tahsilat` : "Ödeme bekleyen dosya", href: canSeeFinance ? "/panel/finance" : "/panel/crm", icon: "wallet", tone: "success" },
      );
      focus.push(
        { label: "Yeni talepleri ön incelemeye al", count: stageCount("lead"), href: "/panel/crm", icon: "inbox", tone: "info" },
        { label: "Akademik değerlendirmeleri sonuçlandır", count: stageCount("academic_review"), href: "/panel/crm", icon: "review", tone: "brand" },
        { label: "Teklif ve sözleşmeleri tamamla", count: proposalWaiting + stageCount("contract_ready"), href: "/panel/crm/proposals", icon: "doc", tone: "gold" },
      );
    }
    if (canSeeOperations) widgets.push({ label: "Aktif iş", value: openWorkflowCount ?? 0, note: `${dueThisWeekCount ?? 0} bu hafta teslim`, href: "/panel/operations", icon: "briefcase", tone: "success" });
  } else {
    if (canSeeCrm) {
      widgets.push(
        { label: "Aktif talep", value: activeOpportunities.length, note: `${money(pipelineValue)} toplam değer`, href: "/panel/crm", icon: "inbox", tone: "info" },
        { label: "Tahmini gelir", value: money(weightedForecast), note: "Olasılığa göre", href: "/panel/crm/proposals", icon: "spark", tone: "gold" },
      );
      focus.push({ label: "Talepleri incele", count: activeOpportunities.length, href: "/panel/crm", icon: "inbox", tone: "info" });
    }
    if (canSeeOperations) widgets.push({ label: "Aktif iş", value: openWorkflowCount ?? 0, note: `${dueThisWeekCount ?? 0} bu hafta teslim`, href: "/panel/operations", icon: "briefcase", tone: "success" });
    if (canSeeFinance) widgets.push({ label: "Bu ay tahsilat", value: money(monthlyRevenue), note: `${pendingPaymentCount ?? 0} ödeme bekliyor`, href: "/panel/finance", icon: "wallet", tone: "gold" });
  }
  widgets.push({ label: "Bildirim", value: unread, note: unread ? "Okunmamış kayıt" : "Hepsi okundu", href: "/panel/notifications", icon: "bell", tone: "brand" });
  if (canSeeOperations) {
    focus.push(
      { label: "Geciken teslimleri incele", count: overdue, href: "/panel/operations", icon: "alert", tone: "danger", urgent: true },
      { label: "Bu hafta teslim edilecekler", count: dueThisWeekCount ?? 0, href: "/panel/operations", icon: "clock", tone: "success" },
    );
  }
  if (canSeeFinance) focus.push({ label: "Bekleyen tahsilatları kontrol et", count: isAcademic ? stageCount("payment_pending") : pendingPaymentCount ?? 0, href: "/panel/finance", icon: "wallet", tone: "gold" });
  focus.push({ label: "Bildirimleri gözden geçir", count: unread, href: "/panel/notifications", icon: "bell", tone: "brand" });

  const stageCodes = isAcademic ? academicActiveStages : generalActiveStages;
  const stageRows = stageCodes
    .map((code) => ({ code, name: (isAcademic ? academicStageNames[code] : requestStageNames[code]) ?? code, count: stageCount(code) }))
    .filter((row) => row.count > 0 || !isAcademic);
  const stageMax = Math.max(1, ...stageRows.map((row) => row.count));

  // Özet cümle
  const { greeting, date } = greetingLine();
  const firstName = formatPersonName(me?.full_name).split(" ")[0];
  const parts = [
    canSeeCrm && trend.today ? `${trend.today} yeni talep` : null,
    canSeeOperations && overdue ? `${overdue} geciken iş` : null,
    canSeeOperations && dueThisWeekCount ? `bu hafta ${dueThisWeekCount} teslim` : null,
    unread ? `${unread} okunmamış bildirim` : null,
  ].filter(Boolean);
  const summary = parts.length ? `Bugün ${parts.join(", ")} var.` : "Bekleyen acil bir iş yok, her şey yolunda.";
  const delta = trend.previous ? Math.round(((trend.total - trend.previous) / trend.previous) * 100) : null;

  return (
    <div className="dash">
      <header className="dash-hero">
        <div>
          <small className="panel-kicker">{date.toLocaleUpperCase("tr-TR")}</small>
          <h1>{greeting}{firstName ? `, ${firstName}` : ""}</h1>
          <p>{summary}</p>
        </div>
        <div className="panel-page-actions">
          {/* Raporlar artık Finans sekmesi: Finans'ı göremeyen role düğme gösterilmez */}
          {canSeeReports && canSeeFinance ? <Link className="panel-secondary" href="/panel/finance/raporlar">Raporlar</Link> : null}
          {canSeeCrm ? <Link className="panel-primary" href="/panel/crm">+ Yeni talep</Link> : null}
        </div>
      </header>

      {failedQueries.length ? (
        <p className="dash-uyari" data-tone="danger" role="alert">
          <span aria-hidden="true"><Icon name="alert" size={16} /></span>
          <span>
            <b>Bazı veriler okunamadı</b>
            <small>{failedQueries.map(([label]) => label).join(", ")} yüklenemedi; aşağıdaki rakamlar eksik olabilir. Sorun sürerse destek kaydı açın.</small>
          </span>
        </p>
      ) : null}

      <section className="dash-widgets" aria-label="Özet">
        {widgets.map((widget) => (
          <Link className="dash-widget" data-tone={widget.tone} href={widget.href} key={widget.label}>
            <span className="dash-widget-icon"><Icon name={widget.icon} /></span>
            <small>{widget.label}</small>
            <strong>{widget.value}</strong>
            <span className="dash-widget-note">{widget.note}</span>
          </Link>
        ))}
      </section>

      {showSetup ? (
        <section className="dash-card dash-setup" aria-label="Kurulum">
          <header className="dash-card-head">
            <div>
              <h2>Kurulumu tamamlayın</h2>
              <p>Teklif, sözleşme ve müşteri takip ekranınızın eksiksiz görünmesi için {requiredSteps.length - setupDone} adım kaldı.</p>
            </div>
            <div className="dash-setup-progress" aria-label={`${requiredSteps.length} adımdan ${setupDone} tamamlandı`}>
              <b>{setupDone}/{requiredSteps.length}</b>
              <span><i style={{ "--w": `${Math.round((setupDone / requiredSteps.length) * 100)}%` } as CSSProperties} /></span>
            </div>
          </header>
          <ol className="dash-setup-list">
            {setupSteps.map((step, index) => {
              const content = (
                <>
                  <span className="dash-setup-dot" aria-hidden="true">{step.done ? <Icon name="check" size={14} /> : index + 1}</span>
                  <span className="dash-setup-text">
                    <b>{step.title}</b>
                    <small>{step.optional ? "İsteğe bağlı · " : ""}{step.note}</small>
                    {step.done ? <span className="dash-setup-state">Tamamlandı</span> : <span className="dash-setup-go">Tamamla <Chevron /></span>}
                  </span>
                </>
              );
              return (
                <li key={step.key}>
                  {step.done
                    ? <div className="dash-setup-step is-done">{content}</div>
                    : <Link className="dash-setup-step" href={step.href}>{content}</Link>}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="dash-grid">
        {canSeeCrm ? (
          <article className="dash-card dash-chart">
            <header className="dash-card-head">
              <div>
                <h2>Yeni talepler</h2>
                <p>Son 14 gün</p>
              </div>
              <div className="dash-stat">
                <strong>{trend.total}</strong>
                {delta !== null ? (
                  <span data-tone={delta >= 0 ? "success" : "danger"}>{delta >= 0 ? "+" : ""}{delta}% önceki 14 güne göre</span>
                ) : trend.total ? <span data-tone="neutral">önceki dönemde talep yok</span> : null}
              </div>
            </header>
            <div className="dash-bars" role="img" aria-label={`Son 14 günde ${trend.total} yeni talep`}>
              {trend.days.map((day) => (
                <div className={`dash-bar${day.isToday ? " is-today" : ""}${day.count ? "" : " is-empty"}`} key={day.key} title={`${day.title}: ${day.count} talep`}>
                  <span className="dash-bar-value">{day.count || ""}</span>
                  <span className="dash-bar-fill" style={{ "--h": `${day.count ? Math.max(10, (day.count / trend.max) * 100) : 4}%` } as CSSProperties} />
                  <small>{day.day}</small>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <article className="dash-card dash-focus">
          <header className="dash-card-head"><div><h2>Bugün neye odaklanmalı?</h2><p>Bekleyen işler</p></div></header>
          <nav className="dash-list">
            {focus.map((item) => (
              <Link className="dash-row" data-tone={item.urgent && item.count ? "danger" : item.tone} href={item.href} key={item.label}>
                <span className="dash-row-icon"><Icon name={item.icon} size={17} /></span>
                <span className="dash-row-label">{item.label}</span>
                <b className={`dash-row-count${item.count ? "" : " is-zero"}`}>{item.count}</b>
                <Chevron />
              </Link>
            ))}
          </nav>
        </article>

        {canSeeCrm ? (
          <article className="dash-card dash-stages">
            <header className="dash-card-head"><div><h2>Talep aşamaları</h2><p>{activeOpportunities.length} aktif kayıt</p></div></header>
            {stageRows.length ? (
              <ul className="dash-stage-list">
                {stageRows.map((row) => (
                  <li key={row.code}>
                    <div className="dash-stage-top"><span>{row.name}</span><b>{row.count}</b></div>
                    <div className="dash-stage-track"><span style={{ "--w": `${row.count ? Math.max(4, (row.count / stageMax) * 100) : 0}%` } as CSSProperties} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className="dash-empty">Aktif talep yok.</p>}
            <Link className="dash-card-link" href="/panel/crm">Taleplere git <Chevron /></Link>
          </article>
        ) : null}

        {canSeeCrm ? (
          <article className="dash-card dash-activity">
            <header className="dash-card-head"><div><h2>Son hareketler</h2><p>Talep, teklif ve sözleşmelerde</p></div></header>
            {logs.length ? (
              <ul className="dash-activity-list">
                {logs.map((log) => {
                  const actor = (log.actor_user_id && actorName.get(log.actor_user_id)) || "Bir ekip üyesi";
                  const customer = log.metadata?.opportunity_id ? customerName.get(log.metadata.opportunity_id) : null;
                  const href = activityHref(log.entity_type, log.entity_id, log.action);
                  const content = (
                    <>
                      <span className="dash-avatar" aria-hidden="true">{actor.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span>
                      <span className="dash-activity-body">
                        <span><b>{actor.split(" ")[0]}</b> {activityVerb(log.action, log.entity_type)}</span>
                        <small>{customer ? `${customer} · ` : ""}{relativeTime(log.created_at)}</small>
                      </span>
                      {href ? <Chevron /> : null}
                    </>
                  );
                  return <li key={log.id}>{href ? <Link className="dash-activity-row" href={href}>{content}</Link> : <div className="dash-activity-row">{content}</div>}</li>;
                })}
              </ul>
            ) : <p className="dash-empty">Henüz hareket yok. Talep, teklif ya da sözleşmelerde yapılan işlemler burada görünecek.</p>}
          </article>
        ) : null}
      </section>
    </div>
  );
}
