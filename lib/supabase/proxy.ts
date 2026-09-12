import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const WORKSPACE_COOKIE = "arvo_workspace_v2";
const DEFAULT_APP_HOST = "app.arvo-os.com";

export async function updateSession(request: NextRequest) {
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
  let customDomainOrgId: string | null = null;
  if (!isAppHost && host) {
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
