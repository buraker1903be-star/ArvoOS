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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = Date.now();
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

  let organizationId: string | null = null;
  let invitationId: string | null = null;

  try {
    const payload = await request.json();
    const { data: actor } = await userClient.auth.getUser();

    const { data: provisioned, error: provisionError } = await userClient.rpc("provision_customer_organization", {
      p_name: payload.name,
      p_slug: payload.slug,
      p_sector: payload.sector,
      p_plan_code: payload.planCode,
      p_owner_email: payload.ownerEmail,
      p_custom_domain: payload.customDomain || null,
    });
    if (provisionError || !provisioned?.organization_id || !provisioned?.invitation_id) {
      throw new Error(provisionError?.message || "Organization provisioning failed.");
    }

    organizationId = provisioned.organization_id;
    invitationId = provisioned.invitation_id;

    await adminClient.from("organizations").update({ provisioning_state: "inviting_owner" }).eq("id", organizationId);
    await adminClient.from("provisioning_audit_logs").insert({
      organization_id: organizationId,
      invitation_id: invitationId,
      actor_user_id: actor.user?.id ?? null,
      action: "provision_organization",
      state: "inviting_owner",
      result: "started",
      details: { plan: payload.planCode, owner_email: provisioned.owner_email },
    });

    if (payload.seedCrm || payload.seedOperations) {
      const { error: seedError } = await userClient.rpc("seed_organization_demo_data", {
        p_organization_id: organizationId,
        p_seed_crm: Boolean(payload.seedCrm),
        p_seed_operations: Boolean(payload.seedOperations),
      });
      if (seedError) throw new Error(`Demo data failed: ${seedError.message}`);
    }

    const redirectBase = String(payload.redirectBase || "https://app.arvo-os.com").replace(/\/$/, "");
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(provisioned.owner_email, {
      redirectTo: `${redirectBase}/auth/callback?next=/panel`,
      data: {
        arvoos_invitation_id: invitationId,
        arvoos_organization_id: organizationId,
        full_name: payload.ownerName || "Kurum Sahibi",
      },
    });
    if (inviteError) throw new Error(`Owner invitation failed: ${inviteError.message}`);

    await adminClient.from("organization_invitations").update({
      status: "sent",
      auth_user_id: invited.user?.id ?? null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", invitationId);

    await adminClient.from("organizations").update({ provisioning_state: "waiting_owner" }).eq("id", organizationId);
    await adminClient.from("provisioning_audit_logs").insert({
      organization_id: organizationId,
      invitation_id: invitationId,
      actor_user_id: actor.user?.id ?? null,
      action: "provision_organization",
      state: "waiting_owner",
      result: "success",
      duration_ms: Date.now() - startedAt,
      details: { seed_crm: Boolean(payload.seedCrm), seed_operations: Boolean(payload.seedOperations) },
    });

    return json({ ...provisioned, provisioning_state: "waiting_owner" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed.";
    if (invitationId) {
      await adminClient.from("organization_invitations").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", invitationId);
    }
    if (organizationId) {
      await adminClient.from("organizations").update({ provisioning_state: "failed" }).eq("id", organizationId);
      await adminClient.from("provisioning_audit_logs").insert({
        organization_id: organizationId,
        invitation_id: invitationId,
        action: "provision_organization",
        state: "failed",
        result: "failed",
        duration_ms: Date.now() - startedAt,
        details: { error: message },
      });
    }
    return json({ error: message }, 400);
  }
});
