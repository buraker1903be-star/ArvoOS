/*
  MAAŞ TAKİBİ VE HAKEDİŞ (30.10.2026, müşteri isteği: "bordro").

  ArvoOS BORDRO HESAPLAMIYOR, bilerek. SGK primi, kümülatif gelir vergisi,
  asgari ücret istisnası, damga vergisi her yıl (bazen yıl ortasında)
  değişiyor ve resmî bildirimi (MUHSGK) mali müşavir yapıyor; yanlış bir
  hesabın bedeli işverene ceza olarak dönerdi. Burada tutulan şey müşavirin
  İHTİYAÇ DUYDUĞU veri ve işverenin ÖDEDİĞİ para:

   - hr_maaslar: kadrolu personel × ay. Anlaşılan net, müşavirin hesapladığı
     resmî net (girilirse o esas alınır), ek ödeme, avans, kesinti ve
     ödemenin kendisi. İzin günleri ve o ay ödenen prim TUTULMUYOR, ekranda
     izin ve prim kayıtlarından okunuyor: iki yerde tutulan sayı ayrışır.
   - hr_hakedisler: serbest çalışan (sözleşmeli, freelance) × iş. Bordroya
     girmez; tutar, belge (fatura / serbest meslek makbuzu), müşavirin
     söylediği stopaj ve ödeme.

  TUTARLAR KURUŞ (AGENTS.md). Ödenen kaydın finanstaki gideri
  finance_transaction_id ile bağlı: geri alınınca gider de kalkar.

  GİZLİLİK: maaş kurumdaki en hassas veri. Okuma ve yazma Kurum Sahibi ve
  Yönetici'de (arvo_is_org_admin); yetenek anahtarı hr.maas.yonet'in
  varsayılanı da aynı küme — ikisi ayrışırsa düğme görünür, satır sessizce
  elenir (AGENTS.md "RLS de uyguluyorsa yetki gevşetilemez"). Personel
  YALNIZCA KENDİ satırını okur (kendi pusulası). Satış müdürü dâhil başka
  kimse görmez: arvo_is_privileged_member burada bilerek kullanılmadı.
*/

create table if not exists public.hr_maaslar (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  /* Ayın ilk günü; ayın ortasına maaş satırı açılamaz. */
  donem date not null check (donem = date_trunc('month', donem)::date),
  anlasilan_net bigint check (anlasilan_net is null or anlasilan_net >= 0),
  resmi_net bigint check (resmi_net is null or resmi_net >= 0),
  resmi_brut bigint check (resmi_brut is null or resmi_brut >= 0),
  ek_odeme bigint not null default 0 check (ek_odeme >= 0),
  avans bigint not null default 0 check (avans >= 0),
  kesinti bigint not null default 0 check (kesinti >= 0),
  notlar text check (notlar is null or char_length(notlar) <= 500),
  odendi_on date,
  odenen bigint check (odenen is null or odenen > 0),
  odeme_yontemi text check (odeme_yontemi is null or odeme_yontemi in ('havale', 'nakit', 'diger')),
  finance_transaction_id uuid references public.finance_transactions(id) on delete set null,
  olusturan uuid references auth.users(id) on delete set null,
  olusturuldu timestamptz not null default now(),
  guncellendi timestamptz not null default now(),
  /* Ödendiyse tarih ve tutar birlikte; biri eksik bir "ödendi" kaydı ödenmiş mi değil mi okunamaz. */
  constraint hr_maaslar_odeme_tutarli check ((odendi_on is null) = (odenen is null)),
  /* Aynı kişiye aynı ay iki maaş satırı, ödemeyi iki kez yaptırırdı. */
  unique (organization_id, employee_id, donem)
);

create index if not exists hr_maaslar_donem_idx on public.hr_maaslar (organization_id, donem, employee_id);

create table if not exists public.hr_hakedisler (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  aciklama text not null check (char_length(btrim(aciklama)) between 2 and 200),
  tarih date not null,
  /* Anlaşılan (brüt) tutar; stopaj müşavirin söylediği, ödenecek = tutar − stopaj. */
  tutar bigint not null check (tutar > 0),
  stopaj bigint not null default 0 check (stopaj >= 0),
  belge_turu text not null default 'yok' check (belge_turu in ('fatura', 'smm', 'yok')),
  belge_no text check (belge_no is null or char_length(belge_no) <= 60),
  notlar text check (notlar is null or char_length(notlar) <= 500),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi', 'iptal')),
  odendi_on date,
  odeme_yontemi text check (odeme_yontemi is null or odeme_yontemi in ('havale', 'nakit', 'diger')),
  finance_transaction_id uuid references public.finance_transactions(id) on delete set null,
  olusturan uuid references auth.users(id) on delete set null,
  olusturuldu timestamptz not null default now(),
  guncellendi timestamptz not null default now(),
  constraint hr_hakedisler_stopaj check (stopaj < tutar),
  constraint hr_hakedisler_odeme_tutarli check ((durum = 'odendi') = (odendi_on is not null))
);

