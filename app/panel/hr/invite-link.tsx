"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createTeamInviteLink, type TeamInviteLinkState } from "./team-actions";

const initialState: TeamInviteLinkState = { error: null, link: null, email: null };

function GenerateButton({ again }: { again: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={again ? "panel-secondary" : "panel-primary"} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Hazırlanıyor…" : again ? "Yeni bağlantı oluştur" : "Giriş bağlantısı oluştur"}
    </button>
  );
}

/**
 * Bekleyen bir panel davetine tek kullanımlık giriş bağlantısı. Davet
 * e-postası ulaşmadığında yönetici bağlantıyı kopyalayıp WhatsApp ya da
 * kendi e-postasıyla gönderir. Bağlantı saklanmaz; yalnızca bu ekranda görünür.
 */
export function TeamInviteLink({ invitationId, organizationName, personName, email }: { invitationId: string; organizationName: string; personName: string | null; email: string }) {
  const [state, formAction] = useActionState(createTeamInviteLink, initialState);
  const [copied, setCopied] = useState(false);
  const message = state.link
    ? `Merhaba${personName ? ` ${personName}` : ""},\n\n${organizationName} sizi ArvoOS paneline davet etti. Aşağıdaki bağlantıyı açıp şifrenizi belirleyerek panele girebilirsiniz:\n\n${state.link}\n\nBağlantı tek kullanımlıktır ve kısa süre içinde geçerliliğini yitirir.`
    : "";

  const copy = async () => {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="hr-invite-link">
      <p className="hr-invite-link-hint">Davet e-postası ulaşmadıysa ya da spam klasörüne düştüyse tek kullanımlık bağlantıyı kendiniz gönderin. Kişi bağlantıyı açıp şifresini belirleyince doğrudan panele girer. Yeni bağlantı oluşturduğunuzda önceki bağlantılar geçersiz olabilir.</p>
      <form action={formAction}>
        <input type="hidden" name="invitation_id" value={invitationId} />
        <GenerateButton again={Boolean(state.link)} />
      </form>
      {state.error ? (
        <div className="panel-form-error hr-form-alert is-danger" role="alert">
          <strong>Bağlantı oluşturulamadı</strong>
          <p>{state.error}</p>
        </div>
      ) : null}
      {state.link ? (
        <div className="hr-invite-link-result" role="status">
          <small>{state.email} · tek kullanımlık giriş bağlantısı</small>
          <code>{state.link}</code>
          <div className="hr-invite-link-actions">
            <button type="button" className="panel-secondary" onClick={copy}>{copied ? "Kopyalandı ✓" : "Bağlantıyı kopyala"}</button>
            <a className="panel-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp ile gönder</a>
            <a className="panel-secondary" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`${organizationName} · ArvoOS paneline davet`)}&body=${encodeURIComponent(message)}`}>E-posta ile gönder</a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
