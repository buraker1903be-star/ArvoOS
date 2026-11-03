import { TarihSecici } from "@/app/panel/components/tarih-secici";
import Link from "next/link";
import { kimlikMi } from "@/lib/kimlik";
import { Fragment, Suspense, type CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { reportActionFailure } from "@/lib/action-diagnostics";
import { InternalComments } from "../../crm/internal-comments";
import { RecordHistory } from "../../crm/record-history";
import { tarihleriDagit } from "@/lib/tarih-dagitimi";
import { setWorkflowAssistants, archiveWorkflow, changeWorkType, assignStep, assignWorkflow, deleteWorkflow, distributeStepDates, setStepDueDate, setStepStatus, setWaitingParty, setWorkflowDueDate, setWorkflowStatus, toggleWorkflowStep, unarchiveWorkflow } from "../actions";
import { STEP_STATUSES, STEP_STATUS_LABELS, STEP_STATUS_TONES, asamalaraBol, hatirlatmaDurumu, type StepStatus } from "@/lib/is-adimlari";
// Öncelik adları ve tonları ops-shared'da: burada ikinci bir kopyası vardı.
import { dueBadge, priorityNames, priorityTones, todayIstanbul } from "../ops-shared";
import { DurumSecici } from "../../components/durum-secici";
import { PanelDrawer } from "../../components/panel-drawer";
import { PanelModal } from "../../components/panel-modal";
import { MusteriKunyesi } from "./musteri-kunyesi";
import type { Kunye } from "@/lib/musteri-kunyesi";
import { BEKLEYEN_TARAFLAR, BEKLEYEN_TARAF_ADLARI, BEKLEYEN_TARAF_TONLARI, beklemeOzeti, bekleyenTarafMi } from "@/lib/bekleyen-taraf";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { KopyalaDugmesi } from "../../accounts/kopyala-dugmesi";
import { formatPersonName } from "@/lib/format-name";
import { kisiAdlari } from "@/lib/kisi-adlari";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPhone } from "@/lib/format-phone";
import { formatSubject, initials } from "@/lib/table-format";
import { statusTone } from "@/lib/status-tone";
import { contractStatusLabel, proposalStatusLabel } from "../../crm/status-labels";
import { requestStageNames } from "../../crm/request-status";
import { MarkCustomerMessagesRead } from "./mark-messages-read";
import { KanalDugmesi } from "../../crm/kayit-detay/kanal-dugmesi";
import { ozetZamani } from "../../crm/kayit-detay/akis-kanallari";
import { MusteriSohbeti } from "./musteri-sohbet";
import { PostaAkisi, WhatsappAkisi, musteriPostalari, musteriWhatsapp } from "../../crm/musteri-yazismalari";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { AnindaForm, AnindaYedek } from "./aninda";
import { PortalFilesCard, type StaffPortalFile, type StaffPortalPayment } from "./portal-files";
import { SahaDosyalari, type EkipDosyasi } from "./saha-dosyalari";
import { TEAM_BUCKET } from "../team-files-shared";
import type { PortalAccessRule } from "../portal-files-shared";
import "../operations.css";
import "../../crm/request-page.css";
import "./detail.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../components/kayit-formu.css";
import { PortalZiyareti } from "../../crm/portal-ziyareti";
import { modulGerek } from "@/lib/modul-kapisi";

type Step = { id: string; title: string; is_completed: boolean; sort_order: number; completed_at: string | null; completed_by: string | null; due_date: string | null; status: StepStatus; assigned_employee_id: string | null; phase_title: string | null };
type Workflow = { id: string; step_template_set: string | null; waiting_party: string; waiting_note: string | null; waiting_since: string | null; revision_days: number | null; delivered_at: string | null; revision_until: string | null; title: string; assigned_employee_id: string | null; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; updated_at: string; archived_at: string | null; archived_by: string | null; operation_steps: Step[] };
type Contract = { id: string; contract_no: string; proposal_id: string | null; opportunity_id: string; status: string; tracking_code: string | null; share_token: string | null };
type Opportunity = { customer_name: string; contact_email: string | null; contact_phone: string | null; title: string | null; stage: string | null; kunye: Kunye | null; assigned_employee_id: string | null };
type Proposal = { id: string; proposal_no: string; status: string };
type Comment = { id: string; body: string; created_at: string; created_by: string; context_type: "request" | "proposal" | "contract" | "operation" };
type CustomerMessage = { id: string; sender_type: "customer" | "staff"; sender_name: string; body: string; created_at: string; read_at: string | null };
type Activity = { id: string; title: string; detail: string; at: string; kind: "created" | "step" | "comment" };

const TZ = "Europe/Istanbul";
const statusOptions = [
  ["planned", "Planlandı"],
  ["in_progress", "Devam ediyor"],
  ["blocked", "Beklemede"],
  ["completed", "Tamamlandı"],
  ["cancelled", "İptal"],
] as const;
const moneyFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

const formatDate = (value?: string | null, withTime = false) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", withTime ? { timeZone: TZ, dateStyle: "medium", timeStyle: "short" } : { timeZone: TZ, dateStyle: "long" }).format(
        new Date(value.includes("T") ? value : `${value}T12:00:00`),
      )
    : "—";

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

