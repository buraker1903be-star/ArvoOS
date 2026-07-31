import type { SupabaseSession } from "@/lib/supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scgjhsyygkmntxytkjbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S0jBPDJuvwLuHI3TzyGllQ_PVlBAslN";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: "trial" | "starter" | "professional" | "enterprise";
  is_active: boolean;
};

export type OrganizationMembership = {
  organization_id: string;
  user_id: string;
  status: "invited" | "active" | "suspended";
  organization: Organization;
  role: { id: string; name: string; code: string } | null;
};

type CoreRequestOptions = RequestInit & {
  accessToken: string;
};

async function coreRequest<T>(path: string, options: CoreRequestOptions): Promise<T> {
  const { accessToken, headers, ...requestOptions } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `ArvoOS Core isteği başarısız oldu (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getMyOrganizations(session: SupabaseSession) {
  const select = encodeURIComponent("organization_id,user_id,status,organization:organizations(id,name,slug,plan,is_active),role:roles(id,name,code)");
  const userFilter = encodeURIComponent(`eq.${session.user.id}`);
  return coreRequest<OrganizationMembership[]>(
    `/rest/v1/organization_members?select=${select}&user_id=${userFilter}&status=eq.active`,
    { method: "GET", accessToken: session.access_token },
  );
}

export async function bootstrapOrganization(session: SupabaseSession, name: string, slug: string) {
  return coreRequest<string>("/rest/v1/rpc/bootstrap_organization", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({ organization_name: name, organization_slug: slug }),
  });
}
