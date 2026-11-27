/*
  DOÇENTLİK SAHİPSİZ BELGE TEMİZLİĞİ: AD KİLİDİ (F6 PR8 son güvenlik kabulü, 15.11.2026).

  20261115145234'teki temizlik, gerçek PostgreSQL + Storage üzerinde iki
  yarışta KAYDA BAĞLI bir PDF'i sildi (tests/entegrasyon/docentlik-yaris):

  1. AYNI AD, YENİ NESNE. Temizleyici "onayla"dan sonra nesneyi Storage
     API'siyle ADIYLA siliyor (API kimlikle silmiyor). Arada sahip kendi
     sahipsiz nesnesini silip AYNI adla yeniden yükledi ve faaliyete bağladı:
     bağlama işlevinin kira denetimi nesne KİMLİĞİNE bakıyordu, yeni nesnenin
     kimliği farklıydı → bağlama geçti; gecikmiş silme bağlı belgeyi götürdü.
  2. ÜAK depo_yolu DENETİMSİZDİ. uak_yonet yetkili kullanıcı PostgREST'ten
     doğrudan, temizleyicinin onayladığı eski bir nesneye ÜAK kaydı yazdı;
     silme yine gerçekleşti, kayıt silinmiş dosyayı gösterdi.

  Kural artık: bir ad için temizlik kaydı VARSA (kiralı, hatalı ya da
  kapanmış) o ad hiçbir kayda bağlanamaz. Temizlik kaydı silme ya da
  vazgeçme sonrası hemen silinmiyor, 24 saat KAPANMIŞ olarak kalıyor: kirası
  dolmuş, hâlâ silme isteği yolda olan gecikmiş bir temizleyici bu süre
  boyunca aynı adlı yeni bir nesneyi bağlı bulamaz. 24 saat, bir HTTP
  isteğinin yaşayabileceği her süreden uzun. ÜAK yazımı da (authenticated)
  faaliyetle aynı kurala bağlandı: nesne kovada, yeni (1 saat), çağıranın
  yüklediği ve temizlik kaydı olmayan bir ad olmalı.
*/

alter table private.docentlik_belge_temizligi add column if not exists kapandi_at timestamptz;
create index if not exists docentlik_belge_temizligi_ad on private.docentlik_belge_temizligi (ad);

-- ---------- Bağlama: ad temizlik kaydındaysa reddet ----------
-- Gövde 20261115145234'ten; değişen tek satır temizlik denetimi (kimlik + etkin kira → ad + her durum).
create or replace function public.docentlik_belge_bagla(
  p_kullanici uuid, p_org uuid, p_faaliyet uuid, p_yol text, p_eski text
)
returns table (eski_yol text)
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_eski text;
  v_nesne record;
