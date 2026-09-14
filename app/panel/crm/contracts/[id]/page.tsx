import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { ShareSendLink } from "../../share-send-link";
import { formatPhone } from "@/lib/format-phone";
import { CONTRACT_STATUS_LABELS as labels } from "../../status-labels";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import { deleteContract, issueContractLink, markContractStatus, updateContract } from "../../sales-actions";
import { PanelDrawer } from "../../../components/panel-drawer";
import { ContractPaymentPlanForm } from "../../contract-payment-plan-form";
import { ContractWorkPlanForm } from "../../contract-work-plan-form";
import { ContractAddendumForm, type AddendumInstallment } from "../../contract-addendum-form";
import { cancelContractAddendum, replyContractMessage, setTrackingBeforeSignature } from "../../contract-plan-actions";
import { installmentLabel, normalizePaymentSchedule } from "@/lib/payment-schedule";
import { ADDENDUM_STATUS_LABELS, normalizeAddenda, normalizeWorkPlan } from "@/lib/work-plan";
import { contractMessages, organizationBrandName } from "@/lib/customer-message-templates";
import { InternalComments } from "../../internal-comments";
import { RecordHistory } from "../../record-history";
import "../../request-page.css";
import "../../crm.css";

type Props = { params: Promise<{ id: string }> };
const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR") : "—";
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) : "—";
// Ek protokol rozet tonu: bekleyen sarı, onaylı yeşil, değişiklik talebi turuncu, geri çekilen gri.
const ADDENDUM_TONES: Record<string, string> = { sent: "pending", accepted: "accepted", rejected: "blocked", cancelled: "archived" };
const INSTALLMENT_LABELS: Record<string, string> = { paid: "Ödendi", pending: "Bekliyor", cancelled: "İptal" };

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules, organization } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,title,scope,amount,currency,payment_plan,payment_plan_type,start_date,due_date,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,share_token,signed_name,signed_at,workflow_id,tracking_code,customer_address,customer_tax_number,customer_tax_office,opportunity_id,payment_schedule,payment_plan_id,crm_proposals(payment_schedule),crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (error) throw new Error("Sözleşme bilgileri okunamadı: " + error.message);
  if (!data) notFound();
  const customer = Array.isArray(data.crm_opportunities) ? data.crm_opportunities[0] : data.crm_opportunities;
  let representative = "Atanmamış";
  if (customer?.assigned_employee_id) {
    const { data: employee } = await supabase.from("hr_employees").select("full_name").eq("id", customer.assigned_employee_id).eq("organization_id", membership.organization_id).maybeSingle();
    representative = employee?.full_name ?? "Pasif personel";
  }
  const locked = ["signed", "completed", "rejected", "cancelled"].includes(data.status);
  const signed = ["signed", "completed"].includes(data.status);

  // İş planı ve ek protokoller ayrı okunur: migration (20260914090000)
  // uygulanmadıysa sayfa eskisi gibi açılır, yalnızca bu bölüm gizlenir.
  const [workPlanResult, addendaResult, installmentResult, messagesResult, trackingFlagResult] = await Promise.all([
    supabase.from("crm_contracts").select("work_plan").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("crm_contract_addenda").select("id,addendum_no,work_plan,payment_dates,note,status,created_at,responded_at,responder_name,responder_ip,responder_user_agent,response_note").eq("contract_id", id).eq("organization_id", membership.organization_id).order("addendum_no", { ascending: true }),
    data.payment_plan_id
      ? supabase.from("payment_installments").select("installment_no,due_date,amount,status").eq("payment_plan_id", data.payment_plan_id).eq("organization_id", membership.organization_id).order("installment_no", { ascending: true })
      : Promise.resolve({ data: [] as { installment_no: number; due_date: string | null; amount: number; status: string | null }[] }),
    supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at").eq("contract_id", id).eq("organization_id", membership.organization_id).order("created_at", { ascending: true }).limit(200),
    supabase.from("crm_contracts").select("tracking_open_before_signature").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle(),
  ]);
  const customerMessages = (messagesResult.data ?? []) as { id: string; sender_type: "customer" | "staff"; sender_name: string; body: string; created_at: string; read_at: string | null }[];
  const unreadMessages = customerMessages.filter((message) => message.sender_type === "customer" && !message.read_at).length;
  const messagingOpen = !["rejected", "cancelled"].includes(data.status);
  // İmza öncesi takip sözleşme bazında açılır (varsayılan kapalı); imzalıda hep açık.
  // Ayar okunamazsa (migration yok) eski davranış: düğme gösterilmez.
  const trackingToggleable = !trackingFlagResult.error && ["draft", "sent"].includes(data.status);
  const trackingOpen = signed || Boolean((trackingFlagResult.data as { tracking_open_before_signature?: boolean } | null)?.tracking_open_before_signature);
  const planFeature = !workPlanResult.error && !addendaResult.error;
  const proposalJoin = Array.isArray(data.crm_proposals) ? data.crm_proposals[0] : data.crm_proposals;
  const storedSchedule = normalizePaymentSchedule(data.payment_schedule ?? proposalJoin?.payment_schedule ?? []);
  const contractWorkPlan = normalizeWorkPlan(workPlanResult.data?.work_plan);
  const addenda = normalizeAddenda(addendaResult.data);
  const acceptedPlan = [...addenda].reverse().find((addendum) => addendum.status === "accepted" && addendum.work_plan.length);
  const currentPlan = acceptedPlan?.work_plan ?? contractWorkPlan;
  const pendingAddendum = addenda.find((addendum) => addendum.status === "sent");
  const installments: AddendumInstallment[] = ((installmentResult.data ?? []) as { installment_no: number; due_date: string | null; amount: number; status: string | null }[]).map((row) => {
    const item = storedSchedule.find((scheduleItem) => scheduleItem.sequence === row.installment_no);
    return { sequence: row.installment_no, label: installmentLabel(item?.label, row.installment_no), amount: Number(row.amount), due_date: row.due_date, trigger: item?.trigger || null, status: row.status };
  });
  const paymentRows = installments.length
    ? installments.map((row) => ({ sequence: row.sequence, label: row.label, amount: row.amount, when: date(row.due_date), status: INSTALLMENT_LABELS[row.status ?? ""] ?? null, missing: false }))
    : storedSchedule.map((row) => ({ sequence: row.sequence, label: row.label, amount: row.amount, when: row.due_date ? date(row.due_date) : row.trigger || "Tarih ve koşul yok", status: null, missing: !row.due_date && !row.trigger }));
  const publicHost = await resolvePublicHost(supabase, membership.organization_id);
  // Sözleşme bağlantısı token'ı sabit; bir kez üretildikten sonra
  // sayfanın üstünde kalıcı gösteriliyor (teklif detayıyla aynı davranış).
  const shareUrl = data.share_token
    ? `https://${publicHost}/sozlesme/${data.share_token}`
    : "";
  const brandName = organizationBrandName({
    slug: organization.slug,
    displayName: organization.display_name,
    legalName: organization.name,
  });
  const messages = shareUrl
    ? contractMessages({
        organizationName: brandName,
        customerName: formatPersonName(customer?.customer_name),
        documentNo: data.contract_no,
        title: data.title,
        formattedAmount: money(Number(data.amount), data.currency || "TRY"),
        url: shareUrl,
      })
    : null;
  // Silme RLS politikası yalnızca owner/admin'e izin veriyor.
  const canDelete = ["owner", "admin"].includes(membership.role);
  return (
    <div className="crm-request-detail-page">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">CRM / SÖZLEŞME DETAYI</small><h1>{data.contract_no}</h1><p>{formatPersonName(customer?.customer_name)} · {data.title}</p></div>
        <Link className="panel-secondary" href="/panel/crm/contracts">Sözleşmelere Dön</Link>
      </div>
      {shareUrl ? (
        <section className="panel-card share-ready-card">
          <div className="share-ready-icon">✓</div>
          <div className="share-ready-body">
            <small className="panel-kicker">MÜŞTERİ BAĞLANTISI</small>
            <h2>Sözleşme bağlantısı</h2>
            <div className="share-ready-link">
              <span style={{ wordBreak: "break-all" }}>{shareUrl}</span>
            </div>
            <div className="panel-page-actions">
              {customer?.contact_email && messages ? (
                <ShareSendLink kind="contract" token={data.share_token} className="panel-primary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
                  ✉ E-posta ile gönder
                </ShareSendLink>
              ) : null}
              {messages ? (
                <ShareSendLink kind="contract" token={data.share_token} className="panel-secondary" newTab href={`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`}>
                  💬 WhatsApp ile gönder
                </ShareSendLink>
              ) : null}
              <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>
                👁 Önizle
              </a>
            </div>
          </div>
        </section>
      ) : null}
      <div className="crm-detail-split">
        <div className="crm-detail-main">
      <section className="panel-card crm-request-detail-card">
        <div className="crm-request-detail-heading"><div><span className="status-pill" data-tone={statusTone(data.status)}>{labels[data.status] ?? data.status}</span><h2>{data.title}</h2></div><strong>{money(data.amount, data.currency)}</strong></div>
        <dl className="crm-request-detail-grid">
          <div><dt>Müşteri</dt><dd>{customer?.customer_name || "—"}</dd></div>
          <div><dt>Temsilci</dt><dd>{representative}</dd></div>
          <div><dt>Telefon</dt><dd>{formatPhone(customer?.contact_phone) || "—"}</dd></div>
          <div><dt>E-posta</dt><dd>{customer?.contact_email || "—"}</dd></div>
          <div><dt>Ödeme planı</dt><dd>{data.payment_plan || "—"}</dd></div>
          <div><dt>Başlangıç</dt><dd>{date(data.start_date)}</dd></div>
          <div><dt>Teslim</dt><dd>{date(data.due_date)}</dd></div>
          <div><dt>İmzalayan</dt><dd>{data.signed_name || "Bekleniyor"}</dd></div>
          <div><dt>Takip kodu</dt><dd>{data.tracking_code || "—"}</dd></div>
          <div><dt>Görüntülenme</dt><dd>{data.view_count || 0} kez</dd></div>
        </dl>
        {data.scope ? <div className="crm-request-detail-note"><small>KAPSAM</small><p>{data.scope}</p></div> : null}
        <div className="crm-request-detail-actions">
          <small className="panel-kicker">İŞLEMLER</small>
          <div>
          {!locked ? <form action={issueContractLink}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="redirect_to" value={`/panel/crm/contracts/${data.id}`}/><button className="panel-primary">İmzaya Gönder</button></form> : null}
          {data.workflow_id ? <Link className="panel-secondary" href={`/panel/operations/${data.workflow_id}`}>İş Akışını Aç</Link> : null}
          {!locked ? (
            <PanelDrawer triggerLabel="Düzenle" title={data.contract_no} description="Sözleşme bilgilerini kontrol edin.">
            <form className="panel-form" action={updateContract}>
              <input type="hidden" name="contract_id" value={data.id} />
              <input
                type="hidden"
                name="opportunity_id"
                value={customer?.id ?? ""}
              />
              <input
                type="hidden"
                name="current_details"
                value={JSON.stringify(customer?.request_details ?? {})}
              />
              <p className="wide panel-form-note">
                Müşteri / Talep Bilgileri
              </p>
              <label>
                Müşteri adı
                <input
                  name="customer_name"
                  defaultValue={customer?.customer_name ?? ""}
                />
              </label>
              <label>
                Telefon
                <input
                  name="contact_phone"
                  defaultValue={customer?.contact_phone ?? ""}
                />
              </label>
              <label>
                E-posta
                <input
                  name="contact_email"
                  defaultValue={customer?.contact_email ?? ""}
                />
              </label>
              <label>
                Hizmet türü
                <input
                  name="service_type"
                  defaultValue={String(
                    customer?.request_details?.service_type ?? "",
                  )}
                />
              </label>
              <label>
                Akademik seviye
                <input
                  name="academic_level"
                  defaultValue={String(
                    customer?.request_details?.academic_level ?? "",
                  )}
                />
              </label>
              <label>
                Üniversite
                <input
                  name="university"
                  defaultValue={String(
                    customer?.request_details?.university ?? "",
                  )}
                />
              </label>
              <label>
                Bölüm
                <input
                  name="department"
                  defaultValue={String(
                    customer?.request_details?.department ?? "",
                  )}
                />
              </label>
              <p className="wide panel-form-note">Sözleşme Bilgileri</p>
              <label>
                Başlık
                <input name="title" defaultValue={data.title} required />
              </label>
              <label>
                Tutar
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(data.amount / 100).toFixed(2)}
                  required
                />
              </label>
              <label className="wide">
                Kapsam
                <textarea
                  name="scope"
                  defaultValue={data.scope ?? ""}
                  required
                />
              </label>
              <label>
                Ödeme planı
                <input
                  name="payment_plan"
                  defaultValue={data.payment_plan ?? ""}
                />
              </label>
              <label>
                Başlangıç
                <input
                  name="start_date"
                  type="date"
                  defaultValue={data.start_date ?? ""}
                />
              </label>
              <label>
                Teslim
                <input
                  name="due_date"
                  type="date"
                  defaultValue={data.due_date ?? ""}
                />
              </label>
              <label className="wide">
                Adres{" "}
                <small
                  style={{ fontWeight: 400, color: "var(--muted)" }}
                >
                  (kurumsal müşteri için)
                </small>
                <input
                  name="customer_address"
                  defaultValue={data.customer_address ?? ""}
                  placeholder="Fatura/sözleşme adresi"
                />
              </label>
              <label>
                Vergi numarası
                <input
                  name="customer_tax_number"
                  defaultValue={data.customer_tax_number ?? ""}
                  placeholder="VKN / TCKN"
                />
              </label>
              <label>
                Vergi dairesi
                <input
                  name="customer_tax_office"
                  defaultValue={data.customer_tax_office ?? ""}
                />
              </label>
              <div className="wide panel-form-actions">
                <button className="panel-primary">Kaydet</button>
              </div>
            </form>
            </PanelDrawer>
          ) : null}
            <PanelDrawer
                                      triggerLabel="Takip Kodu"
                                      title={data.contract_no}
                                      description="Müşteri bu kodla kendi iş durumunu görebilir."
                                    >
                                      {(() => {
                                        const trackingUrl = `https://${publicHost}/takip`;
                                        const waText = `Merhaba ${customer?.customer_name ?? ""},\n\n${brandName} üzerinden yürütülen dosyanızın güncel durumunu aşağıdaki bağlantıdan takip edebilirsiniz:\n\n${trackingUrl}\n\nTakip Kodunuz: ${data.tracking_code}\n\nBağlantıyı açtıktan sonra 6 haneli takip kodunuzu girerek dosyanızın mevcut durumunu görüntüleyebilirsiniz.\n\n${brandName}`;
                                        return (
                                          <div className="crm-request-preview">
                                            <p>
                                              <b>Takip Kodu</b>
                                            </p>
                                            <p
                                              style={{
                                                fontSize: 20,
                                                fontWeight: 800,
                                                letterSpacing: 3,
                                              }}
                                            >
                                              {data.tracking_code}
                                            </p>
                                            <p style={{ wordBreak: "break-all" }}>
                                              {trackingUrl}
                                            </p>
                                            {trackingToggleable ? (
                                              <div className="tracking-toggle">
                                                <p>
                                                  <b>İmza öncesi takip: {trackingOpen ? "Açık" : "Kapalı"}</b>
                                                  <br />
                                                  {trackingOpen
                                                    ? "Müşteri sözleşmeyi imzalamadan takip ekranına girebilir; teklifi onaylayabilir, soru sorabilir ve sözleşmeyi oradan imzalamaya gidebilir."
                                                    : "Müşteri takip ekranına sözleşmeyi imzaladıktan sonra girebilir. Bu müşteriye imzadan önce açmak için takibi açın."}
                                                </p>
                                                <form action={setTrackingBeforeSignature}>
                                                  <input type="hidden" name="contract_id" value={data.id} />
                                                  <input type="hidden" name="open" value={trackingOpen ? "0" : "1"} />
                                                  <button className={trackingOpen ? "panel-secondary" : "panel-primary"} type="submit">{trackingOpen ? "Takibi kapat" : "Takibi aç"}</button>
                                                </form>
                                              </div>
                                            ) : null}
                                            {trackingOpen || !trackingToggleable ? (
                                            <div className="panel-page-actions">
                                              <a
                                                className="panel-primary"
                                                target="_blank"
                                                rel="noreferrer"
                                                href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                                              >
                                                WhatsApp ile gönder
                                              </a>
                                              <a
                                                className="panel-secondary"
                                                target="_blank"
                                                rel="noreferrer"
                                                href={`${trackingUrl}?code=${encodeURIComponent(data.tracking_code)}`}
                                              >
                                                Önizle
                                              </a>
                                            </div>
                                            ) : null}
                                          </div>
                                        );
                                      })()}
                                    </PanelDrawer>
          {/* İmzalı sözleşme veritabanında donmuş; değişiklik Ek Protokol ile */}
          {!locked ? (
            <PanelDrawer
              triggerLabel="Ödeme Planı"
              title={data.contract_no}
              description="Müşteri talebiyle ödeme planını ve vade tarihlerini revize edin."
            >
              <ContractPaymentPlanForm
                contractId={data.id}
                amountCents={data.amount}
                currentPlanType={data.payment_plan_type}
                currentSchedule={data.payment_schedule ?? proposalJoin?.payment_schedule ?? []}
              />
            </PanelDrawer>
          ) : null}
          {!locked && planFeature ? (
            <PanelDrawer triggerLabel="İş Planı" title={data.contract_no} description="Ara teslim takvimini sözleşmeye yazın (madde 4).">
              <ContractWorkPlanForm contractId={data.id} initial={contractWorkPlan} />
            </PanelDrawer>
          ) : null}
          {signed && planFeature ? (
            <PanelDrawer triggerLabel="Ek Protokol" title={`${data.contract_no} · Ek Protokol`} description="Ara teslim takvimini ve taksit vadelerini müşterinin onayına sunun.">
              {pendingAddendum ? (
                <p className="plan-form-hint">Ek Protokol {pendingAddendum.addendum_no} müşterinin onayını bekliyor. Yenisini göndermek için önce onu “İş planı ve ödeme takvimi” bölümünden geri çekin.</p>
              ) : (
                <ContractAddendumForm contractId={data.id} installments={installments} initialPlan={currentPlan} />
              )}
            </PanelDrawer>
          ) : null}
          {!locked ? <form action={markContractStatus}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="status" value="rejected"/><button className="panel-secondary">Reddedildi</button></form> : null}
          {!locked ? <form action={markContractStatus}><input type="hidden" name="contract_id" value={data.id}/><input type="hidden" name="status" value="cancelled"/><button className="panel-secondary">İptal</button></form> : null}
          {canDelete ? <form action={deleteContract}><input type="hidden" name="contract_id" value={data.id}/><ConfirmDeleteButton label="Sil" confirmMessage={`${data.contract_no} sözleşmesini kalıcı olarak silmek istediğinize emin misiniz?`}/></form> : null}
          </div>
        </div>
      </section>
      <section className="panel-card crm-request-detail-card" aria-labelledby="contract-plan-title">
        <div className="crm-request-detail-heading">
          <div><small className="panel-kicker">ARA TESLİMLER VE VADELER</small><h2 id="contract-plan-title">İş planı ve ödeme takvimi</h2></div>
          {pendingAddendum ? <span className="status-pill" data-tone={statusTone("pending")}>Ek protokol onay bekliyor</span> : null}
        </div>
        {!planFeature ? (
          <p className="plan-form-hint">İş planı ve ek protokol için veritabanı güncellemesi (20260914090000_contract_work_plan_addenda) henüz uygulanmadı.</p>
        ) : (
          <>
            {currentPlan.length ? (
              <ol className="plan-timeline">
                {currentPlan.map((item) => <li key={item.sequence}><time dateTime={item.due_date}>{date(item.due_date)}</time><span>{item.title}</span></li>)}
              </ol>
            ) : (
              <p className="plan-form-hint">
                {signed
                  ? "Bu sözleşmede ara teslim takvimi yok. Müşteriyle netleştirdiğiniz takvimi “Ek Protokol” ile onaya sunun."
                  : "Henüz ara teslim takvimi yok. “İş Planı” ile ekleyin; takvim sözleşmenin 4. maddesinde gösterilir."}
              </p>
            )}
            {acceptedPlan ? <p className="plan-form-hint">Geçerli takvim Ek Protokol {acceptedPlan.addendum_no} ile belirlendi ({dateTime(acceptedPlan.responded_at)} tarihinde müşteri onayladı).</p> : null}
          </>
        )}
        {paymentRows.length ? (
          <div className="crm-request-detail-note">
            <small>ÖDEME TAKVİMİ</small>
            <ol className="plan-timeline">
              {paymentRows.map((row) => (
                <li key={row.sequence}>
                  <time>{row.when}</time>
                  <span>{row.label} · {money(row.amount, data.currency)}{row.status ? ` · ${row.status}` : ""}{row.missing ? " · ödeme planından vade tarihi girin" : ""}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {planFeature && addenda.length ? (
          <ul className="plan-addenda">
            {addenda.map((addendum) => {
              const reminder = shareUrl
                ? `Merhaba ${formatPersonName(customer?.customer_name)},\n\n${data.contract_no} numaralı sözleşmenize ait Ek Protokol ${addendum.addendum_no} (iş planı ve ödeme takvimi) onayınıza sunulmuştur. Aşağıdaki bağlantıdan inceleyip onaylayabilir ya da değişiklik isteyebilirsiniz:\n\n${shareUrl}#ek-protokoller\n\n${brandName}`
                : "";
              return (
                <li key={addendum.id}>
                  <div className="plan-addenda-head">
                    <strong>Ek Protokol {addendum.addendum_no}</strong>
                    <span className="status-pill" data-tone={statusTone(ADDENDUM_TONES[addendum.status])}>{ADDENDUM_STATUS_LABELS[addendum.status]}</span>
                  </div>
                  <small>{dateTime(addendum.created_at)} · {addendum.work_plan.length} ara teslim · {addendum.payment_dates.length} vade değişikliği</small>
                  {addendum.status === "accepted" ? <p>{addendum.responder_name} · {dateTime(addendum.responded_at)} · IP {addendum.responder_ip || "—"}</p> : null}
                  {addendum.status === "rejected" ? <p>Müşterinin talebi: “{addendum.response_note || "—"}” · {dateTime(addendum.responded_at)}. Takvimi güncelleyip yeni bir ek protokol gönderin.</p> : null}
                  {addendum.status === "sent" ? (
                    <div className="panel-page-actions">
                      {reminder && customer?.contact_email ? (
                        <a className="panel-secondary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(`${data.contract_no} · Ek Protokol ${addendum.addendum_no} onayınıza sunuldu`)}&body=${encodeURIComponent(reminder)}`}>✉ E-posta ile gönder</a>
                      ) : null}
                      {reminder ? <a className="panel-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(reminder)}`}>💬 WhatsApp ile gönder</a> : null}
                      <form action={cancelContractAddendum}><input type="hidden" name="addendum_id" value={addendum.id} /><button className="panel-secondary">Geri çek</button></form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
      <section className="panel-card crm-request-detail-card" id="musteri-mesajlari" aria-labelledby="contract-messages-title">
        <div className="crm-request-detail-heading">
          <div><small className="panel-kicker">TAKİP EKRANI</small><h2 id="contract-messages-title">Müşteri mesajları</h2></div>
          {unreadMessages ? <span className="status-pill" data-tone="danger">{unreadMessages} yeni</span> : <span className="status-pill">{customerMessages.length} mesaj</span>}
        </div>
        {customerMessages.length ? (
          <div className="contract-chat">
            {customerMessages.map((message) => {
              const fromCustomer = message.sender_type === "customer";
              return (
                <article key={message.id} className={`contract-bubble ${fromCustomer ? "is-customer" : "is-staff"}`}>
                  <header>
                    <b>{fromCustomer ? formatPersonName(customer?.customer_name) || "Müşteri" : formatPersonName(message.sender_name)}</b>
                    <time>{dateTime(message.created_at)}</time>
                    {fromCustomer && !message.read_at ? <em>Yeni</em> : null}
                  </header>
                  <p>{message.body}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="plan-form-hint">Müşteri henüz mesaj yazmadı. Takip kodunu paylaştığınızda müşteri, sözleşmeyi imzalamadan önce de takip ekranından soru sorabilir.</p>
        )}
        {messagingOpen ? (
          <form className="contract-reply" action={replyContractMessage}>
            <input type="hidden" name="contract_id" value={data.id} />
            <textarea name="body" required minLength={2} maxLength={2000} placeholder="Müşteriye yanıt yazın…" aria-label="Müşteriye yanıt" />
            <div><small>Yanıt müşterinin takip ekranında görünür.{data.workflow_id ? " İş başladığı için mesajlar iş detayında da görünür." : ""}</small><button className="panel-primary" type="submit">Yanıtı gönder</button></div>
          </form>
        ) : null}
      </section>
          <RecordHistory opportunityId={data.opportunity_id} />
        </div>
        <aside className="crm-detail-side">
  <InternalComments opportunityId={data.opportunity_id} contextType="contract" contextId={data.id} />
        </aside>
      </div>
    </div>
  );
}
