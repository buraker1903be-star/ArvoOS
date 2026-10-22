/*
  TALEP KALDIRILINCA YÖNETİCİYE BİLDİRİM (22.10.2026, AkademikMerkez).

  Satışçı talebi listesinden kaldırınca (20261022135951) yönetici bunu
  yalnızca Talepler listesine bakınca görüyordu. Artık kurumun
  yöneticilerine (owner/admin/manager, aktif üyelik) bildirim gidiyor;
  kaldıranın kendisine gitmiyor.

  KİŞİYE ÖZEL satır (user_id dolu): anlık bildirim tetikleyicisi bunu
  telefona da gönderiyor. Bilerek: yönetici kararı (arşivle / başkasına
  ata) bekleyen bir kayıt, kurum geneline düşen bir duyuru değil.

  Bildirim, kaldırmayla AYNI işlevde (aynı işlemde): biri yazılıp öbürü
  düşemesin. Gövde 20261022135951'deki işlevden (anlık görüntü henüz o
  migration'ı içermiyor); yalnızca bildirim eklendi.
*/
create or replace function public.crm_talebi_birak(p_talep uuid, p_sebep text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ben uuid := (select auth.uid());
  v_talep record;
  v_sebep text := btrim(coalesce(p_sebep, ''));
  v_ad text;
begin
  if v_ben is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  if char_length(v_sebep) < 5 then
    raise exception 'Sebep yazmadan talep kaldırılamaz (en az 5 karakter).' using errcode = 'check_violation';
  end if;

  select o.id, o.organization_id, o.stage, o.assigned_employee_id, o.birakildi_at, o.customer_name into v_talep
  from public.crm_opportunities o where o.id = p_talep;
  if v_talep.id is null then
    raise exception 'Talep bulunamadı.' using errcode = 'P0002';
  end if;

  /* Yalnızca talebin KENDİSİNE atandığı aktif üye. */
  select e.full_name into v_ad
  from public.hr_employees e
  join public.organization_memberships m
    on m.organization_id = e.organization_id and m.user_id = e.user_id and m.is_active
  where e.id = v_talep.assigned_employee_id
    and e.organization_id = v_talep.organization_id
    and e.user_id = v_ben;
  if not found then
    raise exception 'Yalnızca size atanmış talebi listenizden kaldırabilirsiniz.' using errcode = '42501';
  end if;
  if v_talep.stage in ('lost', 'won', 'completed') then
    raise exception 'Kapanmış talep listeden kaldırılamaz.' using errcode = 'check_violation';
  end if;
  if v_talep.birakildi_at is not null then
    raise exception 'Bu talep zaten listenizden kaldırıldı.' using errcode = 'check_violation';
  end if;

  update public.crm_opportunities
  set birakildi_at = now(), birakan_user_id = v_ben, birakma_sebebi = left(v_sebep, 500), updated_at = now()
  where id = p_talep;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    v_talep.organization_id,
    m.user_id,
    'organization',
    'talep_birakildi',
    'Talep listeden kaldırıldı',
    coalesce(nullif(v_ad, ''), 'Satışçı') || ', ' || coalesce(nullif(v_talep.customer_name, ''), 'bir müşteri') ||
      ' talebini listesinden kaldırdı: ' || left(v_sebep, 200),
    '/panel/crm/requests/' || p_talep::text,
    jsonb_build_object('opportunity_id', p_talep, 'birakan_user_id', v_ben, 'sebep', left(v_sebep, 500))
  from public.organization_memberships m
  where m.organization_id = v_talep.organization_id
    and m.is_active
    and m.role::text in ('owner', 'admin', 'manager')
    and m.user_id <> v_ben;
end $$;

revoke all on function public.crm_talebi_birak(uuid, text) from public, anon;
grant execute on function public.crm_talebi_birak(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
