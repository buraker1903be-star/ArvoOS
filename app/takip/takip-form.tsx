"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { lookupTracking, refreshCustomerFileMessages, sendCustomerFileMessage, type CustomerFileMessage, type CustomerMessageState, type TakipState } from "./actions";

const workflowStatusNames: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam Ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
};
const contractStatusNames: Record<string, string> = {
  signed: "İmzalandı",
  completed: "Tamamlandı",
};
const money = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format((cents ?? 0) / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const initialState: TakipState = { error: null, result: null };
const initialMessageState: CustomerMessageState = { error: null, success: null, messages: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="status-lookup-submit" type="submit" disabled={pending}>
      {pending ? "Sorgulanıyor..." : "Sorgula"}
    </button>
  );
}

export function TakipForm({ prefillCode }: { prefillCode?: string }) {
  const [state, formAction] = useActionState(lookupTracking, initialState);
  const [messageState, messageAction, messagePending] = useActionState(sendCustomerFileMessage, initialMessageState);
  const [liveMessages, setLiveMessages] = useState<CustomerFileMessage[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (prefillCode && !autoSubmitted.current && formRef.current) {
      autoSubmitted.current = true;
      formRef.current.requestSubmit();
    }
  }, [prefillCode]);

  const row = state.result;
  const messages = liveMessages;
  const accentColor = row?.organization_primary_color || "#183f31";

  useEffect(() => {
    if (!row) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [row]);

  useEffect(() => {
    if (!row) {
      setLiveMessages([]);
      return;
    }
    setLiveMessages(row.messages);
    const timer = window.setInterval(async () => {
      const refreshed = await refreshCustomerFileMessages(row.tracking_code);
      setLiveMessages(refreshed);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [row]);

  useEffect(() => {
    if (messageState.messages) setLiveMessages(messageState.messages);
  }, [messageState.messages]);

  return (
    <div className="status-lookup" style={{ "--status-accent": accentColor } as React.CSSProperties}>
      <form action={formAction} className="status-lookup-form" ref={formRef}>
        <label>
          Takip Kodu
          <input
            name="tracking_code"
            inputMode="text"
            maxLength={9}
            placeholder="ABCD-1234"
            required
            autoComplete="off"
            defaultValue={prefillCode ?? ""}
          />
        </label>
        <SubmitButton />
      </form>

      {state.error ? <p className="status-lookup-error" role="alert">{state.error}</p> : null}

      {row && typeof document !== "undefined" ? createPortal(
        (
        <div className="status-lookup-results" aria-live="polite">
          <article className="status-lookup-card status-lookup-product-view">
            <div className="status-lookup-card-head">
              <div className="status-lookup-result-brand">
                {row.organization_logo_url ? <img src={row.organization_logo_url} alt={row.organization_name} className="status-lookup-org-logo" /> : <span className="status-lookup-org-name-inline">{row.organization_name}</span>}
                <span>Güvenli müşteri alanı</span>
              </div>
              <a className="status-lookup-new-query" href="/takip">Başka dosya sorgula</a>
            </div>
            <div className="status-lookup-result-hero">
              <div>
                <span className="status-lookup-no">{row.contract_no}</span>
                <h2 className="status-lookup-title">{row.contract_title}</h2>
                <p>Dosyanızın güncel operasyon ve ödeme bilgileri aşağıda yer almaktadır.</p>
              </div>
              <span className="status-pill status-pill-live"><i />{row.workflow_status ? workflowStatusNames[row.workflow_status] ?? row.workflow_status : contractStatusNames[row.contract_status] ?? row.contract_status}</span>
            </div>
            <div className="status-lookup-dashboard">
              <section className="status-lookup-progress-panel">
                <div className="status-lookup-section-head"><div><small>GENEL İLERLEME</small><h3>Çalışma durumu</h3></div><strong>%{row.progress_percentage}</strong></div>
                <div className="status-lookup-progress"><div className="status-lookup-progress-track"><span style={{ width: `${row.progress_percentage}%` }} /></div></div>
                <div className="status-lookup-steps">
                  {["Sözleşme", "Planlama", "Çalışma", "Kontrol", "Teslim"].map((step, index) => {
                    const active = row.progress_percentage >= index * 25;
                    return <div className={active ? "is-complete" : ""} key={step}><span>{active ? "✓" : index + 1}</span><b>{step}</b></div>;
                  })}
                </div>
              </section>
              <section className="status-lookup-finance-panel">
                <div className="status-lookup-section-head"><div><small>FİNANS ÖZETİ</small><h3>Ödeme durumu</h3></div></div>
                <div className="status-lookup-balance">
                  <div><span>Sözleşme tutarı</span><b>{money(row.total_amount)}</b></div>
                  <div><span>Toplam tahsilat</span><b className="is-paid">{money(row.paid_amount)}</b></div>
                  <div className="status-lookup-balance-remaining"><span>Kalan bakiye</span><b>{money(row.remaining_amount)}</b></div>
                </div>
              </section>
              <section className="status-lookup-conversation">
                <div className="status-lookup-section-head">
                  <div><small>DOSYA İLETİŞİMİ</small><h3>Operasyon ekibine sorun</h3></div>
                  <span className="status-lookup-message-count">{messages.length} mesaj</span>
                </div>
                <p className="status-lookup-conversation-note">Dosyanızla ilgili sorunuzu buradan iletebilirsiniz. Operasyon sorumlunuz panel üzerinden bilgilendirilir.</p>
                <div className="status-lookup-message-list">
                  {messages.length ? messages.map((message, index) => (
                    <article className={message.sender_type === "customer" ? "from-customer" : "from-staff"} key={`${message.created_at}-${index}`}>
                      <header><b>{message.sender_type === "customer" ? "Siz" : message.sender_name}</b><time>{dateTime(message.created_at)}</time></header>
                      <p>{message.body}</p>
                    </article>
                  )) : <div className="status-lookup-message-empty">Henüz mesaj yok. İlk sorunuzu aşağıdan iletebilirsiniz.</div>}
                </div>
                <form action={messageAction} className="status-lookup-message-form">
                  <input type="hidden" name="tracking_code" value={row.tracking_code}/>
                  <label><span>Mesajınız</span><textarea name="body" required minLength={2} maxLength={2000} placeholder="Dosyanızla ilgili sormak istediğiniz konuyu yazın..."/></label>
                  <div>
                    <small>Yanıtınız bu ekranda görüntülenecektir.</small>
                    <button type="submit" disabled={messagePending}>{messagePending ? "Gönderiliyor..." : "Mesajı Gönder"}</button>
                  </div>
                </form>
                {messageState.error ? <p className="status-lookup-message-error" role="alert">{messageState.error}</p> : null}
                {messageState.success ? <p className="status-lookup-message-success" role="status">{messageState.success}</p> : null}
              </section>
            </div>
            <footer className="status-lookup-result-footer"><span><i /> Son güncelleme: {dateTime(row.last_update)}</span><span>Bilgiler yalnızca size özel takip koduyla görüntülenir.</span></footer>
          </article>
        </div>
        ),
        document.body,
      ) : null}
    </div>
  );
}
