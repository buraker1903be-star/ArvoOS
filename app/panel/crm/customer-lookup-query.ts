import type { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatPhone } from "@/lib/format-phone";
import { reportActionFailure } from "@/lib/action-diagnostics";
import { nameKey, phoneKey, type LookupQuery } from "./customer-history-keys";
import { formatHistoryDate, formatTotals, isMissingRpc } from "./customer-history-query";

/**
 * "Müşteri sorgula" penceresinin arama tarafı.
 *
 * Asıl yol crm_customer_search (supabase/migrations/20260912200000_crm_customer_lookup.sql):
 * kurumun tüm kayıtlarında telefon / ad soyad araması, müşteri bazında
 * özet. Fonksiyon henüz yoksa aynı kural kullanıcının kendi oturumuyla
 * (RLS) talepler üzerinde uygulanır; satış personeli o durumda yalnızca
 * kendi taleplerini görür ve pencere bunu belirtir.
 */

type PanelContext = Awaited<ReturnType<typeof getPanelContext>>;

export type LookupMatch = "phone" | "phone_partial" | "name" | "name_partial" | "similar";

export type CustomerLookupSummary = {
  /** "p:5324628098" ya da "n:isik caglar" — geçmişi yüklemek için */
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  match: LookupMatch;
  counts: { requests: number; proposals: number | null; contracts: number | null; jobs: number | null; archivedJobs: number | null };
  proposedLabel: string | null;
  contractedLabel: string | null;
  lastContactLabel: string | null;
  reps: string[];
};

export type CustomerSearchResult = {
  customers: CustomerLookupSummary[];
  /** false: veritabanı fonksiyonu yok, yalnızca erişilebilen talepler tarandı */
  fullHistory: boolean;
};

export const LOOKUP_RESULT_LIMIT = 12;
const PRIVILEGED = new Set(["owner", "admin", "manager"]);

type SearchRpcRow = {
  customer_key: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  match_kind: LookupMatch;
  score: number;
  request_count: number | null;
  proposal_count: number | null;
  contract_count: number | null;
  job_count: number | null;
  archived_job_count: number | null;
  proposed_totals: Record<string, number | string> | null;
  contract_totals: Record<string, number | string> | null;
  last_contact_at: string | null;
  rep_names: string[] | null;
};

const totalsLabel = (totals: Record<string, number | string> | null) =>
  totals ? formatTotals(Object.entries(totals).map(([currency, cents]) => [currency.toUpperCase(), Number(cents)])) : null;

const displayPhone = (value: string | null) => (value ? formatPhone(value) || value : null);

export async function searchCustomers(context: PanelContext, query: Exclude<LookupQuery, null | { mode: "short" }>, raw: string): Promise<CustomerSearchResult> {
  const { data, error } = await context.supabase.rpc("crm_customer_search", {
    p_organization_id: context.membership.organization_id,
    p_query: raw,
    p_limit: LOOKUP_RESULT_LIMIT,
  });
  if (!error) {
    return {
      fullHistory: true,
      customers: ((data ?? []) as SearchRpcRow[]).map((row) => ({
        key: row.customer_key,
        name: formatPersonName(row.display_name) || "İsimsiz müşteri",
        phone: displayPhone(row.phone),
        email: row.email,
        match: row.match_kind,
        counts: {
          requests: row.request_count ?? 0,
          proposals: row.proposal_count ?? 0,
          contracts: row.contract_count ?? 0,
          jobs: row.job_count ?? 0,
          archivedJobs: row.archived_job_count ?? 0,
        },
        proposedLabel: totalsLabel(row.proposed_totals),
        contractedLabel: totalsLabel(row.contract_totals),
        lastContactLabel: formatHistoryDate(row.last_contact_at) || null,
        reps: (row.rep_names ?? []).map((name) => formatPersonName(name)).filter(Boolean),
      })),
    };
  }
  if (!isMissingRpc(error)) reportActionFailure("customerLookup.rpc", error, { organizationId: context.membership.organization_id });
  const customers = await searchCustomersViaRls(context, query);
  // Yönetici zaten tüm kurumu görür; kısıt uyarısı yalnızca satış personeline
  return { customers, fullHistory: PRIVILEGED.has(context.membership.role) };
}

/* ------------------------------------------------------------------------ */
/* Eski yol: kullanıcının oturumuyla talepler üzerinde aynı eşleştirme       */
/* ------------------------------------------------------------------------ */

type OpportunityRow = {
  id: string;
  customer_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  created_at: string;
  assigned_employee_id: string | null;
};

