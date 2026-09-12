import Link from "next/link";
import type { CSSProperties } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { allocateCollections, rateAt, type RateHistoryRow } from "@/lib/commission-allocation";
import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import { HrIcon, initials } from "../hr-icons";
import "../hr.css";
import "./commissions.css";

type SearchParams = Promise<{ donem?: string; baslangic?: string; bitis?: string; personel?: string }>;
type Employee = { id: string; full_name: string; job_title: string | null; employment_status: string; commission_rate: number; operation_commission_rate: number };
type Opportunity = { id: string; customer_name: string; assigned_employee_id: string | null };
type Contract = { id: string; contract_no: string; opportunity_id: string; party_id: string | null; amount: number; currency: string; signed_at: string | null; status: string; created_at: string };
type Collection = { id: string; party_id: string | null; entry_type: string; amount: number; transaction_date: string };
type OperationCommission = { id: string; employee_id: string; workflow_id: string; contract_id: string | null; base_amount: number; commission_rate: number; commission_amount: number; status: string; accrued_at: string };
type Tone = "info" | "gold" | "success" | "warning" | "brand";

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
const dateText = (value: string) => new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" });
const periodNames: Record<string, string> = { "bu-ay": "Bu ay", "gecen-ay": "Geçen ay", "bu-yil": "Bu yıl", ozel: "Özel tarih" };
const statusNames: Record<string, string> = { paid: "Ödendi", approved: "Onaylandı" };

