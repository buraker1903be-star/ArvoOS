/*
  SATIŞÇI TALEBİ LİSTESİNDEN KALDIRIR, YÖNETİCİ GÖRÜR (22.10.2026,
  AkademikMerkez'in talebi).

  Satışçı müşteriyi arıyor, olumsuz cevap alıyor ve talebi kendi
  listesinden çıkaramıyordu: silme yöneticide, arşivleme ise talep
  detayının içinde ve sebepsiz de geçiyordu (boş sebep sabit metne
  düşüyordu). Yönetici de kimin neden vazgeçtiğini listede görmüyordu.

  Yeni akış:
    - Satışçı, KENDİSİNE ATANMIŞ açık talebi SEBEP YAZARAK bırakır
      (crm_talebi_birak). Sebepsiz bırakılamaz. Talep silinmez,
      arşivlenmez: satışçının listesinden düşer.
    - Yönetici (owner/admin/manager) talebi listede görmeye devam eder;
      satırında kırmızı "<satışçı> talebi kaldırdı: <sebep>" yazar.
      Karar yöneticinin: arşivler, başka satışçıya atar ya da uyarıyı
      kaldırıp aynı kişiye geri verir (crm_talep_birakmayi_geri_al).
    - Başka birine atanınca ya da talep kapanınca (lost/won/completed)
      işaret kendiliğinden temizlenir.

  Sütunlar panelden DOĞRUDAN yazılamaz (AGENTS.md: RLS "kim"i söyler,
  "neyi"yi söylemez): yalnızca bu migration'daki işlevler ve
  tetikleyicinin kendi temizliği yazar.
*/

alter table public.crm_opportunities
  add column if not exists birakildi_at timestamptz,
  add column if not exists birakan_user_id uuid,
  add column if not exists birakma_sebebi text;

alter table public.crm_opportunities drop constraint if exists crm_opportunities_birakma_sebebi_check;
alter table public.crm_opportunities add constraint crm_opportunities_birakma_sebebi_check
  check (birakma_sebebi is null or char_length(btrim(birakma_sebebi)) between 5 and 500);

-- ---------- Koruma ve kendiliğinden temizlik ----------

create or replace function private.arvo_talep_birakma_koru()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  /* Başkasına atandıysa ya da talep kapandıysa işaret düşer: karar verildi. */
  if new.assigned_employee_id is distinct from old.assigned_employee_id
     or (new.stage is distinct from old.stage and new.stage in ('lost', 'won', 'completed')) then
    new.birakildi_at := null;
    new.birakan_user_id := null;
    new.birakma_sebebi := null;
    return new;
  end if;

  /* Panelden (PostgREST) doğrudan yazılamaz; işlevler definer olarak çalışır. */
  if current_user in ('authenticated', 'anon')
     and (new.birakildi_at is distinct from old.birakildi_at
          or new.birakan_user_id is distinct from old.birakan_user_id
          or new.birakma_sebebi is distinct from old.birakma_sebebi) then
    raise exception 'Talebi listeden kaldırma yalnızca "Listemden kaldır" ile yapılır.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists arvo_talep_birakma_koru on public.crm_opportunities;
create trigger arvo_talep_birakma_koru before update on public.crm_opportunities
  for each row execute function private.arvo_talep_birakma_koru();

-- ---------- Bırakma ----------

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
begin
  if v_ben is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  if char_length(v_sebep) < 5 then
    raise exception 'Sebep yazmadan talep kaldırılamaz (en az 5 karakter).' using errcode = 'check_violation';
  end if;

  select o.id, o.organization_id, o.stage, o.assigned_employee_id, o.birakildi_at into v_talep
  from public.crm_opportunities o where o.id = p_talep;
  if v_talep.id is null then
    raise exception 'Talep bulunamadı.' using errcode = 'P0002';
  end if;

  /* Yalnızca talebin KENDİSİNE atandığı aktif üye. */
  if not exists (
    select 1 from public.hr_employees e
    join public.organization_memberships m
      on m.organization_id = e.organization_id and m.user_id = e.user_id and m.is_active
    where e.id = v_talep.assigned_employee_id
      and e.organization_id = v_talep.organization_id
      and e.user_id = v_ben
  ) then
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
end $$;

