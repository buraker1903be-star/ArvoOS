alter table public.organizations
  add column if not exists provisioning_state text not null default 'creating'
  check (provisioning_state in ('creating','inviting_owner','waiting_owner','active','suspended','archived','failed'));

create table if not exists public.provisioning_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  invitation_id uuid references public.organization_invitations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  state text not null,
  result text not null check (result in ('started','success','failed')),
  details jsonb not null default '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now()
);

alter table public.provisioning_audit_logs enable row level security;
grant select on public.provisioning_audit_logs to authenticated;

drop policy if exists "founder_can_read_provisioning_audit_logs" on public.provisioning_audit_logs;
create policy "founder_can_read_provisioning_audit_logs"
on public.provisioning_audit_logs for select to authenticated
using ((select private.is_arvoos_founder()));

create or replace function public.seed_organization_demo_data(
  p_organization_id uuid,
  p_seed_crm boolean default false,
  p_seed_operations boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  crm_count integer := 0;
  operation_count integer := 0;
begin
  if not (select private.is_arvoos_founder()) then raise exception 'Founder authorization required'; end if;

  if p_seed_crm then
    insert into public.crm_requests (organization_id,title,customer_name,email,status,estimated_value,notes,created_by)
    values
      (p_organization_id,'Kurumsal tanıtım talebi','Demo Müşteri A','demo-a@example.com','new',25000,'ArvoOS demo kaydı',actor_id),
      (p_organization_id,'Süreç danışmanlığı','Demo Müşteri B','demo-b@example.com','qualified',45000,'ArvoOS demo kaydı',actor_id);
    get diagnostics crm_count = row_count;
  end if;

  if p_seed_operations then
    insert into public.operation_workflows (organization_id,title,customer_name,description,status,priority,start_date,due_date,created_by)
    values
      (p_organization_id,'Yeni müşteri onboarding','Demo Müşteri A','Örnek operasyon akışı','planned','high',current_date,current_date + 14,actor_id),
      (p_organization_id,'Aylık hizmet teslimi','Demo Müşteri B','Örnek periyodik iş akışı','in_progress','normal',current_date,current_date + 30,actor_id);
    get diagnostics operation_count = row_count;
  end if;

  return jsonb_build_object('crm',crm_count,'operations',operation_count);
end;
$$;

revoke all on function public.seed_organization_demo_data(uuid,boolean,boolean) from public;
revoke all on function public.seed_organization_demo_data(uuid,boolean,boolean) from anon;
grant execute on function public.seed_organization_demo_data(uuid,boolean,boolean) to authenticated;

create or replace function private.activate_organization_owner_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid; invitation public.organization_invitations%rowtype;
begin
  if new.email_confirmed_at is null or old.email_confirmed_at is not null then return new; end if;
  invitation_id := nullif(new.raw_user_meta_data ->> 'arvoos_invitation_id', '')::uuid;
  if invitation_id is null then return new; end if;
  select * into invitation from public.organization_invitations
  where id = invitation_id and lower(email) = lower(new.email) and status in ('pending','sent') and expires_at > now()
  for update;
  if not found then return new; end if;
  insert into public.profiles (id, full_name, updated_at)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), now())
  on conflict (id) do update set updated_at = excluded.updated_at;
  insert into public.organization_memberships (organization_id, user_id, role, is_active)
  values (invitation.organization_id, new.id, invitation.role, true)
  on conflict (organization_id, user_id) do update set role = excluded.role, is_active = true;
  update public.organization_invitations set status='accepted',auth_user_id=new.id,accepted_at=now(),updated_at=now(),error_message=null where id=invitation.id;
  update public.organizations set provisioning_state='active',status='active',updated_at=now() where id=invitation.organization_id;
  insert into public.provisioning_audit_logs (organization_id,invitation_id,actor_user_id,action,state,result,details)
  values (invitation.organization_id,invitation.id,new.id,'owner_accepted','active','success',jsonb_build_object('email',new.email));
  return new;
end;
$$;