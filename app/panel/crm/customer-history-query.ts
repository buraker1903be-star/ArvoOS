import type { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";
import { statusTone, type StatusTone } from "@/lib/status-tone";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { reportActionFailure } from "@/lib/action-diagnostics";
import { contractStatusLabel, proposalStatusLabel } from "./status-labels";
import { requestStageNames } from "./request-status";
import { nameKey, nameReady, phoneKey, phoneReady } from "./customer-history-keys";

/**
 * Geri dönen müşteri: bir telefon / ad soyad için kurumdaki geçmiş kayıtlar.
 *
 * Asıl yol veritabanındaki crm_customer_history fonksiyonu
 * (supabase/migrations/20260912200000_crm_customer_lookup.sql): talep
 * girebilen her CRM kullanıcısı — satış personeli dahil — müşterinin TÜM
 * geçmişini görür (başka temsilcinin kayıtları, kabul / red edilmiş
 * teklifler, arşivdeki işler). Kaydın ayrıntısını açıp açamayacağı
 * ("canOpen") yine RLS kuralıyla aynı hesaplanır; açamayacağı kayıt
 * bağlantı olarak gösterilmez.
 *
 * Fonksiyon henüz yoksa (migration çalıştırılmadıysa) eski yola düşülür:
 * sorgular kullanıcının kendi oturumuyla (RLS) çalışır ve satış personeli
 * yalnızca kendisine atanmış kayıtları görür.
 */

type PanelContext = Awaited<ReturnType<typeof getPanelContext>>;

export type HistoryKind = "request" | "proposal" | "contract" | "job";
export type HistoryMatch = "phone" | "name" | "both";

export type CustomerHistoryItem = {
  key: string;
  kind: HistoryKind;
  kindLabel: string;
  /** Yapılacak iş (teklif / sözleşme / iş başlığı) */
  title: string;
  /** Hizmet türü ve kayıt numarası gibi ikincil bilgi */
  detail: string | null;
  customerName: string;
  amountLabel: string | null;
  statusLabel: string;
  tone: StatusTone;
  dateLabel: string;
  person: string | null;
  personRole: "Satış" | "Operasyon" | null;
  href: string;
  /** Kullanıcı bu kaydın ayrıntı sayfasını açabilir mi (RLS ile aynı kural) */
  canOpen: boolean;
  match: HistoryMatch;
};

export type CustomerHistoryResult = {
  items: CustomerHistoryItem[];
  total: number;
  counts: Record<HistoryKind, number>;
  archivedJobs: number;
  proposedLabel: string | null;
  contractedLabel: string | null;
  lastContactLabel: string | null;
  matchedBy: HistoryMatch;
  customerName: string;
  limited: boolean;
  /** Eski yol: satış personeli yalnızca kendisine atanmış kayıtları görür */
  scopedToAssigned: boolean;
};

const PRIVILEGED = new Set(["owner", "admin", "manager"]);
/** Talep formundaki pencere */
export const NOTICE_MAX_ITEMS = 20;
/** Müşteri sorgulama penceresi */
export const LOOKUP_MAX_ITEMS = 80;
const SCAN_LIMIT = 5000;
const MAX_OPPORTUNITIES = 100;
const TZ = "Europe/Istanbul";

const JOB_STATUS_LABELS: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal",
  archived: "Arşivlendi",
};
// lib/status-tone.ts'te 'archived' yoksa bile arşiv işi nötr görünsün
const toneFor = (status: string): StatusTone => (status === "archived" ? "neutral" : statusTone(status));

const KIND_LABELS: Record<HistoryKind, string> = { request: "Talep", proposal: "Teklif", contract: "Sözleşme", job: "İş" };

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
export const formatHistoryDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isFinite(time) ? dateFormatter.format(time) : "";
};

