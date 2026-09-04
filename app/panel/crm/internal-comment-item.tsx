"use client";

import { useState } from "react";
import { deleteInternalComment, updateInternalComment } from "./actions";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";

/**
 * Bir kurum içi yorumun gövdesi ve işlemleri.
 *
 * Düzenleme yerinde açılıyor (ayrı pencere değil): not genelde tek
 * cümlelik bir düzeltme oluyor, pencere açıp kapatmak fazla adım.
 *
 * Yetki dağılımı:
 *   - Düzenle: yalnızca yorumun yazarı. Başkasının ağzından not
 *     değiştirmek kaydın güvenilirliğini bozar.
 *   - Sil: yazarın kendisi ya da yönetici.
 * Aynı kural veritabanında RLS politikalarıyla da uygulanıyor; buradaki
 * kontrol sadece arayüzü sadeleştirmek için.
 */
export function InternalCommentItem({
  commentId,
  body,
  opportunityId,
  contextType,
  contextId,
  canEdit,
  canDelete,
  editedAt,
}: {
  commentId: string;
  body: string;
  opportunityId: string;
  contextType: string;
  contextId: string;
  canEdit: boolean;
  canDelete: boolean;
  editedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="comment_id" value={commentId} />
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="context_type" value={contextType} />
      <input type="hidden" name="context_id" value={contextId} />
    </>
  );

  if (editing && canEdit) {
    return (
      <form
        className="crm-internal-comment-edit"
        action={async (formData: FormData) => {
          await updateInternalComment(formData);
          setEditing(false);
        }}
      >
        {hidden}
        <textarea name="body" defaultValue={body} rows={4} required autoFocus />
        <div className="crm-internal-comment-edit-actions">
          <button type="button" className="panel-secondary" onClick={() => setEditing(false)}>
            Vazgeç
          </button>
          <button className="panel-primary">Kaydet</button>
        </div>
      </form>
    );
  }

  return (
    <>
      <p>
        {body}
        {editedAt ? <em className="crm-internal-comment-edited">düzenlendi</em> : null}
      </p>
      {canEdit || canDelete ? (
        <div className="crm-internal-comment-actions">
          {canEdit ? (
            <button type="button" className="panel-secondary" onClick={() => setEditing(true)}>
              Düzenle
            </button>
          ) : null}
          {canDelete ? (
            <form action={deleteInternalComment}>
              {hidden}
              <ConfirmDeleteButton label="Sil" confirmMessage="Bu yorum kalıcı olarak silinsin mi?" />
            </form>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
