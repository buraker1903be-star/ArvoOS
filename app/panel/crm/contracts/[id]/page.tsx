import { TarihSecici } from "@/app/panel/components/tarih-secici";
import Link from "next/link";
import { kimlikMi } from "@/lib/kimlik";
import { Suspense } from "react";
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
import { ResmiBilgiUyarisi } from "../../resmi-bilgi-uyarisi";
import { formatPhone } from "@/lib/format-phone";
import { workflowStatusNames } from "../../../operations/ops-shared";
import { istanbulDateTime, todayInIstanbul } from "@/lib/istanbul-date";
import type { TaksitDurumu } from "@/lib/taksit-dagitimi";
import { cariTaksitSonuclari, taksitDurumu as taksitDurumuCoz } from "../taksit-durumu";
import { formatSubject } from "@/lib/table-format";
import { proposalStatusLabel } from "../../status-labels";
import { teklifGrubu, TEKLIF_GRUP_ADLARI } from "@/lib/teklif-grubu";
import { CONTRACT_STATUS_LABELS as labels } from "../../status-labels";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../../../accounts/confirm-delete-button";
import { deleteContract, issueContractLink, markContractStatus, setContractSignDeadline, updateContract } from "../../contract-actions";
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
import { PanelModal } from "../../../components/panel-modal";
import { ozetZamani, yorumOzetiOku } from "../../kayit-detay/akis-kanallari";
import { KanalDugmesi } from "../../kayit-detay/kanal-dugmesi";
import { PostaAkisi, WhatsappAkisi, musteriPostalari, musteriWhatsapp } from "../../musteri-yazismalari";
import "../../request-page.css";
import "../../crm.css";
import "../../kayit-detay/kayit-detay.css";
import "../../../components/kayit-formu.css";
import { kurumHizmetTurleri } from "@/lib/hizmet-turleri-oku";
import { modulGerek } from "@/lib/modul-kapisi";
import { HizmetTuruOnerileri } from "../../hizmet-turu-onerileri";
import { PortalZiyareti } from "../../portal-ziyareti";
import { SozlesmeMaddeleri } from "./sozlesme-maddeleri";
import { KopyalaDugmesi } from "../../../accounts/kopyala-dugmesi";
import { doluAlanlar, type Kunye } from "@/lib/musteri-kunyesi";
import { liraYazisi } from "@/lib/turkish-amount";

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
// dilim-tamam: due_date bir GÜN (date sütunu), an değil — dilim eklense de aynı günü yazar.
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("tr-TR") : "—";
/* Dilim şart: last_viewed_at ve created_at birer AN. Dilimsiz
   biçimlendirilince sunucunun UTC'si yazılıyor ve Türkiye'de gece
   00:00–03:00 arasında olan her şey bir önceki güne düşüyor. */
const tarih = (value: string | null) =>
  value ? istanbulDateTime(value, { day: "numeric", month: "long", year: "numeric" }) : null;
