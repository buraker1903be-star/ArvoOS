"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { BAGLANTI_TURLERI, type BaglantiTuru } from "@/lib/kimlik-baglantisi";

/*
  Tek kullanımlık bağlantı ANCAK kişi "Devam et"e basınca tüketilir
  (16.10.2026). Eskiden /auth/callback bağlantıyı GET'te doğruluyordu:
  kurumsal posta güvenlik tarayıcıları (Outlook Safe Links, Defender,
  Proofpoint) e-postadaki bağlantıları kullanıcıdan ÖNCE açıyor ve tek
  kullanımlık jeton orada harcanıyordu — kişi tıkladığında "bağlantı
  süresi dolmuş" görüyordu. Tarayıcılar form göndermez; doğrulama burada.
*/
export async function baglantiyiDogrula(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const ham = String(formData.get("type") ?? "").trim();
  const next = safeNextPath(formData.get("next"));
  const yenileme = formData.get("tur") === "yenile" || ham === "recovery";

  if (!tokenHash || !BAGLANTI_TURLERI.includes(ham as BaglantiTuru)) {
    redirect("/auth/forgot-password?error=expired");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: ham as BaglantiTuru });
  if (error) redirect("/auth/forgot-password?error=expired");

  const hedef = new URLSearchParams({ next });
  if (yenileme) hedef.set("tur", "yenile");
  redirect(`/auth/set-password?${hedef.toString()}`);
}
