"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { runPanelAction } from "@/lib/panel-action";
import { SABLON_EN_COK, VARSAYILAN_ADIMLAR, kodTuret, sablonSorunu } from "@/lib/is-adimlari";

/*
  Kurumun iş adımı şablonu.

  Bugüne kadar adım listesi bir SQL fonksiyonunun gövdesinde sabit
  yazılıydı; AkademikMerkez'in akademik adımları ("İç Kontrol Yapılıyor",
  "Evrak Teslimine Hazır") başka bir kiracıya da miras kalıyordu. Artık
  kurum kendi listesini tanımlıyor ve yeni açılan işler onu kullanıyor
  (add_standard_operation_steps).

  Şablon yalnızca YENİ işi etkiler; açık işlerin adımlarına dokunulmaz.
  Aksi hâlde yarısı bitmiş bir tezin adımları altından değişirdi.
*/

const YONETICI = ["owner", "admin"];

async function sablonContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  assertModuleKeyAccess(context.membership.role, "operations", context.hiddenModuleKeys);
  if (!YONETICI.includes(context.membership.role)) throw new Error("Adım şablonunu yalnızca kurum sahibi ve yöneticiler değiştirebilir.");
  return context;
}

const tazele = () => {
  revalidatePath("/panel/operations", "layout");
};

/** Formdaki satırları (ad + gün) tek seferde kaydeder: eksikler silinir. */
async function saveStepTemplate__impl(formData: FormData) {
  const { supabase, membership } = await sablonContext();

  const basliklar = formData.getAll("title").map((value) => String(value).trim());
  const gunler = formData.getAll("day_offset").map((value) => String(value).trim());
  const kodlar = formData.getAll("code").map((value) => String(value).trim());

  const kullanilan = new Set<string>();
  const satirlar = basliklar
    .map((title, index) => ({ title, gun: gunler[index] ?? "", kod: kodlar[index] ?? "" }))
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
      return { code: kod, title: satir.title, sort_order: (index + 1) * 10, day_offset: gun, is_active: true };
    });

  if (satirlar.length > SABLON_EN_COK) throw new Error(`Şablona en fazla ${SABLON_EN_COK} adım eklenebilir.`);
  const sorun = sablonSorunu(satirlar);
  if (sorun) throw new Error(sorun);

  const { data: mevcut, error: okumaHatasi } = await supabase
    .from("organization_step_templates").select("code").eq("organization_id", membership.organization_id);
  if (okumaHatasi) throw new Error("Şablon okunamadı: " + okumaHatasi.message);

  if (satirlar.length) {
    const { error } = await supabase
      .from("organization_step_templates")
      .upsert(satirlar.map((satir) => ({ ...satir, organization_id: membership.organization_id, updated_at: new Date().toISOString() })),
              { onConflict: "organization_id,code" });
    if (error) throw new Error("Şablon kaydedilemedi: " + error.message);
  }

  // Formda kalmayan satırlar silinir; "boş bırakınca gitsin" beklentisi bu.
  const kalanlar = new Set(satirlar.map((satir) => satir.code));
  const silinecek = (mevcut ?? []).map((satir) => satir.code as string).filter((code) => !kalanlar.has(code));
  if (silinecek.length) {
    const { error } = await supabase
      .from("organization_step_templates").delete()
      .eq("organization_id", membership.organization_id).in("code", silinecek);
    if (error) throw new Error("Kaldırılan adımlar silinemedi: " + error.message);
  }

  tazele();
}

/** Bugünkü sekiz varsayılan adımı şablona kopyalar; kurum oradan düzenler. */
async function copyDefaultStepTemplate__impl() {
  const { supabase, membership } = await sablonContext();
  const { count, error: sayimHatasi } = await supabase
    .from("organization_step_templates")
    .select("code", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id);
  if (sayimHatasi) throw new Error("Şablon okunamadı: " + sayimHatasi.message);
  // Dolu şablonun üzerine yazmak, kurumun kendi listesini sessizce silerdi.
  if ((count ?? 0) > 0) throw new Error("Şablonunuz zaten tanımlı. Varsayılanı almak için önce mevcut adımları kaldırın.");

  const { error } = await supabase.from("organization_step_templates").insert(
    VARSAYILAN_ADIMLAR.map((adim, index) => ({
      organization_id: membership.organization_id,
      code: adim.code,
      title: adim.title,
      sort_order: (index + 1) * 10,
      day_offset: null,
      is_active: true,
    })),
  );
  if (error) throw new Error("Varsayılan şablon kopyalanamadı: " + error.message);
  tazele();
}

/** Şablonu tamamen kaldırır: işler yeniden varsayılan sekiz adımla açılır. */
async function clearStepTemplate__impl() {
  const { supabase, membership } = await sablonContext();
  const { error } = await supabase
    .from("organization_step_templates").delete().eq("organization_id", membership.organization_id);
  if (error) throw new Error("Şablon kaldırılamadı: " + error.message);
  tazele();
}

export async function saveStepTemplate(...args: Parameters<typeof saveStepTemplate__impl>) {
  return runPanelAction(() => saveStepTemplate__impl(...args), "Adım şablonu kaydedildi");
}
export async function copyDefaultStepTemplate() {
  return runPanelAction(() => copyDefaultStepTemplate__impl(), "Varsayılan adımlar şablona kopyalandı");
}
export async function clearStepTemplate() {
  return runPanelAction(() => clearStepTemplate__impl(), "Adım şablonu kaldırıldı");
}