// Dönem sınırları Türkiye takvimine göre ("YYYY-MM-DD", bitiş hariç).
// Eskiden sunucu (UTC) saatiyle hesaplanıyordu; ayın 1'inde 00:00–03:00
// arasında hak edilen prim önceki aya düşüyordu.
function dateRange(period: string, customStart?: string, customEnd?: string) {
  const [year, month] = todayInIstanbul().split("-").map(Number);
  let startKey = monthStartKey(year, month);
  let endKey = monthStartKey(year, month + 1);
  if (period === "gecen-ay") { startKey = monthStartKey(year, month - 1); endKey = monthStartKey(year, month); }
  if (period === "bu-yil") { startKey = monthStartKey(year, 1); endKey = monthStartKey(year + 1, 1); }
  const validKey = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (period === "ozel" && validKey(customStart) && validKey(customEnd) && customStart! <= customEnd!) {
    startKey = customStart!;
    endKey = new Date(Date.parse(`${customEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return { startKey, endKey, start: istanbulMidnight(startKey), end: istanbulMidnight(endKey) };
}

// "1 Eylül 2026 – 30 Eylül 2026" (bitiş anahtarı hariç olduğu için bir gün geri)
function periodLabel(startKey: string, endKey: string) {
  const format = (ms: number) => new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
  const first = Date.parse(`${startKey}T00:00:00Z`);
  const last = Date.parse(`${endKey}T00:00:00Z`) - 86_400_000;
  return first >= last ? format(first) : `${format(first)} – ${format(last)}`;
}

export default async function CommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = params.donem || "bu-ay";
  const { start, end, startKey, endKey } = dateRange(period, params.baslangic, params.bitis);
  const { supabase, membership, modules, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  if (!isPlatformOwner && !["owner", "admin", "manager"].includes(membership.role)) throw new Error("Prim hesaplarını görüntüleme yetkiniz yok.");

  const orgId = membership.organization_id;
  const [{ data: employeeData, error: employeeError }, { data: opportunityData, error: opportunityError }, { data: contractData, error: contractError }, { data: operationData, error: operationError }, { data: collectionData, error: collectionError }, { data: rateHistoryData }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,employment_status,commission_rate,operation_commission_rate").eq("organization_id", orgId).order("full_name"),
    supabase.from("crm_opportunities").select("id,customer_name,assigned_employee_id").eq("organization_id", orgId),
    supabase.from("crm_contracts").select("id,contract_no,opportunity_id,party_id,amount,currency,signed_at,status,created_at").eq("organization_id", orgId).in("status", ["signed", "completed"]).order("created_at", { ascending: false }),
    supabase.from("hr_operation_commissions").select("id,employee_id,workflow_id,contract_id,base_amount,commission_rate,commission_amount,status,accrued_at").eq("organization_id", orgId).gte("accrued_at", start.toISOString()).lt("accrued_at", end.toISOString()).neq("status", "cancelled"),
    // Dağıtım tüm geçmişe göre yapıldığı için dönem filtresi dağıtımdan sonra
    // uygulanıyor. Yalnızca gerçek ödemeler (payment) ve iadeler (adjustment
    // borç kaydı) sayılır; manuel/düzeltme alacakları prim matrahı değildir.
    supabase.from("account_entries").select("id,party_id,entry_type,amount,transaction_date").eq("organization_id", orgId).or("and(entry_type.eq.credit,source_type.eq.payment),and(entry_type.eq.debit,source_type.eq.adjustment)"),
    // Oran geçmişi okunamazsa (tablo henüz yoksa) bugünkü oranla devam edilir.
    supabase.from("hr_employee_commission_rates").select("employee_id,commission_rate,valid_from").eq("organization_id", orgId),
  ]);
  const rateHistory = (rateHistoryData ?? []) as RateHistoryRow[];
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (opportunityError) throw new Error("Satış kayıtları okunamadı: " + opportunityError.message);
  if (contractError) throw new Error("Sözleşmeler okunamadı: " + contractError.message);
  if (operationError) throw new Error("Operasyon primleri okunamadı: " + operationError.message);
  if (collectionError) throw new Error("Tahsilatlar okunamadı: " + collectionError.message);

  const employees = (employeeData ?? []) as Employee[];
  const opportunities = (opportunityData ?? []) as Opportunity[];
  const contracts = (contractData ?? []) as Contract[];
  const operations = (operationData ?? []) as OperationCommission[];
  const collections = (collectionData ?? []) as Collection[];
  const employeeMap = new Map(employees.map((item) => [item.id, item]));
  const opportunityMap = new Map(opportunities.map((item) => [item.id, item]));
  const contractMap = new Map(contracts.map((item) => [item.id, item]));
  const selectedEmployee = params.personel || "";
  const periodStart = startKey;
  const periodEnd = endKey;

  // Her müşterinin ödemeleri sözleşmelerine eskiden yeniye dağıtılır ve her
  // parça o sözleşmenin satışçısına yazılır (lib/commission-allocation).
  const contractsByParty = new Map<string, Contract[]>();
  for (const contract of contracts) {
    if (!contract.party_id) continue;
    contractsByParty.set(contract.party_id, [...(contractsByParty.get(contract.party_id) ?? []), contract]);
  }
  const collectionsByParty = new Map<string, Collection[]>();
  for (const collection of collections) {
    if (!collection.party_id) continue;
    collectionsByParty.set(collection.party_id, [...(collectionsByParty.get(collection.party_id) ?? []), collection]);
  }

  const salesRows = [...collectionsByParty].flatMap(([partyId, partyCollections]) => {
    const pieces = allocateCollections(
      (contractsByParty.get(partyId) ?? []).map((contract) => ({ id: contract.id, amount: Number(contract.amount), order: contract.signed_at ?? contract.created_at })),
      partyCollections.map((collection) => ({ id: collection.id, kind: collection.entry_type === "credit" ? "payment" as const : "refund" as const, amount: Number(collection.amount), date: collection.transaction_date })),
    );
    return pieces.filter((piece) => piece.date >= periodStart && piece.date < periodEnd).flatMap((piece) => {
      const contract = contractMap.get(piece.contractId);
      if (!contract) return [];
      const opportunity = opportunityMap.get(contract.opportunity_id);
      const employee = opportunity?.assigned_employee_id ? employeeMap.get(opportunity.assigned_employee_id) : undefined;
      if (!employee || (selectedEmployee && employee.id !== selectedEmployee)) return [];
      // Tahsilat tarihinde geçerli oran; sonradan yapılan oran değişikliği
      // geçmiş tahsilatları etkilemez.
      const rate = rateAt(rateHistory, employee.id, piece.date, Number(employee.commission_rate));
      if (rate <= 0) return [];
      const amount = Math.round(piece.amount * rate / 100);
      return [{ id: `sale-${piece.eventId}-${piece.contractId}-${piece.amount < 0 ? "iade" : "odeme"}`, type: "Satış", employee, customer: opportunity?.customer_name || "Müşteri", reference: piece.amount < 0 ? `${contract.contract_no} · iade` : contract.contract_no, base: piece.amount, rate, amount, date: piece.date, status: "accrued" }];
    });
  });
  const operationRows = operations.flatMap((item) => {
    const employee = employeeMap.get(item.employee_id);
    if (!employee || (selectedEmployee && employee.id !== selectedEmployee)) return [];
    const contract = item.contract_id ? contractMap.get(item.contract_id) : undefined;
    const opportunity = contract ? opportunityMap.get(contract.opportunity_id) : undefined;
    return [{ id: `operation-${item.id}`, type: "Operasyon", employee, customer: opportunity?.customer_name || "Tamamlanan iş", reference: contract?.contract_no || `İş ${item.workflow_id.slice(0, 8)}`, base: Number(item.base_amount), rate: Number(item.commission_rate), amount: Number(item.commission_amount), date: item.accrued_at, status: item.status }];
  });
  const rows = [...salesRows, ...operationRows].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const salesTotal = salesRows.reduce((sum, item) => sum + item.amount, 0);
  const operationTotal = operationRows.reduce((sum, item) => sum + item.amount, 0);
  const grandTotal = salesTotal + operationTotal;
  const paidTotal = rows.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);
  const pendingTotal = grandTotal - paidTotal;
  const personTotals = employees.map((employee) => {
    const personRows = rows.filter((item) => item.employee.id === employee.id);
    return { employee, sales: personRows.filter((item) => item.type === "Satış").reduce((sum, item) => sum + item.amount, 0), operations: personRows.filter((item) => item.type === "Operasyon").reduce((sum, item) => sum + item.amount, 0), count: personRows.length };
  }).filter((item) => item.count > 0).sort((a, b) => (b.sales + b.operations) - (a.sales + a.operations));
  const chartMax = Math.max(1, ...personTotals.map((item) => item.sales + item.operations));
  const selectedName = selectedEmployee ? employeeMap.get(selectedEmployee)?.full_name : undefined;

  const widgets: { label: string; value: string; note: string; icon: string; tone: Tone }[] = [
    { label: "Satış primi", value: money(salesTotal), note: `${salesRows.length} tahsilat üzerinden`, icon: "spark", tone: "gold" },
    { label: "Operasyon primi", value: money(operationTotal), note: `${operationRows.length} tamamlanan iş`, icon: "briefcase", tone: "info" },
    { label: "Toplam hak ediş", value: money(grandTotal), note: "Satış + operasyon", icon: "sum", tone: "brand" },
    { label: "Bekleyen ödeme", value: money(pendingTotal), note: "Henüz ödenmemiş prim", icon: "hourglass", tone: "warning" },
  ];
  const barWidth = (value: number) => ({ "--w": `${Math.max(0, value) / chartMax * 100}%` } as CSSProperties);

  return <div className="hr-page hr-cm">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Prim Hesaplama</h1><p>Satış ve operasyon hak edişlerini personel ve dönem bazında takip edin.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/hr">← Personellere Dön</Link></div>
    </div>

    <section className="hr-card hr-cm-filter" aria-label="Dönem ve personel filtresi">
      <div className="hr-cm-filter-head">
        <span className="hr-cm-period"><i><HrIcon name="clock" size={16} /></i><span><b>{periodNames[period] ?? "Dönem"}</b><small>{periodLabel(startKey, endKey)}{selectedName ? ` · ${selectedName}` : " · Tüm personeller"}</small></span></span>
      </div>
      <form className="hr-form hr-cm-filter-form" method="get">
        <label><span>Dönem</span><select name="donem" defaultValue={period}><option value="bu-ay">Bu Ay</option><option value="gecen-ay">Geçen Ay</option><option value="bu-yil">Bu Yıl</option><option value="ozel">Özel Tarih</option></select></label>
        <label><span>Başlangıç <small>(özel tarih)</small></span><input type="date" name="baslangic" defaultValue={params.baslangic || ""} /></label>
        <label><span>Bitiş <small>(özel tarih)</small></span><input type="date" name="bitis" defaultValue={params.bitis || ""} /></label>
        <label><span>Personel</span><select name="personel" defaultValue={selectedEmployee}><option value="">Tüm personeller</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
        <div className="hr-cm-filter-actions"><button className="panel-primary" type="submit">Hesapla</button><Link className="panel-secondary" href="/panel/hr/commissions">Temizle</Link></div>
      </form>
    </section>

    <section className="hr-widgets" aria-label="Dönem özeti">
      {widgets.map((widget) => (
        <article className="hr-widget is-money" data-tone={widget.tone} key={widget.label}>
          <span className="hr-widget-icon"><HrIcon name={widget.icon} /></span>
          <small>{widget.label}</small>
          <strong>{widget.value}</strong>
          <span className="hr-widget-note">{widget.note}</span>
        </article>
      ))}
    </section>

    <section className="hr-cm-grid">
      <article className="hr-card">
        <header className="hr-card-head">
          <div><h2>Prim dağılımı</h2><p>Personel karşılaştırması</p></div>
          <span className="hr-cm-legend"><span><i className="is-sale" />Satış</span><span><i className="is-op" />Operasyon</span></span>
        </header>
        {personTotals.length ? <ul className="hr-cm-bars">
          {personTotals.map(({ employee, sales, operations }) => (
            <li className="hr-cm-bar" key={employee.id}>
              <span className="hr-avatar is-sm" aria-hidden="true">{initials(employee.full_name)}</span>
              <div className="hr-cm-bar-body">
                <div className="hr-cm-bar-top"><b>{employee.full_name}</b><span>{money(sales + operations)}</span></div>
                <div className="hr-cm-track" role="img" aria-label={`Satış primi ${money(sales)}, operasyon primi ${money(operations)}`}>
                  <span className="is-sale" style={barWidth(sales)} />
                  <span className="is-op" style={barWidth(operations)} />
                </div>
              </div>
            </li>
          ))}
        </ul> : <div className="hr-empty-state is-compact">
          <span className="hr-empty-icon"><HrIcon name="wallet" size={20} /></span>
          <p>Seçilen dönemde hesaplanmış prim bulunmuyor.</p>
        </div>}
      </article>

      <aside className="hr-card">
        <header className="hr-card-head"><div><h2>Dönem analizi</h2><p>Yönetici özeti</p></div></header>
        <dl className="hr-info-list">
          <div><dt>Prim alan personel</dt><dd>{personTotals.length} kişi</dd></div>
          <div><dt>Ödenen prim</dt><dd>{money(paidTotal)}</dd></div>
          <div><dt>Bekleyen prim</dt><dd>{money(pendingTotal)}</dd></div>
          {personTotals[0] ? <div><dt>En yüksek hak ediş</dt><dd>{personTotals[0].employee.full_name}<small>{money(personTotals[0].sales + personTotals[0].operations)}</small></dd></div> : null}
        </dl>
        <p className="hr-note">Satış primi yalnızca müşteriden gerçekleşen tahsilat üzerinden, tahsilat tarihindeki oranla hesaplanır.</p>
      </aside>
    </section>

    <section className="hr-card is-table">
      <header className="hr-card-head"><div><h2>Prim hareketleri</h2><p>Hak ediş detayı</p></div><span className="hr-count">{rows.length}</span></header>
      <div className="hr-table-wrap">
        <table className="hr-table hr-cm-table">
          <thead><tr><th>Tarih</th><th>Personel</th><th>Prim türü</th><th>Müşteri / İş</th><th className="is-num">Matrah</th><th className="is-num">Oran</th><th className="is-num">Hak ediş</th><th>Durum</th></tr></thead>
          <tbody>
            {rows.map((item) => <tr key={item.id}>
              <td data-label="Tarih" className="is-nowrap">{dateText(item.date)}</td>
              <td className="is-lead"><span className="hr-table-person"><span className="hr-avatar is-sm" aria-hidden="true">{initials(item.employee.full_name)}</span><span><b>{item.employee.full_name}</b><small>{item.employee.job_title || "Personel"}</small></span></span></td>
              <td data-label="Prim türü"><span className="status-pill" data-tone={item.type === "Satış" ? "gold" : "info"}>{item.type}</span></td>
              <td data-label="Müşteri / İş"><span><b>{item.customer}</b><small>{item.reference}</small></span></td>
              <td data-label="Matrah" className="is-num">{money(item.base)}</td>
              <td data-label="Oran" className="is-num">%{percent(item.rate)}</td>
              <td data-label="Hak ediş" className="is-num"><strong>{money(item.amount)}</strong></td>
              <td data-label="Durum"><span className="status-pill" data-tone={statusTone(item.status)}>{statusNames[item.status] ?? "Hak edildi"}</span></td>
            </tr>)}
            {!rows.length ? <tr><td colSpan={8} className="hr-table-empty"><div className="hr-empty-state">
              <span className="hr-empty-icon"><HrIcon name="wallet" size={24} /></span>
              <h3>Prim hareketi yok</h3>
              <p>Seçilen dönemde prim hareketi bulunmuyor. Farklı bir dönem ya da personel seçmeyi deneyin.</p>
            </div></td></tr> : null}
          </tbody>
          {rows.length ? <tfoot><tr><td colSpan={6}>Dönem toplamı · {rows.length} kayıt</td><td className="is-num"><strong>{money(grandTotal)}</strong></td><td /></tr></tfoot> : null}
        </table>
      </div>
    </section>
  </div>;
}
