/*
  EK KULLANICI KOLTUĞU (13.10.2026).

  Fiyat listesi "pakete dahil kullanıcı sayısını aşan her kullanıcı için
  249 TL/ay" diye bir kalem yayımlıyordu ama sistemde karşılığı yoktu:
  limiti dolan kuruma davet ekranı yalnızca "paketinizi yükseltin"
  diyordu. Dördüncü kullanıcıyı isteyen Başlangıç müşterisine liste
  249 TL derken panel +4.000 TL diyordu.

  İki sütun:

  - extra_user_fee: ek koltuğun AYLIK bedeli, kuruş. Varsayılan 24900,
    yani yayımlanmış liste fiyatı (lib/site/pricing.ts → ADD_ONS
    "ek-kullanici"). Lisans satırında durması özel anlaşmaları mümkün
    kılıyor; sıfır yazmak "bu kurumdan ek koltuk için ücret alınmaz"
    demek, kolayca anlaşılır bir kapalı durum.

  - extra_user_cap: dahil limitin ÜSTÜNE açılabilen koltuk sayısı.
    Tavansız bırakmak, kurumun onay vermediği bir faturaya dönüşürdü:
    on kişi davet eden bir yönetici 2.490 TL'lik aylık artışı ancak
    faturada görürdü. Varsayılan 10; kurucu kurum bazında yükseltir.
    Sıfır yazmak eski davranışı geri getirir (dahil limit dolunca dur).

  Ek koltuk SAYISI tutulmuyor: aktif üye − dahil limit olarak
  türetiliyor (lib/kota-durumu). Ayrı bir sayaç, pasife alma, silme ve
  davet iptali yollarının üçünde de azaltılmak zorunda kalırdı; biri
  unutulduğunda kurum ödemediği koltuğa fatura görürdü.

  Var olan kiracılar etkilenmiyor: bugüne kadar limiti dolan kurum
  zaten davet gönderemiyordu, şimdi on koltuğa kadar ücretli
  gönderebiliyor.
*/
alter table public.organization_licenses
  add column if not exists extra_user_fee bigint not null default 24900,
  add column if not exists extra_user_cap integer not null default 10;

alter table public.organization_licenses
  drop constraint if exists organization_licenses_extra_user_fee_check,
  add constraint organization_licenses_extra_user_fee_check check (extra_user_fee >= 0);

alter table public.organization_licenses
  drop constraint if exists organization_licenses_extra_user_cap_check,
  add constraint organization_licenses_extra_user_cap_check check (extra_user_cap >= 0);

/*
  Döküm TABLO ve SÜTUN yetkilerini taşımıyor (AGENTS.md): yeni sütunlar
  varsayılan olarak okunamaz gelmesin diye yetki açıkça yazılıyor.
  organization_licenses'ta SELECT sütun düzeyinde kısıtlı değil, yine de
  bir sonraki sütun eklemede aynı satırın burada durması doğru olanı
  gösterir.
*/
grant select (extra_user_fee, extra_user_cap) on public.organization_licenses to authenticated;
