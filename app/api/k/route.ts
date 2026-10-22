import { createClient } from "@supabase/supabase-js";
import { botMu, cihazTuru, olayiOku, sehirAdi, tarayiciAdi } from "@/lib/analitik-olay";
import { supabaseAyarlari } from "@/lib/supabase/yapilandirma";
import { firstForwardedIp } from "@/app/_components/request-origin";

/*
  ANALİTİK OLAY UCU (22.10.2026). Kurum sitelerindeki takip kodu
  (public/k.js) buraya yazar; ayrıntı lib/analitik-olay.ts ve
  20261022092820_analitik_modulu.sql.

  HER ZAMAN 204: takip kodu yanıta bakmıyor, ziyaretçinin sayfasında
  hata görünmesin; ayrıntılı bir hata da yalnızca kodu kurcalayana
  bilgi verirdi. Gerçek bir yazım hatası sunucu günlüğüne düşer.

  CORS: istek başka bir siteden (kurumun sitesi) geliyor. sendBeacon
  text/plain ile ön uçuş istemiyor; fetch yedeği için OPTIONS da
  yanıtlanıyor. Yanıt gövdesi yok, okunacak bir şey yok — bu yüzden
  herkese açık.

  OTURUM YOK: anon anahtarlı düz istemci. Yazma işlevi security definer
  ve anon'a açık; site anahtarını, alan adını ve hız sınırını kendisi
  denetliyor.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

const bos = () => new Response(null, { status: 204, headers: CORS });

export function OPTIONS() {
  return bos();
}

/* Sayfanın kendisi yazamadığı için Origin; yoksa Referer'ın konağı. */
function kaynakKonak(istek: Request): string | null {
  for (const baslik of ["origin", "referer"]) {
    const deger = istek.headers.get(baslik);
    if (!deger || deger === "null") continue;
    try {
      return new URL(deger).hostname.toLowerCase();
    } catch {
      /* sonraki başlık */
    }
  }
  return null;
}

const sayi = (deger: string | null) => {
  const n = deger === null ? NaN : Number(deger);
  return Number.isFinite(n) ? n : null;
};

export async function POST(istek: Request) {
  const ayar = supabaseAyarlari();
  if (!ayar) return bos();

  const ua = istek.headers.get("user-agent") ?? "";
  if (botMu(ua)) return bos();

  let govde: unknown;
  try {
    /* Gövde 4 KB'tan büyükse gerçek bir takip kodundan gelmiyor. */
    const metin = await istek.text();
    if (metin.length > 4096) return bos();
    govde = JSON.parse(metin);
  } catch {
    return bos();
  }
  const olay = olayiOku(govde);
  if (!olay) return bos();

  const konak = kaynakKonak(istek);
  if (!konak) return bos();

  const h = istek.headers;
  const supabase = createClient(ayar.adres, ayar.anahtar, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.rpc("analitik_olay_yaz", {
    p_anahtar: olay.siteAnahtari,
    p_kaynak_konak: konak,
    p_tur: olay.tur,
    p_yol: olay.yol,
    p_kaynak: olay.kaynak,
    p_kaynak_ham: olay.kaynakHam,
    p_kampanya: olay.kampanya,
    p_ortam: olay.ortam,
    /* Vercel'in kenar başlıkları: yerelde yok, olay konumsuz yazılır. */
    p_ulke: h.get("x-vercel-ip-country"),
    p_sehir: sehirAdi(h.get("x-vercel-ip-city")),
    p_enlem: sayi(h.get("x-vercel-ip-latitude")),
    p_boylam: sayi(h.get("x-vercel-ip-longitude")),
    p_cihaz: cihazTuru(ua, olay.genislik),
    p_tarayici: tarayiciAdi(ua),
    p_ip: firstForwardedIp(h.get("x-forwarded-for")) || h.get("x-real-ip"),
    p_ua: ua.slice(0, 400),
  });
  if (error) console.error("[analitik] olay yazılamadı", error.message);
  return bos();
}
