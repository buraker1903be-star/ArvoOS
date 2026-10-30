import { ImageResponse } from "next/og";
import { getLoginBrand } from "@/lib/login-branding";
import { depodakiGorselMi } from "@/lib/kurum-simgesi";
import { gorselBoyutu, ONIZLEME_BOYUTU, sigdir } from "@/lib/kurum-onizleme";

/*
  KURUMUN BAĞLANTI ÖNİZLEME GÖRSELİ (30.10.2026). Kurumun alan adında
  paylaşılan bağlantının (takip, iş durumu, giriş) önizlemesi: beyaz
  zeminde, kenar boşluklu, oranı korunmuş kurum logosu. Gerekçe
  lib/kurum-onizleme.ts'te: logonun kendisi verilince WhatsApp yatay
  logoyu kırpıyordu.

  Yalnızca kurumun KENDİ depoya yüklediği logo indiriliyor
  (depodakiGorselMi): logo adresi kurum ayarlarından geliyor ve
  sunucunun başka bir adresi indirmesi istenmez (AGENTS.md "sunucunun
  indireceği adres"). Yönlendirme izlenmiyor, tür ve boyut denetleniyor.

  Logo yoksa, WEBP ise (görsel üretici WEBP okuyamıyor) ya da depodan
  okunamazsa kart kurumun ADINI kurumun renginde yazıyor. Arvo'nun kendi
  adreslerinde ArvoOS logosuna yönlendiriliyor.
*/
export const dynamic = "force-dynamic";

const IZINLI = new Set(["image/png", "image/jpeg"]);
const EN_FAZLA = 5 * 1024 * 1024;
const KUTU = { genislik: 960, yukseklik: 360 };
const RENK = /^#[0-9a-fA-F]{6}$/;

const basliklar = {
  // Yanıt alan adına göre değişiyor: iki kurumun görseli önbellekte karışmasın.
  Vary: "Host",
  // Adres ?v= ile logo değişince değişiyor; aynı adres uzun süre önbellekte kalabilir.
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};

async function logoVerisi(adres: string): Promise<{ veri: string; genislik: number; yukseklik: number } | null> {
  try {
    const yanit = await fetch(adres, { redirect: "error", signal: AbortSignal.timeout(5000) });
    const tur = (yanit.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!yanit.ok || !IZINLI.has(tur)) return null;
    const govde = new Uint8Array(await yanit.arrayBuffer());
    if (govde.byteLength > EN_FAZLA) return null;
    const boyut = gorselBoyutu(govde);
    if (!boyut) return null;
    const { genislik, yukseklik } = sigdir(boyut, KUTU);
    return { veri: `data:${tur};base64,${Buffer.from(govde).toString("base64")}`, genislik, yukseklik };
  } catch {
    return null;
  }
}

export async function GET() {
  const marka = await getLoginBrand();
  if (!marka) return new Response(null, { status: 307, headers: { Location: "/arvoos-logo.png", "Cache-Control": "public, max-age=3600", Vary: "Host" } });

  const logo = depodakiGorselMi(marka.logo_url?.split("?")[0], process.env.NEXT_PUBLIC_SUPABASE_URL, marka.id, "logo")
    ? await logoVerisi(marka.logo_url!)
    : null;
  const renk = marka.primary_color && RENK.test(marka.primary_color) ? marka.primary_color : "#0f2742";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {logo ? (
          <img src={logo.veri} width={logo.genislik} height={logo.yukseklik} alt="" />
        ) : (
          <div style={{ display: "flex", fontSize: 88, fontWeight: 700, color: renk, padding: "0 80px", textAlign: "center" }}>{marka.name}</div>
        )}
      </div>
    ),
    { ...ONIZLEME_BOYUTU, headers: basliklar },
  );
}