begin
  if p_kullanici is null or p_org is null or p_faaliyet is null or p_yol is null then
    raise exception 'Eksik bağlama bilgisi.' using errcode = 'DB400';
  end if;
  if p_yol !~ ('^' || p_org::text || '/faaliyet/' || p_kullanici::text || '/' || p_faaliyet::text
               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$') then
    raise exception 'Belge yolu bu kişi ve faaliyete ait değil.' using errcode = 'DB403';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', p_kullanici, 'role', 'authenticated')::text, true);

  select f.belge_yolu into v_eski
  from public.docentlik_faaliyetleri f
  where f.id = p_faaliyet and f.organization_id = p_org and f.owner_id = p_kullanici
    and private.modul_kurumda_acik(p_org, 'docentlik')
  for update;
  if not found then
    raise exception 'Faaliyet bulunamadı ya da belge ekleme yetkiniz yok.' using errcode = 'DB403';
  end if;
  if v_eski is distinct from p_eski then
    raise exception 'Belge bu arada değişti; sayfayı yenileyin.' using errcode = 'DB409';
  end if;

  select o.id, o.created_at, o.metadata into v_nesne
  from storage.objects o
  where o.bucket_id = 'docentlik-belgeleri' and o.name = p_yol
    and (o.owner_id = p_kullanici::text or o.owner = p_kullanici);
  if not found then
    raise exception 'Dosya depoda bulunamadı.' using errcode = 'DB404';
  end if;
  if coalesce(v_nesne.metadata ->> 'mimetype', '') <> 'application/pdf'
     or coalesce((v_nesne.metadata ->> 'size')::bigint, 0) not between 1 and 20971520 then
    raise exception 'Dosya PDF değil ya da boyutu uygun değil.' using errcode = 'DB415';
  end if;
  if v_nesne.created_at < now() - interval '1 hour' then
    raise exception 'Yükleme çok eski; dosyayı yeniden yükleyin.' using errcode = 'DB410';
  end if;
  if exists (select 1 from private.docentlik_belge_temizligi t where t.ad = p_yol) then
    raise exception 'Dosya temizleniyor; yeniden yükleyin.' using errcode = 'DB410';
  end if;

  update public.docentlik_faaliyetleri set belge_yolu = p_yol where id = p_faaliyet;
  return query select v_eski;
end $$;

revoke all on function public.docentlik_belge_bagla(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.docentlik_belge_bagla(uuid, uuid, uuid, text, text) to service_role;

-- ---------- ÜAK: aynı kural (authenticated yazımı) ----------
/*
  definer: temizlik tablosu ve başkasının görmediği storage satırları
  authenticated'e kapalı. Kimlik parametreyle DEĞİL auth.uid()'den: yalnızca
  çağıranın kendi yüklediği nesne için evet/hayır söyler.
*/
create or replace function private.docentlik_uak_nesnesi_baglanabilir(p_ad text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'docentlik-belgeleri' and o.name = p_ad
      and (o.owner_id = (select auth.uid())::text or o.owner = (select auth.uid()))
      and o.created_at >= now() - interval '1 hour'
  ) and not exists (select 1 from private.docentlik_belge_temizligi t where t.ad = p_ad)
$$;
revoke all on function private.docentlik_uak_nesnesi_baglanabilir(text) from public, anon, authenticated, service_role;
grant execute on function private.docentlik_uak_nesnesi_baglanabilir(text) to authenticated;

-- Gövde canlı/yerel anlık görüntüden (private.docentlik_uak_koru); eklenen tek şey depo_yolu denetimi.
create or replace function private.docentlik_uak_koru()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.depo_yolu is distinct from old.depo_yolu)
     and not private.docentlik_uak_nesnesi_baglanabilir(new.depo_yolu) then
    raise exception 'ÜAK dosyası bulunamadı, eski ya da temizleniyor; yeniden yükleyin.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.durum <> 'yuklendi' or new.oneri is not null or new.onaylayan is not null or new.onaylandi_at is not null then
      raise exception 'ÜAK önerisi ve onayı yalnızca sunucu tarafından yazılır.' using errcode = '42501';
    end if;
    new.yukleyen := (select auth.uid());
    return new;
  end if;
  if new.durum is distinct from old.durum or new.oneri is distinct from old.oneri
     or new.onaylayan is distinct from old.onaylayan or new.onaylandi_at is distinct from old.onaylandi_at
     or new.yukleyen is distinct from old.yukleyen then
    raise exception 'ÜAK önerisi ve onayı yalnızca sunucu tarafından yazılır.' using errcode = '42501';
  end if;
  return new;
end $function$;

-- ---------- Temizlik: kayıt silinmiyor, 24 saat kapanmış kalıyor ----------
-- Gövdeler 20261115145234'ten; değişenler: kapanmış satırlar, kendiliğinden kapanma, 24 saatlik süpürme.
create or replace function public.docentlik_temizlik_al(p_esik interval, p_sinir integer)
returns table (nesne_id uuid, ad text, kira uuid)
language plpgsql
security invoker
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_kira uuid := gen_random_uuid();
  v_esik interval := greatest(coalesce(p_esik, interval '24 hours'), interval '24 hours');
  v_sinir integer := least(greatest(coalesce(p_sinir, 100), 1), 500);
begin
  -- Ad kilidi 24 saat; sonra kapanmış satır gider.
  delete from private.docentlik_belge_temizligi t where t.kapandi_at < now() - interval '24 hours';
  /* Nesnesi artık olmayan, kirası dolmuş açık satır kapanır: başka bir temizleyici (kirası düşmüş)
     ya da sahip silmiş olabilir. Satır silinmez, kapanır — ad kilidi yine 24 saat sürer. */
  update private.docentlik_belge_temizligi t set kapandi_at = now(), kira = null
  where t.kapandi_at is null and (t.kira_bitis is null or t.kira_bitis <= now())
    and not exists (select 1 from storage.objects o where o.id = t.nesne_id);

  return query
  with aday as (
    select o.id, o.name
    from storage.objects o
    where o.bucket_id = 'docentlik-belgeleri'
      and o.created_at < now() - v_esik
      and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(faaliyet|uak)/'
      and not exists (select 1 from public.docentlik_faaliyetleri f where f.belge_yolu = o.name)
      and not exists (select 1 from public.docentlik_uak_tablolari u where u.depo_yolu = o.name)
      and not exists (select 1 from private.docentlik_belge_temizligi t
                      where t.nesne_id = o.id and t.kira_bitis > now())
    order by o.created_at, o.id
    limit v_sinir
    for update of o skip locked
  ), kiralanan as (
    insert into private.docentlik_belge_temizligi as t (nesne_id, ad, kira, kira_bitis, son_deneme)
    select a.id, a.name, v_kira, now() + interval '10 minutes', now() from aday a
    on conflict (nesne_id) do update
      set kira = excluded.kira, kira_bitis = excluded.kira_bitis, son_deneme = excluded.son_deneme, kapandi_at = null
      where t.kira_bitis is null or t.kira_bitis <= now()
    returning t.nesne_id, t.ad, t.kira
  )
  select k.nesne_id, k.ad, k.kira from kiralanan k where k.kira = v_kira;
end $$;

create or replace function public.docentlik_temizlik_onayla(p_nesne uuid, p_kira uuid)
returns text
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_ad text;
begin
  select t.ad into v_ad from private.docentlik_belge_temizligi t
  where t.nesne_id = p_nesne and t.kira = p_kira and t.kira_bitis > now() and t.kapandi_at is null
  for update;
  if not found then
    return null;
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.id = p_nesne and o.bucket_id = 'docentlik-belgeleri' and o.name = v_ad
      and o.created_at < now() - interval '24 hours'
  ) or exists (select 1 from public.docentlik_faaliyetleri f where f.belge_yolu = v_ad)
    or exists (select 1 from public.docentlik_uak_tablolari u where u.depo_yolu = v_ad) then
    -- Eskiden satır siliniyordu; kapanıyor (ad kilidi 24 saat).
    update private.docentlik_belge_temizligi set kapandi_at = now(), kira = null, kira_bitis = null where nesne_id = p_nesne;
    return null;
  end if;
  return v_ad;
