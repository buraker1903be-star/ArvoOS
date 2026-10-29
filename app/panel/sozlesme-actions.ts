"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getPanelContextErisimdenBagimsiz } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { kullanimSozlesmesi, sozlesmeDuzMetni, SOZLESME_SURUMU } from "@/lib/sozlesme/kullanim-sozlesmesi";
import { cihazOzeti, istemciIp, konumOku, konumYazisi, onayPostasi } from "@/lib/sozlesme/delil";
import { epostaGonder } from "@/lib/eposta-gonder";
import { istanbulDateTime } from "@/lib/istanbul-date";

/*
  KULLANIM SÖZLEŞMESİ ONAYI (29.10.2026; ArvoLab app/actions/sozlesme.ts'in
  ArvoOS karşılığı).

  Delil değeri sunucunun okuduklarından gelir: IP, yaklaşık konum, cihaz
  ve dil istek BAŞLIKLARINDAN (lib/sozlesme/delil), zaman veritabanının
  saatinden (onaylandi default now()), metin özeti sunucudaki metinden.
  İstemciden gelen tek bilgi sonuna kadar kaydırdığıdır — kaydırma
  yapılmadıysa onay hiç yazılmaz. Kayıt service_role ile yazılır;
  kullanıcı tabloya yazamaz (20261029162437).

  Erişim kapısından BAĞIMSIZ bağlam: lisansı askıdaki kurumun kullanıcısı
  da onaylayıp ödeme ekranına ulaşabilmeli (ödeme, giriş ve destek yolları
  kapanmaz). Onay bir yasal adım, içerik üretmiyor.
*/
export async function sozlesmeyiOnayla(girdi: { kaydirmaTamamlandi: boolean }): Promise<{ ok: true } | { hata: string }> {
  const { supabase, userId, organization } = await getPanelContextErisimdenBagimsiz();
  if (!girdi.kaydirmaTamamlandi) return { hata: "Onaylamadan önce sözleşmeyi sonuna kadar okuyun." };

  const admin = createAdminClient();
  if (!admin) return { hata: "Onay şu anda kaydedilemiyor; birazdan yeniden deneyin." };

  const [{ data: { user } }, { data: profil }, h] = await Promise.all([
    supabase.auth.getUser(),
    // hata-tamam: ad yalnızca kayıttaki ad soyad; okunamazsa boş kalır, onay yine yazılır.
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    headers(),
  ]);
  if (!user || user.id !== userId) return { hata: "Oturumunuz kapanmış; yeniden giriş yapın." };

  const baslik = (ad: string) => h.get(ad);
  const ozet = createHash("sha256").update(sozlesmeDuzMetni(), "utf8").digest("hex");
  const ip = istemciIp(baslik);
  const konum = konumOku(baslik);
  const cihaz = (h.get("user-agent") ?? "").slice(0, 1000) || null;
  const adres = (h.get("x-forwarded-host") ?? h.get("host") ?? "").slice(0, 255) || null;
  const kurumAdi = organization.display_name || organization.name;

  const { data: kayit, error } = await admin.from("sozlesme_onaylari").insert({
    user_id: userId,
    belge: "kullanim_sozlesmesi",
    surum: SOZLESME_SURUMU,
    dil: "tr",
    metin_ozeti: ozet,
    kaydirma_tamamlandi: true,
    ip,
    kullanici_araci: cihaz,
    tarayici_dili: (h.get("accept-language") ?? "").slice(0, 200) || null,
    ulke: konum.ulke, bolge: konum.bolge, sehir: konum.sehir, enlem: konum.enlem, boylam: konum.boylam, saat_dilimi: konum.saatDilimi,
    adres,
    eposta: user.email ?? null,
    ad_soyad: (profil as { full_name?: string | null } | null)?.full_name ?? null,
    organization_id: organization.id,
    kurum_adi: kurumAdi,
  }).select("onaylandi").single();
  if (error || !kayit) {
    console.error("[sözleşme] onay yazılamadı", error?.code, error?.message);
    return { hata: "Onay kaydedilemedi; lütfen yeniden deneyin." };
  }

  /* Kopya e-postası yanıtı bekletmez ve gönderilemezse akış düşmez. */
  if (user.email) {
    const eposta = user.email;
    after(async () => {
      const posta = onayPostasi(kullanimSozlesmesi(), {
        zaman: `${istanbulDateTime(kayit.onaylandi as string)} (Türkiye saati)`,
        surum: SOZLESME_SURUMU, ozet, ip, konum: konumYazisi(konum),
        cihaz: [cihazOzeti(cihaz), cihaz].filter(Boolean).join(" — ") || null, adres, kurum: kurumAdi,
      });
      const sonuc = await epostaGonder({ kime: [eposta], konu: posta.konu, metin: posta.metin, html: posta.html });
      if (!sonuc.ok) console.error("[sözleşme] kopya e-postası gönderilemedi", sonuc.hata);
    });
  }

  revalidatePath("/panel", "layout");
  return { ok: true };
}
