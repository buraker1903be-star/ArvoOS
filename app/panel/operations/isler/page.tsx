import Link from "next/link";
import type { CSSProperties } from "react";
import { statusTone } from "@/lib/status-tone";
import { formatSubject } from "@/lib/table-format";
import { formatPersonName } from "@/lib/format-name";
import { fetchLastContacts } from "../../crm/last-contact";
import { CustomerCell, LastContactCell, RepresentativeCell } from "../../crm/table-cells";
import { OtomatikSecim } from "../../crm/otomatik-secim";
import { IstatistikKarti, degisimYazisi } from "../../crm/istatistik-karti";
import { aylik, enCok, oran, son30Degisim } from "@/lib/liste-istatistik";
import { simdi } from "../../os/genel-bakis";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { archiveWorkflow } from "../actions";
import { WorkflowCreateForm } from "../workflow-create-form";
import { OpsIcon, addDaysKey, dueBadge, priorityNames, priorityTones, shortDate, stepProgress, todayIstanbul, workflowStatusNames } from "../ops-shared";
import { BEKLEYEN_TARAF_TONLARI, beklemeOzeti, bekleyenTarafMi } from "@/lib/bekleyen-taraf";
import "../../crm/crm.css";
import "../operations.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  İŞLER LİSTESİ (2026-10): talepler, teklifler ve sözleşmelerle aynı
  düzen. Üstte başlık, Arşiv ve Yeni iş; altında durum şeridi (her sayı
  süzer; geciken ve yeni mesajlı işler dahil); solda sütunlu tablo,
  sağda istatistikler. Süzgeçler adreste: eski bağlantılar (?durum=,
  ?termin=, ?mesaj=yeni) çalışıyor, ?sorumlu= yeni.

  Eskiden dört sayaç kutusu ve "Filtrele"/"Temizle" düğmeli ayrı bir
  süzgeç kartı vardı. Arşivlenen işler listede görünmez
  (/panel/operations/arsiv); istatistik için okunur.
*/

const boardStatuses = ["planned", "in_progress", "blocked", "completed"] as const;
// "devam": devam eden + beklemede (genel bakıştaki kartla aynı küme)
const statusFilters = [...boardStatuses, "devam"] as const;
const dueFilters = ["yaklasan", "geciken"] as const;
type Step = { id: string; title: string; is_completed: boolean; sort_order: number };
type Employee = { id: string; full_name: string; job_title: string | null; user_id: string | null };
type Workflow = { id: string; title: string; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; delivered_at: string | null; created_at: string; contract_id: string | null; assigned_employee_id: string | null; waiting_party: string; waiting_since: string | null; operation_steps: Step[] };

