import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, simdi, yeniMi } from "../../os/genel-bakis";
import { PanelDrawer } from "../../components/panel-drawer";
import { RequestEntryForm } from "../request-entry-form";
import { CrmTabs } from "../crm-tabs";
import { daysSince, relativeTime, waitingLabel } from "../last-contact";
import "../crm.css";

/*
  CRM genel bakış: satışçının günlük ekranı. Ana ekranla aynı şablon
  (os/genel-bakis.tsx, 2026-10): son 14 günün talep grafiği ve dört liste —
  yeni talepler, yanıt bekleyen teklifler, imza bekleyen sözleşmeler, son
  imzalananlar. Eskiden üstte beş sayı kartı ve 30 günlük satış hunisi
  vardı; huni raporlarda (Finans → Raporlar).
  Veri, CRM listeleriyle aynı kapsamda: kurum filtresi + RLS.
*/

type Opportunity = { id: string; title: string; customer_name: string; stage: string; assigned_employee_id: string | null; created_at: string };
type Customer = { customer_name: string } | { customer_name: string }[] | null;
type Proposal = {
  id: string; proposal_no: string; amount: number; currency: string; status: string; archive_reason: string | null;
  valid_until: string | null; sent_at: string | null; view_count: number; responded_at: string | null; created_at: string;
  superseded_by: string | null; opportunity_id: string; crm_opportunities: Customer;
};
type Contract = {
  id: string; contract_no: string; amount: number; currency: string; status: string; proposal_id: string | null;
  sent_at: string | null; view_count: number; signed_at: string | null; created_at: string; crm_opportunities: Customer;
};
type Representative = { id: string; full_name: string; job_title: string | null; can_receive_sales_requests: boolean };

const TZ = "Europe/Istanbul";
// Teklif öncesi aşamalar (genel ve akademik kurumlar)
const NEW_STAGES = new Set(["lead", "qualified", "pre_review", "academic_review"]);

const money = (amount: number, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0) / 100);
const dayKey = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value));
const customerOf = (value: Customer) => formatPersonName(Array.isArray(value) ? value[0]?.customer_name : value?.customer_name) || "Müşteri";

// Zamana bağlı değerler (saat bileşen gövdesinde okunmaz)
function timeWindow() {
  const now = Date.now();
  const today = dayKey(now);
  return { today, monthKey: today.slice(0, 7), since30: now - 30 * 86400000, since90: now - 90 * 86400000 };
}
/** Geçerlilik tarihine kalan gün (bugün = 0, geçmişse negatif). */
const daysUntil = (dateKey: string, today: string) => Math.round((Date.parse(dateKey) - Date.parse(today)) / 86400000);

