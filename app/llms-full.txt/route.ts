import { hostFromHeaders, servesSiteFiles } from "@/lib/site/host-rules";
import { buildLlmsFullTxt } from "@/lib/site/llms";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";

// llms-full.txt: ürünler, hizmetler ve SSS için ayrıntılı bilgi tabanı
// (İngilizce + Türkçe). Yalnızca arvo-os.com'da (ve yerelde) sunulur.
//
// Ücretler konsolda yayımlanan listeden (14.10.2026). Önbellek bir günden
// on dakikaya indi: CDN önbelleği yayımla temizlenemiyor ve yeni fiyat
// bir gün boyunca (eskimiş içerik süresiyle bir hafta) eski kalıyordu.
export async function GET(request: Request) {
  if (!servesSiteFiles(hostFromHeaders(request.headers))) {
    return new Response("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }
  return new Response(buildLlmsFullTxt(await yayimlananFiyatlar()), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
