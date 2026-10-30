import type { Metadata } from "next";
import { kurumOnizlemesi } from "@/lib/kurum-onizleme";
import { requestOrigin } from "@/app/_components/request-origin";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/panel-context";
import { supabaseAyarlari } from "@/lib/supabase/yapilandirma";
import { getLoginBrand, loginAccentStyle } from "@/lib/login-branding";
import { setInitialPassword } from "./actions";
import "../../login/login.css";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";

/*
  Sekme başlığı ve simgesi kurumun: kendi alan adında açılan bu ekran
  kurumun logosunu ve rengini zaten gösteriyordu ama sekmede hâlâ genel
  bir başlık vardı. Paylaşılan adreste genel başlık kalıyor.
*/
export async function generateMetadata(): Promise<Metadata> {
  const marka = await getLoginBrand();
  if (!marka) return { title: "Şifre Oluştur", description: "Hesabınız için yeni bir şifre belirleyin." };
  return {
    title: `${marka.name} | Şifre Oluştur`,
    description: `${marka.name} hesabınız için şifre belirleyin.`,
    // Bağlantı önizlemesi de kurumun (lib/kurum-onizleme): yoksa kökteki ArvoOS logosu çıkıyordu.
    ...kurumOnizlemesi({ kurumAdi: marka.name, logoUrl: marka.logo_url, baslik: `${marka.name} | Şifre Oluştur`, aciklama: `${marka.name} hesabınız için şifre belirleyin.`, koken: await requestOrigin(), yol: "/auth/set-password" }),
    // Sekme simgesi logo değil: yatay logo 16×16 kareye sıkışıyordu (lib/kurum-simgesi).
    icons: kurumSimgeleri(marka),
  };
}

const errorMessages: Record<string, string> = {
  short: "Şifre en az 8 karakter olmalı.",
  mismatch: "Girdiğiniz şifreler birbiriyle uyuşmuyor.",
  failed: "Şifre kaydedilemedi, lütfen tekrar deneyin.",
  ayni: "Yeni şifreniz eskisiyle aynı olamaz. Farklı bir şifre belirleyin.",
  zayif: "Bu şifre çok zayıf ya da sızdırılmış şifreler listesinde. Harf, rakam ve işaret karıştırarak daha uzun bir şifre seçin.",
  cok_deneme: "Çok fazla deneme yapıldı. Birkaç dakika bekleyip yeniden deneyin.",
  oturum: "Bağlantınızın oturumu sona erdi. “Şifremi unuttum” ile yeni bir bağlantı isteyin.",
};

