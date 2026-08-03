import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import "../../../crm/crm.css";

type TimelineEvent = {
  key: string;
  title: string;
  detail: string;
  at: string | null;
  status: "complete" | "current" | "pending";
  href?: string;
};

const money = (value: number, currency: string) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency,
}).format(Number(value || 0) / 100);

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR") : "—";

export default async function DocumentLifecyclePage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!['proposal', 'contract'].includes(type)) notFound();

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => ['documents', 'crm'].includes(module.code))) {
    throw new Error("Belge yaşam döngüsüne erişiminiz yok.");
  }

  let proposalId: string | null = null;
  let contractId: string | null = null;
  let opportunityId: string | null = null;

  if (type === 'proposal') {
    const { data, error } = await supabase
      .from('crm_proposals')
      .select('id,opportunity_id')
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (error) throw new Error(`Teklif okunamadı: ${error.message}`);
    if (!data) notFound();
    proposalId = data.id;
    opportunityId = data.opportunity_id;
  } else {
    const { data, error } = await supabase
      .from('crm_contracts')
      .select('id,proposal_id,opportunity_id')
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (error) throw new Error(`Sözleşme okunamadı: ${error.message}`);
    if (!data) notFound();
    contractId = data.id;
    proposalId = data.proposal_id;
    opportunityId = data.opportunity_id;
  }

  const [opportunityResult, proposalsResult, contractResult] = await Promise.all([
    supabase.from('crm_opportunities').select('id,title,customer_name,stage,estimated_value,created_at,updated_at').eq('id', opportunityId).eq('organization_id', membership.organization_id).maybeSingle(),
    supabase.from('crm_proposals').select('id,proposal_no,title,amount,currency,status,revision_no,revision_note,created_at,sent_at,first_viewed_at,responded_at,superseded_at,superseded_by').eq('opportunity_id', opportunityId).eq('organization_id', membership.organization_id).order('revision_no', { ascending: true }),
    supabase.from('crm_contracts').select('id,contract_no,title,amount,currency,status,created_at,sent_at,first_viewed_at,signed_at,signed_name,workflow_id,payment_plan_id,invoice_id').eq('opportunity_id', opportunityId).eq('organization_id', membership.organization_id).maybeSingle(),
  ]);

  if (opportunityResult.error) throw new Error(`Talep kaydı okunamadı: ${opportunityResult.error.message}`);
  if (proposalsResult.error) throw new Error(`Teklif geçmişi okunamadı: ${proposalsResult.error.message}`);
  if (contractResult.error) throw new Error(`Sözleşme kaydı okunamadı: ${contractResult.error.message}`);

  const opportunity = opportunityResult.data;
  if (!opportunity) notFound();
  const proposals = proposalsResult.data ?? [];
  const contract = contractResult.data;
  contractId = contract?.id ?? contractId;

  const [workflowResult, paymentPlanResult, invoiceResult] = await Promise.all([
    contract?.workflow_id ? supabase.from('operation_workflows').select('id,status,created_at,updated_at,start_date,due_date').eq('id', contract.workflow_id).eq('organization_id', membership.organization_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    contract?.payment_plan_id ? supabase.from('payment_plans').select('id,status,total_amount,currency,created_at,updated_at').eq('id', contract.payment_plan_id).eq('organization_id', membership.organization_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    contract?.invoice_id ? supabase.from('billing_invoices').select('id,status,total,currency,created_at,paid_at,due_at').eq('id', contract.invoice_id).eq('organization_id', membership.organization_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (workflowResult.error) throw new Error(`İş akışı okunamadı: ${workflowResult.error.message}`);
  if (paymentPlanResult.error) throw new Error(`Ödeme planı okunamadı: ${paymentPlanResult.error.message}`);
  if (invoiceResult.error) throw new Error(`Fatura kaydı okunamadı: ${invoiceResult.error.message}`);

  const workflow = workflowResult.data;
  const paymentPlan = paymentPlanResult.data;
  const invoice = invoiceResult.data;
  const latestProposal = proposals.find((proposal) => !proposal.superseded_by) ?? proposals.at(-1);
  const currentAmount = contract?.amount ?? latestProposal?.amount ?? opportunity.estimated_value ?? 0;
  const currentCurrency = contract?.currency ?? latestProposal?.currency ?? 'TRY';

  const events: TimelineEvent[] = [
    { key: 'request', title: 'Talep oluşturuldu', detail: `${opportunity.customer_name} · ${opportunity.title}`, at: opportunity.created_at, status: 'complete' },
    ...proposals.flatMap((proposal) => {
      const rows: TimelineEvent[] = [{ key: `proposal-${proposal.id}`, title: proposal.revision_no > 0 ? `Teklif revizyonu R${proposal.revision_no}` : 'İlk teklif oluşturuldu', detail: `${proposal.proposal_no} · ${money(proposal.amount, proposal.currency)}${proposal.revision_note ? ` · ${proposal.revision_note}` : ''}`, at: proposal.created_at, status: proposal.superseded_by ? 'complete' : proposal.status === 'accepted' ? 'complete' : 'current', href: `/panel/crm/proposals/${proposal.id}/revisions` }];
      if (proposal.sent_at) rows.push({ key: `proposal-sent-${proposal.id}`, title: 'Teklif müşteriye gönderildi', detail: proposal.proposal_no, at: proposal.sent_at, status: 'complete' });
      if (proposal.first_viewed_at) rows.push({ key: `proposal-view-${proposal.id}`, title: 'Teklif görüntülendi', detail: proposal.proposal_no, at: proposal.first_viewed_at, status: 'complete' });
      if (proposal.responded_at) rows.push({ key: `proposal-response-${proposal.id}`, title: proposal.status === 'accepted' ? 'Teklif kabul edildi' : 'Teklif yanıtlandı', detail: proposal.proposal_no, at: proposal.responded_at, status: 'complete' });
      return rows;
    }),
    { key: 'contract', title: contract ? 'Sözleşme oluşturuldu' : 'Sözleşme bekleniyor', detail: contract ? `${contract.contract_no} · ${money(contract.amount, contract.currency)}` : 'Teklif kabul edildiğinde otomatik oluşturulur.', at: contract?.created_at ?? null, status: contract ? 'complete' : 'pending', href: contract ? '/panel/crm/contracts' : undefined },
    { key: 'contract-sent', title: contract?.sent_at ? 'Sözleşme imzaya gönderildi' : 'İmzaya gönderim bekleniyor', detail: contract?.contract_no ?? 'Henüz sözleşme yok', at: contract?.sent_at ?? null, status: contract?.sent_at ? 'complete' : 'pending' },
    { key: 'contract-signed', title: contract?.signed_at ? 'Sözleşme elektronik olarak onaylandı' : 'Müşteri onayı bekleniyor', detail: contract?.signed_at ? `${contract.signed_name ?? 'Müşteri'} tarafından onaylandı` : 'Onay tamamlandığında iş akışı ve finans kayıtları açılır.', at: contract?.signed_at ?? null, status: contract?.signed_at ? 'complete' : contract ? 'current' : 'pending' },
    { key: 'workflow', title: workflow ? 'İş akışı oluşturuldu' : 'İş akışı bekleniyor', detail: workflow ? `Durum: ${workflow.status}` : 'Sözleşme onayından sonra otomatik oluşur.', at: workflow?.created_at ?? null, status: workflow ? (workflow.status === 'completed' ? 'complete' : 'current') : 'pending', href: workflow ? '/panel/operations' : undefined },
    { key: 'payment', title: paymentPlan ? 'Ödeme planı finans modülüne aktarıldı' : 'Ödeme planı bekleniyor', detail: paymentPlan ? `${money(paymentPlan.total_amount, paymentPlan.currency)} · ${paymentPlan.status}` : 'Sözleşme onayından sonra taksitler oluşturulur.', at: paymentPlan?.created_at ?? null, status: paymentPlan ? (paymentPlan.status === 'completed' ? 'complete' : 'current') : 'pending', href: paymentPlan ? '/panel/finance' : undefined },
    { key: 'invoice', title: invoice ? 'Taslak fatura oluşturuldu' : 'Fatura bekleniyor', detail: invoice ? `${money(invoice.total, invoice.currency)} · ${invoice.status}` : 'Finans akışında oluşturulacaktır.', at: invoice?.created_at ?? null, status: invoice ? (invoice.status === 'paid' ? 'complete' : 'current') : 'pending', href: invoice ? '/panel/billing' : undefined },
    { key: 'collection', title: invoice?.paid_at ? 'Tahsilat tamamlandı' : 'Tahsilat bekleniyor', detail: invoice?.paid_at ? `${money(invoice.total, invoice.currency)} tahsil edildi.` : 'Ödeme planındaki taksitler tamamlandığında kapanır.', at: invoice?.paid_at ?? null, status: invoice?.paid_at ? 'complete' : 'pending', href: '/panel/finance' },
  ];

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">DOKÜMANLAR / YAŞAM DÖNGÜSÜ</small><h1>{opportunity.customer_name}</h1><p>{opportunity.title} için talep, teklif, sözleşme, operasyon ve finans akışını izleyin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{opportunity.stage}</span><Link className="panel-secondary" href="/panel/documents">Belge Merkezi'ne dön</Link></div>
    </div>

    <section className="crm-metrics">
      <article><small>GÜNCEL BEDEL</small><strong>{money(currentAmount, currentCurrency)}</strong><span>Son teklif veya sözleşme</span></article>
      <article><small>TEKLİF SÜRÜMÜ</small><strong>{proposals.length}</strong><span>Toplam teklif ve revizyon</span></article>
      <article><small>SÖZLEŞME</small><strong>{contract ? contract.contract_no : '—'}</strong><span>{contract?.status ?? 'Henüz oluşmadı'}</span></article>
      <article><small>TAHSİLAT</small><strong>{invoice?.paid_at ? 'Tamamlandı' : 'Bekleniyor'}</strong><span>{invoice ? money(invoice.total, invoice.currency) : 'Finans kaydı yok'}</span></article>
    </section>

    <section className="panel-card">
      <small className="panel-kicker">BELGE ZAMAN ÇİZELGESİ</small>
      <h2>Uçtan uca süreç</h2>
      <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
        {events.map((event, index) => <article key={event.key} style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 14, alignItems: 'start', padding: '16px 0', borderBottom: index === events.length - 1 ? 0 : '1px solid #e7ece9', opacity: event.status === 'pending' ? .55 : 1 }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, display: 'grid', placeItems: 'center', fontWeight: 800, background: event.status === 'complete' ? '#e8f5ed' : event.status === 'current' ? '#fff4df' : '#f1f3f2', color: event.status === 'complete' ? '#207544' : event.status === 'current' ? '#9a5b00' : '#7c8782' }}>{event.status === 'complete' ? '✓' : event.status === 'current' ? '•' : '○'}</div>
          <div><h3 style={{ margin: 0, fontSize: 16 }}>{event.title}</h3><p style={{ margin: '6px 0 0', color: '#66736e' }}>{event.detail}</p>{event.at ? <small style={{ display: 'block', marginTop: 6, color: '#89948f' }}>{dateTime(event.at)}</small> : null}</div>
          {event.href ? <Link className="panel-secondary" href={event.href}>Aç</Link> : null}
        </article>)}
      </div>
    </section>
  </div>;
}
