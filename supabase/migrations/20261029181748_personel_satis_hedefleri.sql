/*
  PERSONEL SATIŞ HEDEFLERİ (29.10.2026).

  Raporlama şartnamesinin tek açık maddesi buydu
  (docs/RAPORLAMA-ASAMA-1.md §2.1): "hedef", "target", "kota", "budget"
  adında hiçbir tablo yoktu, bu yüzden Personel Performansı raporu
  "hedef gerçekleşmesi" bölümünü boş gösteriyordu. Ekran yöneticiye
  "hedef verisi yok" diyor ama hedefi GİRECEĞİ bir yer de yoktu —
  söylenen eksik, kapatılamıyordu.

  AY BAŞINA BİR SATIR. Hedef dönemi `donem` sütununda ayın İLK GÜNÜ
  olarak duruyor (date, 2026-11-01). Metin "2026-11" de olurdu;
  tarih seçildi çünkü vade karşılaştırmaları ve sıralama tarih
  sütununda indeksle çalışıyor, metinde her karşılaştırma dizgi
  karşılaştırmasına düşüyor. Ayın ilk günü olmayan bir değer kısıtla
  reddediliyor: "2026-11-15" gibi bir satır, ayın yarısına konmuş
  anlamsız bir hedef olurdu.

  TUTAR KURUŞ CİNSİNDEN TAMSAYI (AGENTS.md "Para kuruş cinsinden
  tamsayıdır"). Form tarafı `kurusOku` ile okuyor; buraya lira yazmak
  bütün raporu yüz katına çıkarırdı.

  TABLO ADI TÜRKÇE, ÖNEKİ `hr_`. docs/RAPORLAMA-ASAMA-1.md tasarım
  notunda `hr_employee_targets` yazıyordu; 10'dan beri yeni tablolar
  Türkçe adlanıyor (sozlesme_onaylari, platform_proformalari) ve depo
  kuralı da Türkçe. Önek modül grubunu koruyor: hr_employees,
  hr_departments ile aynı yerde duruyor.
*/
create table if not exists public.hr_personel_hedefleri (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  /* Ayın ilk günü; ayın ortasına hedef konamaz. */
  donem date not null check (donem = date_trunc('month', donem)::date),
  /* Kuruş. 0 "hedef yok" değil, "hedef sıfır" demek — satırın kendisi
     silinerek hedefsiz hâle dönülüyor. */
  tutar bigint not null check (tutar >= 0),
  olusturan uuid references auth.users(id) on delete set null,
  olusturuldu timestamptz not null default now(),
  guncellendi timestamptz not null default now(),
  /* Aynı kişiye aynı ay için iki hedef, raporda iki kez toplanırdı. */
  unique (organization_id, employee_id, donem)
);

/* Rapor dönemin aylarını kişi kırılımıyla okuyor: baş sütun kurum,
   sonra dönem. Sıra AGENTS.md'deki "yan sorgu dizinin BAŞ sütununu da
   bağlamalı" kuralına göre. */
create index if not exists hr_personel_hedefleri_donem_idx
  on public.hr_personel_hedefleri (organization_id, donem, employee_id);

alter table public.hr_personel_hedefleri enable row level security;

revoke all on public.hr_personel_hedefleri from public, anon;
grant select, insert, update, delete on public.hr_personel_hedefleri to authenticated;

/*
  OKUMA: yönetim ya da KİŞİNİN KENDİSİ. Kendi hedefini görmek
  personelin hakkı; başkasınınkini görmek performans verisidir ve
  yönetimde kalır. Kurum üyesine topluca açmak, operasyon
  departmanının tutar görmemesi kuralını (20261023183540) hedef
  sütunundan delerdi.
*/
drop policy if exists "Hedefleri yönetim ve kişinin kendisi okur" on public.hr_personel_hedefleri;
create policy "Hedefleri yönetim ve kişinin kendisi okur"
  on public.hr_personel_hedefleri
  for select
  to authenticated
  using (
    private.arvo_is_privileged_member(organization_id)
    or exists (
      select 1 from public.hr_employees e
      where e.id = hr_personel_hedefleri.employee_id
        and e.organization_id = hr_personel_hedefleri.organization_id
        and e.user_id = (select auth.uid())
    )
  );

/*
  YAZMA yalnızca Kurum Sahibi ve Yönetici (arvo_is_org_admin).
  Yetenek anahtarı `hr.hedef.yonet` varsayılanı da YONETIM; ikisi
  AYNI kümeye bakmak zorunda, yoksa panel düğmeyi gösterir, RLS satırı
  sessizce eler ve kullanıcı "kaydettim ama kaydolmadı" ile kalır
  (AGENTS.md "RLS de uyguluyorsa yetki gevşetilemez").
*/
drop policy if exists "Hedefleri yönetim yazar" on public.hr_personel_hedefleri;
create policy "Hedefleri yönetim yazar"
  on public.hr_personel_hedefleri
  for insert
  to authenticated
  with check (private.arvo_is_org_admin(organization_id));

drop policy if exists "Hedefleri yönetim günceller" on public.hr_personel_hedefleri;
create policy "Hedefleri yönetim günceller"
  on public.hr_personel_hedefleri
  for update
  to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

drop policy if exists "Hedefleri yönetim siler" on public.hr_personel_hedefleri;
create policy "Hedefleri yönetim siler"
  on public.hr_personel_hedefleri
  for delete
  to authenticated
  using (private.arvo_is_org_admin(organization_id));

/*
  Personel BAŞKA kurumdan olamaz. Yabancı anahtar yalnızca kişinin var
  olduğunu söylüyor, hangi kurumda olduğunu söylemiyor: organization_id
  başka bir kurumun personeline hedef yazmak, o kişinin kendi kurum
  raporunda görünmeyen bir satır üretirdi.
*/
create or replace function public.hr_hedef_kurum_tutarli()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.hr_employees e
    where e.id = new.employee_id and e.organization_id = new.organization_id
  ) then
    raise exception 'Hedef, kurumun kendi personeline yazılır.';
  end if;
  new.guncellendi := now();
  return new;
end;
$$;

revoke all on function public.hr_hedef_kurum_tutarli() from public, anon, authenticated;
grant execute on function public.hr_hedef_kurum_tutarli() to authenticated, service_role;

drop trigger if exists hr_personel_hedefleri_kurum on public.hr_personel_hedefleri;
create trigger hr_personel_hedefleri_kurum
  before insert or update on public.hr_personel_hedefleri
  for each row execute function public.hr_hedef_kurum_tutarli();