end $$;

create or replace function public.docentlik_temizlik_sonuc(p_nesne uuid, p_kira uuid, p_basarili boolean, p_hata text)
returns void
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if p_basarili then
    -- Eskiden satır siliniyordu; kapanıyor (ad kilidi 24 saat).
    update private.docentlik_belge_temizligi
      set kapandi_at = now(), kira = null, kira_bitis = null, son_hata = null
      where nesne_id = p_nesne and kira = p_kira;
  else
    update private.docentlik_belge_temizligi
      set deneme = deneme + 1,
          kira = null,
          son_hata = left(coalesce(p_hata, 'bilinmeyen hata'), 200),
          kira_bitis = now() + least(interval '1 minute' * power(2, least(deneme + 1, 11)), interval '24 hours')
      where nesne_id = p_nesne and kira = p_kira;
  end if;
end $$;

create or replace function public.docentlik_temizlik_durumu()
returns table (bekleyen_hatali bigint, en_cok_deneme integer)
language sql
stable
security invoker
set search_path to ''
as $$
  select count(*) filter (where t.deneme > 0), coalesce(max(t.deneme), 0)
  from private.docentlik_belge_temizligi t
  where t.kapandi_at is null
$$;

revoke all on function public.docentlik_temizlik_al(interval, integer) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_temizlik_onayla(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_temizlik_sonuc(uuid, uuid, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_temizlik_durumu() from public, anon, authenticated, service_role;
grant execute on function public.docentlik_temizlik_al(interval, integer) to service_role;
grant execute on function public.docentlik_temizlik_onayla(uuid, uuid) to service_role;
grant execute on function public.docentlik_temizlik_sonuc(uuid, uuid, boolean, text) to service_role;
grant execute on function public.docentlik_temizlik_durumu() to service_role;

notify pgrst, 'reload schema';
