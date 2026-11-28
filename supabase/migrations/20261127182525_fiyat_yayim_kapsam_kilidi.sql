/*
  FİYAT YAYIMINDA KAPSAM KİLİDİ (28.11.2026).

  Yayım, bekleyen BÜTÜN taslakları tek UPDATE ile yayımlıyor
  (14.10.2026 kararı: yarı güncel bir liste yayımlanmasın). Ekran
  önce bir önizleme gösteriyor: etkilenen ürünler, eski/yeni tutarlar
  ve ayrı bir onay kutusu.

  AMA ONAY ile YAZMA ARASINDA taslak kümesi değişebiliyordu. Başka bir
  sekmede ya da başka bir kurucu tarafından yeni bir basamak taslağa
  alınırsa, kurucu GÖRMEDİĞİ bir değişikliği yayımlamış oluyordu.

  Sunucu işlemine konan karşılaştırma (app/panel/platform/urunler/actions.ts)
  bu açığı daraltıyor ama KAPATMIYOR: okuma ile RPC arasında da bir
  aralık var. Kapsam kontrolü ile yazmanın AYNI İŞLEMDE olması
  gerekiyor — bu yüzden karşılaştırma işlevin içine alındı.

  İmza biçimi arayüzle BİREBİR aynı olmalı (lib/fiyat-dogrulama →
  kapsamImzasi): her bekleyen basamak için "kod:tutar", teklif için
  "kod:teklif", artan sırayla ve "|" ile birleştirilmiş. Biçim
  değişirse iki taraf da değişmeli; tests/db bunu sabitliyor.

  Eski imzasız çağrı KALIYOR: başka bir yerden (cron, elle) çağıran
  olursa kırılmasın. Arayüz imzalı olanı çağırıyor.
*/

create or replace function public.platform_fiyat_kapsam_imzasi()
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    string_agg(parca, '|' order by parca),
    ''
  )
  from (
    select kod || ':' || coalesce(taslak_kurus::text, 'teklif') as parca
    from public.platform_fiyat_listesi
    where taslak_bekliyor
  ) as parcalar;
$$;

revoke all on function public.platform_fiyat_kapsam_imzasi() from public, anon;
grant execute on function public.platform_fiyat_kapsam_imzasi() to authenticated, service_role;

create or replace function public.platform_fiyatlari_yayimla(p_kapsam text)
returns integer
language plpgsql
set search_path to ''
as $$
declare
  v_sayi integer;
  v_an timestamptz := clock_timestamp();
  v_kapsam text;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Bu işlem için kurucu yetkisi gerekiyor.';
  end if;

  /*
    Satırlar önce KİLİTLENİYOR, sonra imza hesaplanıyor: kilitten
    sonra başka bir oturum araya giremez, yani kontrol ile yazma
    aynı işlemde ve aynı kümede.
  */
  perform 1 from public.platform_fiyat_listesi where taslak_bekliyor for update;

  select public.platform_fiyat_kapsam_imzasi() into v_kapsam;
  if v_kapsam is distinct from p_kapsam then
    raise exception 'Taslak listesi önizlemeden sonra değişti; yayımlanmadı.'
      using hint = 'Ekranı yenileyip etkilenen ürünleri yeniden gözden geçirin.';
  end if;

  update public.platform_fiyat_listesi
  set aylik_kurus = taslak_kurus,
      yayimlandi_at = v_an,
      taslak_bekliyor = false,
      updated_by = (select auth.uid()),
      updated_at = v_an
  where taslak_bekliyor;
  get diagnostics v_sayi = row_count;
  return v_sayi;
end
$$;

revoke all on function public.platform_fiyatlari_yayimla(text) from public, anon;
grant execute on function public.platform_fiyatlari_yayimla(text) to authenticated, service_role;
