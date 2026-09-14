import type { ReactNode } from "react";
import { ADDENDUM_STATUS_LABELS, type ContractAddendum } from "@/lib/work-plan";
import { installmentLabel } from "@/lib/payment-schedule";
import { SectionHeading, WorkPlanTable } from "./blocks";
import { formatDate, formatDateTime, formatMoney, summarizeUserAgent, type ScheduleRow } from "./format";

/**
 * İmzalı sözleşmenin ek protokolleri: ara teslim takvimi ve taksit vadeleri.
 * Sözleşmenin imzalı metni değişmez; değişiklikler burada, müşterinin
 * elektronik onay kaydıyla birlikte gösterilir. Geri çekilenler gösterilmez.
 * Onay bekleyen ek protokolün altında (yalnızca ekranda) müşteri formu çizilir.
 */
export function ContractAddenda({
  addenda,
  schedule,
  currency,
  contractNo,
  print = false,
  renderActions,
}: {
  addenda: ContractAddendum[];
  schedule: ScheduleRow[];
  currency: string;
  contractNo: string;
  print?: boolean;
  renderActions?: (addendum: ContractAddendum) => ReactNode;
}) {
  const visible = addenda.filter((addendum) => addendum.status !== "cancelled");
  if (!visible.length) return null;
  const rows = new Map(schedule.map((row) => [row.sequence, row]));

  return <section className="ad-sec" id="ek-protokoller">
    <SectionHeading>Ek Protokoller</SectionHeading>
    {visible.map((addendum) => {
      const decided = addendum.status === "accepted" || addendum.status === "rejected";
      return <article key={addendum.id} id={`ek-protokol-${addendum.addendum_no}`} className={`ad-addendum is-${addendum.status}`}>
        <header className="ad-addendum-head">
          <div>
            <div className="ad-kicker">Ek Protokol {addendum.addendum_no} · {contractNo}</div>
            <h3>İş Planı ve Ödeme Takvimi</h3>
            <small>Düzenleme: {formatDateTime(addendum.created_at)}</small>
          </div>
          <span className={addendum.status === "accepted" ? "ad-pill ad-pill-ok" : addendum.status === "rejected" ? "ad-pill ad-pill-bad" : "ad-pill"}>{ADDENDUM_STATUS_LABELS[addendum.status]}</span>
        </header>
        <p>
          İşbu ek protokol, {contractNo} numaralı Sözleşme’nin “Hizmet Süresi, Teslim ve Termin” maddesi uyarınca
          {addendum.work_plan.length ? " ara teslimleri" : ""}{addendum.work_plan.length && addendum.payment_dates.length ? " ve" : ""}{addendum.payment_dates.length ? " ödeme vadelerini" : ""} belirler.
          Sözleşme Bedeli, taksit tutarları ve Sözleşme’nin diğer hükümleri aynen geçerlidir.
          {addendum.work_plan.length ? " Onaylandığında aşağıdaki takvim önceki iş planının yerine geçer." : ""}
        </p>
        {addendum.work_plan.length ? <><h4>Ara teslim takvimi</h4><WorkPlanTable items={addendum.work_plan} /></> : null}
        {addendum.payment_dates.length ? <>
          <h4>Ödeme vadeleri</h4>
          <div className="ad-table-wrap"><table className="ad-table ad-table-compact">
            <thead><tr>
              <th style={{ width: "8%" }}>No</th>
              <th>Ödeme</th>
              <th className="ad-num" style={{ width: "22%" }}>Tutar</th>
              <th style={{ width: "24%" }}>Vade</th>
            </tr></thead>
            <tbody>{addendum.payment_dates.map((item) => {
              const row = rows.get(item.sequence);
              return <tr key={item.sequence}>
                <td>{item.sequence}</td>
                <td><strong>{installmentLabel(row?.label, item.sequence)}</strong></td>
                <td className="ad-num">{row ? formatMoney(row.amount, currency) : "—"}</td>
                <td><strong>{formatDate(item.due_date)}</strong></td>
              </tr>;
            })}</tbody>
          </table></div>
        </> : null}
        {addendum.note ? <p className="ad-addendum-note"><b>Hizmet Sağlayıcı notu:</b> {addendum.note}</p> : null}
        {decided ? <div className={addendum.status === "accepted" ? "ad-decision" : "ad-decision is-rejected"}>
          <div className="ad-decision-badge"><i>{addendum.status === "accepted" ? "✓" : "✕"}</i>{addendum.status === "accepted" ? "Müşteri tarafından elektronik olarak onaylandı" : "Müşteri değişiklik istedi; bu ek protokol yürürlüğe girmedi"}</div>
          {addendum.status === "rejected" && addendum.response_note ? <p className="ad-addendum-note">“{addendum.response_note}”</p> : null}
          <dl className="ad-audit">
            <dt>{addendum.status === "accepted" ? "Onaylayan" : "Yanıtlayan"}</dt><dd>{addendum.responder_name || "—"}</dd>
            <dt>Tarih ve saat</dt><dd>{formatDateTime(addendum.responded_at)}</dd>
            <dt>IP adresi</dt><dd>{addendum.responder_ip || "Kayıt bulunamadı"}</dd>
            <dt>Cihaz / tarayıcı</dt><dd>{summarizeUserAgent(addendum.responder_user_agent) || "Kayıt bulunamadı"}</dd>
          </dl>
        </div> : null}
        {addendum.status === "sent"
          ? (!print && renderActions ? renderActions(addendum) : <div className="ad-esign ad-esign-pending">Müşteri onayı bekleniyor</div>)
          : null}
      </article>;
    })}
  </section>;
}