/** Tutarlar kuruş cinsinden saklanıyor (teklif / sözleşme sayfalarıyla aynı). */
export function formatMoney(cents: number, currency: string | null) {
  const code = (currency || "TRY").toUpperCase();
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${code}`;
  }
}

/** Para birimi başına toplamları "₺20.000,00 + €300,00" biçiminde yazar (TRY önce). */
export function formatTotals(totals: Iterable<[string, number]>): string | null {
  const entries = [...totals].filter(([, cents]) => Number.isFinite(cents) && cents !== 0);
  if (!entries.length) return null;
  return entries
    .sort(([a], [b]) => (a === "TRY" ? -1 : b === "TRY" ? 1 : a.localeCompare(b)))
    .map(([currency, cents]) => formatMoney(cents, currency))
    .join(" + ");
}

const serviceOf = (details: unknown) => {
  const value = details && typeof details === "object" ? (details as Record<string, unknown>).service_type : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
const joinParts = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;
const requestNo = (id: string) => `TLP-${id.slice(0, 8).toUpperCase()}`;

/** CRM modülü kapalı / gizli kullanıcıyı durdurur (crm/actions.ts crmContext ile aynı kural). */
export function assertCrmAccess(context: PanelContext) {
  if (!context.modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "crm", context.hiddenModuleKeys);
}

function canSeeOperations(context: PanelContext) {
  if (!context.modules.some((module) => module.code === "operations")) return false;
  return context.membership.role === "owner" || !context.hiddenModuleKeys.has("operations");
}

/** Fonksiyon veritabanında yok (migration henüz çalıştırılmadı). */
export function isMissingRpc(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}

/* ------------------------------------------------------------------------ */
/* Ortak özetleme                                                            */
/* ------------------------------------------------------------------------ */

type Dated = CustomerHistoryItem & { at: string; cents: number; currency: string; rawStatus: string };

const timeOf = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
};

/** Sıralama / toplam için tutulan ham alanları istemciye göndermeden ayıklar. */
function publicItem(dated: Dated): CustomerHistoryItem {
  const item: Partial<Dated> = { ...dated };
  delete item.at;
  delete item.cents;
  delete item.currency;
  delete item.rawStatus;
  return item as CustomerHistoryItem;
}

function summarize(items: Dated[], options: { scopedToAssigned: boolean; maxItems: number }): CustomerHistoryResult | null {
  if (!items.length) return null;
  items.sort((a, b) => timeOf(b.at) - timeOf(a.at));

  const counts: Record<HistoryKind, number> = { request: 0, proposal: 0, contract: 0, job: 0 };
  const proposed = new Map<string, number>();
  const contracted = new Map<string, number>();
  let archivedJobs = 0;
  for (const item of items) {
    counts[item.kind] += 1;
    if (item.kind === "job" && item.rawStatus === "archived") archivedJobs += 1;
    if (item.kind === "proposal") proposed.set(item.currency, (proposed.get(item.currency) ?? 0) + item.cents);
    if (item.kind === "contract") contracted.set(item.currency, (contracted.get(item.currency) ?? 0) + item.cents);
  }
  const anyPhone = items.some((item) => item.match !== "name");
  const anyName = items.some((item) => item.match !== "phone");
  const primary = items.find((item) => item.match !== "name") ?? items[0];

  return {
    items: items.slice(0, options.maxItems).map(publicItem),
    total: items.length,
    counts,
    archivedJobs,
    proposedLabel: formatTotals(proposed),
    contractedLabel: formatTotals(contracted),
    lastContactLabel: formatHistoryDate(items[0].at) || null,
    matchedBy: anyPhone && anyName ? "both" : anyPhone ? "phone" : "name",
    customerName: primary.customerName,
    limited: items.length > options.maxItems,
    scopedToAssigned: options.scopedToAssigned,
  };
}

/* ------------------------------------------------------------------------ */
/* Asıl yol: crm_customer_history (tüm geçmiş)                              */
/* ------------------------------------------------------------------------ */

type HistoryRpcRow = {
  kind: HistoryKind;
  record_id: string;
  opportunity_id: string | null;
  title: string | null;
  request_title: string | null;
  service_type: string | null;
  record_no: string | null;
  customer_name: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  archive_reason: string | null;
  happened_at: string | null;
  sales_rep: string | null;
  operator_name: string | null;
  match_kind: HistoryMatch | null;
  can_open: boolean | null;
};

function itemFromRow(row: HistoryRpcRow, operationsVisible: boolean): Dated {
  const status = row.status ?? "";
  const cents = Number(row.amount) || 0;
  const currency = (row.currency || "TRY").toUpperCase();
  const rep = row.sales_rep ? formatPersonName(row.sales_rep) : null;
  const operator = row.operator_name ? formatPersonName(row.operator_name) : null;
  const base = {
    key: `${row.kind}:${row.record_id}`,
    kind: row.kind,
    kindLabel: KIND_LABELS[row.kind] ?? row.kind,
    title: formatSubject(row.title) || formatSubject(row.request_title),
    customerName: formatPersonName(row.customer_name),
    amountLabel: cents && row.kind !== "job" ? formatMoney(cents, currency) : null,
    dateLabel: formatHistoryDate(row.happened_at),
    match: row.match_kind ?? "name",
    canOpen: Boolean(row.can_open),
    at: row.happened_at ?? "",
    cents,
    currency,
    rawStatus: status,
  };
  switch (row.kind) {
    case "proposal": {
      const expired = status === "archived" && row.archive_reason === "expired";
      return {
        ...base,
        detail: joinParts(row.service_type, row.record_no),
        statusLabel: expired ? "Süresi doldu" : proposalStatusLabel(status),
        tone: expired ? "warning" : toneFor(status),
        person: rep,
        personRole: rep ? "Satış" : null,
        href: `/panel/crm/proposals/${row.record_id}`,
      };
    }
    case "contract":
      return {
        ...base,
        detail: joinParts(row.service_type, row.record_no),
        statusLabel: contractStatusLabel(status),
        tone: toneFor(status),
        person: rep,
        personRole: rep ? "Satış" : null,
        href: `/panel/crm/contracts/${row.record_id}`,
      };
    case "job":
      return {
        ...base,
        detail: joinParts(row.service_type, row.record_no),
        statusLabel: JOB_STATUS_LABELS[status] ?? status,
        tone: toneFor(status),
        person: rep ?? operator,
        personRole: rep ? "Satış" : operator ? "Operasyon" : null,
        href: `/panel/operations/${row.record_id}`,
        // Operasyon modülü gizliyse iş sayfası açılamaz
        canOpen: base.canOpen && operationsVisible,
      };
    default:
      return {
        ...base,
        detail: joinParts(row.service_type, requestNo(row.record_id)),
        statusLabel: requestStageNames[status] ?? status,
        tone: toneFor(status),
        person: rep,
        personRole: rep ? "Satış" : null,
        href: `/panel/crm/requests/${row.record_id}`,
      };
  }
}

type RpcOutcome = { ok: true; items: Dated[] } | { ok: false; missing: boolean };

async function historyViaRpc(
  context: PanelContext,
  args: { customerKey?: string | null; phone?: string | null; name?: string | null; excludeOpportunityId?: string | null },
): Promise<RpcOutcome> {
  const { data, error } = await context.supabase.rpc("crm_customer_history", {
    p_organization_id: context.membership.organization_id,
    p_customer_key: args.customerKey ?? null,
    p_phone: args.phone ?? null,
    p_name: args.name ?? null,
    p_exclude_opportunity_id: args.excludeOpportunityId ?? null,
    p_limit: 200,
  });
  if (error) {
    const missing = isMissingRpc(error);
    if (!missing) reportActionFailure("customerHistory.rpc", error, { organizationId: context.membership.organization_id });
    return { ok: false, missing };
  }
  const operationsVisible = canSeeOperations(context);
  return { ok: true, items: ((data ?? []) as HistoryRpcRow[]).map((row) => itemFromRow(row, operationsVisible)) };
}

/**
 * Talep formu ve talep kaydı notu: telefon (son 10 hane) VEYA ad soyad
 * birebir eşleşen kayıtlar.
 */
export async function findCustomerHistory(
  context: PanelContext,
  input: { phone?: string | null; name?: string | null; excludeOpportunityId?: string | null },
  options: { maxItems?: number } = {},
): Promise<CustomerHistoryResult | null> {
  const phone = phoneReady(input.phone) ? phoneKey(input.phone) : "";
  const name = nameReady(input.name) ? nameKey(input.name) : "";
  if (!phone && !name) return null;
  const maxItems = options.maxItems ?? NOTICE_MAX_ITEMS;

  const outcome = await historyViaRpc(context, { phone: phone || null, name: name || null, excludeOpportunityId: input.excludeOpportunityId });
  if (outcome.ok) return summarize(outcome.items, { scopedToAssigned: false, maxItems });
  return findCustomerHistoryViaRls(context, { phone, name, excludeOpportunityId: input.excludeOpportunityId ?? null }, maxItems);
}

/** Müşteri sorgulama: arama sonucundan seçilen müşterinin ("p:…" / "n:…") tüm geçmişi. */
export async function loadCustomerHistoryByKey(
  context: PanelContext,
  customerKey: string,
  options: { maxItems?: number } = {},
): Promise<CustomerHistoryResult | null> {
  const maxItems = options.maxItems ?? LOOKUP_MAX_ITEMS;
  const outcome = await historyViaRpc(context, { customerKey });
  if (outcome.ok) return summarize(outcome.items, { scopedToAssigned: false, maxItems });
  const value = customerKey.slice(2);
  return customerKey.startsWith("p:")
    ? findCustomerHistoryViaRls(context, { phone: value, name: "", excludeOpportunityId: null }, maxItems)
    : findCustomerHistoryViaRls(context, { phone: "", name: nameKey(value), excludeOpportunityId: null }, maxItems);
}

/* ------------------------------------------------------------------------ */
/* Eski yol (migration öncesi): kullanıcının oturumu / RLS                   */
/* ------------------------------------------------------------------------ */

type OpportunityRow = {
  id: string;
  title: string;
  customer_name: string;
  contact_phone: string | null;
  stage: string;
  created_at: string;
  assigned_employee_id: string | null;
  request_details: unknown;
};
type ProposalRow = {
  id: string;
  proposal_no: string | null;
  title: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string;
  archive_reason: string | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  opportunity_id: string;
};
type ContractRow = {
  id: string;
  contract_no: string | null;
  title: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string;
  signed_at: string | null;
  created_at: string;
  workflow_id: string | null;
  opportunity_id: string;
};
type WorkflowRow = {
  id: string;
  title: string;
  customer_name: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  contract_id: string | null;
  assigned_employee_id: string | null;
};

const empty = Promise.resolve({ data: [] as never[], error: null });

async function findCustomerHistoryViaRls(
  context: PanelContext,
  input: { phone: string; name: string; excludeOpportunityId: string | null },
  maxItems: number,
): Promise<CustomerHistoryResult | null> {
  const { supabase, membership } = context;
  const organizationId = membership.organization_id;
  const queryPhone = input.phone;
  const queryName = input.name;
  if (!queryPhone && !queryName) return null;

  const matchOf = (phone: string | null, name: string | null): HistoryMatch | null => {
    const byPhone = Boolean(queryPhone) && phoneKey(phone) === queryPhone;
    const byName = Boolean(queryName) && nameKey(name) === queryName;
    return byPhone && byName ? "both" : byPhone ? "phone" : byName ? "name" : null;
  };

  const { data: opportunityData, error: opportunityError } = await supabase
    .from("crm_opportunities")
    .select("id,title,customer_name,contact_phone,stage,created_at,assigned_employee_id,request_details")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (opportunityError) throw new Error("Talepler okunamadı: " + opportunityError.message);

  const opportunities = new Map<string, { row: OpportunityRow; match: HistoryMatch }>();
  for (const row of (opportunityData ?? []) as OpportunityRow[]) {
    if (row.id === input.excludeOpportunityId) continue;
    const match = matchOf(row.contact_phone, row.customer_name);
    if (match) opportunities.set(row.id, { row, match });
    if (opportunities.size >= MAX_OPPORTUNITIES) break;
  }
  const opportunityIds = [...opportunities.keys()];
  const operationsVisible = canSeeOperations(context);

  const [proposalResult, contractResult, workflowResult] = await Promise.all([
    opportunityIds.length
      ? supabase
          .from("crm_proposals")
          .select("id,proposal_no,title,amount,currency,status,archive_reason,created_at,sent_at,responded_at,opportunity_id")
          .eq("organization_id", organizationId)
          .in("opportunity_id", opportunityIds)
          // Revizyonlarda yalnızca güncel sürüm; eski sürümler toplamı şişirmesin
          .is("superseded_at", null)
          .order("created_at", { ascending: false })
          .limit(200)
      : empty,
    opportunityIds.length
      ? supabase
          .from("crm_contracts")
          .select("id,contract_no,title,amount,currency,status,signed_at,created_at,workflow_id,opportunity_id")
          .eq("organization_id", organizationId)
          .in("opportunity_id", opportunityIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : empty,
    // Durum filtresi yok: tamamlanan, iptal edilen ve arşivlenen işler de gelsin
    operationsVisible
      ? supabase
          .from("operation_workflows")
          .select("id,title,customer_name,status,created_at,updated_at,contract_id,assigned_employee_id")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(SCAN_LIMIT)
      : empty,
  ]);
  // Teklif / sözleşme / iş okunamazsa talepler yine gösterilir; tümü birden düşmesin
  if (proposalResult.error) reportActionFailure("customerHistory.proposals", proposalResult.error, { organizationId });
  if (contractResult.error) reportActionFailure("customerHistory.contracts", contractResult.error, { organizationId });
  if (workflowResult.error) reportActionFailure("customerHistory.workflows", workflowResult.error, { organizationId });

  const proposals = (proposalResult.data ?? []) as ProposalRow[];
  const contracts = (contractResult.data ?? []) as ContractRow[];
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const contractByWorkflow = new Map(
    contracts.filter((contract) => contract.workflow_id).map((contract) => [contract.workflow_id as string, contract]),
  );

  const workflows: { row: WorkflowRow; match: HistoryMatch; opportunityId: string | null }[] = [];
  for (const row of (workflowResult.data ?? []) as WorkflowRow[]) {
    const contract = (row.contract_id && contractById.get(row.contract_id)) || contractByWorkflow.get(row.id);
    if (contract) {
      workflows.push({ row, match: opportunities.get(contract.opportunity_id)?.match ?? "phone", opportunityId: contract.opportunity_id });
    } else if (queryName && nameKey(row.customer_name) === queryName) {
      workflows.push({ row, match: "name", opportunityId: null });
    }
  }

  const employeeIds = [
    ...new Set(
      [...[...opportunities.values()].map((item) => item.row.assigned_employee_id), ...workflows.map((item) => item.row.assigned_employee_id)]
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const { data: employeeRows } = employeeIds.length
    ? await supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId).in("id", employeeIds)
    : { data: [] as { id: string; full_name: string }[] };
  const employeeName = new Map(((employeeRows ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, formatPersonName(row.full_name)]));
  const salesRep = (opportunityId: string | null) => {
    const id = opportunityId ? opportunities.get(opportunityId)?.row.assigned_employee_id : null;
    return id ? (employeeName.get(id) ?? null) : null;
  };

  const items: Dated[] = [];

  for (const proposal of proposals) {
    const parent = opportunities.get(proposal.opportunity_id);
    if (!parent) continue;
    const cents = Number(proposal.amount) || 0;
    const currency = (proposal.currency || "TRY").toUpperCase();
    const at = proposal.responded_at ?? proposal.sent_at ?? proposal.created_at;
    const expired = proposal.status === "archived" && proposal.archive_reason === "expired";
    const rep = salesRep(proposal.opportunity_id);
    items.push({
      key: `proposal:${proposal.id}`,
      kind: "proposal",
      kindLabel: KIND_LABELS.proposal,
      title: formatSubject(proposal.title) || formatSubject(parent.row.title),
      detail: joinParts(serviceOf(parent.row.request_details), proposal.proposal_no),
      customerName: formatPersonName(parent.row.customer_name),
      amountLabel: cents ? formatMoney(cents, currency) : null,
      statusLabel: expired ? "Süresi doldu" : proposalStatusLabel(proposal.status),
      tone: expired ? "warning" : toneFor(proposal.status),
      dateLabel: formatHistoryDate(at),
      person: rep,
      personRole: rep ? "Satış" : null,
      href: `/panel/crm/proposals/${proposal.id}`,
      canOpen: true,
      match: parent.match,
      at,
      cents,
      currency,
      rawStatus: proposal.status,
    });
  }

  for (const contract of contracts) {
    const parent = opportunities.get(contract.opportunity_id);
    if (!parent) continue;
    const cents = Number(contract.amount) || 0;
    const currency = (contract.currency || "TRY").toUpperCase();
    const at = contract.signed_at ?? contract.created_at;
    const rep = salesRep(contract.opportunity_id);
    items.push({
      key: `contract:${contract.id}`,
      kind: "contract",
      kindLabel: KIND_LABELS.contract,
      title: formatSubject(contract.title) || formatSubject(parent.row.title),
      detail: joinParts(serviceOf(parent.row.request_details), contract.contract_no),
      customerName: formatPersonName(parent.row.customer_name),
      amountLabel: cents ? formatMoney(cents, currency) : null,
      statusLabel: contractStatusLabel(contract.status),
      tone: toneFor(contract.status),
      dateLabel: formatHistoryDate(at),
      person: rep,
      personRole: rep ? "Satış" : null,
      href: `/panel/crm/contracts/${contract.id}`,
      canOpen: true,
      match: parent.match,
      at,
      cents,
      currency,
      rawStatus: contract.status,
    });
  }

  for (const { row, match, opportunityId } of workflows) {
    const parent = opportunityId ? opportunities.get(opportunityId) : undefined;
    const contract = (row.contract_id && contractById.get(row.contract_id)) || contractByWorkflow.get(row.id);
    const rep = salesRep(opportunityId);
    const operator = row.assigned_employee_id ? (employeeName.get(row.assigned_employee_id) ?? null) : null;
    const at = row.updated_at ?? row.created_at;
    items.push({
      key: `job:${row.id}`,
      kind: "job",
      kindLabel: KIND_LABELS.job,
      title: formatSubject(row.title),
      detail: joinParts(parent ? serviceOf(parent.row.request_details) : null, contract?.contract_no),
      customerName: formatPersonName(parent?.row.customer_name ?? row.customer_name),
      // İşin tutarı sözleşmesinde; sözleşme ayrıca listelendiği için burada tekrar edilmez
      amountLabel: null,
      statusLabel: JOB_STATUS_LABELS[row.status] ?? row.status,
      tone: toneFor(row.status),
      dateLabel: formatHistoryDate(at),
      person: rep ?? operator,
      personRole: rep ? "Satış" : operator ? "Operasyon" : null,
      href: `/panel/operations/${row.id}`,
      canOpen: true,
      match,
      at,
      cents: 0,
      currency: "TRY",
      rawStatus: row.status,
    });
  }

  // Teklif / sözleşme verilmemiş talepler de "daha önce aradı" bilgisi olarak listelenir
  const withDocuments = new Set([...proposals.map((p) => p.opportunity_id), ...contracts.map((c) => c.opportunity_id)]);
  for (const { row, match } of opportunities.values()) {
    if (withDocuments.has(row.id)) continue;
    const rep = salesRep(row.id);
    items.push({
      key: `request:${row.id}`,
      kind: "request",
      kindLabel: KIND_LABELS.request,
      title: formatSubject(row.title),
      detail: joinParts(serviceOf(row.request_details), requestNo(row.id)),
      customerName: formatPersonName(row.customer_name),
      amountLabel: null,
      statusLabel: requestStageNames[row.stage] ?? row.stage,
      tone: toneFor(row.stage),
      dateLabel: formatHistoryDate(row.created_at),
      person: rep,
      personRole: rep ? "Satış" : null,
      href: `/panel/crm/requests/${row.id}`,
      canOpen: true,
      match,
      at: row.created_at,
      cents: 0,
      currency: "TRY",
      rawStatus: row.stage,
    });
  }

  return summarize(items, { scopedToAssigned: !PRIVILEGED.has(membership.role), maxItems });
}

/* ------------------------------------------------------------------------ */
/* Talep kaydına otomatik not                                                */
/* ------------------------------------------------------------------------ */

/** Talep kaydına düşülecek not metni (yalnızca telefon eşleşmesi). */
export function describeReturningCustomer(result: CustomerHistoryResult): string {
  const { counts } = result;
  const parts = [
    counts.proposal ? `${counts.proposal} teklif${result.proposedLabel ? ` (toplam ${result.proposedLabel})` : ""}` : null,
    counts.contract ? `${counts.contract} sözleşme${result.contractedLabel ? ` (toplam ${result.contractedLabel})` : ""}` : null,
    counts.job ? `${counts.job} iş${result.archivedJobs ? ` (${result.archivedJobs} tanesi arşivde)` : ""}` : null,
    counts.request ? `${counts.request} önceki talep` : null,
  ].filter(Boolean);
  const lines = result.items.slice(0, 5).map((item) =>
    "• " + [item.kindLabel, item.title, item.amountLabel, item.statusLabel, item.dateLabel, item.person].filter(Boolean).join(" · "),
  );
  return [
    `Geri dönen müşteri: bu telefon numarasıyla geçmişte ${parts.join(", ")} bulundu.`,
    result.lastContactLabel ? `Son temas: ${result.lastContactLabel}.` : null,
    lines.length ? `Son kayıtlar:\n${lines.join("\n")}` : null,
    result.total > lines.length ? `…ve ${result.total - lines.length} kayıt daha.` : null,
    "Bu not talep girişinde otomatik eklendi.",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3900);
}

/**
 * Yeni talebin telefonu geçmiş kayıtlarla eşleşiyorsa talebe kurum içi not
 * düşer. crm_internal_comments'e eklenen her yorum veritabanı
 * tetikleyicisiyle (notify_crm_internal_comment) atanan satış
 * temsilcisine ve yöneticilere bildirim olarak gider; ayrı bir bildirim
 * türüne gerek kalmıyor. Geçmiş crm_customer_history'den geldiği için
 * satış personelinin girdiği talepte de müşterinin tüm geçmişi özetlenir.
 * Hata talebin kaydını asla bozmaz.
 */
export async function noteReturningCustomer(
  context: PanelContext,
  input: { opportunityId: string; phone: string | null },
) {
  try {
    if (!phoneReady(input.phone)) return;
    const result = await findCustomerHistory(context, { phone: input.phone, excludeOpportunityId: input.opportunityId });
    if (!result?.total) return;
    const { error } = await context.supabase.from("crm_internal_comments").insert({
      organization_id: context.membership.organization_id,
      opportunity_id: input.opportunityId,
      context_type: "request",
      context_id: input.opportunityId,
      body: describeReturningCustomer(result),
      created_by: context.userId,
    });
    if (error) {
      reportActionFailure("noteReturningCustomer", error, {
        organizationId: context.membership.organization_id,
        opportunityId: input.opportunityId,
      });
    }
  } catch (error) {
    console.error("[noteReturningCustomer]", error);
  }
}
