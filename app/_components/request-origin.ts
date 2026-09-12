import { headers } from "next/headers";

export const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

/** İsteğin geldiği kök adres (özel alan adı veya platform alanı). */
export async function requestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "app.arvo-os.com";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  return `${protocol}://${host}`;
}

export async function requestAudit() {
  const requestHeaders = await headers();
  return {
    ip: firstForwardedIp(requestHeaders.get("x-forwarded-for")) || requestHeaders.get("x-real-ip") || requestHeaders.get("cf-connecting-ip") || null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 1000) || null,
    referrer: requestHeaders.get("referer")?.slice(0, 1000) || null,
  };
}
