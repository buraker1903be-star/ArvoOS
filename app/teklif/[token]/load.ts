import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProposalDecision } from "@/app/_components/proposal-document";
import type { DocumentRow } from "@/app/_components/legal/format";

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/**
 * Herkese açık teklif verisi; sayfa, PDF sayfası ve metadata aynı token
 * yetkilendirmesini paylaşır. get_public_crm_proposal'ın canlı tanımı
 * repodakinden ayrışmış olabileceği için belgede gereken tarih/plan
 * alanları karar fonksiyonundan tamamlanır.
 */
export const loadPublicProposal = cache(async (token: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_proposal", { public_token: token });
  const row = first(data as DocumentRow | DocumentRow[] | null);
  if (error || !row) return null;
  const { data: decisionRows } = await supabase.rpc("arvo_public_proposal_decision", { public_token: token });
  const decision = first(decisionRows as DocumentRow | DocumentRow[] | null) as (ProposalDecision & DocumentRow) | null;
  const merged: DocumentRow = {
    ...row,
    created_at: row.created_at ?? decision?.proposal_created_at ?? null,
    estimated_delivery_date: row.estimated_delivery_date ?? decision?.estimated_delivery_date ?? null,
    tax_rate: row.tax_rate ?? decision?.tax_rate ?? null,
    payment_plan_type: row.payment_plan_type ?? decision?.payment_plan_type ?? null,
    payment_schedule: row.payment_schedule ?? decision?.payment_schedule ?? null,
  };
  return { supabase, row: merged, decision };
});