type WorkspaceRow = { name: string; display_name: string | null; logo_url: string | null; brand_color?: string | null };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; tur?: string }>;
}) {
  const { error, next, tur } = await searchParams;
  const yenileme = tur === "yenile";

  // Davet ya da şifre bağlantısı açıldıysa oturum vardır. Yoksa bağlantının
  // süresi dolmuş veya kullanılmıştır; form doldurtmadan baştan söylenir.
  /*
    Supabase ayarlı değilse oturum SORULAMAZ; sayfa "bağlantı geçersiz"
    hâliyle ayakta kalır (15.10.2026). Bu ekran /panel altında değil, davet
    postasındaki bağlantıdan açılıyor — yani ara katmanın /login'e indirdiği
    yollardan biri değil, kendi başına ayakta kalması gerekiyor.
  */
  const supabase = supabaseAyarlari() ? await createClient() : null;
  const auth = supabase ? (await supabase.auth.getClaims()).data : null;
  const signedIn = Boolean(auth?.claims?.sub);
  const email = typeof auth?.claims?.email === "string" ? auth.claims.email : null;

  // Katılınan kurum: davet edilen kişi hangi ekibe girdiğini görsün.
  /*
    HANGİ KURUM (16.10.2026). Eskiden kişinin kurum listesinin İLKİ
    alınıyordu: birden çok kurumdaki biri, seçili kurumu başka olsa da
    "AkademikMerkez ekibine hoş geldiniz" görüyordu. Sıra: kurumun kendi
    alan adı → seçili çalışma alanı (çerez) → tek kurumu varsa o. Birden
    çok kurumu olup hangisi olduğu belli değilse kurum adı YAZILMAZ —
    yanlış kurumu söylemektense genel karşılama.
  */
  let organization: { name: string; logo_url: string | null; color: string | null } | null = null;
  const hostBrand = await getLoginBrand();
  if (hostBrand) organization = { name: hostBrand.name, logo_url: hostBrand.logo_url, color: hostBrand.primary_color };
  if (!organization && signedIn && supabase) {
    const { data: rows } = await supabase.rpc("get_my_workspaces");
    const satirlar = (Array.isArray(rows) ? rows : []) as (WorkspaceRow & { organization_id?: string })[];
    const secili = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    const row = satirlar.find((satir) => secili && satir.organization_id === secili) ?? (satirlar.length === 1 ? satirlar[0] : undefined);
    if (row) organization = { name: row.display_name || row.name, logo_url: row.logo_url ?? null, color: row.brand_color ?? null };
  }

  return (
    <main className="login-shell" style={loginAccentStyle(organization?.color)}>
      <section className="login-brand">
        {organization ? (
          organization.logo_url ? <img src={organization.logo_url} alt={organization.name} /> : <span className="login-brand-name">{organization.name}</span>
        ) : (
          <img src="/arvoos-logo.png" alt="ArvoOS" />
        )}
        <div>
          <span>{organization ? "KURUM PANELİ" : "ARVOOS KURUM PANELİ"}</span>
          <h1>{!signedIn ? "Bağlantınızı yenileyelim." : yenileme ? "Yeni şifrenizi belirleyin." : organization ? `${organization.name} ekibine hoş geldiniz.` : "Hesabınıza hoş geldiniz."}</h1>
          <p>{signedIn
            ? yenileme
              ? "Eski şifreniz bu adımla geçersiz olur; sonraki girişlerinizde e-posta adresiniz ve yeni şifrenizi kullanırsınız."
              : "Panelinize girmeden önce kendi şifrenizi belirleyin. Bu adım yalnızca bir kez yapılır; sonraki girişlerinizde e-posta adresiniz ve bu şifreyi kullanırsınız."
            : "Güvenliğiniz için davet ve şifre bağlantıları tek kullanımlıktır ve kısa süre içinde geçerliliğini yitirir."}</p>
        </div>
      </section>
      <section className="login-form-wrap">
        {signedIn ? (
          <form action={setInitialPassword} className="login-card">
            <div className="login-card-brand">
              {organization?.logo_url ? <img src={organization.logo_url} alt={organization.name} className="login-card-logo" /> : <small>{organization ? organization.name : "ARVOOS"}</small>}
            </div>
            <span>{yenileme ? "ŞİFRE YENİLE" : "ŞİFRE OLUŞTUR"}</span>
            <h2>{yenileme ? "Yeni şifrenizi belirleyin" : "Kendi şifrenizi belirleyin"}</h2>
            <p>En az 8 karakterli bir şifre girin, panelinize hemen geçeceksiniz.</p>
            {email ? (
              <div className="login-account">
                <small>Giriş e-postanız</small>
                <b>{email}</b>
              </div>
            ) : null}
            {error && <div className="login-error" role="alert">{errorMessages[error] ?? "Bir hata oluştu, lütfen tekrar deneyin."}</div>}
            <input type="hidden" name="next" value={next ?? "/panel"} />
            {yenileme ? <input type="hidden" name="tur" value="yenile" /> : null}
            {/* Parola yöneticileri şifreyi doğru hesapla eşleştirsin diye */}
            {email ? <input type="hidden" name="username" autoComplete="username" value={email} /> : null}
            <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="En az 8 karakter" /></label>
            <label>Şifreyi doğrula<input name="confirm_password" type="password" autoComplete="new-password" required minLength={8} placeholder="Şifreyi tekrar girin" /></label>
            <button type="submit">{yenileme ? "Yeni Şifreyi Kaydet" : "Şifreyi Kaydet ve Panele Gir"} <b>→</b></button>
          </form>
        ) : (
          <div className="login-card">
            <div className="login-card-brand">
              {organization?.logo_url ? <img src={organization.logo_url} alt={organization.name} className="login-card-logo" /> : <small>{organization ? organization.name : "ARVOOS"}</small>}
            </div>
            <span>BAĞLANTI GEÇERSİZ</span>
            <h2>Bu bağlantı artık kullanılamıyor</h2>
            <p>Davet veya şifre bağlantınızın süresi dolmuş ya da daha önce kullanılmış olabilir. E-posta adresinizle yeni bir bağlantı isteyebilir veya sizi davet eden yöneticiden yeni bir giriş bağlantısı gönderilmesini isteyebilirsiniz.</p>
            <Link href="/auth/forgot-password">Yeni bağlantı iste</Link>
            <Link href="/login">Giriş ekranına dön</Link>
          </div>
        )}
      </section>
    </main>
  );
}
