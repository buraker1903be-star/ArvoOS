import type { Metadata } from "next";
import { kurumOnizlemesi } from "@/lib/kurum-onizleme";
import { requestOrigin } from "@/app/_components/request-origin";
import Link from "next/link";
import { getLoginBrand, loginAccentStyle } from "@/lib/login-branding";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";
import { safeNextPath } from "@/lib/safe-redirect";
import { BAGLANTI_TURLERI, type BaglantiTuru } from "@/lib/kimlik-baglantisi";
import { baglantiyiDogrula } from "./actions";
import "../../login/login.css";

/*
  BAĞLANTIYI ONAYLA (16.10.2026).

  Davet ve şifre bağlantıları buraya iner; tek kullanımlık jeton ANCAK
  "Devam et"e basılınca harcanır (./actions). Eskiden /auth/callback onu
  sayfa açılır açılmaz harcıyordu ve kurumsal posta tarayıcıları
  bağlantıyı kullanıcıdan önce açtığında kişi tıkladığında "süresi
  dolmuş" görüyordu. Bir düğme fazlası, kaybolan davetten ucuz.
*/

export async function generateMetadata(): Promise<Metadata> {
  const marka = await getLoginBrand();
  if (!marka) return { title: "Devam et", description: "Bağlantınızı onaylayın." };
  const baslik = `${marka.name} | Devam et`;
  const aciklama = `${marka.name} hesabınız için bağlantıyı onaylayın.`;
  // Davet ve şifre bağlantısı e-postayla gidiyor; önizlemede kurumun adı ve logosu görünsün (lib/kurum-onizleme).
  return { title: baslik, description: aciklama, icons: kurumSimgeleri(marka), ...kurumOnizlemesi({ kurumAdi: marka.name, logoUrl: marka.logo_url, baslik, aciklama, koken: await requestOrigin() }) };
}

const BASLIK: Record<BaglantiTuru, { ust: string; baslik: string; metin: string; dugme: string }> = {
  invite: { ust: "DAVET", baslik: "Davetinizi kabul edin", metin: "Devam ettiğinizde hesabınız etkinleşir ve kendi şifrenizi belirlersiniz.", dugme: "Daveti Kabul Et" },
  recovery: { ust: "ŞİFRE YENİLEME", baslik: "Şifrenizi yenileyin", metin: "Devam ettiğinizde yeni şifrenizi belirleyeceğiniz ekran açılır.", dugme: "Devam Et" },
  magiclink: { ust: "GÜVENLİ GİRİŞ", baslik: "Giriş bağlantınız", metin: "Devam ettiğinizde hesabınıza giriş yapılır.", dugme: "Giriş Yap" },
  signup: { ust: "E-POSTA DOĞRULAMA", baslik: "E-postanızı doğrulayın", metin: "Devam ettiğinizde e-posta adresiniz doğrulanır.", dugme: "Doğrula" },
  email: { ust: "E-POSTA DOĞRULAMA", baslik: "E-postanızı doğrulayın", metin: "Devam ettiğinizde e-posta adresiniz doğrulanır.", dugme: "Doğrula" },
};

export default async function BaglantiyiOnayla({ searchParams }: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string; tur?: string }>;
}) {
  const { token_hash: tokenHash, type, next, tur } = await searchParams;
  const marka = await getLoginBrand();
  const gecerli = Boolean(tokenHash) && BAGLANTI_TURLERI.includes(type as BaglantiTuru);
  const metin = BASLIK[(gecerli ? type : "recovery") as BaglantiTuru];

  return (
    <main className="login-shell" style={loginAccentStyle(marka?.primary_color)}>
      <section className="login-brand">
        {marka ? (marka.logo_url ? <img src={marka.logo_url} alt={marka.name} /> : <span className="login-brand-name">{marka.name}</span>) : <img src="/arvoos-logo.png" alt="ArvoOS" />}
        <div>
          <span>GÜVENLİ HESAP ERİŞİMİ</span>
          <h1>{metin.baslik}.</h1>
          <p>Güvenliğiniz için bağlantı ancak siz devam ettiğinizde kullanılır.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        {gecerli ? (
          <form action={baglantiyiDogrula} className="login-card">
            <div className="login-card-brand">
              {marka?.logo_url ? <img src={marka.logo_url} alt={marka.name} className="login-card-logo" /> : <small>{marka ? marka.name : "ARVOOS"}</small>}
            </div>
            <span>{metin.ust}</span>
            <h2>{metin.baslik}</h2>
            <p>{metin.metin}</p>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={safeNextPath(next)} />
            {tur === "yenile" ? <input type="hidden" name="tur" value="yenile" /> : null}
            <button type="submit">{metin.dugme} <b>→</b></button>
            <small>Bu işlemi siz başlatmadıysanız sayfayı kapatabilirsiniz; hesabınızda bir şey değişmez.</small>
          </form>
        ) : (
          <div className="login-card">
            <span>BAĞLANTI GEÇERSİZ</span>
            <h2>Bu bağlantı eksik</h2>
            <p>E-postadaki bağlantı tam açılmamış olabilir. Bağlantıya e-postadaki düğmeden yeniden tıklayın ya da yeni bir bağlantı isteyin.</p>
            <Link href="/auth/forgot-password">Yeni bağlantı iste</Link>
            <Link href="/login">Giriş ekranına dön</Link>
          </div>
        )}
      </section>
    </main>
  );
}
