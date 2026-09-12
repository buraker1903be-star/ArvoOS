"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  loadCustomerLookupHistory,
  searchCustomerLookup,
  type CustomerLookupHistoryResponse,
  type CustomerLookupSearchResponse,
} from "./customer-lookup-actions";
import { NEW_REQUEST_PREFILL_EVENT, parseLookupQuery, type NewRequestPrefill } from "./customer-history-keys";
import type { CustomerLookupSummary, LookupMatch } from "./customer-lookup-query";
import { CustomerHistoryList, historyCountLine, historyNotes } from "./customer-history";
import "./customer-lookup.css";

/**
 * "Müşteri sorgula": talep girmeden önce müşterinin kurumdaki tüm
 * geçmişine bakmak için arama penceresi. Telefon ya da ad soyad yazıldıkça
 * (250 ms gecikmeli) arar; benzer adları da "Benzer" etiketiyle listeler.
 * Müşteri seçilince talep / teklif / sözleşme / iş geçmişi açılır.
 *
 * Pencere .panel-root içine portal ile çizilir: düğmenin üst öğelerinden
 * biri transform / backdrop-filter taşıyınca position:fixed o öğeye
 * hapsoluyor (panel-drawer.tsx ile aynı sorun).
 */

const DEBOUNCE_MS = 250;
const subscribeNothing = () => () => undefined;
/** Sayfadaki "+ Yeni talep" düğmesi (crm/page.tsx) */
const NEW_REQUEST_TRIGGER = ".crm-new-request-trigger";

const MATCH_BADGE: Record<LookupMatch, { label: string; tone: "success" | "info" | "warning" }> = {
  phone: { label: "Telefon eşleşti", tone: "success" },
  phone_partial: { label: "Numara içeriyor", tone: "info" },
  name: { label: "Ad soyad eşleşti", tone: "success" },
  name_partial: { label: "Ad içeriyor", tone: "info" },
  similar: { label: "Benzer", tone: "warning" },
};

type SearchState = { key: string; response: CustomerLookupSearchResponse };
type DetailState = { key: string; response: CustomerLookupHistoryResponse };

/* ---------------------------------------------------------------------- */
/* Vurgulama                                                                */
/* ---------------------------------------------------------------------- */

/** Tek karakteri nameKey kuralıyla normalleştirir (harf/rakam değilse boşluk). */
function normalizeChar(char: string) {
  const lowered = char.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^[\p{L}\p{N}]+$/u.test(lowered) ? lowered : lowered ? " " : "";
}

function renderMarked(chars: string[], marked: boolean[]): ReactNode {
  const parts: ReactNode[] = [];
  let start = 0;
  for (let index = 1; index <= chars.length; index += 1) {
    if (index === chars.length || marked[index] !== marked[start]) {
      const text = chars.slice(start, index).join("");
      parts.push(marked[start] ? <mark key={start}>{text}</mark> : text);
      start = index;
    }
  }
  return parts;
}

/** "IŞIK Çağlar" içinde "isik cag" -> <mark>IŞIK</mark> <mark>Çağ</mark>lar */
function highlightName(text: string, tokens: string[]): ReactNode {
  const chars = Array.from(text);
  let normalized = "";
  const owner: number[] = [];
  chars.forEach((char, index) => {
    const piece = normalizeChar(char);
    for (const unit of piece) {
      normalized += unit;
      owner.push(index);
    }
  });
  const marked = chars.map(() => false);
  for (const token of tokens) {
    if (!token) continue;
    for (let at = normalized.indexOf(token); at !== -1; at = normalized.indexOf(token, at + token.length)) {
      for (let offset = 0; offset < token.length; offset += 1) marked[owner[at + offset]] = true;
    }
  }
  return marked.some(Boolean) ? renderMarked(chars, marked) : text;
}

