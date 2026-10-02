"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { runPanelAction } from "@/lib/panel-action";
import { SABLON_EN_COK, SET_EN_COK, VARSAYILAN_ADIMLAR, kodTuret, sablonSorunu, setAdiSorunu } from "@/lib/is-adimlari";
import { assertYetki } from "@/lib/yetkiler";

/*
  Kurumun iş adımı şablonu.

  Bugüne kadar adım listesi bir SQL fonksiyonunun gövdesinde sabit
  yazılıydı; AkademikMerkez'in akademik adımları ("İç Kontrol Yapılıyor",
  "Evrak Teslimine Hazır") başka bir kiracıya da miras kalıyordu. Artık
  kurum kendi listesini tanımlıyor ve yeni açılan işler onu kullanıyor
  (add_standard_operation_steps).

  Şablon yalnızca YENİ işi etkiler; açık işlerin adımlarına dokunulmaz.
  Aksi hâlde yarısı bitmiş bir tezin adımları altından değişirdi.

  Liste ÇALIŞMA TÜRÜNE göre ayrı (organization_step_template_sets): tez,
  makale ve ödev aynı yirmi maddeyle yürümüyor. Her işlem bir set üstünde
  çalışıyor; set kodu formdan geliyor ve kurumun kendi setlerinden biri
  olmak zorunda — başka kurumun setine yazmayı RLS zaten durdurur, ama
  kurum içinde de uydurma bir kod yeni bir set açardı (tetikleyici eksik
  seti üretiyor).
*/


async function sablonContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "operations", context.hiddenModuleKeys);
  assertYetki(context.yetkiler, "operations.sablon.yonet");
  return context;
}

const tazele = () => {
  revalidatePath("/panel/operations", "layout");
};

/** Formdaki set kodunun kuruma ait gerçek bir tür olduğunu doğrular. */
async function setCoz(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  formData: FormData,
) {
  const kod = String(formData.get("set_code") ?? "").trim();
  if (!kod) throw new Error("Çalışma türü seçilmedi.");
  const { data, error } = await supabase
    .from("organization_step_template_sets")
    .select("code,name,is_default")
    .eq("organization_id", organizationId)
    .eq("code", kod)
    .maybeSingle();
  if (error) throw new Error("Çalışma türü okunamadı: " + error.message);
  if (!data) throw new Error("Çalışma türü bulunamadı. Sayfayı yenileyip tekrar deneyin.");
  return data as { code: string; name: string; is_default: boolean };
}

/** Formdaki satırları (ad + gün) tek seferde kaydeder: eksikler silinir. */
async function saveStepTemplate__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const set = await setCoz(supabase, membership.organization_id, formData);

  const basliklar = formData.getAll("title").map((value) => String(value).trim());
  const gunler = formData.getAll("day_offset").map((value) => String(value).trim());
  const kodlar = formData.getAll("code").map((value) => String(value).trim());
  const asamalar = formData.getAll("phase_title").map((value) => String(value).trim());

  const kullanilan = new Set<string>();
  const satirlar = basliklar
    .map((title, index) => ({ title, gun: gunler[index] ?? "", kod: kodlar[index] ?? "", asama: asamalar[index] ?? "" }))
    // Boş satır silme demektir: kullanıcı adı temizleyip kaydedince adım gider.
    .filter((satir) => satir.title.length > 0)
    .map((satir, index) => {
      /*
        Kod satırın KİMLİĞİ (birincil anahtarın parçası). Var olan satırda
        korunuyor; yeni satırda başlıktan türetiliyor. Başlık değişince kod
        değişseydi her düzenleme sil-ekle olurdu ve satırın geçmişi kopardı.
      */
      const kod = satir.kod || kodTuret(satir.title, kullanilan);
      kullanilan.add(kod);
      const gun = satir.gun === "" ? null : Number(satir.gun);
      return {
        code: kod,
        set_code: set.code,
        title: satir.title,
        sort_order: (index + 1) * 10,
        day_offset: gun,
        is_active: true,
        phase_title: satir.asama || null,
      };
    });

  if (satirlar.length > SABLON_EN_COK) throw new Error(`Şablona en fazla ${SABLON_EN_COK} adım eklenebilir.`);
  const sorun = sablonSorunu(satirlar);
  if (sorun) throw new Error(sorun);

  const { data: mevcut, error: okumaHatasi } = await supabase
    .from("organization_step_templates").select("code")
    .eq("organization_id", membership.organization_id).eq("set_code", set.code);
  if (okumaHatasi) throw new Error("Şablon okunamadı: " + okumaHatasi.message);

  if (satirlar.length) {
    const { error } = await supabase
      .from("organization_step_templates")
      .upsert(satirlar.map((satir) => ({ ...satir, organization_id: membership.organization_id, updated_at: new Date().toISOString() })),
              { onConflict: "organization_id,set_code,code" });
    if (error) throw new Error("Şablon kaydedilemedi: " + error.message);
  }

  // Formda kalmayan satırlar silinir; "boş bırakınca gitsin" beklentisi bu.
  const kalanlar = new Set(satirlar.map((satir) => satir.code));
  const silinecek = (mevcut ?? []).map((satir) => satir.code as string).filter((code) => !kalanlar.has(code));
  if (silinecek.length) {
    const { error } = await supabase
      .from("organization_step_templates").delete()
      .eq("organization_id", membership.organization_id).eq("set_code", set.code).in("code", silinecek);
    if (error) throw new Error("Kaldırılan adımlar silinemedi: " + error.message);
  }

  tazele();
}

