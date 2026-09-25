-- ============================================================
-- Hesabını silen bireysel abonenin kaydı KAPANIR, silinmez.
--
-- ArvoLab'a hesap silme geliyor. Abone satırını burada da silmek ilk anda
-- doğru görünüyor ama yapılamaz: subscriber_payments ve payment_links
-- product_subscribers'a "on delete cascade" ile bağlı, yani satırı silmek
-- ÖDEME VE FATURA KAYITLARINI da götürürdü. VUK bu kayıtların beş yıl
-- saklanmasını zorunlu tutuyor.
--
-- Çözüm: satır kalır, durumu 'canceled' olur, kişisel alanlar
-- anonimleştirilir (e-posta yer tutucuya döner, ad boşaltılır). Ödeme izi
-- kimliksiz olarak korunur — KVKK'nın veri minimizasyonu ile VUK'un saklama
-- yükümlülüğü ancak böyle birlikte karşılanır.
--
-- closed_at neden ayrı bir sütun: 'canceled' durumu zaten var ve "aboneliği
-- bitti" demek. "Hesabını sildi" bambaşka bir şey — destek ekibi ve ölçüm
-- ikisini ayırt edebilmeli. Yeni bir status değeri eklemek yerine sütun
-- eklendi: mevcut ekranlar 'canceled'ı zaten tanıyor, bilmedikleri bir
-- değerle karşılaşıp boş hücre göstermezler.
-- ============================================================

alter table public.product_subscribers
  add column if not exists closed_at timestamptz;

comment on column public.product_subscribers.closed_at is
  'Kullanıcı ArvoLab''dan hesabını sildi; satır ödeme izi için duruyor, kişisel alanlar anonim.';

create index if not exists product_subscribers_closed_idx
  on public.product_subscribers(product, closed_at)
  where closed_at is not null;

notify pgrst, 'reload schema';
