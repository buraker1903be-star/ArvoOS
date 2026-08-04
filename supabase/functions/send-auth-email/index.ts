import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.7.0";

type HookPayload = {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: string;
    site_url?: string;
  };
};

type Brand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string | null;
};

const fallbackBrand: Brand = {
  name: "ArvoOS",
  logoUrl: "https://app.arvo-os.com/arvoos-logo.png",
  primaryColor: "#6e9448",
  contactEmail: "info@arvo-os.com",
  contactPhone: null,
  websiteUrl: "https://arvo-os.com",
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const safeColor = (value: string | null) =>
  value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallbackBrand.primaryColor;

function confirmationUrl(payload: HookPayload) {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const tokenHash = payload.email_data.token_hash ?? "";
  const type = payload.email_data.email_action_type;
  const redirectTo = payload.email_data.redirect_to || payload.email_data.site_url ||
    "https://app.arvo-os.com/auth/callback?next=/panel";
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${projectUrl}/auth/v1/verify?${params.toString()}`;
}

function copyFor(type: string, brandName: string) {
  const messages: Record<string, { subject: string; eyebrow: string; title: string; body: string; button: string }> = {
    invite: {
      subject: `${brandName} çalışma alanına davet edildiniz`,
      eyebrow: "KURUMSAL DAVET",
      title: `${brandName} ekibine hoş geldiniz`,
      body: "Hesabınızı etkinleştirmek ve kendi şifrenizi oluşturmak için aşağıdaki güvenli bağlantıyı kullanın.",
      button: "Daveti Kabul Et",
    },
    recovery: {
      subject: `${brandName} şifre yenileme bağlantınız`,
      eyebrow: "ŞİFRE YENİLEME",
      title: "Şifrenizi güvenle yenileyin",
      body: "Hesabınız için bir şifre yenileme talebi aldık. Yeni şifrenizi oluşturmak için aşağıdaki güvenli bağlantıyı kullanın.",
      button: "Yeni Şifre Oluştur",
    },
    signup: {
      subject: `${brandName} e-posta doğrulama`,
      eyebrow: "E-POSTA DOĞRULAMA",
      title: "E-posta adresinizi doğrulayın",
      body: "Hesabınızı etkinleştirmek için aşağıdaki güvenli bağlantıyı kullanın.",
      button: "E-postamı Doğrula",
    },
    magiclink: {
      subject: `${brandName} güvenli giriş bağlantınız`,
      eyebrow: "GÜVENLİ GİRİŞ",
      title: "Tek kullanımlık giriş bağlantınız",
      body: "Hesabınıza güvenli biçimde giriş yapmak için aşağıdaki bağlantıyı kullanın.",
      button: "Güvenli Giriş Yap",
    },
    email_change: {
      subject: `${brandName} e-posta değişikliği onayı`,
      eyebrow: "E-POSTA DEĞİŞİKLİĞİ",
      title: "Yeni e-posta adresinizi onaylayın",
      body: "E-posta adresi değişikliğini tamamlamak için aşağıdaki güvenli bağlantıyı kullanın.",
      button: "Değişikliği Onayla",
    },
    reauthentication: {
      subject: `${brandName} doğrulama kodunuz`,
      eyebrow: "GÜVENLİK DOĞRULAMASI",
      title: "Doğrulama kodunuz",
      body: "Hassas işlemi tamamlamak için aşağıdaki tek kullanımlık doğrulama kodunu kullanın.",
      button: "",
    },
  };
  return messages[type] ?? messages.magiclink;
}

function renderEmail(payload: HookPayload, brand: Brand) {
  const type = payload.email_data.email_action_type;
  const copy = copyFor(type, brand.name);
  const link = confirmationUrl(payload);
  const code = payload.email_data.token ?? "";
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" width="180" height="70" border="0" alt="${escapeHtml(brand.name)}" style="display:block;width:180px;height:70px;object-fit:contain;">`
    : `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;color:#1f2d25;font-weight:700;">${escapeHtml(brand.name)}</p>`;

  const action = type === "reauthentication"
    ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-left:auto;margin-right:auto;"><tr><td bgcolor="#f1f5ee" style="background-color:#f1f5ee;border-radius:10px;padding-top:16px;padding-right:28px;padding-bottom:16px;padding-left:28px;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;color:#253229;font-weight:700;letter-spacing:6px;">${escapeHtml(code)}</td></tr></table>`
    : `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-left:auto;margin-right:auto;"><tr><td align="center" bgcolor="${brand.primaryColor}" style="background-color:${brand.primaryColor};border-radius:10px;"><a href="${escapeHtml(link)}" style="display:inline-block;padding-top:15px;padding-right:28px;padding-bottom:15px;padding-left:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(copy.button)}</a></td></tr></table>`;

  const contactParts = [brand.contactEmail, brand.contactPhone, brand.websiteUrl]
    .filter(Boolean)
    .map((item) => escapeHtml(String(item)))
    .join(" · ");

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(copy.subject)}</title></head><body style="margin:0;padding:0;background-color:#f4f5f3;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background-color:#f4f5f3;"><tr><td align="center" style="padding-top:40px;padding-right:16px;padding-bottom:40px;padding-left:16px;"><table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e1e6df;"><tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding-top:26px;padding-right:36px;padding-bottom:22px;padding-left:36px;border-top:6px solid ${brand.primaryColor};">${logo}<p style="margin-top:14px;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${brand.primaryColor};font-weight:700;letter-spacing:1.3px;">${escapeHtml(copy.eyebrow)}</p></td></tr><tr><td style="padding-top:28px;padding-right:36px;padding-bottom:16px;padding-left:36px;border-top:1px solid #edf0eb;"><h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:29px;line-height:37px;color:#1f2d25;font-weight:700;">${escapeHtml(copy.title)}</h1><p style="margin-top:18px;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#526159;">${escapeHtml(copy.body)}</p></td></tr><tr><td align="center" style="padding-top:18px;padding-right:36px;padding-bottom:28px;padding-left:36px;">${action}</td></tr><tr><td style="padding-top:0;padding-right:36px;padding-bottom:34px;padding-left:36px;"><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#7a867f;">Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilirsiniz. Güvenliğiniz için bağlantıyı veya doğrulama kodunu kimseyle paylaşmayın.</p>${type === "reauthentication" ? "" : `<p style="margin-top:18px;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#9aa39e;word-break:break-all;">Buton çalışmazsa bağlantıyı tarayıcınıza yapıştırın:<br><a href="${escapeHtml(link)}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:${brand.primaryColor};text-decoration:underline;">${escapeHtml(link)}</a></p>`}</td></tr><tr><td bgcolor="#f8f9f7" style="background-color:#f8f9f7;padding-top:22px;padding-right:36px;padding-bottom:22px;padding-left:36px;border-top:1px solid #e7ece4;"><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#758078;">${escapeHtml(brand.name)}${contactParts ? `<br>${contactParts}` : ""}<br>Bu e-posta ArvoOS güvenli altyapısı üzerinden otomatik olarak gönderilmiştir.</p></td></tr></table></td></tr></table></body></html>`;

  const text = `${copy.title}\n\n${copy.body}\n\n${type === "reauthentication" ? `Kod: ${code}` : link}\n\n${brand.name} · ${contactParts}`;
  return { subject: copy.subject, html, text };
}

