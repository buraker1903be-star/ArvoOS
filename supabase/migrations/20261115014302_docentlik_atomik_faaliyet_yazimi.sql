/*
  DOÇENTLİK: FAALİYET EKLEME VE DÜZENLEME TEK İŞLEMDE (F6 PR5, 15.11.2026).

  Eskiden sunucu işlemi (app/panel/docentlik/actions.ts) yazımı ve puan
  doğrulamasını AYRI HTTP çağrılarıyla yapıyordu:
   - eklemede satır yazılıyor, tetikleyicinin puanı PR #318 çekirdeğinin
     beklediğinden farklıysa satır ikinci bir çağrıyla siliniyordu. Silme
     düşerse (ağ, oturum, modül kapanması) yanlış puanlı kayıt KALIYORDU;
   - düzenlemede güncelleme yazılıyor, uyuşmazlıkta yalnızca hata
     dönüyordu: yeni alanlar, yeni puan ve yeni sürüm kalıyordu.
  supabase-js'in iki çağrısı tek bir veritabanı işlemi değildir.

  Şimdi yazım ve doğrulama bu iki işlevin İÇİNDE. PostgREST her RPC'yi tek
  işlemde çalıştırır; uyuşmazlıkta işlev hata fırlatır ve işlem bütünüyle
  geri alınır: yeni satır doğmaz, mevcut satırın alanları, puanı ve
  updated_at'i (iyimser eşzamanlılık sürümü) olduğu gibi kalır. Telafi
  (silme) adımı yok, düşebileceği bir ikinci çağrı da yok.

  NEDEN SECURITY INVOKER. İşlev çağıranın yetkisiyle çalışıyor: tablonun
  RLS'i (modül kapısı, üyelik, sahiplik), sütun yetkileri (puan
  sütunlarına yazma yok) ve puan tetikleyicisi aynen uygulanıyor. Definer
  olsaydı bunların hepsini işlevin içinde yeniden yazmak gerekirdi ve bir
  eksik, RLS'i atlayan bir kapı olurdu. İşlev hiçbir yetki KAZANDIRMIYOR:
  çağıranın tabloya doğrudan yapabileceğinden fazlasını yapamaz.

  PUAN İSTEMCİDEN ALINMIYOR. Puanı yine tetikleyici yazar
  (20261114200939); p_beklenen_* yalnızca bir KARŞILAŞTIRMA değeri.
  Tarayıcıdaki biri işlevi doğrudan çağırıp başka bir beklenen değer
  verirse olan tek şey işlemin reddedilmesi; kayda giren puan
  değişmez. Hesap kuralları (PR #318) ve tetikleyici değişmedi.

  KİMLİK OTURUMDAN. owner_id parametre değil, auth.uid(). Kurum
  parametresi RLS'ten geçer (üye olunmayan kurum: 42501).

  ÇİFT GÖNDERİM. Ekleme istek anahtarıyla (20261114213340) ON CONFLICT
  DO NOTHING; çakışmada aynı kişinin ilk kaydı döner (tekrar = true).
  Çakışan satır o isteğin İLK yazımıdır ve kendi işleminde doğrulanmıştır.

  İYİMSER EŞZAMANLILIK. Düzenleme okunan sürümle (updated_at) koşullu;
  sürüm tutmazsa satır yazılmaz ve guncellendi = false döner. Sunucu
  işlemi yeniden okuyup aynı isteğin tekrarını ayırır (eskisi gibi).

  Hata kodu DP001: puan/katsayı/kural sürümü uyuşmazlığı. Sunucu işlemi
  bunu kullanıcıya "kaydedilmedi" diye çevirir.

  BAĞIMLILIK: 20261114200939 (PR #319), 20261114213340.
*/

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
    -- Yalnızca istek anahtarı çakışınca (NULL anahtar çakışmaz): aynı isteğin tekrarı.
    select f.id into v_id
      from public.docentlik_faaliyetleri f
     where f.organization_id = p_org and f.owner_id = v_ben and f.istek_anahtari = p_istek_anahtari;
    if v_id is null then
      raise exception 'Faaliyet kaydedilemedi.' using errcode = 'P0002';
    end if;
    return query select v_id, true;
    return;
  end if;

  /* Karşılaştırma çift duyarlıkta: TS tarafı Object.is(Number(kayit), beklenen)
     ile aynı şeyi soruyor; sütun (double::text)::numeric ile yazıldığı için
     geri dönüşüm kayıpsız. */
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

