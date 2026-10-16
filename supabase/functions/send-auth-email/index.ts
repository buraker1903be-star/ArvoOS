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
  /** Tabela adı (display_name): gönderen, konu ve başlıkta bu yazılır. */
  name: string;
  /** Yasal unvan: yalnızca alt bilgideki küçük yasal satırda. */
  legalName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string | null;
};

const fallbackBrand: Brand = {
  name: "ArvoOS",
  legalName: "ArvoCulture Group Teknoloji Sanayi ve Ticaret Ltd. Şti.",
  logoUrl: "https://app.arvo-os.com/arvoos-logo.png",
  /* Panelin gece mavisi (eskiden yeşildi; panel ve belgelerle uyuşmuyordu). */
  primaryColor: "#0b1b2e",
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

/*
  BAĞLANTI DOĞRUDAN UYGULAMAYA (16.10.2026).

  Eskiden düğme Supabase'in /auth/v1/verify adresine gidiyordu. Davet
  (implicit akış) oturumu adresin #… kısmına koyup dönüyordu ve sunucuda
  çalışan /auth/callback o kısmı göremediği için davetli "bağlantı süresi
  dolmuş" ekranına düşüyordu; şifre yenileme (PKCE) ise yalnızca isteği
  yapan tarayıcıda açılabiliyordu. Ayrıca verify adresi GET'te jetonu
  harcıyor, kurumsal posta tarayıcıları bağlantıyı kullanıcıdan önce
  açınca davet tükeniyordu.

  Şimdi bağlantı uygulamanın /auth/callback adresine token_hash ve type
  ile gider; uygulama "Devam et" ekranını gösterir ve jetonu ANCAK
  orada harcar (verifyOtp — cihazdan ve akıştan bağımsız). Kural
  lib/kimlik-baglantisi.ts'in kopyası (Deno ile kod paylaşılmıyor);
  birim testi ikisinin aynı kaldığını denetliyor.

  E-posta değişikliği iki jeton taşıdığı için Supabase'in adresinde kalır.
*/
function dogrudanBaglanti(redirectTo: string | undefined | null, tokenHash: string | undefined | null, tur: string): string | null {
  if (!redirectTo || !tokenHash || !["invite", "recovery", "magiclink", "signup", "email"].includes(tur)) return null;
  let hedef: URL;
  try { hedef = new URL(redirectTo); } catch { return null; }
  if (hedef.protocol !== "https:" || hedef.pathname !== "/auth/callback") return null;
  hedef.searchParams.set("token_hash", tokenHash);
  hedef.searchParams.set("type", tur);
  return hedef.toString();
}

function confirmationUrl(payload: HookPayload) {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const tokenHash = payload.email_data.token_hash ?? "";
  const type = payload.email_data.email_action_type;
  const redirectTo = payload.email_data.redirect_to || payload.email_data.site_url ||
    "https://app.arvo-os.com/auth/callback?next=/panel";
  const dogrudan = dogrudanBaglanti(redirectTo, tokenHash, type);
  if (dogrudan) return dogrudan;
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${projectUrl}/auth/v1/verify?${params.toString()}`;
}

function copyFor(type: string, brandName: string) {
  const messages: Record<string, { subject: string; eyebrow: string; title: string; body: string; button: string }> = {
    invite: {
      subject: `${brandName} · Çalışma alanına davetiniz`,
      eyebrow: "KURUMSAL DAVET",
      title: `${brandName} ekibine hoş geldiniz`,
      body: "Hesabınızı etkinleştirmek ve kendi şifrenizi oluşturmak için aşağıdaki güvenli bağlantıyı kullanın. Bağlantı tek kullanımlıktır; süresi dolarsa yöneticinizden yeni davet isteyin.",
      button: "Daveti Kabul Et",
    },
    recovery: {
      subject: `${brandName} · Şifre yenileme bağlantınız`,
      eyebrow: "ŞİFRE YENİLEME",
      title: "Yeni şifrenizi belirleyin",
      body: "Hesabınız için bir şifre yenileme talebi aldık. Yeni şifrenizi oluşturmak için aşağıdaki güvenli bağlantıyı kullanın. Bağlantı tek kullanımlıktır ve kısa süre geçerlidir; birden çok e-posta aldıysanız yalnızca en son geleni açın.",
      button: "Şifremi Yenile",
    },
    signup: {
      subject: `${brandName} · E-posta doğrulama`,
      eyebrow: "E-POSTA DOĞRULAMA",
      title: "E-posta adresinizi doğrulayın",
      body: "Hesabınızı etkinleştirmek için aşağıdaki güvenli bağlantıyı kullanın.",
      button: "E-postamı Doğrula",
    },
    magiclink: {
      subject: `${brandName} · Güvenli giriş bağlantınız`,
      eyebrow: "GÜVENLİ GİRİŞ",
      title: "Tek kullanımlık giriş bağlantınız",
      body: "Hesabınıza güvenli biçimde giriş yapmak için aşağıdaki bağlantıyı kullanın.",
      button: "Güvenli Giriş Yap",
    },
    email_change: {
      subject: `${brandName} · E-posta değişikliği onayı`,
      eyebrow: "E-POSTA DEĞİŞİKLİĞİ",
      title: "Yeni e-posta adresinizi onaylayın",
      body: "E-posta adresi değişikliğini tamamlamak için aşağıdaki güvenli bağlantıyı kullanın.",
      button: "Değişikliği Onayla",
    },
    reauthentication: {
      subject: `${brandName} · Doğrulama kodunuz`,
      eyebrow: "GÜVENLİK DOĞRULAMASI",
      title: "Doğrulama kodunuz",
      body: "Hassas işlemi tamamlamak için aşağıdaki tek kullanımlık doğrulama kodunu kullanın.",
      button: "",
    },
  };
  return messages[type] ?? messages.magiclink;
}

/* "05074370507" → "0507 437 05 07"; tanınmayan biçim olduğu gibi kalır. */
const telefonYaz = (deger: string) => {
  const rakam = deger.replace(/\D/g, "");
  const yerel = rakam.length === 12 && rakam.startsWith("90") ? `0${rakam.slice(2)}` : rakam;
  return /^0\d{10}$/.test(yerel)
    ? `${yerel.slice(0, 4)} ${yerel.slice(4, 7)} ${yerel.slice(7, 9)} ${yerel.slice(9)}`
    : deger;
};

/*
  GÖRÜNÜM: PANELİN DİLİ (16.10.2026, "daha elit ve premium, panele
  yakışır"). Gece mavisi ve şampanya — giriş ekranı, panel ve teklif/
  sözleşme belgeleriyle aynı aile. Eskiden yeşil vurgu, emoji kilit
  rozeti ve her yerde yasal unvan vardı. Başlık serif (Georgia: her
  posta istemcisinde var), metin sistem yazısı; vurgular ince şampanya
  çizgiler. Tablo tabanlı ve satır içi stil: Outlook dahil.

  Zemin BEYAZ (16.10.2026, ikinci tur): fildişi zemin ve kalın gece
  mavisi üst çizgi panelden çok bir bülten gibi duruyordu. Panelin
  kartı gibi: beyaz zemin, ince gri çerçeve, logo kartın içinde ve
  altında ince bir çizgi; düğmenin şampanya kenarı kahverengi görünüyordu,
  kalktı. Bütün kimlik postaları (davet, yenileme, doğrulama, giriş,
  e-posta değişikliği, kod) bu tek şablondan çıkıyor.
*/
const GECE = "#0b1b2e";
const SAMPANYA = "#b28a49";
const ZEMIN = "#ffffff";
/* Kod kutusunun zemini: panelin --ivory'si. */
const FILDISI = "#f2f2f7";
/* Panelin --line'ı. */
const CIZGI = "#e3e3e8";
const YAZI = "#4a5160";
const SOLUK = "#8a8f99";
const SANS = "'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

function renderEmail(payload: HookPayload, brand: Brand) {
  const type = payload.email_data.email_action_type;
  const copy = copyFor(type, brand.name);
  const link = confirmationUrl(payload);
  const code = payload.email_data.token ?? "";
  const vurgu = brand.primaryColor;
  /* Logo yalnızca genişlikle sınırlı: width+height ikisi birden verilince
     Outlook object-fit'i tanımadığı için kare ve dikey logolar yamuluyordu. */
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" width="160" border="0" alt="${escapeHtml(brand.name)}" style="display:block;width:auto;height:auto;max-width:140px;max-height:44px;border:0;">`
    : `<p style="margin:0;font-family:${SERIF};font-size:26px;line-height:32px;color:${GECE};font-weight:700;">${escapeHtml(brand.name)}</p>`;

  const eylem = type === "reauthentication"
    ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td style="background-color:${FILDISI};border:1px solid ${CIZGI};border-radius:12px;padding:18px 30px;font-family:'Courier New',monospace;font-size:30px;line-height:36px;color:${GECE};font-weight:700;letter-spacing:8px;">${escapeHtml(code)}</td></tr></table>`
    : `<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center" bgcolor="${vurgu}" style="background-color:${vurgu};border-radius:10px;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:15px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:0.3px;">${escapeHtml(copy.button)}&nbsp;&nbsp;&rarr;</a></td></tr></table>`;

  const iletisim = [
    brand.contactEmail ? `<a href="mailto:${escapeHtml(brand.contactEmail)}" style="color:${YAZI};text-decoration:none;">${escapeHtml(brand.contactEmail)}</a>` : null,
    brand.contactPhone ? escapeHtml(telefonYaz(brand.contactPhone)) : null,
    brand.websiteUrl ? `<a href="${escapeHtml(brand.websiteUrl)}" style="color:${YAZI};text-decoration:none;">${escapeHtml(brand.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : null,
  ].filter(Boolean).join(` <span style="color:${CIZGI};">&nbsp;|&nbsp;</span> `);

  const preheader = `${copy.title} — ${copy.body}`.slice(0, 140);
  /* Yasal satır: yalnızca tabela adından farklıysa ve yalnızca en altta. */
  const yasalSatir = brand.legalName
    ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:10px;line-height:16px;color:${SOLUK};">${escapeHtml(brand.legalName)}</p>`
    : "";
  /* Arvo'nun kendi postasında "ArvoOS altyapısıyla" demek tekrar olurdu. */
  const altyapi = brand.name === fallbackBrand.name
    ? ""
    : `<p style="margin:6px 0 0;font-family:${SANS};font-size:10px;line-height:16px;color:${SOLUK};">ArvoOS altyapısıyla gönderilmiştir.</p>`;

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(copy.subject)}</title>
<!--[if mso]><style type="text/css">table,td,div,h1,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
</head><body style="margin:0;padding:0;background-color:${ZEMIN};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${ZEMIN};opacity:0;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="${ZEMIN}" style="width:100%;background-color:${ZEMIN};"><tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:560px;">
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${CIZGI};border-radius:18px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td style="padding:28px 44px 24px;border-bottom:1px solid ${CIZGI};">${logo}</td></tr>
<tr><td style="padding:34px 44px 0;">
<p style="margin:0;font-family:${SANS};font-size:11px;line-height:16px;color:${SAMPANYA};font-weight:700;letter-spacing:2.4px;text-transform:uppercase;">${escapeHtml(copy.eyebrow)}</p>
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:14px 0 0;"><tr><td width="36" height="1" bgcolor="${SAMPANYA}" style="width:36px;height:1px;line-height:1px;font-size:1px;background-color:${SAMPANYA};">&nbsp;</td></tr></table>
<h1 style="margin:20px 0 0;font-family:${SERIF};font-size:30px;line-height:38px;color:${GECE};font-weight:400;letter-spacing:-0.2px;">${escapeHtml(copy.title)}</h1>
<p style="margin:16px 0 0;font-family:${SANS};font-size:15px;line-height:26px;color:${YAZI};">${escapeHtml(copy.body)}</p>
</td></tr>
<tr><td style="padding:30px 44px 34px;">${eylem}</td></tr>
<tr><td style="padding:0 44px 36px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td style="border-top:1px solid ${CIZGI};padding-top:22px;">
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:20px;color:${SOLUK};">Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilirsiniz; hesabınızda bir şey değişmez. Bağlantıyı ya da kodu kimseyle paylaşmayın.</p>${type === "reauthentication" ? "" : `<p style="margin:14px 0 0;font-family:${SANS};font-size:11px;line-height:18px;color:${SOLUK};word-break:break-all;">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br><a href="${escapeHtml(link)}" style="color:${GECE};text-decoration:underline;">${escapeHtml(link)}</a></p>`}
</td></tr></table></td></tr>
</table></td></tr>
<tr><td align="center" style="padding:26px 12px 0;">
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${GECE};font-weight:600;letter-spacing:0.4px;">${escapeHtml(brand.name)}</p>
${iletisim ? `<p style="margin:6px 0 0;font-family:${SANS};font-size:11px;line-height:18px;color:${YAZI};">${iletisim}</p>` : ""}
${yasalSatir}${altyapi}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    copy.title,
    "",
    copy.body,
    "",
    type === "reauthentication" ? `Kod: ${code}` : link,
    "",
    "Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilirsiniz.",
    "",
    [brand.name, brand.contactEmail, brand.contactPhone ? telefonYaz(brand.contactPhone) : null, brand.websiteUrl].filter(Boolean).join(" · "),
    brand.legalName ?? "",
  ].join("\n").trim();
  return { subject: copy.subject, html, text };
}

