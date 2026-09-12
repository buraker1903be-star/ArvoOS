"use client";

import { Fragment, startTransition, useActionState, useEffect, useLayoutEffect, useOptimistic, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { lookupTracking, refreshCustomerFileMessages, refreshCustomerPortalFiles, sendCustomerFileMessage, type CustomerFileMessage, type CustomerMessageState, type TakipState } from "./actions";
import { LookupSubmitButton } from "../durum/[slug]/lookup-controls";
import { CustomerFiles } from "../durum/[slug]/customer-files";
import {
  describeStatus, FinanceSummary, formatDateTime, formatDay, formatTime,
  IconArrowUp, IconChat, IconChevron, IconClock, IconDoc, IconLock, IconSearch, IconShield,
  LookupAlert, LookupSkeleton, PhaseTimeline, ProgressOverview, StatusPill,
} from "../durum/[slug]/status-view";

type TrackingResult = NonNullable<TakipState["result"]>;
type ThreadMessage = CustomerFileMessage & { pending?: boolean };

const initialState: TakipState = { error: null, result: null };
const initialMessageState: CustomerMessageState = { error: null, success: null, messages: null };
const POLL_MS = 20000;

export function TakipForm({ prefillCode }: { prefillCode?: string }) {
  // "Yeni sorgu" sayfayı yeniden yüklemeden baştan başlatır: anahtar
  // değişince form ve sonuç ekranı sıfırdan kurulur, ?code= adresten düşer
  // (yoksa kod yeniden otomatik sorgulanırdı).
  const [session, setSession] = useState({ key: 0, prefill: prefillCode });
  const startOver = () => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    setSession((current) => ({ key: current.key + 1, prefill: undefined }));
  };
  return <TrackingLookup key={session.key} prefillCode={session.prefill} autoFocus={session.key > 0} onStartOver={startOver} />;
}

function TrackingLookup({ prefillCode, autoFocus, onStartOver }: { prefillCode?: string; autoFocus: boolean; onStartOver: () => void }) {
  const [state, formAction] = useActionState(lookupTracking, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (prefillCode && !autoSubmitted.current && formRef.current) {
      autoSubmitted.current = true;
      formRef.current.requestSubmit();
    }
  }, [prefillCode]);

  const row = state.result;
  const isFirstQuery = !state.result && !state.error;

  return (
    <div className="status-lookup">
      <form action={formAction} className="trk-form" ref={formRef}>
        <label className="trk-field">
          <span className="trk-field-label">Takip kodu</span>
          <input
            className="trk-code-input"
            name="tracking_code"
            inputMode="text"
            maxLength={9}
            placeholder="ABCD-1234"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-describedby="trk-code-hint"
            aria-invalid={state.error ? true : undefined}
            defaultValue={prefillCode ?? ""}
          />
        </label>
        <p id="trk-code-hint" className="trk-field-hint">Büyük/küçük harf fark etmez; tire isteğe bağlıdır.</p>
        <LookupSubmitButton />
        {/* Bağlantıdaki kodla açılışta form yerine dosya iskeleti görünür. */}
        {prefillCode && isFirstQuery ? <PendingScreen /> : null}
      </form>

      {state.error ? <LookupAlert>{state.error}</LookupAlert> : null}

      {row && typeof document !== "undefined" ? createPortal(<ResultScreen row={row} onStartOver={onStartOver} />, document.body) : null}
    </div>
  );
}

function PendingScreen() {
  const { pending } = useFormStatus();
  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <div className="status-lookup-results">
      <div className="trk-topbar">
        <div className="trk-topbar-inner"><span className="trk-skel" style={{ width: 132, height: 24 }} /></div>
      </div>
      <div className="trk-screen">
        <span className="trk-sr" role="status">Dosyanız yükleniyor…</span>
        <LookupSkeleton />
      </div>
    </div>,
    document.body,
  );
}

