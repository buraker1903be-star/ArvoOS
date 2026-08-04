"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/auth/forgot-password?error=invalid");

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? "https://app.arvo-os.com";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/panel`,
  });

  if (error) redirect("/auth/forgot-password?error=failed");
  redirect(`/auth/forgot-password?sent=1&email=${encodeURIComponent(email)}`);
}
