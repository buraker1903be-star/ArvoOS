/*
  LİSANSIN KAPANDIĞI AN (02.11.2026).

  Konsolun aylık müşteri raporu "bu ay kaç müşteri kaybettik" sorusunu
  yanıtlamak için lisansın İPTAL ANINI bilmiyordu: tablolarda yalnızca
  durum ve dönem sonu vardı, updated_at ise her düzenlemede değişiyor.
  Rapor bu yüzden "son dönemi bu ay biten" ile yaklaşık ölçüyordu.

  closed_at: lisans AÇIK bir durumdan (active, trialing, past_due)
  kapalı bir duruma (suspended, canceled, inactive) geçtiği an. Yeniden
  açılınca boşalıyor — geri dönen müşteri "kayıp" sayılmasın. Durumu
  değişmeyen bir düzenleme (ücret, dönem) tarihi ellemiyor.

  Tetikleyiciyle, uygulama koduyla değil: lisans durumunu yazan yol çok
  (konsol formu, ödeme onayı, toplu işlem, zamanlanmış işler, köprüler);
  birinde unutulan satır raporu sessizce eksik bırakırdı. Ad
  product_subscribers.closed_at ile aynı.

  Geçmiş doldurulmuyor: bugün kapalı olan lisansların ne zaman kapandığı
  bilinmiyor. Onlarda rapor dönem sonuna bakmaya devam ediyor.
*/
alter table public.organization_licenses add column if not exists closed_at timestamptz;
alter table public.organization_product_licenses add column if not exists closed_at timestamptz;

create or replace function private.lisans_kapanis_tarihi()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  eski_durum text;
  yeni_durum text;
begin
  if tg_table_name = 'organization_licenses' then
    eski_durum := case when tg_op = 'UPDATE' then old.license_status end;
    yeni_durum := new.license_status;
  else
    eski_durum := case when tg_op = 'UPDATE' then old.status end;
    yeni_durum := new.status;
  end if;

  if yeni_durum in ('active', 'trialing', 'past_due') then
    new.closed_at := null;
  elsif tg_op = 'INSERT' then
    /* Kapalı açılan lisans (ör. ürün "inactive" eklendi) hiç açılmadı: kapanış yok. */
    new.closed_at := null;
  elsif eski_durum in ('active', 'trialing', 'past_due') then
    new.closed_at := now();
  else
    /* Kapalıdan kapalıya (askıda → iptal): ilk kapanış anı korunuyor. */
    new.closed_at := old.closed_at;
  end if;
  return new;
end;
$$;

revoke all on function private.lisans_kapanis_tarihi() from public, anon, authenticated;

drop trigger if exists lisans_kapanis_tarihi on public.organization_licenses;
create trigger lisans_kapanis_tarihi before insert or update on public.organization_licenses
  for each row execute function private.lisans_kapanis_tarihi();
drop trigger if exists lisans_kapanis_tarihi on public.organization_product_licenses;
create trigger lisans_kapanis_tarihi before insert or update on public.organization_product_licenses
  for each row execute function private.lisans_kapanis_tarihi();
