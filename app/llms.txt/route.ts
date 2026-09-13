import { hostFromHeaders, servesSiteFiles } from "@/lib/site/host-rules";
import { buildLlmsTxt } from "@/lib/site/llms";

// llms.txt (llmstxt.org): yapay zekâ asistanları için site özeti.
// Yalnızca arvo-os.com'da (ve yerelde) sunulur; panel / kurum alan
// adlarında 404.
export function GET(request: Request) {
  if (!servesSiteFiles(hostFromHeaders(request.headers))) {
    return new Response("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      // Arama sonuçlarında sayfaların önüne geçmesin; LLM erişimini etkilemez.
      "X-Robots-Tag": "noindex",
    },
  });
}
