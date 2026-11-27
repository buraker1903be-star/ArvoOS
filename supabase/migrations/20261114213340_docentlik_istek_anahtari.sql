/*
  DOÇENTLİK: ÇİFT GÖNDERİMDE TEK KAYIT (F6 PR5, 14.11.2026).

  Faaliyet ekleme formu iki kez gönderilirse (çift tıklama, ağ kesilip
  tarayıcının yeniden denemesi) iki ayrı faaliyet yazılıyordu: puan iki
  kez sayılır, kullanıcı fark etmezse başvuru dosyasında aynı makale iki
  kere görünür. ArvoLab'da da böyleydi.

  Form her açılışta rastgele bir istek anahtarı üretir; sunucu işlemi onu
  kayda yazar. Aynı kişi aynı anahtarla ikinci kez eklemeye çalışırsa
  tekil dizin ikinci satırı reddeder ve işlem İLK kaydı döndürür
  (app/panel/docentlik/actions.ts → faaliyetEkle). Anahtarsız ekleme
  (eski istemci, test) eskisi gibi çalışır: NULL'lar tekil dizinde
  birbirine eşit sayılmaz.

  Sütun yalnızca eklemede yazılır; güncelleme yetkisi yok (anahtar bir
  isteğin kimliği, kaydın verisi değil).

  BAĞIMLILIK: 20261114200939 (PR #319).
*/

alter table public.docentlik_faaliyetleri
  add column if not exists istek_anahtari uuid;

create unique index if not exists docentlik_faaliyetleri_istek_anahtari
  on public.docentlik_faaliyetleri (organization_id, owner_id, istek_anahtari);

/* 20261114200939 ekleme yetkisini sütun sütun verdi; yeni sütun ayrıca açılmalı. */
grant insert (istek_anahtari) on public.docentlik_faaliyetleri to authenticated;

notify pgrst, 'reload schema';
