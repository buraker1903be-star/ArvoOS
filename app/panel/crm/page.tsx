import Link from "next/link";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import {
} from "./actions";
import { RequestEntryForm } from "./request-entry-form";
import { requestStageNames, requestStages } from "./request-status";
import { CrmTabs } from "./crm-tabs";
import "./crm.css";
import "./request-page.css";

type SearchParams = Promise<{
  arama?: string;
  durum?: string;
  temsilci?: string;
}>;
type Details = {
  service_type?: string;
  academic_level?: string;
  university?: string;
  department?: string;
  language?: string;
  scope?: string;
};
type Opportunity = {
  id: string;
  title: string;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  estimated_value: number;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  request_details: Details | null;
  assigned_employee_id: string | null;
};
type SalesRepresentative = {
  id: string;
  full_name: string;
  job_title: string | null;
};
const clean = (v?: string) => (v ?? "").trim().slice(0, 100);
const active = new Set(["lead", "qualified"]);
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { arama, durum, temsilci } = await searchParams;
  const search = clean(arama).toLocaleLowerCase("tr-TR");
  const selected = clean(durum);
  const selectedRepresentative = clean(temsilci);
  const { supabase, membership, modules } = await getPanelContext();
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  const [
    { data, error },
    { data: stages, error: stageError },
    { data: employeeData, error: employeeError },
  ] = await Promise.all([
    supabase
      .from("crm_opportunities")
      .select(
        "id,title,customer_name,contact_email,contact_phone,stage,estimated_value,expected_close_date,source,notes,request_details,assigned_employee_id",
      )
      .eq("organization_id", membership.organization_id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("organization_crm_stages")
      .select("code")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true),
    supabase
      .from("hr_employees")
      .select("id,full_name,job_title")
      .eq("organization_id", membership.organization_id)
      .eq("employment_status", "active")
      .eq("can_receive_sales_requests", true)
      .order("full_name"),
  ]);
  if (error) throw new Error("Talepler okunamadı: " + error.message);
  if (stageError)
    throw new Error("Talep ayarları okunamadı: " + stageError.message);
  if (employeeError)
    throw new Error("Satış temsilcileri okunamadı: " + employeeError.message);
  const representatives = (employeeData ?? []) as SalesRepresentative[];
  const representativeMap = new Map(
    representatives.map((item) => [item.id, item.full_name]),
  );
  const academicMode = (stages ?? []).some((s) => s.code === "academic_review");
  const all = (data ?? []) as Opportunity[];
  const rows = all.filter((i) => {
    const hay = [
      i.customer_name,
      i.title,
      i.contact_email,
      i.contact_phone,
      i.request_details?.service_type,
      representativeMap.get(i.assigned_employee_id ?? ""),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    const representativeMatches =
      !selectedRepresentative ||
      (selectedRepresentative === "atanmamis"
        ? !i.assigned_employee_id
        : i.assigned_employee_id === selectedRepresentative);
    return (
      (!search || hay.includes(search)) &&
      (selected === "tumu"
        ? true
        : selected
          ? i.stage === selected
          : active.has(i.stage)) &&
      representativeMatches
    );
  });
  const visibleOpportunityIds = rows.map((item) => item.id);
  const { data: commentData, error: commentError } = visibleOpportunityIds.length
    ? await supabase
        .from("crm_internal_comments")
        .select("opportunity_id")
        .eq("organization_id", membership.organization_id)
        .in("opportunity_id", visibleOpportunityIds)
    : { data: [], error: null };
  if (commentError)
    throw new Error("Yorum sayıları okunamadı: " + commentError.message);
  const commentCounts = new Map<string, number>();
  for (const comment of commentData ?? []) {
    commentCounts.set(
      comment.opportunity_id,
      (commentCounts.get(comment.opportunity_id) ?? 0) + 1,
    );
  }
  const counts = (code: string) => all.filter((i) => i.stage === code).length;
  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">TALEP YÖNETİMİ</small>
          <h1>Talepler</h1>
          <p>
            Yeni talepleri inceleyin, satış temsilcisine atayın ve teklif
            aşamasına devredin.
          </p>
        </div>
        <div className="panel-page-actions">
          <span className="status-pill">{rows.length} kayıt</span>
          <PanelDrawer
            triggerLabel="+ Yeni talep" kicker="YENİ KAYIT"
            title={academicMode ? "Talep Girişi" : "Yeni talep"}
            description="Müşteri ve talep bilgilerini kaydedin."
          >
            <RequestEntryForm
              academicMode={academicMode}
              salesRepresentatives={representatives}
              canAssign={canAssign}
            />
          </PanelDrawer>
        </div>
      </div>
      <CrmTabs active="talepler" />
      <div className="module-tab-panel">
        <section className="crm-metrics">
          <article>
            <small>YENİ TALEP</small>
            <strong>{counts("lead")}</strong>
            <span>İlk değerlendirme</span>
          </article>
          <article>
            <small>TALEP İNCELENİYOR</small>
            <strong>{counts("qualified")}</strong>
            <span>İnceleme sürecinde</span>
          </article>
          <article>
            <small>TEKLİFLERE DEVREDİLDİ</small>
            <strong>{counts("proposal")}</strong>
            <span>Teklifler bölümünde</span>
          </article>
          <article>
            <small>ARŞİVLENDİ</small>
            <strong>{counts("lost")}</strong>
            <span>İptal edilen kayıtlar</span>
          </article>
        </section>
        <section className="panel-card crm-filter-card">
          <form action="/panel/crm" className="crm-filter-form">
            <label>
              <span>Müşteri / talep ara</span>
              <input name="arama" defaultValue={arama ?? ""} />
            </label>
            <label>
              <span>Durum</span>
              <select name="durum" defaultValue={selected}>
                <option value="">Aktif Talepler</option>
                <option value="tumu">Tüm Kayıtlar</option>
                {requestStages.map((s) => (
                  <option value={s.code} key={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Satış temsilcisi</span>
              <select name="temsilci" defaultValue={selectedRepresentative}>
                <option value="">Tüm temsilciler</option>
                <option value="atanmamis">Atanmamış</option>
                {representatives.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button className="panel-primary">Filtrele</button>
              <Link className="panel-secondary" href="/panel/crm">
                Temizle
              </Link>
            </div>
          </form>
        </section>
        {rows.length ? (
          <section className="panel-card crm-table-wrap">
            <table className="crm-data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Müşteri</th>
                  <th>Talep Konusu</th>
                  <th>Hizmet</th>
                  <th>Temsilci</th>
                  <th>Durum</th>
                  <th>Teslim</th>
                  <th>Yorumlar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const d = item.request_details ?? {};
                  const ownerName = item.assigned_employee_id
                    ? (representativeMap.get(item.assigned_employee_id) ??
                      "Pasif personel")
                    : "Atanmamış";
                  return (
                    <tr key={item.id}>
                      <td className="crm-table-mono" data-label="No">
                        <Link
                          className="crm-row-link"
                          href={`/panel/crm/requests/${item.id}`}
                          aria-label={`${formatPersonName(item.customer_name)} talebini aç`}
                        >
                          TLP-{item.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td data-label="Müşteri">
                        <Link
                          className="crm-row-link"
                          href={`/panel/crm/requests/${item.id}`}
                        >
                          <span className="crm-table-title">
                            {formatPersonName(item.customer_name)}
                          </span>
                          <span className="crm-table-sub">
                            {item.contact_phone ||
                              item.contact_email ||
                              "İletişim yok"}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Talep Konusu">
                        <Link
                          className="crm-row-link crm-row-subject"
                          href={`/panel/crm/requests/${item.id}`}
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td data-label="Hizmet">{d.service_type || "—"}</td>
                      <td data-label="Temsilci">{ownerName}</td>
                      <td data-label="Durum">
                        <span className="status-pill">
                          {requestStageNames[item.stage] ?? item.stage}
                        </span>
                      </td>
                      <td data-label="Teslim">
                        {item.expected_close_date
                          ? new Date(
                              item.expected_close_date + "T00:00:00",
                            ).toLocaleDateString("tr-TR")
                          : "—"}
                      </td>
                      <td data-label="Yorumlar">
                        {commentCounts.get(item.id) ? (
                          <Link
                            className="crm-comment-count-badge"
                            href={`/panel/crm/requests/${item.id}`}
                          >
                            {commentCounts.get(item.id)} yorum
                          </Link>
                        ) : (
                          <span className="crm-comment-count-empty">—</span>
                        )}
                      </td>
                      <td className="crm-table-actions">
                        <span className="crm-row-chevron" aria-hidden="true">›</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="panel-card crm-empty-state">
            <h2>Eşleşen talep bulunamadı</h2>
          </section>
        )}
      </div>
    </div>
  );
}
