"use client";

import { Fragment, startTransition, useActionState, useEffect, useLayoutEffect, useOptimistic, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { lookupTracking, refreshCustomerFileMessages, refreshCustomerPortalFiles, respondToProposalFromTracking, sendCustomerFileMessage, type CustomerFileMessage, type CustomerMessageState, type ProposalDecisionState, type TakipState, type TrackingDocuments } from "./actions";
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

// İş planı tarihleri "YYYY-AA-GG"; öğlen saatiyle okunur ki saat dilimi günü kaydırmasın.
const planDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const planMoney = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

const initialDecisionState: ProposalDecisionState = { error: null, success: null, documents: null };

type Badge = { label: string; tone: "ok" | "wait" | "bad" | "muted" } | null;
function proposalBadge(proposal: TrackingDocuments["proposal"] | undefined): Badge {
  if (!proposal) return null;
  if (proposal.status === "accepted") return proposal.customerDecided ? { label: "Kabul edildi", tone: "ok" } : { label: "Onayınızı bekliyor", tone: "wait" };
  if (proposal.status === "sent") return { label: "Onayınızı bekliyor", tone: "wait" };
  if (proposal.status === "rejected") return { label: "Reddedildi", tone: "bad" };
  if (proposal.status === "expired") return { label: "Süresi doldu", tone: "muted" };
  return null;
}
function contractBadge(contract: TrackingDocuments["contract"] | undefined): Badge {
  if (!contract) return null;
  if (contract.signed) return { label: "İmzalandı", tone: "ok" };
  if (contract.status === "sent") return { label: "İmzalanmadı", tone: "wait" };
  if (contract.status === "draft") return { label: "Hazırlanıyor", tone: "muted" };
  if (contract.status === "cancelled") return { label: "İptal edildi", tone: "bad" };
  return null;
}

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
      // Kod adres çubuğunda bırakılmaz. Dosya indirme adresi bunu açıkça
      // yasaklıyor (yalnızca POST kabul ediyor), ama sorgulama sayfasına
      // ?code= ile gelinebildiği için kod tarayıcı geçmişine, Referer
      // başlığına ve sunucu erişim günlüklerine düşüyordu. Kod tek anahtar:
      // parola yok, hesap yok.
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("code")) {
          url.searchParams.delete("code");
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
      } catch {
        // Adres okunamazsa sorgulama yine de çalışır.
      }
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
  const plan = row.workPlan;
  const today = todayIso();
  const [decisionState, decisionAction, decisionPending] = useActionState(respondToProposalFromTracking, initialDecisionState);
  const docs = decisionState.documents ?? row.documents;
  const offer = docs?.proposal ?? null;
  const showOffer = Boolean(offer && (offer.canAccept || decisionState.success));
  const contractCancelled = docs?.contract?.status === "cancelled";
  // İmza öncesi: iş akışı yok, ilerleme/dosya/ödeme yerine sözleşme onayı gösterilir.
  const awaitingSignature = !row.workflow_status && ["draft", "sent"].includes(row.contract_status);
  const signUrl = row.contract_status === "sent" && !contractCancelled && links?.contract_share_token ? `/sozlesme/${links.contract_share_token}#imza` : null;
  const documents = [
    ...(links?.proposal_share_token ? [{ href: `/teklif/${links.proposal_share_token}`, title: "Teklif belgesi", meta: links.proposal_no, badge: proposalBadge(docs?.proposal) }] : []),
    ...(links?.contract_share_token ? [{ href: `/sozlesme/${links.contract_share_token}`, title: "Sözleşme belgesi", meta: links.contract_no, badge: contractBadge(docs?.contract) }] : []),
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
              // Kurum logosu harici, boyutu bilinmeyen bir URL (bkz. eslint.config.mjs).
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
            {showOffer && offer ? (
              <section className="trk-card trk-offer-card" aria-labelledby="trk-offer-title">
                <div className="trk-card-head">
                  <h2 id="trk-offer-title">Teklif onayı</h2>
                  {offer.canAccept ? <span className="trk-badge is-wait">Onayınızı bekliyor</span> : <span className="trk-badge is-ok">Kaydedildi</span>}
                </div>
                {decisionState.success ? (
                  <p className="trk-sign-note" role="status">{decisionState.success}</p>
                ) : (
                  <>
                    <p className="trk-sign-note">
                      {docs?.contract?.signed
                        ? `Sözleşmeniz ${offer.no ? `${offer.no} numaralı teklifinize` : "teklifinize"} göre imzalandı; teklifi de onaylamanız kayıtlarınızı tamamlar.`
                        : `${offer.no ? `${offer.no} numaralı teklifinize` : "Teklifinize"} göre sözleşmeniz hazırlandı. Teklifi inceleyip kabul ettiğinizi bildirin; ardından sözleşmenizi imzalayabilirsiniz.`}
                    </p>
                    {links?.proposal_share_token ? (
                      <a className="trk-offer-view" href={`/teklif/${links.proposal_share_token}`} target="_blank" rel="noreferrer">
                        Teklifi görüntüle<IconChevron /><span className="trk-sr">(yeni sekmede açılır)</span>
                      </a>
                    ) : null}
                    <form action={decisionAction} className={offer.canReject ? "trk-offer-actions" : "trk-offer-actions is-single"}>
                      <input type="hidden" name="tracking_code" value={row.tracking_code} />
                      <button type="submit" name="decision" value="accept" className="trk-offer-accept" disabled={decisionPending}>
                        {decisionPending ? "Kaydediliyor…" : "Teklifi kabul ediyorum"}
                      </button>
                      {offer.canReject ? (
                        <button
                          type="submit"
                          name="decision"
                          value="reject"
                          className="trk-offer-reject"
                          disabled={decisionPending}
                          onClick={(event) => {
                            if (!window.confirm("Teklifi reddetmek istediğinize emin misiniz? Hazırlanan sözleşme iptal edilir.")) event.preventDefault();
                          }}
                        >
                          Teklifi reddediyorum
                        </button>
                      ) : null}
                    </form>
                    <p className="trk-sign-foot">Kararınız tarih-saat, IP adresi ve cihaz bilgisiyle kayıt altına alınır.</p>
                  </>
                )}
                {decisionState.error ? <p className="trk-inline-error" role="alert">{decisionState.error}</p> : null}
              </section>
            ) : null}

            {awaitingSignature ? (
              <section className="trk-card trk-sign-card" aria-labelledby="trk-sign-title">
                <div className="trk-card-head">
                  <h2 id="trk-sign-title">Sözleşme onayı</h2>
                  <span>{row.contract_status === "sent" ? "İmzanızı bekliyor" : "Hazırlanıyor"}</span>
                </div>
                <ol className="trk-sign-steps">
                  {offer ? <li className={offer.customerDecided ? "is-done" : offer.canAccept ? "is-current" : undefined}><span>Teklif onayı</span></li> : null}
                  <li className={offer?.canAccept ? undefined : "is-current"}><span>Sözleşme imzası</span></li>
                  <li><span>Çalışma başlar</span></li>
                </ol>
                <p className="trk-sign-note">{status.note}</p>
                <div className="trk-sign-amount"><span>Sözleşme bedeli</span><b>{planMoney(row.total_amount)}</b></div>
                {signUrl ? (
                  <a className="trk-sign-cta" href={signUrl} target="_blank" rel="noreferrer">
                    Sözleşmeyi incele ve imzala<IconChevron />
                    <span className="trk-sr">(yeni sekmede açılır)</span>
                  </a>
                ) : null}
                <p className="trk-sign-foot">Sorunuz varsa aşağıdaki mesaj alanından yazabilirsiniz; ekibimiz yanıtlar.</p>
              </section>
            ) : (
              <section className="trk-card trk-progress-card" aria-labelledby="trk-progress-title">
                <div className="trk-card-head">
                  <h2 id="trk-progress-title">İlerleme</h2>
                  <span>Genel çalışma durumu</span>
                </div>
                <ProgressOverview progress={row.progress_percentage} status={status} />
                <PhaseTimeline progress={row.progress_percentage} tone={status.tone} />
              </section>
            )}

            {row.files && !awaitingSignature ? <CustomerFiles code={row.tracking_code} initialFiles={row.files} onRefresh={refreshCustomerPortalFiles} /> : null}

            <section className="trk-card trk-chat" aria-labelledby="trk-chat-title">
              <div className="trk-chat-head">
                <span className="trk-chat-avatar" aria-hidden="true"><IconChat /></span>
                <div>
                  <h2 id="trk-chat-title">{awaitingSignature ? "Ekibimize sorun" : "Operasyon ekibine sorun"}</h2>
                  <p>{awaitingSignature ? "Müşteri temsilciniz panel üzerinden bilgilendirilir." : "Operasyon sorumlunuz panel üzerinden bilgilendirilir."}</p>
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
            {!awaitingSignature ? (
              <section className="trk-card trk-finance-card" aria-labelledby="trk-finance-title">
                <div className="trk-card-head">
                  <h2 id="trk-finance-title">Ödeme özeti</h2>
                </div>
                <FinanceSummary total={row.total_amount} paid={row.paid_amount} remaining={row.remaining_amount} />
              </section>
            ) : null}

            {plan && (plan.items.length || plan.payments.length || plan.pendingAddendum) ? (
              <section className="trk-card trk-plan-card" aria-labelledby="trk-plan-title">
                <div className="trk-card-head">
                  <h2 id="trk-plan-title">İş planı</h2>
                  <span>{plan.source === "addendum" ? "Onaylı ek protokole göre" : "Sözleşmenize göre"}</span>
                </div>
                {plan.pendingAddendum ? (
                  links?.contract_share_token ? (
                    <a className="trk-plan-alert" href={`/sozlesme/${links.contract_share_token}#ek-protokoller`} target="_blank" rel="noreferrer">
                      <b>Onayınızı bekleyen bir ek protokol var</b>
                      <span>Güncel takvimi inceleyip onaylayın →</span>
                    </a>
                  ) : (
                    <div className="trk-plan-alert"><b>Onayınızı bekleyen bir ek protokol var</b><span>Sözleşme bağlantınızdan inceleyip onaylayabilirsiniz.</span></div>
                  )
                ) : null}
                {plan.items.length ? (
                  <ol className="trk-plan-list">
                    {plan.items.map((item) => (
                      <li key={item.sequence} className={item.due_date < today ? "is-past" : undefined}>
                        <span className="trk-plan-dot" aria-hidden="true" />
                        <div><b>{item.title}</b><time dateTime={item.due_date}>{planDate(item.due_date)}</time></div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="trk-plan-empty">Ara teslim takvimi henüz paylaşılmadı.</p>
                )}
                {plan.payments.length ? (
                  <>
                    <h3 className="trk-plan-sub">Ödeme takvimi</h3>
                    <ul className="trk-plan-pay">
                      {plan.payments.map((payment) => (
                        <li key={payment.sequence}>
                          <div><b>{payment.label}</b><small>{payment.due_date ? planDate(payment.due_date) : payment.trigger ?? "Tarih bildirilecek"}</small></div>
                          <span className={payment.status === "paid" ? "trk-plan-amount is-paid" : "trk-plan-amount"}>
                            {planMoney(payment.amount)}
                            {payment.status === "paid" ? <small>Ödendi</small> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}

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
                        {document.badge ? <span className={`trk-badge is-${document.badge.tone}`}>{document.badge.label}</span> : null}
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