revoke all on function public.crm_talebi_birak(uuid, text) from public, anon;
grant execute on function public.crm_talebi_birak(uuid, text) to authenticated, service_role;

-- ---------- Yönetici: uyarıyı kaldır, aynı kişiye geri ver ----------

create or replace function public.crm_talep_birakmayi_geri_al(p_talep uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  select o.organization_id into v_org from public.crm_opportunities o where o.id = p_talep;
  if v_org is null then
    raise exception 'Talep bulunamadı.' using errcode = 'P0002';
  end if;
  if not private.arvo_is_privileged_member(v_org) then
    raise exception 'Bu işlemi yalnızca yönetici yapabilir.' using errcode = '42501';
  end if;
  update public.crm_opportunities
  set birakildi_at = null, birakan_user_id = null, birakma_sebebi = null, updated_at = now()
  where id = p_talep;
end $$;

revoke all on function public.crm_talep_birakmayi_geri_al(uuid) from public, anon;
grant execute on function public.crm_talep_birakmayi_geri_al(uuid) to authenticated, service_role;

-- ---------- Liste görünümü: işaret ve bırakanın adı ----------

/*
  Gövde anlık görüntüden (canli-sema.sql); yeni sütunlar SONA eklendi
  (create or replace view sütun ekleyebilir, sırayı değiştiremez).
  Bırakanın adı personel kaydından (kullanıcı → personel). security_invoker
  aynen: RLS çağıranın yetkisiyle.
*/
create or replace view public.crm_talep_liste with (security_invoker=true, security_barrier=true) as
 SELECT o.id,
    o.organization_id,
    o.title,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    private.arvo_search_digits(o.contact_phone) AS telefon_rakamlari,
    o.stage,
    o.estimated_value,
    o.expected_close_date,
    o.source,
    o.notes,
    o.request_details,
    NULLIF(btrim(COALESCE(o.request_details ->> 'service_type'::text, ''::text)), ''::text) AS hizmet_turu,
    o.assigned_employee_id,
    p.full_name AS temsilci_adi,
    o.lost_reason,
    o.created_at,
    o.updated_at,
    y.son_yorum_at,
    o.birakildi_at,
    o.birakma_sebebi,
    (SELECT b.full_name FROM hr_employees b
      WHERE b.organization_id = o.organization_id AND b.user_id = o.birakan_user_id
      LIMIT 1) AS birakan_adi
   FROM crm_opportunities o
     LEFT JOIN hr_employees p ON p.id = o.assigned_employee_id
     LEFT JOIN LATERAL ( SELECT max(c.created_at) AS son_yorum_at
           FROM crm_internal_comments c
          WHERE c.organization_id = o.organization_id AND c.opportunity_id = o.id) y ON true;

-- ---------- Süzgeç: bırakılan talep yalnızca yöneticinin listesinde ----------

/*
  Liste VE şerit sayıları bu işlevden (AGENTS.md: şerit listeyle aynı
  süzgeçten); bırakılan talep satışçının hem listesinden hem
  sayılarından düşer. Gövde anlık görüntüden; tek ek koşul sonda.
*/
create or replace function public.crm_talep_suz(p_org uuid, p_desen text, p_telefon text, p_temsilci text)
returns setof public.crm_talep_liste
language sql
stable
as $function$
  select t.*
  from public.crm_talep_liste t
  where t.organization_id = p_org
    and (
      p_desen is null
      or t.customer_name ilike '%' || p_desen || '%'
      or t.title ilike '%' || p_desen || '%'
      or t.contact_email ilike '%' || p_desen || '%'
      or t.hizmet_turu ilike '%' || p_desen || '%'
      or t.temsilci_adi ilike '%' || p_desen || '%'
      or (p_telefon is not null and t.telefon_rakamlari ilike '%' || p_telefon || '%')
    )
    and (
      p_temsilci is null
      or (p_temsilci = 'atanmamis' and t.assigned_employee_id is null)
      or t.assigned_employee_id::text = p_temsilci
    )
    and (t.birakildi_at is null or private.arvo_is_privileged_member(p_org))
$function$;

notify pgrst, 'reload schema';
