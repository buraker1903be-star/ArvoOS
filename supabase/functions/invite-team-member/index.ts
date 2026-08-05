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
  // Service-role client: used from here on so every step (including the
  // permission check itself) can always write its outcome to
  // organization_invitations, regardless of the caller's own RLS access.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let invitationId: string | null = null;

  async function fail(message: string, status = 400) {
    if (invitationId) {
      await adminClient.from("organization_invitations")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", invitationId);
    }
    return json({ error: message }, status);
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const organizationId = String(payload.organizationId || "");
    const email = String(payload.email || "").trim().toLowerCase();
    const role = String(payload.role || "member");
    const fullName = String(payload.fullName || "").trim();
    const employeeId = String(payload.employeeId || "").trim() || null;

    if (!organizationId) return json({ error: "organizationId zorunludur." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Geçerli bir e-posta adresi girin." }, 400);
    if (!allowedRoles.has(role)) return json({ error: "Geçersiz rol." }, 400);

    const { data: actor, error: actorError } = await userClient.auth.getUser();
    if (actorError || !actor.user) return json({ error: `Oturum doğrulanamadı: ${actorError?.message ?? "kullanıcı bulunamadı"}` }, 401);

    // Create the invitation row immediately (service-role, bypasses RLS) so
    // every subsequent failure — including the permission check below — is
    // always recorded and queryable via SQL, even if this HTTP response
    // never reaches the caller in a readable form.
    await adminClient.from("organization_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("email", email)
      .in("status", ["pending", "sent"]);

    const { data: inserted, error: insertError } = await adminClient
      .from("organization_invitations")
      .insert({ organization_id: organizationId, email, role, invited_by: actor.user.id, status: "pending" })
      .select("id")
      .single();
    if (insertError || !inserted?.id) return json({ error: `Davet kaydı oluşturulamadı: ${insertError?.message ?? "bilinmeyen hata"}` }, 400);
    invitationId = inserted.id as string;

    // Only an active owner/admin of this organization may invite new members.
    const { data: callerMembership, error: callerError } = await adminClient
      .from("organization_memberships")
      .select("role,is_active")
      .eq("organization_id", organizationId)
      .eq("user_id", actor.user.id)
      .maybeSingle();
    if (callerError) return await fail(`Yetki kontrolü başarısız: ${callerError.message}`);
    if (!callerMembership) return await fail("Bu kurumda üyeliğiniz bulunamadı.");
    if (!callerMembership.is_active) return await fail("Hesabınız bu kurumda pasif durumda.");
    if (!["owner", "admin"].includes(callerMembership.role)) return await fail(`Bu kuruma kullanıcı davet etme yetkiniz yok (rolünüz: ${callerMembership.role}).`);

    const redirectBase = String(payload.redirectBase || "https://app.arvo-os.com").replace(/\/$/, "");
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${redirectBase}/auth/callback?next=/panel`,
      data: {
        arvoos_invitation_id: invitationId,
        arvoos_organization_id: organizationId,
        arvoos_employee_id: employeeId || undefined,
        full_name: fullName || undefined,
      },
    });

    if (inviteError) {
      // Email already belongs to an existing account: link them to this
      // organization directly instead of failing the whole invite.
      const alreadyExists = /already registered|already exists|email_exists/i.test(inviteError.message || "");
      if (!alreadyExists) return await fail(`Davet e-postası gönderilemedi: ${inviteError.message}`);

      let existingUserId: string | null = null;
      let page = 1;
      while (!existingUserId && page <= 20) {
        const { data: userPage, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
        if (listError || !userPage?.users?.length) break;
        const match = userPage.users.find((candidate) => (candidate.email || "").toLowerCase() === email);
        if (match) existingUserId = match.id;
        if (userPage.users.length < 200) break;
        page += 1;
      }
      if (!existingUserId) return await fail("Bu e-posta zaten kayıtlı görünüyor ama kullanıcı bulunamadı. Lütfen Supabase Authentication panelinden kontrol edin.");

      const { error: membershipError } = await adminClient.from("organization_memberships")
        .upsert({ organization_id: organizationId, user_id: existingUserId, role, is_active: true }, { onConflict: "organization_id,user_id" });
      if (membershipError) return await fail(`Kullanıcı zaten kayıtlı, kuruma eklenemedi: ${membershipError.message}`);

      if (employeeId) {
        await adminClient.from("hr_employees").update({ user_id: existingUserId }).eq("id", employeeId).eq("organization_id", organizationId);
      }
      await adminClient.from("profiles").upsert(
        { id: existingUserId, full_name: fullName || undefined, updated_at: new Date().toISOString() },
        { onConflict: "id", ignoreDuplicates: false },
      );

      await adminClient.from("organization_invitations").update({
        status: "accepted",
        auth_user_id: existingUserId,
        sent_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", invitationId);

      return json({ invitation_id: invitationId, status: "accepted", linked_existing_user: true });
    }

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
    return await fail(message, 500);
  }
});
