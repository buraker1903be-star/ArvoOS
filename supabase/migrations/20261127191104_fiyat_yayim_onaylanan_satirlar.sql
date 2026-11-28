/*
  YAYIM YALNIZCA ONAYLANAN SATIRLARI YAZAR (28.11.2026).

  Kapsam kilidi (20261127182525) imzayı işlevin İÇİNDE, satırlar
  kilitlendikten sonra hesaplıyor ve uyuşmazsa yayımı reddediyor.
  Yazma yine de "bekleyen BÜTÜN taslaklar" üzerindeydi: kontrol ile
  UPDATE arasında kalan pencerede araya giren bir satır, kullanıcının
  hiç görmediği hâlde yayına çıkabilirdi.

  Pencere küçük ama gerçek. `for update` VAR OLAN satırları kilitler;
  YENİ bir satırın eklenmesini engellemez. Üstelik READ COMMITTED'ta
  her ifade kendi anlık görüntüsünü alıyor: imzayı hesaplayan SELECT
  ile UPDATE iki ayrı ifade, yani UPDATE araya giren ve COMMIT edilen
  satırı görebilir. Bu yüzden kural tersine çevrildi: yayım artık
  bekleyen satırlara değil, KULLANICININ ONAYLADIĞI (kod, tutar)
  çiftlerine uygulanıyor. İmza denetimi duruyor — kullanıcı
  görmediği bir değişiklikle karşılaşmasın diye yayım yine
  reddediliyor; satır sınırı onun arkasındaki ikinci kilit.

  Üç parça:
    1. private.fiyat_kapsam_cozumle(text) — imzayı (kod, tutar)
       çiftlerine ayırır. Biçim arayüzdekiyle aynı
       (lib/fiyat-dogrulama → kapsamImzasi): "kod:tutar", teklif için
       "kod:teklif", artan sırada, "|" ile birleştirilmiş.
    2. private.fiyat_kapsam_yayimla(text) — YALNIZCA yazma: onaylanan
       çiftlere uyan bekleyen satırları yayımlar. Ayrı bir işlev,
       çünkü "onaylanmayan satır yayımlanmaz" kuralı kendi başına
       sınanabilmeli (tests/db); public işlevin içinde kalsaydı imza
       denetimini geçmeden o yola hiç gelinemezdi.
    3. public.platform_fiyatlari_yayimla(text) — kilit, imza denetimi
       ve (2)'nin çağrısı; hepsi tek işlemde.

  Yayımlanan satır sayısı onaylanan çift sayısından AZSA işlem
  düşüyor: imza tuttuğu hâlde bir satır yazılamadıysa (araya giren
  silme, değişen tutar) yarım bir liste yayımlamaktansa hiç
  yayımlamamak doğru — 14.10.2026 kararı da buydu.

  İmzasız eski çağrı (platform_fiyatlari_yayimla(), 20261014064505)
  DEĞİŞMEDİ: kapsamı olmayan çağıran bekleyen her taslağı yayımlamaya
  devam ediyor.
*/

create or replace function private.fiyat_kapsam_cozumle(p_kapsam text)
returns table (kod text, taslak_kurus bigint)
language sql
immutable
set search_path to ''
as $$
  select
    split_part(parca, ':', 1) as kod,
    case
      when split_part(parca, ':', 2) = 'teklif' then null
      else split_part(parca, ':', 2)::bigint
    end as taslak_kurus
  from unnest(string_to_array(coalesce(p_kapsam, ''), '|')) as parca
  where parca <> '';
$$;

/*
  Yetki: public işlev SECURITY INVOKER, yani iç çağrıda da ÇAĞIRANIN
  yetkisine bakılıyor; authenticated'a execute verilmezse kurucunun
  kendi yayımı "permission denied for function" ile düşerdi. Doğrudan
  çağrılması bir açık değil: işlevler invoker ve tabloyu RLS koruyor
  (kurucu_fiyati_gunceller), kurucu olmayan sıfır satır günceller.
*/
revoke all on function private.fiyat_kapsam_cozumle(text) from public, anon;
grant execute on function private.fiyat_kapsam_cozumle(text) to authenticated, service_role;

create or replace function private.fiyat_kapsam_yayimla(p_kapsam text, p_an timestamptz)
returns integer
language plpgsql
set search_path to ''
as $$
declare
  v_sayi integer;
begin
  /*
    Yazma ONAYLANAN çiftlerle sınırlı. `is not distinct from` gerekiyor:
    teklif satırının taslağı NULL ve "=" ile hiçbir zaman eşleşmez.
  */
  update public.platform_fiyat_listesi f
  set aylik_kurus = f.taslak_kurus,
      yayimlandi_at = p_an,
      taslak_bekliyor = false,
      updated_by = (select auth.uid()),
      updated_at = p_an
  from private.fiyat_kapsam_cozumle(p_kapsam) k
  where f.taslak_bekliyor
    and f.kod = k.kod
    and f.taslak_kurus is not distinct from k.taslak_kurus;
  get diagnostics v_sayi = row_count;
  return v_sayi;
end
$$;

revoke all on function private.fiyat_kapsam_yayimla(text, timestamptz) from public, anon;
grant execute on function private.fiyat_kapsam_yayimla(text, timestamptz) to authenticated, service_role;

create or replace function public.platform_fiyatlari_yayimla(p_kapsam text)
returns integer
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_sayi integer;
  v_onaylanan integer;
  v_an timestamptz := clock_timestamp();
  v_kapsam text;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Bu işlem için kurucu yetkisi gerekiyor.';
  end if;

  /*
    Satırlar önce KİLİTLENİYOR, sonra imza hesaplanıyor: kilitten
    sonra var olan satırların tutarı değişemez, yani kontrol ile
    yazma aynı işlemde ve aynı kümede.
  */
  perform 1 from public.platform_fiyat_listesi where taslak_bekliyor for update;

  select public.platform_fiyat_kapsam_imzasi() into v_kapsam;
  if v_kapsam is distinct from p_kapsam then
    raise exception 'Taslak listesi önizlemeden sonra değişti; yayımlanmadı.'
      using hint = 'Ekranı yenileyip etkilenen ürünleri yeniden gözden geçirin.';
  end if;

  select count(*)::integer into v_onaylanan from private.fiyat_kapsam_cozumle(p_kapsam);
  v_sayi := private.fiyat_kapsam_yayimla(p_kapsam, v_an);

  if v_sayi <> v_onaylanan then
    raise exception 'Onaylanan % satırın % tanesi yayımlanabildi; hiçbiri yayımlanmadı.', v_onaylanan, v_sayi
      using hint = 'Liste bu sırada değişmiş olabilir; ekranı yenileyip yeniden onaylayın.';
  end if;

  return v_sayi;
end
$$;

revoke all on function public.platform_fiyatlari_yayimla(text) from public, anon;
grant execute on function public.platform_fiyatlari_yayimla(text) to authenticated, service_role;
