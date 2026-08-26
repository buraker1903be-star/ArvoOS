alter function public.create_crm_proposal_v2(uuid,text,text,bigint,text,text,text,jsonb,date,date) security invoker;
alter function public.create_crm_proposal_revision(uuid,text) security invoker;
alter function public.issue_crm_proposal_link(uuid) security invoker;
alter function public.update_crm_proposal(uuid,text,text,bigint,text,date) security invoker;
alter function public.issue_crm_contract_link(uuid) security invoker;
alter function public.update_crm_contract(uuid,text,text,bigint,text,date,date) security invoker;
