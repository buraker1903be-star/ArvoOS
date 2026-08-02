create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.membership_role not null default 'owner',
  status text not null default 'pending' check (status in ('pending','sent','accepted','failed','expired')),
  invited_by uuid not null references auth.users(id),
  auth_user_id uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  sent_at timestamptz,
  accepted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

alter table public.organization_invitations enable row level security;
grant select on public.organization_invitations to authenticated;

drop policy if exists "founder_can_read_all_organization_invitations" on public.organization_invitations;
create policy "founder_can_read_all_organization_invitations"
on public.organization_invitations for select to authenticated
using ((select private.is_arvoos_founder()));

create or replace function public.provision_customer_organization(
  p_name text,
  p_slug text,
  p_sector text,
  p_plan_code text,
  p_owner_email text,
  p_custom_domain text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  new_invitation_id uuid;
  normalized_email text := lower(trim(p_owner_email));
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 160 then raise exception 'Invalid organization name'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid organization slug'; end if;
  if length(trim(p_sector)) < 2 or length(trim(p_sector)) > 80 then raise exception 'Invalid sector'; end if;
  if p_plan_code not in ('starter','professional','enterprise') then raise exception 'Invalid plan'; end if;
  if normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Invalid owner email'; end if;

  insert into public.organizations (name, slug, sector, status, plan_code, custom_domain)
  values (trim(p_name), p_slug, trim(p_sector), 'trial'::public.organization_status, p_plan_code::public.plan_code, nullif(trim(p_custom_domain), ''))
  returning id into new_organization_id;

  insert into public.organization_modules (organization_id, module_code, is_enabled)
  select new_organization_id, module.code,
    case
      when p_plan_code = 'enterprise' then true
      when p_plan_code = 'professional' then module.code in ('crm','operations','finance','reporting')
      else module.code in ('crm','operations')
    end
  from public.arvo_modules module
  where module.is_active = true;

  insert into public.organization_invitations (organization_id, email, role, invited_by)
  values (new_organization_id, normalized_email, 'owner', (select auth.uid()))
  returning id into new_invitation_id;

  return jsonb_build_object('organization_id', new_organization_id, 'invitation_id', new_invitation_id, 'owner_email', normalized_email);
end;
$$;

revoke all on function public.provision_customer_organization(text,text,text,text,text,text) from public;
revoke all on function public.provision_customer_organization(text,text,text,text,text,text) from anon;
grant execute on function public.provision_customer_organization(text,text,text,text,text,text) to authenticated;

create or replace function private.activate_organization_owner_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  invitation public.organization_invitations%rowtype;
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

  update public.organization_invitations
  set status = 'accepted', auth_user_id = new.id, accepted_at = now(), updated_at = now(), error_message = null
  where id = invitation.id;
  return new;
end;
$$;

revoke all on function private.activate_organization_owner_invitation() from public;
revoke all on function private.activate_organization_owner_invitation() from anon;

drop trigger if exists activate_organization_owner_invitation on auth.users;
create trigger activate_organization_owner_invitation
after update of email_confirmed_at on auth.users
for each row execute function private.activate_organization_owner_invitation();

create or replace function public.create_customer_organization(
  p_name text, p_slug text, p_sector text, p_plan_code text, p_custom_domain text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_plan_code not in ('starter','professional','enterprise') then raise exception 'Invalid plan'; end if;
  raise exception 'Use provision_customer_organization with an owner email';
end;
$$;