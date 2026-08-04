"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setInitialPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const next = String(formData.get("next") ?? "/panel");

  if (password.length < 8) redirect(`/auth/set-password?error=short&next=${encodeURIComponent(next)}`);
  if (password !== confirmPassword) redirect(`/auth/set-password?error=mismatch&next=${encodeURIComponent(next)}`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login?error=invalid");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/auth/set-password?error=failed&next=${encodeURIComponent(next)}`);

  redirect(next || "/panel");
}
