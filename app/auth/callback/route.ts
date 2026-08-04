import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/panel";
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = new URL("/auth/set-password", url.origin);
      destination.searchParams.set("next", next);
      return NextResponse.redirect(destination);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "invite" | "recovery" | "email" });
    if (!error) {
      const destination = new URL("/auth/set-password", url.origin);
      destination.searchParams.set("next", next);
      return NextResponse.redirect(destination);
    }
  }

  const failure = new URL("/login", url.origin);
  failure.searchParams.set("error", "invalid");
  return NextResponse.redirect(failure);
}
