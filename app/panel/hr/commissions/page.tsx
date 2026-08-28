import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "./commissions.css";

type SearchParams = Promise<{ donem?: string; baslangic?: string; bitis?: string; personel?: string }>;
type Employee = { id: string; full_name: string; job_title: string | null; employment_status: string; commission_rate: number; operation_commission_rate: number };
type Opportunity = { id: string; customer_name: string; assigned_employee_id: string | null };
type Contract = { id: string; contract_no: string; opportunity_id: string; amount: number; currency: string; signed_at: string | null; status: string };
type OperationCommission = { id: string; employee_id: string; workflow_id: string; contract_id: string | null; base_amount: number; commission_rate: number; commission_amount: number; status: string; accrued_at: string };

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const shortMoney = (value: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100) + " ₺";
const dateText = (value: string) => new Date(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });

function dateRange(period: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (period === "gecen-ay") { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 1); }
  if (period === "bu-yil") { start = new Date(now.getFullYear(), 0, 1); end = new Date(now.getFullYear() + 1, 0, 1); }
  if (period === "ozel" && customStart && customEnd) { start = new Date(`${customStart}T00:00:00`); end = new Date(`${customEnd}T00:00:00`); end.setDate(end.getDate() + 1); }
  return { start, end };
}

export default async function CommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = params.donem || "bu-ay";
  const { start, end } = dateRange(period, params.baslangic, params.bitis);
  const { supabase, membership, modules, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  if (!isPlatformOwner && !["owner", "admin", "manager"].includes(membership.role)) throw new Error("Prim hesaplarını görüntüleme yetkiniz yok.");

  const orgId = membership.organization_id;
  const [{ data: employeeData, error: employeeError }, { data: opportunityData, error: opportunityError }, { data: contractData, error: contractError }, { data: operationData, error: operationError }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,employment_status,commission_rate,operation_commission_rate").eq("organization_id", orgId).order("full_name"),
    supabase.from("crm_opportunities").select("id,customer_name,assigned_employee_id").eq("organization_id", orgId),
    supabase.from("crm_contracts").select("id,contract_no,opportunity_id,amount,currency,signed_at,status").eq("organization_id", orgId).not("signed_at", "is", null).gte("signed_at", start.toISOString()).lt("signed_at", end.toISOString()),
    supabase.from("hr_operation_commissions").select("id,employee_id,workflow_id,contract_id,base_amount,commission_rate,commission_amount,status,accrued_at").eq("organization_id", orgId).gte("accrued_at", start.toISOString()).lt("accrued_at", end.toISOString()).neq("status", "cancelled"),
  ]);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (opportunityError) throw new Error("Satış kayıtları okunamadı: " + opportunityError.message);
  if (contractError) throw new Error("Sözleşmeler okunamadı: " + contractError.message);
  if (operationError) throw new Error("Operasyon primleri okunamadı: " + operationError.message);

  const employees = (employeeData ?? []) as Employee[];
  const opportunities = (opportunityData ?? []) as Opportunity[];
  const contracts = (contractData ?? []) as Contract[];
  const operations = (operationData ?? []) as OperationCommission[];
  const employeeMap = new Map(employees.map((item) => [item.id, item]));
  const opportunityMap = new Map(opportunities.map((item) => [item.id, item]));
  const contractMap = new Map(contracts.map((item) => [item.id, item]));
  const selectedEmployee = params.personel || "";

  const salesRows = contracts.flatMap((contract) => {
    const opportunity = opportunityMap.get(contract.opportunity_id);
    const employee = opportunity?.assigned_employee_id ? employeeMap.get(opportunity.assigned_employee_id) : undefined;
    if (!employee || Number(employee.commission_rate) <= 0 || (selectedEmployee && employee.id !== selectedEmployee)) return [];
    const amount = Math.round(Number(contract.amount) * Number(employee.commission_rate) / 100);
    return [{ id: `sale-${contract.id}`, type: "Satış", employee, customer: opportunity?.customer_name || "Müşteri", reference: contract.contract_no, base: Number(contract.amount), rate: Number(employee.commission_rate), amount, date: contract.signed_at!, status: "accrued" }];
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

  return <div className="commission-page">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Prim Hesaplama</h1><p>Satış ve operasyon hak edişlerini personel ve dönem bazında takip edin.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/hr">← Personellere dön</Link></div>
    </div>

    <section className="panel-card commission-filter">
      <form method="get">
        <label><span>Dönem</span><select name="donem" defaultValue={period}><option value="bu-ay">Bu Ay</option><option value="gecen-ay">Geçen Ay</option><option value="bu-yil">Bu Yıl</option><option value="ozel">Özel Tarih</option></select></label>
        <label><span>Başlangıç</span><input type="date" name="baslangic" defaultValue={params.baslangic || ""} /></label>
        <label><span>Bitiş</span><input type="date" name="bitis" defaultValue={params.bitis || ""} /></label>
        <label><span>Personel</span><select name="personel" defaultValue={selectedEmployee}><option value="">Tüm personeller</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
        <div><button className="panel-primary">Hesapla</button><Link className="panel-secondary" href="/panel/hr/commissions">Temizle</Link></div>
      </form>
    </section>

    <section className="commission-metrics">
      <article className="sales"><small>SATIŞ PRİMİ</small><strong>{money(salesTotal)}</strong><span>{salesRows.length} satış hak edişi</span></article>
      <article className="operations"><small>OPERASYON PRİMİ</small><strong>{money(operationTotal)}</strong><span>{operationRows.length} tamamlanan iş</span></article>
      <article><small>TOPLAM HAK EDİŞ</small><strong>{money(grandTotal)}</strong><span>Satış + operasyon</span></article>
      <article><small>BEKLEYEN ÖDEME</small><strong>{money(pendingTotal)}</strong><span>Ödenmemiş prim toplamı</span></article>
    </section>

    <section className="commission-grid">
      <article className="panel-card commission-chart">
        <div className="panel-card-head"><div><small>PERSONEL KARŞILAŞTIRMASI</small><h2>Prim Dağılımı</h2></div><span className="commission-legend"><i /> Satış <i /> Operasyon</span></div>
        <div className="commission-bars">{personTotals.map(({ employee, sales, operations }) => <div className="commission-bar-row" key={employee.id}><div><b>{employee.full_name}</b><small>{money(sales + operations)}</small></div><div className="commission-track"><span className="sale-bar" style={{ width: `${sales / chartMax * 100}%` }} /><span className="operation-bar" style={{ width: `${operations / chartMax * 100}%` }} /></div></div>)}{!personTotals.length ? <p className="panel-empty">Seçilen dönemde hesaplanmış prim bulunmuyor.</p> : null}</div>
      </article>
      <aside className="panel-card commission-summary">
        <div className="panel-card-head"><div><small>YÖNETİCİ ÖZETİ</small><h2>Dönem Analizi</h2></div></div>
        <p><b>{personTotals.length}</b> personel bu dönemde prim hak etti.</p>
        <p>Toplam primin <b>%{grandTotal ? Math.round(salesTotal / grandTotal * 100) : 0}</b> kadarı satıştan oluşuyor.</p>
        <p>Ödenen prim <b>{money(paidTotal)}</b>, bekleyen prim <b>{money(pendingTotal)}</b>.</p>
        {personTotals[0] ? <p>En yüksek hak ediş <b>{personTotals[0].employee.full_name}</b>: {money(personTotals[0].sales + personTotals[0].operations)}.</p> : null}
      </aside>
    </section>

    <section className="panel-card commission-table-card">
      <div className="panel-card-head"><div><small>HAK EDİŞ DETAYI</small><h2>Prim Hareketleri</h2></div><span>{rows.length} kayıt</span></div>
      <div className="commission-table-wrap"><table><thead><tr><th>Tarih</th><th>Personel</th><th>Prim Türü</th><th>Müşteri / İş</th><th>Matrah</th><th>Oran</th><th>Hak Ediş</th><th>Durum</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td>{dateText(item.date)}</td><td><b>{item.employee.full_name}</b><small>{item.employee.job_title || "Personel"}</small></td><td><span className={`commission-type ${item.type === "Satış" ? "sale" : "operation"}`}>{item.type}</span></td><td><b>{item.customer}</b><small>{item.reference}</small></td><td>{money(item.base)}</td><td>%{item.rate}</td><td><strong>{money(item.amount)}</strong></td><td><span className={`commission-status ${item.status}`}>{item.status === "paid" ? "Ödendi" : item.status === "approved" ? "Onaylandı" : "Hak edildi"}</span></td></tr>)}{!rows.length ? <tr><td colSpan={8} className="panel-empty">Seçilen dönemde prim hareketi bulunmuyor.</td></tr> : null}</tbody></table></div>
      {rows.length ? <div className="commission-mobile-total"><span>Dönem toplamı</span><strong>{shortMoney(grandTotal)}</strong></div> : null}
    </section>
  </div>;
}
