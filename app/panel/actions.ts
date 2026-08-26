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
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  const sessionId = cookieStore.get("arvo_presence_session")?.value;
  const organizationId = cookieStore.get(WORKSPACE_COOKIE)?.value;

  if (userId && sessionId) {
    const now = new Date().toISOString();
    const { data: trackedSession } = await supabase.from("user_session_logs")
      .select("organization_id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    await supabase.from("user_session_logs").update({
      logout_at: now,
      last_seen_at: now,
      logout_reason: "manual",
    }).eq("id", sessionId).eq("user_id", userId).is("logout_at", null);

    const trackedOrganizationId = trackedSession?.organization_id ?? organizationId;
    if (trackedOrganizationId) {
      await supabase.from("user_presence").update({
        last_seen_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        updated_at: now,
      }).eq("organization_id", trackedOrganizationId).eq("user_id", userId);
    }
  }

  cookieStore.delete("arvo_presence_session");
  cookieStore.delete(WORKSPACE_COOKIE);
  cookieStore.delete("arvo_workspace");
  await supabase.auth.signOut();
  redirect("/login");
}
