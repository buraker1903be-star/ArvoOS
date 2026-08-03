"use client";

import { useMemo, useState } from "react";
import { createProposal } from "./sales-actions";

type Props = { opportunityId: string; customerName: string; title: string; scope: string };
type Tax = "excluded" | "included" | "exempt";
type Plan = "cash" | "half" | "thirds" | "custom";

const money = (value: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

export function ProposalBuilderForm({ opportunityId, customerName, title, scope }: Props) {
  const [amount, setAmount] = useState(0);
  const [tax, setTax] = useState<Tax>("excluded");
  const [plan, setPlan] = useState<Plan>("cash");
  const [custom, setCustom] = useState("");

  const calculation = useMemo(() => {
    if (tax === "included") {
      const gross = amount;
      const net = gross / 1.2;
      return { net, vat: gross - net, gross };
    }
    if (tax === "excluded") {
      const net = amount;
      const vat = net * 0.2;
      return { net, vat, gross: net + vat };
    }
    return { net: amount, vat: 0, gross: amount };
  }, [amount, tax]);

  const schedule = useMemo(() => {
    const total = Math.round(calculation.gross * 100) / 100;
    if (plan === "cash") return [{ label: "Peşin ödeme", amount: total }];
    if (plan === "half") {
      const first = Math.round(total * 50) / 100;
      return [{ label: "Peşin ödeme", amount: first }, { label: "Teslim öncesi", amount: total - first }];
    }
    if (plan === "thirds") {
      const first = Math.floor((total * 100) / 3) / 100;
      return [
        { label: "Peşin ödeme", amount: first },
        { label: "Ara ödeme", amount: first },
        { label: "Teslim öncesi", amount: total - first * 2 },
      ];
    }
    return [];
  }, [calculation.gross, plan]);

  const planText = plan === "cash"
    ? "Peşin Ödeme"
    : plan === "half"
      ? "%50 Peşin - %50 Teslim Öncesi"
      : plan === "thirds"
        ? "1/3 Peşin - Ara Ödeme - Teslim Öncesi"
        : custom;

  return <div className="proposal-drawer-content">
    <section className="proposal-drawer-intro">
      <small>YENİ TEKLİF</small>
      <h3>{customerName}</h3>
      <p>Teklif tutarını, KDV durumunu ve ödeme planını belirleyin. Kaydedildiğinde talep otomatik olarak Tekliflere Devredildi durumuna geçer.</p>
    </section>

    <form className="panel-form proposal-builder" action={createProposal}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="payment_schedule" value={JSON.stringify(schedule)} />
      <input type="hidden" name="payment_plan" value={planText} />

      <label className="wide">Teklif başlığı<input name="title" required defaultValue={title} /></label>
      <label>Teklif tutarı<input name="amount" type="number" min="0" step="0.01" required onChange={(event) => setAmount(Number(event.target.value) || 0)} /></label>
      <label>KDV durumu<select name="tax_status" value={tax} onChange={(event) => setTax(event.target.value as Tax)}><option value="excluded">KDV Hariç</option><option value="included">KDV Dahil</option><option value="exempt">KDV İstisna</option></select></label>
      <label className="wide">Ödeme planı<select name="payment_plan_type" value={plan} onChange={(event) => setPlan(event.target.value as Plan)}><option value="cash">Peşin Ödeme</option><option value="half">%50 Peşin - %50 Teslim Öncesi</option><option value="thirds">1/3 Peşin - Ara Ödeme - Teslim Öncesi</option><option value="custom">Özel Ödeme Planı</option></select></label>

      {plan === "custom" ? <label className="wide">Özel ödeme planı<textarea value={custom} onChange={(event) => setCustom(event.target.value)} required placeholder="Ödeme tutarlarını, oranları ve vadeleri yazın." /></label> : null}

      <label className="wide">Hizmet kapsamı<textarea name="scope" required defaultValue={scope} /></label>
      <label className="wide">Geçerlilik tarihi<input name="valid_until" type="date" /></label>

      <section className="proposal-live-summary wide" aria-live="polite">
        <header><span>TEKLİF ÖZETİ</span><strong>{money(calculation.gross)}</strong></header>
        <div><span>Ara toplam</span><b>{money(calculation.net)}</b></div>
        <div><span>KDV</span><b>{money(calculation.vat)}</b></div>
        <div className="proposal-summary-total"><span>Genel toplam</span><strong>{money(calculation.gross)}</strong></div>
        {schedule.length ? <section className="proposal-payment-breakdown"><small>ÖDEME DAĞILIMI</small>{schedule.map((item, index) => <div key={`${item.label}-${index}`}><span>{index + 1}. {item.label}</span><b>{money(item.amount)}</b></div>)}</section> : null}
      </section>

      <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Teklifi Oluştur</button></div>
    </form>
  </div>;
}
