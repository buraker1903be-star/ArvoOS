/*
  PRİM ÖDEMESİNİN HANGİ İŞLERE İSTİNADEN YAPILDIĞI (12.10.2026)

  Prim ödemesi tek bir tutardı; hangi işlerin primini kapattığı hiçbir
  yerde yazmıyordu. Kurum bunu açıklama alanına elle yazıyordu
  ("SOZ-2026-000005 3.140 TL + SOZ-2026-000030 500 TL"). Artık ödeme
  girilirken personelin işlerine (sözleşmelerine) dağıtılabiliyor;
  her işin "hak edilen / ödenen / açık" primi buradan okunuyor.

  Dağıtım İSTEĞE BAĞLI ve ödemenin tamamını kapsamak zorunda değil:
  dağıtılmayan kısım "işe bağlanmamış" kalır. Personelin bakiyesi yine
  toplamdan hesaplanır (lib/commission-ledger); bu tablo bakiyeyi
  değiştirmez, ödemenin neye karşılık olduğunu söyler.

  YAZMA YALNIZCA İŞLEVLE. Tablo authenticated'a salt okunur; dağıtım
  arvo_prim_odemesi_dagit ile TEK İŞLEMDE (eskisini sil, yenisini yaz)
  değişiyor. İşlev ödemeyle sözleşmenin aynı kurumda olduğunu ve
  dağıtılanın ödemeyi aşmadığını denetliyor; doğrudan tablo yazımı bu
  denetimleri atlardı.

  Sözleşme silinirse dağıtım satırı silinmez, sözleşme bağı boşalır
  (ON DELETE SET NULL): sözleşme silme kaskatına yeni bir kayıt türü
  eklenmesin (AGENTS.md, "Silme engeli kaskat yüzeyi kadar geniş").
*/

create table if not exists public.hr_commission_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid not null references public.hr_commission_payments(id) on delete cascade,
  contract_id uuid references public.crm_contracts(id) on delete set null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, contract_id)
);

create index if not exists hr_commission_payment_allocations_odeme_idx
  on public.hr_commission_payment_allocations (organization_id, payment_id);
create index if not exists hr_commission_payment_allocations_sozlesme_idx
  on public.hr_commission_payment_allocations (organization_id, contract_id);

alter table public.hr_commission_payment_allocations enable row level security;

-- Okuma: ödemeyi görebilen görür (ödemenin kendi okuma kuralı alt sorguda işliyor:
-- yetkili üye ya da ödemenin sahibi personel, İK modülü açıkken).
drop policy if exists "commission allocations readable" on public.hr_commission_payment_allocations;
create policy "commission allocations readable" on public.hr_commission_payment_allocations
  as permissive for select to authenticated
  using (exists (
    select 1 from public.hr_commission_payments p
    where p.id = hr_commission_payment_allocations.payment_id
      and p.organization_id = hr_commission_payment_allocations.organization_id
  ));

revoke all on table public.hr_commission_payment_allocations from anon, authenticated;
grant select on table public.hr_commission_payment_allocations to authenticated;

/*
  p_kalemler: [{"contract_id": "...", "amount": 314000}, ...] (kuruş).
  Boş dizi dağıtımı kaldırır. Yetki: ödemeyi yazabilen (Kurum Sahibi /
  Yönetici, hr_commission_payments politikasıyla aynı).
*/
create or replace function public.arvo_prim_odemesi_dagit(p_payment_id uuid, p_kalemler jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_odeme record;
  v_kalem jsonb;
  v_toplam bigint := 0;
  v_tutar bigint;
  v_sozlesme uuid;
begin
  select id, organization_id, amount into v_odeme
  from public.hr_commission_payments where id = p_payment_id;
  if not found then
    raise exception 'Prim ödemesi bulunamadı.' using errcode = 'P0002';
  end if;
  if not private.arvo_is_org_admin(v_odeme.organization_id) then
    raise exception 'Prim ödemesini yalnızca Kurum Sahibi ve Yönetici düzenleyebilir.' using errcode = '42501';
  end if;
  if p_kalemler is null or jsonb_typeof(p_kalemler) <> 'array' then
    raise exception 'Dağıtım listesi geçersiz.' using errcode = '22023';
  end if;

  delete from public.hr_commission_payment_allocations where payment_id = p_payment_id;

  for v_kalem in select * from jsonb_array_elements(p_kalemler) loop
    v_sozlesme := (v_kalem->>'contract_id')::uuid;
    v_tutar := (v_kalem->>'amount')::bigint;
    if v_tutar is null or v_tutar <= 0 then
      raise exception 'Her işe dağıtılan tutar sıfırdan büyük olmalı.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.crm_contracts c
      where c.id = v_sozlesme and c.organization_id = v_odeme.organization_id
    ) then
      raise exception 'Seçilen iş bu kurumda bulunamadı.' using errcode = '22023';
    end if;
    v_toplam := v_toplam + v_tutar;
    insert into public.hr_commission_payment_allocations (organization_id, payment_id, contract_id, amount)
    values (v_odeme.organization_id, p_payment_id, v_sozlesme, v_tutar);
  end loop;

  if v_toplam > v_odeme.amount then
    raise exception 'İşlere dağıtılan tutar ödemenin kendisinden büyük olamaz.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.arvo_prim_odemesi_dagit(uuid, jsonb) from public, anon;
grant execute on function public.arvo_prim_odemesi_dagit(uuid, jsonb) to authenticated;
