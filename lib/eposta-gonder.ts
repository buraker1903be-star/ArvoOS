/*
  PLATFORMUN KENDİ E-POSTASI (29.10.2026, otomatik proforma).

  ArvoOS uygulamasında bugüne kadar platformdan müşteriye giden bir posta
  yoktu: giriş ve davet postaları Supabase'in kenar fonksiyonundan
  (supabase/functions/send-auth-email) Resend ile gidiyor, panelin posta
  ekranı kurumun KENDİ kutusunu kullanıyor. Proforma Arvo'nun müşterisine
  gidiyor; aynı Resend hesabı ve aynı gönderen (noreply@arvo-os.com,
  alan adı orada doğrulanmış) kullanılıyor.

  Anahtar (RESEND_API_KEY) yoksa gönderim DÜŞMÜYOR, nedenini döndürüyor:
  proforma yine kesiliyor ve müşterinin panelinde görünüyor, kurucu
  konsolda "e-posta gitmedi: anahtar tanımlı değil" okuyor ve iş anahtar
  girildiği gün kalanları gönderiyor. Eksik ortam değişkeni özelliği kapalı
  gösterir, uygulamayı düşürmez (AGENTS.md).

  Sağlayıcıya doğrudan fetch: tek bir uç için paket eklemeye değmez.
*/

export const epostaAyarli = () => Boolean(process.env.RESEND_API_KEY);

const GONDEREN = "ArvoOS <noreply@arvo-os.com>";

export type EpostaSonucu = { ok: true; kimlik: string | null } | { ok: false; hata: string };

export async function epostaGonder(girdi: {
  kime: string[];
  konu: string;
  metin: string;
  html: string;
  yanitAdresi?: string | null;
}): Promise<EpostaSonucu> {
  const anahtar = process.env.RESEND_API_KEY;
  if (!anahtar) return { ok: false, hata: "E-posta gönderimi ayarlı değil (RESEND_API_KEY tanımlı değil)." };
  if (!girdi.kime.length) return { ok: false, hata: "Alıcı yok: yetkilinin e-posta adresi bulunamadı." };
  try {
    const yanit = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${anahtar}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: GONDEREN,
        to: girdi.kime,
        subject: girdi.konu,
        text: girdi.metin,
        html: girdi.html,
        ...(girdi.yanitAdresi ? { reply_to: girdi.yanitAdresi } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const govde = (await yanit.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!yanit.ok) return { ok: false, hata: `E-posta gönderilemedi (${yanit.status}): ${govde?.message ?? "sağlayıcı yanıtı okunamadı"}`.slice(0, 500) };
    return { ok: true, kimlik: govde?.id ?? null };
  } catch (hata) {
    return { ok: false, hata: `E-posta sağlayıcısına ulaşılamadı: ${hata instanceof Error ? hata.message : String(hata)}`.slice(0, 500) };
  }
}
