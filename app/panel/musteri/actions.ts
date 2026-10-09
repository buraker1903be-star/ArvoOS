"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { assertYetki } from "@/lib/yetkiler";
import { iletisimiDerle, kunyeyiDerle } from "@/lib/musteri-kunyesi";

/*
  MÜŞTERİ BİLGİLERİNİ DÜZENLEME (müşteri sayfası, 2026-10).

  Müşterinin iki kaydı var ve ikisi de buradan düzenleniyor:

  - EN SON TALEBİ (crm_opportunities): ad, telefon, e-posta ve künye.
    Künye talebe kayıtlı (her talebin kendi künyesi var); müşteri
    sayfasında görünen en son talebinki olduğu için düzenleme de oraya
    yazılıyor, eski taleplere dokunulmuyor. Yazma, operasyonun künye
    kartının kullandığı fonksiyonla (arvo_ops_musteri_kunyesi_yaz): kayda
    erişimi kendisi denetliyor, künye ve iletişim tek çağrıda yazılıyor.
    Yetki talep düzenlemeyle aynı (crm.talep.yonet).

  - CARİSİ (account_parties): kendi adı/unvanı, telefonu, e-postası,
    vergi no, vergi dairesi, adres. Ayrı alanlar: carisi şirket olan bir
    müşteride kişinin adını cariye yazmak unvanın üstüne yazmak olurdu.
    Yetki cari yönetimiyle aynı (finance.cari.yonet), RLS de uyguluyor.

  Formda yalnızca yetkisi olunan kayda ait alanlar çiziliyor; burada da
  her kayıt ayrı ayrı denetleniyor — ekranı değiştiren biri yetkisi
  olmayan kayda yazamasın.
*/

const metin = (formData: FormData, ad: string, enFazla: number) => String(formData.get(ad) ?? "").trim().slice(0, enFazla);

async function musteriBilgileriniKaydet__impl(formData: FormData) {
  const context = await getPanelContext();
  const { supabase, membership, modules, yetkiler, hiddenModuleKeys } = context;
  const talepId = metin(formData, "opportunity_id", 80);
  const cariId = metin(formData, "party_id", 80);
  if (!talepId && !cariId) throw new Error("Düzenlenecek kayıt seçilmedi.");

  if (talepId) {
    const iletisim = iletisimiDerle((anahtar) => formData.get(anahtar) as string | null);
    if (!iletisim.customer_name || iletisim.customer_name.length < 2) throw new Error("Ad soyad en az 2 karakter olmalı.");
    if (!modules.some((m) => m.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
    assertModuleKeyAccess(membership.role, "crm", hiddenModuleKeys);
    assertYetki(yetkiler, "crm.talep.yonet");
    const kunye = kunyeyiDerle((anahtar) => formData.get(anahtar) as string | null);
    const { error } = await supabase.rpc("arvo_ops_musteri_kunyesi_yaz", {
      p_opportunity: talepId,
      p_kunye: kunye,
      p_iletisim: iletisim,
    });
    if (error) throw new Error("Müşteri bilgileri kaydedilemedi: " + error.message);
  }

  if (cariId) {
    if (!modules.some((m) => m.code === "accounts")) throw new Error("Cari hesap modülüne erişiminiz yok.");
    assertModuleKeyAccess(membership.role, "finance", hiddenModuleKeys);
    assertYetki(yetkiler, "finance.cari.yonet");
    const cariAd = metin(formData, "cari_ad", 180);
    if (cariAd.length < 2) throw new Error("Cari adı en az 2 karakter olmalı.");
    const cariEposta = metin(formData, "cari_eposta", 240);
    if (cariEposta && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cariEposta)) throw new Error("Cari e-posta adresi geçersiz görünüyor.");
    const { data, error } = await supabase
      .from("account_parties")
      .update({
        name: cariAd,
        phone: metin(formData, "cari_telefon", 80) || null,
        email: cariEposta || null,
        tax_number: metin(formData, "tax_number", 40) || null,
        tax_office: metin(formData, "tax_office", 120) || null,
        address: metin(formData, "address", 500) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cariId)
      .eq("organization_id", membership.organization_id)
      .select("id");
    if (error) throw new Error("Cari bilgileri kaydedilemedi: " + error.message);
    if (!data?.length) throw new Error("Cari bulunamadı veya bu kaydı düzenleme yetkiniz yok.");
  }

  revalidatePath("/panel/finance/musteri/[id]", "page");
  revalidatePath("/panel/crm/musteri/[id]", "page");
  revalidatePath("/panel/finance");
  if (talepId) revalidatePath(`/panel/crm/requests/${talepId}`);
}

export async function musteriBilgileriniKaydet(formData: FormData) {
  return runPanelAction(() => musteriBilgileriniKaydet__impl(formData), "Müşteri bilgileri kaydedildi");
}
