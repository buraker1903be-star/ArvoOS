// Sözleşme işlemleri. Ortak yardımcılar: sales-shared.ts
"use server";

import { kapsamHatasi } from "@/lib/teklif-kapsami";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { diffFields, logActivity } from "@/lib/activity-log";
import { contractStatusLabel } from "./status-labels";
import {
  scheduleDateIssue,
} from "@/lib/payment-schedule";
import {
  amount,
  ensureRepresentative,
  getPanelContext,
  proposalErrorMessage,
  text,
  type CreateProposalState,
} from "./sales-shared";
import { rescaleSchedule, splitTax } from "@/lib/sales-amounts";
import { niyetiFormdanOku } from "@/lib/abonelik-niyeti";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { BASLIK_SINIRI, METIN_SINIRI, etkinSira, kurumMetniCoz, metniDenetle, type MaddeMetni } from "@/lib/belge-metni";
import { belgeVarsayilanlari } from "../settings/belge-metni-varsayilan";

// Talep sayfasından "Direkt Sözleşme Oluştur" ile çağrılır: fiyat/ödeme
// planı yine teklif kaydı olarak tutulur (iç kayıt, raporlama için), ama
// müşterinin online onaylamasını beklemeden aynı işlemde sözleşmeye
// dönüştürülür.
export async function createContractDirectly(
  _previousState: CreateProposalState,
  formData: FormData,
): Promise<CreateProposalState> {
  const opportunityId = text(formData, "opportunity_id", 80);
  const title = text(formData, "title", 180);
  const scope = text(formData, "scope");
  const proposalAmount = amount(formData, "amount");
  const taxStatus = text(formData, "tax_status", 20);
  const paymentPlanType = text(formData, "payment_plan_type", 20);
  const paymentPlan = text(formData, "payment_plan", 1000);
  const validUntil = text(formData, "valid_until", 20) || null;
  const estimatedDeliveryDate =
    text(formData, "estimated_delivery_date", 20) || null;

  let paymentSchedule: unknown = [];
  try {
    paymentSchedule = JSON.parse(
      text(formData, "payment_schedule", 10000) || "[]",
    );
  } catch {
    return { error: "Ödeme planı okunamadı. Ödeme planını yeniden oluşturun." };
  }

  /* Kapsam formdan olduğu gibi alınır; boşsa talebin iç notundan ya da
     konusundan doldurulmaz (OS-01, lib/teklif-kapsami.ts). Ayrı mesaj:
     genel "eksik" uyarısı kullanıcıya neyi yazacağını söylemiyordu. */
  const kapsamUyarisi = kapsamHatasi(scope, "Sözleşme");
  if (kapsamUyarisi) return { error: kapsamUyarisi };
  if (
    !opportunityId ||
    title.length < 2 ||
    !Number.isFinite(proposalAmount) ||
    proposalAmount < 0
  ) {
    return { error: "Sözleşme bilgileri eksik veya geçersiz." };
  }
  const scheduleIssue = scheduleDateIssue(paymentSchedule);
  if (scheduleIssue) return { error: scheduleIssue };

  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  if (!yetkiler.has("crm.sozlesme.yonet"))
    return { error: "Bu işlem için yetkiniz yok." };

  const representativeError = await ensureRepresentative(supabase, membership.organization_id, opportunityId, text(formData, "assigned_employee_id", 80));
  if (representativeError) return { error: representativeError };

  // createProposal ile aynı gerekçe: plan toplamı brüt tutara uydurulur.
  const directTotals = splitTax(proposalAmount, taxStatus);

  const { data, error } = await supabase.rpc("create_crm_proposal_v2", {
    target_opportunity_id: opportunityId,
    proposal_title: title,
    proposal_scope: scope,
    proposal_amount: proposalAmount,
    proposal_tax_status: taxStatus,
    proposal_payment_plan_type: paymentPlanType,
    proposal_payment_plan: paymentPlan || null,
    proposal_payment_schedule: rescaleSchedule(paymentSchedule, directTotals.gross, paymentPlanType),
    proposal_valid_until: validUntil,
    proposal_estimated_delivery_date: estimatedDeliveryDate,
  });

  if (error) {
    console.error("create_crm_proposal_v2 failed (direct contract)", {
      code: error.code,
      message: error.message,
      opportunityId,
      paymentPlanType,
      taxStatus,
    });
    return { error: proposalErrorMessage(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.access_token) {
    return { error: "Kayıt oluşturuldu ancak sözleşmeye dönüştürülemedi." };
  }

  const { data: acceptData, error: acceptError } = await supabase.rpc(
    "respond_to_crm_proposal",
    {
      public_token: row.access_token,
      decision: "accept",
    },
  );
  if (acceptError) {
    return { error: "Sözleşmeye dönüştürülemedi: " + acceptError.message };
  }
  const acceptRow = Array.isArray(acceptData) ? acceptData[0] : acceptData;
  if (acceptRow?.result_status !== "accepted") {
    return { error: "Sözleşmeye dönüştürülemedi, durumu kontrol edin." };
  }

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "create",
    entityType: "crm_contract",
    entityId: String(row?.contract_id ?? row?.id ?? ""),
    opportunityId,
    note: "Talepten doğrudan sözleşme oluşturuldu",
  });

  revalidatePath("/panel/crm");
  revalidatePath("/panel/crm/proposals");
  revalidatePath("/panel/crm/contracts");
  revalidatePath(`/panel/crm/requests/${opportunityId}`);
  // Teklifte olduğu gibi: dönüşümde üretilen sözleşme token'ı da
  // kalıcı saklanmalı, yoksa "İmzaya Gönder" yeni token üretip
  // müşteriye gönderilmiş linki geçersiz kılıyor.
  if (acceptRow?.contract_id && acceptRow?.contract_token) {
    await supabase
      .from("crm_contracts")
      .update({ share_token: acceptRow.contract_token })
      .eq("id", acceptRow.contract_id)
      .eq("organization_id", membership.organization_id)
      .is("share_token", null);
  }

  await flashSuccess("Sözleşme oluşturuldu");
  redirect(
    `/panel/crm/contracts${acceptRow?.contract_token ? `?share=${encodeURIComponent(acceptRow.contract_token)}` : ""}`,
  );
}


