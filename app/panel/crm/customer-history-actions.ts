"use server";

import { getPanelContext } from "@/lib/panel-context";
import { lookupReady } from "./customer-history-keys";
import { assertCrmAccess, findCustomerHistory, type CustomerHistoryResult } from "./customer-history-query";

const isControlFlowSignal = (error: unknown) =>
  Boolean(error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string");

/**
 * Talep formunda telefon / ad soyad girilince çağrılır. Veriler POST
 * gövdesinde gider (URL'ye kişisel veri yazılmaz). Yetersiz girişte
 * (7 haneden az telefon ve 5 harften kısa ad) sorgu hiç yapılmaz.
 * Hata olursa form akışını bozmamak için sessizce boş döner.
 */
export async function lookupCustomerHistory(input: { phone?: string; name?: string }): Promise<CustomerHistoryResult | null> {
  const phone = typeof input?.phone === "string" ? input.phone.slice(0, 40) : "";
  const name = typeof input?.name === "string" ? input.name.slice(0, 180) : "";
  if (!lookupReady(phone, name)) return null;
  try {
    const context = await getPanelContext();
    assertCrmAccess(context);
    return await findCustomerHistory(context, { phone, name });
  } catch (error) {
    if (isControlFlowSignal(error)) throw error; // oturum düştüyse girişe yönlendirme
    console.error("[customer-history]", error);
    return null;
  }
}