/** "+90 (532) 462 80 98" içinde "4628" rakamlarını vurgular. */
function highlightPhone(text: string, digits: string): ReactNode {
  const chars = Array.from(text);
  const positions: number[] = [];
  chars.forEach((char, index) => {
    if (/\d/.test(char)) positions.push(index);
  });
  const all = positions.map((index) => chars[index]).join("");
  const offset = all.length > 10 ? all.length - 10 : 0;
  const at = all.slice(offset).indexOf(digits);
  if (at === -1) return text;
  const marked = chars.map(() => false);
  for (let index = at + offset; index < at + offset + digits.length; index += 1) marked[positions[index]] = true;
  return renderMarked(chars, marked);
}

const initialsOf = (name: string) =>
  Array.from(name.trim())
    .filter((_, index, all) => index === 0 || all[index - 1] === " ")
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR") || "?";

function summaryLine(customer: CustomerLookupSummary) {
  const { counts } = customer;
  return [
    `${counts.requests} talep`,
    counts.proposals ? `${counts.proposals} teklif` : null,
    counts.contracts ? `${counts.contracts} sözleşme` : null,
    counts.jobs ? `${counts.jobs} iş${counts.archivedJobs ? ` (${counts.archivedJobs} arşivde)` : ""}` : null,
    customer.lastContactLabel ? `Son temas ${customer.lastContactLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ---------------------------------------------------------------------- */
/* İkonlar                                                                  */
/* ---------------------------------------------------------------------- */

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Düğme + pencere                                                          */
/* ---------------------------------------------------------------------- */

export function CustomerLookupButton() {
  const [open, setOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const portalTarget = isClient ? (document.querySelector(".panel-root") ?? document.body) : null;

  const openLookup = () => {
    setCanCreate(Boolean(document.querySelector(NEW_REQUEST_TRIGGER)));
    setOpen(true);
  };

  return (
    <>
      <button ref={triggerRef} className="panel-secondary crm-lookup-trigger" type="button" onClick={openLookup} aria-haspopup="dialog">
        <SearchIcon />
        Müşteri sorgula
      </button>
      {open && portalTarget
        ? createPortal(
            <CustomerLookupDialog
              canCreate={canCreate}
              onClose={(handoff) => {
                setOpen(false);
                if (!handoff) window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
              }}
            />,
            portalTarget,
          )
        : null}
    </>
  );
}

function CustomerLookupDialog({ canCreate, onClose }: { canCreate: boolean; onClose: (handoff?: boolean) => void }) {
  const titleId = useId();
  const listId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const rawRef = useRef("");
  const searchSequence = useRef(0);
  const detailSequence = useRef(0);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<CustomerLookupSummary | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);

  const parsed = parseLookupQuery(query);
  const queryKey = parsed && parsed.mode !== "short" ? parsed.key : null;

  // Yazdıkça gecikmeli arama; yalnızca en son isteğin cevabı işlenir
  useEffect(() => {
    if (!queryKey) {
      searchSequence.current += 1;
      return;
    }
    const handle = window.setTimeout(() => {
      const ticket = ++searchSequence.current;
      setPendingKey(queryKey);
      searchCustomerLookup(rawRef.current)
        .then((response) => {
          if (ticket !== searchSequence.current) return;
          setSearch({ key: queryKey, response });
          setActiveIndex(0);
        })
        .catch(() => {
          if (ticket !== searchSequence.current) return;
          setSearch({ key: queryKey, response: { ok: false, message: "Arama şu an yapılamadı. Bağlantınızı kontrol edip tekrar deneyin." } });
        })
        .finally(() => {
          if (ticket === searchSequence.current) setPendingKey(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [queryKey]);

  // Arka plan kaymasın
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const selectedRef = useRef<CustomerLookupSummary | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const backToResults = () => {
    detailSequence.current += 1;
    setSelected(null);
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };
  const backRefFn = useRef(backToResults);
  useEffect(() => {
    backRefFn.current = backToResults;
  });

  // Esc: ayrıntıdaysa sonuçlara, değilse kapat. Tab pencerede döner.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (selectedRef.current) backRefFn.current();
        else closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input")].filter(
        (element) => element.offsetParent !== null,
      );
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
  }, []);

  const current = queryKey && search ? search : null;
  const stale = Boolean(current && current.key !== queryKey);
  const searching = Boolean(queryKey) && (pendingKey === queryKey || search?.key !== queryKey);
  const customers = current?.response.ok ? current.response.customers : [];
  const fullHistory = current?.response.ok ? current.response.fullHistory : true;
  const active = customers.length ? Math.min(activeIndex, customers.length - 1) : -1;
  const optionId = (index: number) => `${listId}-option-${index}`;

  const loadDetail = (customer: CustomerLookupSummary) => {
    const ticket = ++detailSequence.current;
    setDetail(null);
    loadCustomerLookupHistory(customer.key)
      .then((response) => {
        if (ticket === detailSequence.current) setDetail({ key: customer.key, response });
      })
      .catch(() => {
        if (ticket === detailSequence.current) {
          setDetail({ key: customer.key, response: { ok: false, message: "Geçmiş şu an yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin." } });
        }
      });
  };

  const selectCustomer = (customer: CustomerLookupSummary) => {
    setSelected(customer);
    if (detail?.key !== customer.key || !detail.response.ok) loadDetail(customer);
    window.requestAnimationFrame(() => backRef.current?.focus({ preventScroll: true }));
  };

  const moveActive = (next: number) => {
    if (!customers.length) return;
    const index = (next + customers.length) % customers.length;
    setActiveIndex(index);
    window.requestAnimationFrame(() => document.getElementById(optionId(index))?.scrollIntoView({ block: "nearest" }));
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && customers[active]) selectCustomer(customers[active]);
    }
  };

  const startNewRequest = (customer: CustomerLookupSummary) => {
    const trigger = document.querySelector<HTMLButtonElement>(NEW_REQUEST_TRIGGER);
    if (!trigger) return;
    const prefill: NewRequestPrefill = { name: customer.name, phone: customer.phone, email: customer.email };
    onClose(true);
    window.dispatchEvent(new CustomEvent<NewRequestPrefill>(NEW_REQUEST_PREFILL_EVENT, { detail: prefill }));
    trigger.click();
  };

  const tokens = parsed?.mode === "name" ? parsed.tokens : [];
  const digits = parsed?.mode === "phone" ? parsed.digits : "";
  const firstSimilar = customers.findIndex((customer) => customer.match === "similar");

  let body: ReactNode;
  if (selected) {
    body = (
      <CustomerDetail
        customer={selected}
        detail={detail?.key === selected.key ? detail.response : null}
        canCreate={canCreate}
        onRetry={() => loadDetail(selected)}
        onNewRequest={() => startNewRequest(selected)}
      />
    );
  } else if (!parsed) {
    body = (
      <div className="crm-lookup-state">
        <span className="crm-lookup-state-icon"><SearchIcon /></span>
        <strong>Telefon numarası ya da ad soyad yazın</strong>
        <p>Yazdıkça kurumdaki tüm talep, teklif, sözleşme ve işlerde aranır; benzer adlar da listelenir.</p>
        <p className="crm-lookup-examples">Örnek: <span>0532 462 80 98</span> <span>5324</span> <span>Işık Çağlar</span></p>
      </div>
    );
  } else if (parsed.mode === "short") {
    body = (
      <div className="crm-lookup-state">
        <strong>{parsed.kind === "phone" ? "En az 4 rakam yazın" : "En az 2 harf yazın"}</strong>
        <p>{parsed.kind === "phone" ? "Numaranın herhangi bir kısmıyla arayabilirsiniz." : "Ad, soyad ya da ikisinin başıyla arayabilirsiniz."}</p>
      </div>
    );
  } else if (current && !current.response.ok) {
    body = (
      <div className="crm-lookup-state is-error" role="alert">
        <strong>Arama yapılamadı</strong>
        <p>{current.response.message}</p>
      </div>
    );
  } else if (!current || (stale && !customers.length)) {
    body = <ResultsSkeleton />;
  } else if (!customers.length) {
    body = (
      <div className="crm-lookup-state">
        <strong>Eşleşen müşteri bulunamadı</strong>
        <p>
          {parsed.mode === "phone"
            ? "Numarayı farklı bir kısmıyla ya da müşterinin adıyla deneyin."
            : "Yazımı kontrol edin ya da telefon numarasıyla deneyin."}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        {!fullHistory ? (
          <p className="crm-lookup-banner">Veritabanı güncellemesi bekleniyor: şimdilik yalnızca size atanmış talepler aranıyor.</p>
        ) : null}
        <ul id={listId} className={stale ? "crm-lookup-results is-stale" : "crm-lookup-results"} role="listbox" aria-label="Bulunan müşteriler">
          {customers.map((customer, index) => {
            const badge = MATCH_BADGE[customer.match];
            return [
              index === firstSimilar ? (
                <li key="similar-heading" className="crm-lookup-sep" role="presentation">
                  {index === 0 ? "Birebir eşleşme yok — benzer müşteriler" : "Benzer müşteriler"}
                </li>
              ) : null,
              <li
                key={customer.key}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className="crm-lookup-option"
                onMouseMove={() => (index !== active ? setActiveIndex(index) : undefined)}
                onClick={() => selectCustomer(customer)}
              >
                <span className="crm-lookup-avatar" aria-hidden="true">{initialsOf(customer.name)}</span>
                <span className="crm-lookup-option-main">
                  <strong>{tokens.length && customer.match !== "similar" ? highlightName(customer.name, tokens) : customer.name}</strong>
                  <small>
                    {customer.phone ? (digits ? highlightPhone(customer.phone, digits) : customer.phone) : "Telefon yok"}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </small>
                  <small>{summaryLine(customer)}</small>
                  {customer.reps.length ? <small className="crm-lookup-reps">Temsilci: {customer.reps.join(", ")}</small> : null}
                </span>
                <span className="crm-lookup-option-side">
                  <span className="status-pill" data-tone={badge.tone}>{badge.label}</span>
                  {customer.proposedLabel ? <span className="crm-lookup-amount" title="Teklif toplamı">{customer.proposedLabel}</span> : null}
                  <span className="crm-lookup-chevron" aria-hidden="true">›</span>
                </span>
              </li>,
            ];
          })}
        </ul>
      </>
    );
  }

  return (
    <div className="crm-lookup-root">
      <button className="crm-lookup-backdrop" type="button" aria-label="Pencereyi kapat" tabIndex={-1} onClick={() => onClose()} />
      <section ref={dialogRef} className="crm-lookup-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="crm-lookup-head">
          <div className="crm-lookup-title">
            <div>
              <small className="panel-kicker">MÜŞTERİ SORGULAMA</small>
              <h2 id={titleId}>{selected ? "Müşteri geçmişi" : "Müşteri sorgula"}</h2>
            </div>
            <button className="crm-lookup-close" type="button" aria-label="Kapat" onClick={() => onClose()}>×</button>
          </div>
          {selected ? (
            <button ref={backRef} className="crm-lookup-back" type="button" onClick={backToResults}>
              <BackIcon />
              <span>
                Sonuçlara dön<small>“{query.trim()}”</small>
              </span>
            </button>
          ) : (
            <label className="crm-lookup-field" data-busy={searching || undefined}>
              <span className="crm-lookup-field-icon"><SearchIcon /></span>
              <input
                ref={inputRef}
                // Pencere yalnızca kullanıcı düğmeye bastığında açılıyor
                autoFocus
                type="search"
                inputMode={parsed?.mode === "phone" || (parsed?.mode === "short" && parsed.kind === "phone") ? "tel" : "text"}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={120}
                placeholder="Telefon numarası veya ad soyad"
                aria-label="Telefon numarası veya ad soyad"
                role="combobox"
                aria-expanded={customers.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                value={query}
                onChange={(event) => {
                  rawRef.current = event.target.value;
                  setQuery(event.target.value);
                }}
                onKeyDown={onInputKeyDown}
              />
              {searching ? <span className="crm-lookup-spinner" aria-label="Aranıyor" /> : null}
              {query ? (
                <button
                  className="crm-lookup-clear"
                  type="button"
                  aria-label="Aramayı temizle"
                  onClick={() => {
                    rawRef.current = "";
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : null}
            </label>
          )}
          {!selected && parsed && parsed.mode !== "short" ? (
            <p className="crm-lookup-mode" aria-live="polite">
              {parsed.mode === "phone" ? "Telefon numarasında aranıyor" : "Ad soyadda aranıyor (Türkçe harf ve büyük/küçük harf fark etmez)"}
              {current?.response.ok && !stale ? ` · ${customers.length} müşteri` : ""}
            </p>
          ) : null}
        </header>

        <div className="crm-lookup-body">{body}</div>

        <footer className="crm-lookup-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> seç</span>
          <span><kbd>Enter</kbd> geçmişi aç</span>
          <span><kbd>Esc</kbd> {selected ? "geri" : "kapat"}</span>
        </footer>
      </section>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <ul className="crm-lookup-results" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <li key={index} className="crm-lookup-option is-skeleton">
          <span className="crm-lookup-avatar" />
          <span className="crm-lookup-option-main">
            <span className="crm-lookup-bone" />
            <span className="crm-lookup-bone is-short" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function CustomerDetail({
  customer,
  detail,
  canCreate,
  onRetry,
  onNewRequest,
}: {
  customer: CustomerLookupSummary;
  detail: CustomerLookupHistoryResponse | null;
  canCreate: boolean;
  onRetry: () => void;
  onNewRequest: () => void;
}) {
  const result = detail?.ok ? detail.result : null;
  const countLine = result ? historyCountLine(result) : "";
  const notes = result ? historyNotes(result) : [];

  return (
    <div className="crm-lookup-detail">
      <section className="crm-lookup-profile">
        <span className="crm-lookup-avatar is-large" aria-hidden="true">{initialsOf(customer.name)}</span>
        <div className="crm-lookup-profile-main">
          <h3>{customer.name}</h3>
          <p>
            {customer.phone ? <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>{customer.phone}</a> : "Telefon yok"}
            {customer.email ? <> · <a href={`mailto:${customer.email}`}>{customer.email}</a></> : null}
          </p>
          {customer.reps.length ? <p className="crm-lookup-reps">Temsilci: {customer.reps.join(", ")}</p> : null}
        </div>
        {canCreate ? (
          <button className="panel-primary crm-lookup-new" type="button" onClick={onNewRequest}>
            + Bu müşteri için yeni talep
          </button>
        ) : null}
      </section>

      <dl className="crm-lookup-stats">
        <div><dt>Kayıt</dt><dd>{result ? result.total : "…"}</dd></div>
        <div><dt>Teklif toplamı</dt><dd title={result?.proposedLabel ?? customer.proposedLabel ?? undefined}>{result?.proposedLabel ?? customer.proposedLabel ?? "—"}</dd></div>
        <div><dt>Sözleşme toplamı</dt><dd title={result?.contractedLabel ?? customer.contractedLabel ?? undefined}>{result?.contractedLabel ?? customer.contractedLabel ?? "—"}</dd></div>
        <div><dt>Son temas</dt><dd>{result?.lastContactLabel ?? customer.lastContactLabel ?? "—"}</dd></div>
      </dl>
      {countLine ? <p className="crm-lookup-counts">{countLine}</p> : null}

      {!detail ? (
        <div className="crm-lookup-history-loading" aria-live="polite">
          <span className="crm-lookup-spinner" />
          Geçmiş kayıtlar yükleniyor…
        </div>
      ) : !detail.ok ? (
        <div className="crm-lookup-state is-error" role="alert">
          <strong>Geçmiş yüklenemedi</strong>
          <p>{detail.message}</p>
          <button className="panel-secondary" type="button" onClick={onRetry}>Tekrar dene</button>
        </div>
      ) : !result ? (
        <div className="crm-lookup-state">
          <strong>Bu müşteri için görüntülenecek kayıt yok</strong>
        </div>
      ) : (
        <>
          <CustomerHistoryList items={result.items} flagNameOnly={customer.key.startsWith("p:")} />
          {notes.length ? <p className="crm-lookup-notes">{notes.join(" ")}</p> : null}
        </>
      )}
    </div>
  );
}
