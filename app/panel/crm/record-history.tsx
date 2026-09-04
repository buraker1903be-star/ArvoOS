import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import type { FieldChange } from "@/lib/activity-log";

/**
 * Kayıt geçmişi — kim, ne zaman, neyi neyden neye değiştirdi.
 *
 * Talep, teklif ve sözleşme aynı zincirin parçası olduğu için üçünün
 * geçmişi tek listede birleşiyor: bir sözleşme detayında "bu talep
 * hangi tutarla açılmıştı" sorusunun cevabı da burada.
 */

/**
 * Tutar alanları veritabanında kuruş cinsinden tutuluyor.
 * Geçmişte ham haliyle "3600000 → 4200000" yazıyordu; okunmuyor.
 * Gösterimde para birimine çeviriyoruz.
 */
const MONEY_FIELDS = new Set(["amount", "net_amount", "tax_amount", "gross_amount"]);

function displayValue(field: string, value: string): string {
  if (!value) return "boş";
  if (!MONEY_FIELDS.has(field)) return value;
  const kurus = Number(value);
  if (!Number.isFinite(kurus)) return value;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(kurus / 100);
}

const ACTION_LABELS: Record<string, string> = {
  create: "oluşturdu",
  update: "güncelledi",
  assign: "temsilci atadı",
  status: "durumu değiştirdi",
  stage: "aşamasını değiştirdi",
  send: "müşteriye gönderdi",
  convert: "sözleşmeye dönüştürdü",
  archive: "arşivledi",
  delete: "sildi",
  step: "adım ekledi",
  comment: "not ekledi",
};

const ENTITY_LABELS: Record<string, string> = {
  crm_opportunity: "Talep",
  crm_proposal: "Teklif",
  crm_contract: "Sözleşme",
  operation_workflow: "İş akışı",
};

type LogRow = {
  id: number;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  created_at: string;
  metadata: { changes?: FieldChange[]; note?: string | null } | null;
};

export async function RecordHistory({
  opportunityId,
  workflowId,
}: {
  opportunityId?: string;
  /** İş akışı detayında: sözleşmeye bağlı olmayan işler için. */
  workflowId?: string;
}) {
  const { supabase, membership } = await getPanelContext();

  const entityTypes = workflowId && !opportunityId
    ? ["operation_workflow"]
    : ["crm_opportunity", "crm_proposal", "crm_contract", "operation_workflow"];

  // CRM olayları metadata.opportunity_id ile, iş akışı olayları entity_id
  // ile işaretleniyor. İş akışı bir sözleşmeye bağlıysa ikisini birden
  // çekiyoruz: talebin açılışından işin bitişine kadar tek liste.
  // Bu yüzden .contains değil .or kullanmak gerekiyor — .contains yalnızca
  // tek bir eşleşme yapabildiği için iş akışı olayları listeden düşüyordu.
  let query = supabase
    .from("activity_logs")
    .select("id,actor_user_id,action,entity_type,created_at,metadata")
    .eq("organization_id", membership.organization_id)
    .in("entity_type", entityTypes);

  if (opportunityId && workflowId) {
    query = query.or(
      `metadata->>opportunity_id.eq.${opportunityId},entity_id.eq.${workflowId}`,
    );
  } else if (opportunityId) {
    query = query.eq("metadata->>opportunity_id", opportunityId);
  } else if (workflowId) {
    query = query.eq("entity_id", workflowId);
  } else {
    return null;
  }

  const { data: rows } = await query
    .order("created_at", { ascending: false })
    .limit(60);

  const logs = (rows ?? []) as LogRow[];
  if (!logs.length) {
    return (
      <section className="panel-card crm-record-history">
        <header>
          <small className="panel-kicker">KAYIT GEÇMİŞİ</small>
          <h2>Değişiklik yok</h2>
        </header>
        <p className="panel-empty">
          Bu kayıtta henüz bir değişiklik yapılmadı. Düzenleme yaptığınızda kim
          neyi değiştirdi burada görünecek.
        </p>
      </section>
    );
  }

  const actorIds = [...new Set(logs.map((l) => l.actor_user_id).filter(Boolean))] as string[];
  const [{ data: employees }, { data: profiles }] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("user_id,full_name")
      .eq("organization_id", membership.organization_id)
      .in("user_id", actorIds.length ? actorIds : ["-"]),
    supabase.from("profiles").select("id,full_name").in("id", actorIds.length ? actorIds : ["-"]),
  ]);
  const names = new Map<string, string>();
  for (const p of profiles ?? []) names.set(p.id, p.full_name);
  for (const e of employees ?? []) if (e.user_id) names.set(e.user_id, e.full_name);
  const actorName = (id: string | null) =>
    (id && formatPersonName(names.get(id))) || "Bilinmeyen kullanıcı";

  return (
    <section className="panel-card crm-record-history">
      <header>
        <small className="panel-kicker">KAYIT GEÇMİŞİ</small>
        <h2>{logs.length} değişiklik</h2>
      </header>
      <ol>
        {logs.map((log) => {
          const changes = log.metadata?.changes ?? [];
          return (
            <li key={log.id}>
              <div className="crm-record-history-meta">
                <strong>{actorName(log.actor_user_id)}</strong>
                <span>
                  {ENTITY_LABELS[log.entity_type] ?? log.entity_type} kaydını{" "}
                  {ACTION_LABELS[log.action] ?? log.action}
                </span>
                <time dateTime={log.created_at}>
                  {new Date(log.created_at).toLocaleString("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              {log.metadata?.note ? <p>{log.metadata.note}</p> : null}
              {changes.length ? (
                <ul className="crm-record-history-changes">
                  {changes.map((change) => (
                    <li key={change.field}>
                      <b>{change.label}</b>
                      <span className="from">{displayValue(change.field, change.from)}</span>
                      <span aria-hidden="true">→</span>
                      <span className="to">{displayValue(change.field, change.to)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
