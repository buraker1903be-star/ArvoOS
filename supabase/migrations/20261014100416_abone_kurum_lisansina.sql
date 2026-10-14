/*
  BİREYSEL ABONE → KURUM LİSANSI (14.10.2026, kurum sahibinin kararı).

  AkademikMerkez ile kurum anlaşması yapıldı: personelinin tamamı
  ArvoLab'a kurumun lisansıyla girer. Daha önce kendi adına kayıt olmuş
  personel (bireysel abone) konsolda "bireysel müşteri" olarak sayılıyordu
  — hem Müşteriler listesinde hem bireysel gelirde.

  Satır SİLİNMİYOR: subscriber_payments ve payment_links ona cascade ile
  bağlı; silmek geçmiş ödemelerin kaydını da götürürdü. Bunun yerine hangi
  kuruma geçtiği yazılıyor (kurum_id). İşaretli satır:
   - bireysel listelerden ve sayımlardan çıkar,
   - köprüde erişimini kendi aboneliğinden değil KURUMUN o üründeki
     lisansından alır (app/api/bridge/subscription). ArvoLab'da kişi
     kuruma bağlanmamış olsa bile erişimi kurumla birlikte açılıp kapanır;
     kendi adına ödeme bağlantısı da üretilmez.

  Kurum silinirse işaret düşer (on delete set null): kişi yeniden bireysel
  abone olur, sessizce erişimsiz kalmaz.
*/

alter table public.product_subscribers
  add column if not exists kurum_id uuid references public.organizations(id) on delete set null,
  add column if not exists kuruma_gecti_at timestamptz;

create index if not exists product_subscribers_kurum_idx
  on public.product_subscribers (kurum_id) where kurum_id is not null;
