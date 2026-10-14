/*
  YAYIMLANMIŞ FİYAT LİSTESİ (14.10.2026).

  Rakamlar bugüne kadar yalnızca kodda duruyordu (lib/site/pricing.ts):
  site, JSON-LD, sözleşme metinleri ve konsol hepsi oradan okuyor. Tek
  kaynak olması doğruydu ama fiyat değiştirmek bir dağıtım gerektiriyordu.

  Bu tablo kodun YERİNE geçmiyor, ÜSTÜNE yazıyor: satırı olmayan ya da
  yayımlanmamış bir kod için koddaki değer geçerli kalıyor. Böylece
  veritabanı okunamadığında ya da bir satır silindiğinde site fiyatsız
  kalmıyor — yayımlanmış bir fiyat listesinde boş hücre, yanlış rakamdan
  da kötüdür.

  TASLAK VE YAYIN AYRI. taslak_kurus kurucunun hazırladığı tutar,
  aylik_kurus yayındaki tutar. Tek sütun olsaydı yanlış yazılan bir rakam
  yazıldığı anda sitede görünürdü; bugün o rakam bir commit'ten ve gözden
  geçirmeden geçiyor ve o emniyeti büsbütün bırakmak istemiyoruz.

  Kod hem plan (arvoos-baslangic) hem ek kalem (ek-kullanici) olabiliyor;
  ikisi de lib/site/pricing'te aynı biçimde kodlu, tablo da ayırmıyor.
*/
create table if not exists public.platform_fiyat_listesi (
  kod text primary key,
  tur text not null,
  /* Yayındaki aylık tutar, kuruş. NULL = koddaki değer geçerli
     (teklif usulü basamaklar da kodda null). */
  aylik_kurus bigint,
  /* Hazırlanan tutar; yayımlanana kadar hiçbir yerde görünmez. */
  taslak_kurus bigint,
  yayimlandi_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint platform_fiyat_listesi_tur_check check (tur in ('plan', 'ek')),
  constraint platform_fiyat_listesi_aylik_check check (aylik_kurus is null or aylik_kurus >= 0),
  constraint platform_fiyat_listesi_taslak_check check (taslak_kurus is null or taslak_kurus >= 0)
);

alter table public.platform_fiyat_listesi enable row level security;

/*
  Fiyat KAMUSAL bilgi: site sayfası oturumsuz okuyor. Yalnızca
  YAYIMLANMIŞ satır görünüyor — taslak tutar dışarıya sızmamalı, aksi
  halde hazırlanan zam yayımlanmadan önce okunabilirdi.
*/
drop policy if exists herkes_yayimlanan_fiyati_okur on public.platform_fiyat_listesi;
create policy herkes_yayimlanan_fiyati_okur on public.platform_fiyat_listesi
  as permissive for select to anon, authenticated
  using (yayimlandi_at is not null);

/* Kurucu taslağı da görür. */
drop policy if exists kurucu_fiyati_okur on public.platform_fiyat_listesi;
create policy kurucu_fiyati_okur on public.platform_fiyat_listesi
  as permissive for select to authenticated
  using (private.is_arvoos_founder());

drop policy if exists kurucu_fiyati_yazar on public.platform_fiyat_listesi;
create policy kurucu_fiyati_yazar on public.platform_fiyat_listesi
  as permissive for insert to authenticated
  with check (private.is_arvoos_founder());

drop policy if exists kurucu_fiyati_gunceller on public.platform_fiyat_listesi;
create policy kurucu_fiyati_gunceller on public.platform_fiyat_listesi
  as permissive for update to authenticated
  using (private.is_arvoos_founder())
  with check (private.is_arvoos_founder());

/*
  Döküm TABLO ve SÜTUN yetkilerini taşımıyor (AGENTS.md); düzenek de
  Supabase varsayılanını taklit edip her tabloyu anon'a açıyor. Yetkiler
  burada açıkça yazılıyor: anon yalnızca okur, silme kimseye açık değil
  (yayımlanmış bir fiyatı silmek, sitede o basamağı fiyatsız bırakmak
  demek — tutar değiştirilir, satır silinmez).
*/
revoke all on table public.platform_fiyat_listesi from anon, authenticated;
grant select on table public.platform_fiyat_listesi to anon, authenticated;
grant insert, update on table public.platform_fiyat_listesi to authenticated;
grant all on table public.platform_fiyat_listesi to service_role;
