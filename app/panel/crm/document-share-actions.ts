"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import { getPanelContext } from "./sales-shared";

// Paylaşım düğmesinden (share-send-link.tsx) çağrılır: belge müşteriye
// WhatsApp/e-posta ile gönderildiği anda taslaktan çıkar. Bağlantı zaten
// var; issue_crm_*_link mevcut token'ı koruyup yalnızca durumu ve gönderim
// zamanını günceller. Zaten gönderilmiş/kapanmış belgede hiçbir şey yapmaz.
export async function markDocumentShared(kind: "proposal" | "contract", token: string) {
  const { supabase, membership, userId } = await getPanelContext();
  const isProposal = kind === "proposal";
  const { data: row } = await supabase
    .from(isProposal ? "crm_proposals" : "crm_contracts")
    .select("id,status,opportunity_id")
    .eq("organization_id", membership.organization_id)
    .eq("share_token", String(token ?? "").slice(0, 200))
    .maybeSingle();
  if (!row || row.status !== "draft") return;
  const { error } = isProposal
    ? await supabase.rpc("issue_crm_proposal_link", { target_proposal_id: row.id })
    : await supabase.rpc("issue_crm_contract_link", { target_contract_id: row.id });
  if (error) {
    console.error("markDocumentShared failed", { kind, id: row.id, error: error.message });
    return;
  }
  await logActivity(supabase, {
    organizationId: membership.organization_id,
    actorUserId: userId,
    action: "send",
    entityType: isProposal ? "crm_proposal" : "crm_contract",
    entityId: row.id,
    opportunityId: String(row.opportunity_id ?? ""),
    note: "Müşteri bağlantısı paylaşıldı",
  });
  const base = isProposal ? "/panel/crm/proposals" : "/panel/crm/contracts";
  revalidatePath(base);
  revalidatePath(`${base}/${row.id}`);
  revalidatePath("/panel/crm");
}

