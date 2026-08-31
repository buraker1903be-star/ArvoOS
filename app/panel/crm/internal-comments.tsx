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
  const { supabase, membership } = await getPanelContext();
  const { data, error } = await supabase
    .from("crm_internal_comments")
    .select("id,body,context_type,created_by,created_at")
    .eq("organization_id", membership.organization_id)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Kurum içi yorumlar okunamadı: " + error.message);

  const comments = (data ?? []) as Comment[];
  const authorIds = [...new Set(comments.map((comment) => comment.created_by))];
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", authorIds)
    : { data: [] };
  const authorNames = new Map((authors ?? []).map((author) => [author.id, author.full_name]));

  return (
    <section className="panel-card crm-internal-comments">
      <div className="crm-internal-comments-head">
        <div>
          <small className="panel-kicker">KURUM İÇİ · GİZLİ</small>
          <h2>Görüşme ve Yorum Geçmişi</h2>
          <p>Talep, teklif ve sözleşme boyunca aynı kayıt zincirinde devam eder. Müşteri ekranında gösterilmez.</p>
        </div>
        <span>{comments.length} yorum</span>
      </div>

      <form action={addInternalComment} className="crm-internal-comment-form">
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="context_type" value={contextType} />
        <input type="hidden" name="context_id" value={contextId} />
        <textarea name="body" required maxLength={4000} placeholder="Müşteriyle ne konuşuldu, müşteri ne söyledi, sonraki adım nedir?" />
        <button className="panel-primary" type="submit">Yorum Ekle</button>
      </form>

      <div className="crm-internal-comment-list">
        {comments.map((comment) => (
          <article key={comment.id}>
            <div>
              <strong>{authorNames.get(comment.created_by) || "Kurum personeli"}</strong>
              <span>{contextNames[comment.context_type]} aşamasında</span>
              <time>{new Date(comment.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}</time>
            </div>
            <p>{comment.body}</p>
          </article>
        ))}
        {!comments.length ? <p className="panel-empty">Henüz kurum içi yorum bulunmuyor. İlk görüşme notunu ekleyin.</p> : null}
      </div>
    </section>
  );
}
