import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: "Supabase function configuration is incomplete." }, { status: 500, headers: corsHeaders });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return Response.json({ error: "Authentication required." }, { status: 401, headers: corsHeaders });

  try {
    const payload = await request.json();
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

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

    const redirectBase = String(payload.redirectBase || "https://app.arvo-os.com").replace(/\/$/, "");
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(provisioned.owner_email, {
      redirectTo: `${redirectBase}/auth/callback?next=/panel`,
      data: {
        arvoos_invitation_id: provisioned.invitation_id,
        arvoos_organization_id: provisioned.organization_id,
        full_name: payload.ownerName || "Kurum Sahibi",
      },
    });

    if (inviteError) {
      await adminClient.from("organization_invitations").update({
        status: "failed",
        error_message: inviteError.message,
        updated_at: new Date().toISOString(),
      }).eq("id", provisioned.invitation_id);
      throw new Error(`Owner invitation failed: ${inviteError.message}`);
    }

    await adminClient.from("organization_invitations").update({
      status: "sent",
      auth_user_id: invited.user?.id ?? null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", provisioned.invitation_id);

    return Response.json(provisioned, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed.";
    return Response.json({ error: message }, { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