async function updateContract__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  const contractId = text(formData, "contract_id", 80);

  /*
    Abonelik niyeti: sözleşmenin hangi modülleri talep ettiği. Yalnızca
    ARVO'NUN KENDİ KURUMUNDA anlamlı — kiracının kendi müşterisiyle
    yaptığı sözleşme bizim aboneliğimizi açmaz ve o forma da bakmaz.
    Kapsamı burada da kontrol ediyoruz; ekran alanı gizlese bile işlem
    ekrandan bağımsız çağrılabilir.
  */
  const { data: kurum } = await supabase
    .from("organizations").select("kind").eq("id", membership.organization_id).maybeSingle();
  const arvoKurumu = kurum?.kind === "internal";
  const niyet = arvoKurumu && formData.has("niyet_var")
    ? niyetiFormdanOku((ad) => String(formData.get(ad) ?? ""))
    : null;
  const contractAmount = amount(formData, "amount");
  if (!Number.isFinite(contractAmount) || contractAmount < 0)
    throw new Error("Sözleşme tutarı geçersiz.");
  // RPC'nin içine giremediğimiz için değişikliği burada çıkarıyoruz.
  const { data: before } = await supabase
    .from("crm_contracts")
    .select("opportunity_id,title,scope,amount,currency,payment_plan,start_date,due_date,status,proposal_id,payment_plan_type,payment_schedule")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  /*
    Sözleşme düzenleme satış personelinde kalır, ama YALNIZCA kendisine
    atanmış sözleşmelerde. Kural veritabanında zaten var
    (private.arvo_can_access_opportunity: yönetici rolleri her şeye, diğerleri
    fırsata atanmış aktif personelse). Ama RLS'in engellediği güncelleme hata
    değil 0 SATIR döndürüyor: kontrol burada olmasaydı kullanıcı "kaydedildi"
    görüp değişikliğini kaybederdi.
  */
  if (before && !yetkiler.has("crm.sozlesme.yonet")) {
    const { data: assigned, error: assignedError } = await supabase
      .rpc("arvo_can_access_opportunity", { target_opportunity: before.opportunity_id });
    if (assignedError) throw new Error("Sözleşme yetkisi doğrulanamadı: " + assignedError.message);
    if (assigned !== true)
      throw new Error("Bu sözleşme size atanmadığı için düzenleyemezsiniz.");
  }

  const { error } = await supabase.rpc("update_crm_contract", {
    target_contract_id: contractId,
    contract_title: text(formData, "title", 180),
    contract_scope: text(formData, "scope"),
    contract_amount: contractAmount,
    contract_payment_plan: text(formData, "payment_plan", 500) || null,
    contract_start_date: text(formData, "start_date", 20) || null,
    contract_due_date: text(formData, "due_date", 20) || null,
  });
  if (error) throw new Error("Sözleşme güncellenemedi: " + error.message);

  /*
    Niyet RPC'nin dışında yazılıyor: update_crm_contract canlı bir
    fonksiyon ve imzasını değiştirmek onu çağıran her yeri etkiler.
    Ayrı bir UPDATE, kurum kısıtıyla birlikte daha küçük bir değişiklik.
  */
  if (niyet) {
    const { error: niyetHatasi } = await supabase
      .from("crm_contracts")
      .update({ subscription_intent: niyet })
      .eq("id", contractId)
      .eq("organization_id", membership.organization_id);
    if (niyetHatasi) throw new Error("Abonelik bilgileri kaydedilemedi: " + niyetHatasi.message);
  }

  const { data: after } = await supabase
    .from("crm_contracts")
    .select("opportunity_id,title,scope,amount,currency,payment_plan,start_date,due_date,status")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (before && after) {
    await logActivity(supabase, {
      organizationId: membership.organization_id,
      actorUserId: userId,
      action: "update",
      entityType: "crm_contract",
      entityId: contractId,
      opportunityId: String(after.opportunity_id ?? before.opportunity_id ?? ""),
      changes: diffFields(before, after, ["title","scope","amount","currency","payment_plan","start_date","due_date","status"]),
    });
  }

  // Tutar değiştiyse taksitler de yeni toplama göre ölçeklenmeli; aksi
  // halde imza linkindeki ödeme planı eski tutarlarla kalıyor. Sözleşmenin
  // kendi planı yoksa (eski kayıt) teklifteki plan esas alınır.
  let rescaledSchedule: unknown = null;
  if (before && Number(before.amount) !== contractAmount) {
    let baseSchedule: unknown = before.payment_schedule;
    if (!baseSchedule && before.proposal_id) {
      const { data: proposal } = await supabase
        .from("crm_proposals")
        .select("payment_schedule")
        .eq("id", before.proposal_id)
        .eq("organization_id", membership.organization_id)
        .maybeSingle();
      baseSchedule = proposal?.payment_schedule;
    }
    rescaledSchedule = rescaleSchedule(
      baseSchedule,
      contractAmount,
      before.payment_plan_type,
    );
  }

  // Kurumsal müşteri adres/vergi bilgisi — ayrı, basit bir güncelleme
  // olarak tutuluyor ki mevcut, kanıtlanmış RPC'ye dokunmayalım.
  const { error: partyInfoError } = await supabase
    .from("crm_contracts")
    .update({
      customer_address: text(formData, "customer_address", 500) || null,
      customer_tax_number: text(formData, "customer_tax_number", 40) || null,
      customer_tax_office: text(formData, "customer_tax_office", 120) || null,
      ...(rescaledSchedule ? { payment_schedule: rescaledSchedule } : {}),
    })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (partyInfoError)
    throw new Error(
      "Adres/vergi bilgisi kaydedilemedi: " + partyInfoError.message,
    );

  // Talep aşamasında girilen müşteri/hizmet bilgileri de aynı formdan
  // düzenlenebilsin diye bağlı fırsat (crm_opportunities) kaydı da
  // güncelleniyor — Talepler sayfasına geri dönmeye gerek kalmıyor.
  const opportunityId = text(formData, "opportunity_id", 80);
  if (opportunityId) {
    const currentDetails = JSON.parse(
      text(formData, "current_details", 10000) || "{}",
    );
    const requestDetails = {
      ...currentDetails,
      service_type: text(formData, "service_type", 180),
      academic_level: text(formData, "academic_level", 80),
      university: text(formData, "university", 180),
      department: text(formData, "department", 180),
    };
    const { error: opportunityError } = await supabase
      .from("crm_opportunities")
      .update({
        customer_name: text(formData, "customer_name", 180),
        contact_phone: text(formData, "contact_phone", 80) || null,
        contact_email: text(formData, "contact_email", 240) || null,
        request_details: requestDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId)
      .eq("organization_id", membership.organization_id);
    if (opportunityError)
      throw new Error(
        "Müşteri bilgileri güncellenemedi: " + opportunityError.message,
      );
  }

  // Dinamik detay sayfaları üst yolun tazelenmesiyle yenilenmiyor;
  // kaydeden kullanıcı kendi değişikliğini göremiyordu.
  revalidatePath("/panel/crm/contracts");
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  if (opportunityId) revalidatePath(`/panel/crm/requests/${opportunityId}`);
  revalidatePath("/panel/crm");
}