create index if not exists hr_hakedisler_kurum_idx on public.hr_hakedisler (organization_id, durum, tarih desc);
create index if not exists hr_hakedisler_kisi_idx on public.hr_hakedisler (organization_id, employee_id, tarih desc);

alter table public.hr_maaslar enable row level security;
alter table public.hr_hakedisler enable row level security;

revoke all on public.hr_maaslar from public, anon;
revoke all on public.hr_hakedisler from public, anon;
grant select, insert, update, delete on public.hr_maaslar to authenticated;
grant select, insert, update, delete on public.hr_hakedisler to authenticated;

-- OKUMA: yönetim ya da kişinin kendisi.
drop policy if exists "Maaşı yönetim ve kişinin kendisi okur" on public.hr_maaslar;
create policy "Maaşı yönetim ve kişinin kendisi okur" on public.hr_maaslar for select to authenticated
  using (
    private.arvo_is_org_admin(organization_id)
    or exists (select 1 from public.hr_employees e
               where e.id = hr_maaslar.employee_id and e.organization_id = hr_maaslar.organization_id
                 and e.user_id = (select auth.uid()))
  );
drop policy if exists "Maaşı yönetim yazar" on public.hr_maaslar;
create policy "Maaşı yönetim yazar" on public.hr_maaslar for insert to authenticated
  with check (private.arvo_is_org_admin(organization_id));
drop policy if exists "Maaşı yönetim günceller" on public.hr_maaslar;
create policy "Maaşı yönetim günceller" on public.hr_maaslar for update to authenticated
  using (private.arvo_is_org_admin(organization_id)) with check (private.arvo_is_org_admin(organization_id));
drop policy if exists "Maaşı yönetim siler" on public.hr_maaslar;
create policy "Maaşı yönetim siler" on public.hr_maaslar for delete to authenticated
  using (private.arvo_is_org_admin(organization_id));

drop policy if exists "Hakedişi yönetim ve kişinin kendisi okur" on public.hr_hakedisler;
create policy "Hakedişi yönetim ve kişinin kendisi okur" on public.hr_hakedisler for select to authenticated
  using (
    private.arvo_is_org_admin(organization_id)
    or exists (select 1 from public.hr_employees e
               where e.id = hr_hakedisler.employee_id and e.organization_id = hr_hakedisler.organization_id
                 and e.user_id = (select auth.uid()))
  );
drop policy if exists "Hakedişi yönetim yazar" on public.hr_hakedisler;
create policy "Hakedişi yönetim yazar" on public.hr_hakedisler for insert to authenticated
  with check (private.arvo_is_org_admin(organization_id));
drop policy if exists "Hakedişi yönetim günceller" on public.hr_hakedisler;
create policy "Hakedişi yönetim günceller" on public.hr_hakedisler for update to authenticated
  using (private.arvo_is_org_admin(organization_id)) with check (private.arvo_is_org_admin(organization_id));
/* Ödenmiş hakediş SİLİNMEZ: finanstaki gideri ve müşavire bildirilen
   stopajı ona bağlı. Yanlış girilen ödeme önce geri alınır. */
drop policy if exists "Bekleyen hakedişi yönetim siler" on public.hr_hakedisler;
create policy "Bekleyen hakedişi yönetim siler" on public.hr_hakedisler for delete to authenticated
  using (private.arvo_is_org_admin(organization_id) and durum <> 'odendi');

/*
  Personel BAŞKA kurumdan olamaz (hedeflerdeki kuralın aynısı): yabancı
  anahtar kişinin VAR olduğunu söylüyor, hangi kurumda olduğunu
  söylemiyor. Güncellenme zamanı da burada.
*/
create or replace function public.hr_kisi_kaydi_kurum_tutarli()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.hr_employees e
    where e.id = new.employee_id and e.organization_id = new.organization_id
  ) then
    raise exception 'Kayıt, kurumun kendi personeline yazılır.';
  end if;
  new.guncellendi := now();
  return new;
end;
$$;

revoke all on function public.hr_kisi_kaydi_kurum_tutarli() from public, anon, authenticated;

drop trigger if exists hr_maaslar_kurum on public.hr_maaslar;
create trigger hr_maaslar_kurum before insert or update on public.hr_maaslar
  for each row execute function public.hr_kisi_kaydi_kurum_tutarli();
drop trigger if exists hr_hakedisler_kurum on public.hr_hakedisler;
create trigger hr_hakedisler_kurum before insert or update on public.hr_hakedisler
  for each row execute function public.hr_kisi_kaydi_kurum_tutarli();
