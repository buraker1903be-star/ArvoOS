import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { PanelDrawer } from "../../../components/panel-drawer";
import { addContractCostItem, deleteContractCostItem, updateContractCostItem } from "../../actions";
import { FinEmpty, FinIcon, FinWidget, initials } from "../../finance-ui";
import "../../finance.css";

const money=(amount:number,currency="TRY")=>new Intl.NumberFormat("tr-TR",{style:"currency",currency}).format(amount/100);
const date=(value:string)=>new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR");
// Zamana bağlı yardımcı (bileşen gövdesinde saat okunmaz)
const todayIso=()=>new Date().toISOString().slice(0,10);

function PersonCard({label,name}:{label:string;name:string}){
  const empty=name==="Atanmamış";
  return <article className={empty?"fin-person-card is-empty":"fin-person-card"}><i aria-hidden="true">{empty?"—":initials(name)}</i><span><small>{label}</small><strong>{name}</strong></span></article>;
}

export default async function ContractCostDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const {supabase,membership,modules}=await getPanelContext();
  if(!modules.some(module=>module.code==="finance")||!["owner","admin"].includes(membership.role))throw new Error("İş maliyetlerini görüntüleme yetkiniz yok.");
  const [{data:contract,error},{data:items,error:itemError},{data:employees},{data:workflow}]=await Promise.all([supabase.from("crm_contracts").select("id,contract_no,title,amount,currency,status,workflow_id,crm_opportunities(customer_name,assigned_employee_id)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle(),supabase.from("contract_cost_items").select("id,category,description,supplier,amount,cost_date,status,reference_no,created_at").eq("contract_id",id).eq("organization_id",membership.organization_id).order("cost_date",{ascending:false}),supabase.from("hr_employees").select("id,full_name").eq("organization_id",membership.organization_id),supabase.from("operation_workflows").select("id,assigned_employee_id").eq("contract_id",id).eq("organization_id",membership.organization_id).maybeSingle()]);
  if(error)throw new Error("Sözleşme okunamadı: "+error.message);if(itemError)throw new Error("Maliyet hareketleri okunamadı: "+itemError.message);if(!contract)notFound();
  const customer=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;const employeeMap=new Map((employees??[]).map(employee=>[employee.id,employee.full_name]));const salesRepresentative=customer?.assigned_employee_id?employeeMap.get(customer.assigned_employee_id)||"Pasif personel":"Atanmamış";const operationRepresentative=workflow?.assigned_employee_id?employeeMap.get(workflow.assigned_employee_id)||"Pasif personel":"Atanmamış";const total=(items??[]).reduce((sum,item)=>sum+Number(item.amount),0);const paid=(items??[]).filter(item=>item.status==="paid").reduce((sum,item)=>sum+Number(item.amount),0);const profit=Number(contract.amount)-total;const margin=Number(contract.amount)?profit/Number(contract.amount)*100:0;
  return (
    <main className="fin">
      <header className="panel-pagehead">
        <div>
          <small className="panel-kicker">FİNANS · İŞ MALİYETİ</small>
          <h1>{contract.contract_no}</h1>
          <p>{customer?.customer_name||contract.title} · {contract.title}</p>
        </div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel/finance?gorunum=maliyet"><FinIcon name="back" size={16}/>İş maliyetleri</Link>
        </div>
      </header>

      <section className="fin-widgets" aria-label="İş maliyeti özeti">
        <FinWidget tone="brand" icon="briefcase" label="Sözleşme tutarı" value={money(Number(contract.amount),contract.currency)} note="Toplam iş bedeli"/>
        <FinWidget tone="warning" icon="receipt" label="Maliyet toplamı" value={money(total,contract.currency)} note={`${money(paid,contract.currency)} ödendi`}/>
        <FinWidget tone={profit>=0?"success":"danger"} icon="trend" label="Toplam kâr" value={money(profit,contract.currency)} note="Brüt iş kârı" emphasis/>
        <FinWidget tone={margin>=30?"success":margin>=0?"gold":"danger"} icon="percent" label="Kâr oranı" value={`%${margin.toFixed(1)}`} note="Sözleşme bedeline göre"/>
      </section>

      <section className="fin-people" aria-label="Sorumlular">
        <PersonCard label="Satış temsilcisi" name={salesRepresentative}/>
        <PersonCard label="Operasyon sorumlusu" name={operationRepresentative}/>
      </section>

      <section className="fin-card" aria-label="Maliyet kalemi ekle">
        <header className="fin-card-head">
          <div>
            <h2>Maliyet kalemi ekle</h2>
            <p>Bu işe bağlı planlanan ya da ödenen bir gideri kaydedin.</p>
          </div>
        </header>
        <div className="fin-card-body">
          <form className="panel-form fin-form fin-form-grid" action={addContractCostItem}>
            <input type="hidden" name="contract_id" value={contract.id}/>
            <label>Kategori<select name="category"><option>Dış hizmet</option><option>Personel</option><option>Yazılım / Lisans</option><option>Belge / Resmî gider</option><option>Diğer</option></select></label>
            <label className="fin-span-2">Açıklama<input name="description" minLength={2} maxLength={300} required placeholder="Örn. çeviri hizmeti"/></label>
            <label>Hizmet sağlayıcı<input name="supplier" maxLength={180}/></label>
            <label>Tutar (₺)<input name="amount" type="number" min="0.01" step="0.01" required/></label>
            <label>Tarih<input name="cost_date" type="date" defaultValue={todayIso()} required/></label>
            <label>Durum<select name="status"><option value="planned">Planlandı</option><option value="paid">Ödendi</option></select></label>
            <label>Belge / Referans<input name="reference_no" maxLength={120}/></label>
            <div className="fin-form-actions"><button className="panel-primary">Maliyet kalemi ekle</button></div>
          </form>
        </div>
      </section>

      <section className="fin-card" aria-label="Maliyet hareketleri">
        <header className="fin-card-head">
          <div>
            <h2>Maliyet hareketleri</h2>
            <p>Bu işe kaydedilen tüm giderler, en yenisi üstte.</p>
          </div>
          <span className="status-pill">{items?.length||0} hareket</span>
        </header>
        {items?.length ? (
          <div className="fin-table-wrap">
            <table className="fin-table" data-cols="movements">
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Kategori / Açıklama</th>
                  <th scope="col">Sağlayıcı</th>
                  <th scope="col">Referans</th>
                  <th scope="col">Durum</th>
                  <th scope="col" className="fin-num">Tutar</th>
                  <th scope="col"><span className="fin-sr">İşlemler</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item=>(
                  <tr key={item.id}>
                    <td data-label="Tarih">{date(item.cost_date)}</td>
                    <td className="fin-col-main"><span className="fin-entity-text"><b>{item.category}</b><small>{item.description}</small></span></td>
                    <td className={item.supplier?undefined:"fin-muted"} data-label="Sağlayıcı">{item.supplier||"—"}</td>
                    <td className={item.reference_no?undefined:"fin-muted"} data-label="Referans">{item.reference_no||"—"}</td>
                    <td data-label="Durum"><span className="status-pill" data-tone={statusTone(item.status)}>{item.status==="paid"?"Ödendi":"Planlandı"}</span></td>
                    <td className="fin-num" data-label="Tutar">{money(Number(item.amount),contract.currency)}</td>
                    <td className="fin-col-actions">
                      <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="MALİYET KALEMİ" title="Maliyet kalemini düzenle" description={`${item.category} · ${money(Number(item.amount),contract.currency)}`}>
                        <form className="panel-form fin-form" action={updateContractCostItem}>
                          <input type="hidden" name="item_id" value={item.id}/>
                          <input type="hidden" name="contract_id" value={contract.id}/>
                          <label>Kategori<input name="category" defaultValue={item.category} required/></label>
                          <label>Açıklama<input name="description" defaultValue={item.description} required/></label>
                          <label>Sağlayıcı<input name="supplier" defaultValue={item.supplier||""}/></label>
                          <label>Tutar (₺)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={Number(item.amount)/100} required/></label>
                          <label>Tarih<input name="cost_date" type="date" defaultValue={item.cost_date} required/></label>
                          <label>Durum<select name="status" defaultValue={item.status}><option value="planned">Planlandı</option><option value="paid">Ödendi</option></select></label>
                          <label className="wide">Referans<input name="reference_no" defaultValue={item.reference_no||""}/></label>
                          <div className="panel-form-actions wide"><button className="panel-primary">Değişiklikleri kaydet</button></div>
                        </form>
                      </PanelDrawer>
                      <form action={deleteContractCostItem}>
                        <input type="hidden" name="item_id" value={item.id}/>
                        <input type="hidden" name="contract_id" value={contract.id}/>
                        <button className="panel-danger">Sil</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fin-foot"><span>Toplam maliyet · {money(paid,contract.currency)} ödendi</span><strong>{money(total,contract.currency)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <FinEmpty icon="receipt" title="Henüz maliyet hareketi yok">Yukarıdaki formla bu işe ilk maliyet kalemini ekleyin.</FinEmpty>
        )}
      </section>
    </main>
  );
}
