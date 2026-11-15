/*
  DOÇENTLİK: İSTEK ANAHTARI İÇERİĞE BAĞLI (F6 PR5, 15.11.2026).

  Eskiden docentlik_faaliyet_ekle (20261115014302) istek anahtarı
  çakışınca ilk kaydı İÇERİĞE BAKMADAN döndürüyordu: aynı anahtarla FARKLI
  bir faaliyet gönderen istemci (form yeniden kullanıldı, anahtar
  yenilenmedi, hatalı istemci) "kaydedildi" cevabı alıyor, ama yazdığı
  faaliyet hiçbir yerde yoktu — sessiz veri kaybı.

  Şimdi her anahtarlı kayıt, İLK isteğin içeriğinin değişmez bir özetini
  (istek_ozeti) taşıyor. Çakışmada gelen içeriğin özeti karşılaştırılır:
   - aynı içerik  → ilk kayıt döner (tekrar = true);
   - farklı içerik → DP002 hatası; yeni satır yok, mevcut satıra dokunulmaz.

  ÖZETİ KİM YAZAR. Bir tetikleyici, ekleme anında satırın SON hâlinden
  (puan tetikleyicisi başlıca bayrağını normalleştirdikten sonra; ad
  sırasıyla "docentlik_faaliyet_puani" < "docentlik_istek_ozeti") hesaplar.
  authenticated'ın bu sütuna yazma yetkisi yok; doğrudan tablo yazımında
  da özeti istemci seçemez. Güncellemede eski değer korunur: özet bir
  İSTEĞİN kimliği, kaydın bugünkü hâli değil.

  KAYIT SONRADAN DÜZENLENİRSE. Karşılaştırma ilk isteğe yapılır, kaydın
  bugünkü hâline değil. İlk isteğin aynısı yeniden gelirse (ağın geç
  teslim ettiği tekrar) kayıt "tekrar" olarak döner ve düzenleme
  BOZULMAZ — tekrar hiçbir şey yazmaz. Düzenlenmiş içerikle aynı anahtar
  gelirse DP002: o bir tekrar değil, anahtarın yeniden kullanımı.

  NORMALLEŞTİRME. Sunucu formu zaten kırpıyor; özet aynı kuralları
  veritabanında da uygular ki doğrudan yazım ile RPC aynı sonucu versin:
  başlık ve not baştan/sondan boşluk (sekme, satır sonu dahil) kırpılır, boş not NULL; birim sayısı trim_scale (1 = 1.0);
  tek yazarda başlıca her zaman true (tetikleyicinin kuralı); tarih ISO
  (date::text); NULL, JSON dizisinde null olarak — boş metinle karışmaz.

  ÖZETİ OLMAYAN ANAHTARLI SATIR. Bu migration'dan önce yazılmış satır
  (canlıda henüz yok) özetsizdir; çakışmada içerik doğrulanamadığı için
  DP002 verilir (temkinli taraf: yanlış "tekrar" veri kaybıdır).

  EŞZAMANLILIK değişmedi: aynı anahtarlı iki eşzamanlı istekten ikincisi
  tekil dizinde ilkinin işlemesini bekler, sonra ON CONFLICT dalına düşüp
  özeti karşılaştırır; ilki geri alınırsa ikincisi kendisi yazar.

  İşlem, RLS ve puan karşılaştırması 20261115014302'deki gibi; işlev
  gövdesi oradan alındı, yalnızca çakışma dalı değişti.

  BAĞIMLILIK: 20261114200939, 20261114213340, 20261115014302.
*/

alter table public.docentlik_faaliyetleri
  add column if not exists istek_ozeti text;

/* Saf ve değişmez: aynı girdi her zaman aynı özet. Hem tetikleyici hem RPC
   çağırır; ikisi farklı normalleştirseydi her tekrar DP002 olurdu. */
create or replace function private.docentlik_istek_ozeti(
  p_kriter uuid,
  p_baslik text,
  p_birim numeric,
  p_yazar_sayisi integer,
  p_baslica boolean,
  p_tarih date,
  p_notlar text
)
returns text
language sql
immutable
set search_path to ''
as $$
  select encode(sha256(convert_to(jsonb_build_array(
    p_kriter,
    regexp_replace(p_baslik, '^\s+|\s+$', '', 'g'),
    trim_scale(p_birim),
    p_yazar_sayisi,
    case when p_yazar_sayisi = 1 then true else p_baslica end,
    p_tarih::text,
    nullif(regexp_replace(p_notlar, '^\s+|\s+$', '', 'g'), '')
  )::text, 'UTF8')), 'hex')
$$;

revoke all on function private.docentlik_istek_ozeti(uuid, text, numeric, integer, boolean, date, text)
  from public, anon, authenticated, service_role;
