import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { BelgeMetniDugmesi } from "../../belge-metni-dugmesi";
import { waMeAdresi } from "@/lib/wa-me";
import { SOZLESME_ADIMLARI, sozlesmeAdimi } from "@/lib/sozlesme-asamalari";
import { AbonelikAlanlari } from "./abonelik-alanlari";
import { WhatsappGonderDugmesi } from "../../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../../share-send-link";
import { formatPhone } from "@/lib/format-phone";
import { workflowStatusNames } from "../../../operations/ops-shared";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { netTahsilat, taksitleriDagit, type TaksitDurumu } from "@/lib/taksit-dagitimi";
import { formatSubject } from "@/lib/table-format";
import { proposalStatusLabel } from "../../status-labels";
import { teklifGrubu, TEKLIF_GRUP_ADLARI } from "@/lib/teklif-grubu";
import { CONTRACT_STATUS_LABELS as labels } from "../../status-labels";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import { deleteContract, issueContractLink, markContractStatus, updateContract } from "../../contract-actions";
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
import { TalepAkis } from "../../kayit-detay/kayit-akis";
import "../../request-page.css";
import "../../crm.css";
import "../../kayit-detay/kayit-detay.css";

/*
  SÖZLEŞME DETAYI (2026-10): talep ve teklif detayıyla aynı üç sütun.

  Üstte sözleşme no, başlık, durumuna göre asıl işlem (taslakta "İmzaya
  gönder", iş akışı açıldıysa "İşe git") ve "⋯" menüsü; altında aşama
  çizgisi. Solda müşteri, imza bağlantısı ve takip kodu; ortada tutar,
  tarihler, kapsam, iş planı ve ödeme takvimi; sağda müşteri mesajları,
  yorumlar ve kayıt geçmişi.

  Eskiden bağlantı kartı en üstte ayrı duruyor, on bir işlem düğmesi
  10 alanlık tablonun altında yan yana diziliyor, mesajlar ve kayıt
  geçmişi sayfanın en altındaydı.
*/