/** a ile b arasında en fazla bir düzenleme var mı (SQL'deki arvo_within_one_edit). */
function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** crm_customer_search'teki puanlamanın aynısı. */
function scoreOf(query: Exclude<LookupQuery, null | { mode: "short" }>, pk: string, nk: string): number | null {
  if (query.mode === "phone") {
    if (pk.length < 7) return null;
    if (pk === query.digits) return 100;
    if (pk.startsWith(query.digits)) return 85;
    return pk.includes(query.digits) ? 60 : null;
  }
  if (!nk) return null;
  const { name, tokens } = query;
  if (nk === name) return 100;
  if (nk.startsWith(name)) return 90;
  const spaced = ` ${nk}`;
  if (tokens.every((token) => spaced.includes(` ${token}`))) return 80;
  if (tokens.every((token) => nk.includes(token))) return 65;
  const words = nk.split(" ");
  const fuzzy = (token: string) =>
    token.length >= 4 && words.some((word) => withinOneEdit(token, word) || (word.length > token.length && withinOneEdit(token, word.slice(0, token.length))));
  if (tokens.every((token) => nk.includes(token) || fuzzy(token))) return 45;
  if (tokens.length > 1 && tokens.some((token) => token.length >= 3 && spaced.includes(` ${token}`))) return 30;
  return null;
}

function matchKind(query: Exclude<LookupQuery, null | { mode: "short" }>, score: number): LookupMatch {
  if (query.mode === "phone") return score === 100 ? "phone" : "phone_partial";
  return score >= 90 ? "name" : score >= 65 ? "name_partial" : "similar";
}

async function searchCustomersViaRls(context: PanelContext, query: Exclude<LookupQuery, null | { mode: "short" }>): Promise<CustomerLookupSummary[]> {
  const { supabase, membership } = context;
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select("id,customer_name,contact_phone,contact_email,created_at,assigned_employee_id")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error("Talepler okunamadı: " + error.message);
  const rows = ((data ?? []) as OpportunityRow[]).map((row) => ({ row, pk: phoneKey(row.contact_phone), nk: nameKey(row.customer_name) }));

  // Telefonsuz kayıt, adı tek bir telefona bağlanıyorsa o müşteriye katılır
  const phonesByName = new Map<string, Set<string>>();
  for (const { pk, nk } of rows) {
    if (pk.length < 7 || !nk) continue;
    if (!phonesByName.has(nk)) phonesByName.set(nk, new Set());
    phonesByName.get(nk)!.add(pk);
  }
  const keyOf = (pk: string, nk: string) => {
    if (pk.length >= 7) return `p:${pk}`;
    const phones = phonesByName.get(nk);
    return phones?.size === 1 ? `p:${[...phones][0]}` : `n:${nk}`;
  };

  type Group = { key: string; score: number; rows: OpportunityRow[] };
  const groups = new Map<string, Group>();
  for (const { row, pk, nk } of rows) {
    const key = keyOf(pk, nk);
    const group = groups.get(key) ?? { key, score: -1, rows: [] };
    group.rows.push(row);
    const score = scoreOf(query, pk, nk);
    if (score !== null && score > group.score) group.score = score;
    groups.set(key, group);
  }
  const best = [...groups.values()]
    .filter((group) => group.score >= 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.rows[0].created_at) - Date.parse(a.rows[0].created_at))
    .slice(0, LOOKUP_RESULT_LIMIT);

  const employeeIds = [...new Set(best.flatMap((group) => group.rows.map((row) => row.assigned_employee_id)).filter((id): id is string => Boolean(id)))];
  const { data: employees } = employeeIds.length
    ? await supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).in("id", employeeIds)
    : { data: [] as { id: string; full_name: string }[] };
  const employeeName = new Map(((employees ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, formatPersonName(row.full_name)]));

  return best.map((group) => {
    const latest = group.rows[0];
    const reps = [...new Set(group.rows.map((row) => (row.assigned_employee_id ? employeeName.get(row.assigned_employee_id) : null)).filter((name): name is string => Boolean(name)))];
    return {
      key: group.key,
      name: formatPersonName(latest.customer_name) || "İsimsiz müşteri",
      phone: displayPhone(group.rows.find((row) => row.contact_phone?.trim())?.contact_phone ?? null),
      email: group.rows.find((row) => row.contact_email?.trim())?.contact_email ?? null,
      match: matchKind(query, group.score),
      // Teklif / sözleşme / iş sayıları bu yolda bilinmiyor
      counts: { requests: group.rows.length, proposals: null, contracts: null, jobs: null, archivedJobs: null },
      proposedLabel: null,
      contractedLabel: null,
      lastContactLabel: formatHistoryDate(latest.created_at) || null,
      reps: reps.slice(0, 4),
    };
  });
}
