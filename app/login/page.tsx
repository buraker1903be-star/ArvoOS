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
import { SifreAlani } from "./sifre-alani";

/*
  Giriş hatasının METNİ koda göre değişir. Eskiden `error` ne olursa olsun
  "E-posta adresi veya parola hatalı" yazıyordu: boş form gönderen kullanıcı
  da (error=missing) parolasının yanlış olduğunu sanıyordu. Yapılandırma
  eksikliği eklenince bu büsbütün yanıltıcı olurdu — sorun kullanıcının
  parolasında değil, sunucunun ayarında.
*/
const LOGIN_HATASI: Record<string, string> = {
  missing: "E-posta adresi ve parola gerekli.",
  invalid: "E-posta adresi veya parola hatalı.",
  cok_deneme: "Çok fazla giriş denemesi yapıldı. Güvenliğiniz için birkaç dakika bekleyip yeniden deneyin; parolanızdan emin değilseniz “Şifremi unuttum”u kullanın.",
  dogrulanmamis: "E-posta adresiniz henüz doğrulanmamış. Davet e-postanızdaki bağlantıyı açın ya da yöneticinizden yeni davet isteyin.",
  yapilandirma: "Giriş şu anda yapılandırılmamış: sunucuda Supabase bağlantı bilgileri tanımlı değil.",
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
    Konsol görünümü YALNIZCA yönetim konağında: /login kiracılarla
    paylaşımlı ve kurum markasıyla açılıyor. Stil yayılmasın diye
    sınıf burada veriliyor, CSS de o sınıfın altında (login-konsol.css).
  */
  const yonetim = isManagementHost(hostFromHeaders(await headers()));

  const orgBrand = await getLoginBrand();
  /* Hata dönüşünde e-posta yeniden yazdırılmıyor (çerezden, adresten değil). */
  const eposta = error ? await hatirlananEposta() : "";
  return (
    <main className={yonetim ? "login-shell konsol-giris" : "login-shell"} style={loginAccentStyle(orgBrand?.primary_color)}>
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
          <span>{yonetim ? "ARVO YÖNETİM" : orgBrand ? "KURUM PANELİ" : "KURUMSAL İŞLETİM SİSTEMİ"}</span>
          <h1>{yonetim ? "Arvo ürünlerini tek yerden yönetin." : orgBrand ? `${orgBrand.name} panelinize hoş geldiniz.` : "Ekibinizin tüm süreçleri, tek ve güvenli çalışma alanında."}</h1>
          <p>{yonetim ? "Lisans, abonelik, tahsilat ve destek dört üründe tek konsolda." : orgBrand ? "Size tanımlanan kurumsal e-posta adresiyle panelinize erişin." : "Kurumunuza tanımlanan modüllere ve yetkilerinize göre kişiselleştirilmiş ArvoOS paneline erişin."}</p>
        </div>
        {!orgBrand ? <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small> : null}
      </section>
      <section className="login-form-wrap">
        <form action={login} className="login-card" data-hata={error ? "true" : undefined}>
          <div className="login-card-brand">
            {orgBrand?.logo_url ? <img src={orgBrand.logo_url} alt={orgBrand.name} className="login-card-logo" /> : <small>{orgBrand ? orgBrand.name : "ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ."}</small>}
          </div>
          {/* "GÜVENLİ PANEL GİRİŞİ" şeridi yönetim girişinde yok: ekranın
              kendisi zaten yönetim konağında ve şerit başlıkla yarışıyordu. */}
          {yonetim ? null : <span>GÜVENLİ PANEL GİRİŞİ</span>}
          <h2>{yonetim ? "ArvoOS Yönetim'e giriş yapın" : "Panele hoş geldiniz"}</h2>
          <p>{yonetim ? "E-posta adresiniz ve şifrenizle devam edin." : "Size tanımlanan kurumsal e-posta adresiyle giriş yapın."}</p>
          {error && <div className="login-error" role="alert">{LOGIN_HATASI[error] ?? LOGIN_HATASI.invalid}</div>}
          {/* Zorunlu alan işareti ArvoLab standardı: yıldız yalnızca
              GÖRSEL, alanın zorunluluğunu required bildiriyor. */}
          <label>{yonetim ? <span className="kg-etiket">E-posta adresi<b className="kg-zorunlu" aria-hidden="true">*</b></span> : "E-posta adresi"}<input name="email" type="email" autoComplete="email" required placeholder={yonetim ? "adiniz@arvo-os.com" : "adiniz@kurum.com"} defaultValue={eposta} aria-invalid={yonetim && error ? true : undefined} /></label>
          {/* Şifre göster/gizle yalnızca yönetim girişinde: kiracı ekranının
              işaretlemesi ve davranışı aynen duruyor. */}
          {yonetim ? <SifreAlani hataVar={Boolean(error)} /> : <label>Parola<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>}
          {yonetim ? <Link className="kg-unuttum" href="/auth/forgot-password">Şifremi unuttum</Link> : null}
          <button type="submit">Giriş Yap <b>→</b></button>
          {yonetim ? null : <Link href="/auth/forgot-password">Şifremi unuttum</Link>}
          <a href="mailto:info@arvo-os.com?subject=ArvoOS%20erişim%20desteği">Erişim desteği alın</a>
          <small>Hesaplar kurum yöneticisi tarafından oluşturulur. Açık üyelik bulunmaz.</small>
        </form>
      </section>
    </main>
  );
}
