"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/panel-context";

export async function switchWorkspace(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Çalışma alanı seçilmedi.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership, error } = await supabase.from("organization_memberships")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !membership) throw new Error("Bu çalışma alanına erişim yetkiniz yok.");

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.delete("arvo_workspace");
  redirect("/panel?workspace_changed=1");
}

export async function logout() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  cookieStore.delete(WORKSPACE_COOKIE);
  cookieStore.delete("arvo_workspace");
  await supabase.auth.signOut();
  redirect("/login");
}
