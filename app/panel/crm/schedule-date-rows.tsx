"use client";

import type { PaymentScheduleItem } from "@/lib/payment-schedule";

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);

/**
 * Ödeme planındaki her taksit için vade tarihi. Koşulu olan taksitte
 * (ör. "Sözleşme Onayıyla") tarih isteğe bağlı; koşulu olmayan taksitte
 * (ör. "Ara Ödeme") zorunlu — aksi halde sözleşmede boş görünür.
 */
export function ScheduleDateRows({
  schedule,
  dates,
  onChange,
  locked,
  title = "VADE TARİHLERİ",
}: {
  schedule: PaymentScheduleItem[];
  dates: Record<number, string>;
  onChange: (sequence: number, value: string) => void;
  /** Değiştirilemeyen taksitler (ör. ödenmiş) ve açıklaması */
  locked?: Map<number, string>;
  title?: string;
}) {
  const missing = schedule.filter((item) => !item.trigger && !locked?.has(item.sequence) && !dates[item.sequence]).length;
  return (
    <section className="wide custom-plan-editor schedule-dates">
      <div className="custom-plan-head">
        <small>{title}</small>
        <span className={missing ? "custom-plan-total warn" : "custom-plan-total ok"}>{missing ? `${missing} taksitte tarih eksik` : "Tarihler net"}</span>
      </div>
      <div className="custom-plan-rows">
        {schedule.map((item) => {
          const lockNote = locked?.get(item.sequence);
          const required = !item.trigger && !lockNote;
          return (
            <label className="schedule-date-row" key={item.sequence}>
              <span className="custom-plan-index">{item.sequence}</span>
              <span className="custom-plan-row-label">
                {item.label}
                <small>{lockNote ?? (item.trigger ? `${item.trigger} · tarih isteğe bağlı` : "Vade tarihi zorunlu")}</small>
              </span>
              <input
                type="date"
                value={dates[item.sequence] ?? ""}
                required={required}
                disabled={Boolean(lockNote)}
                aria-label={`${item.label} vade tarihi`}
                onChange={(event) => onChange(item.sequence, event.target.value)}
              />
              <span className="custom-plan-amount">{money(item.amount)}</span>
            </label>
          );
        })}
      </div>
      {missing ? <p className="custom-plan-hint">Koşulu olmayan taksitlere net bir vade tarihi girin; müşteri ödeme gününü sözleşmede görür.</p> : null}
    </section>
  );
}
