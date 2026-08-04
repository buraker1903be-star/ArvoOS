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
  const isProtected = pathname.startsWith("/panel") || (isAppHost && pathname === "/");
  const isLogin = pathname === "/login";

  // Kendi alan adından (özel domain) gelen istekler: hangi kuruma ait
  // olduğunu bulup çalışma alanı çerezini ona göre ayarla, böylece
  // kullanıcı panele girdiğinde doğru kurumu görür.
  if (!isAppHost && host && data?.claims && (pathname.startsWith("/panel") || pathname === "/")) {
    const { data: organizationId } = await supabase.rpc("resolve_organization_by_domain", { p_domain: host });
    if (organizationId) {
      response.cookies.set(WORKSPACE_COOKIE, organizationId as string, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
  }

  if (!data?.claims && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (data?.claims && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    return NextResponse.redirect(url);
  }

  if (data?.claims && isAppHost && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    return NextResponse.redirect(url);
  }

  return response;
}
