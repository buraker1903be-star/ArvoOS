create or replace function public.send_management_announcement(
  p_organization_id uuid,
  p_title text,
  p_message text,
  p_target_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_membership public.organization_memberships%rowtype;
  sender_name text;
  inserted_count integer;
begin
  select membership.* into sender_membership
  from public.organization_memberships membership
  where membership.user_id = (select auth.uid())
    and membership.organization_id = p_organization_id
    and membership.is_active
    and membership.role in ('owner', 'admin', 'manager')
  order by membership.joined_at
  limit 1;

  if sender_membership.organization_id is null then raise exception 'Duyuru gönderme yetkiniz yok.'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 120 then raise exception 'Duyuru başlığı 3-120 karakter olmalı.'; end if;
  if length(trim(coalesce(p_message, ''))) not between 3 and 2000 then raise exception 'Duyuru metni 3-2000 karakter olmalı.'; end if;

  select employee.full_name into sender_name
  from public.hr_employees employee
  where employee.organization_id = sender_membership.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  if p_target_user_id is not null and not exists (
    select 1 from public.organization_memberships target
    where target.organization_id = sender_membership.organization_id
      and target.user_id = p_target_user_id and target.is_active
  ) then raise exception 'Seçilen personel bu kurumda aktif değil.'; end if;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select
    sender_membership.organization_id,
    target.user_id,
    'organization',
    'management_announcement',
    trim(p_title),
    trim(p_message),
    '/panel/notifications?kategori=duyurular',
    jsonb_build_object('sent_by', (select auth.uid()), 'sender_name', coalesce(sender_name, 'Yönetim'))
  from public.organization_memberships target
  where target.organization_id = sender_membership.organization_id
    and target.is_active
    and (
      p_target_user_id is null
      or target.user_id = p_target_user_id
      or target.user_id = (select auth.uid())
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.send_management_announcement(uuid, text, text, uuid) from public, anon;
grant execute on function public.send_management_announcement(uuid, text, text, uuid) to authenticated;
