import { getPanelContext } from "@/lib/panel-context";
import { addInternalComment } from "./actions";

type ContextType = "request" | "proposal" | "contract";
type Comment = {
  id: string;
  body: string;
  context_type: ContextType;
  created_by: string;
  created_at: string;
};

const contextNames: Record<ContextType, string> = {
  request: "Talep",
  proposal: "Teklif",
  contract: "Sözleşme",
};

export async function InternalComments({
  opportunityId,
  contextType,
  contextId,
}: {
  opportunityId: string;
  contextType: ContextType;
  contextId: string;
}) {
  const { supabase, membership, userId } = await getPanelContext();
  const { data, error } = await supabase
    .from("crm_internal_comments")
    .select("id,body,context_type,created_by,created_at")
    .eq("organization_id", membership.organization_id)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Kurum içi yorumlar okunamadı: " + error.message);

  const comments = (data ?? []) as Comment[];
  const authorIds = [...new Set([...comments.map((comment) => comment.created_by), userId])];
  const [{ data: employees }, { data: profiles }] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("user_id,full_name,job_title")
      .eq("organization_id", membership.organization_id)
      .in("user_id", authorIds),
    supabase.from("profiles").select("id,full_name").in("id", authorIds),
  ]);
  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const employeeNames = new Map((employees ?? []).map((employee) => [employee.user_id, employee.full_name]));
  const employeeTitles = new Map((employees ?? []).map((employee) => [employee.user_id, employee.job_title]));
  const authorName = (authorId: string) => employeeNames.get(authorId) || profileNames.get(authorId) || "Ad soyad bilgisi eksik";
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR")).join("") || "--";
  const currentAuthorName = authorName(userId);

  return (
    <section className="panel-card crm-internal-comments">
      <div className="crm-internal-comments-head">
        <div>
          <small className="panel-kicker">KURUM İÇİ · GİZLİ</small>
          <h2>Görüşme ve Yorum Geçmişi</h2>
          <p>Talep, teklif ve sözleşme boyunca aynı kayıt zincirinde devam eder. Müşteri ekranında gösterilmez.</p>
        </div>
        <span className="crm-internal-comment-count">{comments.length} yorum</span>
      </div>

      <form action={addInternalComment} className="crm-internal-comment-form">
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="context_type" value={contextType} />
        <input type="hidden" name="context_id" value={contextId} />
        <div className="crm-internal-comment-composer-avatar" aria-hidden="true">{initials(currentAuthorName)}</div>
        <div className="crm-internal-comment-composer">
          <label htmlFor={`internal-comment-${contextId}`}>
            <strong>{currentAuthorName}</strong>
            <span>adına kurum içi not</span>
          </label>
          <textarea id={`internal-comment-${contextId}`} name="body" required maxLength={4000} placeholder="Müşteriyle ne konuşuldu? Müşteri ne söyledi? Bir sonraki adımı ekleyin…" />
          <div>
            <small>Yalnızca kurum içinde görünür</small>
            <button className="panel-primary" type="submit">Yorumu Kaydet</button>
          </div>
        </div>
      </form>

      <div className="crm-internal-comment-list">
        {comments.map((comment) => {
          const name = authorName(comment.created_by);
          return <article key={comment.id}>
            <div className="crm-internal-comment-avatar" aria-hidden="true">{initials(name)}</div>
            <div className="crm-internal-comment-content">
              <div className="crm-internal-comment-meta">
                <div>
                  <strong>{name}</strong>
                  {employeeTitles.get(comment.created_by) ? <small>{employeeTitles.get(comment.created_by)}</small> : null}
                </div>
                <span>{contextNames[comment.context_type]}</span>
                <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
              <p>{comment.body}</p>
            </div>
          </article>;
        })}
        {!comments.length ? <p className="panel-empty">Henüz kurum içi yorum bulunmuyor. İlk görüşme notunu ekleyin.</p> : null}
      </div>
    </section>
  );
}
