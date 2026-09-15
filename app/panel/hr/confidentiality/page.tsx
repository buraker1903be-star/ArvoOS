import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { HrTabs } from "../hr-tabs";
import { HrChevron, HrIcon, initials } from "../hr-icons";
import "../hr.css";
import "./style.css";

type Agreement = { id: string; agreement_no: string; employee_id: string; status: string; created_at: string; signed_at: string | null; signer_name: string | null };
type Employee = { id: string; full_name: string; job_title: string | null; email: string | null };
type Tone = "success" | "warning" | "danger" | "brand";

const date = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }) : "—";
const statusLabel = (status: string) => status === "signed" ? "İmzalandı" : status === "revoked" ? "İptal" : "İmza Bekliyor";

export default async function ConfidentialityArchivePage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr") || !["owner", "admin", "manager"].includes(membership.role)) throw new Error("Bu gizli arşivi görüntüleme yetkiniz yok.");
  const [{ data: agreementData, error }, { data: employeeData }] = await Promise.all([
    supabase.from("hr_confidentiality_agreements").select("id,agreement_no,employee_id,status,created_at,signed_at,signer_name").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }),
    supabase.from("hr_employees").select("id,full_name,job_title,email").eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("Gizlilik sözleşmeleri okunamadı: " + error.message);
  const agreements = (agreementData ?? []) as Agreement[];
  const employees = new Map(((employeeData ?? []) as Employee[]).map((employee) => [employee.id, employee]));
  const signed = agreements.filter((item) => item.status === "signed").length;
  // İptal edilen sözleşme eskiden "Bekliyor" sayısına karışıyordu.
  const revoked = agreements.filter((item) => item.status === "revoked").length;
  const waiting = agreements.length - signed - revoked;

  const widgets: { label: string; value: number; note: string; icon: string; tone: Tone }[] = [
    { label: "Toplam", value: agreements.length, note: "Hazırlanan sözleşme", icon: "doc", tone: "brand" },
    { label: "İmzalandı", value: signed, note: "Güvenli arşivde", icon: "shield", tone: "success" },
    { label: "İmza bekliyor", value: waiting, note: "Personel onayı bekleniyor", icon: "hourglass", tone: "warning" },
    { label: "İptal edildi", value: revoked, note: "Geçersiz sayılan", icon: "ban", tone: "danger" },
  ];

  return <div className="hr-page hr-conf">
    <div className="panel-pagehead"><div><small className="panel-kicker">İNSAN KAYNAKLARI / GİZLİ ARŞİV</small><h1>Gizlilik Sözleşmeleri</h1><p>Personel gizlilik sözleşmeleri yalnızca yetkili yöneticilere gösterilir.</p></div></div>
    <HrTabs active="gizlilik" access={{ membership }} />

    <section className="hr-widgets" aria-label="Özet">
      {widgets.map((widget) => (
        <article className="hr-widget" data-tone={widget.tone} key={widget.label}>
          <span className="hr-widget-icon"><HrIcon name={widget.icon} /></span>
          <small>{widget.label}</small>
          <strong>{widget.value}</strong>
          <span className="hr-widget-note">{widget.note}</span>
        </article>
      ))}
    </section>

    <section className="hr-card is-table">
      <header className="hr-card-head"><div><h2>Sözleşme arşivi</h2><p>En yeni sözleşme en üstte</p></div><span className="hr-count">{agreements.length}</span></header>
      <div className="hr-table-wrap">
        <table className="hr-table hr-conf-table">
          <thead><tr><th>Belge no</th><th>Personel</th><th>Durum</th><th>Hazırlanma</th><th>İmza</th><th><span className="hr-sr-only">İşlem</span></th></tr></thead>
          <tbody>
            {agreements.map((agreement) => {
              const employee = employees.get(agreement.employee_id);
              const name = employee?.full_name || "Personel";
              return <tr key={agreement.id}>
                <td data-label="Belge no"><span className="hr-conf-no">{agreement.agreement_no}</span></td>
                <td className="is-lead"><span className="hr-table-person"><span className="hr-avatar is-sm" aria-hidden="true">{initials(name)}</span><span><b>{name}</b><small>{employee?.job_title || employee?.email || ""}</small></span></span></td>
                <td data-label="Durum"><span className="status-pill" data-tone={statusTone(agreement.status)}>{statusLabel(agreement.status)}</span></td>
                <td data-label="Hazırlanma" className="is-nowrap">{date(agreement.created_at)}</td>
                <td data-label="İmza" className="is-nowrap">{agreement.signed_at ? <span><span>{date(agreement.signed_at)}</span>{agreement.signer_name ? <small>{agreement.signer_name}</small> : null}</span> : "—"}</td>
                <td className="hr-conf-action"><Link className="panel-secondary" href={`/panel/confidentiality/${agreement.id}`}>Belgeyi Aç <HrChevron /></Link></td>
              </tr>;
            })}
            {!agreements.length ? <tr><td colSpan={6} className="hr-table-empty"><div className="hr-empty-state">
              <span className="hr-empty-icon"><HrIcon name="shield" size={24} /></span>
              <h3>Henüz gizlilik sözleşmesi yok</h3>
              <p>Yeni personel kaydıyla birlikte sözleşme otomatik hazırlanır ve burada listelenir.</p>
            </div></td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
