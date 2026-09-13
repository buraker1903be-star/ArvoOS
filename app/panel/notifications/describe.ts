import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";

// Bildirim metinlerini anlaşılır hale getirir.
//
// Veritabanındaki metinler kayıt bilgisini içermiyordu: "SOZ-2026-000007
// numaralı dosya için müşteri mesaj gönderdi." Müşterinin adı da mesajın
// kendisi de yoktu. Tetikleyicileri değiştirmek yerine (canlı sürümleri
// repodan farklı olabilir) sayfa açılırken ilgili kayıtlar toplu okunur ve
// metin burada kurulur; eski bildirimler de böylece düzelir. Kayıt
// okunamazsa (silinmiş, yetki yok) veritabanındaki metin gösterilir.

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  category: string;
  action_url: string | null;
  user_id: string | null;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type NotificationTone = "info" | "gold" | "success" | "danger" | "brand" | "neutral";
export type NotificationIconName = "bubble" | "comment" | "person" | "briefcase" | "check" | "card" | "lifebuoy" | "megaphone" | "bell";

export type DescribedNotification = NotificationRow & {
  label: string;
  tone: NotificationTone;
  icon: NotificationIconName;
  headline: string;
  detail: string;
  context: string | null;
  actionLabel: string;
};

const meta = (row: NotificationRow, key: string) => {
  const value = row.metadata?.[key];
  return typeof value === "string" && value ? value : null;
};
const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];
const quote = (text: string, max = 180) => {
  const clean = text.trim().replace(/\s+/g, " ");
  return `“${clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean}”`;
};
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;
const empty = Promise.resolve({ data: [] as never[] });

const contextNames: Record<string, string> = { request: "Talep", proposal: "Teklif", contract: "Sözleşme", operation: "Operasyon" };

type ContractRow = { id: string; contract_no: string; title: string | null; crm_opportunities: { customer_name: string | null; request_details: Record<string, unknown> | null } | { customer_name: string | null; request_details: Record<string, unknown> | null }[] | null };

