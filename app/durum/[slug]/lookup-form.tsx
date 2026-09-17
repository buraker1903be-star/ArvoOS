"use client";

import { useActionState, useEffect } from "react";
import { lookupStatus, refreshLookupPortalFiles } from "./actions";
import { initialLookupState } from "./lookup-state";
import { LookupSubmitButton } from "./lookup-controls";
import { CustomerFiles } from "./customer-files";
import { describeStatus, FinanceSummary, formatDateTime, IconClock, LookupAlert, PhaseTimeline, ProgressOverview, StatusPill } from "./status-view";

export function StatusLookupForm({ orgSlug, prefillCode }: { orgSlug: string; prefillCode?: string }) {
  const boundAction = lookupStatus.bind(null, orgSlug);
  const [state, formAction] = useActionState(boundAction, initialLookupState);

  // Kod adres çubuğunda bırakılmaz: alana zaten dolduruldu. Dosya indirme
  // adresi kodun adres çubuğuna yazılmasını açıkça yasaklıyor (yalnızca POST
  // kabul ediyor), ama bu sayfaya ?code= ile gelinebildiği için kod tarayıcı
  // geçmişine, Referer başlığına ve sunucu erişim günlüklerine düşüyordu.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("code")) return;
      url.searchParams.delete("code");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {
      // Adres okunamazsa sorgulama yine de çalışır.
    }
  }, []);

  return (
    <div className="status-lookup">
      <form action={formAction} className="trk-form">
        <label className="trk-field">
          <span className="trk-field-label">Takip kodu</span>
          <input
            className="trk-code-input"
            name="tracking_code"
            inputMode="text"
            pattern="[A-Za-z0-9]{6}"
            minLength={6}
            maxLength={6}
            placeholder="A7K9P2"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="trk-code-hint"
            aria-invalid={state.error ? true : undefined}
            defaultValue={prefillCode?.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) ?? ""}
          />
        </label>
        <p id="trk-code-hint" className="trk-field-hint">6 karakter; büyük/küçük harf fark etmez.</p>
        <LookupSubmitButton />
      </form>

      {state.error ? <LookupAlert>{state.error}</LookupAlert> : null}

      {state.results ? (
        <div className="trk-results" aria-live="polite">
          {state.results.map((row, index) => {
            const status = describeStatus(row.workflow_status, row.contract_status);
            return (
              <article className="trk-result-card" key={`${row.contract_no}-${index}`}>
                <div className="trk-result-head">
                  <span className="trk-contract-no">{row.contract_no}</span>
                  <StatusPill status={status} />
                </div>
                <h2 className="trk-result-title">{row.contract_title}</h2>
                <ProgressOverview progress={row.progress_percentage} status={status} size="md" />
                <PhaseTimeline progress={row.progress_percentage} tone={status.tone} />
                <FinanceSummary total={row.total_amount} paid={row.paid_amount} remaining={row.remaining_amount} />
                <p className="trk-updated"><IconClock />Son güncelleme {formatDateTime(row.last_update)}</p>
              </article>
            );
          })}
          {/* Bu sayfanın ödeme kartı kuruma özel sorgudan gelir; iki kaynak
              arasında tutar farkı görünmesin diye kilit metni tutar yazmaz. */}
          {state.code && state.files ? (
            <CustomerFiles
              key={`${state.code}:${state.files.map((file) => `${file.id}${file.locked ? "L" : ""}`).join(",")}`}
              code={state.code}
              initialFiles={state.files}
              onRefresh={refreshLookupPortalFiles}
              showAmount={false}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
