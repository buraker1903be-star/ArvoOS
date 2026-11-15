/*
  DOÇENTLİK: BELGE YOLU GÜVENLİĞİ, SAHİPSİZ BELGE TEMİZLİĞİ, GÖZETİM ADLARI
  VE SAYFALI GÖZETİM LİSTESİ (F6 PR8, 15.11.2026).

  PR7'de gerçek PostgREST'te ölçülen üç açık ve bir performans sorunu:

  1. belge_yolu İSTEMCİYE AÇIKTI. Sütun düzeyindeki UPDATE yetkisi
     (20261114200939) kullanıcının yolu doğrudan PostgREST ile yazmasına
     izin veriyordu: sunucu işleminin "%PDF-" imza denetimi ve eski nesne
     temizliği atlanabiliyordu (PR7, tests/entegrasyon 5b). Yetki kaldırıldı;
     bağlama ve kaldırma YALNIZCA service_role'ün çalıştırabildiği iki
     işlevden geçiyor. Sunucu işlemi önce kullanıcının oturumuyla sahipliği
     ve PDF içeriğini doğruluyor, sonra bu işlevi yönetici istemcisiyle
     çağırıyor; işlev aynı kuralları veritabanında YENİDEN uyguluyor.

     NEDEN SECURITY DEFINER DEĞİL. İşlevler security invoker ve yalnızca
     service_role'e açık: çağıran zaten RLS'i aşan sunucu rolü, yükseltilecek
     bir yetki yok. definer olsaydı sahibi (postgres) adına çalışır ve
     execute yetkisindeki tek bir hata herkese yol yazdırırdı. Kullanıcı
     kimliği parametreyle geliyor (service_role'ün auth.uid()'i yok); bu
     yüzden işlev, modül erişimini kullanıcıya özel değerlendiren yardımcılar
     (private.modul_kurumda_acik → arvo_modul_acik, auth.uid()'e bakıyor)
     doğru kişi için çalışsın diye işlem süresince JWT iddiasını o kişiye
     ayarlıyor (set_config(..., true): yalnızca bu işlem). Sonuç: RLS'in
     güncelleme politikasıyla AYNI yüklem (sahip + modül + üyelik).

  2. SAHİPSİZ BELGE. Tarayıcı yükleme ile kayıt arasında kapanırsa nesne
     kovada kalıyordu. Temizlik saatlik cron (app/api/cron/docentlik-belge-
     temizligi) ve buradaki üç işlevle: aday seçimi + kira (aynı nesneye iki
     temizleyici dokunmasın), silmeden hemen önce yeniden doğrulama, sonuç
     kaydı (başarısızlıkta geri çekilmeli yeniden deneme). Silme Storage
     API'siyle yapılıyor (dosya da gitsin); burada satır silinmiyor.
     Eşik en az 24 saat ve SQL'de zorlanıyor (çağıran düşüremez). Bağlama
     yalnızca 1 saatten YENİ nesneyi kabul ediyor: bağlayan ile temizleyici
     hiçbir zaman aynı nesneye bakmıyor.

  3. GÖZETİM ADLARI. profiles RLS'i yalnızca kişinin kendi satırına açık ve
     GEVŞETİLMEDİ. Dar bir definer işlev: yalnızca docentlik.tumunu_gor
     yetkili, aktif üye, modül açık; yalnızca aynı kurumun üyeleri; yalnızca
     (kişi, ad). E-posta, doktora tarihi, telefon dönmez.

  4. SAYFALI GÖZETİM. Liste 1102 kişiyi tek sayfada çiziyordu; sayma ve
     sayfalama artık veritabanında, kararlı sıralamayla (faaliyet sayısı,
     sonra kişi kimliği).
*/

-- ---------- 1. belge_yolu: istemci yazamaz ----------

revoke update (belge_yolu) on public.docentlik_faaliyetleri from authenticated;
revoke insert (belge_yolu) on public.docentlik_faaliyetleri from authenticated;

