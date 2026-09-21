"use server";

import { revalidatePath } from "next/cache";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { sendThroughGateway } from "@/lib/whatsapp-gateway";
import { loadConversation } from "@/lib/whatsapp-inbox";
import { normalizePhone } from "@/lib/whatsapp-send";
import { verifyWhatsappNumber } from "@/lib/whatsapp-cloud";

/*
  Gelen kutusundan yanıt. Kapının kendisini (lib/whatsapp-gateway.ts) aynı
  süreçte çağırır; HTTP'ye çıkmaya gerek yok, kapı zaten burada.

  Serbest metin yalnızca müşterinin son mesajından sonraki 24 saat içinde
  gönderilebilir. Pencereyi Meta'ya sormadan önce burada da bakıyoruz:
  kapalıyken istek Meta'dan 131047 ile dönerdi ve kullanıcı "gönderdim"
  sanıp bekleyecekti.
*/

async function inboxContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) {
    throw new Error("WhatsApp gelen kutusunu yalnızca Kurum Sahibi ve Yönetici görebilir.");
  }
  assertModuleKeyAccess(context.membership.role, "integrations", context.hiddenModuleKeys);
  return context;
}

async function replyWhatsapp__impl(formData: FormData) {
  const { membership } = await inboxContext();
  const telefon = normalizePhone(String(formData.get("phone") ?? ""));
  const metin = String(formData.get("text") ?? "").trim();
  if (!telefon) throw new Error("Numara geçersiz.");
  if (!metin) throw new Error("Boş mesaj gönderilemez.");

  const { windowOpen } = await loadConversation(membership.organization_id, telefon);
  if (!windowOpen) {
    throw new Error("24 saatlik yanıt penceresi kapalı. Müşteri yeniden yazana kadar yalnızca onaylı şablon gönderilebilir.");
  }

  const sonuc = await sendThroughGateway({
    product: "arvoos",
    organizationId: membership.organization_id,
    sender: "organization",
    messages: [{ to: telefon, text: metin }],
  });
  const ilk = sonuc.results[0];
  if (!ilk?.sent) throw new Error(ilk?.error ?? "Mesaj gönderilemedi.");

  revalidatePath("/panel/settings/whatsapp");
}

export async function replyWhatsapp(...args: Parameters<typeof replyWhatsapp__impl>) {
  return runPanelAction(() => replyWhatsapp__impl(...args), "Yanıt gönderildi");
}

/*
  Arvo'nun ortak numarasının bağlantı kontrolü.

  Gönderim başarısız olduğunda sebebini bulmak saatler aldı: ortam
  değişkeni doğru mu, anahtar geçerli mi, yetkisi var mı — hiçbiri
  panelden görülemiyordu ve her deneme "anahtarı yenile, yeniden dağıt,
  mesaj yaz" turuna dönüyordu.

  Bu kontrol Meta'ya tek bir soru sorar (numarayı tanıyor musun) ve ham
  cevabı olduğu gibi gösterir. Anahtarın KENDİSİ hiçbir yerde görünmez;
  yalnızca uzunluğu yazılır — kopyalarken kırpılıp kırpılmadığı ancak
  böyle anlaşılıyor.
*/
async function arvoWhatsappKontrol__impl() {
  const { membership } = await inboxContext();
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("Bu kontrolü yalnızca Kurum Sahibi ve Yönetici çalıştırabilir.");
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_ID ?? "";
  const token = process.env.WHATSAPP_TOKEN ?? "";

  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_ID tanımlı değil.");
  if (!token) throw new Error("WHATSAPP_TOKEN tanımlı değil.");

  const sonuc = await verifyWhatsappNumber(phoneNumberId, token);
  const imza = `numara kimliği ${phoneNumberId} · anahtar ${token.length} karakter`;

  if (!sonuc.ok) throw new Error(`${sonuc.error} (${imza})`);

  /*
    Başarı metni sabit değil, sonucun kendisi: hangi numaraya bağlandığı ve
    Meta'nın o numara için bildirdiği ad. "Kontrol edildi" demek, sorunu
    aramaya devam eden birine hiçbir şey anlatmaz.
  */
  await flashSuccess(
    `Bağlantı çalışıyor: ${sonuc.number.displayPhone ?? "numara"} · ${sonuc.number.verifiedName ?? "ad yok"} (${imza})`,
  );
}

export async function arvoWhatsappKontrol(): Promise<void> {
  await runPanelAction(arvoWhatsappKontrol__impl);
}