type Props = { params: Promise<{ id: string }> };
const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR") : "—";
const tarih = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : null;
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) : "—";
// Ek protokol rozet tonu: bekleyen sarı, onaylı yeşil, değişiklik talebi turuncu, geri çekilen gri.
const ADDENDUM_TONES: Record<string, string> = { sent: "pending", accepted: "accepted", rejected: "blocked", cancelled: "archived" };
// Taksit durumu cari dökümünden türetiliyor (lib/taksit-dagitimi.ts).
const TAKSIT_ADLARI: Record<TaksitDurumu, string> = { odendi: "Ödendi", kismi: "Kısmen ödendi", bekliyor: "Bekliyor", gecikti: "Gecikti", iptal: "İptal" };

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, membership, modules, organization, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,title,scope,amount,currency,payment_plan,payment_plan_type,start_date,due_date,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,share_token,signed_name,signed_at,workflow_id,tracking_code,customer_address,customer_tax_number,customer_tax_office,subscription_intent,opportunity_id,payment_schedule,payment_plan_id,party_id,crm_proposals(id,proposal_no,status,archive_reason,payment_schedule),crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (error) throw new Error("Sözleşme bilgileri okunamadı: " + error.message);
  if (!data) notFound();
  const customer = Array.isArray(data.crm_opportunities) ? data.crm_opportunities[0] : data.crm_opportunities;
  let representative: string | null = null;
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
  /*
    ÖDEME ÖZETİ: kaç taksitin ve ne kadarının ödendiği, vadesi geçen.
    Taksitin kendi status sütunu cari tahsilatıyla güncellenmiyor (tahsil
    edilmiş taksit "ödenmedi" görünüyordu). Sözleşmenin carisi varsa
    durumlar cari dökümünden türetilir: carinin net tahsilatı, carinin
    BÜTÜN sözleşmelerinin taksitlerine en eski vadeden dağıtılır (cari
    detayıyla aynı kural, lib/taksit-dagitimi.ts); burada bu sözleşmenin
    taksitlerine düşen sonuç gösterilir. Carisi yoksa taksitin kendi durumu.
  */
  const bugunAnahtari = todayInIstanbul();
  let taksitSonucu: Map<number, { odenen: number; kalan: number; durum: TaksitDurumu }> | null = null;
  if (data.party_id && data.payment_plan_id && installments.length) {
    const [{ data: hareketler }, { data: cariSozlesmeler }] = await Promise.all([
      supabase.from("account_entries").select("entry_type,source_type,amount").eq("organization_id", membership.organization_id).eq("party_id", data.party_id),
      supabase.from("crm_contracts").select("payment_plan_id").eq("organization_id", membership.organization_id).eq("party_id", data.party_id).in("status", ["signed", "completed"]),
    ]);
    const planIds = [...new Set([data.payment_plan_id, ...((cariSozlesmeler ?? []) as { payment_plan_id: string | null }[]).map((c) => c.payment_plan_id).filter((v): v is string => Boolean(v))])];
    const { data: tumTaksitler } = await supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status").eq("organization_id", membership.organization_id).in("payment_plan_id", planIds);
    if (hareketler && tumTaksitler) {
      const dagilim = taksitleriDagit(tumTaksitler as { id: string; payment_plan_id: string; installment_no: number; due_date: string | null; amount: number; status: string }[], netTahsilat(hareketler as { entry_type: string; source_type: string | null; amount: number }[]), bugunAnahtari);
      taksitSonucu = new Map(dagilim.filter((t) => t.payment_plan_id === data.payment_plan_id).map((t) => [t.installment_no, { odenen: t.odenen, kalan: t.kalan, durum: t.durum }]));
    }
  }
  const taksitDurumu = (row: AddendumInstallment): { odenen: number; durum: TaksitDurumu } => {
    const sonuc = taksitSonucu?.get(row.sequence);
    if (sonuc) return sonuc;
    if (row.status === "paid") return { odenen: row.amount, durum: "odendi" };
    if (row.status === "cancelled") return { odenen: 0, durum: "iptal" };
    return { odenen: 0, durum: row.due_date && row.due_date < bugunAnahtari ? "gecikti" : "bekliyor" };
  };
  const odenen = installments.filter((row) => taksitDurumu(row).durum === "odendi");
  const odenenTutar = installments.reduce((sum, row) => sum + taksitDurumu(row).odenen, 0);
  const taksitToplami = installments.reduce((sum, row) => sum + row.amount, 0);
  /*
    BAĞLANTILAR (teklif detayıyla eşitleme): talep, kaynak teklif ve iş.
    İşin durumu ve ilerlemesi ayrı okunur; okunamazsa (yetki, RLS) yalnızca
    bağlantı gösterilir.
  */
  const { data: isData } = data.workflow_id
    ? await supabase.from("operation_workflows").select("id,status,operation_steps(is_completed)").eq("id", data.workflow_id).eq("organization_id", membership.organization_id).maybeSingle()
    : { data: null };
  const is = isData as { id: string; status: string; operation_steps: { is_completed: boolean }[] | null } | null;
  const isAdimlari = is?.operation_steps ?? [];
  const isIlerleme = isAdimlari.length ? Math.round((isAdimlari.filter((a) => a.is_completed).length / isAdimlari.length) * 100) : null;
  const kaynakTeklif = proposalJoin as { id?: string; proposal_no?: string; status?: string; archive_reason?: string | null } | null;
  const gecikenTaksit = installments.filter((row) => taksitDurumu(row).durum === "gecikti").length;
  const paymentRows = installments.length
    ? installments.map((row) => ({ sequence: row.sequence, label: row.label, amount: row.amount, when: date(row.due_date), status: TAKSIT_ADLARI[taksitDurumu(row).durum] + (taksitDurumu(row).durum !== "odendi" && taksitDurumu(row).odenen > 0 ? ` (${money(taksitDurumu(row).odenen, data.currency)} ödendi)` : ""), missing: false }))
    : storedSchedule.map((row) => ({ sequence: row.sequence, label: row.label, amount: row.amount, when: row.due_date ? date(row.due_date) : row.trigger || "Tarih ve koşul yok", status: null, missing: !row.due_date && !row.trigger }));
  /* Kendi numarasını bağlamamış kurumda eski usul sürüyor: sözleşmeyi
     Arvo'nun numarasından yollamak, müşteriye tanımadığı bir numaradan
     imza bağlantısı göndermek olurdu. */
  // Abonelik alanları yalnızca Arvo'nun kendi kurumunda çiziliyor.
  const arvoKurumu = await arvoKurumuMu(supabase, membership.organization_id);

  const waDurum = await getWhatsappStatus(membership.organization_id);
  const gonderimYolu = belgeGonderimYolu({
    kendiNumarasiBagli: waDurum.connected && waDurum.status !== "disabled",
    arvoKurumu,
  });

  const publicHost = await resolvePublicHost(supabase, membership.organization_id);
  // Sözleşme bağlantısı token'ı sabit; bir kez üretildikten sonra
  // kalıcı gösteriliyor (teklif detayıyla aynı davranış).
  const shareUrl = data.share_token
    ? `https://${publicHost}/sozlesme/${data.share_token}`
    : "";
  const brandName = organizationBrandName({
    slug: organization.slug,
    displayName: organization.display_name,
    legalName: organization.name,
  });
  const musteri: string = formatPersonName(customer?.customer_name) || customer?.customer_name || "Müşteri";
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
  const canDelete = izin("crm.sozlesme.sil");
  const { adim, kapanis } = sozlesmeAdimi({ status: data.status, view_count: data.view_count, workflow_id: data.workflow_id });
  const trackingUrl = `https://${publicHost}/takip`;
  const takipMetni = `Merhaba ${customer?.customer_name ?? ""},\n\n${brandName} üzerinden yürütülen dosyanızın güncel durumunu aşağıdaki bağlantıdan takip edebilirsiniz:\n\n${trackingUrl}\n\nTakip Kodunuz: ${data.tracking_code}\n\nBağlantıyı açtıktan sonra 6 haneli takip kodunuzu girerek dosyanızın mevcut durumunu görüntüleyebilirsiniz.\n\n${brandName}`;
  const imzayaGonder = (
    <form action={issueContractLink}>
      <input type="hidden" name="contract_id" value={data.id} />
      <input type="hidden" name="redirect_to" value={`/panel/crm/contracts/${data.id}`} />
      <button className="panel-primary">İmzaya gönder</button>
    </form>
  );

  const bilgiler: [string, React.ReactNode][] = [
    ["Başlangıç", tarih(data.start_date) ?? <em>Belirtilmedi</em>],
    ["Teslim", tarih(data.due_date) ?? <em>Belirtilmedi</em>],
    ["İmzalayan", data.signed_name ? `${data.signed_name}${data.signed_at ? ` · ${dateTime(data.signed_at)}` : ""}` : <em>Bekleniyor</em>],
    ["Ödeme planı", data.payment_plan || <em>Belirtilmedi</em>],
    ["Gönderim", tarih(data.sent_at) ?? <em>Gönderilmedi</em>],
    ["Görüntülenme", data.view_count ? `${data.view_count} kez${data.last_viewed_at ? ` · son ${tarih(data.last_viewed_at)}` : ""}` : <em>Açılmadı</em>],
  ];

  return (
    <main className="crm-page-stack crm-request-detail-page talep">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{data.contract_no}</small>
          <h1>{data.title}</h1>
        </div>
        <div className="talep-bas-eylem">
          {data.workflow_id ? (
            <Link className="panel-primary" href={`/panel/operations/${data.workflow_id}`}>İşe git</Link>
          ) : !locked && !shareUrl ? imzayaGonder : null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              {!locked ? (
                <PanelDrawer triggerLabel="Düzenle" title={data.contract_no} description="Sözleşme bilgilerini kontrol edin." triggerClassName="os-menu-item">
                  <form className="panel-form" action={updateContract}>
                    <input type="hidden" name="contract_id" value={data.id} />
                    <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                    <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />
                    <p className="wide panel-form-note">Müşteri / Talep Bilgileri</p>
                    <label>
                      Müşteri adı
                      <input name="customer_name" defaultValue={customer?.customer_name ?? ""} />
                    </label>
                    <label>
                      Telefon
                      <input name="contact_phone" defaultValue={customer?.contact_phone ?? ""} />
                    </label>
                    <label>
                      E-posta
                      <input name="contact_email" defaultValue={customer?.contact_email ?? ""} />
                    </label>
                    <label>
                      Hizmet türü
                      <input name="service_type" defaultValue={String(customer?.request_details?.service_type ?? "")} />
                    </label>
                    <label>
                      Akademik seviye
                      <input name="academic_level" defaultValue={String(customer?.request_details?.academic_level ?? "")} />
                    </label>
                    <label>
                      Üniversite
                      <input name="university" defaultValue={String(customer?.request_details?.university ?? "")} />
                    </label>
                    <label>
                      Bölüm
                      <input name="department" defaultValue={String(customer?.request_details?.department ?? "")} />
                    </label>
                    <p className="wide panel-form-note">Sözleşme Bilgileri</p>
                    <label>
                      Başlık
                      <input name="title" defaultValue={data.title} required />
                    </label>
                    <label>
                      Tutar
                      <input name="amount" type="number" step="0.01" min="0" defaultValue={(data.amount / 100).toFixed(2)} required />
                    </label>
                    <label className="wide">
                      Kapsam
                      <textarea name="scope" defaultValue={data.scope ?? ""} required />
                    </label>
                    <label>
                      Ödeme planı
                      <input name="payment_plan" defaultValue={data.payment_plan ?? ""} />
                    </label>
                    <label>
                      Başlangıç
                      <input name="start_date" type="date" defaultValue={data.start_date ?? ""} />
                    </label>
                    <label>
                      Teslim
                      <input name="due_date" type="date" defaultValue={data.due_date ?? ""} />
                    </label>
                    <label className="wide">
                      Adres{" "}
                      <small style={{ fontWeight: 400, color: "var(--muted)" }}>(kurumsal müşteri için)</small>
                      <input name="customer_address" defaultValue={data.customer_address ?? ""} placeholder="Fatura/sözleşme adresi" />
                    </label>
                    <label>
                      Vergi numarası
                      <input name="customer_tax_number" defaultValue={data.customer_tax_number ?? ""} placeholder="VKN / TCKN" />
                    </label>
                    <label>
                      Vergi dairesi
                      <input name="customer_tax_office" defaultValue={data.customer_tax_office ?? ""} />
                    </label>
                    {/* Yalnızca Arvo'nun kendi kurumunda: kiracının kendi
                        müşterisiyle yaptığı sözleşme bizim aboneliğimizi açmaz. */}
                    {arvoKurumu ? <AbonelikAlanlari niyet={data.subscription_intent} /> : null}
                    <div className="wide panel-form-actions">
                      <button className="panel-primary">Kaydet</button>
                    </div>
                  </form>
                </PanelDrawer>
              ) : null}
              {/* İmzalı sözleşme veritabanında donmuş; değişiklik Ek Protokol ile */}
              {!locked ? (
                <PanelDrawer triggerLabel="Ödeme planı" title={data.contract_no} description="Müşteri talebiyle ödeme planını ve vade tarihlerini revize edin." triggerClassName="os-menu-item">
                  <ContractPaymentPlanForm
                    contractId={data.id}
                    amountCents={data.amount}
                    currentPlanType={data.payment_plan_type}
                    currentSchedule={data.payment_schedule ?? proposalJoin?.payment_schedule ?? []}
                  />
                </PanelDrawer>
              ) : null}
              {!locked && planFeature ? (
                <PanelDrawer triggerLabel="İş planı" title={data.contract_no} description="Ara teslim takvimini sözleşmeye yazın (madde 4)." triggerClassName="os-menu-item">
                  <ContractWorkPlanForm contractId={data.id} initial={contractWorkPlan} />
                </PanelDrawer>
              ) : null}
              {signed && planFeature ? (
                <PanelDrawer triggerLabel="Ek protokol" title={`${data.contract_no} · Ek Protokol`} description="Ara teslim takvimini ve taksit vadelerini müşterinin onayına sunun." triggerClassName="os-menu-item">
                  {pendingAddendum ? (
                    <p className="plan-form-hint">Ek Protokol {pendingAddendum.addendum_no} müşterinin onayını bekliyor. Yenisini göndermek için önce onu “İş planı ve ödeme takvimi” bölümünden geri çekin.</p>
                  ) : (
                    <ContractAddendumForm contractId={data.id} installments={installments} initialPlan={currentPlan} />
                  )}
                </PanelDrawer>
              ) : null}
              <Link className="os-menu-item" href={`/panel/crm/requests/${data.opportunity_id}`}>Talebe git</Link>
              {!locked || canDelete ? (
                <PanelDrawer
                  triggerLabel={locked ? "Sözleşmeyi sil" : "Sözleşmeyi kapat"}
                  title={locked ? "Sözleşmeyi sil" : "Sözleşmeyi kapat"}
                  description={locked ? "Silme geri alınamaz." : "Sözleşmenin neden kapatıldığını seçin. Bu bilgi raporlarda kullanılıyor."}
                  triggerClassName="os-menu-item is-danger"
                >
                  {!locked ? (
                    <form className="panel-form" action={markContractStatus}>
                      <input type="hidden" name="contract_id" value={data.id} />
                      <label className="wide">
                        Kapanış sebebi
                        <select name="status" defaultValue="rejected" required>
                          <option value="rejected">Müşteri reddetti</option>
                          <option value="cancelled">İptal edildi</option>
                        </select>
                      </label>
                      <div className="wide panel-form-actions">
                        <button className="panel-primary">Sözleşmeyi kapat</button>
                      </div>
                    </form>
                  ) : null}
                  {canDelete ? (
                    <div className="panel-danger-zone">
                      <small className="panel-kicker">KALICI İŞLEM</small>
                      <p>Silme geri alınamaz ve sözleşme raporlardan da düşer. Kaydı yalnızca yanlışlıkla oluşturulduysa silin.</p>
                      <form action={deleteContract}>
                        <input type="hidden" name="contract_id" value={data.id} />
                        <ConfirmDeleteButton label="Sil" confirmMessage={`${data.contract_no} sözleşmesini kalıcı olarak silmek istediğinize emin misiniz?`} />
                      </form>
                    </div>
                  ) : null}
                </PanelDrawer>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      {/* Aşama çizgisi; reddedilen ve iptal edilende çizgi yerine sebep. */}
      {kapanis ? (
        <p className="talep-arsiv">
          <span className="status-pill" data-tone={statusTone(data.status)}>{labels[data.status] ?? data.status}</span>
          <span>{kapanis}</span>
        </p>
      ) : (
        <ol className="talep-asama" aria-label={`Durum: ${labels[data.status] ?? data.status}`}>
          {SOZLESME_ADIMLARI.map((ad, sira) => (
            <li key={ad} className={adim === null ? undefined : sira < adim ? "is-done" : sira === adim ? "is-current" : undefined} aria-current={sira === adim ? "step" : undefined}>
              <i aria-hidden="true" />
              <span>{ad}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="talep-izgara">
        {/* Müşteri, imza bağlantısı ve takip kodu */}
        <section className="panel-card talep-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              <small>Müşteri</small>
            </div>
          </div>
          <div className="talep-iletisim">
            {customer?.contact_phone ? <a className="panel-secondary" href={`tel:${customer.contact_phone}`}>Ara</a> : null}
            {customer?.contact_email ? <a className="panel-secondary" href={`mailto:${customer.contact_email}`}>E-posta</a> : null}
          </div>
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{formatPhone(customer?.contact_phone) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{customer?.contact_email || <em>Yok</em>}</dd></div>
            <div><dt>Temsilci</dt><dd>{representative ? formatPersonName(representative) : <em>Atanmamış</em>}</dd></div>
            {data.customer_tax_number ? <div><dt>Vergi no</dt><dd>{data.customer_tax_number}{data.customer_tax_office ? ` · ${data.customer_tax_office}` : ""}</dd></div> : null}
            {data.customer_address ? <div><dt>Adres</dt><dd>{data.customer_address}</dd></div> : null}
          </dl>

          {/* İMZA BAĞLANTISI. Eskiden sayfanın en üstünde ayrı bir kart ve
              tam adresle duruyordu; teklif detayında olduğu gibi müşteri
              kartının içinde. */}
          <div className="talep-gecmis">
            <h3>İmza bağlantısı</h3>
            {shareUrl ? (
              <>
                <p className="teklif-baglanti" title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</p>
                <div className="talep-iletisim">
                  {customer?.contact_email && messages ? (
                    <ShareSendLink kind="contract" token={data.share_token} className="panel-secondary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
                      E-posta ile gönder
                    </ShareSendLink>
                  ) : null}
                  {gonderimYolu === "panel" ? (
                    <WhatsappGonderDugmesi kind="contract" token={data.share_token} musteriAdi={musteri} />
                  ) : messages ? (
                    <ShareSendLink kind="contract" token={data.share_token} className="panel-secondary" newTab href={waMeAdresi(customer?.contact_phone, messages.whatsapp)}>
                      WhatsApp ile gönder
                    </ShareSendLink>
                  ) : null}
                  <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>Önizle</a>
                </div>
              </>
            ) : locked ? (
              <p className="talep-bos">Bu sözleşme için bağlantı oluşturulmamış.</p>
            ) : (
              <p className="talep-bos">Henüz oluşturulmadı. “İmzaya gönder” bağlantıyı oluşturur; sonra e-posta ya da WhatsApp ile gönderilir.</p>
            )}
          </div>

          {/* BAĞLANTILAR: talep, kaynak teklif ve iş; teklif detayındakiyle aynı blok. */}
          <div className="talep-gecmis">
            <h3>Bağlantılar</h3>
            <ul>
              <li>
                <Link href={`/panel/crm/requests/${data.opportunity_id}`}>
                  <span className="talep-gecmis-metin"><b>Talep</b><small>{formatSubject(customer?.title) || "Talebe git"}</small></span>
                </Link>
              </li>
              {kaynakTeklif?.id ? (
                <li>
                  <Link href={`/panel/crm/proposals/${kaynakTeklif.id}`}>
                    <span className="talep-gecmis-metin">
                      <b>Teklif {kaynakTeklif.proposal_no}</b>
                      <small>{kaynakTeklif.status ? TEKLIF_GRUP_ADLARI[teklifGrubu({ status: kaynakTeklif.status, archive_reason: kaynakTeklif.archive_reason ?? null, superseded_by: null })] ?? proposalStatusLabel(kaynakTeklif.status) : "Teklif"}</small>
                    </span>
                  </Link>
                </li>
              ) : null}
              {data.workflow_id ? (
                <li>
                  <Link href={`/panel/operations/${data.workflow_id}`}>
                    <span className="talep-gecmis-metin">
                      <b>İş</b>
                      <small>{is ? `${workflowStatusNames[is.status] ?? is.status}${isIlerleme !== null ? ` · %${isIlerleme}` : ""}` : "İşe git"}</small>
                    </span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>

          {/* TAKİP KODU. Müşteri bu kodla takip ekranında iş durumunu görür
              ve mesaj yazar. Eskiden işlem düğmelerinin arasında duruyordu. */}
          {data.tracking_code ? (
            <div className="talep-gecmis">
              <h3>Takip ekranı</h3>
              <p className="sozlesme-takip-kod">{data.tracking_code}</p>
              <p className="talep-gecmis-ozet">{trackingOpen ? "Müşteri takip ekranına girebilir." : "İmzadan sonra açılır."}</p>
              <div className="talep-iletisim">
                <PanelDrawer triggerLabel="Takip kodunu gönder" title={data.contract_no} description="Müşteri bu kodla kendi iş durumunu görebilir." triggerClassName="panel-secondary">
                  <div className="crm-request-preview">
                    <p><b>Takip Kodu</b></p>
                    <p style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3 }}>{data.tracking_code}</p>
                    <p style={{ wordBreak: "break-all" }}>{trackingUrl}</p>
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
                        {/* Numara bağlamamış kurumda eski usul sürüyor. */}
                        {gonderimYolu === "panel" ? (
                          <BelgeMetniDugmesi
                            kind="contract"
                            token={data.share_token}
                            metin={takipMetni}
                            className="panel-primary"
                            etiket="WhatsApp ile gönder"
                            onayMetni={`Takip kodu ${formatPersonName(customer?.customer_name) || "müşteriye"} WhatsApp'tan gönderilsin mi?`}
                          />
                        ) : (
                          <a className="panel-primary" target="_blank" rel="noreferrer" href={waMeAdresi(customer?.contact_phone, takipMetni)}>WhatsApp ile gönder</a>
                        )}
                        <a className="panel-secondary" target="_blank" rel="noreferrer" href={`${trackingUrl}?code=${encodeURIComponent(data.tracking_code)}`}>Önizle</a>
                      </div>
                    ) : null}
                  </div>
                </PanelDrawer>
              </div>
            </div>
          ) : null}
        </section>

        {/* Sözleşme */}
        <section className="panel-card talep-bilgi" aria-label="Sözleşme bilgileri">
          <div className="teklif-tutar">
            <div>
              <h2>Sözleşme tutarı</h2>
              <strong>{money(Number(data.amount), data.currency || "TRY")}</strong>
            </div>
            {pendingAddendum ? <span className="status-pill" data-tone={statusTone("pending")}>Ek protokol onay bekliyor</span> : null}
          </div>
          {signed ? (
            <p className="teklif-kilit">İmzalı sözleşme değiştirilemez. İş planı ve vade değişikliği “⋯ → Ek protokol” ile müşterinin onayına sunulur.</p>
          ) : null}
          <dl className="talep-liste talep-liste--iki">
            {bilgiler.map(([ad, deger]) => (
              <div key={ad}><dt>{ad}</dt><dd>{deger}</dd></div>
            ))}
          </dl>
          <div className="talep-not">
            <h3>Kapsam</h3>
            {data.scope ? <p>{data.scope}</p> : <p className="talep-bos">Kapsam yazılmamış.</p>}
          </div>

          <div className="talep-not">
            <h3>İş planı</h3>
            {!planFeature ? (
              <p className="plan-form-hint">İş planı ve ek protokol için veritabanı güncellemesi (20260914090000_contract_work_plan_addenda) henüz uygulanmadı.</p>
            ) : currentPlan.length ? (
              <ol className="plan-timeline">
                {currentPlan.map((item) => <li key={item.sequence}><time dateTime={item.due_date}>{date(item.due_date)}</time><span>{item.title}</span></li>)}
              </ol>
            ) : (
              <p className="talep-bos">
                {signed
                  ? "Bu sözleşmede ara teslim takvimi yok. Müşteriyle netleştirdiğiniz takvimi “Ek protokol” ile onaya sunun."
                  : "Henüz ara teslim takvimi yok. “⋯ → İş planı” ile ekleyin; takvim sözleşmenin 4. maddesinde gösterilir."}
              </p>
            )}
            {acceptedPlan ? <p className="plan-form-hint">Geçerli takvim Ek Protokol {acceptedPlan.addendum_no} ile belirlendi ({dateTime(acceptedPlan.responded_at)} tarihinde müşteri onayladı).</p> : null}
          </div>

          {paymentRows.length ? (
            <div className="talep-not">
              <h3>Ödeme takvimi</h3>
              {installments.length ? (
                <div className="sozlesme-odeme-ozet">
                  <span><b>{money(odenenTutar, data.currency)}</b> ödendi · {odenen.length}/{installments.length} taksit</span>
                  {gecikenTaksit ? <span className="status-pill" data-tone="warning">{gecikenTaksit} taksidin vadesi geçti</span> : null}
                  <i aria-hidden="true"><b style={{ width: `${taksitToplami ? Math.round((odenenTutar / taksitToplami) * 100) : 0}%` }} /></i>
                </div>
              ) : null}
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
            <div className="talep-not">
              <h3>Ek protokoller</h3>
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
                            <a className="panel-secondary" href={`mailto:${encodeURIComponent(customer.contact_email)}?subject=${encodeURIComponent(`${data.contract_no} · Ek Protokol ${addendum.addendum_no} onayınıza sunuldu`)}&body=${encodeURIComponent(reminder)}`}>E-posta ile gönder</a>
                          ) : null}
                          {reminder ? (
                            gonderimYolu === "panel" ? (
                              <BelgeMetniDugmesi
                                kind="contract"
                                token={data.share_token}
                                metin={reminder}
                                onayMetni={`Ek Protokol ${addendum.addendum_no} hatırlatması ${formatPersonName(customer?.customer_name) || "müşteriye"} WhatsApp'tan gönderilsin mi?`}
                              />
                            ) : (
                              <a className="panel-secondary" target="_blank" rel="noreferrer" href={waMeAdresi(customer?.contact_phone, reminder)}>WhatsApp ile gönder</a>
                            )
                          ) : null}
                          <form action={cancelContractAddendum}><input type="hidden" name="addendum_id" value={addendum.id} /><button className="panel-secondary">Geri çek</button></form>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Akış: müşteri mesajları (takip ekranı), iç yorumlar, kayıt geçmişi */}
        <TalepAkis sekmeler={[unreadMessages ? `Mesajlar · ${unreadMessages}` : "Mesajlar", "Yorumlar", "Geçmiş"]}>
          <div className="sozlesme-mesaj" id="musteri-mesajlari">
            {customerMessages.length ? (
              <div className="contract-chat">
                {customerMessages.map((message) => {
                  const fromCustomer = message.sender_type === "customer";
                  return (
                    <article key={message.id} className={`contract-bubble ${fromCustomer ? "is-customer" : "is-staff"}`}>
                      <header>
                        <b>{fromCustomer ? musteri : formatPersonName(message.sender_name)}</b>
                        <time>{dateTime(message.created_at)}</time>
                        {fromCustomer && !message.read_at ? <em>Yeni</em> : null}
                      </header>
                      <p>{message.body}</p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="ic-akis-bos">Müşteri henüz mesaj yazmadı. Takip kodunu paylaştığınızda müşteri takip ekranından soru sorabilir.</p>
            )}
            {messagingOpen ? (
              <form className="contract-reply" action={replyContractMessage}>
                <input type="hidden" name="contract_id" value={data.id} />
                <textarea name="body" required minLength={2} maxLength={2000} placeholder="Müşteriye yanıt yazın…" aria-label="Müşteriye yanıt" />
                <div><small>Yanıt müşterinin takip ekranında görünür.{data.workflow_id ? " İş başladığı için mesajlar iş detayında da görünür." : ""}</small><button className="panel-primary" type="submit">Gönder</button></div>
              </form>
            ) : null}
          </div>
          <InternalComments opportunityId={data.opportunity_id} contextType="contract" contextId={data.id} gorunum="akis" />
          <RecordHistory opportunityId={data.opportunity_id} />
        </TalepAkis>
      </div>
    </main>
  );
}
