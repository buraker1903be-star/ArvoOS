/*
  FİYAT LİSTESİ ÇOK PARA BİRİMLİ (28.11.2026).

  ArvoLab'ın yeni satışları USD'ye geçiyor, öteki ürünler de yönetici
  isterse USD fiyatlandırılabilecek. Bugünkü liste bunu taşıyamıyor:
  `platform_fiyat_listesi`in birincil anahtarı yalnızca `kod` ve para
  birimi diye bir sütunu yok — yani bir planın TRY ve USD fiyatı aynı
  anda duramıyor.

  DÖNÜŞÜM DEĞİL, GENİŞLETME. Var olan 16 satırın tamamı TRY'dir ve öyle
  kalıyor: sütun `default 'TRY'` ile ekleniyor, hiçbir tutar
  çevrilmiyor, hiçbir tarihsel kayıt varsayımla USD'ye alınmıyor.
  Kur çevrimi bu işin dışında (kurum sahibinin kararı).

  BİRİNCİ AŞAMA — ESKİ UYGULAMAYI HİÇ ETKİLEMEZ.

  Geçiş bilerek ikiye bölündü (28.11.2026, ölçümle). Canlıdaki sürüm
  fiyat taslağını `on conflict (kod)` ile yazıyor; birincil anahtar
  iki sütuna çıktığı an o yazma "no unique or exclusion constraint"
  ile düşüyor ve kurucu taslak kaydedemiyor. Kanıt:
  tests/db/fiyat-eski-uygulama-uyumu.test.mjs.

  Bu dosya yalnızca EKLİYOR:
   1. `para_birimi` sütunu + ISO kısıtı (TRY/USD), varsayılan TRY.
      Eski uygulama sütunu hiç yazmıyor, varsayılan devreye giriyor.
   2. Fiyat geçmişi de para birimini yazsın — yoksa "4.990 → 5.490"
      satırı hangi birimde olduğunu söylemiyor.

  Birincil anahtarın genişlemesi ve kapsam imzasının biçim değişikliği
  İKİNCİ AŞAMADA (20261128122145): uygulamanın yeni sürümü yayına
  alındıktan SONRA uygulanır. Sıra ve gerekçe PR'da yazılı.
*/

alter table public.platform_fiyat_listesi
  add column if not exists para_birimi text not null default 'TRY';

alter table public.platform_fiyat_listesi
  drop constraint if exists platform_fiyat_listesi_para_birimi_check;
alter table public.platform_fiyat_listesi
  add constraint platform_fiyat_listesi_para_birimi_check
  check (para_birimi in ('TRY', 'USD'));

alter table public.platform_fiyat_gecmisi
  add column if not exists para_birimi text not null default 'TRY';
alter table public.platform_fiyat_gecmisi
  drop constraint if exists platform_fiyat_gecmisi_para_birimi_check;
alter table public.platform_fiyat_gecmisi
  add constraint platform_fiyat_gecmisi_para_birimi_check
  check (para_birimi in ('TRY', 'USD'));

/*
  Geçmiş tetikleyicisi: gövde 20261014064505'teki hâlin aynısı, tek
  fark her satıra `para_birimi` yazması. Gövde anlık görüntüden değil
  o migration'dan türetildi; arada başka bir değişiklik olmadı
  (canlı döküm 28.11.2026 ile karşılaştırıldı).
*/
create or replace function private.arvo_fiyat_gecmisi_yaz()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_kim uuid := coalesce((select auth.uid()), new.updated_by);
  v_eski_yayimli boolean := tg_op = 'UPDATE' and old.yayimlandi_at is not null;
begin
  -- Yayım: yayım anı değişti ve satır yayında.
  if new.yayimlandi_at is not null
     and (tg_op = 'INSERT' or old.yayimlandi_at is distinct from new.yayimlandi_at) then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'yayim', case when v_eski_yayimli then old.aylik_kurus end, v_eski_yayimli, new.aylik_kurus, v_kim);
  -- Koda dönüş: yayındaydı, artık değil.
  elsif v_eski_yayimli and new.yayimlandi_at is null then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'koda_donus', old.aylik_kurus, true, null, v_kim);
  -- Taslak kaydı: bekleyen taslak açıldı ya da tutarı değişti.
  elsif new.taslak_bekliyor
     and (tg_op = 'INSERT' or not old.taslak_bekliyor or old.taslak_kurus is distinct from new.taslak_kurus) then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'taslak', new.aylik_kurus, new.yayimlandi_at is not null, new.taslak_kurus, v_kim);
  -- Taslak geri alındı (yayımlanmadan kapandı).
  elsif tg_op = 'UPDATE' and old.taslak_bekliyor and not new.taslak_bekliyor then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'taslak_iptal', old.taslak_kurus, false, new.aylik_kurus, v_kim);
  end if;
  return new;
end
$$;

revoke all on function private.arvo_fiyat_gecmisi_yaz() from public, anon, authenticated;

