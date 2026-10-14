/*
  ZAMANLANMIŞ İŞLERİN KOŞMA KAYDI (14.10.2026).

  Beş zamanlanmış iş ekosistemi taşıyor (posta eşitlemesi iki dakikada
  bir, ArvoARC ve Randevu köprüleri on dakikada, iş adımı terminleri ve
  abonelik hatırlatması her sabah) ve hiçbiri koştuğunu KAYDETMİYORDU.
  Biri sessizce durduğunda — CRON_SECRET değişti, dağıtım rotayı kırdı,
  vercel.json girdisi silindi — konsolda hiçbir yerde görünmüyor;
  belirti kullanıcıda çıkıyor ("postalar gelmiyor") ve ne zaman durduğu
  da bilinmiyor. Vercel'in zamanlayıcı geçmişi yalnızca Vercel panelinde
  ve yalnızca son koşmalar için var.

  SONUÇ ÜÇ DEĞERLİ: 'tamam' · 'eksik' (kısmi hata — bazı kurumun kutusu
  eşitlenmedi) · 'hata'. Bu ayrım rotalarda zaten vardı (kısmi hata da
  500 dönüyor, AGENTS.md) ama hiçbir yere yazılmıyordu.

  SAKLAMA 14 GÜN. Posta eşitlemesi günde ~720 kayıt yazıyor; sınırsız
  büyüyen bir günlük tablosu kimsenin bakmadığı yerde şişer. Budama
  yazma işlevinin içinde: çağıran tarafın saklama süresini bilmesi
  gerekmiyor, unutması da mümkün değil.

  YAZAN YALNIZCA service_role (cron rotaları sunucu anahtarıyla
  çağırıyor). Kurucu okur — gecikmeyi Sistem Sağlığı ekranı gösteriyor.
  Kiracıyı ilgilendiren bir veri değil: satırlarda kurum kimliği yok,
  ayrıntı alanı yalnızca sayaç tutuyor.
*/

create table if not exists public.platform_cron_kayitlari (
  id bigint generated always as identity primary key,
  -- vercel.json'daki yol (ör. '/api/cron/posta-esitleme'): işin kimliği.
  -- Zamanlamanın tek kaynağı o dosya olduğu için anahtar da oradan.
  is_adi text not null,
  basladi_at timestamptz not null default now(),
  bitti_at timestamptz,
  sure_ms integer,
  sonuc text not null check (sonuc in ('tamam', 'eksik', 'hata')),
  -- İşin kendi sayaçları (eşitlenen kutu, yazılan bildirim, hata metni).
  ayrinti jsonb not null default '{}'::jsonb
);

-- Ekran her iş için SON kaydı ve son BAŞARILI kaydı okuyor: iki sorgu da
-- bu dizinin başından yürüyor.
create index if not exists platform_cron_kayitlari_is_zaman
  on public.platform_cron_kayitlari (is_adi, basladi_at desc);

alter table public.platform_cron_kayitlari enable row level security;

/*
  YETKİ AÇIKÇA YAZILIYOR. Supabase'in varsayılan yetkileri yeni tabloyu
  anon'a da açıyor; satırı RLS elese bile tabloyu anon'a açık bırakmanın
  bir sebebi yok ve bu depoda bir görünüm tam bu yüzden açıkta kalmıştı
  (AGENTS.md: tabloyu/görünümü anon'a kapatan tek şey migration'ın kendi
  revoke satırıdır). Yazma doğrudan yapılmıyor: kayıt security definer
  işlevle giriyor, o da tablonun sahibi olarak çalışıyor.
*/
revoke all on public.platform_cron_kayitlari from anon, authenticated;
grant select on public.platform_cron_kayitlari to authenticated;

drop policy if exists kurucu_cron_kayitlarini_okur on public.platform_cron_kayitlari;
create policy kurucu_cron_kayitlarini_okur on public.platform_cron_kayitlari
  for select to authenticated
  using (private.is_arvoos_founder());

/*
  Yazma + budama tek çağrıda. Budamanın burada olması, saklama süresinin
  tek yerde yazılı olması demek; ayrıca rotanın ikinci bir istek atmasını
  önlüyor (iki dakikada bir koşan iş için bu her gün 720 istek eder).

  Budama basladi_at'e göre is_adi İÇİNDE yürüyor: dizin (is_adi,
  basladi_at desc) olduğu için her iş için sondan taranıyor, tablonun
  tamamı okunmuyor.
*/
create or replace function public.platform_cron_kaydet(
  p_is_adi text,
  p_basladi timestamptz,
  p_sonuc text,
  p_ayrinti jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.platform_cron_kayitlari (is_adi, basladi_at, bitti_at, sure_ms, sonuc, ayrinti)
  values (
    p_is_adi,
    p_basladi,
    now(),
    greatest(0, (extract(epoch from (now() - p_basladi)) * 1000))::integer,
    p_sonuc,
    coalesce(p_ayrinti, '{}'::jsonb)
  );

  delete from public.platform_cron_kayitlari
  where is_adi = p_is_adi and basladi_at < now() - interval '14 days';
end
$$;

revoke all on function public.platform_cron_kaydet(text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.platform_cron_kaydet(text, timestamptz, text, jsonb) to service_role;

/*
  Ekranın okuduğu özet: her iş için son kayıt ve son BAŞARILI koşma.

  Gecikme son BAŞARILI koşmaya göre ölçülüyor (lib/cron-isleri): her on
  dakikada bir düşen bir iş yalnızca "son koşma"ya bakıldığında yeni
  koşmuş görünür, oysa iş hiç yapılmıyor.

  security_invoker: RLS çağıranın yetkisiyle işliyor. Invoker OLMAYAN bir
  görünüm tablo RLS'ini atlar (AGENTS.md).
*/
create or replace view public.platform_cron_durumu
with (security_invoker = true) as
select distinct on (k.is_adi)
  k.is_adi,
  k.basladi_at as son_calisma,
  k.sonuc,
  k.sure_ms,
  k.ayrinti,
  (
    select max(b.basladi_at)
    from public.platform_cron_kayitlari b
    where b.is_adi = k.is_adi and b.sonuc = 'tamam'
  ) as son_basarili
from public.platform_cron_kayitlari k
order by k.is_adi, k.basladi_at desc;

revoke all on public.platform_cron_durumu from anon;
grant select on public.platform_cron_durumu to authenticated, service_role;
