import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { PanelDrawer } from "../components/panel-drawer";
import {
  createAdditionalService,
  createCollection,
  createRefund,
} from "../accounts/actions";
import { PaytrWorkspace, ProfitabilityWorkspace, type PaymentRow, type ProfitRow } from "./finance-workspaces";
import { FinEmpty, FinIcon, FinWidget } from "./finance-ui";
import { FinanceTabs } from "./finance-navigation";
import { buildAccountBalances } from "./account-balances";
import "./finance.css";

const money = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    n / 100,
  );
type Entry = {
  id: string;
  entry_type: "debit" | "credit";
  amount: number;
  description: string;
  reference_no: string | null;
  source_type: string | null;
  transaction_date: string;
};
type Party = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_number: string | null;
  account_entries: Entry[];
};
type Contract = {
  id: string;
  party_id: string | null;
  amount: number;
  status: string;
  contract_no: string;
  title: string;
  currency: string;
  service_cost: number;
  service_cost_supplier: string | null;
  service_cost_reference: string | null;
  service_cost_status: string;
  payment_plan_id: string | null;
  workflow_id:string|null;
  signed_at:string|null;
  created_at:string;
  crm_opportunities: { customer_name: string; contact_phone:string|null;contact_email:string|null;assigned_employee_id:string|null } | { customer_name: string;contact_phone:string|null;contact_email:string|null;assigned_employee_id:string|null }[] | null;
};
type Installment={id:string;payment_plan_id:string;installment_no:number;due_date:string|null;amount:number;status:string;payment_url:string|null;notice_sent_at:string|null;reminder_sent_at:string|null};
type CostItem={contract_id:string;amount:number;status:string};

