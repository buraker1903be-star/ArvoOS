"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { runPanelAction } from "@/lib/panel-action";
import {
  BRIEF_EN_COK,
  VARSAYILAN_BRIEF_ALANLARI,
  brifingDogrula,
  brifingFormSorunu,
  briefTipiMi,
  gecerliAlanlar,
  type BriefField,
} from "@/lib/is-brifingi";
import { kodTuret } from "@/lib/is-adimlari";

/*
  İŞ BRİFİNGİ.

  Satışçının bildiği şeyler ("konu belli mi", "müşterinin elinde taslak
  var mı", "veri ne zaman gelecek") iş açılırken hiçbir yere yazılmıyordu;
  fırsatın serbest metin `notes` alanı aranamıyor ve eksik bırakıldığı
  görülmüyordu.

  Sorular KURUMUN (organization_brief_fields): ArvoOS çok kiracılı bir
  ürün ve sektöre özel alanları şemaya gömmek paneli tek bir sektörün
  yazılımına çevirirdi.

  Brifing fırsatta doldurulur, iş açılırken işe kopyalanır
  (private.arvo_brief_kopyala). Kopya bilerek: fırsattaki metin satışçının
  o gün söylediğidir, operasyonun kopyası süreç ilerledikçe düzeltilebilir.
*/

const YONETICI = ["owner", "admin"];

const tazele = () => {
  revalidatePath("/panel/operations", "layout");
  revalidatePath("/panel/crm", "layout");
};

/** Form TANIMI: yalnızca kurum sahibi ve yöneticiler, operasyon modülünden. */
async function formContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "operations", context.hiddenModuleKeys);
  if (!YONETICI.includes(context.membership.role)) throw new Error("Brifing formunu yalnızca kurum sahibi ve yöneticiler değiştirebilir.");
  return context;
}

const satirlariOku = (formData: FormData): BriefField[] => {
  const al = (ad: string) => formData.getAll(ad).map((value) => String(value).trim());
  const etiketler = al("label");
  const kodlar = al("code");
  const tipler = al("field_type");
  const secenekler = al("options");
  const ipuclari = al("hint");
  const zorunlular = al("is_required");
  const turler = al("set_codes");

  const kullanilan = new Set<string>();
  return etiketler
    .map((label, index) => ({
      label,
      kod: kodlar[index] ?? "",
      tip: tipler[index] ?? "text",
      secenek: secenekler[index] ?? "",
      ipucu: ipuclari[index] ?? "",
      zorunlu: zorunlular[index] ?? "",
      turler: turler[index] ?? "",
    }))
    // Boş başlık silme demektir: kullanıcı başlığı temizleyip kaydedince soru gider.
    .filter((satir) => satir.label.length > 0)
    .map((satir, index) => {
      /*
        Kod satırın KİMLİĞİ (birincil anahtarın parçası) ve doldurulmuş
        brifinglerdeki jsonb anahtarı. Başlık değişince kod değişseydi
        o soruya verilmiş bütün yanıtlar sahipsiz kalırdı.
      */
      const code = satir.kod || kodTuret(satir.label, kullanilan);
      kullanilan.add(code);
      const tip = briefTipiMi(satir.tip) ? satir.tip : "text";
      const options =
        tip === "select" || tip === "multi_select"
          ? satir.secenek.split("\n").map((s) => s.trim()).filter(Boolean)
          : null;
      const setCodes = satir.turler.split(",").map((s) => s.trim()).filter(Boolean);
      return {
        code,
        label: satir.label,
        field_type: tip,
        options,
        hint: satir.ipucu || null,
        is_required: satir.zorunlu === "1",
        set_codes: setCodes.length ? setCodes : null,
        sort_order: (index + 1) * 10,
        is_active: true,
      } satisfies BriefField;
    });
};

async function saveBriefFields__impl(formData: FormData) {
  const { supabase, membership } = await formContext();
  const satirlar = satirlariOku(formData);
  if (satirlar.length > BRIEF_EN_COK) throw new Error(`Brifing formuna en fazla ${BRIEF_EN_COK} soru eklenebilir.`);
  const sorun = brifingFormSorunu(satirlar);
  if (sorun) throw new Error(sorun);

  const { data: mevcut, error: okumaHatasi } = await supabase
    .from("organization_brief_fields").select("code").eq("organization_id", membership.organization_id);
  if (okumaHatasi) throw new Error("Brifing formu okunamadı: " + okumaHatasi.message);

  if (satirlar.length) {
    const { error } = await supabase.from("organization_brief_fields").upsert(
      satirlar.map((satir) => ({ ...satir, organization_id: membership.organization_id, updated_at: new Date().toISOString() })),
      { onConflict: "organization_id,code" },
    );
    if (error) throw new Error("Brifing formu kaydedilemedi: " + error.message);
  }

  const kalanlar = new Set(satirlar.map((satir) => satir.code));
  const silinecek = (mevcut ?? []).map((satir) => satir.code as string).filter((code) => !kalanlar.has(code));
  if (silinecek.length) {
    const { error } = await supabase
      .from("organization_brief_fields").delete()
      .eq("organization_id", membership.organization_id).in("code", silinecek);
    if (error) throw new Error("Kaldırılan sorular silinemedi: " + error.message);
  }
  tazele();
}

