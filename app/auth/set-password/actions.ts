"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/safe-redirect";

// Davetle yeni katılan kurum sahibi/yöneticisi, kurumun ilk kurulumu
// tamamlanmadıysa boş panel yerine doğrudan ilk kurulum ekranına alınır.
// Yalnızca son iki günde kabul edilmiş davetlere bakılır; şifresini
// yenileyen eski kullanıcılar etkilenmez.
async function firstRunDestination(userId: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invitation } = await admin.from("organization_invitations")
    .select("organization_id")
    .eq("auth_user_id", userId)
    .eq("status", "accepted")
    .in("role", ["owner", "admin"])
    .gte("accepted_at", since)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invitation) return null;
  const { data: onboarding } = await admin.from("organization_onboarding")
    .select("completed_at")
    .eq("organization_id", invitation.organization_id)
    .maybeSingle();
  return onboarding?.completed_at ? null : "/panel/onboarding";
}

export async function setInitialPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (password.length < 8) redirect(`/auth/set-password?error=short&next=${encodeURIComponent(next)}`);
  if (password !== confirmPassword) redirect(`/auth/set-password?error=mismatch&next=${encodeURIComponent(next)}`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login?error=invalid");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/auth/set-password?error=failed&next=${encodeURIComponent(next)}`);

  if (!next || next === "/panel") {
    const firstRun = await firstRunDestination(auth.claims.sub);
    if (firstRun) redirect(firstRun);
  }
  redirect(next || "/panel");
}