create or replace function public.docentlik_faaliyet_duzenle(
  p_id uuid,
  p_org uuid,
  p_surum timestamptz,
  p_kriter uuid,
  p_baslik text,
  p_birim numeric,
  p_yazar_sayisi integer,
  p_baslica boolean,
  p_tarih date,
  p_notlar text,
  p_beklenen_puan double precision,
  p_beklenen_katsayi double precision,
  p_beklenen_surum text
)
returns table (kayit_id uuid, guncellendi boolean)
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
begin
  if v_ben is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  /* Sürüm ZORUNLU: sürümsüz düzenleme araya giren bir değişikliğin üzerine
     sessizce yazardı. */
  if p_surum is null then
    raise exception 'Kayıt sürümü verilmedi.' using errcode = '22004';
  end if;
  if p_beklenen_puan is null or p_beklenen_katsayi is null or p_beklenen_surum is null then
    raise exception 'Beklenen puan verilmedi.' using errcode = '22004';
  end if;

  update public.docentlik_faaliyetleri as f
     set criteria_id = p_kriter,
         title = p_baslik,
         unit_count = p_birim,
         yazar_sayisi = p_yazar_sayisi,
         baslica_yazar = p_baslica,
         faaliyet_tarihi = p_tarih,
         notes = p_notlar
   where f.id = p_id
     and f.organization_id = p_org
     and f.owner_id = v_ben
     and f.updated_at = p_surum
  returning f.id, f.computed_points, f.paylasim_katsayisi, f.kural_surumu
    into v_id, v_puan, v_katsayi, v_surum;

  if v_id is null then
    -- Sürüm tutmadı, kayıt yok ya da RLS gizledi: hiçbir şey yazılmadı.
    return query select p_id, false;
    return;
  end if;

  if v_puan::double precision is distinct from p_beklenen_puan
     or v_katsayi::double precision is distinct from p_beklenen_katsayi
     or v_surum is distinct from p_beklenen_surum then
    raise exception 'Puan doğrulanamadı; faaliyet değiştirilmedi.'
      using errcode = 'DP001',
            detail = format('beklenen %s/%s/%s, hesaplanan %s/%s/%s',
                            p_beklenen_puan, p_beklenen_katsayi, p_beklenen_surum, v_puan, v_katsayi, v_surum);
  end if;

  return query select v_id, true;
end $$;

/* Yeni işlevler herkese açık doğar; yalnızca oturumlu kullanıcıya. service_role
   bu yolları kullanmıyor (auth.uid() boş olurdu). */
revoke all on function public.docentlik_faaliyet_ekle(uuid, uuid, text, numeric, integer, boolean, date, text, uuid, double precision, double precision, text)
  from public, anon, authenticated, service_role;
revoke all on function public.docentlik_faaliyet_duzenle(uuid, uuid, timestamptz, uuid, text, numeric, integer, boolean, date, text, double precision, double precision, text)
  from public, anon, authenticated, service_role;
grant execute on function public.docentlik_faaliyet_ekle(uuid, uuid, text, numeric, integer, boolean, date, text, uuid, double precision, double precision, text)
  to authenticated;
grant execute on function public.docentlik_faaliyet_duzenle(uuid, uuid, timestamptz, uuid, text, numeric, integer, boolean, date, text, double precision, double precision, text)
  to authenticated;

notify pgrst, 'reload schema';