export type UpdateContractPlanState = {
  error: string | null;
  success: boolean;
};


// İmza öncesi sözleşmenin ödeme planı, müşteri talebiyle (örn. "3 taksit
// yapalım") teklife dokunmadan, doğrudan sözleşme üzerinde, aynı hesaplama
// mantığıyla revize edilebiliyor. İmzalı sözleşme veritabanında donmuş
// (arvo_freeze_signed_contract); vade değişikliği ek protokolle yapılır
// (contract-plan-actions.ts).
export async function updateContractPaymentPlan(
  _previousState: UpdateContractPlanState,
  formData: FormData,
): Promise<UpdateContractPlanState> {
  const { supabase, membership, userId } = await getPanelContext();
  const contractId = text(formData, "contract_id", 80);
  const planType = text(formData, "payment_plan_type", 20);
  const planText = text(formData, "payment_plan_text", 2000);
  if (!["cash", "half", "third", "custom"].includes(planType))
    return { error: "Geçersiz ödeme planı.", success: false };

  let schedule: unknown;
  try {
    schedule = JSON.parse(text(formData, "payment_schedule", 10000) || "[]");
  } catch {
    return { error: "Ödeme planı okunamadı.", success: false };
  }
  const scheduleIssue = scheduleDateIssue(schedule);
  if (scheduleIssue) return { error: scheduleIssue, success: false };

  const { data: current } = await supabase
    .from("crm_contracts")
    .select("status,amount")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!current)
    return { error: "Sözleşme bulunamadı veya bu sözleşmeye erişiminiz yok.", success: false };
  if (["signed", "completed"].includes(current.status))
    return { error: "Bu sözleşme imzalandı; ödeme planı değiştirilemez. Vade tarihlerini değiştirmek için Ek Protokol oluşturun.", success: false };

  // Taksit toplamı sözleşme tutarını tutmalı. Formdaki yüzde denetimi yalnızca
  // ekranı korur; bu işlem doğrudan çağrılabiliyor ve eskiden gelen plan olduğu
  // gibi yazılıyordu. Toplamı tutmayan plan imzada taksit olarak yazıldığı için
  // sözleşme hiç "ödendi" sayılmıyor (private.arvo_contract_payment_summary),
  // müşteri portalındaki kilitli dosyalar da hiç açılmıyordu.
  const reconciledSchedule = rescaleSchedule(schedule, Number(current.amount ?? 0), planType);

  const { error } = await supabase
    .from("crm_contracts")
    .update({
      payment_plan_type: planType,
      payment_plan: planText || null,
      payment_schedule: reconciledSchedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (error)
    return {
      error: "Ödeme planı kaydedilemedi: " + error.message,
      success: false,
    };

  const { data: planned } = await supabase
    .from("crm_contracts")
    .select("contract_no,opportunity_id")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "update",
    entityType: "crm_contract",
    entityId: contractId,
    opportunityId: String(planned?.opportunity_id ?? ""),
    changes: [{ field: "payment_plan", label: "Ödeme planı", from: "", to: "Güncellendi" }],
  });

  revalidatePath("/panel/crm/contracts");
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  return { error: null, success: true };
}


