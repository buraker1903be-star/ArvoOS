"use server";

import { cookies, headers } from "next/headers";
import { getPanelContext } from "@/lib/panel-context";

const SESSION_COOKIE = "arvo_presence_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordPresence(currentPath: string) {
  const { supabase, membership, userId } = await getPanelContext();
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const now = new Date().toISOString();
  const organizationId = membership.organization_id;
  let sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  const { data: currentSession } = sessionId && UUID_PATTERN.test(sessionId)
    ? await supabase.from("user_session_logs").select("id,organization_id,logout_at").eq("id", sessionId).eq("user_id", userId).maybeSingle()
    : { data: null };

  if (!currentSession || currentSession.organization_id !== organizationId || currentSession.logout_at) {
    if (currentSession && !currentSession.logout_at) {
      await supabase.from("user_session_logs").update({ logout_at: now, last_seen_at: now, logout_reason: "workspace_switch" }).eq("id", currentSession.id).eq("user_id", userId);
    }
    sessionId = crypto.randomUUID();
    const { data: employee } = await supabase.from("hr_employees").select("id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    const { error: sessionError } = await supabase.from("user_session_logs").insert({
      id: sessionId, organization_id: organizationId, user_id: userId, employee_id: employee?.id ?? null,
      login_at: now, last_seen_at: now, ip_address: forwardedFor || requestHeaders.get("x-real-ip") || null,
      user_agent: requestHeaders.get("user-agent")?.slice(0, 500) || null,
    });
    if (sessionError) throw new Error("Oturum hareketi kaydedilemedi: " + sessionError.message);
    cookieStore.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 });
  }

  const safePath = String(currentPath || "/panel").slice(0, 300);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) || null;
  const { error: presenceError } = await supabase.from("user_presence").upsert({
    organization_id: organizationId, user_id: userId, session_id: sessionId, last_seen_at: now,
    current_path: safePath, user_agent: userAgent, updated_at: now,
  }, { onConflict: "organization_id,user_id" });
  if (presenceError) throw new Error("Çevrimiçi durumu güncellenemedi: " + presenceError.message);
  await supabase.from("user_session_logs").update({ last_seen_at: now }).eq("id", sessionId).eq("user_id", userId).is("logout_at", null);
}
