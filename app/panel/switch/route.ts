import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/panel-context";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organization_id")?.trim();
  const destination = new URL("/panel", request.url);

  if (!organizationId) {
    destination.searchParams.set("workspace_error", "missing");
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;

  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !membership) {
    destination.searchParams.set("workspace_error", "forbidden");
    return NextResponse.redirect(destination);
  }

  destination.searchParams.set("workspace_changed", "1");
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.delete("arvo_workspace");
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