/*
  GÖNDERME DE YETENEK ANAHTARINA BAĞLI (15.10.2026).

  Kapı yalnızca RLS'teydi: sahip/yönetici/müdür her kaydı, fırsata
  atanmış satış personeli kendi kaydını gönderebiliyordu. Yetenek
  anahtarı hiçbir katmanda sorulmuyordu — ne sunucuda ne de düğmede.
  Sonuç tutarsızdı: aynı kullanıcı sözleşmeyi İMZAYA GÖNDEREBİLİYOR
  ama durumunu değiştiremiyordu (markContractStatus anahtarı istiyor).

  Ayarlar → Yetkilendirme ekranı da aksini söylüyordu: anahtarların
  açıklaması "Teklif oluşturur, revize eder, GÖNDERİR" ve "Sözleşme
  hazırlar, İMZAYA GÖNDERİR, ek düzenler". Kurum anahtarı bir rolden
  alınca gönderme durmuyordu, yani ayar sessizce etkisizdi.

  Anahtar rlsBagli DEĞİL: panelden kısıtlamak serbest.
*/
async function issueContractLink__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  if (!yetkiler.has("crm.sozlesme.yonet"))
    throw new Error("Sözleşmeyi imzaya gönderme yetkiniz yok. Ayarlar → Yetkilendirme'den \"Sözleşme yönetimi\" açılmalı.");
  const contractId = text(formData, "contract_id", 80);
  const { data, error } = await supabase.rpc("issue_crm_contract_link", {
    target_contract_id: contractId,
  });
  if (error)
    throw new Error("Sözleşme bağlantısı oluşturulamadı: " + error.message);
  /*
    İMZA SON TARİHİ VARSAYILANI (03.11.2026, 20261103142231): tarih yoksa
    bağlantıyla birlikte 30 gün sonrası yazılır; personel başlıktan
    değiştirir ya da kaldırır. Yazılamazsa (migration henüz yok) bağlantı
    yine çalışır, sözleşme süresiz kalır — yalnızca log'a düşer.
  */
  const otuzGunSonra = new Date(`${todayInIstanbul()}T00:00:00Z`);
  otuzGunSonra.setUTCDate(otuzGunSonra.getUTCDate() + 30);
  const { error: sonTarihHatasi } = await supabase
    .from("crm_contracts")
    .update({ imza_son_tarihi: otuzGunSonra.toISOString().slice(0, 10) })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .is("imza_son_tarihi", null);
  if (sonTarihHatasi) console.error("[sözleşme] imza son tarihi yazılamadı", contractId, sonTarihHatasi.message);
  revalidatePath("/panel/crm/contracts");
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  revalidatePath("/panel/crm");
  const { data: info } = await supabase
    .from("crm_contracts")
    .select(
      "contract_no,title,amount,currency,opportunity_id,crm_opportunities(customer_name,contact_email)",
    )
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  const docNo = info?.contract_no ?? "";
  const customer = info?.crm_opportunities as {
    customer_name?: string;
    contact_email?: string;
  } | null;
  const params = new URLSearchParams({
    share: String(data ?? ""),
    doc_no: docNo,
    customer_name: customer?.customer_name ?? "",
    customer_email: customer?.contact_email ?? "",
    title: info?.title ?? "",
    amount: String(info?.amount ?? ""),
    currency: info?.currency ?? "TRY",
  });
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "send",
    entityType: "crm_contract",
    entityId: contractId,
    opportunityId: String(info?.opportunity_id ?? ""),
    note: "Sözleşme imzaya gönderildi",
  });

  const backTo = text(formData, "redirect_to", 200);
  if (backTo.startsWith("/panel/crm/contracts/")) {
    redirect(`${backTo}?${params.toString()}`);
  }
  redirect(`/panel/crm/contracts?${params.toString()}`);
}


