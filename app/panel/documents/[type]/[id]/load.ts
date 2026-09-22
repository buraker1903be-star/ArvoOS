import { cache } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { resolvePublicHost } from "@/lib/public-host";
import { contractVerificationHash, type DocumentRow } from "@/app/_components/legal/format";
import { ORGANIZATION_LEGAL_COLUMNS, organizationLegalFields } from "@/app/_components/legal/organization";
import type { InstallmentRecord } from "@/app/_components/legal/schedule";
import type { ContractAudit } from "@/app/_components/contract-document";
import type { ProposalDecision } from "@/app/_components/proposal-document";
import { normalizeAddenda, type ContractAddendum } from "@/lib/work-plan";

export type PanelDocument =
  | { type: "contract"; row: DocumentRow; audit: ContractAudit; auditAvailable: boolean; verificationUrl: string | null; verificationHash: string | null; number: string; workPlan: unknown; addenda: ContractAddendum[] }
  | { type: "proposal"; row: DocumentRow; decision: ProposalDecision | null; verificationUrl: string | null; number: string };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/**
 * Panel önizlemesi ve A4/PDF sayfası için ortak yükleyici. Her sorgu kurum
 * kimliğiyle sınırlıdır (RLS'e ek olarak). Yeni migration ile gelen
 * sütunlar (legal_text_version, signed_consents, response_user_agent) ayrı
 * sorgularla okunur; migration henüz uygulanmadıysa belge yine açılır.
 */
