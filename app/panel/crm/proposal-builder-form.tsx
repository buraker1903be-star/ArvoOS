"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createProposal,
  initialCreateProposalState,
} from "./sales-actions";
import {
  calculatePaymentSchedule,
  getPaymentPlanLabel,
  type PaymentPlanType,
  type PaymentScheduleItem,
} from "@/lib/payment-schedule";

type Props = {
  opportunityId: string;
  customerName: string;
  title: string;
  scope: string;
};
type Tax = "excluded" | "included" | "exempt";
type CustomRow = {
  id: string;
  label: string;
  percentage: number;
  due_date: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);

const today = () => new Date().toISOString().slice(0, 10);
let rowIdCounter = 0;
const nextRowId = () => `row-${++rowIdCounter}`;
const customRowPresets = [
  "Peşin (Sözleşme Onayında)",
  "Ön Ödeme",
  "Ara Ödeme",
  "Son Ödeme (Teslim Öncesi)",
];

function SubmitButton({ customPlanValid }: { customPlanValid: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="panel-primary"
      type="submit"
      disabled={pending || !customPlanValid}
      aria-disabled={pending || !customPlanValid}
    >
      {pending ? "Teklif Oluşturuluyor..." : "Teklifi Oluştur"}
    </button>
  );
}

export function ProposalBuilderForm({
  opportunityId,
  customerName,
  title,
  scope,
}: Props) {
  const [state, formAction] = useActionState(
    createProposal,
    initialCreateProposalState,
  );
  const [amount, setAmount] = useState(0);
  const [tax, setTax] = useState<Tax>("excluded");
  const [plan, setPlan] = useState<PaymentPlanType>("cash");
  const [firstPaymentDate, setFirstPaymentDate] = useState(today);
  const [customRows, setCustomRows] = useState<CustomRow[]>(() => [
    {
      id: nextRowId(),
      label: customRowPresets[0],
      percentage: 100,
      due_date: today(),
    },
  ]);

  const calculation = useMemo(() => {
    const amountCents = Math.max(0, Math.round(amount * 100));
    if (tax === "included") {
      const gross = amountCents;
      const net = Math.round(gross / 1.2);
      return { net, vat: gross - net, gross };
    }
    if (tax === "excluded") {
      const net = amountCents;
      const vat = Math.round(net * 0.2);
      return { net, vat, gross: net + vat };
    }
    return { net: amountCents, vat: 0, gross: amountCents };
  }, [amount, tax]);

  const autoSchedule = useMemo(() => {
    const startDate = firstPaymentDate
      ? new Date(`${firstPaymentDate}T12:00:00`)
      : new Date();
    return calculatePaymentSchedule(calculation.gross, plan, startDate);
  }, [calculation.gross, plan, firstPaymentDate]);

  const customPercentTotal = customRows.reduce(
    (sum, row) => sum + (Number(row.percentage) || 0),
    0,
  );
  const customSchedule: PaymentScheduleItem[] = useMemo(
    () =>
      customRows.map((row, index) => ({
        sequence: index + 1,
        label: row.label || `${index + 1}. Ödeme`,
        due_date: row.due_date || today(),
        amount: Math.round(
          (calculation.gross * (Number(row.percentage) || 0)) / 100,
        ),
        percentage: Number(row.percentage) || 0,
      })),
    [customRows, calculation.gross],
  );

  const schedule = plan === "custom" ? customSchedule : autoSchedule;
  const planText = getPaymentPlanLabel(plan);
  const customPlanValid = plan !== "custom" || customPercentTotal === 100;

  function addCustomRow() {
    setCustomRows((rows) => [
      ...rows,
      {
        id: nextRowId(),
        label:
          customRowPresets[
            Math.min(rows.length, customRowPresets.length - 1)
          ] ?? `${rows.length + 1}. Ödeme`,
        percentage: 0,
        due_date: today(),
      },
    ]);
  }

  function removeCustomRow(id: string) {
    setCustomRows((rows) =>
      rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
    );
  }

  function updateCustomRow(id: string, patch: Partial<CustomRow>) {
    setCustomRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  return (
    <div className="proposal-drawer-content">
      <section className="proposal-drawer-intro">
        <small>YENİ TEKLİF</small>
        <h3
          style={{
            fontSize: "18px",
            lineHeight: 1.25,
            margin: "8px 0 10px",
            maxWidth: "calc(100% - 8px)",
          }}
        >
          {customerName} için teklif
        </h3>
        <p style={{ margin: 0, paddingBottom: "2px" }}>
          Tutarı, ödeme planını ve tahmini teslim tarihini belirleyin.
        </p>
      </section>

      <form className="panel-form proposal-builder" action={formAction}>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input
          type="hidden"
          name="payment_schedule"
          value={JSON.stringify(schedule)}
        />
        <input type="hidden" name="payment_plan_type" value={plan} />
        <input type="hidden" name="payment_plan" value={planText} />

        {state.error ? (
          <div
            className="wide panel-form-error"
            role="alert"
            aria-live="assertive"
            style={{
              border: "1px solid currentColor",
              borderRadius: "10px",
              padding: "12px 14px",
            }}
          >
            <strong>Teklif oluşturulamadı</strong>
            <p style={{ margin: "6px 0 0" }}>{state.error}</p>
          </div>
        ) : null}

        <label className="wide">
          Teklif başlığı
          <input name="title" required defaultValue={title} />
        </label>
        <label>
          Teklif tutarı
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label>
          KDV durumu
          <select
            name="tax_status"
            value={tax}
            onChange={(event) => setTax(event.target.value as Tax)}
          >
            <option value="excluded">KDV Hariç</option>
            <option value="included">KDV Dahil</option>
            <option value="exempt">KDV İstisna</option>
          </select>
        </label>
        <label className="wide">
          Ödeme planı
          <select
            value={plan}
            onChange={(event) =>
              setPlan(event.target.value as PaymentPlanType)
            }
          >
            <option value="cash">1. Peşin Ödeme</option>
            <option value="half">
              2. %50 Peşin (Sözleşme Onayında) + %50 Teslim Öncesi
            </option>
            <option value="third">
              3. 1/3 Peşin (Sözleşme Onayında) + Ara Ödeme + Son Ödeme
              (Teslim Öncesi)
            </option>
            <option value="custom">
              4. Özel Ödeme Planı (Taksitli)
            </option>
          </select>
        </label>
        {plan !== "custom" ? (
          <label>
            İlk ödeme tarihi
            <input
              type="date"
              value={firstPaymentDate}
              onChange={(event) => setFirstPaymentDate(event.target.value)}
            />
          </label>
        ) : null}
        <label>
          Tahmini teslim tarihi
          <input
            name="estimated_delivery_date"
            type="date"
            min={today()}
            required
          />
        </label>
        <label>
          Geçerlilik tarihi
          <input name="valid_until" type="date" min={today()} />
        </label>

        <label className="wide">
          Hizmet kapsamı
          <textarea name="scope" required defaultValue={scope} />
        </label>

        {plan === "custom" ? (
          <section className="wide custom-plan-editor">
            <div className="custom-plan-head">
              <small>ÖZEL ÖDEME PLANI — TAKSİTLER</small>
              <span
                className={
                  customPercentTotal === 100
                    ? "custom-plan-total ok"
                    : "custom-plan-total warn"
                }
              >
                Toplam %{customPercentTotal.toFixed(0)}
              </span>
            </div>
            <div className="custom-plan-rows">
              {customRows.map((row, index) => (
                <div className="custom-plan-row" key={row.id}>
                  <span className="custom-plan-index">{index + 1}</span>
                  <input
                    list="custom-plan-presets"
                    value={row.label}
                    onChange={(event) =>
                      updateCustomRow(row.id, { label: event.target.value })
                    }
                    placeholder="Örn. Ön Ödeme"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={row.percentage}
                    onChange={(event) =>
                      updateCustomRow(row.id, {
                        percentage: Number(event.target.value) || 0,
                      })
                    }
                  />
                  <span className="custom-plan-percent-sign">%</span>
                  <input
                    type="date"
                    value={row.due_date}
                    onChange={(event) =>
                      updateCustomRow(row.id, {
                        due_date: event.target.value,
                      })
                    }
                  />
                  <span className="custom-plan-amount">
                    {money(
                      Math.round(
                        (calculation.gross *
                          (Number(row.percentage) || 0)) /
                          100,
                      ),
                    )}
                  </span>
                  <button
                    type="button"
                    className="custom-plan-remove"
                    onClick={() => removeCustomRow(row.id)}
                    disabled={customRows.length <= 1}
                    aria-label="Taksiti sil"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <datalist id="custom-plan-presets">
              {customRowPresets.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
            <button
              type="button"
              className="panel-secondary custom-plan-add"
              onClick={addCustomRow}
            >
              + Taksit ekle
            </button>
            {customPercentTotal !== 100 ? (
              <p className="custom-plan-hint">
                Taksit yüzdeleri toplamı %100 olmalı (şu an %
                {customPercentTotal.toFixed(0)}).
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="proposal-live-summary wide" aria-live="polite">
          <header>
            <span>TEKLİF ÖZETİ</span>
            <strong>{money(calculation.gross)}</strong>
          </header>
          <div>
            <span>Ara toplam</span>
            <b>{money(calculation.net)}</b>
          </div>
          <div>
            <span>KDV</span>
            <b>{money(calculation.vat)}</b>
          </div>
          <div className="proposal-summary-total">
            <span>Genel toplam</span>
            <strong>{money(calculation.gross)}</strong>
          </div>
          <section className="proposal-payment-breakdown">
            <small>
              {plan === "custom"
                ? "ÖDEME PLANI (ÜCRETLER HESAPLANDI)"
                : "OTOMATİK ÖDEME PLANI (ÜCRET HESAPLANDI)"}
            </small>
            {schedule.map((item) => (
              <div key={`${item.sequence}-${item.due_date}`}>
                <span>
                  {item.sequence}. {item.label} ·{" "}
                  {item.due_date
                    ? new Date(
                        `${item.due_date}T12:00:00`,
                      ).toLocaleDateString("tr-TR")
                    : "Tarih yok"}
                </span>
                <b>{money(item.amount)}</b>
              </div>
            ))}
          </section>
        </section>

        <div className="wide panel-form-actions">
          <SubmitButton customPlanValid={customPlanValid} />
        </div>
      </form>
    </div>
  );
}
