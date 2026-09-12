import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { allocateCollections } from "@/lib/commission-allocation";
import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import "./commissions.css";

type SearchParams = Promise<{ donem?: string; baslangic?: string; bitis?: string; personel?: string }>;
type Employee = { id: string; full_name: string; job_title: string | null; employment_status: string; commission_rate: number; operation_commission_rate: number };
type Opportunity = { id: string; customer_name: string; assigned_employee_id: string | null };
type Contract = { id: string; contract_no: string; opportunity_id: string; party_id: string | null; amount: number; currency: string; signed_at: string | null; status: string; created_at: string };
type Collection = { id: string; party_id: string | null; entry_type: string; amount: number; transaction_date: string };
type OperationCommission = { id: string; employee_id: string; workflow_id: string; contract_id: string | null; base_amount: number; commission_rate: number; commission_amount: number; status: string; accrued_at: string };

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const shortMoney = (value: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100) + " ₺";
const dateText = (value: string) => new Date(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });

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

export default async function CommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = params.donem || "bu-ay";
  const { start, end, startKey, endKey } = dateRange(period, params.baslangic, params.bitis);
  const { supabase, membership, modules, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  if (!isPlatformOwner && !["owner", "admin", "manager"].includes(membership.role)) throw new Error("Prim hesaplarını görüntüleme yetkiniz yok.");

  const orgId = membership.organization_id;
  const [{ data: employeeData, error: employeeError }, { data: opportunityData, error: opportunityError }, { data: contractData, error: contractError }, { data: operationData, error: operationError }, { data: collectionData, error: collectionError }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,employment_status,commission_rate,operation_commission_rate").eq("organization_id", orgId).order("full_name"),
    supabase.from("crm_opportunities").select("id,customer_name,assigned_employee_id").eq("organization_id", orgId),
    supabase.from("crm_contracts").select("id,contract_no,opportunity_id,party_id,amount,currency,signed_at,status,created_at").eq("organization_id", orgId).in("status", ["signed", "completed"]).order("created_at", { ascending: false }),
    supabase.from("hr_operation_commissions").select("id,employee_id,workflow_id,contract_id,base_amount,commission_rate,commission_amount,status,accrued_at").eq("organization_id", orgId).gte("accrued_at", start.toISOString()).lt("accrued_at", end.toISOString()).neq("status", "cancelled"),
    // Dağıtım tüm geçmişe göre yapıldığı için dönem filtresi dağıtımdan sonra
    // uygulanıyor. Yalnızca gerçek ödemeler (payment) ve iadeler (adjustment
    // borç kaydı) sayılır; manuel/düzeltme alacakları prim matrahı değildir.
    supabase.from("account_entries").select("id,party_id,entry_type,amount,transaction_date").eq("organization_id", orgId).or("and(entry_type.eq.credit,source_type.eq.payment),and(entry_type.eq.debit,source_type.eq.adjustment)"),
  ]);
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
      if (!employee || Number(employee.commission_rate) <= 0 || (selectedEmployee && employee.id !== selectedEmployee)) return [];
      const amount = Math.round(piece.amount * Number(employee.commission_rate) / 100);
      return [{ id: `sale-${piece.eventId}-${piece.contractId}-${piece.amount < 0 ? "iade" : "odeme"}`, type: "Satış", employee, customer: opportunity?.customer_name || "Müşteri", reference: piece.amount < 0 ? `${contract.contract_no} · iade` : contract.contract_no, base: piece.amount, rate: Number(employee.commission_rate), amount, date: piece.date, status: "accrued" }];
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
      <article className="sales"><small>SATIŞ PRİMİ</small><strong>{money(salesTotal)}</strong><span>{salesRows.length} tahsilat üzerinden</span></article>
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
        <p>Satış primi yalnızca müşteriden gerçekleşen tahsilat üzerinden hesaplanıyor.</p>
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
