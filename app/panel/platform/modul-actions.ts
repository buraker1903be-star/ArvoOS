"use server";

import { revalidatePath } from "next/cache";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAddonProduct, productName } from "@/lib/products";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";

/*
  Modül matrisinin iki anahtarı.

  ERİŞİM ve KÖPRÜ ayrı tutuluyor, çünkü ayrı şeyler:

    status      — kiracı ürüne girebiliyor mu. Tahsilat aracı.
    integrated  — ArvoOS ile otomatik veri akışı var mı. Ürün tercihi.

  İkisi tek anahtara bindirilirse ödemesini yapmış ama bağımsız çalışmak
  isteyen kiracıya verilecek cevap kalmaz; ya senkronu zorlarız ya da
  ürününü kaparız.

  Yazma service_role ile: organization_product_licenses'ta authenticated
  için UPDATE politikası yok.
*/

async function kurucuVeUrun(formData: FormData) {
  const { userId, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const product = String(formData.get("product") ?? "").trim();
  if (!organizationId) throw new Error("Kurum seçilmedi.");
  // ArvoOS çekirdeği bu tabloda değil; onun lisansı organization_licenses'ta.
  if (!isAddonProduct(product)) throw new Error("Bu işlem yalnızca ek ürünler için geçerli.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  return { admin, organizationId, product, userId };
}

const DURUMLAR = new Set(["active", "trialing", "past_due", "suspended", "inactive"]);

async function modulErisimiDegistir__impl(formData: FormData) {
  const { admin, organizationId, product, userId } = await kurucuVeUrun(formData);
  const durum = String(formData.get("status") ?? "").trim();
  const sebep = String(formData.get("reason") ?? "").trim();
  if (!DURUMLAR.has(durum)) throw new Error("Geçersiz erişim durumu.");

  /*
    Dondurmanın sebebi zorunlu. Sebepsiz bir dondurmayı üç ay sonra kimse
    açıklayamıyor; müşteri arayınca "neden kapalı" sorusunun yanıtı
    kayıtta olmalı.
  */
  if (durum === "suspended" && !sebep) {
    throw new Error("Askıya alma sebebi zorunlu. Müşteri sorduğunda yanıtın kayıtta olması gerekiyor.");
  }

  const simdi = new Date().toISOString();
  const { error } = await admin
    .from("organization_product_licenses")
    .update({
      status: durum,
      suspended_at: durum === "suspended" ? simdi : null,
      suspension_reason: durum === "suspended" ? sebep : null,
      updated_by: userId,
      updated_at: simdi,
    })
    .eq("organization_id", organizationId)
    .eq("product", product);
  if (error) throw new Error(`Erişim güncellenemedi: ${error.message}`);

  // Lisans değişikliği ürün tarafına yansımalı; ARC kopyayı köprüden okuyor.
  await syncArcTenantQuietly(organizationId);
  revalidatePath("/panel/platform");
  await flashSuccess(
    durum === "suspended"
      ? `${productName(product)} donduruldu`
      : durum === "inactive"
        ? `${productName(product)} kapatıldı`
        : `${productName(product)} açıldı`,
  );
}

export async function modulErisimiDegistir(formData: FormData): Promise<void> {
  await runPanelAction(() => modulErisimiDegistir__impl(formData));
}

async function modulKoprusuDegistir__impl(formData: FormData) {
  const { admin, organizationId, product, userId } = await kurucuVeUrun(formData);
  const entegre = String(formData.get("integrated") ?? "") === "1";

  const { error } = await admin
    .from("organization_product_licenses")
    .update({ integrated: entegre, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("product", product);
  if (error) throw new Error(`Köprü modu güncellenemedi: ${error.message}`);

  /*
    Senkron hemen çalıştırılıyor: bağımsıza çekilen kiracı kapsam dışına
    düşer, entegreye alınan kiracının kopyası anında oluşur. Bir sonraki
    zamanlanmış turu beklemek, anahtarı çevirip hiçbir şey olmamasını
    izlemek demekti.
  */
  await syncArcTenantQuietly(organizationId);
  revalidatePath("/panel/platform");
  await flashSuccess(
    entegre
      ? `${productName(product)} ArvoOS ile entegre çalışacak`
      : `${productName(product)} bağımsız çalışacak; otomatik veri akışı durdu`,
  );
}

export async function modulKoprusuDegistir(formData: FormData): Promise<void> {
  await runPanelAction(() => modulKoprusuDegistir__impl(formData));
}
