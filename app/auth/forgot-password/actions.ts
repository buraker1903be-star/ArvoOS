"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { epostayiHatirla } from "@/lib/eposta-hatirla";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  /* E-posta adrese değil kısa ömürlü çereze (lib/eposta-hatirla): eskiden her
     dönüş "?email=ad@kurum.com" taşıyordu. */
  await epostayiHatirla(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/auth/forgot-password?error=invalid");

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? "https://app.arvo-os.com";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/panel`,
  });

  if (error) {
    const code = error.code ?? "";
    if (code === "over_email_send_rate_limit") {
      redirect("/auth/forgot-password?error=rate_limit");
    }
    if (code === "hook_timeout" || error.status === 422) {
      redirect("/auth/forgot-password?error=service");
    }
    redirect("/auth/forgot-password?error=failed");
  }
  redirect("/auth/forgot-password?sent=1");
}
