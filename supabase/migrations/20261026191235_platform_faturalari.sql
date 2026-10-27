-- PLATFORM FATURALARI (26.10.2026, kurum sahibinin kararı: "faturaları elle
-- kesip PDF yükleyeceğiz; öğrenci ve kurum yöneticisi ArvoLab'da görsün").
--
-- Arvo'nun müşterisine kestiği fatura bugüne kadar hiçbir yerde tutulmuyordu
-- (Faturalama ve Tahsilat sayfasının "Platform faturası henüz kesilmiyor"
-- notu). Fatura entegratörsüz, elle kesiliyor; kurucu kestiği faturanın PDF'ini
-- ilgili TAHSİLATIN yanına yüklüyor. Fatura bir ödemeye bağlı: bireysel
-- abonenin kart ödemesi (subscriber_payments) ya da kurumun onaylı ödemesi
-- (organization_payment_requests) — ikisinden biri, ikisi birden değil.
--
-- Bir ödemenin bir faturası var (unique). Yeniden yüklemek kaydı günceller:
-- yanlış PDF'i düzeltmenin yolu bu.
--
-- Bu migration ArvoOS projesi içindir.
do $kontrol$
begin
  if to_regclass('public.subscriber_payments') is null or to_regclass('public.organization_payment_requests') is null then
    raise exception 'Bu migration ArvoOS projesi içindir. Açık olan proje ArvoOS değil.';
  end if;
end
$kontrol$;

create table if not exists public.platform_faturalari (
  id uuid primary key default gen_random_uuid(),
  fatura_no text not null check (char_length(btrim(fatura_no)) between 1 and 60),
  fatura_tarihi date not null,
  -- platform-faturalari deposundaki yol
  dosya_yolu text not null,
  /*
    ON DELETE RESTRICT: ödeme kaydı zaten silinmiyor (VUK beş yıl saklama;
    abone kapanınca anonimleşiyor, silinmiyor). Silinmeye kalkılırsa
    faturasıyla birlikte sessizce gitmesin.
  */
  subscriber_payment_id uuid unique references public.subscriber_payments(id) on delete restrict,
  payment_request_id uuid unique references public.organization_payment_requests(id) on delete restrict,
  yukleyen uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_faturalari_odeme_check check ((subscriber_payment_id is null) <> (payment_request_id is null))
);

alter table public.platform_faturalari enable row level security;

/*
  Okuma yalnızca kurucuda (Faturalama ve Tahsilat sayfası). Yazma yalnızca
  sunucuda (service_role), kurucu denetiminden sonra: fatura müşteriye
  giden resmî belge, istemciden yazılabilmemeli.

  Müşteri faturasını ArvoOS'tan değil ArvoLab'dan görüyor; köprü
  (app/api/bridge/subscription, "billing" ve "org_billing") service_role
  ile okuyup kısa süreli imzalı bağlantı veriyor.
*/
drop policy if exists platform_faturalari_kurucu_okur on public.platform_faturalari;
create policy platform_faturalari_kurucu_okur on public.platform_faturalari
  for select to authenticated
  using ((select private.is_arvoos_founder()));

revoke all on public.platform_faturalari from anon;
revoke insert, update, delete on public.platform_faturalari from authenticated;
grant select on public.platform_faturalari to authenticated;
grant select, insert, update, delete on public.platform_faturalari to service_role;

-- Dosyalar: özel depo, yalnızca PDF, 10 MB. Politika yok: okuma ve yazma
-- yalnızca service_role ile (imzalı bağlantı sunucuda üretiliyor).
-- Depo şeması yalnızca Supabase'te var; test veritabanında (PGlite) yok.
do $depo$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('platform-faturalari', 'platform-faturalari', false, 10485760, array['application/pdf'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$depo$;
