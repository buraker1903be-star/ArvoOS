"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOwnerAccessLink, type OwnerLinkState } from "./actions";

const initialState: OwnerLinkState = { error: null, link: null, email: null, note: null };

function GenerateButton({ again }: { again: boolean }) {
  const { pending } = useFormStatus();
  return <button className={again ? "panel-secondary" : "panel-primary"} type="submit" disabled={pending}>{pending ? "Hazırlanıyor…" : again ? "Yeni bağlantı oluştur" : "Giriş bağlantısı oluştur"}</button>;
}

/**
 * Kurum sahibine tek kullanımlık giriş bağlantısı. Davet e-postası
 * ulaşmadığında ya da süresi dolduğunda kurucu bağlantıyı kopyalayıp
 * WhatsApp veya kendi e-postasıyla gönderir. Bağlantı saklanmaz; yalnızca
 * bu ekranda gösterilir.
 */
export function OwnerAccessLink({ organizationId, organizationName, ownerEmail }: { organizationId: string; organizationName: string; ownerEmail: string | null }) {
  const [state, formAction] = useActionState(createOwnerAccessLink, initialState);
  const [copied, setCopied] = useState(false);
  const message = state.link
    ? `Merhaba,\n\n${organizationName} için ArvoOS paneliniz hazır. Aşağıdaki bağlantıyı açıp şifrenizi belirleyerek panelinize girebilirsiniz:\n\n${state.link}\n\nBağlantı tek kullanımlıktır ve kısa süre içinde geçerliliğini yitirir.\n\nArvoOS`
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
    <div className="plt-access">
      <form action={formAction}>
        <input type="hidden" name="organization_id" value={organizationId} />
        <GenerateButton again={Boolean(state.link)} />
      </form>
      {state.error ? <p className="plt-access-error" role="alert">{state.error}</p> : null}
      {state.link ? (
        <div className="plt-access-result" role="status">
          <small>{state.email} · {state.note}</small>
          <code>{state.link}</code>
          <div className="plt-access-actions">
            <button type="button" className="panel-secondary" onClick={copy}>{copied ? "Kopyalandı ✓" : "Bağlantıyı kopyala"}</button>
            <a className="panel-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp ile gönder</a>
            {ownerEmail ? <a className="panel-secondary" href={`mailto:${encodeURIComponent(ownerEmail)}?subject=${encodeURIComponent(`${organizationName} · ArvoOS paneliniz hazır`)}&body=${encodeURIComponent(message)}`}>E-posta ile gönder</a> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
