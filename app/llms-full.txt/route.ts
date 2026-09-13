import { hostFromHeaders, servesSiteFiles } from "@/lib/site/host-rules";
import { buildLlmsFullTxt } from "@/lib/site/llms";

// llms-full.txt: ürünler, hizmetler ve SSS için ayrıntılı bilgi tabanı
// (İngilizce + Türkçe). Yalnızca arvo-os.com'da (ve yerelde) sunulur.
export function GET(request: Request) {
  if (!servesSiteFiles(hostFromHeaders(request.headers))) {
    return new Response("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }
  return new Response(buildLlmsFullTxt(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Robots-Tag": "noindex",
    },
  });
}
