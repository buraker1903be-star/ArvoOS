"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAyarlari } from "@/lib/supabase/yapilandirma";
import { girisHataAnahtari } from "@/lib/giris-hatasi";
import { epostayiHatirla } from "@/lib/eposta-hatirla";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  /* Hata dönüşünde e-posta kutusu dolu gelsin (adrese yazmadan, çerezde). */
  await epostayiHatirla(email);
  if (!email || !password) redirect("/login?error=missing");

  /*
    Supabase ayarlı değilse createClient fırlatıyor ve giriş denemesi
    çıplak bir sunucu hatasıyla bitiyordu (15.10.2026). Neden belli:
    ortam değişkeni eksik — kullanıcıya da bu yazılır, "parolanız
    hatalı" değil.
  */
  if (!supabaseAyarlari()) redirect("/login?error=yapilandirma");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  /* Hata kodu açıklamaya çevriliyor: çok deneme ya da doğrulanmamış e-posta
     "parola hatalı" değil (lib/giris-hatasi). */
  if (error) redirect(`/login?error=${girisHataAnahtari(error)}`);
  redirect("/panel");
}
