/*
  DOÇENTLİK: BELGE KOVASI VE POLİTİKALARI (F6 PR3, 14.11.2026).

  Tablolar 20261114200939'da. Kova ayrı migration'da çünkü test düzeneği
  depo şemasını (storage.*) yalnızca bu kovayı sınayan testte kuruyor;
  20261114200939 ise bütün akış testlerinin önüne uygulanıyor.

  NEDEN AYRI KOVA (ArvoLab'daki K3). ArvoLab'da faaliyet belgesi ve ÜAK
  PDF'i `project-files` kovasında, yükleyen kişinin klasöründe
  duruyordu (`<kişi>/docentlik/…`, `<kişi>/uak/…`). O kovanın okuma
  politikası kişinin klasörünü kurumundaki gözetim rollerine
  KLASÖRÜN TAMAMIYLA açıyor: Doçentlik izni aynı klasördeki tez
  taslağını ve kaynak PDF'lerini de açıyordu. Ayrıca ÜAK PDF'ini başka
  bir yönetici silemiyordu (silme yalnızca klasör sahibine açık), sahipsiz
  dosya birikiyordu.

  YOLLAR (kurum her zaman ilk parça):
    <kurum>/faaliyet/<sahip>/<faaliyet>/<dosya>.pdf   faaliyet belgesi
    <kurum>/uak/<klasör>/<dosya>.pdf                   ÜAK tablosu
  Faaliyet belgesinin yolu var olan bir faaliyet satırına bağlı: kurum,
  sahip ve faaliyet kimliği o satırla birebir eşleşmeli. Uydurulmuş bir
  yol (başka kurumun kimliği, başka bir sahip, var olmayan faaliyet,
  fazladan klasör, "..", PDF olmayan uzantı) her işlemde reddedilir.

  İZİNLER
    Faaliyet belgesi: sahibi okur/yükler/siler; docentlik.tumunu_gor ve
      Kurum Sahibi yalnızca okur.
    ÜAK PDF'i: yalnızca docentlik.uak_yonet (ve Kurum Sahibi). Faaliyet
      izni ÜAK'ı, ÜAK izni faaliyeti AÇMAZ.
    Güncelleme (UPDATE; depo API'sinde "move" ve upsert/üzerine yazma):
      hiç kimse. Yeni belge yeni nesnedir. Bunu izin veren politikanın
      yokluğu değil, aşağıdaki kısıtlayıcı politika garanti eder.
    İmzalı URL: depo API'si imzayı ancak çağıran nesneyi SELECT ile
      görebiliyorsa üretir, yani okuma politikasına tabidir. İmzalı URL
      sahibine süresi dolana kadar erişim verir; sunucu kısa süre
      kullanmalı (ekran PR'ında).
*/

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docentlik-belgeleri', 'docentlik-belgeleri', false, 20 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* Yolun n'inci parçası uuid ise uuid, değilse NULL. Bozuk yol NULL kurum verir; NULL kurum hiçbir kapıdan geçmez. */
create or replace function private.docentlik_yol_uuid(p_name text, p_sira integer)
returns uuid
language sql
immutable
set search_path to ''
as $$
  select case
    when (string_to_array(p_name, '/'))[p_sira] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((string_to_array(p_name, '/'))[p_sira])::uuid
    else null
  end
$$;

