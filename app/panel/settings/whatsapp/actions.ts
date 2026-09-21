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
  markConversationRead,
  setConversationArchived,
} from "@/lib/whatsapp-inbox";
import { normalizePhone } from "@/lib/whatsapp-send";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEDYA_SINIRI, gorunenDosyaAdi, medyayiYukle, uzanti } from "@/lib/whatsapp-medya";
import { decryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
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

/*
  Sohbet açıkken okundu damgası.

  İstemci her tazelemede değil, YALNIZCA yeni gelen mesaj gördüğünde
  çağırıyor: 10 saniyede bir yazmak, açık duran her sekme için boşuna
  yazma demekti.
*/
async function sohbetiOkunduIsaretle__impl(telefon: string) {
  const { membership, userId } = await inboxContext();
  const numara = normalizePhone(telefon);
  if (!numara) return;
  await markConversationRead(membership.organization_id, numara, userId ?? null);
}

export async function sohbetiOkunduIsaretle(telefon: string): Promise<void> {
  await sohbetiOkunduIsaretle__impl(telefon);
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


/*
  Panelden görsel/dosya gönderme.

  Eskiden yalnızca metin gidiyordu: müşteri "fiyat listesini atar mısınız"
  dediğinde personel WhatsApp Web'e geçip dosyayı oradan yolluyor, o mesaj
  da panelde hiç görünmüyordu — yazışmanın yarısı panelde, yarısı telefonda
  kalıyordu.

  Dosya iki yere gidiyor: Meta'ya (gönderilebilmesi için) ve kendi kovamıza
  (panelde görünebilmesi için). Meta'nın medya kimliği yaklaşık 30 gün sonra
  ölüyor, yani yalnızca ona güvenmek bir ay sonra boş bir baloncuk demekti.

  Serbest metinle aynı kural: yalnızca müşterinin son mesajından sonraki
  24 saat içinde gönderilebilir.
*/

/** Meta'nın kabul ettiği ve panelde anlamlı gösterebildiğimiz türler. */
const MEDYA_TURU: Record<string, "image" | "document" | "video" | "audio"> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image",
  "video/mp4": "video", "video/3gpp": "video",
  "audio/aac": "audio", "audio/mp4": "audio", "audio/mpeg": "audio", "audio/ogg": "audio",
};

async function gonderenAnahtari(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  if (paymentCredentialsConfigured()) {
    const { data } = await admin
      .from("whatsapp_accounts")
      .select("phone_number_id,access_token_enc,status")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (data && data.status !== "disabled") {
      return { admin, phoneNumberId: data.phone_number_id as string, token: decryptSecret(data.access_token_enc) };
    }
  }

  // Kurumun kendi numarası yoksa Arvo'nun ortak numarası; kapının da kuralı bu.
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) throw new Error("WhatsApp numarası tanımlı değil.");
  return { admin, phoneNumberId, token };
}

async function dosyaGonder__impl(formData: FormData) {
  const { membership } = await inboxContext();
  const telefon = normalizePhone(String(formData.get("phone") ?? ""));
  if (!telefon) throw new Error("Numara geçersiz.");

  const dosya = formData.get("file");
  if (!(dosya instanceof File) || !dosya.size) throw new Error("Dosya seçilmedi.");

  const mime = (dosya.type || "application/octet-stream").split(";")[0].trim();
  // Tanımadığımız her tür "document": Meta belgede en geniş tür listesini
  // kabul ediyor ve panelde indirme satırı olarak gösterebiliyoruz.
  const tur = MEDYA_TURU[mime] ?? "document";

  const sinir = MEDYA_SINIRI[tur] ?? MEDYA_SINIRI.document;
  if (dosya.size > sinir) {
    throw new Error(`Dosya çok büyük. ${tur === "image" ? "Görsel" : "Dosya"} en çok ${Math.round(sinir / 1024 / 1024)} MB olabilir.`);
  }

  // Pencereyi Meta'ya sormadan önce burada da bakıyoruz: kapalıyken istek
  // 131047 ile dönerdi ve dosya boşuna yüklenmiş olurdu.
  const { windowOpen } = await loadConversation(membership.organization_id, telefon);
  if (!windowOpen) {
    throw new Error("24 saatlik yanıt penceresi kapalı. Müşteri yeniden yazana kadar dosya gönderilemez.");
  }

  const { admin, phoneNumberId, token } = await gonderenAnahtari(membership.organization_id);
  const govde = Buffer.from(await dosya.arrayBuffer());
  const ad = dosya.name?.trim() || gorunenDosyaAdi(tur, mime, null);

  const yukleme = await medyayiYukle(phoneNumberId, token, { govde, mime, ad });
  if (!yukleme.ok) throw new Error(yukleme.hata);

  /*
    Kopya Meta'ya yükleme BAŞARILI olduktan sonra saklanıyor: yükleme
    düşerse kovada sahipsiz bir dosya kalmasın.
  */
  const yol = `${membership.organization_id}/giden/${crypto.randomUUID()}.${uzanti(mime, ad)}`;
  const { error: kovaHatasi } = await admin.storage
    .from("whatsapp-media")
    .upload(yol, govde, { contentType: mime, upsert: false });
  if (kovaHatasi) console.error("[whatsapp] giden dosya saklanamadı", kovaHatasi.message);

  const altYazi = String(formData.get("text") ?? "").trim();
  const sonuc = await sendThroughGateway({
    product: "arvoos",
    organizationId: membership.organization_id,
    sender: "organization",
    messages: [{
      to: telefon,
      media: { kind: tur, id: yukleme.mediaId, caption: altYazi || undefined, filename: ad },
      body: altYazi || ad,
      mediaPath: kovaHatasi ? undefined : yol,
      mediaMime: mime,
      mediaSize: govde.length,
    }],
  });

  const ilk = sonuc.results[0];
  if (!ilk?.sent) throw new Error(ilk?.error ?? "Dosya gönderilemedi.");

  revalidatePath("/panel/crm/whatsapp");
}

export async function dosyaGonder(formData: FormData): Promise<void> {
  await runPanelAction(() => dosyaGonder__impl(formData), "Dosya gönderildi");
}
