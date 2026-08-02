export type SupabaseRequestOptions = RequestInit & {
  accessToken: string;
  errorMessage: string;
};

function requiredPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} ortam değişkeni tanımlı değil.`);
  }
  return value;
}

export function getSupabasePublicConfig() {
  return {
    url: requiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""),
    publishableKey: requiredPublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

export async function supabaseRequest<T>(path: string, options: SupabaseRequestOptions): Promise<T> {
  const { url, publishableKey } = getSupabasePublicConfig();
  const { accessToken, errorMessage, headers, ...requestOptions } = options;
  const response = await fetch(`${url}${path}`, {
    ...requestOptions,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      error_description?: string;
      msg?: string;
      message?: string;
    } | null;
    throw new Error(
      error?.error_description || error?.msg || error?.message || `${errorMessage} (${response.status}).`,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