function ResultScreen({ row, onStartOver }: { row: TrackingResult; onStartOver: () => void }) {
  const [liveMessages, setLiveMessages] = useState<ThreadMessage[]>(row.messages);
  const [messages, addOptimisticMessage] = useOptimistic(liveMessages, (current: ThreadMessage[], next: ThreadMessage) => [...current, next]);
  const [messageState, messageAction, messagePending] = useActionState(async (previous: CustomerMessageState, formData: FormData) => {
    const body = String(formData.get("body") ?? "").trim();
    if (body.length >= 2 && body.length <= 2000) {
      // Mesaj anında balon olarak görünür; sunucu yanıtıyla gerçeğiyle değişir.
      addOptimisticMessage({ sender_type: "customer", sender_name: "Siz", body, created_at: new Date().toISOString(), pending: true });
    }
    const next = await sendCustomerFileMessage(previous, formData);
    const fresh = next.messages;
    if (fresh) startTransition(() => setLiveMessages(fresh));
    return next;
  }, initialMessageState);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  // Tam ekran katman: arkadaki sayfa kaymaz, klavye ve ekran okuyucu için
  // devre dışı kalır (inert). Layout efekti: "Yeni sorgu"da inert, yeni
  // formun autoFocus'undan önce kalkar.
  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const background = document.querySelector<HTMLElement>(".status-lookup-shell");
    document.body.style.overflow = "hidden";
    background?.setAttribute("inert", "");
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      background?.removeAttribute("inert");
    };
  }, []);

  useEffect(() => {
    const code = row.tracking_code;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
      const refreshed = await refreshCustomerFileMessages(code);
      // Geçici bir hata boş liste döndürür; yazışmayı silmek yerine son hal korunur.
      setLiveMessages((current) => (refreshed.length || !current.length ? refreshed : current));
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [row.tracking_code]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const smooth = didInitialScroll.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    thread.scrollTo({ top: thread.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    didInitialScroll.current = true;
  }, [messages.length]);

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const status = describeStatus(row.workflow_status, row.contract_status);
  const accentStyle = row.organization_primary_color ? ({ "--status-accent": row.organization_primary_color } as CSSProperties) : undefined;
  const links = row.documentLinks;
  const documents = [
    ...(links?.proposal_share_token ? [{ href: `/teklif/${links.proposal_share_token}`, title: "Teklif belgesi", meta: links.proposal_no }] : []),
    ...(links?.contract_share_token ? [{ href: `/sozlesme/${links.contract_share_token}`, title: "Sözleşme belgesi", meta: links.contract_no }] : []),
  ];

  const thread = messages.map((message, index) => {
    const day = formatDay(message.created_at);
    const sameGroup = (other?: ThreadMessage) =>
      !!other && other.sender_type === message.sender_type && other.sender_name === message.sender_name && formatDay(other.created_at) === day;
    const previous = messages[index - 1];
    return {
      message,
      day,
      showDay: !previous || formatDay(previous.created_at) !== day,
      isFirst: !sameGroup(previous),
      isLast: !sameGroup(messages[index + 1]),
    };
  });

  return (
    <div className="status-lookup-results" style={accentStyle} role="dialog" aria-modal="true" aria-labelledby="trk-result-title">
      <div className="trk-topbar">
        <div className="trk-topbar-inner">
          <div className="trk-org">
            {row.organization_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- kurum logosu harici, boyutu bilinmeyen bir URL
              <img src={row.organization_logo_url} alt={row.organization_name} className="trk-org-logo" />
            ) : (
              <span className="trk-org-name">{row.organization_name}</span>
            )}
            <span className="trk-org-sub"><IconLock size={12} />Güvenli müşteri alanı</span>
          </div>
          <button type="button" className="trk-topbar-action" onClick={onStartOver}>
            <IconSearch size={17} />
            <span>Yeni sorgu</span>
          </button>
        </div>
      </div>

      <div className="trk-screen">
        <div className="trk-hero">
          <p className="trk-contract-no">{row.contract_no}</p>
          <h1 id="trk-result-title" ref={titleRef} tabIndex={-1}>{row.contract_title}</h1>
          <div className="trk-hero-meta">
            <StatusPill status={status} />
            <span className="trk-updated"><IconClock />Son güncelleme {formatDateTime(row.last_update)}</span>
          </div>
        </div>

        <div className="trk-layout">
          <div className="trk-col">
            <section className="trk-card trk-progress-card" aria-labelledby="trk-progress-title">
              <div className="trk-card-head">
                <h2 id="trk-progress-title">İlerleme</h2>
                <span>Genel çalışma durumu</span>
              </div>
              <ProgressOverview progress={row.progress_percentage} status={status} />
              <PhaseTimeline progress={row.progress_percentage} tone={status.tone} />
            </section>

            {row.files ? <CustomerFiles code={row.tracking_code} initialFiles={row.files} onRefresh={refreshCustomerPortalFiles} /> : null}

            <section className="trk-card trk-chat" aria-labelledby="trk-chat-title">
              <div className="trk-chat-head">
                <span className="trk-chat-avatar" aria-hidden="true"><IconChat /></span>
                <div>
                  <h2 id="trk-chat-title">Operasyon ekibine sorun</h2>
                  <p>Operasyon sorumlunuz panel üzerinden bilgilendirilir.</p>
                </div>
                <span className="trk-count">{liveMessages.length} mesaj</span>
              </div>

              <div className="trk-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Dosya mesajları" tabIndex={0}>
                {thread.length ? thread.map(({ message, day, showDay, isFirst, isLast }, index) => {
                  const mine = message.sender_type === "customer";
                  const className = ["trk-msg", mine && "is-mine", isFirst && "is-first", isLast && "is-last", message.pending && "is-pending"].filter(Boolean).join(" ");
                  return (
                    <Fragment key={`${message.created_at}-${index}`}>
                      {showDay ? <p className="trk-day">{day}</p> : null}
                      <div className={className}>
                        {!mine && isFirst ? <span className="trk-msg-sender" aria-hidden="true">{message.sender_name}</span> : null}
                        <p className="trk-bubble"><span className="trk-sr">{mine ? "Siz" : message.sender_name}: </span>{message.body}</p>
                        {isLast ? (
                          <time className="trk-msg-time" dateTime={message.created_at}>{message.pending ? "Gönderiliyor…" : formatTime(message.created_at)}</time>
                        ) : null}
                      </div>
                    </Fragment>
                  );
                }) : (
                  <div className="trk-thread-empty">
                    <span aria-hidden="true"><IconChat size={24} /></span>
                    <b>Henüz mesaj yok</b>
                    <p>Dosyanızla ilgili ilk sorunuzu aşağıdan iletebilirsiniz.</p>
                  </div>
                )}
              </div>

              <form action={messageAction} className="trk-composer">
                <input type="hidden" name="tracking_code" value={row.tracking_code} />
                <label className="trk-sr" htmlFor="trk-message">Mesajınız</label>
                <div className="trk-composer-row">
                  <div className="trk-composer-input">
                    <textarea
                      id="trk-message"
                      name="body"
                      rows={1}
                      required
                      minLength={2}
                      maxLength={2000}
                      placeholder="Mesajınızı yazın…"
                      aria-describedby="trk-composer-note"
                      onKeyDown={onComposerKeyDown}
                    />
                  </div>
                  <button type="submit" className="trk-send" disabled={messagePending} aria-label={messagePending ? "Gönderiliyor" : "Mesajı gönder"}>
                    {messagePending ? <span className="trk-spinner" aria-hidden="true" /> : <IconArrowUp />}
                  </button>
                </div>
                <p id="trk-composer-note" className="trk-composer-note">Yanıtınız bu ekranda görüntülenecektir.</p>
                {messageState.error ? <p className="trk-inline-error" role="alert">{messageState.error}</p> : null}
                {messageState.success && !messagePending ? <p className="trk-inline-success" role="status">{messageState.success}</p> : null}
              </form>
            </section>
          </div>

          <aside className="trk-col" aria-label="Özet">
            <section className="trk-card trk-finance-card" aria-labelledby="trk-finance-title">
              <div className="trk-card-head">
                <h2 id="trk-finance-title">Ödeme özeti</h2>
              </div>
              <FinanceSummary total={row.total_amount} paid={row.paid_amount} remaining={row.remaining_amount} />
            </section>

            {documents.length ? (
              <section className="trk-card trk-docs-card" aria-labelledby="trk-docs-title">
                <div className="trk-card-head">
                  <h2 id="trk-docs-title">Belgeleriniz</h2>
                </div>
                <ul className="trk-list">
                  {documents.map((document) => (
                    <li key={document.href}>
                      <a href={document.href} target="_blank" rel="noreferrer">
                        <span className="trk-doc-icon" aria-hidden="true"><IconDoc /></span>
                        <span className="trk-doc-text">
                          <b>{document.title}</b>
                          {document.meta ? <small>{document.meta}</small> : null}
                        </span>
                        <span className="trk-sr">(yeni sekmede açılır)</span>
                        <span className="trk-chevron" aria-hidden="true"><IconChevron /></span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="trk-note">
              <IconShield />
              <span>Bu bilgiler yalnızca size özel takip koduyla görüntülenir. Kodunuzu kimseyle paylaşmayın.</span>
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
