import Link from "next/link";
import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../../components/panel-drawer";
import { ProposalBuilderForm } from "../../proposal-builder-form";
import { InternalComments } from "../../internal-comments";
import { RecordHistory } from "../../record-history";
import {
  archiveOpportunity,
  assignOpportunity,
  updateOpportunity,
} from "../../actions";
import { requestStageNames } from "../../request-status";
import { BrifingAlanlari, BrifingOzeti } from "../../../operations/brifing-form";
import { saveOpportunityBrief } from "../../../operations/brifing-actions";
import { brifingDoluluk, gecerliAlanlar, type BriefField, type BriefValues } from "@/lib/is-brifingi";
import "../../crm.css";
import "../../request-page.css";
import "../../../operations/brifing-form.css";

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
  step_template_set: string | null;
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
  const [{ data, error }, { data: employees, error: employeeError }, { data: alanData }, { data: brifingData }, { data: turData }] =
    await Promise.all([
      supabase
        .from("crm_opportunities")
        .select(
          "id,title,customer_name,contact_email,contact_phone,stage,expected_close_date,source,notes,request_details,assigned_employee_id,step_template_set",
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
      /*
        BRİFİNG. Satışçının operasyona aktardığı bilgi burada doldurulur ve
        iş açılırken işe kopyalanır. Sorular kurumun kendi formundan
        (Operasyon → Brifing Formu); tanımlı değilse bölüm hiç basılmaz.
      */
      supabase
        .from("organization_brief_fields")
        .select("code,label,field_type,options,hint,is_required,set_codes,sort_order,is_active")
        .eq("organization_id", membership.organization_id)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("crm_opportunity_briefs")
        .select("values")
        .eq("opportunity_id", id)
        .maybeSingle(),
      supabase
        .from("organization_step_template_sets")
        .select("code,name,is_default")
        .eq("organization_id", membership.organization_id)
        .eq("is_active", true)
        .order("sort_order")
        .order("code"),
    ]);
  if (error || !data) notFound();
  if (employeeError) throw new Error("Satış temsilcileri okunamadı.");
  const item = data as Opportunity;
  const d = item.request_details ?? {};
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const calismaTurleri = (turData ?? []) as { code: string; name: string; is_default: boolean }[];
  /*
    Brifingin türe bağlı soruları ("veri ne zaman gelecek", yalnızca tez
    ve analizde) fırsatın türüne göre süzülüyor. Tür seçilmemişse yalnızca
    her türde sorulan sorular görünür — uydurma bir türle soru göstermek,
    satışçıya yanlış formu doldurtmak olurdu.
  */
  const brifingAlanlari = gecerliAlanlar((alanData ?? []) as BriefField[], item.step_template_set);
  const brifing = (brifingData ?? null) as { values: BriefValues } | null;
  const brifingSayisi = brifingDoluluk(brifingAlanlari, brifing?.values ?? null);
  // Atanmış temsilci pasif veya satışa kapalıysa listede yok; adını ayrıca
  // okuyup seçenek olarak ekliyoruz, yoksa form kaydı atamayı sessizce siliyordu.
  const listedAssignee = (employees ?? []).find(
    (e) => e.id === item.assigned_employee_id,
  );
  const unlistedAssignee =
    item.assigned_employee_id && !listedAssignee
      ? ((
          await supabase
            .from("hr_employees")
            .select("full_name")
            .eq("id", item.assigned_employee_id)
            .eq("organization_id", membership.organization_id)
            .maybeSingle()
        ).data?.full_name ?? "Pasif personel")
      : null;
  const representative =
    listedAssignee?.full_name ?? unlistedAssignee ?? "Atanmamış";
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
      {calismaTurleri.length ? (
        /* Görev listesini ve brifingin türe bağlı sorularını bu belirliyor. */
        <label>
          Çalışma türü
          <select name="step_template_set" defaultValue={item.step_template_set ?? ""}>
            <option value="">Öntanımlı</option>
            {calismaTurleri.map((tur) => <option value={tur.code} key={tur.code}>{tur.name}</option>)}
          </select>
        </label>
      ) : null}
      {canManage ? (
        <label>
          Satış temsilcisi
          <select
            name="assigned_employee_id"
            defaultValue={item.assigned_employee_id ?? ""}
          >
            <option value="">Atanmamış</option>
            {unlistedAssignee ? (
              <option value={item.assigned_employee_id ?? ""}>
                {unlistedAssignee} (atamaya kapalı)
              </option>
            ) : null}
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
      <div className="crm-detail-split">
        <div className="crm-detail-main">
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
            <dd>{formatPhone(item.contact_phone) || "Belirtilmedi"}</dd>
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
                  representatives={(employees ?? []).map((e) => ({ id: e.id, full_name: e.full_name }))}
                  needsRepresentative={!item.assigned_employee_id}
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
                  representatives={(employees ?? []).map((e) => ({ id: e.id, full_name: e.full_name }))}
                  needsRepresentative={!item.assigned_employee_id}
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
          {brifingAlanlari.length ? (
            <section className="panel-card">
              <header className="brifing-head">
                <div>
                  <h2>İş brifingi</h2>
                  <p>
                    Operasyona geçecek bilgi · {brifingSayisi.dolu}/{brifingSayisi.toplam} yanıtlandı.
                    İş açıldığında bu metin operasyonun ekranına düşer.
                  </p>
                </div>
                <PanelDrawer triggerLabel={brifing ? "Düzenle" : "Doldur"} title="İş brifingi" triggerClassName="panel-secondary">
                  <form className="panel-form" action={saveOpportunityBrief}>
                    <input type="hidden" name="opportunity_id" value={item.id} />
                    <BrifingAlanlari alanlar={brifingAlanlari} values={brifing?.values ?? null} />
                    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Brifingi kaydet</button></div>
                  </form>
                </PanelDrawer>
              </header>
              <BrifingOzeti alanlar={brifingAlanlari} values={brifing?.values ?? null} />
            </section>
          ) : null}

          <RecordHistory opportunityId={item.id} />
        </div>
        <aside className="crm-detail-side">
  <InternalComments opportunityId={item.id} contextType="request" contextId={item.id} />
        </aside>
      </div>
    </main>
  );
}