async function resolveBrand(payload: HookPayload): Promise<Brand> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return fallbackBrand;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const metadata = { ...(payload.user.user_metadata ?? {}), ...(payload.user.app_metadata ?? {}) };
  let organizationId = String(metadata.arvoos_organization_id ?? metadata.organization_id ?? "").trim();

  if (!organizationId) {
    const { data: membership } = await admin
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", payload.user.id)
      .eq("is_active", true)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    organizationId = membership?.organization_id ?? "";
  }

  if (!organizationId) return fallbackBrand;

  const { data: organization } = await admin
    .from("organizations")
    .select("name,logo_url,primary_color,contact_email,contact_phone,website_url")
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) return fallbackBrand;

  return {
    name: organization.name || fallbackBrand.name,
    logoUrl: organization.logo_url || null,
    primaryColor: safeColor(organization.primary_color),
    contactEmail: organization.contact_email || fallbackBrand.contactEmail,
    contactPhone: organization.contact_phone || null,
    websiteUrl: organization.website_url || null,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  if (!resendKey || !hookSecret) {
    return Response.json({ error: "Email hook secrets are missing." }, { status: 500 });
  }

  try {
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers);
    const verifier = new Webhook(hookSecret.replace("v1,whsec_", ""));
    const payload = verifier.verify(rawBody, headers) as HookPayload;
    const brand = await resolveBrand(payload);
    const email = renderEmail(payload, brand);
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: `${brand.name} <noreply@arvo-os.com>`,
      to: [payload.user.email],
      replyTo: brand.contactEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) throw new Error(error.message);
    return Response.json({});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email could not be sent.";
    return Response.json({ error: { message } }, { status: 401 });
  }
});