export default async function OperationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sekme?: string; pencere?: string }>;
}) {
  const { id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur (lib/kimlik). Bu sayfa eskiden
     HER okuma hatasını notFound'a çeviriyordu, yani bozuk kimlik
     tesadüfen doğru davranıyordu; hata yutmayı kaldırırken (231ac64)
     biçim denetimi onun yerine konmamıştı ve sayfa çökmeye başladı. */
  if (!kimlikMi(id)) notFound();
  const { sekme: istenenSekme, pencere: istenenPencere } = await searchParams;
  const { supabase, membership, modules, userId, izin } = await getPanelContext();
  modulGerek(modules, "operations");
  const organizationId = membership.organization_id;
  /*
    SIRALI ADIMLAR AZALTILDI (13.10.2026, hızlandırma). Sayfa veritabanına
    yedi SIRALI adımda gidiyordu; her adım canlıda ~0,2 sn. Birbirine bağlı
    olmayan okumalar aynı adımda: çalışma türleri işle birlikte; dosya
    önizleme adresleri, yükleyen adları ve WhatsApp/posta yazışmaları
    birlikte (aşağıda).
  */
  /*
    İLK TURDA İŞİN KİMLİĞİNE BAĞLI HER ŞEY (22.10.2026, hız çalışması).
    Sözleşme, müşteri mesajları, ek sorumlular, portal dosyaları, ödeme
    durumu, indirmeler ve ekip dosyaları yalnızca işin kimliğine bakıyor;
    kimlik de adreste. Eskiden iş kaydı okunup bitince ikinci, o bitince
    üçüncü turda soruluyorlardı (canlıda tur başına ~170 ms). Sorumlu
    personel işin kendi sorgusuna gömülü. İş görünmüyorsa (RLS) bunlar boş
    döner ve aşağıda 404 çizilir — sızan bir şey yok.
  */
  const [
    { data: workflowData, error: workflowError }, { data: turSatirlari }, { data: turGorevleri },
    { data: contractData, error: contractError }, { data: customerMessagesData, error: customerMessagesError },
    { data: me }, { data: employeeData }, { data: ekSorumluData, error: ekSorumluError },
    portalFilesResult, portalPaymentResult, portalDownloadsResult, ekipDosyaSonucu,
  ] = await Promise.all([
    supabase
    .from("operation_workflows")
    .select("id,title,assigned_employee_id,customer_name,description,status,priority,start_date,due_date,created_at,updated_at,archived_at,archived_by,step_template_set,waiting_party,waiting_note,waiting_since,revision_days,delivered_at,revision_until,operation_steps(id,title,is_completed,sort_order,completed_at,completed_by,due_date,status,assigned_employee_id,phase_title),sorumlu:hr_employees!operation_workflows_assigned_employee_id_fkey(id,full_name,job_title)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    /* maybeSingle (02.11.2026): single() satır yokken (silinmiş ya da
       görünmeyen iş) HATA döndürüyordu, sayfa aşağıdaki notFound()'a hiç
       ulaşmadan "İş akışı okunamadı: Cannot coerce the result to a single
       JSON object" ile çöküyordu — canlıda 16.10–01.11 arasında üç kez. */
    .maybeSingle(),
    supabase.from("organization_step_template_sets").select("code,name,sort_order").eq("organization_id", organizationId).eq("is_active", true).order("sort_order"),
    supabase.from("organization_step_templates").select("set_code").eq("organization_id", organizationId).eq("is_active", true),
    supabase.from("ops_contracts").select("id,contract_no,proposal_id,opportunity_id,status,tracking_code,share_token").eq("workflow_id", id).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at").eq("workflow_id", id).eq("organization_id", organizationId).order("created_at", { ascending: true }),
    supabase.from("hr_employees").select("id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    /*
      Personel listesi artık YÖNETİCİ OLMAYANA da okunuyor: adımın
      sorumlusunu göstermek için ada ihtiyaç var ve eskiden liste yalnızca
      atama yetkisi olana geliyordu. Atama kutusu yine yalnızca yöneticiye
      çiziliyor (canAssign).
    */
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId).eq("employment_status", "active").order("full_name"),
    /* Ek sorumlular (20261022081123): işi asıl sorumluyla birlikte takip edenler. */
    supabase.from("operation_workflow_assignees").select("employee_id").eq("workflow_id", id),
    supabase.from("operation_customer_files").select("id,file_name,mime_type,size_bytes,note,access_rule,created_at,uploaded_by").eq("workflow_id", id).eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.rpc("portal_workflow_payment_status", { p_workflow_id: id }),
    supabase.from("operation_customer_file_downloads").select("file_id").eq("workflow_id", id).eq("outcome", "granted").limit(5000),
    // Ekip içi dosyalar (20261013065421): sahadan fotoğraf/belge, müşteri görmez.
    supabase.from("operation_team_files").select("id,file_name,mime_type,size_bytes,note,created_at,uploaded_by,storage_path").eq("workflow_id", id).eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  /* Hata 404'e çevriliyordu: okuma düşünce ekran "kayıt bulunamadı"
     diyor, kullanıcı da kaydın silindiğini sanıyordu. Hatanın
     okunamaması "kayıt yok" demek değil. */
  if (workflowError) throw new Error("İş akışı okunamadı: " + workflowError.message);
  if (!workflowData) notFound();
  const workflow = workflowData as Workflow;
  const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  /* Sıradaki görev: listede tamamlanmamış ilk görev (sıra çalışma türünün sırası). */
  const siradakiGorev = steps.find((step) => !step.is_completed) ?? null;
  const completedCount = steps.filter((step) => step.is_completed).length;
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;
  /*
    ÇALIŞMA TÜRÜ VE DEĞİŞTİRME (20261013110047): iş yanlış türle açıldıysa
    işi görebilen herkes "Türü değiştir"le düzeltir. Türlerin görev sayısı
    pencerede yazıyor (boş türe çevirmek reddediliyor). Kurum başına en çok
    12 tür × 40 görev: tümü okunuyor (sınırsız okuma bilerek, küçük).
  */
  const turGorevSayisi = new Map<string, number>();
  for (const satir of (turGorevleri ?? []) as { set_code: string }[]) turGorevSayisi.set(satir.set_code, (turGorevSayisi.get(satir.set_code) ?? 0) + 1);
  const calismaTurleri = ((turSatirlari ?? []) as { code: string; name: string }[]).map((t) => ({ ...t, gorev: turGorevSayisi.get(t.code) ?? 0 }));
  const mevcutTur = calismaTurleri.find((t) => t.code === workflow.step_template_set) ?? null;
  /*
    "Tarihleri dağıt" ÖNİZLEMESİ. Aynı saf fonksiyon sunucu işleminde de
    çalışıyor, yani düğmenin üstünde yazan sayı ile yapılacak iş birebir
    aynı. Tahmini ayrı hesaplamak ikisinin ayrışmasına açık kapı olurdu.
  */
  const dagitim = tarihleriDagit(steps, { baslangic: workflow.start_date, termin: workflow.due_date });
  /*
    AŞAMA BAŞLIKLARI. Müşterinin (AkademikMerkez) operasyon tablosu iki
    seviyeli: aşama ve altındaki görevler. Liste yine DÜZ basılıyor, başlık
    grubun ilk görevinin üstüne giriyor — görevlerin tek bir sırası var ve
    her biri kendi satırında duruyor; iç içe kutular tarih, sorumlu ve durum
    denetimlerini dar ekranda iyice sıkıştırırdı.
  */

  const bekleyenTaraf = bekleyenTarafMi(workflow.waiting_party) ? workflow.waiting_party : "us";

  const grupBaslari = new Map<string, { no: number | null; baslik: string; biten: number; toplam: number }>();
  for (const grup of asamalaraBol(steps)) {
    if (!grup.baslik) continue;
    grupBaslari.set(grup.adimlar[0].id, {
      no: grup.no,
      baslik: grup.baslik,
      biten: grup.adimlar.filter((adim) => adim.is_completed).length,
      toplam: grup.adimlar.length,
    });
  }
  const canAssign = izin("operations.gorev.ata");
  const crmVar = modules.some((module) => module.code === "crm");
  const canDelete = izin("operations.is.sil");

  const isArchived = workflow.status === "archived";
  /* Okunamazsa "ek sorumlu yok" demek yanlış olur: ikinci operasyoncu
     yetkisini görmez, yönetici de listeyi boş sanıp yeniden atar. */
  if (ekSorumluError) throw new Error("Ek sorumlular okunamadı: " + ekSorumluError.message);
  const ekSorumluIdleri = ((ekSorumluData ?? []) as { employee_id: string }[]).map((satir) => satir.employee_id);
  if (customerMessagesError) throw new Error("Müşteri mesajları okunamadı: " + customerMessagesError.message);
  const customerMessages = (customerMessagesData ?? []) as CustomerMessage[];
  const unreadCustomerMessages = customerMessages.filter((message) => message.sender_type === "customer" && !message.read_at).length;

  /*
    DERİN BAĞLANTI. Sekmeler kalktı; yerlerine ortada açılan pencereler
    geldi. Adres yine hangi pencerenin açılacağını söyleyebiliyor:
    genel bakıştaki "müşteri mesajı var" satırı buraya bağlanıyor.
    Eski ?sekme=musteri bağlantıları çalışmaya devam ediyor.
  */
  const acilacakPencere =
    istenenPencere === "evrak" || istenenPencere === "mesajlar" || istenenPencere === "kayitlar"
      ? istenenPencere
      : istenenSekme === "musteri"
        ? "mesajlar"
        : istenenSekme === "kayitlar"
          ? "kayitlar"
          : null;
  /*
    Bu okumanın hatası YUTULUYORDU: ops_contracts okunamazsa contract null
    kalıyor, sayfa sessizce sözleşmesiz çiziliyor (kurum içi yorumlar ve
    müşteri künyesi hiç görünmüyor) ve sunucuda tek satır iz kalmıyordu.
    Sayfayı kırmıyoruz — eksik sözleşme meşru bir durum — ama hata varsa
    artık günlüğe düşüyor.
  */
  if (contractError)
    reportActionFailure("operasyonIsDetayi.sozlesmeOkumasi", contractError, {
      organizationId,
      role: membership.role,
      workflowId: workflow.id,
      kaynak: "ops_contracts",
    });
  const contract = contractData as Contract | null;
  const employees = (employeeData ?? []) as { id: string; full_name: string }[];
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  // Saat bileşen gövdesinde okunmaz (react-hooks/purity); yardımcı ops-shared'da.
  const bugunIstanbul = todayIstanbul();
  /* Revizyon alanı 03.11.2026'da iş detayından kaldırıldı (kurum sahibinin isteği); kurum varsayılanı geçerli, veritabanı revizyon penceresini yine kendisi hesaplıyor. */
  /* PostgREST gömülü ilişkiyi nesne ya da tek elemanlı dizi döndürebiliyor. */
  const sorumluHam = (workflowData as { sorumlu?: unknown }).sorumlu as { id: string; full_name: string; job_title: string | null } | { id: string; full_name: string; job_title: string | null }[] | null | undefined;
  const assigneeRow = (Array.isArray(sorumluHam) ? sorumluHam[0] : sorumluHam) ?? null;
  // Termini yöneticiler, işin sorumlusu ve ek sorumluları girebilir (actions.ts isManagerOrAssignee ile aynı kural)
  const benimPersonelId = (me as { id?: string } | null)?.id ?? null;
  const canEditDue = canAssign || Boolean(benimPersonelId && (benimPersonelId === workflow.assigned_employee_id || ekSorumluIdleri.includes(benimPersonelId)));
  // Arşivleme de aynı kural (actions.ts isManagerOrAssignee)
  const canArchive = canEditDue;

  /* Yalnızca sözleşmeye bağlı okumalar ikinci turda. */
  const [opportunityResult, proposalResult, commentsResult] = await Promise.all([
    contract?.opportunity_id
      ? supabase.from("ops_opportunities").select("customer_name,contact_email,contact_phone,title,stage,kunye,assigned_employee_id").eq("id", contract.opportunity_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.proposal_id
      ? supabase.from("ops_proposals").select("id,proposal_no,status").eq("id", contract.proposal_id).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    contract?.opportunity_id
      ? supabase.from("crm_internal_comments").select("id,body,created_at,created_by,context_type").eq("organization_id", organizationId).eq("opportunity_id", contract.opportunity_id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if ("error" in commentsResult && commentsResult.error) throw new Error("Kurum içi yorumlar okunamadı: " + commentsResult.error.message);

  // Müşteri portalı dosyaları. Migration (20260912203000) henüz çalışmadıysa
  // sayfa kırılmaz; kart kurulum uyarısı gösterir.
  const isMissingSchema = (error: { code?: string; message?: string } | null) =>
    Boolean(error && (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "")));
  const portalSetupMissing = isMissingSchema(portalFilesResult.error) || isMissingSchema(portalPaymentResult.error);
  if (!portalSetupMissing && portalFilesResult.error) throw new Error("Müşteri portalı dosyaları okunamadı: " + portalFilesResult.error.message);
  if (!portalSetupMissing && portalPaymentResult.error) throw new Error("Ödeme durumu okunamadı: " + portalPaymentResult.error.message);
  type PortalFileRow = { id: string; file_name: string; mime_type: string; size_bytes: number; note: string | null; access_rule: PortalAccessRule; created_at: string; uploaded_by: string | null };
  const portalFileRows = (portalSetupMissing ? [] : portalFilesResult.data ?? []) as PortalFileRow[];
  /* Ekip içi dosyalar: migration (20261013065421) uygulanmadıysa bölüm
     kurulum notu gösterir, sayfa kırılmaz. Önizleme için kısa ömürlü
     imzalı adres (1 saat; kova özel). */
  const ekipKurulumEksik = isMissingSchema(ekipDosyaSonucu.error);
  if (!ekipKurulumEksik && ekipDosyaSonucu.error) throw new Error("Ekip dosyaları okunamadı: " + ekipDosyaSonucu.error.message);
  type EkipDosyaSatiri = { id: string; file_name: string; mime_type: string; size_bytes: number; note: string | null; created_at: string; uploaded_by: string | null; storage_path: string };
  const ekipDosyaSatirlari = (ekipKurulumEksik ? [] : ekipDosyaSonucu.data ?? []) as EkipDosyaSatiri[];
  /*
    WhatsApp ve Postalar (2026-10): müşteri sayfası, talep ve sözleşme
    detayıyla aynı kural (crm/musteri-yazismalari.tsx). Yalnızca işin bir
    sözleşmesi varsa: müşterinin numarası ve adresi oradan geliyor.
    WhatsApp'ı CRM modülü olan görür (WhatsApp ekranının kuralı), posta
    yazışmalarını ortak kutuyu görebilen (posta.gor). Okuma burada
    BAŞLATILIYOR, aşağıda bekleniyor: önizleme adresleri ve adlarla aynı anda.
  */
  const yazismaFirsati = opportunityResult.data as Opportunity | null;
  const whatsappGorur = Boolean(contract?.opportunity_id) && crmVar;
  const postaGorur = Boolean(contract?.opportunity_id) && izin("posta.gor");
  const yazismaSozu = Promise.all([
    whatsappGorur ? musteriWhatsapp(organizationId, yazismaFirsati?.contact_phone) : Promise.resolve({ numara: null, mesajlar: [] }),
    /*
      WHATSAPP DÜĞMESİ YALNIZCA KURUM BAĞLIYSA (03.11.2026, kurum sahibinin
      isteği). Kendi numarası bağlı olmayan kurumda düğme hep boş bir
      pencere açıyordu. Kural teklif ve sözleşme detayındakiyle aynı:
      hesap bağlı ve kapatılmamış.
    */
    whatsappGorur ? getWhatsappStatus(organizationId).then((durum) => durum.connected && durum.status !== "disabled") : Promise.resolve(false),
    postaGorur && contract?.opportunity_id
      ? musteriPostalari(supabase, organizationId, { talepIdleri: [contract.opportunity_id], eposta: yazismaFirsati?.contact_email })
      : Promise.resolve([]),
  ]);
  /* Dosyayı yükleyen ve görevi tamamlayan kişilerin adları tek yerden
     (görevi kimin tiklediği satırın altında yazıyor, 13.10.2026).
     Kaynağın neden iki tablo olduğu lib/kisi-adlari.ts'te. */
  const uploaderIds = [
    ...[...portalFileRows, ...ekipDosyaSatirlari].map((file) => file.uploaded_by),
    ...steps.map((step) => (step.is_completed ? step.completed_by : null)),
    isArchived ? workflow.archived_by : null,
  ];
  const [{ data: imzaliAdresler }, uploaderNames, takipSunucusu] = await Promise.all([
    ekipDosyaSatirlari.length
      ? supabase.storage.from(TEAM_BUCKET).createSignedUrls(ekipDosyaSatirlari.map((d) => d.storage_path), 3600)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    kisiAdlari(supabase, organizationId, uploaderIds),
    /* Takip ekranının adresi: kurum kendi alan adını doğrulattıysa onu
       kullanıyor (lib/public-host). Yalnızca kod varken soruluyor. */
    contract?.tracking_code ? resolvePublicHost(supabase, organizationId) : Promise.resolve(null),
  ]);
  const imzaliAdres = new Map((imzaliAdresler ?? []).filter((a) => a.path && a.signedUrl).map((a) => [a.path as string, a.signedUrl]));
  const takipAdresi = takipSunucusu ? `https://${takipSunucusu}/takip` : null;
  const archiverName = isArchived
    ? (workflow.archived_by ? uploaderNames.get(workflow.archived_by) ?? "Ekip üyesi" : "Otomatik (ödeme kapandı)")
    : null;
  const downloadCounts = new Map<string, number>();
  for (const row of (portalDownloadsResult.data ?? []) as { file_id: string | null }[]) {
    if (row.file_id) downloadCounts.set(row.file_id, (downloadCounts.get(row.file_id) ?? 0) + 1);
  }
  const portalFiles: StaffPortalFile[] = portalFileRows.map((file) => ({
    id: file.id,
    fileName: file.file_name,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
    note: file.note,
    accessRule: file.access_rule,
    createdLabel: formatDate(file.created_at, true),
    uploaderName: (file.uploaded_by && uploaderNames.get(file.uploaded_by)) || "Ekip üyesi",
    downloads: downloadCounts.get(file.id) ?? 0,
  }));
  const ekipDosyalari: EkipDosyasi[] = ekipDosyaSatirlari.map((d) => ({
    id: d.id,
    fileName: d.file_name,
    mimeType: d.mime_type,
    sizeBytes: Number(d.size_bytes),
    note: d.note,
    createdLabel: formatDate(d.created_at, true),
    uploaderName: (d.uploaded_by && uploaderNames.get(d.uploaded_by)) || "Ekip üyesi",
    url: imzaliAdres.get(d.storage_path) ?? null,
  }));
  const paymentRow = (Array.isArray(portalPaymentResult.data) ? portalPaymentResult.data[0] : portalPaymentResult.data) as
    { has_contract: boolean; settled: boolean; total_amount: number | null; paid_amount: number | null; remaining_amount: number | null } | undefined;
  const portalPayment: StaffPortalPayment = {
    hasContract: Boolean(paymentRow?.has_contract ?? contract),
    settled: Boolean(paymentRow?.settled),
    // Tutarlar yalnızca yöneticilere döner (SQL de aynı kuralı uygular).
    remainingLabel: paymentRow?.remaining_amount != null ? moneyFormat.format(Number(paymentRow.remaining_amount) / 100) : null,
    paidPercent: paymentRow?.total_amount ? Math.min(100, Math.max(0, Math.round((Number(paymentRow.paid_amount ?? 0) / Number(paymentRow.total_amount)) * 100))) : null,
  };
  const portalDownloadsConfigured = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const opportunity = opportunityResult.data as Opportunity | null;
  const proposal = proposalResult.data as Proposal | null;
  const teklifDurumu = proposal ? (proposal.status === "archived" && contract ? "Kabul edildi" : proposalStatusLabel(proposal.status)) : "";
  const comments = (commentsResult.data ?? []) as Comment[];
  const customerName = formatPersonName(opportunity?.customer_name || workflow.customer_name) || "Kurum içi iş";
  /*
    Termin ops-shared/dueBadge'den. Burada dördüncü bir kopya duruyordu
    ("İş tamamlandı", "Teslim tarihi girilmemiş", uzak termin yeşil) ve
    pano, işler, genel bakış hep başka cümle kuruyordu. Tek kaynak.
  */
  const due = dueBadge(workflow.due_date, bugunIstanbul, workflow.status);
  const activities: Activity[] = [
    { id: `created-${workflow.id}`, title: "İş akışı oluşturuldu", detail: customerName, at: workflow.created_at, kind: "created" as const },
    ...steps.filter((step) => step.completed_at).map((step) => ({ id: `step-${step.id}`, title: "Görev tamamlandı", detail: step.completed_by ? `${step.title} · ${uploaderNames.get(step.completed_by) ?? "Ekip üyesi"}` : step.title, at: step.completed_at!, kind: "step" as const })),
    ...comments.map((comment) => ({ id: `comment-${comment.id}`, title: "Yorum eklendi", detail: comment.body.length > 90 ? `${comment.body.slice(0, 90)}…` : comment.body, at: comment.created_at, kind: "comment" as const })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  /*
    YAZIŞMALAR (03.11.2026). Kanal başına bir düğme (İletişim kartı),
    yazışma ortada açılan pencerede. Önce sütunun içinde sekmeliydi, sonra
    sağdan açılan bir çekmecedeydi; kurum sahibinin çiziminde pencere.
    Okunmamış mesaj pencereyi KENDİLİĞİNDEN açmıyor: rozet düğmede,
    okundu işareti pencere açılınca gidiyor. ?pencere=mesajlar pencereyi açar.
  */
  const [{ numara: whatsappNumarasi, mesajlar: whatsappMesajlari }, whatsappEntegre, postalar] = await yazismaSozu;
  /*
    BİLDİRİM ROZETLERİ. Mesajlar: müşterinin okunmamış mesajı. Postalar:
    okunmamış konuşma. Yorumlar okunma kaydı tutmuyor; rozet, görüntüleyenin
    SON YORUMUNDAN sonra başkalarının yazdığı yorum sayısı — "yanıtlamadığım
    yorum var mı" sorusunun cevabı. Hiç yazmadıysa başkalarının bütün yorumları.
    Pencere açılınca rozetler tarayıcıda "görüldü" sayılıp söner (kanal-dugmesi.tsx).
  */
  const siradakiUyari = siradakiGorev ? hatirlatmaDurumu(siradakiGorev, bugunIstanbul) : null;
  const sonYorumum = comments.filter((c) => c.created_by === userId).map((c) => c.created_at).sort().at(-1) ?? "";
  const baskalarininYorumlari = comments.filter((c) => c.created_by !== userId).map((c) => c.created_at);
  const sonYorumZamani = comments.map((c) => c.created_at).sort().at(-1) ?? null;
  const sonMusteriMesajiZamani = customerMessages.filter((m) => m.sender_type === "customer").map((m) => m.created_at).sort().at(-1) ?? null;
  const okunmamisMesajZamanlari = customerMessages.filter((m) => m.sender_type === "customer" && !m.read_at).map((m) => m.created_at);
  const okunmamisPostaZamanlari = postalar.filter((posta) => posta.okunmamis).map((posta) => posta.son_mesaj_at ?? "").filter(Boolean);
  const musteriAdi = customerName === "Kurum içi iş" ? null : customerName;

  return (
    <main className="crm-page-stack talep opd opd-v3">
      <AnindaYedek />

      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{contract?.contract_no ? `${contract.contract_no} · İŞ` : "İŞ"}</small>
          <h1>{formatSubject(workflow.title)}</h1>
        </div>
        <div className="talep-bas-eylem">
          {/* TERMİN başlıkta (03.11.2026): işin en çok bakılan tarihi; eskiden sol sütunda bir formdu. */}
          <div className="opd-bas-termin" id="termin">
            <p><b>Termin tarihi:</b> {workflow.due_date ? formatDate(workflow.due_date) : "Belirlenmedi"}</p>
            {workflow.due_date ? <p><span className="status-pill" data-tone={due.tone}>{due.label}</span></p> : null}
            {canEditDue ? (
              <PanelModal
                triggerClassName="panel-secondary opd-bas-termin-dugme"
                triggerLabel={workflow.due_date ? "Yeni termin tarihi belirle" : "Termin belirle"}
                title="Termin tarihi"
                description="İşin müşteriye teslim edileceği gün."
                kicker={`İŞ · ${formatSubject(workflow.title)}`}
                boy="dar"
                basaridaKapan
              >
                <form className="opd-due-form" action={setWorkflowDueDate}>
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <TarihSecici className="tsc-kucuk" key={workflow.due_date ?? "yok"} name="due_date" defaultValue={workflow.due_date ?? ""} min={workflow.start_date ?? undefined} required aria-label="Termin tarihi" />
                  <button className="panel-primary" type="submit">Kaydet</button>
                </form>
              </PanelModal>
            ) : null}
          </div>
          {canArchive && workflow.status === "completed" ? (
            <form action={archiveWorkflow}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <button type="submit" className="panel-primary">Arşivle</button>
            </form>
          ) : null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              {canAssign ? (
                <PanelDrawer triggerLabel="Sorumluları ata" kicker={`İŞ · ${formatSubject(workflow.title)}`} title="Operasyon sorumluları" description="İşi yürütecek asıl sorumluyu ve onunla birlikte takip edecek ek sorumluları seçin; eklenen herkes bilgilendirilir." triggerClassName="os-menu-item">
                  {/* Ortak form düzeni (components/kayit-formu.css), talep ve sözleşme çekmeceleriyle aynı. */}
                  <form className="panel-form kayit-formu" action={assignWorkflow}>
                    <input type="hidden" name="workflow_id" value={workflow.id} />
                    <label className="wide">Operasyon sorumlusu
                      <select name="assigned_employee_id" defaultValue={workflow.assigned_employee_id ?? ""}>
                        <option value="">Atanmamış</option>
                        {employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}
                      </select>
                    </label>
                    <div className="wide panel-form-actions kayit-formu-eylem">
                      <p>İş bu kişinin listesine düşer.</p>
                      <button className="panel-primary">Atamayı kaydet</button>
                    </div>
                  </form>
                  {/*
                    EK SORUMLULAR (22.10.2026, AkademikMerkez'in talebi). Ek
                    sorumlu işi görür, takip eder ve sorumluya açık işlemleri
                    yapar; asıl sorumluyu değiştiremez. Prim ve "sorumluya
                    göre" sayılar asıl sorumluda kalıyor. Ayrı form: asıl
                    sorumluyu değiştirmeden ek eklemek tek tıkla olsun.
                  */}
                  <form className="panel-form kayit-formu ek-sorumlu-formu" action={setWorkflowAssistants}>
                    <input type="hidden" name="workflow_id" value={workflow.id} />
                    <fieldset className="wide ek-sorumlu-secimi">
                      <legend>Ek sorumlular <small>işi birlikte takip edenler</small></legend>
                      {employees.filter((employee) => employee.id !== workflow.assigned_employee_id).map((employee) => (
                        <label key={employee.id}>
                          <input type="checkbox" name="ek_sorumlu" value={employee.id} defaultChecked={ekSorumluIdleri.includes(employee.id)} />
                          <span>{formatPersonName(employee.full_name)}</span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="wide panel-form-actions kayit-formu-eylem">
                      <p>Ek sorumlu işi görür ve takip eder; asıl sorumluyu değiştiremez.</p>
                      <button className="panel-primary">Ek sorumluları kaydet</button>
                    </div>
                  </form>
                </PanelDrawer>
              ) : null}
              {/* Sahadan fotoğraf ve dosya (13.10.2026, saha-dosyalari.tsx): çizimde kart yok, menüden; telefonda alt çubukta da var. */}
              <PanelModal
                triggerClassName="os-menu-item"
                triggerLabel={ekipKurulumEksik ? "Fotoğraflar ve dosyalar" : `Fotoğraflar ve dosyalar · ${ekipDosyalari.length}`}
                title="Fotoğraflar ve dosyalar"
                description="Sahadan çekilen fotoğrafı ya da belgeyi işe (yalnızca ekip) ya da müşteriye ekleyin."
                kicker="OPERASYON"
                boy="buyuk"
                baslangicAcik={istenenPencere === "dosya"}
              >
                {ekipKurulumEksik ? (
                  <p className="opd-pf-banner" data-tone="warning" role="status"><b>Kurulum bekleniyor</b><span>Veritabanı güncellemesi (20261013065421_is_ekip_dosyalari) henüz çalıştırılmadı. Çalıştırıldığında fotoğraf ve dosya ekleme burada açılır.</span></p>
                ) : (
                  <SahaDosyalari workflowId={workflow.id} organizationId={organizationId} portalAcik={portalPayment.hasContract && !portalSetupMissing} dosyalar={ekipDosyalari} />
                )}
              </PanelModal>
              <PanelModal
                triggerClassName="os-menu-item"
                triggerLabel="Kayıt geçmişi"
                title="Kayıt geçmişi"
                description="Son hareketler ve alan değişiklikleri."
                kicker={`İŞ · ${formatSubject(workflow.title)}`}
                boy="buyuk"
                baslangicAcik={acilacakPencere === "kayitlar"}
              >
            <div className="opd-kayit">
              <h3 className="opd-kayit-baslik">Son hareketler <small>{activities.length}</small></h3>
              <ul className="opd-activity">
                {activities.map((activity) => (
                  <li key={activity.id} data-kind={activity.kind}>
                    <i aria-hidden="true">{activity.kind === "created" ? "+" : activity.kind === "step" ? <CheckIcon /> : "•"}</i>
                    <span><b>{activity.title}</b><small>{activity.detail}</small><time>{formatDate(activity.at, true)}</time></span>
                  </li>
                ))}
              </ul>
              <h3 className="opd-kayit-baslik">Alan değişiklikleri</h3>
              <Suspense fallback={<p className="opd-empty">Yükleniyor…</p>}>
                <RecordHistory workflowId={workflow.id} baslik={false} />
              </Suspense>
            </div>
              </PanelModal>
              {/* Sözleşme tutar taşıyor; operasyon personeli göremiyor. */}
              {contract && canAssign ? <Link className="os-menu-item" href={`/panel/crm/contracts/${contract.id}`}>Sözleşmeye git</Link> : null}
              {canArchive && isArchived ? (
                <form action={unarchiveWorkflow}>
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <button type="submit" className="os-menu-item">Arşivden çıkar</button>
                </form>
              ) : null}
              <Link className="os-menu-item" href={isArchived ? "/panel/operations/arsiv" : "/panel/operations/isler"}>{isArchived ? "Arşive dön" : "İşlere dön"}</Link>
              {canDelete ? (
                <PanelDrawer triggerLabel="İşi sil" kicker={`İŞ · ${formatSubject(workflow.title)}`} title="İşi sil" description="Silme geri alınamaz." triggerClassName="os-menu-item is-danger">
                  <div className="panel-danger-zone">
                    <small className="panel-kicker">KALICI İŞLEM</small>
                    <p>İş, görevleri ve kayıtlarıyla birlikte silinir. Tamamlanan işi silmek yerine arşivleyin.</p>
                    <form action={deleteWorkflow}>
                      <input type="hidden" name="workflow_id" value={workflow.id} />
                      <ConfirmDeleteButton label="Sil" confirmMessage={`${workflow.title} işini kalıcı olarak silmek istediğinize emin misiniz?`} />
                    </form>
                  </div>
                </PanelDrawer>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      {isArchived ? (
        <p className="talep-arsiv">
          <span className="status-pill" data-tone="neutral">Arşivde</span>
          <span>{formatDate(workflow.archived_at, true)} · {archiverName} · Aktif işler tablosunda görünmez.</span>
        </p>
      ) : null}

      {/*
        TELEFON ÇUBUĞU (13.10.2026; yalnızca telefonda, detail.css).
        Telefonda sayfa tek sütuna iniyor ve müşteri sohbeti en altta
        kalıyordu (390 piksel genişlikte ~6700 piksel aşağıda): sahadaki
        personelin en sık iki işi, mesaja yanıt ve fotoğraf, en uzaktaydı.
        Çubuk ikisini en üste alır; pencereler alttan açılan sayfa.
        Bugün ekranındaki mesaj satırı ?pencere=mesajlar ile doğrudan
        sohbeti açıyor (yalnızca telefonda; masaüstünde aynı adres sağdaki
        sekmeyi seçiyor).
      */}
      <nav className="opd-telefon" aria-label="Hızlı işlemler">
        <PanelModal
          triggerClassName="opd-telefon-btn"
          triggerLabel="Mesajlar"
          triggerBadge={unreadCustomerMessages ? String(unreadCustomerMessages) : null}
          title={musteriAdi ?? "Müşteri mesajları"}
          kicker="MÜŞTERİ MESAJLARI"
          boy="sohbet"
          yalnizcaTelefonda
        >
          <MarkCustomerMessagesRead workflowId={workflow.id} unread={unreadCustomerMessages} />
          <MusteriSohbeti workflowId={workflow.id} messages={customerMessages} customerName={customerName} canReply={Boolean(contract)} bugun={bugunIstanbul} />
        </PanelModal>
        <PanelModal
          triggerClassName="opd-telefon-btn"
          triggerLabel="Fotoğraf"
          title="Fotoğraflar ve dosyalar"
          description="Sahadan çekilen fotoğrafı ya da belgeyi işe (yalnızca ekip) ya da müşteriye ekleyin."
          kicker="OPERASYON"
          boy="genis"
        >
          {ekipKurulumEksik ? (
            <p className="opd-pf-banner" data-tone="warning" role="status"><b>Kurulum bekleniyor</b><span>Veritabanı güncellemesi (20261013065421_is_ekip_dosyalari) henüz çalıştırılmadı.</span></p>
          ) : (
            <SahaDosyalari workflowId={workflow.id} organizationId={organizationId} portalAcik={portalPayment.hasContract && !portalSetupMissing} dosyalar={ekipDosyalari} />
          )}
        </PanelModal>
        {opportunity?.contact_phone ? (
          <a className="opd-telefon-btn" href={`tel:${opportunity.contact_phone.replace(/[^\d+]/g, "")}`}>Ara</a>
        ) : null}
      </nav>

      {/*
        İŞ DETAYI DÜZENİ (03.11.2026, kurum sahibinin çizimi). Solda üstte
        iki kart (müşteri, iletişim), altında durum ve evrak teslimi; sağda
        görevler. Durum ve "top kimde" eskiden sayfanın üstünde ayrı bir
        şeritteydi, termin sol sütunun içinde bir formdu; şimdi durum kartın
        içinde, termin başlıkta. Yazışmalar sağdan açılan çekmece yerine
        ortada açılan pencerede (PanelModal) — içerik yalnızca açıkken
        basıldığı için müşteri mesajları pencere açılınca okundu sayılıyor.
      */}
      <div className="opd-duzen-v4">
        <section className="panel-card opd-kart opd-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{initials(musteriAdi ?? workflow.title)}</span>
            <div>
              <h2>{musteriAdi ?? "Kurum içi iş"}</h2>
              <small>{musteriAdi ? "Müşteri" : "Sözleşmeye bağlı değil"}</small>
            </div>
          </div>
          {opportunity?.contact_phone || opportunity?.contact_email || (contract?.tracking_code && takipAdresi) ? (
            <div className="opd-iletisim-dugmeleri">
              {opportunity?.contact_phone ? <a className="panel-secondary" href={`tel:${opportunity.contact_phone}`}>Ara</a> : null}
              {opportunity?.contact_email ? <a className="panel-secondary" href={`mailto:${opportunity.contact_email}`}>E-posta</a> : null}
              {contract?.tracking_code && takipAdresi ? (
                <a className="panel-secondary" target="_blank" rel="noreferrer" href={`${takipAdresi}?code=${encodeURIComponent(contract.tracking_code)}`}>Takip</a>
              ) : null}
            </div>
          ) : null}
          <dl className="talep-liste opd-musteri-liste">
            {opportunity ? (
              <div><dt>Satış temsilcisi</dt><dd>{opportunity.assigned_employee_id ? formatPersonName(employeeNames.get(opportunity.assigned_employee_id) ?? "Pasif personel") : <em>Atanmamış</em>}</dd></div>
            ) : null}
            <div className="is-grup"><dt>Operasyon sorumlusu</dt><dd>{assigneeRow ? formatPersonName(assigneeRow.full_name) : <em>Atanmamış</em>}</dd></div>
            {ekSorumluIdleri.length ? (
              <div><dt>Ek sorumlu</dt><dd>{ekSorumluIdleri.map((id) => formatPersonName(employeeNames.get(id) ?? "Pasif personel")).join(", ")}</dd></div>
            ) : null}
            {/* Müşteri takip portalına girdi mi, kaç kez (20261012131639). */}
            {contract?.tracking_code ? <div className="is-grup"><dt>Müşteri portalı</dt><dd><PortalZiyareti contractId={contract.id} /></dd></div> : null}
          </dl>
          <PanelModal
            triggerClassName="panel-secondary opd-ayrinti-dugme"
            triggerLabel="Müşteri ayrıntıları"
            title={musteriAdi ?? "Kurum içi iş"}
            description="İletişim bilgileri, takip kodu, bağlantılı kayıtlar ve müşteri künyesi."
            kicker={`İŞ · ${formatSubject(workflow.title)}`}
            boy="buyuk"
          >
            {/* .opd-v3 ve .talep-musteri: künyenin ve listelerin kuralları bu sınıflara bağlı; pencere sayfanın dışında (panel kökünde) çiziliyor. */}
            <div className="opd-v3"><div className="talep-musteri opd-ayrinti">
              <section className="opd-ayrinti-bolum">
                <h3>İletişim</h3>
                <dl className="talep-liste">
                  <div><dt>Telefon</dt><dd>{formatPhone(opportunity?.contact_phone) || <em>Yok</em>}</dd></div>
                  <div><dt>E-posta</dt><dd>{opportunity?.contact_email || <em>Yok</em>}</dd></div>
                </dl>
              </section>
              <section className="opd-ayrinti-bolum">
                <h3>İş</h3>
                <dl className="talep-liste">
                  <div><dt>Başlangıç</dt><dd>{workflow.start_date ? formatDate(workflow.start_date) : <em>Belirtilmedi</em>}</dd></div>
                  <div><dt>Öncelik</dt><dd><span className="status-pill" data-tone={priorityTones[workflow.priority] ?? "neutral"}>{priorityNames[workflow.priority] ?? workflow.priority}</span></dd></div>
                  <div><dt>Oluşturuldu</dt><dd>{formatDate(workflow.created_at, true)}</dd></div>
                  <div><dt>Güncellendi</dt><dd>{formatDate(workflow.updated_at, true)}</dd></div>
                </dl>
              </section>
              <section className="opd-ayrinti-bolum">
                <h3>Takip ekranı</h3>
                {contract?.tracking_code ? (
                  <>
                    <p className="opd-takip-kod"><code>{contract.tracking_code}</code></p>
                    {/* Müşteriye telefonda söylemek ve müşterinin ne gördüğüne bakmak: günlük iki iş, aç ve kopyala. */}
                    <div className="talep-iletisim">
                      {takipAdresi ? <a className="panel-secondary" target="_blank" rel="noreferrer" href={`${takipAdresi}?code=${encodeURIComponent(contract.tracking_code)}`}>Takip ekranını aç</a> : null}
                      <KopyalaDugmesi metin={contract.tracking_code} etiket="Kodu kopyala" />
                    </div>
                  </>
                ) : <p className="talep-bos">Takip kodu yok (sözleşmeye bağlı değil).</p>}
              </section>
              <section className="opd-ayrinti-bolum">
              {/*
                BAĞLANTILAR (teklif ve sözleşme detayıyla eşitleme): talep, teklif
                ve sözleşme. Eskiden düz metindi ve sütunun en altındaydı.
                Sözleşme ve teklif tutar taşıyor: bağlantı yalnızca atama yetkisi
                olana (önceki kural); operasyon personeli numarayı ve durumu görür.
                Görünüm (ops_proposals) arşiv sebebini taşımıyor; işi olan teklif
                imzalı sözleşmeden geldiği için arşivdeyse "Kabul edildi" yazılır.
              */}
              <div className="talep-gecmis">
                <h3>Bağlantılar</h3>
                <ul>
                  {contract?.opportunity_id ? (
                    <li>
                      {crmVar && canAssign ? (
                        <Link href={`/panel/crm/requests/${contract.opportunity_id}`}>
                          <span className="talep-gecmis-metin"><b>Talep</b><small>{opportunity?.stage ? (requestStageNames[opportunity.stage] ?? opportunity.stage) : formatSubject(opportunity?.title) || "Talep"}</small></span>
                        </Link>
                      ) : (
                        <div><span className="talep-gecmis-metin"><b>Talep</b><small>{opportunity?.stage ? (requestStageNames[opportunity.stage] ?? opportunity.stage) : "—"}</small></span></div>
                      )}
                    </li>
                  ) : null}
                  {proposal ? (
                    <li>
                      {crmVar && canAssign ? (
                        <Link href={`/panel/crm/proposals/${proposal.id}`}>
                          <span className="talep-gecmis-metin"><b>Teklif {proposal.proposal_no}</b><small>{teklifDurumu}</small></span>
                        </Link>
                      ) : (
                        <div><span className="talep-gecmis-metin"><b>Teklif {proposal.proposal_no}</b><small>{teklifDurumu}</small></span></div>
                      )}
                    </li>
                  ) : null}
                  {contract ? (
                    <li>
                      {crmVar && canAssign ? (
                        <Link href={`/panel/crm/contracts/${contract.id}`}>
                          <span className="talep-gecmis-metin"><b>Sözleşme {contract.contract_no}</b><small>{contractStatusLabel(contract.status)}</small></span>
                        </Link>
                      ) : (
                        <div><span className="talep-gecmis-metin"><b>Sözleşme {contract.contract_no}</b><small>{contractStatusLabel(contract.status)}</small></span></div>
                      )}
                    </li>
                  ) : (
                    <li><div><span className="talep-gecmis-metin"><b>Sözleşme</b><small>Bağlı değil (kurum içi iş)</small></span></div></li>
                  )}
                </ul>
              </div>
              </section>
              <section className="opd-ayrinti-bolum is-genis">
              {/* Operasyon sözleşmeyi ve teklifi göremiyor; müşteri hakkında bildikleri bu künye. */}
              <MusteriKunyesi
                kunye={(opportunity?.kunye ?? null) as Kunye | null}
                iletisim={opportunity ?? null}
                /* İmzalı sözleşmede ad ve e-posta belgede de değişiyor. */
                sozlesmeImzali={contract?.status === "signed"}
                opportunityId={contract?.opportunity_id ?? null}
                workflowId={workflow.id}
                duzenlenebilir={canEditDue}
                /* Ad, e-posta ve telefon bu pencerenin üstünde, İletişim bölümünde. */
                iletisimGoster={false}
              />
              </section>
            </div></div>
          </PanelModal>
        </section>

        {/*
          İLETİŞİM: kanal başına bir düğme, üstünde bildirim rozeti. Kurum
          içi (yorumlar) ile müşteriyle yazışma ayrı başlıkta: hangisinin
          müşteriye gittiği ilk bakışta belli olsun.
        */}
        <section className="panel-card opd-kart opd-iletisim" aria-label="İletişim">
          <h2 className="opd-kart-baslik">İletişim</h2>
          {contract?.opportunity_id ? (
            <>
              {/* Başlığın altında özet: pencereyi açmadan kaç yorum olduğu ve en son ne zaman yazıldığı görünsün. */}
              <h3 className="opd-kanal-grup">Kurum içi</h3>
              <p className="opd-kanal-ozet">
                {comments.length && sonYorumZamani
                  ? <>{comments.length} yorum · son <time dateTime={sonYorumZamani}>{ozetZamani(sonYorumZamani)}</time></>
                  : "Henüz yorum yok"}
              </p>
              <KanalDugmesi
                anahtar={`kanal:${workflow.id}:yorum`}
                etiket="Yorumlar"
                olaylar={baskalarininYorumlari}
                varsayilanGorulme={sonYorumum}
                title="Ekip içi yorumlar"
                description="Yalnızca ekip görür; müşteriye gitmez."
                kicker={`İŞ · ${formatSubject(workflow.title)}`}
              >
                <InternalComments opportunityId={contract.opportunity_id} contextType="operation" contextId={workflow.id} gorunum="akis" />
              </KanalDugmesi>
            </>
          ) : null}
          <h3 className="opd-kanal-grup">Müşteri</h3>
          <p className="opd-kanal-ozet">
            {sonMusteriMesajiZamani
              ? <>Son mesaj <time dateTime={sonMusteriMesajiZamani}>{ozetZamani(sonMusteriMesajiZamani)}</time></>
              : "Müşteri henüz yazmadı"}
          </p>
          <KanalDugmesi
            anahtar={`kanal:${workflow.id}:mesaj`}
            etiket="Mesajlar"
            olaylar={okunmamisMesajZamanlari}
            title={musteriAdi ?? "Müşteri mesajları"}
            description="Müşterinin takip ekranından yazdıkları; yanıtınız orada görünür."
            kicker="MÜŞTERİ MESAJLARI"
            baslangicAcik={acilacakPencere === "mesajlar"}
          >
            <MarkCustomerMessagesRead workflowId={workflow.id} unread={unreadCustomerMessages} />
            <MusteriSohbeti workflowId={workflow.id} messages={customerMessages} customerName={customerName} canReply={Boolean(contract)} bugun={bugunIstanbul} />
          </KanalDugmesi>
          {whatsappGorur && whatsappEntegre ? (
            <KanalDugmesi
              anahtar={`kanal:${workflow.id}:whatsapp`}
              etiket="WhatsApp"
              olaylar={whatsappMesajlari[0]?.direction === "inbound" ? [whatsappMesajlari[0].createdAt] : []}
              title={musteriAdi ?? "WhatsApp"}
              kicker="WHATSAPP"
            >
              <WhatsappAkisi mesajlar={whatsappMesajlari} numara={whatsappNumarasi} musteri={musteriAdi ?? customerName} />
            </KanalDugmesi>
          ) : null}
          {postaGorur ? (
            <KanalDugmesi
              anahtar={`kanal:${workflow.id}:posta`}
              etiket="Postalar"
              olaylar={okunmamisPostaZamanlari}
              title={musteriAdi ?? "Postalar"}
              kicker="POSTALAR"
            >
              <PostaAkisi postalar={postalar} epostaVar={Boolean(opportunity?.contact_email)} />
            </KanalDugmesi>
          ) : null}
        </section>

        {/*
          Alt sıra iki kart (03.11.2026, kurum sahibinin isteği): müşteri
          kartının altında evrak teslimi ve sıradaki görev, iletişim kartının
          altında durum ve top kimde alt alta.
        */}
        <section className="panel-card opd-kart opd-evrak-kart" aria-label="Evrak ve sıradaki görev">
          <h3 className="opd-kanal-grup">Evrak teslimi</h3>
          {/*
            MÜŞTERİ NİHAİ EVRAK TESLİMİ. Düğmenin rengi ve cümlesi ödeme
            durumunu söylüyor: ödeme kapanmamışsa "ödeme tamamlanınca açılır"
            kuralındaki dosyalar müşteride kilitli görünür.
          */}
          <PanelModal
            triggerClassName={`opd-evrak is-${!portalPayment.hasContract ? "notr" : portalPayment.settled ? "tamam" : "bekliyor"}`}
            triggerLabel="Nihai evrak gönderimi"
            tetik={<>
              <b>Nihai evrak gönderimi</b>
              <span>
                {!portalPayment.hasContract
                  ? "Sözleşmesiz iş"
                  : portalPayment.settled
                    ? `Ödeme tamamlandı · ${portalFiles.length} dosya`
                    : `Ödeme bekleniyor · ${portalFiles.length} dosya`}
              </span>
            </>}
            title="Müşteri nihai evrak teslimi"
            description="Müşterinin takip ekranındaki “Dosyalarınız” bölümüne giden dosyalar."
            kicker="OPERASYON"
            boy="buyuk"
            baslangicAcik={acilacakPencere === "evrak"}
          >
            {portalSetupMissing ? (
              <p className="opd-pf-banner" data-tone="warning" role="status"><b>Kurulum bekleniyor</b><span>Veritabanı güncellemesi (20260912203000_customer_portal_files) henüz çalıştırılmadı. Çalıştırıldığında dosya gönderimi burada açılır.</span></p>
            ) : (
              <PortalFilesCard workflowId={workflow.id} organizationId={organizationId} payment={portalPayment} files={portalFiles} downloadsConfigured={portalDownloadsConfigured} />
            )}
          </PanelModal>
          {/*
            SIRADAKİ GÖREV (03.11.2026, kurum sahibinin seçimi): tamamlanmamış
            ilk görev ve teslim tarihi. Personelin en sık sorusu "şimdi ne
            yapmalıyım"; kayıt geçmişi bu yerdeydi, ⋯ menüsüne döndü.
            Tıklayınca görev listesinde o satıra iner.
          */}
          <h3 className="opd-kanal-grup">Sıradaki görev</h3>
          {siradakiGorev ? (
            <a className={`opd-evrak opd-siradaki is-${siradakiUyari === "overdue" ? "bekliyor" : siradakiUyari === "due_soon" ? "yaklasti" : "notr"}`} href={`#gorev-${siradakiGorev.id}`}>
              <b>{formatSubject(siradakiGorev.title)}</b>
              <span>
                {siradakiGorev.due_date ? formatDate(siradakiGorev.due_date) : "Tarih yok"}
                {siradakiUyari ? ` · ${siradakiUyari === "overdue" ? "gecikti" : "yaklaştı"}` : ""}
                {siradakiGorev.assigned_employee_id && employeeNames.get(siradakiGorev.assigned_employee_id) ? ` · ${formatPersonName(employeeNames.get(siradakiGorev.assigned_employee_id)!)}` : ""}
              </span>
            </a>
          ) : (
            <p className="opd-evrak is-notr opd-siradaki"><b>{steps.length ? "Bütün görevler tamamlandı" : "Henüz görev yok"}</b></p>
          )}
        </section>

        <section className="panel-card opd-kart opd-durum-kart" aria-label="Durum">
            <AnindaForm action={setWorkflowStatus} className="opd-ff">
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <span className="opd-ff-etiket">Durum</span>
              {/* Ortak durum seçici (components/durum-secici): tarayıcının <select>'i yerine hap düğme + liste, ArvoARC'ta da aynı. */}
              <DurumSecici name="status" etiket="İş durumu" deger={workflow.status} disabled={isArchived}
                secenekler={statusOptions.map(([value, label]) => ({ deger: value, etiket: label, ton: statusTone(value) }))} />
            </AnindaForm>
            <AnindaForm action={setWaitingParty} className="opd-ff">
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <span className="opd-ff-etiket">Top kimde</span>
              <DurumSecici name="waiting_party" etiket="Top kimde" deger={bekleyenTaraf} disabled={isArchived}
                secenekler={BEKLEYEN_TARAFLAR.map((taraf) => ({ deger: taraf, etiket: BEKLEYEN_TARAF_ADLARI[taraf], ton: BEKLEYEN_TARAF_TONLARI[taraf] }))} />
              {/* "Ne bekleniyor" kutusu 03.11.2026'da kaldırıldı (kurum sahibinin isteği); kayıtlı not silinmiyor, yalnızca burada sorulmuyor. */}
              <span className="opd-ff-not">{beklemeOzeti(bekleyenTaraf, workflow.waiting_since, bugunIstanbul)}</span>
            </AnindaForm>
        </section>

        <section className="panel-card talep-bilgi opd-gorevler" aria-label="Görevler">
          {/*
            BAŞLIK (03.11.2026, panel kalitesinde toparlandı). Eskiden başlık,
            sayaç ve çalışma türü üst üste üç düz satırdı, yüzde sağda tek
            başına duruyordu ve ilerleme çubuğu başlığın dışındaydı. Şimdi:
            başlık + sayaç + yüzde tek satır, altında çubuk, en altta tür.
            Liste kayarken başlık üstte kalır.
          */}
          <header className="opd-gorev-bas">
            <div className="opd-gorev-ust">
              <h2>Görevler</h2>
              <span className="opd-gorev-sayac">{completedCount}/{steps.length} tamamlandı</span>
              {due.late ? <span className="status-pill" data-tone="danger">Termin geçti</span> : null}
              <strong className="opd-gorev-yuzde">%{progress}</strong>
            </div>
            <div className="opd-bar" aria-hidden="true"><i style={{ "--p": `${progress}%` } as CSSProperties} /></div>
            <div className="opd-gorev-alt">
              {calismaTurleri.length ? (
                <span className="opd-tur">
                  Çalışma türü <b className="opd-tur-cip">{mevcutTur?.name ?? "Öntanımlı"}</b>
                  {!isArchived && calismaTurleri.length > 1 ? (
                    <PanelDrawer
                      triggerLabel="Değiştir"
                      triggerClassName="opd-tur-degistir"
                      kicker={`İŞ · ${formatSubject(workflow.title)}`}
                      title="Çalışma türünü değiştir"
                      description="İş yanlış türle açıldıysa görev listesini doğru türün listesine çevirin."
                    >
                      <form className="panel-form kayit-formu" action={changeWorkType}>
                        <input type="hidden" name="workflow_id" value={workflow.id} />
                        <label className="wide"><span>Yeni çalışma türü<b className="req" aria-hidden="true">*</b></span>
                          <select name="step_template_set" required defaultValue="">
                            <option value="" disabled>Seçin</option>
                            {calismaTurleri.map((t) => (
                              <option key={t.code} value={t.code} disabled={t.code === workflow.step_template_set || !t.gorev}>
                                {t.name} · {t.gorev ? `${t.gorev} görev` : "listesi boş"}{t.code === workflow.step_template_set ? " (şu anki)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <ul className="wide opd-tur-bilgi">
                          <li><b>{completedCount}</b> tamamlanmış görev olduğu gibi kalır (kimin tiklediği dahil).</li>
                          <li><b>{steps.length - completedCount}</b> tamamlanmamış görev kaldırılır, yerine yeni türün görevleri gelir; bu görevlerdeki tarih ve sorumlu atamaları da kalkar.</li>
                          <li>Değişiklik işin kayıt geçmişine yazılır.</li>
                        </ul>
                        <div className="wide panel-form-actions kayit-formu-eylem">
                          <p>Geri almak için türü yeniden değiştirebilirsiniz.</p>
                          <button className="panel-primary" type="submit">Türü değiştir</button>
                        </div>
                      </form>
                    </PanelDrawer>
                  ) : null}
                </span>
              ) : null}
              {steps.length > completedCount ? <span className="opd-gorev-kalan">{steps.length - completedCount} görev kaldı</span> : null}
            </div>
          </header>
          {/*
            TARİHLERİ DAĞIT. Canlıda işlerin hiçbirinde aşama tarihi
            yoktu; tek tek girmek iş başına sekiz giriş demek ve kimse
            yapmıyordu. Elle girilmiş tarihler çapa olarak korunuyor,
            yani düğme daha önce yapılan planlamayı ezmiyor.
          */}
          {/* Dağıtılacak ya da atlanan aşama yoksa kutu hiç çizilmez:
              eskiden içi boş, çerçeveli bir şerit kalıyordu. */}
          {canEditDue && steps.length && (dagitim.atamalar.length || dagitim.atlanan) ? (
            <div className="opd-dagit">
              {dagitim.atamalar.length ? (
                <>
                  <p>
                    Tarihsiz {dagitim.atamalar.length} aşama, işin{" "}
                    {workflow.start_date ? `${formatDate(workflow.start_date)} – ` : ""}
                    {formatDate(workflow.due_date)} takvimine dağıtılacak. Girilmiş tarihler korunuyor.
                    {dagitim.atlanan ? ` ${dagitim.atlanan} aşama için aralık tanımlı değil, tarihsiz kalacak.` : ""}
                  </p>
                  <form action={distributeStepDates}>
                    <input type="hidden" name="workflow_id" value={workflow.id} />
                    <button type="submit">Tarihleri dağıt</button>
                  </form>
                </>
              ) : dagitim.atlanan ? (
                <p>
                  {dagitim.atlanan} aşama tarihsiz.{" "}
                  {workflow.due_date
                    ? "Dağıtmak için aşamaların arasında bir aralık gerekiyor; işin başlangıç tarihini girin."
                    : "Dağıtmak için önce işin teslim tarihini girin."}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="opd-steps">
            {steps.map((step) => {
              /*
                Adımın kendi gecikmesi. İşin termini bir tarihti; oysa
                dokuz parçalı bir tezde geciken şey genelde iş değil, tek
                bir bölüm oluyor ve o gecikme hiçbir yerde görünmüyordu.
              */
              const uyari = hatirlatmaDurumu(step, bugunIstanbul);
              const stepAssignee = step.assigned_employee_id ? employeeNames.get(step.assigned_employee_id) ?? null : null;
              const grup = grupBaslari.get(step.id);
              return (
                <Fragment key={step.id}>
                  {grup ? (
                    <h3 className="opd-phase">
                      {grup.no ? <span className="opd-phase-no" aria-hidden="true">{grup.no}</span> : null}
                      <span className="opd-phase-name">{grup.baslik}</span>
                      <small>{grup.biten}/{grup.toplam} görev</small>
                    </h3>
                  ) : null}
                  <div className={`opd-step${step.is_completed ? " is-done" : ""}`} id={`gorev-${step.id}`}>
                    <form action={toggleWorkflowStep}>
                      <input type="hidden" name="step_id" value={step.id} />
                      <input type="hidden" name="workflow_id" value={workflow.id} />
                      <input type="hidden" name="is_completed" value={String(!step.is_completed)} />
                      <button type="submit" aria-pressed={step.is_completed}>
                        <span className="opd-check" aria-hidden="true">{step.is_completed ? <CheckIcon /> : null}</span>
                        <span className="opd-step-body">
                          <b>{step.title}</b>
                          {step.is_completed ? (
                            /* Kim tikledi: şablondaki görevleri kimin tamamladığı ekipçe görülsün
                               (kurum sahibinin isteği). completed_by sunucuda oturumdaki kişiden
                               yazılıyor; eski kayıtlarda boşsa yalnızca tarih kalır. */
                            <small>
                              Tamamlandı · {formatDate(step.completed_at, true)}
                              {step.completed_by ? <> · <span className="opd-step-kim">{uploaderNames.get(step.completed_by) ?? "Ekip üyesi"}</span></> : null}
                            </small>
                          ) : null}
                        </span>
                        {uyari ? (
                          <span className="opd-step-flag" data-tone={uyari === "overdue" ? "danger" : "warning"}>
                            {uyari === "overdue" ? "Gecikti" : "Yaklaştı"}
                          </span>
                        ) : null}
                      </button>
                    </form>
                    {isArchived ? null : (
                    /*
                      DENETİMLER SATIRIN İÇİNDE VE ANINDA KAYDEDİYOR: durum,
                      tarih ve sorumlu değişince kaydeden alanlar. Eskiden her
                      birinin kendi "Kaydet"i vardı; yirmi görevde altmış
                      tıklama demekti.
                    */
                    <div className="opd-step-meta">
                      <AnindaForm action={setStepStatus} className="opd-ff">
                        <input type="hidden" name="step_id" value={step.id} />
                        <DurumSecici name="status" etiket={`${step.title} durumu`} deger={step.status}
                          secenekler={STEP_STATUSES.map((value) => ({ deger: value, etiket: STEP_STATUS_LABELS[value], ton: STEP_STATUS_TONES[value] }))} />
                      </AnindaForm>
                      {canEditDue ? (
                        <AnindaForm action={setStepDueDate} className="opd-ff">
                          <input type="hidden" name="step_id" value={step.id} />
                          <TarihSecici className="tsc-kucuk" key={step.due_date ?? "yok"} name="due_date" defaultValue={step.due_date ?? ""} aria-label={`${step.title} teslim tarihi`} />
                        </AnindaForm>
                      ) : null}
                      {canAssign ? (
                        <AnindaForm action={assignStep} className="opd-ff">
                          <input type="hidden" name="step_id" value={step.id} />
                          {/*
                            REACT 19 EYLEMDEN SONRA FORMU SIFIRLIYOR ve
                            kontrolsüz alanda sıfırlama MOUNT anındaki
                            değere dönüyor; defaultValue sonradan değişse
                            de DOM'u güncellemiyor. key sunucudan gelen
                            değere bağlı: değer değişince alan yeniden
                            kuruluyor.
                          */}
                          <select key={step.assigned_employee_id ?? "yok"} name="assigned_employee_id" defaultValue={step.assigned_employee_id ?? ""} aria-label={`${step.title} sorumlusu`}>
                            <option value="">Sorumlu yok</option>
                            {employees.map((employee) => (
                              <option key={employee.id} value={employee.id}>{formatPersonName(employee.full_name)}</option>
                            ))}
                          </select>
                        </AnindaForm>
                      ) : stepAssignee ? <span className="opd-step-hint">{formatPersonName(stepAssignee)}</span> : null}
                    </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
            {!steps.length ? <p className="opd-empty">Henüz görev yok. Görevler çalışma türünün listesinden gelir; “Türü değiştir” ile seçilir.</p> : null}
          </div>
          {/*
            "Yeni görev ekle" satırı 03.11.2026'da kurum sahibinin isteğiyle
            kaldırıldı; görevler çalışma türünün listesinden geliyor. Sunucu
            işlemi (addWorkflowStep) yerinde; yeniden açılırsa form buraya döner.
          */}
        </section>

      </div>
    </main>
  );
}