/* Olay tarihi uzun ve günlü ("27 Ekim 2026 Salı"): imzaya gönderim, imza ve son görüntüleme birer AN, dilim şart. */
const uzunTarih = (value: string) => istanbulDateTime(value, { day: "numeric", month: "long", year: "numeric", weekday: "long" });
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) : "—";
// Ek protokol rozet tonu: bekleyen sarı, onaylı yeşil, değişiklik talebi turuncu, geri çekilen gri.
const ADDENDUM_TONES: Record<string, string> = { sent: "pending", accepted: "accepted", rejected: "blocked", cancelled: "archived" };
// Taksit durumu cari dökümünden türetiliyor (lib/taksit-dagitimi.ts).
const TAKSIT_ADLARI: Record<TaksitDurumu, string> = { odendi: "Ödendi", kismi: "Kısmen ödendi", bekliyor: "Bekliyor", gecikti: "Gecikti", iptal: "İptal" };

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa onu çökme ekranına çeviriyordu. */
  if (!kimlikMi(id)) notFound();
  const { supabase, membership, modules, organization, izin, userId } = await getPanelContext();
  modulGerek(modules, "crm");
  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,contract_no,title,scope,amount,currency,payment_plan,payment_plan_type,start_date,due_date,status,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,share_token,signed_name,signed_at,workflow_id,tracking_code,customer_address,customer_tax_number,customer_tax_office,subscription_intent,opportunity_id,payment_schedule,payment_plan_id,party_id,imza_son_tarihi,crm_proposals(id,proposal_no,status,archive_reason,payment_schedule),crm_opportunities!inner(id,customer_name,contact_email,contact_phone,title,assigned_employee_id,request_details)")
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
  /* ÖDEME ÖZETİ: kaç taksitin ve ne kadarının ödendiği, vadesi geçen.
     Kural ortak yardımcıda (../taksit-durumu.ts): yaşam döngüsü sayfası
     da aynı sonucu gösteriyor. */
  const bugunAnahtari = todayInIstanbul();
  const taksitSonucu = installments.length ? await cariTaksitSonuclari(supabase, membership.organization_id, data, bugunAnahtari) : null;
  const taksitDurumu = (row: AddendumInstallment) => taksitDurumuCoz({ no: row.sequence, amount: row.amount, status: row.status, due_date: row.due_date }, taksitSonucu, bugunAnahtari);
  const odenen = installments.filter((row) => taksitDurumu(row).durum === "odendi");
  const odenenTutar = installments.reduce((sum, row) => sum + taksitDurumu(row).odenen, 0);
  const taksitToplami = installments.reduce((sum, row) => sum + row.amount, 0);
  /*
    BAĞLANTILAR (teklif detayıyla eşitleme): talep, kaynak teklif ve iş.
    İşin durumu ve ilerlemesi ayrı okunur; okunamazsa (yetki, RLS) yalnızca
    bağlantı gösterilir.
  */
  const { data: isData } = data.workflow_id
    ? await supabase.from("operation_workflows").select("id,status,assigned_employee_id,operation_steps(is_completed),operation_workflow_assignees(employee_id)").eq("id", data.workflow_id).eq("organization_id", membership.organization_id).maybeSingle()
    : { data: null };
  const is = isData as { id: string; status: string; assigned_employee_id: string | null; operation_steps: { is_completed: boolean }[] | null; operation_workflow_assignees: { employee_id: string }[] | null } | null;
  /*
    Operasyon sorumluları (03.11.2026, müşteri kartında). Satış personeli
    işi göremiyorsa (RLS) satır hiç çizilmez; ad okunamazsa da öyle —
    "atanmamış" yazmak yanlış olurdu.
  */
  const operasyonKimlikleri = [is?.assigned_employee_id, ...(is?.operation_workflow_assignees ?? []).map((a) => a.employee_id)].filter((k): k is string => Boolean(k));
  // hata-tamam: yalnızca ad; okunamazsa satır çizilmiyor
  const { data: operasyonAdlari } = operasyonKimlikleri.length
    ? await supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).in("id", operasyonKimlikleri)
    : { data: [] as { id: string; full_name: string }[] };
  const operasyonAdi = new Map(((operasyonAdlari ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, formatPersonName(e.full_name)]));
  const operasyonSorumlusu = is?.assigned_employee_id ? operasyonAdi.get(is.assigned_employee_id) ?? null : null;
  const ekOperasyon = (is?.operation_workflow_assignees ?? []).map((a) => operasyonAdi.get(a.employee_id)).filter(Boolean).join(", ");
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

  /* Müşteriyle yazışmalar (WhatsApp ve Postalar sekmeleri): talep detayı ve
     müşteri sayfasıyla aynı kural (../../musteri-yazismalari.tsx). Posta
     sözleşmenin talebine bağlı ya da müşterinin adresiyle eşleşenler. */
  const postaGorur = izin("posta.gor");
  const [{ numara: whatsappNumarasi, mesajlar: whatsappMesajlari }, postalar, hizmetTurleri, yorumOzeti] = await Promise.all([
    musteriWhatsapp(membership.organization_id, customer?.contact_phone),
    postaGorur ? musteriPostalari(supabase, membership.organization_id, { talepIdleri: [data.opportunity_id], eposta: customer?.contact_email }) : Promise.resolve([]),
    // Düzenleme formundaki hizmet türü önerileri (Ayarlar → Hizmet türleri).
    kurumHizmetTurleri(supabase, membership.organization_id),
    yorumOzetiOku(supabase, membership.organization_id, data.opportunity_id, userId),
  ]);
  /* WhatsApp düğmesi yalnızca kurumun kendi hesabı bağlıysa (iş detayıyla aynı kural). */
  const whatsappEntegre = waDurum.connected && waDurum.status !== "disabled";
  const sonMusteriMesajiZamani = customerMessages.filter((m) => m.sender_type === "customer").map((m) => m.created_at).sort().at(-1) ?? null;
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
  /* Üçüncü katman: imzaya gönderme artık sunucuda da anahtara bağlı
     (contract-actions · issueContractLink). Yetkisi olmayana düğme
     gösterip sunucuda reddetmek, hatayı tıklamadan önce söylememek
     demek. */
  const imzayaGonderir = izin("crm.sozlesme.yonet");
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

  /* İş termin tarihine kalan gün; iki gün anahtarı da UTC gece yarısına sabitli (saat dilimi kaymaz). */
  const imzaKalan = !locked && data.imza_son_tarihi ? Math.round((Date.parse(`${data.imza_son_tarihi}T00:00:00Z`) - Date.parse(`${bugunAnahtari}T00:00:00Z`)) / 86400000) : null;
  const terminKalan = data.due_date ? Math.round((Date.parse(`${data.due_date}T00:00:00Z`) - Date.parse(`${bugunAnahtari}T00:00:00Z`)) / 86400000) : null;
  const kunyeSatirlari = doluAlanlar((customer?.request_details ?? {}) as Kunye);
  /*
    İki düzenleme penceresi aynı sunucu işlemini (updateContract) çağırıyor;
    işlem bütün alanları okuyor. Pencerede olmayan bölümün değerleri burada
    GİZLİ alanla taşınıyor, yoksa boş gelen alan kaydı silerdi (ör. müşteri
    penceresinden kaydedince teslim tarihi düşerdi).
  */
  const gizliDegerler: Record<"sozlesme" | "musteri", [string, string][]> = {
    sozlesme: [["title", data.title ?? ""], ["scope", data.scope ?? ""], ["amount", liraYazisi(data.amount)], ["payment_plan", data.payment_plan ?? ""], ["start_date", data.start_date ?? ""], ["due_date", data.due_date ?? ""]],
    musteri: [
      ["customer_name", customer?.customer_name ?? ""], ["contact_phone", customer?.contact_phone ?? ""], ["contact_email", customer?.contact_email ?? ""],
      ["service_type", String(customer?.request_details?.service_type ?? "")], ["academic_level", String(customer?.request_details?.academic_level ?? "")],
      ["university", String(customer?.request_details?.university ?? "")], ["department", String(customer?.request_details?.department ?? "")],
      ["customer_address", data.customer_address ?? ""], ["customer_tax_number", data.customer_tax_number ?? ""], ["customer_tax_office", data.customer_tax_office ?? ""],
    ],
  };
  const gizliAlanlar = (haric: "hizmet" | "musteri" | "termin") => {
    const satirlar = haric === "hizmet" ? [...gizliDegerler.musteri, ...gizliDegerler.sozlesme.filter(([ad]) => ad === "due_date")]
      : haric === "musteri" ? gizliDegerler.sozlesme
      : [...gizliDegerler.musteri, ...gizliDegerler.sozlesme.filter(([ad]) => ad !== "due_date")];
    return <>{satirlar.map(([ad, deger]) => <input key={ad} type="hidden" name={ad} value={deger} />)}</>;
  };

  return (
    <main className="crm-page-stack crm-request-detail-page talep">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{data.contract_no}</small>
          <h1>{data.title}</h1>
        </div>
        {/* Aşama çizgisi başlıkta (03.11.2026, kurum sahibinin çizimi); reddedilen ve iptal edilende çizgi yerine sebep. */}
        <div className="kd-bas-asama">
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
        </div>
        <div className="talep-bas-eylem">
          {/*
            İMZA SON TARİHİ (03.11.2026, 20261103142231). Yalnızca imzaya açık
            sözleşmede; geçince müşteri imzalayamaz (kural imza işlevinde).
            Boşsa süresiz; bağlantı oluşturulurken 30 gün önerilir.
          */}
          {!locked ? (
            <div className="opd-bas-termin">
              <p><b>İmza son tarihi:</b> {data.imza_son_tarihi ? tarih(`${data.imza_son_tarihi}T12:00:00`) : "Süresiz"}</p>
              {imzaKalan !== null ? <p><span className="status-pill" data-tone={imzaKalan < 0 ? "danger" : imzaKalan <= 3 ? "warning" : "info"}>{imzaKalan < 0 ? "Süresi doldu" : imzaKalan === 0 ? "Bugün son gün" : `${imzaKalan} gün kaldı`}</span></p> : null}
              {imzayaGonderir ? (
                <PanelModal
                  triggerClassName="panel-secondary opd-bas-termin-dugme"
                  triggerLabel={data.imza_son_tarihi ? "Yeni imza son tarihi belirle" : "İmza son tarihi belirle"}
                  title="İmza son tarihi"
                  description="Müşteri sözleşmeyi bu güne kadar (bu gün dahil) imzalayabilir. Boş bırakılırsa süresiz."
                  kicker={`SÖZLEŞME · ${data.contract_no}`}
                  boy="dar"
                  basaridaKapan
                >
                  <form className="kd-tarih-form" action={setContractSignDeadline}>
                    <input type="hidden" name="contract_id" value={data.id} />
                    <TarihSecici className="tsc-kucuk" key={data.imza_son_tarihi ?? "yok"} name="imza_son_tarihi" defaultValue={data.imza_son_tarihi ?? ""} min={bugunAnahtari} aria-label="İmza son tarihi" />
                    <button className="panel-primary" type="submit">Kaydet</button>
                  </form>
                </PanelModal>
              ) : null}
            </div>
          ) : null}
          {data.workflow_id ? (
            <Link className="panel-primary" href={`/panel/operations/${data.workflow_id}`}>İşe git</Link>
          ) : !locked && !shareUrl && imzayaGonderir ? imzayaGonder : null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              {/* Kayıt geçmişi (03.11.2026): eskiden yazışma çekmecesinin son sekmesiydi. */}
              <PanelModal triggerClassName="os-menu-item" triggerLabel="Kayıt geçmişi" title="Kayıt geçmişi" description="Alan değişiklikleri ve durum geçişleri." kicker={`SÖZLEŞME · ${data.contract_no}`} boy="buyuk">
                <RecordHistory opportunityId={data.opportunity_id} />
              </PanelModal>
              <Link className="os-menu-item" href={`/panel/crm/requests/${data.opportunity_id}`}>Talebe git</Link>
              {!locked || canDelete ? (
                <PanelDrawer
                  triggerLabel={locked ? "Sözleşmeyi sil" : "Sözleşmeyi kapat"}
                  kicker={`SÖZLEŞME · ${data.contract_no}`}
                  title={locked ? "Sözleşmeyi sil" : "Sözleşmeyi kapat"}
                  description={locked ? "Silme geri alınamaz." : "Sözleşmenin neden kapatıldığını seçin. Bu bilgi raporlarda kullanılıyor."}
                  triggerClassName="os-menu-item is-danger"
                >
                  {!locked ? (
                    <form className="panel-form kayit-formu" action={markContractStatus}>
                      <input type="hidden" name="contract_id" value={data.id} />
                      <label className="wide"><span>Kapanış sebebi<b className="req" aria-hidden="true">*</b></span>
                        <select name="status" defaultValue="rejected" required>
                          <option value="rejected">Müşteri reddetti</option>
                          <option value="cancelled">İptal edildi</option>
                        </select>
                      </label>
                      <div className="wide panel-form-actions kayit-formu-eylem">
                        <p>Kayıt silinmez; sözleşme kapananlar arasında kalır.</p>
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


      {/*
        DETAY DÜZENİ (03.11.2026, iş detayıyla aynı): solda üstte müşteri ve
        iletişim kartları, altlarında imza bağlantısı ile takip ekranı ve
        kaydın bağlantıları; sağda sözleşmenin kendisi. Yazışmalar ortada
        açılan pencerede, kayıt geçmişi ⋯ menüsünde.
      */}
      <div className="kd-duzen-v4">
        <section className="panel-card opd-kart opd-musteri kd-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              {/* Müşterinin bütün kayıtları tek sayfada (/panel/crm/musteri). */}
              <small><Link className="personel-tumu" href={`/panel/crm/musteri/${data.opportunity_id}`}>Müşteri sayfası</Link></small>
            </div>
          </div>
          {customer?.contact_phone || customer?.contact_email ? (
            <div className="opd-iletisim-dugmeleri">
            {customer?.contact_phone ? <a className="panel-secondary" href={`tel:${customer.contact_phone}`}>Ara</a> : null}
            {customer?.contact_email ? <a className="panel-secondary" href={`mailto:${customer.contact_email}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste opd-musteri-liste">
            <div><dt>Satış temsilcisi</dt><dd>{representative ? formatPersonName(representative) : <em>Atanmamış</em>}</dd></div>
            {operasyonSorumlusu ? <div className="is-grup"><dt>Operasyon sorumlusu</dt><dd>{operasyonSorumlusu}</dd></div> : null}
            {ekOperasyon ? <div><dt>Ek sorumlu</dt><dd>{ekOperasyon}</dd></div> : null}
            {/* Müşteri takip portalına girdi mi, kaç kez (20261012131639). */}
            {data.tracking_code ? <div className="is-grup"><dt>Müşteri portalı</dt><dd><PortalZiyareti contractId={data.id} /></dd></div> : null}
          </dl>
          <PanelModal
            triggerClassName="panel-secondary opd-ayrinti-dugme"
            triggerLabel="Müşteri ayrıntıları"
            title={musteri}
            description="İletişim, fatura bilgileri ve künye."
            kicker={`SÖZLEŞME · ${data.contract_no}`}
            boy="buyuk"
          >
            <div className="opd-ayrinti">
              <section className="opd-ayrinti-bolum">
                <h3>İletişim</h3>
                <dl className="talep-liste">
                  <div><dt>Telefon</dt><dd>{formatPhone(customer?.contact_phone) || <em>Yok</em>}</dd></div>
                  <div><dt>E-posta</dt><dd>{customer?.contact_email || <em>Yok</em>}</dd></div>
                </dl>
              </section>
              <section className="opd-ayrinti-bolum">
                <h3>Fatura bilgileri</h3>
                <dl className="talep-liste">
                  <div><dt>Vergi no</dt><dd>{data.customer_tax_number ? `${data.customer_tax_number}${data.customer_tax_office ? ` · ${data.customer_tax_office}` : ""}` : <em>Yok</em>}</dd></div>
                  <div><dt>Adres</dt><dd>{data.customer_address || <em>Yok</em>}</dd></div>
                </dl>
              </section>
              <section className="opd-ayrinti-bolum is-genis">
                <h3>Künye</h3>
                {kunyeSatirlari.length ? (
                  <dl className="talep-liste">
                    {kunyeSatirlari.map((alan) => <div key={alan.anahtar}><dt>{alan.etiket}</dt><dd>{alan.deger}</dd></div>)}
                  </dl>
                ) : <p className="talep-bos">Künye girilmemiş. “Müşteri bilgilerini düzenle” ile eklenir.</p>}
              </section>
            </div>
          </PanelModal>
        </section>

        <section className="panel-card opd-kart kd-iletisim" aria-label="İletişim">
          <h2 className="opd-kart-baslik">İletişim</h2>
          <h3 className="opd-kanal-grup">Kurum içi</h3>
          <p className="opd-kanal-ozet">
            {!yorumOzeti ? "Yorumlar okunamadı"
              : yorumOzeti.sayi && yorumOzeti.son ? <>{yorumOzeti.sayi} yorum · son <time dateTime={yorumOzeti.son}>{ozetZamani(yorumOzeti.son)}</time></>
              : "Henüz yorum yok"}
          </p>
          <KanalDugmesi
            anahtar={`kanal:sozlesme:${data.id}:yorum`}
            etiket="Yorumlar"
            olaylar={yorumOzeti?.baskalari ?? []}
            varsayilanGorulme={yorumOzeti?.benimSon ?? ""}
            title="Ekip içi yorumlar"
            description="Yalnızca ekip görür; müşteriye gitmez."
            kicker={`SÖZLEŞME · ${data.contract_no}`}
          >
            <InternalComments opportunityId={data.opportunity_id} contextType="contract" contextId={data.id} gorunum="akis" />
          </KanalDugmesi>
          <h3 className="opd-kanal-grup">Müşteri</h3>
          <p className="opd-kanal-ozet">
            {sonMusteriMesajiZamani ? <>Son mesaj <time dateTime={sonMusteriMesajiZamani}>{ozetZamani(sonMusteriMesajiZamani)}</time></> : "Müşteri henüz yazmadı"}
          </p>
          <KanalDugmesi
            anahtar={`kanal:sozlesme:${data.id}:mesaj`}
            etiket="Mesajlar"
            olaylar={customerMessages.filter((m) => m.sender_type === "customer" && !m.read_at).map((m) => m.created_at)}
            title={musteri}
            description="Müşterinin takip ekranından yazdıkları; yanıtınız orada görünür."
            kicker="MÜŞTERİ MESAJLARI"
          >
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
          </KanalDugmesi>
          {whatsappEntegre ? (
            <KanalDugmesi
              anahtar={`kanal:sozlesme:${data.id}:whatsapp`}
              etiket="WhatsApp"
              olaylar={whatsappMesajlari[0]?.direction === "inbound" ? [whatsappMesajlari[0].createdAt] : []}
              title={musteri}
              kicker="WHATSAPP"
            >
              <WhatsappAkisi mesajlar={whatsappMesajlari} numara={whatsappNumarasi} musteri={musteri} />
            </KanalDugmesi>
          ) : null}
          {postaGorur ? (
            <KanalDugmesi
              anahtar={`kanal:sozlesme:${data.id}:posta`}
              etiket="Postalar"
              olaylar={postalar.filter((posta) => posta.okunmamis).map((posta) => posta.son_mesaj_at ?? "").filter(Boolean)}
              title={musteri}
              kicker="POSTALAR"
            >
              <PostaAkisi
                postalar={postalar}
                epostaVar={Boolean(customer?.contact_email)}
                eylem={izin("posta.yanitla") && customer?.contact_email ? (
                  <Link className="panel-primary" href={`/panel/posta/yeni?alici=${encodeURIComponent(customer.contact_email)}&firsat=${encodeURIComponent(data.opportunity_id)}&konu=${encodeURIComponent(`${data.contract_no} · ${data.title}`)}`}>Posta gönder</Link>
                ) : null}
              />
            </KanalDugmesi>
          ) : null}
        </section>

        <section className="panel-card opd-kart kd-alt-sol kd-eylemler" aria-label="İmza ve takip">
          {/* İMZA BAĞLANTISI. Eskiden sayfanın en üstünde ayrı bir kart ve
              tam adresle duruyordu; teklif detayında olduğu gibi müşteri
              kartının içinde. */}
          <div className="talep-gecmis">
            <h3>İmza bağlantısı</h3>
            {shareUrl ? (
              <>
                <p className="teklif-baglanti" title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</p>
                {/* Belge müşteriye bu karttan gidiyor; eksik resmi bilgi
                    belgede yer tutucuya düşüyor (gerekçe bileşende). */}
                <Suspense fallback={null}><ResmiBilgiUyarisi organizationId={membership.organization_id} belge="sözleşme" /></Suspense>
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

          {/* TAKİP KODU. Müşteri bu kodla takip ekranında iş durumunu görür
              ve mesaj yazar. Eskiden işlem düğmelerinin arasında duruyordu. */}
          {data.tracking_code ? (
            <div className="talep-gecmis">
              <h3>Takip ekranı</h3>
              <p className="sozlesme-takip-kod">{data.tracking_code}</p>
              <p className="talep-gecmis-ozet">{trackingOpen ? "Müşteri takip ekranına girebilir." : "İmzadan sonra açılır."}</p>
              <div className="talep-iletisim">
                <KopyalaDugmesi metin={data.tracking_code} etiket="Kodu kopyala" />
                <PanelDrawer triggerLabel="Takip kodunu gönder" kicker={`SÖZLEŞME · ${data.contract_no}`} title="Takip kodu" description="Müşteri bu kodla takip ekranında kendi iş durumunu görür ve soru sorar." triggerClassName="panel-secondary">
                  <div className="sozlesme-takip">
                    <div className="sozlesme-takip-kart">
                      <small>Takip kodu</small>
                      <p className="sozlesme-takip-kod">{data.tracking_code}</p>
                      <small className="sozlesme-takip-adres">{trackingUrl.replace(/^https:\/\//, "")}</small>
                    </div>
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

        {/* BAĞLANTILAR: talep, kaynak teklif ve iş (eskiden Ayrıntılar penceresindeydi). */}
        <section className="panel-card opd-kart kd-alt-sag talep-gecmis" aria-label="Bağlantılar">
          <h3 className="opd-kanal-grup">Bağlantılar</h3>
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
        </section>

        <section className="panel-card talep-bilgi kd-ana" aria-label="Sözleşme bilgileri">
          {/*
            ANA BÖLÜM (03.11.2026, kurum sahibinin çizimi ve geri bildirimi).
            Üstte iki düzenleme düğmesi (müşteri bilgileri, sözleşme
            maddeleri) ve önizleme; altında dört kart: hizmet kapsamı ve
            ücret, ödeme planı, iş planı, iş termin tarihi. Kartın HERHANGİ
            bir yerine basınca ortada pencere açılır (eskiden kartın köşesindeki
            "Düzenle →" sağdan çekmece açıyordu). İmzalı sözleşmede pencere
            salt okunur; iş planı kartı ek protokolü açar.

            Mükerrer bölümler kalktı: tutar başlığı (tutar artık hizmet
            kartında), alttaki Kapsam bölümü (hizmet kartında) ve
            olaylardaki Başlangıç (termin kartında).
          */}
          <div className="kd-tutar-satir">
            <div>
              <h2 className="kd-ana-baslik">Sözleşme</h2>
              {pendingAddendum ? <span className="status-pill" data-tone={statusTone("pending")}>Ek protokol onay bekliyor</span> : null}
            </div>
            <div className="kd-tutar-eylem">
              {!locked ? (
                <PanelModal triggerLabel="Müşteri bilgilerini düzenle" kicker={`SÖZLEŞME · ${data.contract_no}`} title="Müşteri bilgileri" description="İletişim, künye ve fatura bilgileri. Değişiklik imza bağlantısındaki metne de yansır." triggerClassName="panel-secondary kd-hap" boy="buyuk" basaridaKapan>
                    <form className="panel-form kayit-formu" action={updateContract}>
                      <input type="hidden" name="contract_id" value={data.id} />
                      <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                      <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                      {gizliAlanlar("musteri")}
                      <p className="wide kayit-formu-bolum">Müşteri</p>
                      <label className="wide"><span>Müşteri / kurum<b className="req" aria-hidden="true">*</b></span><input name="customer_name" defaultValue={customer?.customer_name ?? ""} required minLength={2} maxLength={180} /></label>
                      <label>Telefon<input name="contact_phone" type="tel" inputMode="tel" defaultValue={customer?.contact_phone ?? ""} placeholder="05xx xxx xx xx" /></label>
                      <label>E-posta<input name="contact_email" type="email" defaultValue={customer?.contact_email ?? ""} placeholder="ornek@eposta.com" /></label>

                      <p className="wide kayit-formu-bolum">Hizmet ve akademik künye</p>
                      <label>Hizmet türü<input name="service_type" list="hizmet-turu-onerileri" defaultValue={String(customer?.request_details?.service_type ?? "")} /><HizmetTuruOnerileri liste={hizmetTurleri.liste} /></label>
                      <label>Akademik düzey<input name="academic_level" list="sozlesme-akademik-duzey" defaultValue={String(customer?.request_details?.academic_level ?? "")} placeholder="Seçin ya da yazın" /></label>
                      <label>Üniversite<input name="university" defaultValue={String(customer?.request_details?.university ?? "")} placeholder="Örn. İstanbul Üniversitesi" /></label>
                      <label>Bölüm / alan<input name="department" defaultValue={String(customer?.request_details?.department ?? "")} placeholder="Örn. İşletme" /></label>
                      <datalist id="sozlesme-akademik-duzey"><option value="Lisans" /><option value="Yüksek Lisans" /><option value="Doktora" /><option value="Tıpta Uzmanlık" /><option value="Doçentlik" /></datalist>

                      <p className="wide kayit-formu-bolum">Fatura bilgileri</p>
                      <p className="wide kayit-formu-not">Kurumsal müşteride sözleşmeye ve faturaya yazılır; bireysel müşteride boş bırakılabilir.</p>
                      <label className="wide">Adres<input name="customer_address" defaultValue={data.customer_address ?? ""} placeholder="Fatura / sözleşme adresi" /></label>
                      <label>Vergi numarası<input name="customer_tax_number" defaultValue={data.customer_tax_number ?? ""} placeholder="VKN / TCKN" /></label>
                      <label>Vergi dairesi<input name="customer_tax_office" defaultValue={data.customer_tax_office ?? ""} /></label>
                      <div className="wide panel-form-actions kayit-formu-eylem">
                        <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                        <button className="panel-primary">Değişiklikleri kaydet</button>
                      </div>
                    </form>
                </PanelModal>
              ) : null}
              <PanelModal triggerLabel="Sözleşme maddelerini düzenle" kicker={`SÖZLEŞME · ${data.contract_no}`} title="Sözleşme maddeleri" description={locked ? "İmzalanan metin; değişiklik ancak ek protokolle." : "Maddeleri yalnızca bu sözleşme için değiştirin; kurum metni değişmez."} triggerClassName="panel-secondary kd-hap" boy="buyuk">
                <SozlesmeMaddeleri contractId={data.id} duzenlenebilir={!locked && imzayaGonderir} />
              </PanelModal>
              <Link className="panel-secondary kd-hap" href={`/panel/documents/contract/${data.id}/preview`} target="_blank">Önizle</Link>
            </div>
          </div>
          {signed ? (
            <p className="teklif-kilit">İmzalı sözleşme değiştirilemez. İş planı ve vade değişikliği “Ek protokol” ile müşterinin onayına sunulur.</p>
          ) : null}

          <div className="kd-kutular">
            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="Hizmet kapsamı ve ücret"
              tetik={<>
                <span className="kd-kutu-baslik">Hizmet kapsamı ve ücret</span>
                <span className="kd-kutu-buyuk">{money(Number(data.amount), data.currency || "TRY")}</span>
                <span className="kd-kutu-alt">{data.title}</span>
                <span className="kd-kutu-ozet">{data.scope || "Kapsam yazılmamış."}</span>
                <span className="kd-kutu-ac">{locked ? "Görüntüle" : "Düzenle"} →</span>
              </>}
              title="Hizmet kapsamı ve ücret"
              description="Sözleşme başlığı, verilecek hizmetler, tutar ve başlangıç tarihi."
              kicker={`SÖZLEŞME · ${data.contract_no}`}
              boy="buyuk"
              basaridaKapan
            >
              {!locked ? (
                        <form className="panel-form kayit-formu" action={updateContract}>
                          <input type="hidden" name="contract_id" value={data.id} />
                          <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                          <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                          {gizliAlanlar("hizmet")}
                          <p className="wide kayit-formu-bolum">Hizmet ve ücret</p>
                          <label className="wide"><span>Sözleşme başlığı<b className="req" aria-hidden="true">*</b></span><input name="title" defaultValue={data.title} required maxLength={180} /></label>
                          <label className="wide"><span>Hizmet kapsamı<b className="req" aria-hidden="true">*</b></span><textarea name="scope" defaultValue={data.scope ?? ""} required placeholder="Verilecek hizmetler ve teslimler" /></label>
                          <label><span>Sözleşme tutarı (₺)<b className="req" aria-hidden="true">*</b></span><input name="amount" inputMode="decimal" autoComplete="off" defaultValue={liraYazisi(data.amount)} required /></label>
                          <label>Ödeme planı açıklaması<input name="payment_plan" defaultValue={data.payment_plan ?? ""} placeholder="Örn. Ön ödeme + son ödeme" /></label>
                          <label>Başlangıç tarihi<TarihSecici name="start_date" defaultValue={data.start_date ?? ""} /></label>
                          <p className="wide kayit-formu-not">Taksitler ve vade tarihleri “Ödeme planı” kartından değişir; teslim tarihi “İş termin tarihi” kartından; tutar değişirse taksitler yeni toplama göre ölçeklenir.</p>

                          {/* Yalnızca Arvo'nun kendi kurumunda: kiracının kendi
                              müşterisiyle yaptığı sözleşme bizim aboneliğimizi açmaz. */}
                          {arvoKurumu ? <AbonelikAlanlari niyet={data.subscription_intent} /> : null}

                          <div className="wide panel-form-actions kayit-formu-eylem">
                            <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                            <button className="panel-primary">Değişiklikleri kaydet</button>
                          </div>
                        </form>
              ) : (
                <dl className="talep-liste">
                  <div><dt>Başlık</dt><dd>{data.title}</dd></div>
                  <div><dt>Tutar</dt><dd>{money(Number(data.amount), data.currency || "TRY")}</dd></div>
                  <div><dt>Ödeme planı</dt><dd>{data.payment_plan || <em>Belirtilmedi</em>}</dd></div>
                  <div><dt>Kapsam</dt><dd className="kd-salt">{data.scope || <em>Yazılmamış</em>}</dd></div>
                </dl>
              )}
            </PanelModal>

            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="Ödeme planı"
              tetik={<>
                <span className="kd-kutu-baslik">Ödeme planı</span>
                {installments.length ? (
                  <span className="sozlesme-odeme-ozet">
                    <span><b>{money(odenenTutar, data.currency)}</b> ödendi · {odenen.length}/{installments.length} taksit</span>
                    {gecikenTaksit ? <span className="status-pill" data-tone="warning">{gecikenTaksit} taksidin vadesi geçti</span> : null}
                    <i aria-hidden="true"><b style={{ width: `${taksitToplami ? Math.round((odenenTutar / taksitToplami) * 100) : 0}%` }} /></i>
                  </span>
                ) : null}
                {paymentRows.length ? (
                  <span className="kd-kutu-liste">
                    {paymentRows.map((row) => (
                      <span key={row.sequence}>
                        <span>{row.label}: <b>{money(row.amount, data.currency)}</b></span>
                        <time>{row.when}</time>
                        {row.status || row.missing ? <small>{row.status ?? ""}{row.missing ? "vade tarihi girin" : ""}</small> : null}
                      </span>
                    ))}
                  </span>
                ) : <span className="kd-kutu-ozet">{data.payment_plan || "Taksit girilmemiş."}</span>}
                <span className="kd-kutu-ac">{locked ? "Görüntüle" : "Düzenle"} →</span>
              </>}
              title="Ödeme planı"
              description={locked ? "İmzalanan ödeme planı; vade değişikliği ek protokolle." : "Müşterinin talebiyle ödeme planını ve vade tarihlerini revize edin."}
              kicker={`SÖZLEŞME · ${data.contract_no}`}
              boy="buyuk"
              basaridaKapan
            >
              {!locked ? (
                        <ContractPaymentPlanForm
                          contractId={data.id}
                          amountCents={data.amount}
                          currentPlanType={data.payment_plan_type}
                          currentSchedule={data.payment_schedule ?? proposalJoin?.payment_schedule ?? []}
                        />
              ) : (
                <ol className="plan-timeline">
                  {paymentRows.map((row) => <li key={row.sequence}><time>{row.when}</time><span>{row.label} · {money(row.amount, data.currency)}{row.status ? ` · ${row.status}` : ""}</span></li>)}
                </ol>
              )}
            </PanelModal>

            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="İş planı"
              tetik={<>
                <span className="kd-kutu-baslik">İş planı</span>
                {!planFeature ? (
                  <span className="kd-kutu-ozet">İş planı için veritabanı güncellemesi bekleniyor.</span>
                ) : currentPlan.length ? (
                  <span className="kd-kutu-liste">
                    {currentPlan.map((item) => <span key={item.sequence}><time dateTime={item.due_date}>{date(item.due_date)}</time><span>{item.title}</span></span>)}
                  </span>
                ) : (
                  <span className="kd-kutu-ozet">{signed ? "Ara teslim takvimi yok; ek protokolle eklenir." : "Henüz ara teslim takvimi yok."}</span>
                )}
                {acceptedPlan ? <span className="kd-kutu-ozet">Ek Protokol {acceptedPlan.addendum_no} ile belirlendi.</span> : null}
                <span className="kd-kutu-ac">{!locked ? "Düzenle" : signed ? "Ek protokol" : "Görüntüle"} →</span>
              </>}
              title={signed ? "Ek protokol" : "İş planı"}
              description={signed ? "Ara teslim takvimini ve taksit vadelerini müşterinin onayına sunun." : "Ara teslim takvimini sözleşmeye yazın (madde 4)."}
              kicker={`SÖZLEŞME · ${data.contract_no}`}
              boy="buyuk"
              basaridaKapan
            >
              {!planFeature ? (
                <p className="plan-form-hint">İş planı ve ek protokol için veritabanı güncellemesi (20260914090000_contract_work_plan_addenda) henüz uygulanmadı.</p>
              ) : !locked ? (
                        <ContractWorkPlanForm contractId={data.id} initial={contractWorkPlan} />
              ) : signed ? (
                <>
                      {pendingAddendum ? (
                        <p className="kayit-formu-not">Ek Protokol {pendingAddendum.addendum_no} müşterinin onayını bekliyor. Yenisini göndermek için önce onu “İş planı ve ödeme takvimi” bölümünden geri çekin.</p>
                      ) : (
                        <ContractAddendumForm contractId={data.id} installments={installments} initialPlan={currentPlan} />
                      )}
                </>
              ) : (
                <ol className="plan-timeline">
                  {currentPlan.map((item) => <li key={item.sequence}><time dateTime={item.due_date}>{date(item.due_date)}</time><span>{item.title}</span></li>)}
                </ol>
              )}
            </PanelModal>

            <PanelModal
              triggerClassName="kd-kutu"
              triggerLabel="İş termin tarihi"
              tetik={<>
                <span className="kd-kutu-baslik">İş termin tarihi</span>
                {data.due_date ? (
                  <span className="kd-kutu-buyuk">
                    {date(data.due_date)}
                    {terminKalan !== null ? <small data-tone={terminKalan < 0 ? "danger" : terminKalan <= 7 ? "warning" : undefined}>{terminKalan < 0 ? `${-terminKalan} gün geçti` : terminKalan === 0 ? "Bugün" : `${terminKalan} gün kaldı`}</small> : null}
                  </span>
                ) : <span className="kd-kutu-ozet">Teslim tarihi girilmemiş.</span>}
                <span className="kd-kutu-alt">Başlangıç: {tarih(data.start_date) ?? "belirtilmedi"}</span>
                <span className="kd-kutu-ac">{locked ? "Görüntüle" : "Düzenle"} →</span>
              </>}
              title="İş termin tarihi"
              description="Sözleşmede yazan teslim tarihi. Değişiklik imza bağlantısındaki metne de yansır."
              kicker={`SÖZLEŞME · ${data.contract_no}`}
              boy="dar"
              basaridaKapan
            >
              {!locked ? (
                        <form className="panel-form kayit-formu" action={updateContract}>
                          <input type="hidden" name="contract_id" value={data.id} />
                          <input type="hidden" name="opportunity_id" value={customer?.id ?? ""} />
                          <input type="hidden" name="current_details" value={JSON.stringify(customer?.request_details ?? {})} />

                          {gizliAlanlar("termin")}
                          <label className="wide">Teslim tarihi<TarihSecici name="due_date" defaultValue={data.due_date ?? ""} /></label>
                          <div className="wide panel-form-actions kayit-formu-eylem">
                            <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                            <button className="panel-primary">Değişiklikleri kaydet</button>
                          </div>
                        </form>
              ) : (
                <dl className="talep-liste">
                  <div><dt>Teslim</dt><dd>{tarih(data.due_date) ?? <em>Belirtilmedi</em>}</dd></div>
                  <div><dt>Başlangıç</dt><dd>{tarih(data.start_date) ?? <em>Belirtilmedi</em>}</dd></div>
                </dl>
              )}
            </PanelModal>
          </div>

          <dl className="kd-olaylar">
            <div><dt>Müşteriye imzaya gönderildiği tarih</dt><dd>{data.sent_at ? uzunTarih(data.sent_at) : <em>Gönderilmedi</em>}</dd></div>
            <div><dt>İmzalayan</dt><dd>{data.signed_name ? <>{data.signed_name}{data.signed_at ? <small>{uzunTarih(data.signed_at)}</small> : null}</> : <em>Bekleniyor</em>}</dd></div>
            <div><dt>Sözleşme görüntüleme</dt><dd>{data.view_count ? <>{data.view_count} kez görüntülendi{data.last_viewed_at ? <small>Son {uzunTarih(data.last_viewed_at)}</small> : null}</> : <em>Açılmadı</em>}</dd></div>
          </dl>


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
      </div>
    </main>
  );
}
