/*
  PAKET ADLARI STANDART (14.10.2026, kurum sahibinin kararı).

  Paket kodu ile adı arasındaki eşleme sitedekinden farklıydı: konsol
  `professional`'a "Profesyonel", `enterprise`'a "Kurumsal" diyordu; sitede
  ₺5.990'lık "Kurumsal" `professional`'ın, teklif usulü "Özel kurum"
  `enterprise`'ın karşılığı. Standart artık sitedeki ad:

    starter      → Başlangıç
    professional → Kurumsal
    enterprise   → Özel kurum

  Kod tarafında tek kaynak lib/paket-adlari.ts (birim testi siteyle
  karşılaştırıyor); bu tablo onu okuyan yerlerin yedeği ve yeni kurulum
  sihirbazının listesi.

  Grup markaları (AkademikMerkez, ArvoCulture) ve Arvo'nun kendi kurumu
  ÖZEL KURUM paketinde: bir önceki düzenlemede kullanıcı sayısına göre
  Kurumsal / Başlangıç'a çekilmişlerdi; kurum sahibinin kararıyla
  enterprise'a dönüyorlar. Ücretler (grup içi değer) değişmiyor: Özel
  kurum teklif usulü, girilen tutar o kurumun pazarlıklı ücreti.
*/

update public.plans set name = 'Başlangıç'  where code = 'starter';
update public.plans set name = 'Kurumsal'   where code = 'professional';
update public.plans set name = 'Özel kurum' where code = 'enterprise';

update public.organization_licenses l
set plan_code = 'enterprise', updated_at = now()
from public.organizations o
where o.id = l.organization_id
  and o.slug in ('akademikmerkez', 'arvoculture', 'arvo-os');

update public.organizations
set plan_code = 'enterprise', updated_at = now()
where slug in ('akademikmerkez', 'arvoculture', 'arvo-os');