// Sözleşmeler tablosundan hızlıca "Reddedildi" veya "İptal" olarak
// işaretlemek için — imzalanmış veya zaten kesinleşmiş sözleşmelerde
// kullanılamaz (bu ikisinin gerçek finans/operasyon etkisi var, tek
// tıkla değiştirilmemeli).
async function markContractStatus__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  if (!yetkiler.has("crm.sozlesme.yonet"))
    throw new Error("Bu işlem için yetkiniz yok.");
  const contractId = text(formData, "contract_id", 80);
  const status = text(formData, "status", 20);
  if (!contractId) throw new Error("Sözleşme seçilmedi.");
  if (!["rejected", "cancelled"].includes(status))
    throw new Error("Geçersiz durum.");

  const { data: current } = await supabase
    .from("crm_contracts")
    .select("status")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (
    current &&
    ["signed", "completed", "rejected", "cancelled"].includes(current.status)
  ) {
    throw new Error("Bu sözleşme zaten kesinleşmiş, durumu değiştirilemez.");
  }

  const { error } = await supabase
    .from("crm_contracts")
    .update({ status })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id);
  if (error)
    throw new Error("Sözleşme durumu güncellenemedi: " + error.message);
  const { data: mc } = await supabase
    .from("crm_contracts").select("opportunity_id")
    .eq("id", contractId).eq("organization_id", membership.organization_id).maybeSingle();
  await logActivity(supabase, {
    organizationId: membership.organization_id, actorUserId: userId,
    action: "status", entityType: "crm_contract", entityId: contractId,
    opportunityId: String(mc?.opportunity_id ?? ""),
    changes: [{ field: "status", label: "Durum",
      from: contractStatusLabel(current?.status),
      to: contractStatusLabel(status) }],
  });

  revalidatePath("/panel/crm/contracts");
  revalidatePath(`/panel/crm/contracts/${contractId}`);
  revalidatePath("/panel/crm");
}


