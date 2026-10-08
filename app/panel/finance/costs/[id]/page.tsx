import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { PanelDrawer } from "../../../components/panel-drawer";
import { addContractCostItem, deleteContractCostItem, updateContractCostItem } from "../../actions";
import { FinIcon, initials } from "../../finance-ui";
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
  const {id}=await params;const {supabase,membership,modules,izin}=await getPanelContext();
  if(!modules.some(module=>module.code==="finance")||!izin("finance.maliyet.yonet"))throw new Error("İş maliyetlerini görüntüleme yetkiniz yok.");
  const [{data:contract,error},{data:items,error:itemError},{data:employees},{data:workflow}]=await Promise.all([supabase.from("crm_contracts").select("id,contract_no,title,amount,currency,status,workflow_id,crm_opportunities(customer_name,assigned_employee_id)").eq("id",id).eq("organization_id",membership.organization_id).maybeSingle(),supabase.from("contract_cost_items").select("id,category,description,supplier,amount,cost_date,status,reference_no,created_at").eq("contract_id",id).eq("organization_id",membership.organization_id).order("cost_date",{ascending:false}),supabase.from("hr_employees").select("id,full_name").eq("organization_id",membership.organization_id),supabase.from("operation_workflows").select("id,assigned_employee_id").eq("contract_id",id).eq("organization_id",membership.organization_id).maybeSingle()]);
  if(error)throw new Error("Sözleşme okunamadı: "+error.message);if(itemError)throw new Error("Maliyet hareketleri okunamadı: "+itemError.message);if(!contract)notFound();
  const customer=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;const employeeMap=new Map((employees??[]).map(employee=>[employee.id,employee.full_name]));const salesRepresentative=customer?.assigned_employee_id?employeeMap.get(customer.assigned_employee_id)||"Pasif personel":"Atanmamış";const operationRepresentative=workflow?.assigned_employee_id?employeeMap.get(workflow.assigned_employee_id)||"Pasif personel":"Atanmamış";const total=(items??[]).reduce((sum,item)=>sum+Number(item.amount),0);const paid=(items??[]).filter(item=>item.status==="paid").reduce((sum,item)=>sum+Number(item.amount),0);const profit=Number(contract.amount)-total;const margin=Number(contract.amount)?profit/Number(contract.amount)*100:0;
  return (
    <main className="fin talep cari">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">FİNANS · İŞ MALİYETİ</small>
          <h1>{contract.contract_no}</h1>
          <p>{customer?.customer_name||contract.title} · {contract.title}</p>
        </div>
        <div className="talep-bas-eylem">
          <Link className="panel-secondary" href="/panel/finance?gorunum=maliyet"><FinIcon name="back" size={16}/>İş maliyetleri</Link>
        </div>
      </header>

      {/* Özet şeridi panelin diğer detay ekranlarıyla aynı: rakamlar tek
          satırda. Eskiden dört büyük kutu ekranın yarısını kaplıyordu. */}
      <nav className="kayit-serit talep-serit" aria-label="İş maliyeti özeti">
        <dl>
          <div><dt>Sözleşme tutarı</dt><dd>{money(Number(contract.amount),contract.currency)}</dd></div>
          <div><dt>Maliyet toplamı</dt><dd>{money(total,contract.currency)}</dd></div>
          <div className="cari-bakiye" data-tone={profit>=0?"success":"warning"}><dt>Toplam kâr</dt><dd>{money(profit,contract.currency)}</dd></div>
          <div><dt>Kâr oranı</dt><dd>%{margin.toFixed(1)}</dd></div>
          <div><dt>Ödenen</dt><dd>{money(paid,contract.currency)}</dd></div>
        </dl>
      </nav>

      <div className="talep-izgara maliyet-izgara">
      <section className="panel-card talep-bilgi" aria-label="Maliyet kalemi ekle">
        <h2>Maliyet kalemi ekle</h2>
        <p className="talep-not">Bu işe bağlı planlanan ya da ödenen bir gideri kaydedin.</p>
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
      </section>

      <section className="panel-card talep-bilgi" aria-label="Maliyet hareketleri">
        <div className="ekip-suzgec talep-suzgec">
          <span className="talep-suzgec-etiket">Maliyet hareketleri</span>
          <span className="status-pill">{items?.length||0} hareket</span>
        </div>
        {items?.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table">
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Kategori / Açıklama</th>
                  <th scope="col">Sağlayıcı</th>
                  <th scope="col">Referans</th>
                  <th scope="col">Durum</th>
                  <th scope="col" className="crm-col-amount">Tutar</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item=>(
                  <tr key={item.id}>
                    <td data-label="Tarih">{date(item.cost_date)}</td>
                    <td data-label="Kategori"><span className="crm-table-title">{item.category}</span><span className="crm-table-sub">{item.description}</span></td>
                    <td data-label="Sağlayıcı">{item.supplier||<span className="talep-bos">—</span>}</td>
                    <td data-label="Referans">{item.reference_no||<span className="talep-bos">—</span>}</td>
                    <td data-label="Durum"><span className="status-pill" data-tone={statusTone(item.status)}>{item.status==="paid"?"Ödendi":"Planlandı"}</span></td>
                    <td className="crm-table-mono" data-label="Tutar">{money(Number(item.amount),contract.currency)}</td>
                    <td className="crm-table-actions maliyet-eylem">
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
                <tr className="maliyet-toplam">
                  <td colSpan={5}>Toplam maliyet · {money(paid,contract.currency)} ödendi</td>
                  <td className="crm-table-mono"><b>{money(total,contract.currency)}</b></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <p>Henüz maliyet hareketi yok</p>
            <small>Soldaki formla bu işe ilk maliyet kalemini ekleyin.</small>
          </div>
        )}
      </section>
      </div>

      {/* Sorumlular artık özet şeridinin altında değil, kendi küçük
          kartında: iki satırlık bilgi için tam genişlikte bir bölüm
          ayırmak ekranı uzatıyordu. */}
      <section className="panel-card maliyet-sorumlular" aria-label="Sorumlular">
        <PersonCard label="Satış temsilcisi" name={salesRepresentative}/>
        <PersonCard label="Operasyon sorumlusu" name={operationRepresentative}/>
      </section>
    </main>
  );
}