/** Ön ayarı kopyalar; kurum oradan düzenler. */
async function copyDefaultBriefFields__impl() {
  const { supabase, membership } = await formContext();
  const { count, error: sayimHatasi } = await supabase
    .from("organization_brief_fields").select("code", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id);
  if (sayimHatasi) throw new Error("Brifing formu okunamadı: " + sayimHatasi.message);
  // Dolu formun üzerine yazmak kurumun kendi sorularını sessizce silerdi.
  if ((count ?? 0) > 0) throw new Error("Formunuz zaten tanımlı. Ön ayarı almak için önce mevcut soruları kaldırın.");

  const { error } = await supabase.from("organization_brief_fields").insert(
    VARSAYILAN_BRIEF_ALANLARI.map((alan, index) => ({
      ...alan,
      organization_id: membership.organization_id,
      sort_order: (index + 1) * 10,
      is_active: true,
    })),
  );
  if (error) throw new Error("Ön ayar kopyalanamadı: " + error.message);
  tazele();
}

/* ---------- Brifingin doldurulması ---------- */

async function alanlariOku(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  setKodu: string | null,
) {
  const { data, error } = await supabase
    .from("organization_brief_fields")
    .select("code,label,field_type,options,hint,is_required,set_codes,sort_order,is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error("Brifing formu okunamadı: " + error.message);
  return gecerliAlanlar((data ?? []) as BriefField[], setKodu);
}

/** Formdaki alan kodlarını ham değerlere çevirir (çok seçimli alanlar dizi). */
const girdiyeCevir = (formData: FormData, alanlar: BriefField[]) =>
  Object.fromEntries(
    alanlar.map((alan) => [
      alan.code,
      alan.field_type === "multi_select"
        ? formData.getAll(`alan_${alan.code}`).map((v) => String(v))
        : String(formData.get(`alan_${alan.code}`) ?? ""),
    ]),
  );

/** Satışçı fırsatta dolduruyor. CRM modülüne erişimi olan her üye yazabilir. */
async function saveOpportunityBrief__impl(formData: FormData) {
  const { supabase, membership, userId, modules, hiddenModuleKeys } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  assertModuleKeyAccess(membership.role, "crm", hiddenModuleKeys);
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  if (!opportunityId) throw new Error("Fırsat bulunamadı.");

  /*
    Fırsatın kuruma ait olduğu burada doğrulanıyor. RLS zaten yazmayı
    durdurur ama hata "new row violates row-level security" olurdu;
    kullanıcı ne olduğunu anlamalı.
  */
  const { data: firsat } = await supabase.from("crm_opportunities").select("id")
    .eq("id", opportunityId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!firsat) throw new Error("Fırsat bulunamadı.");

  const alanlar = await alanlariOku(supabase, membership.organization_id, null);
  if (!alanlar.length) throw new Error("Kurumunuzun brifing formu tanımlı değil.");
  const { values, hata } = brifingDogrula(alanlar, girdiyeCevir(formData, alanlar));
  if (hata) throw new Error(hata);

  const { error } = await supabase.from("crm_opportunity_briefs").upsert(
    { organization_id: membership.organization_id, opportunity_id: opportunityId, values, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "opportunity_id" },
  );
  if (error) throw new Error("Brifing kaydedilemedi: " + error.message);
  tazele();
}

/** Operasyonun kopyası: süreç ilerledikçe düzeltilebilir. */
async function saveWorkflowBrief__impl(formData: FormData) {
  const { supabase, membership, userId, modules, hiddenModuleKeys } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(membership.role, "operations", hiddenModuleKeys);
  const workflowId = String(formData.get("workflow_id") ?? "");
  if (!workflowId) throw new Error("İş bulunamadı.");

  const { data: is } = await supabase.from("operation_workflows").select("id,step_template_set")
    .eq("id", workflowId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!is) throw new Error("İş bulunamadı.");

  const alanlar = await alanlariOku(supabase, membership.organization_id, (is as { step_template_set: string | null }).step_template_set);
  if (!alanlar.length) throw new Error("Kurumunuzun brifing formu tanımlı değil.");
  const { values, hata } = brifingDogrula(alanlar, girdiyeCevir(formData, alanlar));
  if (hata) throw new Error(hata);

  const { error } = await supabase.from("operation_workflow_briefs").upsert(
    { organization_id: membership.organization_id, workflow_id: workflowId, values, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "workflow_id" },
  );
  if (error) throw new Error("Brifing kaydedilemedi: " + error.message);
  tazele();
}

export async function saveBriefFields(...args: Parameters<typeof saveBriefFields__impl>) {
  return runPanelAction(() => saveBriefFields__impl(...args), "Brifing formu kaydedildi");
}
export async function copyDefaultBriefFields() {
  return runPanelAction(() => copyDefaultBriefFields__impl(), "Ön ayar kopyalandı");
}
export async function saveOpportunityBrief(...args: Parameters<typeof saveOpportunityBrief__impl>) {
  return runPanelAction(() => saveOpportunityBrief__impl(...args), "Brifing kaydedildi");
}
export async function saveWorkflowBrief(...args: Parameters<typeof saveWorkflowBrief__impl>) {
  return runPanelAction(() => saveWorkflowBrief__impl(...args), "Brifing güncellendi");
}
