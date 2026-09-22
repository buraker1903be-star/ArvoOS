import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { buildAccrualRows } from "@/lib/commission-accruals";
import { employeeLedger, ledgerTotals, type CommissionPayment } from "@/lib/commission-ledger";
import type { RateHistoryRow } from "@/lib/commission-allocation";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { HrIcon, initials } from "../hr-icons";
import { HrTabs, canSeeCommissions } from "../hr-tabs";
import { primOdemesiKaydet, primOdemesiSil } from "./actions";
import "../hr.css";
import "./prim-hesabi.css";

/*
  Prim cari hesabı. "Prim Hesaplama" dönemsel bakar (bu ay ne hak edildi);
  burası bakiye bakar (kime ne kadar borcumuz kaldı) — cari hesaplarla aynı
  okuma biçimi.

  Tahakkuk hesabı iki ekranda ortak (lib/commission-accruals.ts); burada
  dönem süzgeci yok, bakiye tüm geçmişi kapsar.
*/

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const dateText = (value: string) => new Date(`${value}T00:00:00+03:00`).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" });

type Employee = { id: string; full_name: string; job_title: string | null; employment_status: string; commission_rate: number };

export default async function PrimHesabiPage({ searchParams }: { searchParams: Promise<{ personel?: string }> }) {
  const { supabase, membership, modules, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const access = { membership, isPlatformOwner };
  if (!canSeeCommissions(access)) throw new Error("Prim hesaplarını görüntüleme yetkiniz yok.");
  const canManage = ["owner", "admin"].includes(membership.role);

  const orgId = membership.organization_id;
  const [employeeResult, opportunityResult, contractResult, operationResult, collectionResult, rateResult, paymentResult] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,employment_status,commission_rate").eq("organization_id", orgId).order("full_name"),
    supabase.from("crm_opportunities").select("id,customer_name,assigned_employee_id").eq("organization_id", orgId),
    supabase.from("crm_contracts").select("id,contract_no,opportunity_id,party_id,amount,signed_at,created_at").eq("organization_id", orgId).in("status", ["signed", "completed"]),
    supabase.from("hr_operation_commissions").select("id,employee_id,workflow_id,contract_id,base_amount,commission_rate,commission_amount,status,accrued_at").eq("organization_id", orgId).neq("status", "cancelled"),
    supabase.from("account_entries").select("id,party_id,entry_type,amount,transaction_date").eq("organization_id", orgId).or("and(entry_type.eq.credit,source_type.eq.payment),and(entry_type.eq.debit,source_type.eq.adjustment)"),
    supabase.from("hr_employee_commission_rates").select("employee_id,commission_rate,valid_from").eq("organization_id", orgId),
    supabase.from("hr_commission_payments").select("id,employee_id,amount,paid_on,method,note").eq("organization_id", orgId).order("paid_on", { ascending: false }),
  ]);
  if (employeeResult.error) throw new Error("Personeller okunamadı: " + employeeResult.error.message);
  if (paymentResult.error) throw new Error("Prim ödemeleri okunamadı: " + paymentResult.error.message);

  const employees = (employeeResult.data ?? []) as Employee[];
  const accruals = buildAccrualRows({
    employees,
    opportunities: opportunityResult.data ?? [],
    contracts: contractResult.data ?? [],
    operations: operationResult.data ?? [],
    collections: collectionResult.data ?? [],
    rateHistory: (rateResult.data ?? []) as RateHistoryRow[],
  });
  const payments: CommissionPayment[] = (paymentResult.data ?? []).map((row) => ({
    id: row.id as string, employeeId: row.employee_id as string, amount: Number(row.amount),
    paidOn: row.paid_on as string, method: row.method as string, note: (row.note as string | null) ?? null,
  }));

  const hesaplar = employees
    .map((employee) => ({ employee, ...ledgerTotals(employee.id, accruals, payments) }))
    .filter((item) => item.accrued !== 0 || item.paid !== 0)
    .sort((a, b) => b.balance - a.balance);

  const { personel } = await searchParams;
  const secili = hesaplar.find((item) => item.employee.id === personel) ?? hesaplar[0] ?? null;
  const hareketler = secili ? employeeLedger(secili.employee.id, accruals, payments).reverse() : [];

  const borcToplam = hesaplar.reduce((sum, item) => sum + Math.max(0, item.balance), 0);
  const odenenToplam = hesaplar.reduce((sum, item) => sum + item.paid, 0);

  return (
    <div className="hr-page">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Prim Hesabı</h1></div>
      </div>
      <HrTabs active="prim-hesabi" access={access} />

      <p className="hr-note">
        Hak edilen primler ile yapılan ödemelerin cari hesabı. Prim, müşteriden <b>tahsilat yapıldıkça</b> hak edilir;
        tahsil edilmemiş satıştan prim doğmaz. Ödemeyi tek tek prim satırına bağlamazsınız — tutarı yazarsınız, bakiye kendini kapatır.
      </p>

      <div className="pr-widgets">
        <div className="pr-widget"><small>Ödenecek prim</small><strong>{money(borcToplam)}</strong><span>{hesaplar.filter((item) => item.balance > 0).length} personel</span></div>
        <div className="pr-widget"><small>Bugüne kadar ödenen</small><strong>{money(odenenToplam)}</strong><span>{payments.length} ödeme</span></div>
      </div>

      {!hesaplar.length ? (
        <div className="hr-empty-state">
          <span className="hr-empty-icon"><HrIcon name="wallet" size={24} /></span>
          <p>Henüz prim tahakkuku yok. Müşteriden tahsilat yapıldığında ya da bir iş tamamlandığında burada görünür.</p>
        </div>
      ) : (
        <div className="pr-layout">
          <nav className="pr-list" aria-label="Personeller">
            {hesaplar.map((item) => (
              <Link key={item.employee.id} href={`/panel/hr/prim-hesabi?personel=${item.employee.id}`} aria-current={secili?.employee.id === item.employee.id}>
                <span className="hr-avatar is-sm" aria-hidden="true">{initials(item.employee.full_name)}</span>
                <span className="pr-list-text">
                  <b>{item.employee.full_name}</b>
                  <small>{item.employee.job_title || "Personel"}</small>
                </span>
                <span className={`pr-list-balance${item.balance > 0 ? " is-due" : ""}`}>{money(item.balance)}</span>
              </Link>
            ))}
          </nav>

          {secili ? (
            <section className="pr-detail">
              <header className="pr-detail-head">
                <div>
                  <h2>{secili.employee.full_name}</h2>
                  <small>{secili.employee.job_title || "Personel"} · prim oranı %{secili.employee.commission_rate}</small>
                </div>
                <dl className="pr-totals">
                  <div><dt>Hak edilen</dt><dd>{money(secili.accrued)}</dd></div>
                  <div><dt>Ödenen</dt><dd>{money(secili.paid)}</dd></div>
                  <div className={secili.balance > 0 ? "is-due" : ""}><dt>Bakiye</dt><dd>{money(secili.balance)}</dd></div>
                </dl>
              </header>

              {secili.balance < 0 ? (
                <p className="hr-note is-warning">Bu personele hak ettiğinden <b>{money(-secili.balance)}</b> fazla ödenmiş görünüyor. Sonraki primlerden mahsup edilecektir.</p>
              ) : null}

              {canManage ? (
                <form className="pr-form" action={primOdemesiKaydet}>
                  <input type="hidden" name="employee_id" value={secili.employee.id} />
                  <label>Tutar<input name="amount" inputMode="decimal" required placeholder={secili.balance > 0 ? String(Math.round(secili.balance / 100)) : "0"} autoComplete="off" /></label>
                  <label>Tarih<input name="paid_on" type="date" required defaultValue={todayInIstanbul()} /></label>
                  <label>Yöntem
                    <select name="method" defaultValue="havale">
                      <option value="havale">Havale / EFT</option>
                      <option value="nakit">Nakit</option>
                      <option value="mahsup">Mahsup</option>
                      <option value="diger">Diğer</option>
                    </select>
                  </label>
                  <label className="is-wide">Açıklama<input name="note" maxLength={300} placeholder="Eylül primi" autoComplete="off" /></label>
                  <button className="panel-primary" type="submit">Ödemeyi kaydet</button>
                </form>
              ) : null}

              <div className="hr-table-wrap">
                <table className="hr-table pr-table">
                  <thead>
                    <tr><th>Tarih</th><th>Hareket</th><th className="is-num">Hak ediş</th><th className="is-num">Ödeme</th><th className="is-num">Bakiye</th>{canManage ? <th /> : null}</tr>
                  </thead>
                  <tbody>
                    {hareketler.map((hareket) => (
                      <tr key={hareket.id}>
                        <td>{dateText(hareket.date)}</td>
                        <td className="is-lead"><b>{hareket.title}</b><small>{hareket.detail}</small></td>
                        <td className="is-num">{hareket.accrual ? money(hareket.accrual) : "—"}</td>
                        <td className="is-num">{hareket.payment ? money(hareket.payment) : "—"}</td>
                        <td className="is-num">{money(hareket.balance)}</td>
                        {canManage ? (
                          <td className="is-num">
                            {hareket.kind === "payment" ? (
                              <form action={primOdemesiSil}>
                                <input type="hidden" name="id" value={hareket.id} />
                                <button className="kucuk-dugme" type="submit" title="Ödemeyi sil">Sil</button>
                              </form>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
