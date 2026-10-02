-- ============================================================
-- İŞİ GÖREBİLEN, YORUMUNU DA YAZABİLİR
--
-- Aynı sayfada iki ayrı yetki kuralı vardı ve biri ötekinden dardı:
--
--   iş detayını AÇMAK  → arvo_can_access_workflow
--                        (yönetici ya da işin sorumlusu)
--   yoruma YAZMAK      → arvo_can_access_opportunity
--                        (yönetici, fırsatın satışçısı ya da
--                         sözleşme→iş→sorumlu zinciri tam)
--
-- İkinci zincir fazladan crm_contracts.workflow_id ve opportunity_id
-- bağlarını şart koşuyor. Bir halkası eksik olduğunda operasyon
-- personeli işi açıyor, görevleri görüyor, ama kendi işinin kurum içi
-- notuna yazamıyordu (02.10.2026: üç kişi). Kullanıcıya anlamsız gelen
-- bir durum: gördüğü sayfaya yazamıyor.
--
-- Kural birleşti: iş bağlamındaki bir yoruma, o işi görebilen yazabilir.
--
-- SINIR KORUNUYOR. "İşi görebiliyorum" tek başına yetmiyor; o iş
-- yorumun bağlandığı FIRSATA ait olmalı. Aksi hâlde kendi işini
-- context_id olarak gösteren biri, başka bir müşterinin kayıt zincirine
-- not düşebilirdi — yorum satırı o fırsata yazılıyor ve orada görünür.
--
-- Eski ikinci INSERT politikası ("assigned members add…") düşürülüyor:
-- koşulu crm_opportunities'i RLS üzerinden okuyor ve tutar daraltmasından
-- (20261001143617) beri operasyon personeli için zaten hiç doğru
-- olmuyordu. İzin veren tek kural kalsın; iki kapıdan biri sessizce
-- kırıldığında sebebini bulmak bu yüzden saatler aldı.
-- ============================================================

create or replace function private.arvo_yorum_erisimi(
  p_opportunity uuid,
  p_context_type text,
  p_context_id uuid
) returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.arvo_can_access_opportunity(p_opportunity)
      or (
        p_context_type = 'operation'
        and private.arvo_can_access_workflow(p_context_id)
        and exists (
          select 1
          from public.operation_workflows w
          join public.crm_contracts c
            on c.id = w.contract_id
           and c.organization_id = w.organization_id
          where w.id = p_context_id
            and c.opportunity_id = p_opportunity
        )
      )
$$;

revoke all on function private.arvo_yorum_erisimi(uuid, text, uuid) from public, anon;
grant execute on function private.arvo_yorum_erisimi(uuid, text, uuid) to authenticated, service_role;

-- ---------- Okuma ----------
drop policy if exists "assigned members read crm internal comments" on public.crm_internal_comments;
create policy "assigned members read crm internal comments" on public.crm_internal_comments
  as permissive for select to authenticated
  using (organization_id = private.arvo_firsat_kurumu(opportunity_id)
    and private.arvo_yorum_erisimi(opportunity_id, context_type, context_id));

-- ---------- Yazma ----------
drop policy if exists "assigned members add crm internal comments" on public.crm_internal_comments;
drop policy if exists "assigned members write crm internal comments" on public.crm_internal_comments;
create policy "assigned members write crm internal comments" on public.crm_internal_comments
  as permissive for insert to authenticated
  with check (created_by = (select auth.uid())
    and organization_id = private.arvo_firsat_kurumu(opportunity_id)
    and private.arvo_yorum_erisimi(opportunity_id, context_type, context_id));

-- ---------- Kendi yorumunu düzenleme ----------
drop policy if exists "authors edit own crm internal comments" on public.crm_internal_comments;
create policy "authors edit own crm internal comments" on public.crm_internal_comments
  as permissive for update to authenticated
  using (created_by = (select auth.uid())
    and private.arvo_yorum_erisimi(opportunity_id, context_type, context_id))
  with check (created_by = (select auth.uid())
    and organization_id = private.arvo_firsat_kurumu(opportunity_id)
    and private.arvo_yorum_erisimi(opportunity_id, context_type, context_id));

-- ---------- Silme ----------
-- Yazarı siler; yönetici başkasınınkini de siler (eski kuralla aynı).
drop policy if exists "authors or managers delete crm internal comments" on public.crm_internal_comments;
create policy "authors or managers delete crm internal comments" on public.crm_internal_comments
  as permissive for delete to authenticated
  using (private.arvo_yorum_erisimi(opportunity_id, context_type, context_id)
    and (created_by = (select auth.uid())
      or exists (
        select 1 from public.organization_memberships m
        where m.organization_id = crm_internal_comments.organization_id
          and m.user_id = (select auth.uid())
          and m.is_active = true
          and m.role::text in ('owner','admin','manager')
      )));

/*
  KOPUK BAĞ ONARIMI.

  İki kural iki AYRI sütundan gidiyor:
    arvo_can_access_opportunity → crm_contracts.workflow_id  (sözleşme → iş)
    buradaki yeni yardımcı      → operation_workflows.contract_id (iş → sözleşme)

  İkincisi iş oluşturulurken yazılıyor; birincisini bir tetikleyici geri
  dolduruyor (arvo_sync_contract_workflow). Tetikleyici veriden SONRA
  eklendiyse ya da iş başka bir yoldan oluşturulduysa sözleşme tarafı boş
  kalıyor — operasyon personelinin fırsat erişimi o anda kopuyor. Yeni
  kural bu işi zaten çözüyor, ama bağın kendisi de onarılıyor: tutar
  görünürlüğü, kayıt geçmişi ve finans eşleşmesi de aynı sütuna bakıyor.
*/
update public.crm_contracts c
   set workflow_id = w.id,
       updated_at = now()
  from public.operation_workflows w
 where w.contract_id = c.id
   and w.organization_id = c.organization_id
   and c.workflow_id is distinct from w.id;

notify pgrst, 'reload schema';
