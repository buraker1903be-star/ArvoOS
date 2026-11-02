"use server";

import { revalidatePath } from "next/cache";
import { konsolAlaniniDogrula, kendiKurumuysaTamYetki } from "../../konsol-alani";
import { getPanelContext } from "@/lib/panel-context";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { kurumAlicisiKur, type KurumResmiBilgisi } from "@/lib/proforma";
import { todayInIstanbul } from "@/lib/istanbul-date";

/*
  RESMİ BİLGİLERİ TAMAMLAMA HATIRLATMASI (02.11.2026).

  Proforma alıcısı kurumun kendi girdiği resmi bilgilerden doluyor
  (lib/proforma kurumAlicisiKur). Kurum ticari unvanını, vergi bilgisini
  ya da adresini girmemişse proformaya eksik basılıyordu ve kurucunun
  kuruma bunu söylemesinin yolu telefon ya da e-postaydı.

  Bildirim KURUM SAHİPLERİNE, kişiye özel satırla gidiyor: resmi
  bilgileri düzenleme yetkisi onlarda ve kişiye özel satır telefona da
  düşüyor. Aynı gün ikinci basış yeni satır yazmıyor (anahtar kurum +
  gün): bir kurucunun iki kez basması sahibin telefonunu iki kez
  çaldırmasın. Eksik yoksa gönderilmiyor.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KATEGORI = "resmi_bilgi_eksik";

async function resmiBilgiHatirlat__impl(formData: FormData) {
  const { isPlatformOwner, konsolKapsami, organization } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  konsolAlaniniDogrula(konsolKapsami, "musteriler");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!UUID.test(organizationId)) throw new Error("Kurum seçilmedi.");
  kendiKurumuysaTamYetki(konsolKapsami, organizationId, organization.id);
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  const [{ data: kurum, error: kurumHatasi }, { data: sahipler, error: sahipHatasi }] = await Promise.all([
    admin.from("organizations").select("name,display_name,legal_name,legal_address,legal_district,legal_city,tax_office,tax_number,contact_email")
      .eq("id", organizationId).maybeSingle(),
    admin.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "owner").eq("is_active", true),
  ]);
  if (kurumHatasi) throw new Error("Kurum okunamadı: " + kurumHatasi.message);
  if (!kurum) throw new Error("Kurum bulunamadı.");
  if (sahipHatasi) throw new Error("Kurum sahipleri okunamadı: " + sahipHatasi.message);
  const eksikler = kurumAlicisiKur(kurum as KurumResmiBilgisi, []).eksikler;
  if (!eksikler.length) {
    await flashSuccess("Kurumun resmi bilgileri tam; hatırlatma gönderilmedi.");
    return;
  }
  const kisiler = ((sahipler ?? []) as { user_id: string }[]).map((s) => s.user_id);
  if (!kisiler.length) throw new Error("Kurumun etkin Kurum Sahibi yok; hatırlatma gidecek kimse yok.");

  const anahtar = `resmi-bilgi:${organizationId}:${todayInIstanbul()}`;
  const { data: onceki, error: oncekiHatasi } = await admin.from("notifications").select("user_id")
    .eq("organization_id", organizationId).eq("category", KATEGORI).eq("metadata->>anahtar", anahtar);
  if (oncekiHatasi) throw new Error("Önceki bildirimler okunamadı: " + oncekiHatasi.message);
  const yazilmis = new Set(((onceki ?? []) as { user_id: string | null }[]).map((o) => o.user_id));
  const yeni = kisiler.filter((k) => !yazilmis.has(k));
  if (!yeni.length) {
    await flashSuccess("Bugün zaten hatırlatıldı; Kurum Sahiplerine yeniden gönderilmedi.");
    return;
  }
  const { error } = await admin.from("notifications").insert(yeni.map((kullanici) => ({
    organization_id: organizationId, user_id: kullanici, audience: "organization", category: KATEGORI,
    title: "Resmi bilgilerinizi tamamlayın",
    message: `Proforma ve faturalarınızda görünmesi için şu bilgiler eksik: ${eksikler.join(", ")}. Ayarlar → Resmi bilgiler'den tamamlayabilirsiniz.`,
    action_url: "/panel/settings?bolum=resmi-bilgiler",
    metadata: { anahtar, eksikler, by: "founder_console" },
  })));
  if (error) throw new Error("Bildirim yazılamadı: " + error.message);
  revalidatePath(`/panel/platform/musteriler/${organizationId}`);
  await flashSuccess(`Hatırlatma ${yeni.length} Kurum Sahibine gönderildi.`);
}

export async function resmiBilgiHatirlat(formData: FormData): Promise<void> {
  await runPanelAction(() => resmiBilgiHatirlat__impl(formData));
}
