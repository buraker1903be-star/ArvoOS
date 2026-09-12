import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { contractVerificationHash, type DocumentRow } from "@/app/_components/legal/format";
import type { ContractAudit } from "@/app/_components/contract-document";

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/**
 * Herkese açık sözleşme verisi. Sayfa, PDF sayfası ve metadata aynı
 * token yetkilendirmesini (get_public_crm_contract) paylaşır; istek başına
 * bir kez çalışır (React cache).
 */
export const loadPublicContract = cache(async (token: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_contract", { public_token: token });
  const row = first(data as DocumentRow | DocumentRow[] | null);
  if (error || !row) return null;
  const [auditResult, linkResult] = await Promise.all([
    supabase.rpc("arvo_public_contract_audit", { public_token: token }),
    supabase.rpc("arvo_public_contract_links", { public_token: token }),
  ]);
  if (auditResult.error) console.error("arvo_public_contract_audit failed", { code: auditResult.error.code, message: auditResult.error.message });
  const audit = auditResult.error ? null : (first(auditResult.data as DocumentRow | DocumentRow[] | null) as ContractAudit | null);
  const links = linkResult.error ? null : (first(linkResult.data as DocumentRow | DocumentRow[] | null) as { proposal_share_token: string | null; proposal_no: string | null } | null);
  const verificationHash = await contractVerificationHash(row);
  return { supabase, row, audit, auditAvailable: !auditResult.error, links, verificationHash };
});