export const loadPanelDocument = cache(async (type: string, id: string): Promise<PanelDocument | null> => {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => ["documents", "crm"].includes(module.code))) throw new Error("Belge önizlemesine erişiminiz yok.");
  const organizationId = membership.organization_id;
  const organizationQuery = supabase.from("organizations").select("name,slug,logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url").eq("id", organizationId).maybeSingle();
  const hostQuery = resolvePublicHost(supabase, organizationId).catch(() => null);
  // Resmi/banka bilgileri ayrı okunur: migration uygulanmadıysa belge alt
  // bilgi metniyle (eski davranış) açılmaya devam eder.
  const legalQuery = Promise.resolve(supabase.from("organizations").select(ORGANIZATION_LEGAL_COLUMNS).eq("id", organizationId).maybeSingle())
    .then(({ data, error }) => (error ? null : (data as DocumentRow | null)), () => null);
  const organizationFields = (organization: DocumentRow, legal: DocumentRow | null) => ({
    ...organizationLegalFields(legal),
    organization_name: organization.name,
    organization_slug: organization.slug,
    organization_logo_url: organization.logo_url,
    organization_primary_color: organization.primary_color,
    organization_document_footer: organization.document_footer,
    organization_contact_email: organization.contact_email,
    organization_contact_phone: organization.contact_phone,
    organization_website_url: organization.website_url,
    organization_signature_stamp_url: organization.signature_stamp_url,
  });

  if (type === "contract") {
    const [{ data: organization, error: organizationError }, { data: contract, error: contractError }, { data: extra, error: extraError }, host, legal] = await Promise.all([
      organizationQuery,
      supabase.from("crm_contracts").select("id,contract_no,title,scope,amount,currency,payment_plan,payment_plan_type,payment_schedule,start_date,due_date,status,created_at,share_token,payment_plan_id,customer_address,customer_tax_number,customer_tax_office,signed_name,signed_at,signed_signature_data,signed_ip,signed_user_agent,contract_template_key,contract_template_version,issuer_snapshot,crm_opportunities(customer_name,contact_email,contact_phone),crm_proposals(proposal_no,payment_schedule,tax_status,tax_rate,net_amount,tax_amount,gross_amount,estimated_delivery_date)").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
      supabase.from("crm_contracts").select("legal_text_version,signed_consents").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
      hostQuery,
      legalQuery,
    ]);
    if (organizationError) throw new Error(`Kurum bilgileri okunamadı: ${organizationError.message}`);
    if (contractError) throw new Error(`Sözleşme okunamadı: ${contractError.message}`);
    if (!organization || !contract) return null;
    const customer = one(contract.crm_opportunities as DocumentRow) as DocumentRow | null;
    const proposal = one(contract.crm_proposals as DocumentRow) as DocumentRow | null;
    const { data: installments } = contract.payment_plan_id
      ? await supabase.from("payment_installments").select("installment_no,due_date,amount,status,payment_url").eq("payment_plan_id", contract.payment_plan_id).eq("organization_id", organizationId).order("installment_no", { ascending: true })
      : { data: null };
    // İş planı ve ek protokoller ayrı okunur: migration uygulanmadıysa belge onlarsız açılır.
    const [{ data: planRow, error: planError }, { data: addendaRows, error: addendaError }] = await Promise.all([
      supabase.from("crm_contracts").select("work_plan").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
      supabase.from("crm_contract_addenda").select("id,addendum_no,work_plan,payment_dates,note,status,created_at,responded_at,responder_name,responder_ip,responder_user_agent,response_note").eq("contract_id", id).eq("organization_id", organizationId).order("addendum_no", { ascending: true }),
    ]);
    // İmza anındaki künye varsa kurumun bugünkü kaydı değil o gösterilir:
    // imzalanmış sözleşme sonradan değişen unvan ya da IBAN'la çizilmemeli.
    const issuer = (contract.issuer_snapshot as DocumentRow | null) ?? legal;
    const row = {
      ...contract,
      customer_name: customer?.customer_name || "Müşteri",
      contact_phone: customer?.contact_phone || null,
      contact_email: customer?.contact_email || null,
      payment_schedule: contract.payment_schedule ?? proposal?.payment_schedule ?? [],
      ...organizationFields(organization, issuer),
    };
    const audit: ContractAudit = {
      signed_user_agent: contract.signed_user_agent,
      legal_text_version: extraError ? null : (extra as DocumentRow | null)?.legal_text_version ?? null,
      signed_consents: extraError ? null : (extra as DocumentRow | null)?.signed_consents ?? null,
      proposal_no: proposal?.proposal_no ?? null,
      tax_status: proposal?.tax_status ?? null,
      tax_rate: proposal?.tax_rate ?? null,
      net_amount: proposal?.net_amount ?? null,
      tax_amount: proposal?.tax_amount ?? null,
      gross_amount: proposal?.gross_amount ?? null,
      estimated_delivery_date: proposal?.estimated_delivery_date ?? null,
      installments: (installments as InstallmentRecord[] | null) ?? null,
    };
    return {
      type: "contract",
      row,
      audit,
      auditAvailable: !extraError,
      verificationUrl: contract.share_token && host ? `https://${host}/sozlesme/${contract.share_token}` : null,
      verificationHash: await contractVerificationHash(row),
      number: contract.contract_no,
      workPlan: planError ? null : (planRow as DocumentRow | null)?.work_plan ?? null,
      addenda: addendaError ? [] : normalizeAddenda(addendaRows),
    };
  }

  const [{ data: organization, error: organizationError }, { data: proposal, error: proposalError }, { data: extra, error: extraError }, host, legal] = await Promise.all([
    organizationQuery,
    supabase.from("crm_proposals").select("id,proposal_no,title,scope,amount,currency,payment_plan,payment_plan_type,payment_schedule,created_at,valid_until,estimated_delivery_date,net_amount,tax_amount,gross_amount,tax_rate,tax_status,status,archive_reason,revision_no,share_token,responded_at,response_ip,crm_opportunities(customer_name,contact_email,contact_phone)").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("crm_proposals").select("response_user_agent").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
    hostQuery,
    legalQuery,
  ]);
  if (organizationError) throw new Error(`Kurum bilgileri okunamadı: ${organizationError.message}`);
  if (proposalError) throw new Error(`Teklif okunamadı: ${proposalError.message}`);
  if (!organization || !proposal) return null;
  const customer = one(proposal.crm_opportunities as DocumentRow) as DocumentRow | null;
  // Kabul/ret edilen teklif 'archived' olarak saklanır (asıl durum archive_reason).
  // Karar yalnızca müşteri kendisi verdiyse gösterilir; personel dönüşümünde
  // teklif müşteri sayfasındaki gibi "onay bekliyor" görünür.
  const { data: customerDecision } = await supabase.from("crm_proposals").select("customer_responded_at").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  const reason = String(proposal.archive_reason ?? "");
  const effective = proposal.status === "archived" && ["accepted", "rejected", "expired"].includes(reason) ? reason : proposal.status;
  const customerDecided = Boolean((customerDecision as DocumentRow | null)?.customer_responded_at) || (Boolean(proposal.responded_at) && Boolean(proposal.response_ip));
  const row = {
    ...proposal,
    status: effective === "accepted" && !customerDecided ? "sent" : effective,
    customer_name: customer?.customer_name || "Müşteri",
    contact_phone: customer?.contact_phone || null,
    contact_email: customer?.contact_email || null,
    ...organizationFields(organization, legal),
  };
  const decision: ProposalDecision | null = ["accepted", "rejected"].includes(effective) && customerDecided
    ? { status: effective, responded_at: proposal.responded_at, response_ip: proposal.response_ip, response_user_agent: extraError ? null : (extra as DocumentRow | null)?.response_user_agent ?? null, contract_share_token: null, contract_no: null }
    : null;
  return {
    type: "proposal",
    row,
    decision,
    verificationUrl: proposal.share_token && host ? `https://${host}/teklif/${proposal.share_token}` : null,
    number: proposal.proposal_no,
  };
});