/* İşlevin kendi hata kodları: sunucu işlemi Türkçe mesaja çeviriyor (lib/docentlik-islem → belgeBaglamaHatasi). */
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
  -- Yol biçimi: <kurum>/faaliyet/<sahip>/<faaliyet>/<uuid>.pdf — sunucunun ürettiğinin aynısı.
  if p_yol !~ ('^' || p_org::text || '/faaliyet/' || p_kullanici::text || '/' || p_faaliyet::text
               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$') then
    raise exception 'Belge yolu bu kişi ve faaliyete ait değil.' using errcode = 'DB403';
  end if;

  -- Kullanıcıya özel modül erişimi auth.uid()'e bakıyor: işlem süresince o kişi.
  perform set_config('request.jwt.claims', json_build_object('sub', p_kullanici, 'role', 'authenticated')::text, true);

  select f.belge_yolu into v_eski
  from public.docentlik_faaliyetleri f
  where f.id = p_faaliyet and f.organization_id = p_org and f.owner_id = p_kullanici
    and private.modul_kurumda_acik(p_org, 'docentlik')
  for update;
  if not found then
    raise exception 'Faaliyet bulunamadı ya da belge ekleme yetkiniz yok.' using errcode = 'DB403';
  end if;
  -- İyimser kilit: arada başka bir bağlama olduysa üzerine yazılmaz (eski bağlantı korunur).
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
  if exists (select 1 from private.docentlik_belge_temizligi t
             where t.nesne_id = v_nesne.id and t.kira_bitis > now()) then
    raise exception 'Dosya temizleniyor; yeniden yükleyin.' using errcode = 'DB410';
  end if;

  update public.docentlik_faaliyetleri set belge_yolu = p_yol where id = p_faaliyet;
  return query select v_eski;
end $$;

create or replace function public.docentlik_belge_kaldir(
  p_kullanici uuid, p_org uuid, p_faaliyet uuid, p_eski text
)
returns table (eski_yol text)
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_eski text;
begin
  if p_kullanici is null or p_org is null or p_faaliyet is null then
    raise exception 'Eksik bilgi.' using errcode = 'DB400';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_kullanici, 'role', 'authenticated')::text, true);
  select f.belge_yolu into v_eski
  from public.docentlik_faaliyetleri f
  where f.id = p_faaliyet and f.organization_id = p_org and f.owner_id = p_kullanici
    and private.modul_kurumda_acik(p_org, 'docentlik')
  for update;
  if not found then
    raise exception 'Faaliyet bulunamadı ya da belge kaldırma yetkiniz yok.' using errcode = 'DB403';
  end if;
  if v_eski is distinct from p_eski then
    raise exception 'Belge bu arada değişti; sayfayı yenileyin.' using errcode = 'DB409';
  end if;
  update public.docentlik_faaliyetleri set belge_yolu = null where id = p_faaliyet;
  return query select v_eski;
end $$;