// Sözleşmeyi kalıcı olarak siler. Bağlı bir iş akışı (operasyon) veya
// ödeme planı varsa, gerçek finans/operasyon verisi kaybolmasın diye
// silinemez.
async function deleteContract__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  if (!yetkiler.has("crm.sozlesme.sil"))
    throw new Error("Bu işlem için yetkiniz yok.");
  const contractId = text(formData, "contract_id", 80);
  if (!contractId) throw new Error("Sözleşme seçilmedi.");

  /*
    maybeSingle() birden fazla satırda hata döner ve data null olur; bu
    da kontrolü atlatırdı. limit(1) ile yalnızca varlığa bakıyoruz.

    HATALAR DA OKUNUYOR: sorgu düştüğünde data undefined kalıyor ve
    koşul yanlış çıkıyordu, yani kontrol AÇIK GEÇİYOR ve bağlı işi
    olan sözleşme siliniyordu — iş, prim ve tahsilat kayıtları
    sözleşmeye dayandığı için öksüz kalırdı. Bir engelin okunamaması
    "engel yok" demek değil.
  */
  const bagli = (tablo: string) => supabase
    .from(tablo)
    .select("id")
    .eq("contract_id", contractId)
    .eq("organization_id", membership.organization_id)
    .limit(1);

  /*
    Engel, kaskat YÜZEYİ kadar geniş olmalı. Sözleşme silinince
    veritabanı maliyet kalemlerini ve ek sözleşmeleri de siliyor
    (ON DELETE CASCADE); engel yalnızca işe ve ödeme planına baktığı
    için bunlar sessizce gidiyordu. İkisi de panelden tek tek
    silinebiliyor, yani kullanıcıya yapılacak bir iş söylenebiliyor.
  */
  const [
    { data: linkedWorkflow, error: workflowError },
    { data: linkedPlan, error: planError },
    { data: linkedCost, error: costError },
    { data: linkedAddendum, error: addendumError },
    { data: linkedMessage, error: messageError },
  ] = await Promise.all([
    bagli("operation_workflows"),
    bagli("payment_plans"),
    bagli("contract_cost_items"),
    bagli("crm_contract_addenda"),
    bagli("customer_file_messages"),
  ]);
  if (workflowError)
    throw new Error("Sözleşmeye bağlı iş olup olmadığı okunamadı: " + workflowError.message);
  if (planError)
    throw new Error("Sözleşmeye bağlı ödeme planı olup olmadığı okunamadı: " + planError.message);
  if (costError)
    throw new Error("Sözleşmeye bağlı maliyet kalemi olup olmadığı okunamadı: " + costError.message);
  if (addendumError)
    throw new Error("Sözleşmeye bağlı ek sözleşme olup olmadığı okunamadı: " + addendumError.message);
  if (messageError)
    throw new Error("Sözleşmeye bağlı müşteri yazışması olup olmadığı okunamadı: " + messageError.message);
  if (linkedWorkflow?.length)
    throw new Error(
      "Bu sözleşmeye bağlı bir operasyon işi var; iş, prim ve tahsilat kayıtları sözleşmeye dayandığı için sözleşme silinemez.",
    );
  if (linkedPlan?.length)
    throw new Error(
      "Bu sözleşmeye bağlı bir ödeme planı var, önce onu silin veya bu sözleşmeyi silmeyin.",
    );
  if (linkedCost?.length)
    throw new Error(
      "Bu sözleşmeye girilmiş maliyet kalemleri var; sözleşme silinirse onlar da silinir. Önce Finans → İş maliyetleri'nden kalemleri kaldırın.",
    );
  if (linkedAddendum?.length)
    throw new Error(
      "Bu sözleşmenin ek sözleşmesi var; sözleşme silinirse ek de silinir. Önce eki kaldırın.",
    );
  /*
    Müşteri yazışması olan sözleşme SİLİNEMEZ (kurum sahibinin kararı,
    10.10.2026). Veritabanı mesajları sözleşmeyle birlikte siliyor
    (ON DELETE CASCADE) ve panelde mesaj silme yok — yani burada
    "önce şunu kaldırın" denebilecek bir iş de yok. Yazışma kurumun
    müşteriyle arasındaki kayıt; bir sözleşme kaydından daha kalıcı.
    Yanlış açılmış sözleşme silinmek yerine İPTAL ediliyor.
  */
  if (linkedMessage?.length)
    throw new Error(
      "Bu sözleşmede müşteri yazışması var ve yazışma silinmemeli. Sözleşmeyi silmek yerine \"İptal\" durumuna alın.",
    );

  const { data: doomedContract } = await supabase
    .from("crm_contracts")
    .select("contract_no,title,opportunity_id")
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  // RLS izin vermezse delete hata döndürmez, sadece 0 satır siler.
  // Silinen satırı geri isteyip gerçekten silindiğini doğruluyoruz.
  const { data: deletedContract, error: deleteError } = await supabase
    .from("crm_contracts")
    .delete()
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .select("id");
  if (deleteError) throw new Error("Sözleşme silinemedi: " + deleteError.message);
  if (!deletedContract?.length)
    throw new Error("Sözleşme silinemedi: kayıt bulunamadı veya silme yetkiniz yok.");

  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "delete",
    entityType: "crm_contract",
    entityId: contractId,
    opportunityId: String(doomedContract?.opportunity_id ?? ""),
    note: doomedContract
      ? `${doomedContract.contract_no} · ${doomedContract.title} silindi`
      : "Sözleşme silindi",
  });
  revalidatePath("/panel/crm/contracts");
  revalidatePath("/panel/crm");
  // Detay sayfasında kalırsak silinen kayıt yeniden okunur ve 404 döner.
  redirect("/panel/crm/contracts");
}


