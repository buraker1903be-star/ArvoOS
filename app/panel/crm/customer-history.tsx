"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { lookupCustomerHistory } from "./customer-history-actions";
import { lookupReady, nameKey, phoneKey } from "./customer-history-keys";
import type { CustomerHistoryItem, CustomerHistoryResult, HistoryMatch } from "./customer-history-query";
import "./customer-history.css";

const DEBOUNCE_MS = 600;
const subscribeNothing = () => () => undefined;

const MATCH_TEXT: Record<HistoryMatch, string> = {
  phone: "Telefon numarası eşleşti",
  name: "Ad soyad eşleşti",
  both: "Telefon ve ad soyad eşleşti",
};

type Response = { key: string; result: CustomerHistoryResult | null };

/**
 * Talep formunda "bu müşteri daha önce çalıştı" uyarısı.
 *
 * Telefon ya da ad soyad yazıldıkça (gecikmeli) geçmiş kayıtları sorar.
 * Eşleşme varsa kullanıcı iki alandan da çıktığında pencere bir kez
 * kendiliğinden açılır; kapatınca alanların altında kalıcı bir çip kalır.
 * Kaydı engellemez. autoOpen=false: alanlar "Müşteri sorgula"dan
 * doldurulduysa kullanıcı geçmişi zaten gördü; yalnızca çip gösterilir.
 */