export async function describeNotifications(
  supabase: SupabaseClient,
  organizationId: string,
  rows: NotificationRow[],
): Promise<DescribedNotification[]> {
  const idsFor = (categories: string[], key: string) => unique(rows.filter((row) => categories.includes(row.category)).map((row) => meta(row, key)));
  const contractIds = idsFor(["customer_message"], "contract_id");
  const commentIds = idsFor(["internal_comment"], "comment_id");
  const opportunityIds = idsFor(["internal_comment", "sales_assignment", "crm_won_automation", "site_lead"], "opportunity_id");
  const workflowIds = idsFor(["operation_assignment"], "workflow_id");

  const [contractResult, messageResult, commentResult, opportunityResult, workflowResult] = await Promise.all([
    contractIds.length ? supabase.from("crm_contracts").select("id,contract_no,title,crm_opportunities(customer_name,request_details)").in("id", contractIds) : empty,
    contractIds.length
      ? supabase.from("customer_file_messages").select("contract_id,body,created_at").in("contract_id", contractIds).eq("sender_type", "customer").order("created_at", { ascending: false }).limit(400)
      : empty,
    commentIds.length ? supabase.from("crm_internal_comments").select("id,body,created_by,context_type").in("id", commentIds) : empty,
    opportunityIds.length ? supabase.from("crm_opportunities").select("id,customer_name,title").in("id", opportunityIds) : empty,
    workflowIds.length ? supabase.from("operation_workflows").select("id,title,customer_name").in("id", workflowIds) : empty,
  ]);

  const comments = new Map(((commentResult.data ?? []) as { id: string; body: string; created_by: string; context_type: string }[]).map((row) => [row.id, row]));
  const peopleIds = unique([
    ...[...comments.values()].map((comment) => comment.created_by),
    ...rows.map((row) => meta(row, "assigned_by")),
  ]);
  const { data: peopleRows } = peopleIds.length
    ? await supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", organizationId).in("user_id", peopleIds)
    : { data: [] as never[] };
  const people = new Map(((peopleRows ?? []) as { user_id: string; full_name: string }[]).map((row) => [row.user_id, formatPersonName(row.full_name)]));

  const contracts = new Map(
    ((contractResult.data ?? []) as ContractRow[]).map((row) => {
      const opportunity = Array.isArray(row.crm_opportunities) ? row.crm_opportunities[0] : row.crm_opportunities;
      const service = opportunity?.request_details?.service_type;
      return [row.id, { no: row.contract_no, customer: formatPersonName(opportunity?.customer_name), service: typeof service === "string" ? service : null }];
    }),
  );
  const customerMessages = (messageResult.data ?? []) as { contract_id: string; body: string; created_at: string }[];
  const opportunities = new Map(((opportunityResult.data ?? []) as { id: string; customer_name: string | null; title: string | null }[]).map((row) => [row.id, row]));
  const workflows = new Map(((workflowResult.data ?? []) as { id: string; title: string; customer_name: string | null }[]).map((row) => [row.id, row]));

  // Müşteri mesajı: bildirimle aynı işlemde yazılan mesaj (zaman olarak en yakını)
  const messageFor = (row: NotificationRow, contractId: string | null) => {
    if (!contractId) return null;
    const at = Date.parse(row.created_at);
    let best: { body: string; gap: number } | null = null;
    for (const message of customerMessages) {
      if (message.contract_id !== contractId) continue;
      const gap = Math.abs(Date.parse(message.created_at) - at);
      if (gap < 120_000 && (!best || gap < best.gap)) best = { body: message.body, gap };
    }
    return best?.body ?? null;
  };

  return rows.map((row): DescribedNotification => {
    const base = { ...row, context: null as string | null, actionLabel: "Kaydı aç" };
    switch (row.category) {
      case "customer_message": {
        const contract = contracts.get(meta(row, "contract_id") ?? "");
        const body = messageFor(row, meta(row, "contract_id"));
        return {
          ...base,
          label: "Müşteri mesajı",
          tone: "info",
          icon: "bubble",
          headline: `${contract?.customer || "Müşteri"} mesaj gönderdi`,
          detail: body ? quote(body) : "Dosya takip sayfasından size yeni bir mesaj bıraktı.",
          context: join(contract?.no, contract?.service),
          actionLabel: "Mesajı aç",
        };
      }
      case "internal_comment": {
        const comment = comments.get(meta(row, "comment_id") ?? "");
        const author = comment ? people.get(comment.created_by) : null;
        const opportunity = opportunities.get(meta(row, "opportunity_id") ?? "");
        return {
          ...base,
          label: "Kurum içi yorum",
          tone: "gold",
          icon: "comment",
          headline: `${author || "Bir ekip arkadaşınız"} yorum yaptı`,
          detail: comment ? quote(comment.body) : row.message,
          context: join(formatPersonName(opportunity?.customer_name), contextNames[meta(row, "context_type") ?? comment?.context_type ?? ""]),
          actionLabel: "Yorumu gör",
        };
      }
      case "sales_assignment": {
        const opportunity = opportunities.get(meta(row, "opportunity_id") ?? "");
        const assigner = people.get(meta(row, "assigned_by") ?? "");
        return {
          ...base,
          label: "Talep ataması",
          tone: "brand",
          icon: "person",
          headline: "Size yeni bir talep atandı",
          detail: opportunity ? `${formatPersonName(opportunity.customer_name) || "Müşteri"} — ${formatSubject(opportunity.title) || "Yeni talep"}` : row.message,
          context: assigner ? `Atayan: ${assigner}` : null,
          actionLabel: "Talebi aç",
        };
      }
      case "site_lead": {
        // arvo-os.com formundan gelen talep (submit_site_lead). Henüz atanmamış.
        const opportunity = opportunities.get(meta(row, "opportunity_id") ?? "");
        const reference = meta(row, "reference");
        return {
          ...base,
          label: "Web sitesi talebi",
          tone: "brand",
          icon: "person",
          headline: "Web sitesinden yeni talep geldi",
          detail: opportunity ? `${formatPersonName(opportunity.customer_name) || "Ziyaretçi"} — ${formatSubject(opportunity.title) || "Yeni talep"}` : row.message,
          context: join(reference ? `Ref ${reference}` : null, meta(row, "locale") === "en" ? "İngilizce form" : null, "Temsilci atanmadı"),
          actionLabel: "Talebi aç",
        };
      }
      case "operation_assignment": {
        const workflow = workflows.get(meta(row, "workflow_id") ?? "");
        const assigner = people.get(meta(row, "assigned_by") ?? "");
        return {
          ...base,
          label: "Operasyon ataması",
          tone: "success",
          icon: "briefcase",
          headline: "Size yeni bir iş atandı",
          detail: workflow ? [formatSubject(workflow.title), formatPersonName(workflow.customer_name)].filter(Boolean).join(" — ") : row.message,
          context: assigner ? `Atayan: ${assigner}` : null,
          actionLabel: "İşi aç",
        };
      }
      case "crm_won_automation": {
        const opportunity = opportunities.get(meta(row, "opportunity_id") ?? "");
        return {
          ...base,
          label: "Satış",
          tone: "success",
          icon: "check",
          headline: opportunity ? `${formatPersonName(opportunity.customer_name)} satışı kazanıldı` : "Satış kazanıldı",
          detail: "Operasyon iş akışı ve tahsilat kaydı otomatik olarak oluşturuldu.",
          actionLabel: "İş akışını aç",
        };
      }
      case "payment_submitted":
        return { ...base, label: "Ödeme", tone: "gold", icon: "card", headline: "Yeni ödeme bildirimi", detail: row.message, actionLabel: "Ödemeyi incele" };
      case "payment_approved":
        return { ...base, label: "Ödeme", tone: "success", icon: "card", headline: "Ödemeniz onaylandı", detail: "EFT/Havale ödemeniz onaylandı, lisansınız aktif.", actionLabel: "Faturalara git" };
      case "payment_rejected": {
        const note = meta(row, "review_note");
        return {
          ...base,
          label: "Ödeme",
          tone: "danger",
          icon: "card",
          headline: "Ödemeniz onaylanmadı",
          detail: note ? `Gerekçe: ${note}` : "EFT/Havale ödemeniz reddedildi. Ayrıntılar faturalar sayfasında.",
          actionLabel: "Faturalara git",
        };
      }
      case "support_message":
        return { ...base, label: "Destek", tone: "info", icon: "lifebuoy", headline: row.title, detail: row.message, actionLabel: "Talebi aç" };
      case "management_announcement": {
        const sender = meta(row, "sender_name");
        return {
          ...base,
          label: "Duyuru",
          tone: "gold",
          icon: "megaphone",
          headline: row.title,
          detail: row.message,
          context: sender ? `Gönderen: ${formatPersonName(sender)}` : null,
        };
      }
      default:
        return { ...base, label: "Bildirim", tone: "neutral", icon: "bell", headline: row.title, detail: row.message };
    }
  });
}
