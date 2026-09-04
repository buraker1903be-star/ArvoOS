-- Kurum içi yorumlarda düzenleme ve silme.
--
-- Tablo yalnızca select + insert yetkisiyle açılmıştı; RLS her update
-- ve delete'i sessizce engelliyordu. Bu yüzden yorumlar bir kez
-- yazıldıktan sonra düzeltilemiyordu.
--
-- Kural: kişi kendi yorumunu düzenleyebilir ve silebilir.
-- Yönetici (owner/admin/manager) başkasının yorumunu da silebilir ama
-- DÜZENLEYEMEZ — başkasının ağzından not değiştirmek kaydın
-- güvenilirliğini bozar, silme ise izi tamamen kaldırır.

alter table public.crm_internal_comments
  add column if not exists edited_at timestamptz;

comment on column public.crm_internal_comments.edited_at is
  'Yorum sonradan düzenlendiyse son düzenleme zamanı; arayüzde "düzenlendi" etiketi için.';

grant update, delete on public.crm_internal_comments to authenticated;

-- Yalnızca yazarı düzenleyebilir. Yazar ve kurum bilgisi değiştirilemez:
-- with check aynı created_by'ı şart koştuğu için not başkasına devredilemez.
drop policy if exists "authors edit own crm internal comments" on public.crm_internal_comments;
create policy "authors edit own crm internal comments"
on public.crm_internal_comments for update to authenticated
using (
  created_by = (select auth.uid())
  and private.arvo_can_access_opportunity(opportunity_id)
)
with check (
  created_by = (select auth.uid())
  and organization_id = (
    select o.organization_id from public.crm_opportunities o
    where o.id = opportunity_id
  )
  and private.arvo_can_access_opportunity(opportunity_id)
);

-- Silme: yazarın kendisi ya da kurumun yöneticisi.
drop policy if exists "authors or managers delete crm internal comments" on public.crm_internal_comments;
create policy "authors or managers delete crm internal comments"
on public.crm_internal_comments for delete to authenticated
using (
  private.arvo_can_access_opportunity(opportunity_id)
  and (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.organization_memberships m
      where m.user_id = (select auth.uid())
        and m.organization_id = crm_internal_comments.organization_id
        and m.is_active = true
        and m.role in ('owner', 'admin', 'manager')
    )
  )
);
