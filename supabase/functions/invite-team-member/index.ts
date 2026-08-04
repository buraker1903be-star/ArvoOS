import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const allowedRoles = new Set(["owner", "admin", "manager", "member"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Supabase function configuration is incomplete." }, 500);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let invitationId: string | null = null;

  try {
    const payload = await request.json();
    const organizationId = String(payload.organizationId || "");
    const email = String(payload.email || "").trim().toLowerCase();
    const role = String(payload.role || "member");
    const fullName = String(payload.fullName || "").trim();

    if (!organizationId) throw new Error("organizationId zorunludur.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Geçerli bir e-posta adresi girin.");
    if (!allowedRoles.has(role)) throw new Error("Geçersiz rol.");

    const { data: actor, error: actorError } = await userClient.auth.getUser();
    if (actorError || !actor.user) throw new Error("Oturum doğrulanamadı.");

    // Only an active owner/admin of this organization may invite new members.
    const { data: callerMembership, error: callerError } = await userClient
      .from("organization_memberships")
      .select("role,is_active")
      .eq("organization_id", organizationId)
      .eq("user_id", actor.user.id)
      .maybeSingle();
    if (callerError || !callerMembership?.is_active || !["owner", "admin"].includes(callerMembership.role)) {
      throw new Error("Bu kuruma kullanıcı davet etme yetkiniz yok.");
    }

    // Reuse (or replace) any still-pending invitation for the same email in this org.
    await userClient.from("organization_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("email", email)
      .in("status", ["pending", "sent"]);

    const { data: inserted, error: insertError } = await userClient
      .from("organization_invitations")
      .insert({ organization_id: organizationId, email, role, invited_by: actor.user.id, status: "pending" })
      .select("id")
      .single();
    if (insertError || !inserted?.id) throw new Error(insertError?.message || "Davet kaydı oluşturulamadı.");
    invitationId = inserted.id as string;

    const redirectBase = String(payload.redirectBase || "https://app.arvo-os.com").replace(/\/$/, "");
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${redirectBase}/auth/callback?next=/panel`,
      data: {
        arvoos_invitation_id: invitationId,
        arvoos_organization_id: organizationId,
        full_name: fullName || undefined,
      },
    });
    if (inviteError) throw new Error(`Davet e-postası gönderilemedi: ${inviteError.message}`);

    await adminClient.from("organization_invitations").update({
      status: "sent",
      auth_user_id: invited.user?.id ?? null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", invitationId);

    return json({ invitation_id: invitationId, status: "sent" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Davet gönderilemedi.";
    if (invitationId) {
      await adminClient.from("organization_invitations").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", invitationId);
    }
    return json({ error: message }, 400);
  }
});
