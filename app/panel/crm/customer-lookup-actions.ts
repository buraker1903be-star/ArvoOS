"use server";

import { getPanelContext } from "@/lib/panel-context";
import { isCustomerKey, parseLookupQuery } from "./customer-history-keys";
import { assertCrmAccess, loadCustomerHistoryByKey, type CustomerHistoryResult } from "./customer-history-query";
import { searchCustomers, type CustomerLookupSummary } from "./customer-lookup-query";

/**
 * "Müşteri sorgula" penceresinin sunucu işlemleri. Arama metni POST
 * gövdesinde gider (URL'ye kişisel veri yazılmaz). Yetki: CRM modülüne
 * erişen her kullanıcı (satış personeli dahil); veritabanı fonksiyonları
 * aynı kuralı ayrıca uygular.
 */

export type CustomerLookupSearchResponse =
  | { ok: true; customers: CustomerLookupSummary[]; fullHistory: boolean }
  | { ok: false; message: string };

export type CustomerLookupHistoryResponse =
  | { ok: true; result: CustomerHistoryResult | null }
  | { ok: false; message: string };

const isControlFlowSignal = (error: unknown) =>
  Boolean(error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string");

const errorMessage = (error: unknown) =>
  error instanceof Error && /erişim|yetki/i.test(error.message) ? error.message : "Arama şu an yapılamadı. Lütfen tekrar deneyin.";

export async function searchCustomerLookup(input: string): Promise<CustomerLookupSearchResponse> {
  const raw = typeof input === "string" ? input.slice(0, 120) : "";
  const query = parseLookupQuery(raw);
  if (!query || query.mode === "short") return { ok: true, customers: [], fullHistory: true };
  try {
    const context = await getPanelContext();
    assertCrmAccess(context);
    const { customers, fullHistory } = await searchCustomers(context, query, raw);
    return { ok: true, customers, fullHistory };
  } catch (error) {
    if (isControlFlowSignal(error)) throw error; // oturum düştüyse girişe yönlendirme
    console.error("[customer-lookup.search]", error);
    return { ok: false, message: errorMessage(error) };
  }
}

export async function loadCustomerLookupHistory(customerKey: string): Promise<CustomerLookupHistoryResponse> {
  if (!isCustomerKey(customerKey)) return { ok: false, message: "Müşteri bulunamadı." };
  try {
    const context = await getPanelContext();
    assertCrmAccess(context);
    return { ok: true, result: await loadCustomerHistoryByKey(context, customerKey) };
  } catch (error) {
    if (isControlFlowSignal(error)) throw error;
    console.error("[customer-lookup.history]", error);
    return { ok: false, message: errorMessage(error).replace("Arama", "Geçmiş") };
  }
}