export default async function OperationsJobsPage({ searchParams }: { searchParams: Promise<{ arama?: string; durum?: string; termin?: string; mesaj?: string; sorumlu?: string }> }) {
  const { arama, durum, termin, mesaj, sorumlu } = await searchParams;
  const search = (arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const selectedStatus = (statusFilters as readonly string[]).includes(durum ?? "") ? durum! : "";
  const selectedDue = (dueFilters as readonly string[]).includes(termin ?? "") ? termin! : "";
  const onlyUnread = mesaj === "yeni";
  const selectedOwner = (sorumlu ?? "").trim().slice(0, 80);
  const { supabase, membership, modules, userId, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  /*
    Arşivlenen işler de okunuyor: istatistik kartı (zamanında teslim, aylık
    tamamlanan) arşivdekiler olmadan eksik kalırdı. Listede gösterilmez.
  */
  const [{ data, error }, { data: employeeData, error: employeeError }] = await Promise.all([
    supabase.from("operation_workflows").select("id,title,customer_name,description,status,priority,start_date,due_date,delivered_at,created_at,contract_id,assigned_employee_id,waiting_party,waiting_since,operation_steps(id,title,is_completed,sort_order)").eq("organization_id", membership.organization_id).neq("status", "cancelled").order("created_at", { ascending: false }),
    supabase.from("hr_employees").select("id,full_name,job_title,user_id").eq("organization_id", membership.organization_id).eq("employment_status", "active").order("full_name"),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  const tumu = (data ?? []) as Workflow[];
  const workflows = tumu.filter((workflow) => workflow.status !== "archived");
  const archivedCount = tumu.length - workflows.length;
  const employees = (employeeData ?? []) as Employee[];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const contractIds = [...new Set(workflows.map((workflow) => workflow.contract_id).filter((value): value is string => Boolean(value)))];
  const { data: workflowContracts, error: workflowContractsError } = contractIds.length
    ? await supabase.from("ops_contracts").select("id,opportunity_id,invoice_id").in("id", contractIds)
    : { data: [], error: null };
  if (workflowContractsError) throw new Error("İşlerin CRM bağlantıları okunamadı: " + workflowContractsError.message);
  const opportunityByContract = new Map((workflowContracts ?? []).map((contract) => [contract.id, contract.opportunity_id]));
  const operationOpportunityIds = [...new Set((workflowContracts ?? []).map((contract) => contract.opportunity_id))];
  /*
    İletişim bilgisi AYRI SORGUYLA. Önce ops_contracts içine gömülüydü
    (crm_opportunities(...)); operasyon artık tutarsız GÖRÜNÜMLERDEN
    okuyor ve PostgREST iki görünüm arasında ilişki çıkaramıyor —
    görünümlerin yabancı anahtarı yok, gömme sessizce boş dönerdi.
  */
  const { data: contactRows, error: contactError } = operationOpportunityIds.length
    ? await supabase.from("ops_opportunities").select("id,contact_phone,contact_email").in("id", operationOpportunityIds)
    : { data: [], error: null };
  if (contactError) throw new Error("Müşteri iletişimi okunamadı: " + contactError.message);
  const contactByOpportunity = new Map(((contactRows ?? []) as { id: string; contact_phone: string | null; contact_email: string | null }[])
    .map((row) => [row.id, { phone: row.contact_phone, email: row.contact_email }]));
  const contactByContract = new Map((workflowContracts ?? []).map((contract) =>
    [contract.id, contactByOpportunity.get(contract.opportunity_id) ?? { phone: null, email: null }]));
  const lastContacts = await fetchLastContacts(supabase, membership.organization_id, operationOpportunityIds);
  const today = todayIstanbul();
  const weekEnd = addDaysKey(today, 7);
  // Müşteriden gelen, henüz okunmamış mesajlar: ilgili iş satırında kırmızı belirteç
  const workflowIdsForMessages = workflows.map((workflow) => workflow.id);
  const { data: unreadMessageRows } = workflowIdsForMessages.length
    ? await supabase.from("customer_file_messages").select("workflow_id").eq("organization_id", membership.organization_id).eq("sender_type", "customer").is("read_at", null).in("workflow_id", workflowIdsForMessages)
    : { data: [] as { workflow_id: string }[] };
  const unreadByWorkflow = new Map<string, number>();
  for (const row of (unreadMessageRows ?? []) as { workflow_id: string | null }[]) {
    if (row.workflow_id) unreadByWorkflow.set(row.workflow_id, (unreadByWorkflow.get(row.workflow_id) ?? 0) + 1);
  }
  const unreadWorkflowCount = [...unreadByWorkflow.values()].filter(Boolean).length;
  // Termini ve arşivi yöneticiler ve işin sorumlusu yönetebilir (actions.ts isManagerOrAssignee)
  const canManage = izin("operations.is.yonet");
  /*
    Müşteri adı müşteri sayfasına bağlanır (/panel/crm/musteri/[talep id]).
    Sayfa CRM kayıtlarını okuyor: operasyon personeli CRM'i göremediği
    için bağlantı yalnızca CRM modülü olan ve müşteri sorgulama ya da iş
    yönetme yetkisi olana çıkar; diğerlerinde ad düz yazı.
  */
  const musteriBaglantisi = modules.some((module) => module.code === "crm") && (izin("crm.musteri.sorgula") || canManage);
  const myEmployeeId = employees.find((employee) => employee.user_id === userId)?.id ?? null;
  const canActOn = (workflow: Workflow) => canManage || (Boolean(myEmployeeId) && workflow.assigned_employee_id === myEmployeeId);

  // Tamamlanan işin ödemesi kapandıysa (ya da bekleyecek fatura yoksa)
  // "arşive hazır" ipucu gösterilir. Arşivleme artık elle yapılır.
  const invoiceIds = (workflowContracts ?? []).map((contract) => (contract as { invoice_id?: string | null }).invoice_id).filter((value): value is string => Boolean(value));
  const paidInvoiceIds = new Set<string>();
  if (invoiceIds.length && workflows.some((workflow) => workflow.status === "completed")) {
    const { data: invoices } = await supabase.from("billing_invoices").select("id,status").in("id", invoiceIds);
    for (const invoice of invoices ?? []) if (invoice.status === "paid") paidInvoiceIds.add(invoice.id);
  }
  const invoiceByContract = new Map((workflowContracts ?? []).map((contract) => [contract.id, (contract as { invoice_id?: string | null }).invoice_id ?? null]));
  const readyForArchive = (workflow: Workflow) => {
    if (workflow.status !== "completed") return false;
    if (!workflow.contract_id) return true;
    if (!invoiceByContract.has(workflow.contract_id)) return false;
    const invoiceId = invoiceByContract.get(workflow.contract_id);
    return !invoiceId || paidInvoiceIds.has(invoiceId);
  };

  const gecikmis = (workflow: Workflow) => Boolean(workflow.due_date) && workflow.status !== "completed" && workflow.due_date! < today;
  const sorumluUyar = (workflow: Workflow) => !selectedOwner || (selectedOwner === "atanmamis" ? !workflow.assigned_employee_id : workflow.assigned_employee_id === selectedOwner);
  const aramaUyar = (workflow: Workflow) => !search || [workflow.title, workflow.customer_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(search);
  const filteredWorkflows = workflows.filter((workflow) => {
    if (!aramaUyar(workflow) || !sorumluUyar(workflow)) return false;
    if (selectedStatus === "devam" ? !["in_progress", "blocked"].includes(workflow.status) : selectedStatus && workflow.status !== selectedStatus) return false;
    if (selectedDue) {
      if (!workflow.due_date || workflow.status === "completed") return false;
      if (selectedDue === "geciken" && workflow.due_date >= today) return false;
      if (selectedDue === "yaklasan" && workflow.due_date > weekEnd) return false;
    }
    if (onlyUnread && !unreadByWorkflow.get(workflow.id)) return false;
    return true;
  });
  const hasFilter = Boolean(search || selectedStatus || selectedDue || onlyUnread || selectedOwner);

  // Şerit sayıları arama ve sorumlu süzgecine göre, durum süzgecinden bağımsız.
  const kapsam = workflows.filter((workflow) => aramaUyar(workflow) && sorumluUyar(workflow));
  const durumSayisi = (status: string) => kapsam.filter((workflow) => workflow.status === status).length;
  const adres = (ek: { durum?: string; termin?: string; mesaj?: string; sorumlu?: string }) => {
    const q = new URLSearchParams();
    const d = ek.durum ?? selectedStatus;
    const t = ek.termin ?? selectedDue;
    const m = ek.mesaj ?? (onlyUnread ? "yeni" : "");
    const s = ek.sorumlu ?? selectedOwner;
    if (arama) q.set("arama", arama);
    if (d) q.set("durum", d);
    if (t) q.set("termin", t);
    if (m) q.set("mesaj", m);
    if (s) q.set("sorumlu", s);
    const qs = q.toString();
    return qs ? `/panel/operations/isler?${qs}` : "/panel/operations/isler";
  };

  /*
    İSTATİSTİKLER (sağ kart): tüm işlerden (arşiv dahil), süzgeçten bağımsız.
    Zamanında teslim: terminli ve teslim edilmiş işlerde teslim günü
    (Türkiye saatiyle) termin gününden sonra değilse.
  */
  const an = simdi();
  const { son30, degisim } = son30Degisim(tumu.map((workflow) => workflow.created_at), an);
  const teslimGunu = (deger: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(Date.parse(deger));
  const teslimli = tumu.filter((workflow) => workflow.delivered_at && workflow.due_date);
  const zamaninda = teslimli.filter((workflow) => teslimGunu(workflow.delivered_at!) <= workflow.due_date!).length;
  const zamanindaOrani = oran(zamaninda, teslimli.length);
  const aktifIsler = workflows.filter((workflow) => workflow.status !== "completed");
  const aktifAdimlar = aktifIsler.flatMap((workflow) => workflow.operation_steps ?? []);
  const ilerleme = oran(aktifAdimlar.filter((step) => step.is_completed).length, aktifAdimlar.length);
  const musteriBekleyen = aktifIsler.filter((workflow) => bekleyenTarafMi(workflow.waiting_party) && workflow.waiting_party !== "us").length;
  const aylikTeslim = aylik(tumu.map((workflow) => ({ tarih: workflow.delivered_at })), 6, an);
  const sorumluYuku = enCok(aktifIsler.map((workflow) => workflow.assigned_employee_id ? formatPersonName(employeeMap.get(workflow.assigned_employee_id) ?? "Pasif personel") : "Atanmamış"), 5);

  return <main className="talep cari ekip talepler teklifler">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">OPERASYON</small>
        <h1>İşler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/operations/arsiv">Arşiv ({archivedCount})</Link>
        {canManage ? <PanelDrawer triggerLabel="Yeni iş" kicker="YENİ KAYIT" title="Yeni iş" description="İş başlığını, önceliğini ve terminini belirleyin."><WorkflowCreateForm /></PanelDrawer> : null}
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
      <dl>
        {boardStatuses.map((status) => (
          <div key={status} className={selectedStatus === status ? "is-active" : undefined}>
            <dt>{workflowStatusNames[status]}</dt>
            <dd><Link href={adres({ durum: status, termin: "", mesaj: "" })} aria-current={selectedStatus === status ? "page" : undefined}>{durumSayisi(status)}</Link></dd>
          </div>
        ))}
        <div className={selectedDue === "geciken" ? "is-active" : undefined}>
          <dt>Termini geçen</dt>
          <dd className={kapsam.some(gecikmis) ? "talep-uyari" : undefined}><Link href={adres({ durum: "", termin: "geciken", mesaj: "" })}>{kapsam.filter(gecikmis).length}</Link></dd>
        </div>
        <div className={onlyUnread ? "is-active" : undefined}>
          <dt>Yeni müşteri mesajı</dt>
          <dd className={unreadWorkflowCount ? "talep-uyari" : undefined}><Link href={adres({ durum: "", termin: "", mesaj: "yeni" })}>{unreadWorkflowCount}</Link></dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="İş listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ durum: "", termin: "", mesaj: "" })} className={!selectedStatus && !selectedDue && !onlyUnread ? "is-active" : undefined}>Tümü <small>{kapsam.length}</small></Link>
          <Link href={adres({ durum: "devam", termin: "", mesaj: "" })} className={selectedStatus === "devam" ? "is-active" : undefined}>Devam + bekleyen <small>{durumSayisi("in_progress") + durumSayisi("blocked")}</small></Link>
          <Link href={adres({ durum: "", termin: "yaklasan", mesaj: "" })} className={selectedDue === "yaklasan" ? "is-active" : undefined}>7 gün içinde</Link>
          {/* Sorumlu süzgeci seçince uygulanır; durum, termin ve mesaj süzgeçleri korunur. */}
          <form action="/panel/operations/isler" className="talep-ara talep-ara--secimli" role="search">
            {selectedStatus ? <input type="hidden" name="durum" value={selectedStatus} /> : null}
            {selectedDue ? <input type="hidden" name="termin" value={selectedDue} /> : null}
            {onlyUnread ? <input type="hidden" name="mesaj" value="yeni" /> : null}
            <OtomatikSecim name="sorumlu" defaultValue={selectedOwner} className="talep-temsilci-sec" label="Sorumlu">
              <option value="">Tüm sorumlular</option>
              <option value="atanmamis">Atanmamış</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{formatPersonName(employee.full_name)}</option>)}
            </OtomatikSecim>
            <input name="arama" defaultValue={arama ?? ""} placeholder="İş, müşteri ara" aria-label="İş / müşteri ara" />
          </form>
        </div>

        {filteredWorkflows.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="operations">
              <thead><tr><th>İş</th><th>Müşteri</th><th className="crm-col-rep">Sorumlu</th><th>Öncelik</th><th>Durum</th><th>İlerleme</th><th className="crm-col-date">Termin</th><th className="crm-col-contact">Son temas</th><th></th></tr></thead>
              <tbody>{[...filteredWorkflows].sort((a, b) => Number((unreadByWorkflow.get(b.id) ?? 0) > 0) - Number((unreadByWorkflow.get(a.id) ?? 0) > 0)).map((workflow) => {
                const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
                const { done, percentage } = stepProgress(steps);
                const opportunityId = workflow.contract_id ? opportunityByContract.get(workflow.contract_id) : null;
                const contact = workflow.contract_id ? contactByContract.get(workflow.contract_id) : null;
                /*
                  Termin metni ops-shared/dueBadge'den: pano, genel bakış ve iş
                  detayı da aynı fonksiyonu kullanıyor.
                */
                const terminRozeti = dueBadge(workflow.due_date, today, workflow.status);
                const unreadMessages = unreadByWorkflow.get(workflow.id) ?? 0;
                const canAct = canActOn(workflow);
                return <tr key={workflow.id} className={unreadMessages ? "has-alert" : undefined}>
                  {/* Satırın tamamı bu bağlantıyla tıklanır (kayit-detay.css, ilk hücre) */}
                  <td data-label="İş"><Link className="crm-row-link" href={`/panel/operations/${workflow.id}`} aria-label={`${workflow.title} işini aç`}><span className="crm-table-title" title={workflow.title}>{formatSubject(workflow.title)}</span><span className="crm-table-sub">{steps.length ? `${done}/${steps.length} adım tamamlandı` : "Adım yok"}</span>{unreadMessages ? <span className="crm-alert-chip">{unreadMessages} yeni müşteri mesajı</span> : null}</Link></td>
                  <CustomerCell name={workflow.customer_name || "Kurum içi iş"} phone={contact?.phone} email={contact?.email} href={musteriBaglantisi && opportunityId ? `/panel/crm/musteri/${opportunityId}` : null} />
                  <RepresentativeCell label="Sorumlu" name={workflow.assigned_employee_id ? employeeMap.get(workflow.assigned_employee_id) ?? "Pasif personel" : null} />
                  <td data-label="Öncelik"><span className="status-pill" data-tone={priorityTones[workflow.priority] ?? "neutral"}>{priorityNames[workflow.priority] ?? workflow.priority}</span></td>
                  <td data-label="Durum" className="ops-status-cell">
                    <span className="status-pill" data-tone={statusTone(workflow.status)}>{workflowStatusNames[workflow.status] ?? workflow.status}</span>
                    {/*
                      Top bizde değilse listede görünmeli: gecikmiş gibi duran bir iş
                      aslında müşteriden yanıt bekliyor olabilir.
                    */}
                    {bekleyenTarafMi(workflow.waiting_party) && workflow.waiting_party !== "us" ? (
                      <span className="status-pill" data-tone={BEKLEYEN_TARAF_TONLARI[workflow.waiting_party]}>
                        {beklemeOzeti(workflow.waiting_party, workflow.waiting_since, today)}
                      </span>
                    ) : null}
                    {workflow.status === "completed" && canAct ? (
                      <form action={archiveWorkflow} className="ops-archive-form">
                        <input type="hidden" name="workflow_id" value={workflow.id} />
                        <button type="submit" className="ops-archive-btn" title={readyForArchive(workflow) ? "Ödemesi kapandı, arşive gönderilebilir" : "İşi arşive gönder"}><OpsIcon name="archive" size={14} />Arşivle</button>
                      </form>
                    ) : null}
                    {workflow.status === "completed" && readyForArchive(workflow) ? <small className="ops-ready-hint">Ödeme kapandı</small> : null}
                  </td>
                  <td data-label="İlerleme" className="crm-col-progress"><span className="ops-progress-mini" aria-hidden="true"><i style={{ "--p": `${percentage}%` } as CSSProperties} /></span><b>%{percentage}</b></td>
                  <td data-label="Termin" className={`crm-col-date${terminRozeti.late ? " is-late" : ""}`}>{workflow.due_date ? shortDate(workflow.due_date) : canAct ? <Link className="crm-inline-action" href={`/panel/operations/${workflow.id}#termin`}>+ Termin ekle</Link> : "—"}{workflow.due_date ? <small>{terminRozeti.label}</small> : null}</td>
                  <LastContactCell contact={opportunityId ? lastContacts.get(opportunityId) : null} />
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{hasFilter ? "Eşleşen iş yok" : "Aktif iş yok"}</h2>
            <p>{hasFilter ? "Aramayı veya süzgeci değiştirip yeniden deneyin." : "Tamamlanıp arşivlenen işler Arşiv'de."}</p>
            <div className="crm-empty-actions">
              {hasFilter ? <Link className="panel-secondary" href="/panel/operations/isler">Süzgeci temizle</Link> : null}
            </div>
          </div>
        )}
      </section>

      <IstatistikKarti
        kapsam="tüm işler (arşiv dahil)"
        kutular={[
          { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni iş", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
          { ad: "Zamanında teslim", deger: zamanindaOrani === null ? "—" : `%${zamanindaOrani}`, alt: `${zamaninda}/${teslimli.length} terminli iş` },
          { ad: "Aktif işlerde ilerleme", deger: ilerleme === null ? "—" : `%${ilerleme}`, alt: `${aktifIsler.length} aktif iş` },
          { ad: "Müşteriyi bekleyen", deger: String(musteriBekleyen), alt: "top müşteride ya da üçüncü tarafta" },
        ]}
        gruplar={[
          { baslik: "Son 6 ay · teslim edilen", satirlar: aylikTeslim.map((ay) => ({ ad: ay.ad, adet: ay.adet })) },
          { baslik: "Sorumluya göre aktif iş", satirlar: sorumluYuku.map(([ad, adet]) => ({ ad, adet })) },
        ]}
      />
    </div>
  </main>;
}