/*
  MARKA KARARI VERİTABANINDA, ÇÜNKÜ İDDİA DOĞRULANMALI.

  Kurum kimliği kullanıcının metadata'sından geliyor: davet sırasında
  oraya yazılıyor (arvoos_organization_id). Ama `user_metadata`
  KULLANICININ KENDİ YAZABİLDİĞİ bir alan — panele girmiş biri oraya
  başka bir kurumun kimliğini yazıp "şifremi unuttum" diyebilir ve
  gelen posta o kurumun adı, logosu ve İLETİŞİM BİLGİSİYLE hazırlanır.

  Bu yüzden kimlik yalnızca bir İDDİA olarak gönderiliyor;
  arvo_kimlik_postasi_markasi iddiayı üyeliğe ya da bekleyen davete
  bakarak doğruluyor, doğrulanmazsa kullanıcının kendi kurumuna
  düşüyor. Kural ve sınırları: migration 20261011170211 ve
  tests/db/kimlik-postasi-markasi.test.mjs.
*/
async function resolveBrand(payload: HookPayload): Promise<Brand> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return fallbackBrand;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const metadata = { ...(payload.user.user_metadata ?? {}), ...(payload.user.app_metadata ?? {}) };
  const ham = String(metadata.arvoos_organization_id ?? metadata.organization_id ?? "").trim();
  /* Alan kullanıcının yazabildiği için biçimi de burada süzülüyor:
     uuid olmayan bir değer veritabanına gidince sorgu hataya düşer ve
     marka boşuna Arvo'ya geriler. */
  const claimed = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ham) ? ham : "";

  const { data, error } = await admin.rpc("arvo_kimlik_postasi_markasi", {
    p_user_id: payload.user.id,
    p_email: payload.user.email,
    p_claimed_org: claimed || null,
  });
  if (error || !data) return fallbackBrand;

  const organization = data as {
    name: string | null;
    display_name?: string | null;
    logo_url: string | null;
    primary_color: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    website_url: string | null;
  };
  /*
    TABELA ADI (16.10.2026, kurum sahibi: "her yerde şirket unvanımı
    kullanma"). Gönderen adı, konu ve başlık yasal unvanı yazıyordu
    ("ARVOCULTURE GROUP … LTD.ŞTİ. şifre yenileme bağlantınız"). Artık
    tabela adı; yasal unvan yalnızca alt bilgide. display_name işleve
    20261016071215'te eklendi — gelmezse yasal unvana düşer.
  */
  const tabela = (organization.display_name ?? "").trim();
  const yasal = (organization.name ?? "").trim();
  return {
    name: tabela || yasal || fallbackBrand.name,
    legalName: yasal && yasal !== tabela ? yasal : null,
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
      /* Gönderen adında " < > başlığı bozar ve gönderim reddedilir. */
      from: `${brand.name.replace(/["<>]/g, "").trim() || fallbackBrand.name} <noreply@arvo-os.com>`,
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