const pageCopy = {
  cari: { title: "Cari Hesaplar", text: "Sözleşme borçları, tahsilatlar ve iadeler tek ekranda." },
  paytr: { title: "PAYTR Tahsilatları", text: "Ödeme bağlantılarını yönetin, müşteriye iletin ve gecikmeleri takip edin." },
  maliyet: { title: "İş Maliyetleri", text: "Sözleşme bazında maliyet, kâr ve kâr oranı." },
} as const;

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ arama?: string; durum?: string; gorunum?: string }>;
}) {
  const params = await searchParams;
  const { supabase, membership, modules, organization, hiddenModuleKeys } = await getPanelContext();
  if (
    !modules.some((m) => m.code === "finance") ||
    !modules.some((m) => m.code === "accounts")
  )
    throw new Error("Finans ve cari hesap modülü erişimi gerekli.");
  const [{ data, error }, { data: contractData, error: contractError }, { data: installmentData, error: installmentError }, {data:costItemData,error:costItemError},{data:employeeData},{data:workflowData}] =
    await Promise.all([
      supabase
        .from("account_parties")
        .select(
          "id,name,email,phone,tax_number,account_entries(id,entry_type,amount,description,reference_no,source_type,transaction_date)",
        )
        .eq("organization_id", membership.organization_id)
        .eq("is_active", true)
        .in("party_type", ["customer", "both"])
        .order("name"),
      supabase
        .from("crm_contracts")
        .select("id,party_id,amount,status,contract_no,title,currency,payment_plan_id,workflow_id,signed_at,created_at,service_cost,service_cost_supplier,service_cost_reference,service_cost_status,crm_opportunities(customer_name,contact_phone,contact_email,assigned_employee_id)")
        .eq("organization_id", membership.organization_id)
        .in("status", ["signed", "completed"]),
      supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status,payment_url,notice_sent_at,reminder_sent_at").eq("organization_id",membership.organization_id).order("due_date"),
      supabase.from("contract_cost_items").select("contract_id,amount,status").eq("organization_id",membership.organization_id),
      supabase.from("hr_employees").select("id,full_name").eq("organization_id",membership.organization_id),
      supabase.from("operation_workflows").select("id,assigned_employee_id").eq("organization_id",membership.organization_id),
    ]);
  if (error) throw new Error("Cari hesaplar okunamadı: " + error.message);
  if (contractError)
    throw new Error("Sözleşme bakiyeleri okunamadı: " + contractError.message);
  if(installmentError) throw new Error("Ödeme taksitleri okunamadı: "+installmentError.message);
  if(costItemError&&["owner","admin"].includes(membership.role))throw new Error("İş maliyetleri okunamadı: "+costItemError.message);
  const contracts = (contractData ?? []) as unknown as Contract[];
  // Cari bakiyeleri: Finans genel bakışla aynı kural (account-balances.ts)
  const { accounts, totals } = buildAccountBalances((data ?? []) as Party[], contracts);
  const query = (params.arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const filtered = accounts.filter(
    (a) =>
      (!query ||
        [a.name, a.email, a.phone, a.tax_number]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR")
          .includes(query)) &&
      (params.durum === "acik"
        ? a.balance > 0
        : params.durum === "kapali"
          ? a.balance === 0
          : true),
  );
  const canManageCosts = ["owner", "admin"].includes(membership.role);
  const totalServiceCost = contracts.reduce((sum, contract) => sum + Number(contract.service_cost || 0), 0);
  const costItems=(costItemData??[]) as CostItem[];const costTotals=new Map<string,number>();for(const item of costItems)costTotals.set(item.contract_id,(costTotals.get(item.contract_id)??0)+Number(item.amount));
  const installments=(installmentData??[]) as Installment[];
  const employeeMap=new Map((employeeData??[]).map(employee=>[employee.id,employee.full_name]));const workflowMap=new Map((workflowData??[]).map(workflow=>[workflow.id,workflow.assigned_employee_id]));
  const mode=params.gorunum==="paytr"?"paytr":params.gorunum==="maliyet"&&canManageCosts?"maliyet":"cari";
  const today=todayInIstanbul(); const brandName=organization.display_name||organization.name||"ArvoOS";
  const profitRows:ProfitRow[]=contracts.map(contract=>{const relation=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;const cost=costTotals.get(contract.id)??Number(contract.service_cost);const profit=Number(contract.amount)-cost;const operationEmployeeId=contract.workflow_id?workflowMap.get(contract.workflow_id):null;return{id:contract.id,contractNo:contract.contract_no,customer:relation?.customer_name||contract.title,title:contract.title,sales:relation?.assigned_employee_id?employeeMap.get(relation.assigned_employee_id)||"Pasif personel":"Atanmamış",operation:operationEmployeeId?employeeMap.get(operationEmployeeId)||"Pasif personel":"Atanmamış",amount:Number(contract.amount),cost,profit,margin:Number(contract.amount)?profit/Number(contract.amount)*100:0,date:(contract.signed_at||contract.created_at).slice(0,10)}});
  const paymentRows:PaymentRow[]=contracts.flatMap(contract=>{const customer=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;return installments.filter(item=>item.payment_plan_id===contract.payment_plan_id).map(item=>{const overdue=item.status!=="paid"&&Boolean(item.due_date&&item.due_date<today);const link=item.payment_url;const message=overdue?`Sayın ${customer?.customer_name||"Müşterimiz"},\n\n${contract.contract_no} numaralı sözleşmenize ait ${money(item.amount)} tutarındaki ödemenizin vadesi dolmuştur.\n\nÖdeme bağlantısı:\n${link||""}\n\nÖdeme yaptıysanız bu mesajı dikkate almayınız.\n\nSaygılarımızla,\n${brandName}`:`Sayın ${customer?.customer_name||"Müşterimiz"},\n\n${contract.contract_no} numaralı sözleşmenize ait ${money(item.amount)} tutarındaki ödemenizi aşağıdaki bağlantıdan tamamlayabilirsiniz:\n${link||""}\n\nSaygılarımızla,\n${brandName}`;const phone=String(customer?.contact_phone||"").replace(/\D/g,"").replace(/^0/,"90");return{id:item.id,contractId:contract.id,contractNo:contract.contract_no,installmentNo:item.installment_no,customer:customer?.customer_name||contract.title,amount:Number(item.amount),dueDate:item.due_date,status:item.status,paymentUrl:link,overdue,whatsappUrl:link&&phone?`https://wa.me/${phone}?text=${encodeURIComponent(message)}`:null,emailUrl:link&&customer?.contact_email?`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(`${contract.contract_no} ödeme bilgilendirmesi`)}&body=${encodeURIComponent(message)}`:null}})});

  // İş maliyetleri özeti (yalnızca gösterim; değerler tablodakiyle aynı kuralla)
  const contractSum = contracts.reduce((s, c) => s + Number(c.amount), 0);
  const profitSum = contracts.reduce((s, c) => s + Number(c.amount) - (costTotals.get(c.id) ?? Number(c.service_cost)), 0);
  const averageMargin = Math.round(contracts.reduce((s, c) => s + (Number(c.amount) ? ((Number(c.amount) - (costTotals.get(c.id) ?? Number(c.service_cost))) / Number(c.amount)) * 100 : 0), 0) / (contracts.length || 1));
  const openCount = accounts.filter((a) => a.balance > 0).length;
  const isFiltered = Boolean(query) || params.durum === "acik" || params.durum === "kapali";
  const copy = pageCopy[mode];

  return (
    <main className="fin">
      <header className="panel-pagehead">
        <div>
          <small className="panel-kicker">FİNANS</small>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </div>
      </header>
      <FinanceTabs active={mode} context={{ membership, modules, hiddenModuleKeys }} />

      {mode === "cari" ? (
        <>
          <section className="fin-widgets" aria-label="Cari hesap özeti">
            <FinWidget tone="brand" icon="doc" label="Sözleşme toplamı" value={money(totals.debt)} note="İmzalı sözleşmelerden oluşan borç" />
            <FinWidget tone="success" icon="wallet" label="Toplam tahsilat" value={money(totals.collections)} note="Müşterilerden alınan" />
            <FinWidget tone="warning" icon="refund" label="Toplam iade" value={money(totals.refunds)} note="Müşteriye geri ödenen" />
            <FinWidget tone="gold" icon="scale" label="Açık bakiye" value={money(totals.balance)} note={openCount ? `${openCount} caride tahsilat bekliyor` : "Tüm cariler kapalı"} emphasis />
          </section>

          <section className="fin-card" aria-label="Müşteri carileri">
            <header className="fin-card-head">
              <div>
                <h2>Müşteri carileri</h2>
                <p>Müşteri adına dokunarak hareket dökümünü açın.</p>
              </div>
              <span className="status-pill">{filtered.length} cari</span>
            </header>
            <form className="fin-toolbar" role="search">
              <label className="fin-field is-grow">
                <span>Ara</span>
                <span className="fin-search">
                  <FinIcon name="search" size={16} />
                  <input
                    name="arama"
                    defaultValue={params.arama}
                    placeholder="Müşteri, telefon veya vergi no"
                  />
                </span>
              </label>
              <label className="fin-field is-fixed">
                <span>Durum</span>
                <select name="durum" defaultValue={params.durum ?? "tumu"}>
                  <option value="tumu">Tüm cariler</option>
                  <option value="acik">Açık bakiyesi olanlar</option>
                  <option value="kapali">Bakiyesi kapananlar</option>
                </select>
              </label>
              <button className="panel-secondary">Filtrele</button>
            </form>
            {filtered.length ? (
              <div className="fin-table-wrap">
                <table className="fin-table" data-cols="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Müşteri</th>
                      <th scope="col" className="fin-num">Sözleşme</th>
                      <th scope="col" className="fin-num">Tahsilat</th>
                      <th scope="col" className="fin-num">İade</th>
                      <th scope="col" className="fin-num">Kalan bakiye</th>
                      <th scope="col"><span className="fin-sr">İşlemler</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id}>
                        <td className="fin-col-main">
                          <Link className="fin-entity" href={`/panel/accounts/${a.id}`}>
                            <span className="fin-avatar" aria-hidden="true">
                              {a.name.slice(0, 2).toLocaleUpperCase("tr-TR")}
                            </span>
                            <span className="fin-entity-text">
                              <b>{a.name}</b>
                              <small>{a.phone || a.email || a.tax_number || "Müşteri cari hesabı"}</small>
                            </span>
                          </Link>
                        </td>
                        <td className={a.debt ? "fin-num" : "fin-num is-zero"} data-label="Sözleşme">{money(a.debt)}</td>
                        <td className={a.collections ? "fin-num fin-pos" : "fin-num is-zero"} data-label="Tahsilat">{money(a.collections)}</td>
                        <td className={a.refunds ? "fin-num fin-warn" : "fin-num is-zero"} data-label="İade">{money(a.refunds)}</td>
                        <td className="fin-num" data-label="Kalan bakiye">
                          <span className="fin-balance">
                            <strong>{money(a.balance)}</strong>
                            <span className="status-pill" data-tone={a.balance > 0 ? "warning" : "success"}>
                              {a.balance > 0 ? "Tahsilat bekliyor" : "Kapandı"}
                            </span>
                          </span>
                        </td>
                        <td className="fin-col-actions">
                          <PanelDrawer
                            triggerLabel="+ Tahsilat"
                            kicker="TAHSİLAT"
                            title={`${a.name} · Tahsilat`}
                            description={`Açık bakiye: ${money(a.balance)}`}
                          >
                            <form className="panel-form fin-form" action={createCollection}>
                              <input type="hidden" name="party_id" value={a.id} />
                              <label>
                                Tahsilat tutarı (₺)
                                <input
                                  name="amount"
                                  type="number"
                                  min="0.01"
                                  max={a.balance / 100}
                                  step="0.01"
                                  required
                                />
                              </label>
                              <label>
                                Tarih
                                <input name="transaction_date" type="date" />
                              </label>
                              <label>
                                Referans / dekont no
                                <input name="reference_no" maxLength={100} />
                              </label>
                              <label className="wide">
                                Açıklama
                                <input
                                  name="description"
                                  defaultValue="Müşteri tahsilatı"
                                  minLength={2}
                                  maxLength={500}
                                  required
                                />
                              </label>
                              <p className="fin-form-note">
                                {a.balance === 0
                                  ? "Bu carinin açık bakiyesi yok; yeni tahsilat kaydedilemez."
                                  : `En fazla açık bakiye kadar (${money(a.balance)}) tahsilat kaydedebilirsiniz.`}
                              </p>
                              <div className="panel-form-actions wide">
                                <button
                                  className="panel-primary"
                                  disabled={a.balance === 0}
                                >
                                  Tahsilatı kaydet
                                </button>
                              </div>
                            </form>
                          </PanelDrawer>
                          <PanelDrawer
                            triggerLabel="Ek hizmet"
                            triggerClassName="panel-secondary"
                            kicker="EK HİZMET"
                            title={`${a.name} · Ek Hizmet`}
                            description="Yeni hizmeti cari bakiyeye ekleyin."
                          >
                            <form className="panel-form fin-form" action={createAdditionalService}>
                              <input type="hidden" name="party_id" value={a.id} />
                              <label>
                                Hizmet tutarı (₺)
                                <input
                                  name="amount"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  required
                                />
                              </label>
                              <label>
                                İşlem tarihi
                                <input name="transaction_date" type="date" />
                              </label>
                              <label>
                                Vade tarihi
                                <input name="due_date" type="date" />
                              </label>
                              <label>
                                Referans
                                <input name="reference_no" maxLength={100} />
                              </label>
                              <label className="wide">
                                Hizmet açıklaması
                                <input
                                  name="description"
                                  minLength={2}
                                  maxLength={500}
                                  required
                                />
                              </label>
                              <div className="panel-form-actions wide">
                                <button className="panel-primary">Cari hesaba ekle</button>
                              </div>
                            </form>
                          </PanelDrawer>
                          <PanelDrawer
                            triggerLabel="İade"
                            triggerClassName="panel-secondary"
                            kicker="İADE"
                            title={`${a.name} · İade`}
                            description={`İade edilebilir: ${money(Math.max(0, a.collections - a.refunds))}`}
                          >
                            <form className="panel-form fin-form" action={createRefund}>
                              <input type="hidden" name="party_id" value={a.id} />
                              <label>
                                İade tutarı (₺)
                                <input
                                  name="amount"
                                  type="number"
                                  min="0.01"
                                  max={Math.max(0, a.collections - a.refunds) / 100}
                                  step="0.01"
                                  required
                                />
                              </label>
                              <label>
                                Tarih
                                <input name="transaction_date" type="date" />
                              </label>
                              <label>
                                Referans / dekont no
                                <input name="reference_no" maxLength={100} />
                              </label>
                              <label className="wide">
                                İade nedeni
                                <input
                                  name="description"
                                  minLength={2}
                                  maxLength={500}
                                  required
                                />
                              </label>
                              {a.collections <= a.refunds ? (
                                <p className="fin-form-note">İade edilebilecek tahsilat yok.</p>
                              ) : null}
                              <div className="panel-form-actions wide">
                                <button
                                  className="panel-primary"
                                  disabled={a.collections <= a.refunds}
                                >
                                  İadeyi kaydet
                                </button>
                              </div>
                            </form>
                          </PanelDrawer>
                          <Link
                            className="fin-link"
                            href={`/panel/accounts/${a.id}`}
                          >
                            Hareketler
                            <FinIcon name="chevron" size={15} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <FinEmpty icon={isFiltered ? "search" : "users"} title={isFiltered ? "Aramaya uygun cari yok" : "Henüz müşteri carisi yok"}>
                {isFiltered
                  ? "Arama veya durum filtresini değiştirip yeniden deneyin."
                  : "Bir sözleşme imzalandığında müşterinin cari hesabı burada oluşur."}
              </FinEmpty>
            )}
          </section>
        </>
      ) : null}

      {mode === "paytr" ? <PaytrWorkspace rows={paymentRows} /> : null}

      {mode === "maliyet" && canManageCosts ? (
        <>
          <section className="fin-widgets" aria-label="İş maliyetleri özeti">
            <FinWidget tone="brand" icon="briefcase" label="Toplam sözleşme" value={money(contractSum)} note={`${contracts.length} iş`} />
            <FinWidget tone="warning" icon="receipt" label="Maliyet toplamı" value={money(totalServiceCost)} note="İşlere bağlı giderler" />
            <FinWidget tone={profitSum >= 0 ? "success" : "danger"} icon="trend" label="Toplam kâr" value={money(profitSum)} note="Brüt iş kârlılığı" emphasis />
            <FinWidget tone="gold" icon="percent" label="Ortalama kâr oranı" value={`%${averageMargin}`} note="Sözleşme bazında" />
          </section>
          <ProfitabilityWorkspace rows={profitRows} />
        </>
      ) : null}
    </main>
  );
}
