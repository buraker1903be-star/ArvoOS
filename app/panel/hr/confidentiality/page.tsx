import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../hr.css";
import "./style.css";

type Agreement = { id:string; agreement_no:string; employee_id:string; status:string; created_at:string; signed_at:string|null; signer_name:string|null };
type Employee = { id:string; full_name:string; job_title:string|null; email:string|null };

export default async function ConfidentialityArchivePage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module)=>module.code==="hr") || !["owner","admin","manager"].includes(membership.role)) throw new Error("Bu gizli arşivi görüntüleme yetkiniz yok.");
  const [{data:agreementData,error},{data:employeeData}] = await Promise.all([
    supabase.from("hr_confidentiality_agreements").select("id,agreement_no,employee_id,status,created_at,signed_at,signer_name").eq("organization_id",membership.organization_id).order("created_at",{ascending:false}),
    supabase.from("hr_employees").select("id,full_name,job_title,email").eq("organization_id",membership.organization_id),
  ]);
  if (error) throw new Error("Gizlilik sözleşmeleri okunamadı: "+error.message);
  const agreements=(agreementData??[]) as Agreement[];
  const employees=new Map(((employeeData??[]) as Employee[]).map((employee)=>[employee.id,employee]));
  const signed=agreements.filter((item)=>item.status==="signed").length;
  const date=(value:string|null)=>value?new Date(value).toLocaleString("tr-TR"):"—";

  return <div className="hr-page">
    <div className="panel-pagehead"><div><small className="panel-kicker">İNSAN KAYNAKLARI / GİZLİ ARŞİV</small><h1>Gizlilik Sözleşmeleri</h1><p>Personel sözleşmeleri yalnızca yetkili yöneticilere gösterilir.</p></div><div className="panel-page-actions"><Link className="panel-secondary" href="/panel/hr">← Personellere Dön</Link></div></div>
    <section className="hr-metrics"><article><small>TOPLAM</small><strong>{agreements.length}</strong><span>Hazırlanan sözleşme</span></article><article><small>İMZALANDI</small><strong>{signed}</strong><span>Güvenli arşivde</span></article><article><small>BEKLİYOR</small><strong>{agreements.length-signed}</strong><span>Personel onayı bekleniyor</span></article></section>
    <section className="panel-card confidentiality-table"><table><thead><tr><th>Belge No</th><th>Personel</th><th>Durum</th><th>Hazırlanma</th><th>İmza</th><th></th></tr></thead><tbody>{agreements.map((agreement)=>{const employee=employees.get(agreement.employee_id);return <tr key={agreement.id}><td><b>{agreement.agreement_no}</b></td><td><b>{employee?.full_name||"Personel"}</b><br/><small>{employee?.job_title||employee?.email||""}</small></td><td><span className="status-pill">{agreement.status==="signed"?"İmzalandı":agreement.status==="revoked"?"İptal":"İmza Bekliyor"}</span></td><td>{date(agreement.created_at)}</td><td>{date(agreement.signed_at)}</td><td><Link className="panel-secondary" href={`/panel/confidentiality/${agreement.id}`}>Belgeyi Aç</Link></td></tr>})}</tbody></table>{!agreements.length?<p className="panel-empty">Henüz gizlilik sözleşmesi oluşturulmadı. Yeni personel kaydıyla otomatik hazırlanır.</p>:null}</section>
  </div>;
}
