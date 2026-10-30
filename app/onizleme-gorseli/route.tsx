import { ImageResponse } from "next/og";
import { getLoginBrand } from "@/lib/login-branding";
import { basHarf, depodakiGorselMi } from "@/lib/kurum-simgesi";
import { gorselBoyutu, ONIZLEME_BOYUTU, sigdir } from "@/lib/kurum-onizleme";

/*
  KURUMUN BAĞLANTI ÖNİZLEME GÖRSELİ (30.10.2026). Kurumun alan adında
  paylaşılan bağlantının (takip, iş durumu, giriş) önizlemesi: KARE,
  kurumun sekme simgesi gibi. Gerekçe lib/kurum-onizleme.ts'te: logonun
  kendisi verilince WhatsApp yatay logoyu kırpıyordu.

  Sıra: kurumun yüklediği sekme simgesi (Ayarlar → Kurumsal kimlik) →
  yoksa logo karenin içine sığdırılmış → o da yoksa kurumun baş harfi
  kurumun renginde. Arvo'nun kendi adreslerinde ArvoOS'un kare
  simgesine yönlendiriliyor.

  Yalnızca kurumun KENDİ depoya yüklediği dosya indiriliyor
  (depodakiGorselMi): adres kurum ayarlarından geliyor ve sunucunun
  başka bir adresi indirmesi istenmez (AGENTS.md "sunucunun indireceği
  adres"). Yönlendirme izlenmiyor, tür ve boyut denetleniyor. WEBP
  okunamıyor (görsel üretici desteklemiyor), bir sonrakine geçiliyor.
*/
export const dynamic = "force-dynamic";

const IZINLI = new Set(["image/png", "image/jpeg"]);
const EN_FAZLA = 5 * 1024 * 1024;
const RENK = /^#[0-9a-fA-F]{6}$/;

const basliklar = {
  // Yanıt alan adına göre değişiyor: iki kurumun görseli önbellekte karışmasın.
  Vary: "Host",
  // Adres ?v= ile logo değişince değişiyor; simge değişikliği en geç bir günde yansır.
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};

async function gorselVerisi(adres: string, kutu: number): Promise<{ veri: string; genislik: number; yukseklik: number } | null> {
  try {
    const yanit = await fetch(adres, { redirect: "error", signal: AbortSignal.timeout(5000) });
    const tur = (yanit.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!yanit.ok || !IZINLI.has(tur)) return null;
    const govde = new Uint8Array(await yanit.arrayBuffer());
    if (govde.byteLength > EN_FAZLA) return null;
    const boyut = gorselBoyutu(govde);
    if (!boyut) return null;
    const { genislik, yukseklik } = sigdir(boyut, { genislik: kutu, yukseklik: kutu });
    return { veri: `data:${tur};base64,${Buffer.from(govde).toString("base64")}`, genislik, yukseklik };
  } catch {
    return null;
  }
}

export async function GET() {
  const marka = await getLoginBrand();
  if (!marka) return new Response(null, { status: 307, headers: { Location: "/apple-touch-icon.png", "Cache-Control": "public, max-age=3600", Vary: "Host" } });

  const depo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  /* Simge kareyi doldurur (zaten kare); logo kenar boşluklu sığdırılır. */
  const gorsel =
    (depodakiGorselMi(marka.favicon_url?.split("?")[0], depo, marka.id, "favicon") ? await gorselVerisi(marka.favicon_url!, 600) : null)
    ?? (depodakiGorselMi(marka.logo_url?.split("?")[0], depo, marka.id, "logo") ? await gorselVerisi(marka.logo_url!, 520) : null);
  const renk = marka.primary_color && RENK.test(marka.primary_color) ? marka.primary_color : "#0f2742";

  return new ImageResponse(
    gorsel ? (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <img src={gorsel.veri} width={gorsel.genislik} height={gorsel.yukseklik} alt="" />
      </div>
    ) : (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: renk, color: "#ffffff", fontSize: 340, fontWeight: 700 }}>
        {basHarf(marka.name)}
      </div>
    ),
    { ...ONIZLEME_BOYUTU, headers: basliklar },
  );
}
