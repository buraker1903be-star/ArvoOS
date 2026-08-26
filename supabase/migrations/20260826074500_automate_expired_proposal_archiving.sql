create extension if not exists pg_cron with schema pg_catalog;

alter table public.crm_proposals
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

alter table public.crm_proposals
  drop constraint if exists crm_proposals_archive_reason_check;

alter table public.crm_proposals
  add constraint crm_proposals_archive_reason_check
  check (archive_reason is null or archive_reason in ('accepted', 'rejected', 'expired', 'superseded', 'manual'));

create or replace function public.archive_inactive_crm_proposal()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status in ('accepted', 'rejected', 'expired') then
    new.archive_reason := new.status;
    new.status := 'archived';
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status = 'sent'
    and new.valid_until is not null
    and new.valid_until < (now() at time zone 'Europe/Istanbul')::date then
    new.status := 'archived';
    new.archive_reason := 'expired';
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status = 'archived' then
    new.archive_reason := coalesce(new.archive_reason, 'manual');
    new.archived_at := coalesce(new.archived_at, now());
  else
    new.archive_reason := null;
    new.archived_at := null;
  end if;
  return new;
end;
$function$;

create or replace function public.expire_due_crm_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_count integer;
begin
  update public.crm_proposals
     set status = 'expired',
         updated_at = now()
   where status = 'sent'
     and valid_until is not null
     and valid_until < (now() at time zone 'Europe/Istanbul')::date;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$function$;

revoke all on function public.expire_due_crm_proposals() from public, anon, authenticated;
grant execute on function public.expire_due_crm_proposals() to postgres, service_role;

drop policy if exists "members read active proposals" on public.crm_proposals;
create policy "members read active proposals"
on public.crm_proposals
for select
to authenticated
using (
  public.arvo_is_member(organization_id)
  and (
    status = 'draft'
    or (status = 'sent' and (valid_until is null or valid_until >= (now() at time zone 'Europe/Istanbul')::date))
    or (status = 'archived' and archive_reason = 'expired')
  )
);

select public.expire_due_crm_proposals();

do $block$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'expire-due-crm-proposals';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'expire-due-crm-proposals',
    '5 * * * *',
    $cron$select public.expire_due_crm_proposals();$cron$
  );
end;
$block$;