/** Bugünkü sekiz varsayılan adımı şablona kopyalar; kurum oradan düzenler. */
async function copyDefaultStepTemplate__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const set = await setCoz(supabase, membership.organization_id, formData);
  const { count, error: sayimHatasi } = await supabase
    .from("organization_step_templates")
    .select("code", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id)
    .eq("set_code", set.code);
  if (sayimHatasi) throw new Error("Şablon okunamadı: " + sayimHatasi.message);
  // Dolu şablonun üzerine yazmak, kurumun kendi listesini sessizce silerdi.
  if ((count ?? 0) > 0) throw new Error("Bu çalışma türünün listesi zaten dolu. Varsayılanı almak için önce mevcut görevleri kaldırın.");

  const { error } = await supabase.from("organization_step_templates").insert(
    VARSAYILAN_ADIMLAR.map((adim, index) => ({
      organization_id: membership.organization_id,
      set_code: set.code,
      code: adim.code,
      title: adim.title,
      sort_order: (index + 1) * 10,
      day_offset: null,
      is_active: true,
      phase_title: null,
    })),
  );
  if (error) throw new Error("Varsayılan şablon kopyalanamadı: " + error.message);
  tazele();
}

/** Şablonu tamamen kaldırır: işler yeniden varsayılan sekiz adımla açılır. */
async function clearStepTemplate__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const set = await setCoz(supabase, membership.organization_id, formData);
  const { error } = await supabase
    .from("organization_step_templates").delete()
    .eq("organization_id", membership.organization_id).eq("set_code", set.code);
  if (error) throw new Error("Şablon kaldırılamadı: " + error.message);
  tazele();
}

export async function saveStepTemplate(...args: Parameters<typeof saveStepTemplate__impl>) {
  return runPanelAction(() => saveStepTemplate__impl(...args), "Adım şablonu kaydedildi");
}
export async function copyDefaultStepTemplate(...args: Parameters<typeof copyDefaultStepTemplate__impl>) {
  return runPanelAction(() => copyDefaultStepTemplate__impl(...args), "Varsayılan görevler listeye kopyalandı");
}
export async function clearStepTemplate(...args: Parameters<typeof clearStepTemplate__impl>) {
  return runPanelAction(() => clearStepTemplate__impl(...args), "Listedeki görevler kaldırıldı");
}

