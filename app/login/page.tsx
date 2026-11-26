import type { Metadata } from "next";
import { kurumOnizlemesi } from "@/lib/kurum-onizleme";
import { requestOrigin } from "@/app/_components/request-origin";
import Link from "next/link";
import { login } from "./actions";
import { getLoginBrand, loginAccentStyle } from "@/lib/login-branding";
import "./login.css";
import "./login-konsol.css";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";
import { hatirlananEposta } from "@/lib/eposta-hatirla";
import { headers } from "next/headers";
import { hostFromHeaders, isManagementHost } from "@/lib/site/host-rules";
import { aktifDil, ceviri } from "@/lib/konsol-giris/dil-sunucu";
import type { Metin } from "@/lib/konsol-giris/dil";
import DilSecici from "./dil-secici";
import TemaSecici from "./tema-secici";
import GirisFormu from "./giris-formu";
import { OkSimgesi } from "./simgeler";

/*
  Giriş hatasının METNİ koda göre değişir. Eskiden `error` ne olursa olsun
  "E-posta adresi veya parola hatalı" yazıyordu: boş form gönderen kullanıcı
  da (error=missing) parolasının yanlış olduğunu sanıyordu. Yapılandırma
  eksikliği eklenince bu büsbütün yanıltıcı olurdu — sorun kullanıcının
  parolasında değil, sunucunun ayarında.

  Yönetim konağında aynı kodlar İKİ DİLDE (26.11.2026): giriş ekranı
  Türkçe/İngilizce ve hata metni de seçilen dilde olmalı, yoksa ekranın
  yarısı dil değiştirince geride kalırdı.
*/
const LOGIN_HATASI: Record<string, string> = {
  missing: "E-posta adresi ve parola gerekli.",
  invalid: "E-posta adresi veya parola hatalı.",
  cok_deneme: "Çok fazla giriş denemesi yapıldı. Güvenliğiniz için birkaç dakika bekleyip yeniden deneyin; parolanızdan emin değilseniz “Şifremi unuttum”u kullanın.",
  dogrulanmamis: "E-posta adresiniz henüz doğrulanmamış. Davet e-postanızdaki bağlantıyı açın ya da yöneticinizden yeni davet isteyin.",
  yapilandirma: "Giriş şu anda yapılandırılmamış: sunucuda Supabase bağlantı bilgileri tanımlı değil.",
};

const YONETIM_HATASI: Record<string, Metin> = {
  missing: { tr: "E-posta adresi ve şifre gerekli.", en: "Email address and password are required." },
  invalid: { tr: "E-posta adresi veya şifre hatalı.", en: "Incorrect email address or password." },
  cok_deneme: {
    tr: "Çok fazla giriş denemesi yapıldı. Güvenliğiniz için birkaç dakika bekleyip yeniden deneyin; şifrenizden emin değilseniz “Şifremi unuttum”u kullanın.",
    en: "Too many sign-in attempts. For your security, wait a few minutes and try again; if you are unsure of your password, use “Forgot password”.",
  },
  dogrulanmamis: {
    tr: "E-posta adresiniz henüz doğrulanmamış. Davet e-postanızdaki bağlantıyı açın ya da yöneticinizden yeni davet isteyin.",
    en: "Your email address is not verified yet. Open the link in your invitation email or ask your administrator for a new invitation.",
  },
  yapilandirma: {
    tr: "Giriş şu anda yapılandırılmamış: sunucuda Supabase bağlantı bilgileri tanımlı değil.",
    en: "Sign-in is not configured right now: the server has no Supabase connection details.",
  },
};