/*
  İMZA SON TARİHİ (03.11.2026). Yalnızca imzaya açık (taslak / gönderilmiş)
  sözleşmede; boş bırakılırsa süresiz. Geçmiş gün yazılamaz: yazılsaydı
  sözleşme o anda imzaya kapanırdı ve personel bunu fark etmezdi.
*/
async function setContractSignDeadline__impl(formData: FormData) {
  const { supabase, membership, userId, yetkiler } = await getPanelContext();
  if (!yetkiler.has("crm.sozlesme.yonet"))
    throw new Error("İmza son tarihini değiştirme yetkiniz yok. Ayarlar → Yetkilendirme'den \"Sözleşme yönetimi\" açılmalı.");
  const contractId = text(formData, "contract_id", 80);
  const tarih = text(formData, "imza_son_tarihi", 20) || null;
  if (tarih && !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) throw new Error("Geçerli bir tarih seçin.");
  if (tarih && tarih < todayInIstanbul()) throw new Error("İmza son tarihi bugünden önce olamaz.");
  const { data, error } = await supabase
    .from("crm_contracts")
    .update({ imza_son_tarihi: tarih })
    .eq("id", contractId)
    .eq("organization_id", membership.organization_id)
    .in("status", ["draft", "sent"])
    .select("id,opportunity_id");
  if (error) throw new Error("İmza son tarihi kaydedilemedi: " + error.message);
  /* Satır dönmediyse RLS ya da durum süzgeci eledi: "kaydedildi" demek yanlış olurdu. */
  if (!data?.length) throw new Error("İmzalanmış ya da kapanmış sözleşmenin imza son tarihi değiştirilemez.");
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "update",
    entityType: "crm_contract",
    entityId: contractId,
    opportunityId: String(data[0].opportunity_id ?? ""),
    note: tarih ? `İmza son tarihi ${tarih.split("-").reverse().join(".")}` : "İmza son tarihi kaldırıldı",
  });
  revalidatePath(`/panel/crm/contracts/${contractId}`);
}

/*
  SÖZLEŞMEYE ÖZEL MADDE METNİ (03.11.2026, 20261103144006). Kurumun
  metni (Ayarlar → Belge metinleri) bütün sözleşmeler için; bu yalnızca
  bu sözleşmenin maddesini değiştirir. Sıra ve madde kümesi kurumun:
  burada madde eklenmez, çıkarılmaz. Kaydedilen metin kurumun o maddedeki
  metniyle aynıysa kayıt silinir — "değiştirildi" görünüp kurumun sonraki
  güncellemesini bu sözleşmeye geçirmeyen bir kopya kalmasın.
*/
async function ozelMaddeBaglami(formData: FormData) {
  const { supabase, membership, organization, userId, yetkiler } = await getPanelContext();
  if (!yetkiler.has("crm.sozlesme.yonet"))
    throw new Error("Sözleşme maddelerini değiştirme yetkiniz yok. Ayarlar → Yetkilendirme'den \"Sözleşme yönetimi\" açılmalı.");
  const contractId = text(formData, "contract_id", 80);
  const anahtar = text(formData, "anahtar", 80);
  const [{ data: sozlesme, error }, { data: kurumKaydi, error: kurumHatasi }] = await Promise.all([
    supabase.from("crm_contracts").select("id,status,opportunity_id,ozel_maddeler").eq("id", contractId).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("organization_document_texts").select("content").eq("organization_id", membership.organization_id).eq("document_type", "contract").maybeSingle(),
  ]);
  // Okunamayan kayıt "boş" sayılmaz: üzerine yazmak öteki özel maddeleri silerdi.
  if (error) throw new Error("Sözleşme okunamadı: " + error.message);
  if (kurumHatasi) throw new Error("Kurumun sözleşme metni okunamadı: " + kurumHatasi.message);
  if (!sozlesme) throw new Error("Sözleşme bulunamadı.");
  if (!["draft", "sent"].includes(String(sozlesme.status))) throw new Error("İmzalanmış ya da kapanmış sözleşmenin maddeleri değiştirilemez.");
  const varsayilan = belgeVarsayilanlari("contract", organization.slug);
  const kurum = kurumMetniCoz(kurumKaydi?.content);
  const sira = etkinSira(varsayilan.sira, kurum, varsayilan.zorunlu, varsayilan.son);
  if (!sira.includes(anahtar)) throw new Error("Madde bulunamadı.");
  const kurumunMaddesi = kurum.maddeler?.[anahtar] ?? varsayilan.maddeler.find((m) => m.anahtar === anahtar) ?? null;
  const ozel = { ...((sozlesme.ozel_maddeler ?? {}) as Record<string, MaddeMetni>) };
  return { supabase, membership, userId, sozlesme, anahtar, varsayilan, sira, kurumunMaddesi, ozel };
}

