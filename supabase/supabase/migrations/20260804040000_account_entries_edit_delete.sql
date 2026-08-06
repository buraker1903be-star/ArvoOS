-- account_entries yalnızca select+insert için açıktı; cari hareket
-- düzenleme/silme özelliği için update ve delete izinlerini ve
-- ilgili RLS politikalarını ekliyoruz (yalnızca owner/admin).

grant update, delete on public.account_entries to authenticated;

drop policy if exists "owners_update_account_entries" on public.account_entries;
create policy "owners_update_account_entries" on public.account_entries for update to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = account_entries.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = account_entries.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
  and exists (
    select 1 from public.account_parties p
    where p.id = account_entries.party_id
      and p.organization_id = account_entries.organization_id
  )
);

drop policy if exists "owners_delete_account_entries" on public.account_entries;
create policy "owners_delete_account_entries" on public.account_entries for delete to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = account_entries.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);
