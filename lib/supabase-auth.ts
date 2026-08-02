import { getSupabasePublicConfig } from "@/lib/supabase-rest";

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: { id: string; email?: string };
};

type AuthError = {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

const SESSION_KEY = "arvoos.supabase.session";

function storage(remember = false) {
  if (typeof window === "undefined") return null;
  return remember ? window.localStorage : window.sessionStorage;
}

export async function signInWithPassword(email: string, password: string, remember = false) {
  const { url, publishableKey } = getSupabasePublicConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json()) as SupabaseSession | AuthError;
  if (!response.ok) {
    const error = data as AuthError;
    throw new Error(error.error_description || error.msg || error.message || "Giriş yapılamadı.");
  }

  const session = data as SupabaseSession;
  const target = storage(remember);
  const other = storage(!remember);
  other?.removeItem(SESSION_KEY);
  target?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getStoredSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY) || window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as SupabaseSession;
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      signOut();
      return null;
    }
    return session;
  } catch {
    signOut();
    return null;
  }
}

export async function signOut() {
  if (typeof window === "undefined") return;
  const session = getStoredSession();
  if (session?.access_token) {
    const { url, publishableKey } = getSupabasePublicConfig();
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    }).catch(() => undefined);
  }
  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}