/* RPC ve tetikleyici çağıranın yetkisiyle çalışıyor (invoker): tabloya yazan
   her rol (authenticated, service_role) bu işlevi çalıştırabilmeli, yoksa
   service_role'ün yazımı tetikleyicide düşer. İşlev yalnızca bir özet
   hesaplar, hiçbir veri okumaz; anon tabloya yazamadığı için kapalı. */
grant execute on function private.docentlik_istek_ozeti(uuid, text, numeric, integer, boolean, date, text)
  to authenticated, service_role;

create or replace function private.docentlik_istek_ozeti_yaz()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    new.istek_ozeti := case when new.istek_anahtari is null then null else
      private.docentlik_istek_ozeti(new.criteria_id, new.title, new.unit_count, new.yazar_sayisi,
                                    new.baslica_yazar, new.faaliyet_tarihi, new.notes) end;
  else
    new.istek_ozeti := old.istek_ozeti;
  end if;
  return new;
end $$;

revoke all on function private.docentlik_istek_ozeti_yaz() from public, anon, authenticated, service_role;

drop trigger if exists docentlik_istek_ozeti on public.docentlik_faaliyetleri;
create trigger docentlik_istek_ozeti
  before insert or update on public.docentlik_faaliyetleri
  for each row execute function private.docentlik_istek_ozeti_yaz();

create or replace function public.docentlik_faaliyet_ekle(
  p_org uuid,
  p_kriter uuid,
  p_baslik text,
  p_birim numeric,
  p_yazar_sayisi integer,
  p_baslica boolean,
  p_tarih date,
  p_notlar text,
  p_istek_anahtari uuid,
  p_beklenen_puan double precision,
  p_beklenen_katsayi double precision,
  p_beklenen_surum text
)
returns table (kayit_id uuid, tekrar boolean)
language plpgsql
volatile
security invoker
set search_path to ''
as $$
declare
  v_ben uuid := auth.uid();
  v_id uuid;
  v_puan numeric;
  v_katsayi numeric;
  v_surum text;
  v_ozet text;
begin
  if v_ben is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  if p_beklenen_puan is null or p_beklenen_katsayi is null or p_beklenen_surum is null then
    raise exception 'Beklenen puan verilmedi.' using errcode = '22004';
  end if;

  insert into public.docentlik_faaliyetleri as f
    (organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar,
     faaliyet_tarihi, notes, istek_anahtari)
  values
    (p_org, v_ben, p_kriter, p_baslik, p_birim, p_yazar_sayisi, p_baslica,
     p_tarih, p_notlar, p_istek_anahtari)
  on conflict (organization_id, owner_id, istek_anahtari) do nothing
  returning f.id, f.computed_points, f.paylasim_katsayisi, f.kural_surumu
    into v_id, v_puan, v_katsayi, v_surum;

  if v_id is null then
    -- Yalnızca istek anahtarı çakışınca (NULL anahtar çakışmaz). Aynı kişinin
    -- aynı kurumdaki kaydı; başkasınınki tekil dizinde zaten ayrı.
    select f.id, f.istek_ozeti into v_id, v_ozet
      from public.docentlik_faaliyetleri f
     where f.organization_id = p_org and f.owner_id = v_ben and f.istek_anahtari = p_istek_anahtari;
    if v_id is null then
      raise exception 'Faaliyet kaydedilemedi.' using errcode = 'P0002';
    end if;
    if v_ozet is null or v_ozet is distinct from
       private.docentlik_istek_ozeti(p_kriter, p_baslik, p_birim, p_yazar_sayisi, p_baslica, p_tarih, p_notlar) then
      raise exception 'Bu istek anahtarı başka bir faaliyet için kullanılmış; faaliyet kaydedilmedi.'
        using errcode = 'DP002';
    end if;
    return query select v_id, true;
    return;
  end if;

  if v_puan::double precision is distinct from p_beklenen_puan
     or v_katsayi::double precision is distinct from p_beklenen_katsayi
     or v_surum is distinct from p_beklenen_surum then
    raise exception 'Puan doğrulanamadı; faaliyet kaydedilmedi.'
      using errcode = 'DP001',
            detail = format('beklenen %s/%s/%s, hesaplanan %s/%s/%s',
                            p_beklenen_puan, p_beklenen_katsayi, p_beklenen_surum, v_puan, v_katsayi, v_surum);
  end if;

  return query select v_id, false;
end $$;

/* create or replace mevcut yetkileri korur; yine de açıkça yazılır. */
revoke all on function public.docentlik_faaliyet_ekle(uuid, uuid, text, numeric, integer, boolean, date, text, uuid, double precision, double precision, text)
  from public, anon, authenticated, service_role;
grant execute on function public.docentlik_faaliyet_ekle(uuid, uuid, text, numeric, integer, boolean, date, text, uuid, double precision, double precision, text)
  to authenticated;

notify pgrst, 'reload schema';
