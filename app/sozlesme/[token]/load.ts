import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { contractVerificationHash, type DocumentRow } from "@/app/_components/legal/format";
import type { ContractAudit } from "@/app/_components/contract-document";
import { organizationLegalFields } from "@/app/_components/legal/organization";
import { normalizeAddenda } from "@/lib/work-plan";

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/**
 * Herkese açık sözleşme verisi. Sayfa, PDF sayfası ve metadata aynı
 * token yetkilendirmesini (get_public_crm_contract) paylaşır; istek başına
 * bir kez çalışır (React cache).
 */
export const loadPublicContract = cache(async (token: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_contract", { public_token: token });
  const base = first(data as DocumentRow | DocumentRow[] | null);
  if (error || !base) return null;
  const [auditResult, linkResult, legalResult, planResult] = await Promise.all([
    supabase.rpc("arvo_public_contract_audit", { public_token: token }),
    supabase.rpc("arvo_public_contract_links", { public_token: token }),
    supabase.rpc("arvo_public_organization_legal", { public_token: token, document_type: "contract" }),
    supabase.rpc("arvo_public_contract_plan", { public_token: token }),
  ]);
  // İş planı / ek protokoller okunamazsa (migration uygulanmadıysa) belge onlarsız açılır.
  if (planResult.error) console.error("arvo_public_contract_plan failed", { code: planResult.error.code, message: planResult.error.message });
  const plan = planResult.error ? null : (planResult.data as { work_plan?: unknown; addenda?: unknown; tracking_code?: unknown } | null);
  // Resmi/banka bilgisi okunamazsa belge alt bilgi metniyle çizilir (eski davranış).
  if (legalResult.error) console.error("arvo_public_organization_legal failed", { code: legalResult.error.code, message: legalResult.error.message });
  const row: DocumentRow = { ...base, ...organizationLegalFields(legalResult.error ? null : first(legalResult.data as DocumentRow | DocumentRow[] | null)) };
  if (auditResult.error) console.error("arvo_public_contract_audit failed", { code: auditResult.error.code, message: auditResult.error.message });
  const audit = auditResult.error ? null : (first(auditResult.data as DocumentRow | DocumentRow[] | null) as ContractAudit | null);
  const links = linkResult.error ? null : (first(linkResult.data as DocumentRow | DocumentRow[] | null) as { proposal_share_token: string | null; proposal_no: string | null } | null);
  const verificationHash = await contractVerificationHash(row);
  return { supabase, row, audit, auditAvailable: !auditResult.error, links, verificationHash, workPlan: plan?.work_plan ?? null, addenda: normalizeAddenda(plan?.addenda), trackingCode: typeof plan?.tracking_code === "string" && plan.tracking_code ? plan.tracking_code : null };
});
