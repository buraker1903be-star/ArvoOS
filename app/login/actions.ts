"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAyarlari } from "@/lib/supabase/yapilandirma";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

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

  if (error) redirect("/login?error=invalid");
  redirect("/panel");
}