/*
  ÇALIŞMA TÜRLERİ.

  Tür bir listeye isim verir ("Tez", "Makale"); iş açılırken seçilir ve
  adımlar o türün listesinden gelir. Kodu addan türetiliyor çünkü kod
  satırın kimliği: adı değiştirince kod değişseydi türün bütün görevleri
  (ve ona bağlı işlerin step_template_set alanı) kopardı.
*/
async function createTemplateSet__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const ad = String(formData.get("name") ?? "").trim();
  const sorun = setAdiSorunu(ad);
  if (sorun) throw new Error(sorun);

  const { data: mevcut, error: okumaHatasi } = await supabase
    .from("organization_step_template_sets").select("code").eq("organization_id", membership.organization_id);
  if (okumaHatasi) throw new Error("Çalışma türleri okunamadı: " + okumaHatasi.message);
  const kodlar = new Set((mevcut ?? []).map((satir) => satir.code as string));
  if (kodlar.size >= SET_EN_COK) throw new Error(`En fazla ${SET_EN_COK} çalışma türü tanımlanabilir.`);

  const { error } = await supabase.from("organization_step_template_sets").insert({
    organization_id: membership.organization_id,
    code: kodTuret(ad, kodlar),
    name: ad,
    sort_order: (kodlar.size + 1) * 10,
    // Kurumun ilk türü aynı zamanda öntanımlı: türü seçilmeden açılan iş boş kalmasın.
    is_default: kodlar.size === 0,
  });
  if (error) throw new Error("Çalışma türü eklenemedi: " + error.message);
  tazele();
}

async function renameTemplateSet__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const set = await setCoz(supabase, membership.organization_id, formData);
  const ad = String(formData.get("name") ?? "").trim();
  const sorun = setAdiSorunu(ad);
  if (sorun) throw new Error(sorun);
  const { error } = await supabase
    .from("organization_step_template_sets")
    .update({ name: ad, updated_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id).eq("code", set.code);
  if (error) throw new Error("Çalışma türü yeniden adlandırılamadı: " + error.message);
  tazele();
}

/** Türü seçilmeden açılan işin (CRM fırsatı, köprü) kullanacağı tür. */
async function makeDefaultTemplateSet__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const set = await setCoz(supabase, membership.organization_id, formData);
  /*
    Kısmi tekil dizin kurum başına tek öntanımlı tutuyor; eskisi ÖNCE
    düşürülmeli, yoksa ikinci satır dizine takılır.
  */
  const { error: bosaltma } = await supabase
    .from("organization_step_template_sets").update({ is_default: false })
    .eq("organization_id", membership.organization_id).eq("is_default", true);
  if (bosaltma) throw new Error("Öntanımlı tür değiştirilemedi: " + bosaltma.message);
  const { error } = await supabase
    .from("organization_step_template_sets").update({ is_default: true })
    .eq("organization_id", membership.organization_id).eq("code", set.code);
  if (error) throw new Error("Öntanımlı tür değiştirilemedi: " + error.message);
  tazele();
}

async function deleteTemplateSet__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();
  const set = await setCoz(supabase, membership.organization_id, formData);
  /*
    Öntanımlı tür silinemez: silinseydi türü seçilmeyen iş hangi listeyi
    alacağını bilemez ve sessizce varsayılan sekiz adıma düşerdi. Önce
    başka bir tür öntanımlı yapılmalı.
  */
  if (set.is_default) throw new Error("Öntanımlı tür silinemez. Önce başka bir türü öntanımlı yapın.");
  const { error } = await supabase
    .from("organization_step_template_sets").delete()
    .eq("organization_id", membership.organization_id).eq("code", set.code);
  if (error) throw new Error("Çalışma türü silinemedi: " + error.message);
  tazele();
}

export async function createTemplateSet(...args: Parameters<typeof createTemplateSet__impl>) {
  return runPanelAction(() => createTemplateSet__impl(...args), "Çalışma türü eklendi");
}
export async function renameTemplateSet(...args: Parameters<typeof renameTemplateSet__impl>) {
  return runPanelAction(() => renameTemplateSet__impl(...args), "Çalışma türü yeniden adlandırıldı");
}
export async function makeDefaultTemplateSet(...args: Parameters<typeof makeDefaultTemplateSet__impl>) {
  return runPanelAction(() => makeDefaultTemplateSet__impl(...args), "Öntanımlı çalışma türü değişti");
}
export async function deleteTemplateSet(...args: Parameters<typeof deleteTemplateSet__impl>) {
  return runPanelAction(() => deleteTemplateSet__impl(...args), "Çalışma türü silindi");
}
