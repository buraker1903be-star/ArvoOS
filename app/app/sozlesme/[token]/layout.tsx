import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const firstIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

export default async function PublicContractLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const requestHeaders = await headers();
  const accessIp = firstIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;

  try {
    const supabase = await createClient();
    await supabase.rpc("log_public_document_access", {
      public_token: token,
      target_document_type: "contract",
      target_access_type: "public_view",
      target_ip: accessIp,
      target_user_agent: requestHeaders.get("user-agent")?.slice(0, 1000) || null,
      target_referrer: requestHeaders.get("referer")?.slice(0, 1000) || null,
      target_metadata: { source: "public_contract" },
    });
  } catch {
    // Audit logging must not prevent the contract from being displayed.
  }

  return children;
}