/*
  Nesne izni. security definer, çünkü faaliyet satırının VAR OLDUĞUNU ve
  sahibini, çağıranın RLS'te o satırı görüp görmemesinden bağımsız sınaması
  gerekiyor: yol uydurulmuşsa satır yoktur ve izin verilmez. Modül kapısı
  politikada ayrıca duruyor.
*/
create or replace function private.docentlik_belge_izni(p_name text, p_islem text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_parca text[] := string_to_array(p_name, '/');
  v_kurum uuid := private.docentlik_yol_uuid(p_name, 1);
  v_sahip uuid;
  v_faaliyet uuid;
  v_ben uuid := (select auth.uid());
begin
  if v_kurum is null or v_ben is null or p_name like '%..%' then
    return false;
  end if;

  if v_parca[2] = 'faaliyet' then
    if array_length(v_parca, 1) <> 5 or v_parca[5] !~ '^[A-Za-z0-9._-]{1,200}\.pdf$' then
      return false;
    end if;
    v_sahip := private.docentlik_yol_uuid(p_name, 3);
    v_faaliyet := private.docentlik_yol_uuid(p_name, 4);
    if v_sahip is null or v_faaliyet is null then
      return false;
    end if;
    if not exists (select 1 from public.docentlik_faaliyetleri f
                   where f.id = v_faaliyet and f.organization_id = v_kurum and f.owner_id = v_sahip) then
      return false;
    end if;
    if p_islem = 'select' then
      return v_sahip = v_ben or private.docentlik_yetkisi(v_kurum, 'docentlik.tumunu_gor');
    end if;
    -- Yükleme ve silme yalnızca sahibin kendisi.
    return p_islem in ('insert', 'delete') and v_sahip = v_ben;
  end if;

  if v_parca[2] = 'uak' then
    if array_length(v_parca, 1) <> 4 or private.docentlik_yol_uuid(p_name, 3) is null
       or v_parca[4] !~ '^[A-Za-z0-9._-]{1,200}\.pdf$' then
      return false;
    end if;
    return p_islem in ('select', 'insert', 'delete')
       and private.docentlik_yetkisi(v_kurum, 'docentlik.uak_yonet');
  end if;

  return false;
end $$;

revoke all on function private.docentlik_yol_uuid(text, integer) from public, anon, authenticated, service_role;
revoke all on function private.docentlik_belge_izni(text, text) from public, anon, authenticated, service_role;
grant execute on function private.docentlik_yol_uuid(text, integer) to authenticated;
grant execute on function private.docentlik_belge_izni(text, text) to authenticated;

/*
  KISITLAYICI KAPILAR: KOVA KENDİ KENDİNE YETER.

  storage.objects BÜTÜN kovaların tek tablosu ve Postgres izin veren
  politikaları VEYA ile birleştiriyor. Bu depodaki öteki kova politikaları
  kendi kovalarıyla sınırlı (14.11.2026'da tarandı), ama canlıda panelden
  eklenmiş ya da ileride yazılacak tek bir geniş politika — ör. Supabase'in
  "kullanıcı kendi nesnesini günceller" şablonu (owner = auth.uid()),
  kova süzgeci olmadan — bu kovadaki nesneyi taşımaya, üzerine yazmaya ya
  da okumaya açardı. İlk sürümde (PR #319'un ilk commit'i) kısıtlayıcı
  politika yalnızca modül kapısını soruyordu: modülü açık bir kullanıcı
  için o koşul doğru, yani geniş bir UPDATE politikası taşımayı açardı
  (güvenlik incelemesi, 14.11.2026).

  Artık her işlem için ayrı bir kısıtlayıcı politika var ve izin koşulunun
  TAMAMINI taşıyor; izin veren politikalar ne derse desin bu kovada son söz
  bunlarda:
    SELECT / INSERT / DELETE  modül kapısı + docentlik_belge_izni
    UPDATE                    HİÇ KİMSE (yerinde değiştirme, yeniden
                              adlandırma, başka klasöre/kovaya taşıma ve
                              upsert'in ON CONFLICT DO UPDATE dalı)
  UPDATE'in with check'i başka bir kovadaki nesnenin bu kovaya
  taşınmasını da engelliyor.

  CASE bilerek: VEYA'nın sol tarafının önce değerlendirileceği garanti
  değil; öteki kovalardaki her satırda Doçentlik yardımcılarını çağırmak
  hem boşuna iş hem de yardımcılar kapalı olan rollerde hata olurdu.

  anon için ayrı ve işlev çağırmayan bir kapı: yardımcılar anon'a kapalı
  (#317), anon'un bu kovada zaten hiçbir işi yok.
*/
drop policy if exists docentlik_belgeleri_modul_kapisi on storage.objects;

drop policy if exists docentlik_belgeleri_kapi_okuma on storage.objects;
create policy docentlik_belgeleri_kapi_okuma on storage.objects as restrictive for select to authenticated
  using (case when bucket_id is distinct from 'docentlik-belgeleri' then true
              else private.modul_kurumda_acik(private.docentlik_yol_uuid(name, 1), 'docentlik')
                   and private.docentlik_belge_izni(name, 'select') end);

drop policy if exists docentlik_belgeleri_kapi_yukleme on storage.objects;
create policy docentlik_belgeleri_kapi_yukleme on storage.objects as restrictive for insert to authenticated
  with check (case when bucket_id is distinct from 'docentlik-belgeleri' then true
                   else private.modul_kurumda_acik(private.docentlik_yol_uuid(name, 1), 'docentlik')
                        and private.docentlik_belge_izni(name, 'insert') end);

drop policy if exists docentlik_belgeleri_kapi_guncelleme on storage.objects;
create policy docentlik_belgeleri_kapi_guncelleme on storage.objects as restrictive for update to authenticated
  using (bucket_id is distinct from 'docentlik-belgeleri')
  with check (bucket_id is distinct from 'docentlik-belgeleri');

drop policy if exists docentlik_belgeleri_kapi_silme on storage.objects;
create policy docentlik_belgeleri_kapi_silme on storage.objects as restrictive for delete to authenticated
  using (case when bucket_id is distinct from 'docentlik-belgeleri' then true
              else private.modul_kurumda_acik(private.docentlik_yol_uuid(name, 1), 'docentlik')
                   and private.docentlik_belge_izni(name, 'delete') end);

drop policy if exists docentlik_belgeleri_kapi_anon on storage.objects;
create policy docentlik_belgeleri_kapi_anon on storage.objects as restrictive for all to anon
  using (bucket_id is distinct from 'docentlik-belgeleri')
  with check (bucket_id is distinct from 'docentlik-belgeleri');

drop policy if exists docentlik_belgeleri_okur on storage.objects;
create policy docentlik_belgeleri_okur on storage.objects for select to authenticated
  using (bucket_id = 'docentlik-belgeleri'
         and private.modul_kurumda_acik(private.docentlik_yol_uuid(name, 1), 'docentlik')
         and private.docentlik_belge_izni(name, 'select'));

drop policy if exists docentlik_belgeleri_yukler on storage.objects;
create policy docentlik_belgeleri_yukler on storage.objects for insert to authenticated
  with check (bucket_id = 'docentlik-belgeleri'
              and private.modul_kurumda_acik(private.docentlik_yol_uuid(name, 1), 'docentlik')
              and private.docentlik_belge_izni(name, 'insert'));

drop policy if exists docentlik_belgeleri_siler on storage.objects;
create policy docentlik_belgeleri_siler on storage.objects for delete to authenticated
  using (bucket_id = 'docentlik-belgeleri'
         and private.modul_kurumda_acik(private.docentlik_yol_uuid(name, 1), 'docentlik')
         and private.docentlik_belge_izni(name, 'delete'));

-- İzin veren UPDATE politikası bilerek YOK; kısıtlayıcı kapı da UPDATE'i bu kovada tümden reddediyor.