/*
  Sekme başlığı ve simgesi kurumun: kendi alan adında açılan bu ekran
  kurumun logosunu ve rengini zaten gösteriyordu ama sekmede hâlâ genel
  bir başlık vardı. Paylaşılan adreste genel başlık kalıyor.
*/
export async function generateMetadata(): Promise<Metadata> {
  const marka = await getLoginBrand();
  if (!marka) return { title: "Giriş", description: "ArvoOS güvenli kurum paneli girişi." };
  return {
    title: `${marka.name} | Giriş`,
    description: `${marka.name} çalışma alanına giriş.`,
    // Bağlantı önizlemesi de kurumun (lib/kurum-onizleme): yoksa kökteki ArvoOS logosu çıkıyordu.
    ...kurumOnizlemesi({ kurumAdi: marka.name, logoUrl: marka.logo_url, baslik: `${marka.name} | Giriş`, aciklama: `${marka.name} çalışma alanına giriş.`, koken: await requestOrigin(), yol: "/login" }),
    // Sekme simgesi logo değil: yatay logo 16×16 kareye sıkışıyordu (lib/kurum-simgesi).
    icons: kurumSimgeleri(marka),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  /*
    Yönetim görünümü YALNIZCA yönetim konağında: /login kiracılarla
    paylaşımlı ve kurum markasıyla açılıyor. Kiracı ekranı bu teslimde
    hiç değişmedi — ayrı bir ağaç çiziliyor, ortak CSS sınıfı yok.
  */
  const yonetim = isManagementHost(hostFromHeaders(await headers()));
  /* Hata dönüşünde e-posta yeniden yazdırılmıyor (çerezden, adresten değil). */
  const eposta = error ? await hatirlananEposta() : "";

  if (yonetim) return <YonetimGirisi error={error} eposta={eposta} />;

  const orgBrand = await getLoginBrand();
  return (
    <main className="login-shell" style={loginAccentStyle(orgBrand?.primary_color)}>
      <section className="login-brand">
        {orgBrand ? (
          orgBrand.website_url ? (
            <Link href={orgBrand.website_url} aria-label={orgBrand.name}>
              {orgBrand.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} /> : <span className="login-brand-name">{orgBrand.name}</span>}
            </Link>
          ) : orgBrand.logo_url ? (
            <img src={orgBrand.logo_url} alt={orgBrand.name} />
          ) : (
            <span className="login-brand-name">{orgBrand.name}</span>
          )
        ) : (
          <Link href="https://arvo-os.com" aria-label="ArvoOS ana sayfa">
            <img src="/arvoos-logo.png" alt="ArvoOS" />
          </Link>
        )}
        <div>
          <span>{orgBrand ? "KURUM PANELİ" : "KURUMSAL İŞLETİM SİSTEMİ"}</span>
          <h1>{orgBrand ? `${orgBrand.name} panelinize hoş geldiniz.` : "Ekibinizin tüm süreçleri, tek ve güvenli çalışma alanında."}</h1>
          <p>{orgBrand ? "Size tanımlanan kurumsal e-posta adresiyle panelinize erişin." : "Kurumunuza tanımlanan modüllere ve yetkilerinize göre kişiselleştirilmiş ArvoOS paneline erişin."}</p>
        </div>
        {!orgBrand ? <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small> : null}
      </section>
      <section className="login-form-wrap">
        <form action={login} className="login-card">
          <div className="login-card-brand">
            {orgBrand?.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} className="login-card-logo" /> : <small>{orgBrand ? orgBrand.name : "ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ."}</small>}
          </div>
          <span>GÜVENLİ PANEL GİRİŞİ</span>
          <h2>Panele hoş geldiniz</h2>
          <p>Size tanımlanan kurumsal e-posta adresiyle giriş yapın.</p>
          {error && <div className="login-error" role="alert">{LOGIN_HATASI[error] ?? LOGIN_HATASI.invalid}</div>}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" defaultValue={eposta} /></label>
          <label>Parola<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          <button type="submit">Giriş Yap <b>→</b></button>
          <Link href="/auth/forgot-password">Şifremi unuttum</Link>
          <a href="mailto:info@arvo-os.com?subject=ArvoOS%20erişim%20desteği">Erişim desteği alın</a>
          <small>Hesaplar kurum yöneticisi tarafından oluşturulur. Açık üyelik bulunmaz.</small>
        </form>
      </section>
    </main>
  );
}

