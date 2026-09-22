import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isManagementHost, isMarketingHost, konsolaTasinanYol, managementRedirectTarget, marketingRedirectTarget, normalizeHost } from "@/lib/site/host-rules";
import { resolvePath } from "@/lib/site/routes";

// arvo-os.com'da oturum/kurum sorgusu gerektirmeyen yollar: pazarlama
// sayfaları (ROUTES) ve SEO dosyaları. Bunlar için Supabase'e gidilmez.
const SITE_FILE_PATHS = new Set(["/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"]);
function isStaticSitePath(pathname: string): boolean {
  return pathname === "/" || SITE_FILE_PATHS.has(pathname) || pathname.startsWith("/og/") || resolvePath(pathname) !== null;
}

const WORKSPACE_COOKIE = "arvo_workspace_v2";
const DEFAULT_APP_HOST = "app.arvo-os.com";

export async function updateSession(request: NextRequest) {
  // SEO: Arvo pazarlama sayfaları (lib/site/routes.ts ROUTES) yalnızca
  // arvo-os.com'da yayınlanır. app.arvo-os.com veya bir kurum alan adından
  // (ör. app.akademikmerkez.com/urunler/arvoos) istenirse yinelenen içerik
  // olmasın diye kanonik adrese 308 ile yönlendirilir. Kök yol (/), panel,
  // belge, giriş ve API yolları, GET/HEAD dışı istekler, localhost ve
  // *.vercel.app etkilenmez. Karar: lib/site/host-rules.ts (birim testli).
  const marketingTarget = marketingRedirectTarget({
    host: request.headers.get("host") ?? "",
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
  });
  if (marketingTarget) return NextResponse.redirect(marketingTarget, 308);

  // Hız: arvo-os.com pazarlama sayfalarında oturum ve kurum alan adı
  // sorgusu hiçbir şeyi değiştirmez (bu alan adı bir kuruma ait değil,
  // sayfalar korumalı değil, panel çerezleri buraya gelmez). Her ziyarette
  // iki Supabase çağrısı yapmak yerine doğrudan geçilir. Aynı alan adındaki
  // /login, /panel ve belge yolları aşağıdaki tam akıştan geçmeye devam eder.
  if (isMarketingHost(normalizeHost(request.headers.get("host"))) && isStaticSitePath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  /*
    Kurucu yönetim alan adı (yonetim.arvo-os.com): yalnızca platform
    yönetimi servis ediliyor, kök yol doğrudan oraya iniyor ve platform
    dışındaki panel yolları uygulama alan adına geri gönderiliyor.
    Karar lib/site/host-rules.ts içinde (birim testli).
  */
  const managementTarget = managementRedirectTarget({
    host: request.headers.get("host") ?? "",
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    appHost: DEFAULT_APP_HOST,
  });
  if (managementTarget) return NextResponse.redirect(managementTarget, 307);

  // Platform yönetimi uygulama panelinden kaldırıldı; eski bağlantılar
  // 404 vermek yerine konsola taşınıyor.
  const konsolAdresi = konsolaTasinanYol({
    host: request.headers.get("host") ?? "",
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  if (konsolAdresi) return NextResponse.redirect(konsolAdresi, 307);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  const isAppHost = host === DEFAULT_APP_HOST;
  const isLogin = pathname === "/login";

  // Kendi alan adından (özel domain) gelen istekler: hangi kuruma ait
  // olduğunu bulup kullanıcının o kurumun paneline düşmesini sağla. Giriş
  // yapmamış ziyaretçiler için de kurumu çözüyoruz ki kök yol (/) genel
  // ArvoOS tanıtım sayfasına değil, o kurumun markalı giriş ekranına gitsin.
  /*
    Yönetim alan adı bir kuruma ait değil; alan adı çözümlemesi her
    istekte boşuna bir RPC olurdu.
  */
  const yonetimHostu = isManagementHost(host);
  let customDomainOrgId: string | null = null;
  if (!isAppHost && !yonetimHostu && host) {
    const { data: resolvedOrgId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
    customDomainOrgId = (resolvedOrgId as string | null) ?? null;
  }

  // Çalışma alanı çerezi yalnızca alan adına giriş anında (kök yol) veya
  // hiç seçim yokken ayarlanır. Eskiden HER istekte alan adının kurumuna
  // sıfırlanıyordu: kullanıcı başka kuruma geçse bile bir sonraki istekte
  // seçim geri dönüyor, form gönderimleri yanlış kuruma kaydedilebiliyordu.
  // Kök yol çoğunlukla /panel'e yönlendirildiği için çerez, dönen yanıt
  // hangisi olursa olsun ona eklenir.
  const shouldSetWorkspace = Boolean(customDomainOrgId && data?.claims)
    && (pathname === "/" || !request.cookies.get(WORKSPACE_COOKIE)?.value);
  const withWorkspace = (result: NextResponse) => {
    if (shouldSetWorkspace && customDomainOrgId) {
      result.cookies.set(WORKSPACE_COOKIE, customDomainOrgId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
    return result;
  };

  const isCustomDomainRoot = Boolean(customDomainOrgId) && pathname === "/";
  const isProtected = pathname.startsWith("/panel") || (isAppHost && pathname === "/") || isCustomDomainRoot;

  if (!data?.claims && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (data?.claims && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    return withWorkspace(NextResponse.redirect(url));
  }

  if (data?.claims && (isAppHost || customDomainOrgId) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    return withWorkspace(NextResponse.redirect(url));
  }

  return withWorkspace(response);
}
