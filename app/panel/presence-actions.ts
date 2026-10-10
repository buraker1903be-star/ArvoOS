"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";

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

  // Hangi sayfada olunduğu yalnızca oturum kaydında tutulur (yönetici görür).
  // user_presence tüm ekibe açık: orada sadece son görülme var
  // (20260912180000_messages_privacy_and_features.sql).
  const safePath = String(currentPath || "/panel").slice(0, 300);
  const { error: presenceError } = await supabase.from("user_presence").upsert({
    organization_id: organizationId, user_id: userId, session_id: sessionId, last_seen_at: now, updated_at: now,
  }, { onConflict: "organization_id,user_id" });
  if (presenceError) throw new Error("Çevrimiçi durumu güncellenemedi: " + presenceError.message);
  await supabase.from("user_session_logs").update({ last_seen_at: now, current_path: safePath }).eq("id", sessionId).eq("user_id", userId).is("logout_at", null);
}

/*
  EKİBE ÇEVRİMDIŞI GÖRÜNME.

  Üst çubuktaki çevrimiçi ekip göstergesi kapatılamıyordu: panel açıkken
  herkes birbirini görüyordu ve görünmeden çalışmanın tek yolu oturumu
  kapatmaktı.

  İşaret SİLME DEĞİL: son görülme yine yazılıyor (recordPresence bu
  sütuna dokunmuyor). Kaydı hiç yazmamak, yöneticinin personel
  ekranındaki oturum geçmişini de boşaltırdı; orası bir yönetim kaydı ve
  kişinin görünürlük tercihi onu değiştirmemeli.

  Yalnızca KENDİ satırı: RLS'in presence_update_own politikası
  başkasının görünürlüğünü değiştirmeyi zaten engelliyor, burada da
  user_id sorguya yazılıyor.
*/
export async function cevrimiciGorunurlugu(formData: FormData) {
  const gizli = String(formData.get("gizli") ?? "") === "1";
  await runPanelAction(async () => {
    const { supabase, membership, userId } = await getPanelContext();
    const simdi = new Date().toISOString();

    /*
      ÖNCE GÜNCELLE, GEREKİRSE EKLE — upsert DEĞİL.

      user_presence.session_id NOT NULL ve upsert'in ON CONFLICT dalına
      hiç sıra gelmiyor: PostgreSQL eklenecek satırı önce kuruyor, oturum
      kimliği verilmediği için satır VARKEN bile "null value in column
      session_id" ile düşüyordu (10.10.2026'da canlıda). Kalp atışı
      (recordPresence) zaten her sayfa açılışında satırı yazıyor, yani
      güncelleme neredeyse her zaman yetiyor; ekleme yalnızca panelin ilk
      saniyeleri için.
    */
    const { data: guncellenen, error: guncellemeHatasi } = await supabase
      .from("user_presence")
      .update({ gizli, updated_at: simdi })
      .eq("organization_id", membership.organization_id)
      .eq("user_id", userId)
      .select("user_id");
    if (guncellemeHatasi) throw new Error("Görünürlük kaydedilemedi: " + guncellemeHatasi.message);

    if (!guncellenen?.length) {
      /* Oturum kimliği burada üretiliyor; bir sonraki kalp atışı gerçek
         oturumunkiyle değiştiriyor. */
      const { error: eklemeHatasi } = await supabase.from("user_presence").insert({
        organization_id: membership.organization_id,
        user_id: userId,
        session_id: crypto.randomUUID(),
        gizli,
        last_seen_at: simdi,
        updated_at: simdi,
      });
      if (eklemeHatasi) throw new Error("Görünürlük kaydedilemedi: " + eklemeHatasi.message);
    }
    revalidatePath("/panel", "layout");
  }, gizli ? "Ekibe çevrimdışı görünüyorsunuz" : "Ekibe çevrimiçi görünüyorsunuz");
}
