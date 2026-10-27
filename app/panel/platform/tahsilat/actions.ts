"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPanelAction } from "@/lib/panel-action";

/*
  PLATFORM FATURASI YÜKLEME (26.10.2026, migration 20261026191235).

  Fatura elle kesiliyor; kurucu PDF'i ilgili tahsilatın yanına yüklüyor.
  Müşteri (bireysel abone ya da kurum yöneticisi) onu ArvoLab'daki
  "Faturalar ve ödemeler" bölümünde görüyor.

  Yazma service_role ile, KURUCU denetiminden sonra: fatura müşteriye
  giden resmî belge; tablo ve depo istemciye kapalı. Yeniden yüklemek
  aynı ödemenin faturasını günceller (yanlış PDF'in düzeltilmesi); eski
  dosya silinir.
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function faturaYukle__impl(formData: FormData) {
  const { isPlatformOwner, userId } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Fatura yalnızca platform kurucusu tarafından yüklenebilir.");

  const tur = String(formData.get("tur") ?? "");
  const odemeId = String(formData.get("odeme_id") ?? "");
  const faturaNo = String(formData.get("fatura_no") ?? "").trim().slice(0, 60);
  const faturaTarihi = String(formData.get("fatura_tarihi") ?? "").trim();
  const dosya = formData.get("dosya");

  if (tur !== "abone" && tur !== "kurum") throw new Error("Ödeme türü tanınmadı.");
  if (!UUID.test(odemeId)) throw new Error("Ödeme bulunamadı.");
  if (!faturaNo) throw new Error("Fatura numarasını yazın.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(faturaTarihi)) throw new Error("Fatura tarihini seçin.");
  if (!(dosya instanceof File) || dosya.size === 0) throw new Error("Fatura PDF'ini seçin.");
  if (dosya.type !== "application/pdf") throw new Error("Fatura PDF olmalıdır.");
  if (dosya.size > 10 * 1024 * 1024) throw new Error("Fatura dosyası 10 MB sınırını aşıyor.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; fatura yüklenemedi.");

  // Ödeme gerçekten var mı ve (kurumdaysa) onaylı mı: onaylanmamış havaleye fatura kesilmez.
  const alan = tur === "abone" ? "subscriber_payment_id" : "payment_request_id";
  if (tur === "abone") {
    const { data, error } = await admin.from("subscriber_payments").select("id").eq("id", odemeId).maybeSingle();
    if (error || !data) throw new Error("Ödeme kaydı bulunamadı.");
  } else {
    const { data, error } = await admin.from("organization_payment_requests").select("id,status").eq("id", odemeId).maybeSingle();
    if (error || !data) throw new Error("Ödeme kaydı bulunamadı.");
    if (data.status !== "approved") throw new Error("Yalnızca onaylanmış ödemeye fatura yüklenebilir.");
  }

  const { data: onceki } = await admin.from("platform_faturalari").select("id,dosya_yolu").eq(alan, odemeId).maybeSingle();

  const yol = `${tur}/${odemeId}/${Date.now()}.pdf`;
  const { error: yuklemeHatasi } = await admin.storage.from("platform-faturalari").upload(yol, dosya, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (yuklemeHatasi) throw new Error(`Fatura yüklenemedi: ${yuklemeHatasi.message}`);

  const satir = {
    fatura_no: faturaNo,
    fatura_tarihi: faturaTarihi,
    dosya_yolu: yol,
    yukleyen: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = onceki
    ? await admin.from("platform_faturalari").update(satir).eq("id", onceki.id)
    : await admin.from("platform_faturalari").insert({ ...satir, [alan]: odemeId });
  if (error) {
    await admin.storage.from("platform-faturalari").remove([yol]);
    throw new Error(`Fatura kaydedilemedi: ${error.message}`);
  }
  // Eski PDF ancak yeni kayıt yazıldıktan sonra siliniyor: arada müşteri faturasız kalmasın.
  if (onceki?.dosya_yolu) await admin.storage.from("platform-faturalari").remove([onceki.dosya_yolu]);

  revalidatePath("/panel/platform/tahsilat");
}

export async function faturaYukle(...args: Parameters<typeof faturaYukle__impl>) {
  return runPanelAction(() => faturaYukle__impl(...args), "Fatura yüklendi; müşteri ArvoLab'da görebilir.");
}
