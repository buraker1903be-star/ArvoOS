import type { SupabaseSession } from "@/lib/supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scgjhsyygkmntxytkjbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_S0jBPDJuvwLuHI3TzyGllQ_PVlBAslN";

export type FinanceAccount = {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  account_type: "cash" | "bank" | "pos" | "other";
  currency: string;
  opening_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceTransaction = {
  id: string;
  organization_id: string;
  account_id: string;
  customer_id: string | null;
  transaction_type: "income" | "expense";
  status: "planned" | "pending" | "completed" | "cancelled";
  category: string;
  description: string;
  amount: number;
  currency: string;
  transaction_date: string;
  due_date: string | null;
  reference_no: string | null;
  created_at: string;
  updated_at: string;
  account: { id: string; name: string; code: string } | null;
  customer: { id: string; name: string } | null;
};

type RequestOptions = RequestInit & { accessToken: string };

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `Finans isteği başarısız oldu (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getFinanceAccounts(session: SupabaseSession, organizationId: string) {
  return request<FinanceAccount[]>(`/rest/v1/finance_accounts?select=*&organization_id=eq.${organizationId}&order=name.asc`, { method: "GET", accessToken: session.access_token });
}

export function getFinanceTransactions(session: SupabaseSession, organizationId: string) {
  const select = encodeURIComponent("id,organization_id,account_id,customer_id,transaction_type,status,category,description,amount,currency,transaction_date,due_date,reference_no,created_at,updated_at,account:finance_accounts(id,name,code),customer:crm_customers(id,name)");
  return request<FinanceTransaction[]>(`/rest/v1/finance_transactions?select=${select}&organization_id=eq.${organizationId}&order=transaction_date.desc,created_at.desc`, { method: "GET", accessToken: session.access_token });
}

export function saveFinanceAccount(session: SupabaseSession, organizationId: string, account: Partial<FinanceAccount> & Pick<FinanceAccount, "name" | "code" | "account_type" | "currency" | "opening_balance" | "is_active">) {
  return request<string>("/rest/v1/rpc/save_finance_account", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({
      target_organization_id: organizationId,
      target_account_id: account.id || null,
      target_name: account.name,
      target_code: account.code,
      target_account_type: account.account_type,
      target_currency: account.currency,
      target_opening_balance: account.opening_balance,
      target_is_active: account.is_active,
    }),
  });
}

export function saveFinanceTransaction(session: SupabaseSession, organizationId: string, transaction: Partial<FinanceTransaction> & Pick<FinanceTransaction, "account_id" | "transaction_type" | "status" | "category" | "description" | "amount" | "currency" | "transaction_date">) {
  return request<string>("/rest/v1/rpc/save_finance_transaction", {
    method: "POST",
    accessToken: session.access_token,
    body: JSON.stringify({
      target_organization_id: organizationId,
      target_transaction_id: transaction.id || null,
      target_account_id: transaction.account_id,
      target_customer_id: transaction.customer_id || null,
      target_transaction_type: transaction.transaction_type,
      target_status: transaction.status,
      target_category: transaction.category,
      target_description: transaction.description,
      target_amount: transaction.amount,
      target_currency: transaction.currency,
      target_transaction_date: transaction.transaction_date,
      target_due_date: transaction.due_date || null,
      target_reference_no: transaction.reference_no || "",
    }),
  });
}