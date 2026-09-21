"use server";

import { revalidatePath } from "next/cache";
import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { sendThroughGateway } from "@/lib/whatsapp-gateway";
import {
  createQuickReply,
  deleteQuickReply,
  loadConversation,
  setConversationArchived,
} from "@/lib/whatsapp-inbox";
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

/*
  Gelen kutusu CRM'e taşındı (app/panel/crm/whatsapp). Yetki de oraya uydu:
  eskiden yalnızca Kurum Sahibi ve Yönetici görebiliyordu, artık CRM
  modülüne erişen herkes — Satış Personeli dahil. Müşterinin teklifini
  görebilen kişi konuşmasını da görebilmeli; aksi hâlde satışçı yazışmayı
  yöneticiden istemek zorunda kalıyordu.
*/
async function inboxContext() {
  const context = await getPanelContext();
  assertModuleKeyAccess(context.membership.role, "crm", context.hiddenModuleKeys);
  return context;
}

/** Bağlantı kontrolü yapılandırmadır; o yetki dar kalıyor. */
async function ayarContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) {
    throw new Error("Bu işlemi yalnızca Kurum Sahibi ve Yönetici yapabilir.");
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

  revalidatePath("/panel/crm/whatsapp");
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
  await ayarContext();

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

/*
  Sohbeti yeniden okur; gelen kutusunun kendi kendine tazelenmesi için.

  Eskiden sayfa sunucuda bir kez çiziliyordu: müşteri yazdığında ekranda
  hiçbir şey olmuyor, kullanıcı sayfayı yenilemedikçe mesajı görmüyordu.
  Mesajlaşma ekranında bu kabul edilemez — karşı taraf yazdı diye sayfayı
  yenilemeyi kimse akıl etmez.
*/
async function sohbetiGetir__impl(telefon: string) {
  const { membership } = await inboxContext();
  const numara = normalizePhone(telefon);
  if (!numara) throw new Error("Numara geçersiz.");
  return loadConversation(membership.organization_id, numara);
}

export async function sohbetiGetir(telefon: string) {
  return sohbetiGetir__impl(telefon);
}

/*
  Arşivleme.

  Kapanmış yazışmalar listenin başında durmaya devam ediyordu; satışçı her
  gün aynı ölü sohbetlerin arasından geçiyordu. Silmek seçenek değil —
  kayıt hem kanıt hem CRM geçmişi — bu yüzden gizleniyor, siliniyor değil.
  Müşteri yeniden yazarsa sohbet arşivden kendiliğinden çıkar
  (lib/whatsapp-arsiv.ts).
*/
async function sohbetiArsivle__impl(telefon: string, arsivle: boolean) {
  const { membership, userId } = await inboxContext();
  const numara = normalizePhone(telefon);
  if (!numara) throw new Error("Numara geçersiz.");

  await setConversationArchived(membership.organization_id, numara, arsivle, userId ?? null);
  revalidatePath("/panel/crm/whatsapp");
}

export async function sohbetiArsivle(telefon: string, arsivle: boolean): Promise<void> {
  await runPanelAction(
    () => sohbetiArsivle__impl(telefon, arsivle),
    arsivle ? "Sohbet arşivlendi" : "Sohbet arşivden çıkarıldı",
  );
}

/*
  Hazır mesajlar.

  Aynı cevaplar her seferinde elle yazılıyordu. Önerilen liste kodda
  (lib/whatsapp-hazir-mesaj.ts); burada yalnızca kurumun kendi kaydettiği
  metinler yönetiliyor.
*/
async function hazirMesajEkle__impl(formData: FormData) {
  const { membership, userId } = await inboxContext();
  const baslik = String(formData.get("title") ?? "").trim();
  const govde = String(formData.get("body") ?? "").trim();

  if (!baslik) throw new Error("Hazır mesaja bir başlık verin.");
  if (baslik.length > 60) throw new Error("Başlık en çok 60 karakter olabilir.");
  if (!govde) throw new Error("Hazır mesajın metni boş olamaz.");
  if (govde.length > 1024) throw new Error("Hazır mesaj en çok 1024 karakter olabilir.");

  await createQuickReply(membership.organization_id, baslik, govde, userId ?? null);
  revalidatePath("/panel/crm/whatsapp");
}

export async function hazirMesajEkle(formData: FormData): Promise<void> {
  await runPanelAction(() => hazirMesajEkle__impl(formData), "Hazır mesaj kaydedildi");
}

async function hazirMesajSil__impl(id: string) {
  const { membership } = await inboxContext();
  if (!id) throw new Error("Kayıt bulunamadı.");
  await deleteQuickReply(membership.organization_id, id);
  revalidatePath("/panel/crm/whatsapp");
}

export async function hazirMesajSil(id: string): Promise<void> {
  await runPanelAction(() => hazirMesajSil__impl(id), "Hazır mesaj silindi");
}