export default async function CrmOverviewPage() {
  const { supabase, membership, modules, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const canAssign = izin("crm.kayit.ata");
  const time = timeWindow();

  const [
    { data: opportunityData, error: opportunityError },
    { data: proposalData, error: proposalError },
    { data: contractData, error: contractError },
    { data: employeeData, error: employeeError },
    { data: stageData },
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("id,title,customer_name,stage,assigned_employee_id,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("crm_proposals").select("id,proposal_no,amount,currency,status,archive_reason,valid_until,sent_at,view_count,responded_at,created_at,superseded_by,opportunity_id,crm_opportunities(customer_name)").eq("organization_id", organizationId),
    supabase.from("crm_contracts").select("id,contract_no,amount,currency,status,proposal_id,sent_at,view_count,signed_at,created_at,crm_opportunities(customer_name)").eq("organization_id", organizationId),
    supabase.from("hr_employees").select("id,full_name,job_title,can_receive_sales_requests").eq("organization_id", organizationId).eq("employment_status", "active").order("full_name"),
    supabase.from("organization_crm_stages").select("code").eq("organization_id", organizationId).eq("is_active", true),
  ]);
  if (opportunityError) throw new Error("Talepler okunamadı: " + opportunityError.message);
  if (proposalError) throw new Error("Teklifler okunamadı: " + proposalError.message);
  if (contractError) throw new Error("Sözleşmeler okunamadı: " + contractError.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);

  const opportunities = (opportunityData ?? []) as Opportunity[];
  const proposals = (proposalData ?? []) as unknown as Proposal[];
  const contracts = (contractData ?? []) as unknown as Contract[];
  const employees = (employeeData ?? []) as Representative[];
  const employeeName = new Map(employees.map((row) => [row.id, formatPersonName(row.full_name)]));
  const salesRepresentatives = employees.filter((row) => row.can_receive_sales_requests).map(({ id, full_name, job_title }) => ({ id, full_name, job_title }));
  const academicMode = (stageData ?? []).some((row: { code: string }) => row.code === "academic_review");
  // Çalışma türleri: "Yeni talep" formundaki seçim bunlardan geliyor.
  const { data: turData } = await supabase
    .from("organization_step_template_sets")
    .select("code,name,is_default")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .order("sort_order")
    .order("code");
  const calismaTurleri = (turData ?? []) as { code: string; name: string; is_default: boolean }[];


  // ---- Yeni talepler: atanmamışlar üstte, sonra en yeni
  const newRequests = opportunities
    .filter((row) => NEW_STAGES.has(row.stage))
    .sort((a, b) => Number(Boolean(a.assigned_employee_id)) - Number(Boolean(b.assigned_employee_id)) || b.created_at.localeCompare(a.created_at));
  const unassignedCount = newRequests.filter((row) => !row.assigned_employee_id).length;

  // ---- Müşteri yanıtı bekleyen teklifler: süresi en yakın olan üstte
  const pendingProposals = proposals
    .filter((row) => row.status === "sent" && !row.superseded_by)
    .sort((a, b) => (a.valid_until ?? "9999").localeCompare(b.valid_until ?? "9999") || (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
  const pendingProposalValue = pendingProposals.filter((row) => row.currency === "TRY").reduce((sum, row) => sum + Number(row.amount), 0);
  const expiringCount = pendingProposals.filter((row) => row.valid_until && daysUntil(row.valid_until, time.today) <= 3).length;

  // ---- İmza bekleyen sözleşmeler: en uzun bekleyen üstte
  const pendingContracts = contracts
    .filter((row) => row.status === "sent")
    .sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
  const lateContracts = pendingContracts.filter((row) => (daysSince(row.sent_at) ?? 0) >= 7).length;

  // ---- Bu ay imzalanan
  const signed = contracts.filter((row) => ["signed", "completed"].includes(row.status) && row.signed_at);
  const signedThisMonth = signed.filter((row) => dayKey(row.signed_at!).startsWith(time.monthKey));
  const signedThisMonthValue = signedThisMonth.filter((row) => row.currency === "TRY").reduce((sum, row) => sum + Number(row.amount), 0);

  // ---- Son imzalanan sözleşmeler: en yeni üstte
  const recentSigned = [...signed].sort((a, b) => (b.signed_at ?? "").localeCompare(a.signed_at ?? ""));

  // ---- Grafik: son 14 günde girilen talepler (önceki 14 günle kıyas)
  const seri = gunlukSeri(opportunities.map((row) => row.created_at), simdi());

  return (
    <GenelBakis
      baslik="Genel bakış"
      eylemler={<>
        <Link className="panel-secondary" href="/panel/crm">Tüm talepler</Link>
        <PanelDrawer triggerLabel="+ Yeni talep" kicker="YENİ KAYIT" triggerClassName="panel-primary" title={academicMode ? "Talep Girişi" : "Yeni talep"} description="Müşteri ve talep bilgilerini kaydedin.">
          <RequestEntryForm academicMode={academicMode} salesRepresentatives={salesRepresentatives} canAssign={canAssign} calismaTurleri={calismaTurleri} />
        </PanelDrawer>
      </>}
      sekmeler={<CrmTabs active="genel-bakis" />}
    >
      <SeriKarti baslik="Yeni talepler" alt="Son 14 gün" seri={seri} adet="talep" />

      <ListeIzgarasi etiket="Satış işleri">
        <ListeKarti baslik="Yeni talepler" alt={unassignedCount ? `${unassignedCount} talep temsilci bekliyor` : "Teklif öncesi aşamadaki talepler"} bos="Yeni talep yok. Girilen talepler burada belirir." href="/panel/crm" hrefEtiket="Tüm talepler" sayi={newRequests.length}>
          {newRequests.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const assignee = row.assigned_employee_id ? employeeName.get(row.assigned_employee_id) ?? "Pasif personel" : null;
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/requests/${row.id}`}
                baslik={formatPersonName(row.customer_name) || "Müşteri"}
                alt={`${formatSubject(row.title)} · ${relativeTime(row.created_at)}`}
                sag={assignee ? <span className="status-pill" data-tone="neutral" title={assignee}>{assignee.split(" ")[0]}</span> : <span className="status-pill" data-tone="gold">Atanmamış</span>}
                yeni={yeniMi(row.created_at)}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Yanıt bekleyen teklifler" alt={expiringCount ? `${expiringCount} teklifin süresi 3 gün içinde doluyor` : pendingProposals.length ? `${money(pendingProposalValue)} teklif değeri` : "Müşteriye gönderilmiş, karar bekleyen"} bos="Yanıt bekleyen teklif yok." href="/panel/crm/proposals?status=sent" hrefEtiket="Tüm teklifler" sayi={pendingProposals.length}>
          {pendingProposals.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const left = row.valid_until ? daysUntil(row.valid_until, time.today) : null;
            const badge = left !== null && left < 0 ? { tone: "danger", label: "Süresi doldu" }
              : left !== null && left <= 3 ? { tone: "warning", label: left === 0 ? "Son gün" : `Son ${left} gün` }
              : !row.view_count ? { tone: "info", label: "Açılmadı" }
              : { tone: "success", label: "Görüldü" };
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/proposals/${row.id}`}
                baslik={customerOf(row.crm_opportunities)}
                alt={`${money(row.amount, row.currency)} · ${waitingLabel(row.sent_at) ?? "gönderildi"}`}
                sag={<span className="status-pill" data-tone={badge.tone}>{badge.label}</span>}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="İmza bekleyen sözleşmeler" alt={lateContracts ? `${lateContracts} sözleşme 7 günden uzun süredir bekliyor` : "Müşteriye gönderilmiş, imzalanmamış"} bos="İmza bekleyen sözleşme yok." href="/panel/crm/contracts?status=sent" hrefEtiket="Tüm sözleşmeler" sayi={pendingContracts.length}>
          {pendingContracts.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const late = (daysSince(row.sent_at) ?? 0) >= 7;
            const badge = late ? { tone: "danger", label: "Gecikti" } : !row.view_count ? { tone: "info", label: "Açılmadı" } : { tone: "success", label: "Görüldü" };
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/contracts/${row.id}`}
                baslik={customerOf(row.crm_opportunities)}
                alt={`${money(row.amount, row.currency)} · ${waitingLabel(row.sent_at) ?? "gönderildi"}`}
                sag={<span className="status-pill" data-tone={badge.tone}>{badge.label}</span>}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Son imzalanan sözleşmeler" alt={signedThisMonth.length ? `Bu ay ${signedThisMonth.length} imza · ${money(signedThisMonthValue)}` : "Bu ay henüz imza yok"} bos="İmzalanmış sözleşme yok." href="/panel/crm/contracts" hrefEtiket="Sözleşmelere git" sayi={recentSigned.length}>
          {recentSigned.slice(0, GENEL_BAKIS_SATIR).map((row) => (
            <ListeSatiri
              key={row.id}
              href={`/panel/crm/contracts/${row.id}`}
              baslik={customerOf(row.crm_opportunities)}
              alt={`${row.contract_no} · ${money(row.amount, row.currency)}`}
              zaman={relativeTime(row.signed_at!)}
              yeni={yeniMi(row.signed_at)}
            />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