/*
  YÖNETİM GİRİŞİ — ArvoLab'ın kimlik yerleşimi (canlı commit b3fab7a4,
  app/_components/kimlik/kimlik-yerlesimi.tsx). Solda lacivert marka
  alanı, sağda tek sütun form; kart, gölge, süs yok.

  DOM sırası: önce form, sonra marka alanı; marka alanı CSS'le (order)
  sola/üste alınır. Marka alanının tek etkileşimli öğesi yasal
  bağlantılar; DOM'da önde olsalar klavye kullanıcısı forma ulaşmadan
  önce onlardan geçerdi.

  Yasal satır iki kez çizilir (marka alanının dibi ve formun altı);
  yalnızca biri görünür, gizli olan `display: none` olduğu için ekran
  okuyucu tek kez okur.
*/
async function YonetimGirisi({ error, eposta }: { error?: string; eposta: string }) {
  const t = await ceviri();
  const dil = await aktifDil();
  const hata = error ? (YONETIM_HATASI[error] ?? YONETIM_HATASI.invalid) : undefined;

  const yasal = (
    <>
      <span>© {new Date().getFullYear()} ArvoCulture Group</span>
      <a href="https://arvo-os.com/gizlilik" target="_blank" rel="noreferrer">
        {t({ tr: "Gizlilik ve KVKK", en: "Privacy" })}
      </a>
      <a href="https://arvo-os.com" target="_blank" rel="noreferrer">
        arvo-os.com
      </a>
    </>
  );

  return (
    <div className="kg-kimlik">
      <div className="kg-form">
        <div className="kg-arac">
          <DilSecici dil={dil} />
          <TemaSecici dil={dil} />
        </div>
        <main className="kg-icerik">
          <div className="kg-kutu">
            <header className="kg-baslik">
              <h1>{t({ tr: "ArvoOS Yönetim'e giriş yapın", en: "Sign in to ArvoOS Management" })}</h1>
              <p>{t({ tr: "E-posta adresiniz ve şifrenizle devam edin.", en: "Continue with your email address and password." })}</p>
            </header>

            {hata ? (
              <div className="kg-bildirimler">
                <div className="kg-bildirim" data-ton="hata" role="alert">
                  {t(hata)}
                </div>
              </div>
            ) : null}

            <GirisFormu dil={dil} hataVar={Boolean(error)} eposta={eposta} />

            {/*
              Erişim desteği, ArvoLab'daki kayıt alanının GÖRSEL düzeninde:
              ince ayırıcı, başlık, tek cümle, tam genişlikte ikincil düğme
              ve altında not. ArvoOS Yönetim'de açık üyelik YOK — düğme
              kayıt değil, destek yolu.
            */}
            <section className="kg-erisim" aria-labelledby="giris-erisim-baslik">
              <h2 id="giris-erisim-baslik">{t({ tr: "Erişiminiz mi yok?", en: "No access yet?" })}</h2>
              <p>{t({ tr: "Yönetim hesapları Arvo tarafından açılır.", en: "Management accounts are created by Arvo." })}</p>
              <a className="kg-dugme kg-dugme--ikincil kg-dugme--tam" href="mailto:info@arvo-os.com?subject=ArvoOS%20Y%C3%B6netim%20eri%C5%9Fim%20deste%C4%9Fi">
                {t({ tr: "Erişim desteği alın", en: "Get access support" })}
                <OkSimgesi size={16} strokeWidth={2} />
              </a>
              <small>
                {t({
                  tr: "Açık üyelik bulunmaz. Hesabınız varsa yukarıdan giriş yapın, şifrenizi unuttuysanız sıfırlama bağlantısı isteyin.",
                  en: "There is no open sign-up. If you have an account, sign in above; if you forgot your password, request a reset link.",
                })}
              </small>
            </section>
          </div>
        </main>
        <footer className="kg-yasal kg-yasal--form">{yasal}</footer>
      </div>
      <aside className="kg-marka" aria-label="ArvoOS Yönetim">
        {/*
          Resmî logo, koyu zemin varyantı (public/arvoos-logo-koyu.png,
          scripts/logo-koyu-varyant.py): ARVO beyaz, OS marka yeşilinde.
          Beyaz plaka kalktı; dosya saydam ve doğrudan lacivert panelde.
          Kutu logonun GÖRÜNÜR oranında (5,27 : 1) ve object-fit: cover
          yalnızca saydam boşluğu kırpar — çizim ve oran değişmez.
        */}
        <img className="kg-logo" src="/arvoos-logo-koyu.png" alt="ArvoOS" width={1920} height={1080} />
        <div className="kg-marka-govde">
          <p className="kg-marka-baslik">{t({ tr: "Arvo ürünlerini tek yerden yönetin.", en: "Manage every Arvo product from one place." })}</p>
          <p className="kg-marka-metin">
            {t({
              tr: "Lisans, abonelik, tahsilat ve destek dört üründe tek konsolda.",
              en: "Licences, subscriptions, collections and support for four products in one console.",
            })}
          </p>
        </div>
        <footer className="kg-yasal kg-yasal--marka">{yasal}</footer>
      </aside>
    </div>
  );
}