async function ozelMaddeleriYaz(b: Awaited<ReturnType<typeof ozelMaddeBaglami>>, ozel: Record<string, MaddeMetni>, not: string) {
  const { data, error } = await b.supabase
    .from("crm_contracts")
    .update({ ozel_maddeler: Object.keys(ozel).length ? ozel : null })
    .eq("id", b.sozlesme.id)
    .eq("organization_id", b.membership.organization_id)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error) throw new Error("Madde kaydedilemedi: " + error.message);
  if (!data?.length) throw new Error("İmzalanmış ya da kapanmış sözleşmenin maddeleri değiştirilemez.");
  await logActivity(b.supabase, {
    organizationId: b.membership.organization_id,
    actorUserId: b.userId,
    action: "update",
    entityType: "crm_contract",
    entityId: b.sozlesme.id,
    opportunityId: String(b.sozlesme.opportunity_id ?? ""),
    note: not,
  });
  revalidatePath(`/panel/crm/contracts/${b.sozlesme.id}`);
}

async function sozlesmeMaddesiKaydet__impl(formData: FormData) {
  const b = await ozelMaddeBaglami(formData);
  const baslik = text(formData, "baslik", BASLIK_SINIRI + 1).trim();
  const metin = String(formData.get("metin") ?? "").slice(0, METIN_SINIRI + 1);
  const hatalar = metniDenetle(baslik, metin, { yerTutucular: b.varsayilan.yerTutucular, bloklar: b.varsayilan.bloklar, maddeler: b.sira });
  if (hatalar.length) throw new Error(hatalar.join(" "));
  const ozel = { ...b.ozel };
  const kurumunki = b.kurumunMaddesi;
  if (kurumunki && kurumunki.baslik === baslik && kurumunki.metin.replace(/\r\n/g, "\n") === metin.replace(/\r\n/g, "\n")) delete ozel[b.anahtar];
  else ozel[b.anahtar] = { baslik, metin };
  await ozelMaddeleriYaz(b, ozel, `Sözleşmeye özel madde: ${baslik}`);
}

async function sozlesmeMaddesiSifirla__impl(formData: FormData) {
  const b = await ozelMaddeBaglami(formData);
  const ozel = { ...b.ozel };
  delete ozel[b.anahtar];
  await ozelMaddeleriYaz(b, ozel, `Madde kurum metnine döndü: ${b.kurumunMaddesi?.baslik ?? b.anahtar}`);
}

export async function sozlesmeMaddesiKaydet(...args: Parameters<typeof sozlesmeMaddesiKaydet__impl>) {
  return runPanelAction(() => sozlesmeMaddesiKaydet__impl(...args), "Madde bu sözleşme için kaydedildi");
}
export async function sozlesmeMaddesiSifirla(...args: Parameters<typeof sozlesmeMaddesiSifirla__impl>) {
  return runPanelAction(() => sozlesmeMaddesiSifirla__impl(...args), "Madde kurum metnine döndü");
}
export async function setContractSignDeadline(...args: Parameters<typeof setContractSignDeadline__impl>) {
  return runPanelAction(() => setContractSignDeadline__impl(...args), "İmza son tarihi kaydedildi");
}
export async function updateContract(...args: Parameters<typeof updateContract__impl>) {
  return runPanelAction(() => updateContract__impl(...args), "Sözleşme güncellendi");
}
export async function issueContractLink(...args: Parameters<typeof issueContractLink__impl>) {
  return runPanelAction(() => issueContractLink__impl(...args));
}
export async function markContractStatus(...args: Parameters<typeof markContractStatus__impl>) {
  return runPanelAction(() => markContractStatus__impl(...args));
}
export async function deleteContract(...args: Parameters<typeof deleteContract__impl>) {
  return runPanelAction(() => deleteContract__impl(...args));
}
