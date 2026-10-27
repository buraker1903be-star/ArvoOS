-- PLATFORM PROFORMALARI (27.10.2026, kurum sahibinin kararı).
--
-- Akış: proforma → müşteri öder (kart ya da havale) → tahsilat makbuzu →
-- Arvo faturayı keser ve yükler (platform_faturalari). Eskiden ilk adım
-- yoktu: müşteri ne ödeyeceğini ödemeden önce resmî bir belgede
-- göremiyordu.
--
-- Proformayı kurucu elle hazırlar (kurum ya da bireysel abone için).
-- Ödeme bugünkü kanallardan gelir; kurucu proformayı o ödemeyle EŞLER.
-- Ödeme kanallarına (PayTR bildirimi, havale onayı) dokunulmadı: onlar
-- lisans dönemini uzatıyor ve proformaya bağlamak aynı ödemenin dönemi
-- iki kez uzatma riskini doğururdu.
--
-- Tutarlar KURUŞ, KDV ayrı satır (oran varsayılan %20). Toplamlar
-- sunucuda hesaplanıp yazılıyor ve kısıtla tutarlılığı denetleniyor.
--
-- Bu migration ArvoOS projesi içindir.
do $kontrol$
begin
  if to_regclass('public.product_subscribers') is null or to_regclass('public.organization_payment_requests') is null then
    raise exception 'Bu migration ArvoOS projesi içindir. Açık olan proje ArvoOS değil.';
  end if;
end
$kontrol$;

create sequence if not exists public.platform_proforma_sira;

create table if not exists public.platform_proformalari (
  id uuid primary key default gen_random_uuid(),
  proforma_no text not null unique,
  product text not null default 'arvolab',
  organization_id uuid references public.organizations(id) on delete restrict,
  subscriber_id uuid references public.product_subscribers(id) on delete restrict,
  musteri_adi text not null check (char_length(btrim(musteri_adi)) between 1 and 200),
  /* [{ "aciklama": text, "miktar": number, "birim_fiyat": kuruş }] — KDV hariç. */
  kalemler jsonb not null check (jsonb_typeof(kalemler) = 'array' and jsonb_array_length(kalemler) between 1 and 20),
  ara_toplam bigint not null check (ara_toplam > 0),
  kdv_orani numeric not null default 20 check (kdv_orani >= 0 and kdv_orani <= 100),
  kdv bigint not null check (kdv >= 0),
  toplam bigint not null,
  para_birimi text not null default 'TRY',
  duzenleme_tarihi date not null default current_date,
  gecerlilik_tarihi date not null,
  notlar text check (notlar is null or char_length(notlar) <= 1000),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi', 'iptal')),
  /* Eşlenen ödeme: kurumun onaylı ödemesi ya da abonenin kart ödemesi. Bir ödeme bir proformaya. */
  payment_request_id uuid unique references public.organization_payment_requests(id) on delete restrict,
  subscriber_payment_id uuid unique references public.subscriber_payments(id) on delete restrict,
  odendi_at timestamptz,
  olusturan uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_proformalari_musteri check ((organization_id is null) <> (subscriber_id is null)),
  constraint platform_proformalari_toplam check (toplam = ara_toplam + kdv),
  constraint platform_proformalari_odeme check (
    (durum = 'odendi') = (payment_request_id is not null or subscriber_payment_id is not null)
    and not (payment_request_id is not null and subscriber_payment_id is not null)
  ),
  -- Kurumun proforması kurumun ödemesiyle, abonenin proforması abonenin ödemesiyle eşlenir.
  constraint platform_proformalari_odeme_turu check (
    (payment_request_id is null or organization_id is not null)
    and (subscriber_payment_id is null or subscriber_id is not null)
  ),
  constraint platform_proformalari_gecerlilik check (gecerlilik_tarihi >= duzenleme_tarihi)
);

create index if not exists platform_proformalari_kurum_idx on public.platform_proformalari (organization_id, created_at desc);
create index if not exists platform_proformalari_abone_idx on public.platform_proformalari (subscriber_id, created_at desc);

/*
  Numara: PRF-<yıl>-<sıra> (sıra yıllar boyunca artan, boşluksuz olması
  garanti değil — iptal edilen proforma numarasını korur). Numara
  sunucuda, ekleme anında veriliyor; istemci yazamaz.
*/
create or replace function public.platform_proforma_numarasi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.proforma_no := 'PRF-' || to_char(coalesce(new.duzenleme_tarihi, current_date), 'YYYY') || '-'
    || lpad(nextval('public.platform_proforma_sira')::text, 4, '0');
  return new;
end;
$$;

revoke all on function public.platform_proforma_numarasi() from public, anon, authenticated;

drop trigger if exists platform_proforma_numarasi on public.platform_proformalari;
create trigger platform_proforma_numarasi
  before insert on public.platform_proformalari
  for each row execute function public.platform_proforma_numarasi();

alter table public.platform_proformalari enable row level security;

/*
  Okuma yalnızca kurucuda (Faturalama ve Tahsilat). Yazma yalnızca
  sunucuda (service_role), kurucu denetiminden sonra: proforma müşteriye
  giden belge. Müşteri onu ArvoLab'dan görüyor (köprü, service_role).
*/
drop policy if exists platform_proformalari_kurucu_okur on public.platform_proformalari;
create policy platform_proformalari_kurucu_okur on public.platform_proformalari
  for select to authenticated
  using ((select private.is_arvoos_founder()));

revoke all on public.platform_proformalari from public, anon;
revoke insert, update, delete on public.platform_proformalari from authenticated;
grant select on public.platform_proformalari to authenticated;
grant select, insert, update, delete on public.platform_proformalari to service_role;
grant usage on sequence public.platform_proforma_sira to service_role;
