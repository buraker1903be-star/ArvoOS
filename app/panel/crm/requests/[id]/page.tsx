import Link from "next/link";
import { formatPersonName } from "@/lib/format-name";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../../components/panel-drawer";
import { ProposalBuilderForm } from "../../proposal-builder-form";
import { InternalComments } from "../../internal-comments";
import {
  archiveOpportunity,
  assignOpportunity,
  updateOpportunity,
} from "../../actions";
import { requestStageNames } from "../../request-status";
import "../../crm.css";
import "../../request-page.css";

type Details = {
  service_type?: string;
  university?: string;
  department?: string;
  scope?: string;
};
type Opportunity = {
  id: string;
  title: string;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  request_details: Details | null;
  assigned_employee_id: string | null;
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  const [{ data, error }, { data: employees, error: employeeError }] =
    await Promise.all([
      supabase
        .from("crm_opportunities")
        .select(
          "id,title,customer_name,contact_email,contact_phone,stage,expected_close_date,source,notes,request_details,assigned_employee_id",
        )
        .eq("id", id)
        .eq("organization_id", membership.organization_id)
        .maybeSingle(),
      supabase
        .from("hr_employees")
        .select("id,full_name")
        .eq("organization_id", membership.organization_id)
        .eq("employment_status", "active")
        .eq("can_receive_sales_requests", true)
        .order("full_name"),
    ]);
  if (error || !data) notFound();
  if (employeeError) throw new Error("Satış temsilcileri okunamadı.");
  const item = data as Opportunity;
  const d = item.request_details ?? {};
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const representative =
    (employees ?? []).find((e) => e.id === item.assigned_employee_id)
      ?.full_name ?? "Atanmamış";
  const edit = (
    <form className="panel-form" action={updateOpportunity}>
      <input type="hidden" name="opportunity_id" value={item.id} />
      <input type="hidden" name="current_details" value={JSON.stringify(d)} />
      <label>
        Talep konusu
        <input name="title" required defaultValue={item.title} />
      </label>
      <label>
        Müşteri / kurum
        <input
          name="customer_name"
          required
          defaultValue={item.customer_name}
        />
      </label>
      <label>
        Hizmet türü
        <input name="service_type" defaultValue={d.service_type || ""} />
      </label>
      {canManage ? (
        <label>
          Satış temsilcisi
          <select
            name="assigned_employee_id"
            defaultValue={item.assigned_employee_id ?? ""}
          >
            <option value="">Atanmamış</option>
            {(employees ?? []).map((e) => (
              <option value={e.id} key={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Telefon
        <input name="contact_phone" defaultValue={item.contact_phone || ""} />
      </label>
      <label>
        E-posta
        <input name="contact_email" defaultValue={item.contact_email || ""} />
      </label>
      <label className="wide">
        Kapsam
        <textarea name="scope" defaultValue={d.scope || ""} />
      </label>
      <div className="wide panel-form-actions">
        <button className="panel-primary">Kaydet</button>
      </div>
    </form>
  );
  return (
    <main className="crm-page-stack crm-request-detail-page">
      <header className="panel-pagehead">
        <div>
          <small className="panel-kicker">
            İŞ DETAYI · TLP-{item.id.slice(0, 8).toUpperCase()}
          </small>
          <h1>{item.title}</h1>
          <p>
            {item.customer_name} için oluşturulan talebin bilgileri ve işlem
            adımları.
          </p>
        </div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel/crm">
            ← Taleplere dön
          </Link>
          <span className="status-pill">
            {requestStageNames[item.stage] ?? item.stage}
          </span>
        </div>
      </header>
      <section className="panel-card crm-request-detail-card">
        <div className="crm-request-detail-heading">
          <div>
            <small className="panel-kicker">MÜŞTERİ VE İŞ BİLGİLERİ</small>
            <h2>{formatPersonName(item.customer_name)}</h2>
            <p>{item.title}</p>
          </div>
          <span className="status-pill">
            {requestStageNames[item.stage] ?? item.stage}
          </span>
        </div>
        <dl className="crm-request-detail-grid">
          <div>
            <dt>Hizmet</dt>
            <dd>{d.service_type || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>Satış temsilcisi</dt>
            <dd>{representative}</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>{item.contact_phone || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>E-posta</dt>
            <dd>{item.contact_email || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>Üniversite</dt>
            <dd>{d.university || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>Bölüm</dt>
            <dd>{d.department || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>Teslim</dt>
            <dd>
              {item.expected_close_date
                ? new Date(
                    item.expected_close_date + "T00:00:00",
                  ).toLocaleDateString("tr-TR")
                : "Belirtilmedi"}
            </dd>
          </div>
          <div>
            <dt>Kaynak</dt>
            <dd>{item.source || "Belirtilmedi"}</dd>
          </div>
        </dl>
        {d.scope ? (
          <div className="crm-request-detail-note">
            <small>KAPSAM</small>
            <p>{d.scope}</p>
          </div>
        ) : null}
        {item.notes ? (
          <div className="crm-request-detail-note">
            <small>NOTLAR</small>
            <p>{item.notes}</p>
          </div>
        ) : null}
        <div className="crm-request-detail-actions">
          <small className="panel-kicker">İŞLEMLER</small>
          <div>
            <PanelDrawer triggerLabel="Düzenle" title="Talebi Düzenle">
              {edit}
            </PanelDrawer>
            {canManage ? (
              <PanelDrawer
                triggerLabel="Temsilci Ata"
                title="Satış Temsilcisi Ata"
                description="Talebi yürütecek temsilciyi seçin."
                triggerClassName="panel-secondary"
              >
                <form className="panel-form" action={assignOpportunity}>
                  <input type="hidden" name="opportunity_id" value={item.id} />
                  <label className="wide">
                    Satış temsilcisi
                    <select
                      name="assigned_employee_id"
                      defaultValue={item.assigned_employee_id ?? ""}
                      required
                    >
                      <option value="">Seçiniz</option>
                      {(employees ?? []).map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="wide panel-form-actions">
                    <button className="panel-primary">Temsilciyi Kaydet</button>
                  </div>
                </form>
              </PanelDrawer>
            ) : null}
            {item.stage === "proposal" ? (
              <Link className="panel-secondary" href="/panel/crm/proposals">
                Tekliflere Git
              </Link>
            ) : (
              <PanelDrawer
                triggerLabel="Teklif Oluştur"
                title="Teklif Oluştur"
                triggerClassName="panel-secondary"
              >
                <ProposalBuilderForm
                  opportunityId={item.id}
                  customerName={item.customer_name}
                  title={item.title}
                  scope={d.scope || item.notes || item.title}
                />
              </PanelDrawer>
            )}
            {item.stage !== "proposal" ? (
              <PanelDrawer
                triggerLabel="Direkt Sözleşme Oluştur"
                title="Direkt Sözleşme Oluştur"
                triggerClassName="panel-secondary"
              >
                <ProposalBuilderForm
                  opportunityId={item.id}
                  customerName={item.customer_name}
                  title={item.title}
                  scope={d.scope || item.notes || item.title}
                  mode="contract"
                />
              </PanelDrawer>
            ) : null}
            {canManage ? (
              <form action={archiveOpportunity}>
                <input type="hidden" name="opportunity_id" value={item.id} />
                <input
                  type="hidden"
                  name="archive_reason"
                  value="Talep arşivlendi."
                />
                <button className="panel-danger">Sil</button>
              </form>
            ) : null}
          </div>
        </div>
      </section>
      <InternalComments opportunityId={item.id} contextType="request" contextId={item.id} />
    </main>
  );
}