export function CustomerHistoryNotice({ name, phone, editing, autoOpen = true }: { name: string; phone: string; editing: boolean; autoOpen?: boolean }) {
  const queryKey = lookupReady(phone, name) ? `${phoneKey(phone)}|${nameKey(name)}` : null;
  const [response, setResponse] = useState<Response | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const sequence = useRef(0);
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);

  useEffect(() => {
    if (!queryKey) {
      sequence.current += 1; // yoldaki cevabı geçersiz kıl
      return;
    }
    const handle = window.setTimeout(() => {
      const ticket = ++sequence.current;
      setPendingKey(queryKey);
      lookupCustomerHistory({ phone, name })
        .then((result) => {
          if (ticket === sequence.current) setResponse({ key: queryKey, result });
        })
        .catch(() => {
          if (ticket === sequence.current) setResponse({ key: queryKey, result: null });
        })
        .finally(() => {
          if (ticket === sequence.current) setPendingKey(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [queryKey, phone, name]);

  const result = queryKey && response?.result?.total ? response.result : null;
  const fresh = Boolean(result) && response?.key === queryKey;
  const unseen = fresh && Boolean(result?.items.some((item) => !seen.has(item.key)));
  const open = Boolean(result) && (manualOpen || (autoOpen && unseen && !editing));
  const searching = Boolean(queryKey) && pendingKey === queryKey;

  const close = () => {
    if (result) setSeen((previous) => new Set([...previous, ...result.items.map((item) => item.key)]));
    setManualOpen(false);
  };

  const portalTarget = isClient ? (document.querySelector(".panel-root") ?? document.body) : null;

  if (!result && !searching) return null;
  return (
    <div className="wide crm-history-inline" aria-live="polite">
      {result ? (
        <button type="button" className="crm-history-chip" onClick={() => setManualOpen(true)} aria-haspopup="dialog">
          <span className="crm-history-chip-dot" aria-hidden="true" />
          <span className="crm-history-chip-text">{result.total} geçmiş kayıt — görüntüle</span>
          <span className="crm-history-chip-arrow" aria-hidden="true">›</span>
        </button>
      ) : (
        <span className="crm-history-searching">Geçmiş kayıtlar kontrol ediliyor…</span>
      )}
      {open && result && portalTarget ? createPortal(<CustomerHistoryDialog result={result} onClose={close} />, portalTarget) : null}
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 2.64-6.36" />
      <path d="M3 4v4.5h4.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** "2 teklif · 1 sözleşme · 3 iş (1 arşivde) · 1 talep" */
export function historyCountLine(result: CustomerHistoryResult) {
  const { counts } = result;
  return [
    counts.proposal ? `${counts.proposal} teklif` : null,
    counts.contract ? `${counts.contract} sözleşme` : null,
    counts.job ? `${counts.job} iş${result.archivedJobs ? ` (${result.archivedJobs} arşivde)` : ""}` : null,
    counts.request ? `${counts.request} talep` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Geçmiş kayıt listesi (talep formu penceresi ve müşteri sorgulama ortak).
 * Ayrıntısını açma yetkisi olmayan kayıt (başka temsilcinin teklifi gibi)
 * bilgi olarak gösterilir ama bağlantı olmaz; kullanıcı açılmayan bir
 * sayfaya gönderilmez.
 */
export function CustomerHistoryList({ items, flagNameOnly }: { items: CustomerHistoryItem[]; flagNameOnly: boolean }) {
  return (
    <ul className="crm-history-list">
      {items.map((item) => {
        const body = (
          <>
            <span className="crm-history-kind" data-kind={item.kind}>{item.kindLabel}</span>
            <span className="crm-history-main">
              <strong>{item.title || "Başlıksız kayıt"}</strong>
              <small>{[item.detail, item.customerName].filter(Boolean).join(" · ")}</small>
              <small>
                {item.dateLabel}
                {item.person ? ` · ${item.personRole === "Operasyon" ? "Operasyon" : "Temsilci"}: ${item.person}` : ""}
                {flagNameOnly && item.match === "name" ? <> · <span className="crm-history-name-only">Yalnızca ad eşleşti</span></> : null}
                {item.canOpen ? (
                  <span className="crm-history-open" aria-hidden="true">↗</span>
                ) : (
                  <span className="crm-history-locked" title="Bu kaydın ayrıntısını açma yetkiniz yok">
                    <LockIcon />
                    Yalnızca özet
                  </span>
                )}
              </small>
            </span>
            <span className="crm-history-side">
              <span className={item.amountLabel ? "crm-history-amount" : "crm-history-amount is-empty"}>{item.amountLabel ?? "—"}</span>
              <span className="status-pill" data-tone={item.tone}>{item.statusLabel}</span>
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {item.canOpen ? (
              <a
                className="crm-history-item"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${item.kindLabel}: ${item.title} — yeni sekmede açılır`}
              >
                {body}
              </a>
            ) : (
              <div className="crm-history-item is-locked">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Liste altı açıklaması: kısıt / kilit / sınır notları. */
export function historyNotes(result: CustomerHistoryResult) {
  return [
    result.limited ? `En yeni ${result.items.length} kayıt gösteriliyor (toplam ${result.total}).` : null,
    result.scopedToAssigned ? "Yalnızca erişiminiz olan kayıtlar listelenir." : null,
    result.items.some((item) => !item.canOpen) ? "“Yalnızca özet” kayıtların ayrıntısını açma yetkiniz yok." : null,
    "Kayıtlar yeni sekmede açılır.",
  ].filter((note): note is string => Boolean(note));
}

export function CustomerHistoryDialog({ result, onClose }: { result: CustomerHistoryResult; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Açılınca odak "Anladım" düğmesine, kapanınca kullanıcının kaldığı alana döner
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    primaryRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);

  // Pencere talep penceresinin üstünde açılıyor; Esc yalnızca bunu kapatsın.
  // Talep penceresi document'ı dinliyor, biz window'u yakalama aşamasında
  // dinleyip olayı orada durduruyoruz.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const countLine = historyCountLine(result);
  const notes = historyNotes(result).map((note) => (note === "Kayıtlar yeni sekmede açılır." ? "Kayıtlar yeni sekmede açılır; formunuz korunur." : note));

  return (
    <div className="crm-history-root">
      <button className="crm-history-backdrop" type="button" aria-label="Pencereyi kapat" tabIndex={-1} onClick={onClose} />
      <section ref={dialogRef} className="crm-history-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="crm-history-handle" aria-hidden="true" />
        <header className="crm-history-head">
          <span className="crm-history-mark"><HistoryIcon /></span>
          <div>
            <small className="panel-kicker">GERİ DÖNEN MÜŞTERİ</small>
            <h2 id={titleId}>Bu müşteri daha önce çalıştı</h2>
            <p id={descriptionId}>
              <b>{result.customerName || "Bu müşteri"}</b> için kurumda {result.total} geçmiş kayıt bulundu.
            </p>
            <span className="crm-history-match" data-kind={result.matchedBy}>✓ {MATCH_TEXT[result.matchedBy]}</span>
          </div>
          <button className="crm-history-close" type="button" aria-label="Kapat" onClick={onClose}>×</button>
        </header>

        <dl className="crm-history-summary">
          <div><dt>Kayıt</dt><dd>{result.total}</dd></div>
          <div><dt>Teklif toplamı</dt><dd title={result.proposedLabel ?? undefined}>{result.proposedLabel ?? "—"}</dd></div>
          <div><dt>Son temas</dt><dd>{result.lastContactLabel ?? "—"}</dd></div>
        </dl>
        {countLine ? <p className="crm-history-counts">{countLine}</p> : null}

        <CustomerHistoryList items={result.items} flagNameOnly={result.matchedBy !== "name"} />

        <footer className="crm-history-foot">
          <p>{notes.join(" ")}</p>
          <button ref={primaryRef} className="panel-primary" type="button" onClick={onClose}>Anladım, devam et</button>
        </footer>
      </section>
    </div>
  );
}