revoke all on function public.docentlik_belge_bagla(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_belge_kaldir(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.docentlik_belge_bagla(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.docentlik_belge_kaldir(uuid, uuid, uuid, text) to service_role;

-- ---------- 2. Sahipsiz belge temizliği ----------

/*
  Kira ve deneme kaydı. private şemasında: PostgREST'e açık değil, yalnızca
  service_role'ün işlevleri yazıyor. Nesnenin YOLU burada tutuluyor (silmek
  için gerekli) ama günlüğe yazılmıyor; günlük ve cron kaydı yalnızca sayı
  ve nesne kimliği taşıyor.
*/
create table if not exists private.docentlik_belge_temizligi (
  nesne_id uuid primary key,
  ad text not null check (ad ~ '^[0-9a-f-]{36}/(faaliyet|uak)/'),
  deneme integer not null default 0 check (deneme >= 0),
  kira uuid,
  kira_bitis timestamptz,
  son_hata text check (son_hata is null or char_length(son_hata) <= 200),
  ilk_gorulme timestamptz not null default now(),
  son_deneme timestamptz
);
alter table private.docentlik_belge_temizligi enable row level security;
revoke all on table private.docentlik_belge_temizligi from public, anon, authenticated;
grant select, insert, update, delete on table private.docentlik_belge_temizligi to service_role;

/*
  Aday seç ve kirala. Eşik en az 24 saat (greatest). Aday: docentlik
  kovasında, biçimi doçentlik yolu olan, hiçbir faaliyetin ya da ÜAK
  tablosunun göstermediği nesne. FOR UPDATE SKIP LOCKED + kira: iki
  temizleyici aynı anda koşarsa her nesneyi yalnızca biri alır. Kirası
  dolmamış ya da geri çekilme süresi geçmemiş nesne alınmaz.
*/
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
      set kira = excluded.kira, kira_bitis = excluded.kira_bitis, son_deneme = excluded.son_deneme
      where t.kira_bitis is null or t.kira_bitis <= now()
    returning t.nesne_id, t.ad, t.kira
  )
  select k.nesne_id, k.ad, k.kira from kiralanan k where k.kira = v_kira;
end $$;

/*
  SİLMEDEN HEMEN ÖNCE: kira hâlâ bende mi, nesne hâlâ kovada ve 24 saatten
  eski mi, hâlâ hiçbir kayıt göstermiyor mu? Değilse kira bırakılır ve
  silinmez (null döner). Dönen ad, silinecek tek nesne.
*/
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
  where t.nesne_id = p_nesne and t.kira = p_kira and t.kira_bitis > now()
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
    delete from private.docentlik_belge_temizligi where nesne_id = p_nesne;
    return null;
  end if;
  return v_ad;
end $$;

/*
  Sonuç. Başarı: kayıt silinir (nesne gitti). Başarısızlık: deneme artar,
  kira bırakılır ve bir sonraki deneme üstel geri çekilmeyle (en çok 24
  saat) ertelenir; nesne silinene ya da bir kayda bağlanana kadar her gün
  en az bir kez yeniden denenir. Hata metni 200 karakterle sınırlı ve yol
  taşımaz (çağıran yalnızca kod/mesaj veriyor).
*/
create or replace function public.docentlik_temizlik_sonuc(p_nesne uuid, p_kira uuid, p_basarili boolean, p_hata text)
returns void
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if p_basarili then
    delete from private.docentlik_belge_temizligi where nesne_id = p_nesne and kira = p_kira;
  else
    update private.docentlik_belge_temizligi
      set deneme = deneme + 1,
          kira = null,
          son_hata = left(coalesce(p_hata, 'bilinmeyen hata'), 200),
          kira_bitis = now() + least(interval '1 minute' * power(2, least(deneme + 1, 11)), interval '24 hours')
      where nesne_id = p_nesne and kira = p_kira;
  end if;
end $$;

/* Görünürlük: bekleyen başarısız silmelerin sayısı ve en çok deneme (yol yok). */
create or replace function public.docentlik_temizlik_durumu()
returns table (bekleyen_hatali bigint, en_cok_deneme integer)
language sql
stable
security invoker
set search_path to ''
as $$
  select count(*) filter (where t.deneme > 0), coalesce(max(t.deneme), 0)
  from private.docentlik_belge_temizligi t
$$;

revoke all on function public.docentlik_temizlik_al(interval, integer) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_temizlik_onayla(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_temizlik_sonuc(uuid, uuid, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_temizlik_durumu() from public, anon, authenticated, service_role;
grant execute on function public.docentlik_temizlik_al(interval, integer) to service_role;
grant execute on function public.docentlik_temizlik_onayla(uuid, uuid) to service_role;
grant execute on function public.docentlik_temizlik_sonuc(uuid, uuid, boolean, text) to service_role;
grant execute on function public.docentlik_temizlik_durumu() to service_role;

-- ---------- 3. Gözetim adları ----------

/*
  definer: profiles RLS'i kişinin kendisine açık; gözetimci başkasının
  adını oradan okuyamıyor. Kapı ilk satırda: tumunu_gor (aktif üyelik
  içinde) + modül. Yalnızca p_org'un üyesi olan kişiler; en çok 200 kişi
  (bir sayfa). Dönen tek alan ad: kurumun personel kaydındaki yazım,
  yoksa profildeki ad.
*/
create or replace function public.docentlik_kisi_adlari(p_org uuid, p_kisiler uuid[])
returns table (kisi uuid, ad text)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if p_org is null or p_kisiler is null
     or not private.modul_kurumda_acik(p_org, 'docentlik')
     or not private.docentlik_yetkisi(p_org, 'docentlik.tumunu_gor') then
    return;
  end if;
  if coalesce(array_length(p_kisiler, 1), 0) > 200 then
    raise exception 'Tek istekte en çok 200 kişi.' using errcode = '22023';
  end if;
  return query
  select m.user_id,
         coalesce(nullif(btrim(h.full_name), ''), nullif(btrim(p.full_name), ''))
  from public.organization_memberships m
  left join lateral (select e.full_name from public.hr_employees e
                     where e.organization_id = p_org and e.user_id = m.user_id
                     order by e.full_name limit 1) h on true
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_org and m.user_id = any (p_kisiler);
end $$;

revoke all on function public.docentlik_kisi_adlari(uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.docentlik_kisi_adlari(uuid, uuid[]) to authenticated;

-- ---------- 4. Sayfalı gözetim listesi ve özeti ----------

/*
  Kişi kümesi: kurumda Doçentlik profili OLAN ya da faaliyeti olan herkes
  (profilsiz faaliyet sahibi de listede). Doktora TARİHİ dönmez, yalnızca
  "girildi mi". Sıralama kararlı: faaliyet sayısı azalan, eşitlikte kişi
  kimliği; toplam her satırda (pencere), sayfa boyu en çok 100.
*/
create or replace function public.docentlik_gozetim_listesi(p_org uuid, p_sinir integer, p_atla integer)
returns table (kisi uuid, temel_alan text, alt_alan text, doktora_tarihi_girildi boolean, faaliyet_sayisi bigint, toplam bigint)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if p_org is null or not private.modul_kurumda_acik(p_org, 'docentlik')
     or not private.docentlik_yetkisi(p_org, 'docentlik.tumunu_gor') then
    return;
  end if;
  return query
  with sayilar as (
    select f.owner_id as kisi, count(*) as adet
    from public.docentlik_faaliyetleri f where f.organization_id = p_org group by f.owner_id
  ), kisiler as (
    select p.owner_id as kisi from public.docentlik_profilleri p where p.organization_id = p_org
    union
    select s.kisi from sayilar s
  )
  select k.kisi, pr.temel_alan, pr.alt_alan, (pr.doktora_tarihi is not null),
         coalesce(s.adet, 0), count(*) over ()
  from kisiler k
  left join public.docentlik_profilleri pr on pr.organization_id = p_org and pr.owner_id = k.kisi
  left join sayilar s on s.kisi = k.kisi
  order by coalesce(s.adet, 0) desc, k.kisi
  limit least(greatest(coalesce(p_sinir, 50), 1), 100)
  offset greatest(coalesce(p_atla, 0), 0);
end $$;

create or replace function public.docentlik_gozetim_ozeti(p_org uuid)
returns table (kisi_sayisi bigint, faaliyet_sayisi bigint, tarihsiz_sayisi bigint)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if p_org is null or not private.modul_kurumda_acik(p_org, 'docentlik')
     or not private.docentlik_yetkisi(p_org, 'docentlik.tumunu_gor') then
    return;
  end if;
  return query
  with kisiler as (
    select p.owner_id as kisi from public.docentlik_profilleri p where p.organization_id = p_org
    union
    select f.owner_id from public.docentlik_faaliyetleri f where f.organization_id = p_org
  )
  select count(*),
         (select count(*) from public.docentlik_faaliyetleri f where f.organization_id = p_org),
         count(*) filter (where not exists (select 1 from public.docentlik_profilleri pr
                                            where pr.organization_id = p_org and pr.owner_id = k.kisi
                                              and pr.doktora_tarihi is not null))
  from kisiler k;
end $$;

revoke all on function public.docentlik_gozetim_listesi(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_gozetim_ozeti(uuid) from public, anon, authenticated, service_role;
grant execute on function public.docentlik_gozetim_listesi(uuid, integer, integer) to authenticated;
grant execute on function public.docentlik_gozetim_ozeti(uuid) to authenticated;

notify pgrst, 'reload schema';
