/*
  OTOMATİK PROFORMA (29.10.2026, kurum sahibinin isteği: "proformalar
  müşterinin tarihi 3 gün önceden otomatik olarak düzenlensin, otomatik
  olarak da gönderilsin").

  Proformayı bugüne kadar yalnızca kurucu elle kesiyordu; dönemi dolan
  müşteriye belge gitmesi kurucunun hatırlamasına bağlıydı. Günlük iş
  (app/api/cron/otomatik-proforma) dönem sonuna üç gün kala proformayı
  kesip yetkiliye e-postayla gönderiyor.

  Sütunlar:
   - otomatik: işin kestiği proforma. Elle kesilenden ayrılıyor; konsol
     ikisini ayrı gösteriyor, iş yalnızca kendi kestiğini yeniden
     göndermeye çalışıyor.
   - donem_sonu: proformanın ödenmesini istediği dönemin bittiği gün.
     YİNELEME ANAHTARI bu: iş günde bir koşuyor ve üç günlük pencerede
     aynı dönemi üç kez görüyor; benzersiz dizin aynı müşteriye aynı ürün
     ve dönem için ikinci otomatik proformayı veritabanında reddediyor.
     Kodun "önce bak, yoksa yaz" denetimi iki koşu çakışırsa ikisini de
     geçirirdi. İptal edilen de dizinde kalıyor: kurucunun iptal ettiği
     proformayı iş ertesi sabah yeniden kesmesin.
   - gonderildi_at / gonderilen / gonderim_hatasi: e-posta gitti mi, kime,
     gitmediyse neden. E-posta gönderilemezse proforma YİNE kesiliyor
     (müşteri panelinde görüyor) ve iş ertesi gün yeniden gönderiyor;
     kurucu konsolda nedenini okuyor. Elle kesilen proforma da konsoldaki
     "E-postayla gönder" düğmesiyle bu sütunları dolduruyor.
   - bildirildi_at: müşterinin uygulama içi bildirimi yazıldı mı (kurumda
     Kurum Sahiplerine ArvoOS panelinde, bireysel aboneye ArvoLab'da).
     E-postadan AYRI tutuluyor: biri gidip öteki düşerse iş yalnızca
     düşeni yeniden deniyor, müşteri aynı bildirimi iki kez almıyor.
*/
alter table public.platform_proformalari
  add column if not exists otomatik boolean not null default false,
  add column if not exists donem_sonu date,
  add column if not exists gonderildi_at timestamptz,
  add column if not exists gonderilen text[],
  add column if not exists bildirildi_at timestamptz,
  add column if not exists gonderim_hatasi text check (gonderim_hatasi is null or char_length(gonderim_hatasi) <= 500);

create unique index if not exists platform_proformalari_otomatik_donem_idx
  on public.platform_proformalari (product, coalesce(organization_id, subscriber_id), donem_sonu)
  where otomatik;

-- İşin "gönderilmemiş otomatik proforma" taraması için.
create index if not exists platform_proformalari_gonderilmemis_idx
  on public.platform_proformalari (gecerlilik_tarihi)
  where otomatik and (gonderildi_at is null or bildirildi_at is null) and durum = 'bekliyor';
