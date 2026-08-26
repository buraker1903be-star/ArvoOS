import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfidentialitySignatureForm } from "./signature-form";
import "./style.css";

type Agreement = { id:string; organization_id:string; employee_id:string; agreement_no:string; content_snapshot:string; status:string; signer_name:string|null; signature_path:string|null; signed_at:string|null; created_at:string; hr_employees: { full_name:string; user_id:string|null; job_title:string|null } | { full_name:string; user_id:string|null; job_title:string|null }[] };

export default async function ConfidentialityAgreementPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{signed?:string}> }) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, userId, membership, organization } = await getPanelContext();
  const { data } = await supabase.from("hr_confidentiality_agreements").select("id,organization_id,employee_id,agreement_no,content_snapshot,status,signer_name,signature_path,signed_at,created_at,hr_employees!inner(full_name,user_id,job_title)").eq("id",id).maybeSingle();
  if (!data) notFound();
  const agreement = data as unknown as Agreement;
  const employee = Array.isArray(agreement.hr_employees) ? agreement.hr_employees[0] : agreement.hr_employees;
  const isManager = agreement.organization_id === membership.organization_id && ["owner","admin","manager"].includes(membership.role);
  const isEmployee = employee.user_id === userId;
  if (!isManager && !isEmployee) notFound();

  let signatureUrl: string | null = null;
  if (isManager && agreement.signature_path) {
    const { data: signedFile } = await supabase.storage.from("hr-confidentiality-signatures").createSignedUrl(agreement.signature_path, 300);
    signatureUrl = signedFile?.signedUrl || null;
  }
  const date = (value:string|null) => value ? new Date(value).toLocaleString("tr-TR") : "—";

  return <div className="nda-page">
    <div className="panel-pagehead"><div><small className="panel-kicker">GİZLİ PERSONEL BELGESİ</small><h1>Gizlilik ve Sır Saklama Sözleşmesi</h1><p>{agreement.agreement_no} · {employee.full_name}</p></div>{isManager?<Link className="panel-secondary" href="/panel/hr/confidentiality">← Arşive Dön</Link>:null}</div>
    {query.signed ? <div className="nda-success">✓ Sözleşmeniz güvenli biçimde imzalandı ve yönetici arşivine kaydedildi.</div> : null}
    <article className="panel-card nda-document">
      <header><div><small>KURUM</small><strong>{organization.name}</strong></div><div><small>PERSONEL</small><strong>{employee.full_name}</strong><span>{employee.job_title || "Personel"}</span></div><div><small>DURUM</small><strong>{agreement.status === "signed" ? "İmzalandı" : "İmza Bekliyor"}</strong></div></header>
      <pre>{agreement.content_snapshot}</pre>
      {agreement.status === "signed" ? <section className="nda-signed"><div><small>İMZALAYAN</small><strong>{agreement.signer_name}</strong><span>{date(agreement.signed_at)}</span></div>{signatureUrl?<img src={signatureUrl} alt={`${employee.full_name} imzası`}/>:null}</section> : null}
    </article>
    {agreement.status === "pending" && isEmployee ? <section className="panel-card nda-sign-card"><h2>Elektronik imza</h2><p>Metni okuduktan sonra adınızı doğrulayın ve imzanızı çizerek onaylayın.</p><ConfidentialitySignatureForm agreementId={agreement.id} defaultName={employee.full_name}/></section> : null}
    {agreement.status === "pending" && isManager && !isEmployee ? <div className="nda-info">Personel kendi panel hesabına giriş yaptığında sözleşme bildirimi otomatik gösterilir.</div> : null}
  </div>;
}
