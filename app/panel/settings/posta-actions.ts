"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { postaAnahtarlariniKaydet, postaBaglantisiniKaldir } from "@/lib/posta-hesabi";
import { assertYetki } from "@/lib/yetkiler";

/*
  ORTAK POSTA KUTUSU — ayarlar işlemleri.

  Google gizli anahtarı buradan geçiyor ve bir daha ekrana dönmüyor:
  kaydedilirken şifreleniyor (AES-256-GCM), okuma yolu yok. WhatsApp ve
  ödeme sağlayıcılarında olduğu gibi, alan her açılışta boş gelir ve
  doldurulmazsa eskisi korunmaz — değiştirmek isteyen yeniden girer.
*/

async function postaContext() {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "settings.entegrasyon.yonet");
  return context;
}

async function savePostaHesabi__impl(formData: FormData) {
  const { membership, userId } = await postaContext();
  await postaAnahtarlariniKaydet({
    organizationId: membership.organization_id,
    adres: String(formData.get("adres") ?? ""),
    clientId: String(formData.get("client_id") ?? ""),
    clientSecret: String(formData.get("client_secret") ?? ""),
    userId,
  });
  revalidatePath("/panel/settings");
}

async function removePostaHesabi__impl() {
  const { membership } = await postaContext();
  await postaBaglantisiniKaldir(membership.organization_id);
  revalidatePath("/panel/settings");
}

export async function savePostaHesabi(...args: Parameters<typeof savePostaHesabi__impl>) {
  return runPanelAction(() => savePostaHesabi__impl(...args), "Posta ayarları kaydedildi. Şimdi Google ile bağlanın.");
}

export async function removePostaHesabi(...args: Parameters<typeof removePostaHesabi__impl>) {
  return runPanelAction(() => removePostaHesabi__impl(...args), "Posta bağlantısı kaldırıldı");
}
