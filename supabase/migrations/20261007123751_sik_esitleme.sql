-- ============================================================
-- SIK EŞİTLEME — erişim belirteci önbelleği ve tur kilidi
--
-- Eşitleme 10 dakikada birden 2 dakikaya iniyor ve açık sekme kendi
-- turunu tetikliyor. Mevcut kod bu sıklığı KALDIRAMIYOR; iki ayrı
-- nedenle:
--
-- 1) HER TURDA YENİ ERİŞİM BELİRTECİ. postaErisimBelirteci her
--    çağrıldığında Google'a refresh_token ile gidiyor ve bir saat
--    geçerli olan belirteci bir tur kullanıp atıyordu. Dakikada bir
--    yenileme, hem gereksiz hem riskli: Google yenileme isteklerini
--    kısıtlıyor ve aşırı kullanım belirteci düşürebiliyor. Belirteç
--    artık şifreli saklanıyor ve süresi dolmadan yeniden kullanılıyor.
--
--    Şifreleme diğer sırlarla aynı yoldan (PAYMENT_CREDENTIALS_KEY).
--    Erişim belirteci kısa ömürlü ama kutunun tamamını okuyabiliyor;
--    düz metin saklamak, yenileme belirtecini düz metin saklamaktan
--    yalnızca bir saat daha az kötü olurdu.
--
-- 2) ÜST ÜSTE BİNEN TURLAR. 10 dakikalık turda bir eşitlemenin bir
--    sonrakine yetişmesi mümkün değildi. 2 dakikada ve üstüne sekme
--    tetiklemesiyle mümkün: geçmiş taraması yapan bir kurumda tur
--    uzuyor, ikinci tur aynı mesajları yeniden çekiyor ve aynı satırlara
--    yazıyordu. esitleniyor_at bir kilit: tur başlarken konuyor, bitince
--    kalkıyor.
--
--    Kilit ZAMAN AŞIMLI okunuyor (uygulama tarafında): sunucu tur
--    ortasında düşerse kilit asılı kalırdı ve kutu bir daha hiç
--    eşitlenmezdi — sessizce duran bir kutu, hata veren kutudan beterdir.
--
-- last_history_id ZATEN VAR (ilk migration'da ayrılmıştı, kullanılmıyordu);
-- artımlı eşitleme imleci olarak şimdi dolduruluyor.
-- ============================================================

alter table public.mail_accounts
  add column if not exists erisim_belirteci_enc text,
  add column if not exists erisim_belirteci_biter timestamptz,
  add column if not exists esitleniyor_at timestamptz;

comment on column public.mail_accounts.erisim_belirteci_enc is
  'Google erişim belirteci (AES-256-GCM). Süresi dolmadan yeniden kullanılır; her turda yenileme Google tarafından kısıtlanıyor.';
comment on column public.mail_accounts.erisim_belirteci_biter is
  'Erişim belirtecinin bitiş anı. Bitmesine bir dakikadan az kaldıysa yenilenir.';
comment on column public.mail_accounts.esitleniyor_at is
  'Süren eşitleme turunun başlangıcı (kilit). Uygulama belirli bir süreden eskisini düşmüş sayar; asılı kilit kutuyu kalıcı olarak durdururdu.';
comment on column public.mail_accounts.last_history_id is
  'Gmail artımlı eşitleme imleci (historyId). Doluysa tur yalnızca DEĞİŞENLERİ çeker; Gmail imleci çok eski bulursa tam pencereye dönülür.';

-- Tablo politikasız RLS ile kapalı ve grant yok (ilk migration): yeni
-- sütunlar da otomatik olarak yalnızca service_role'a açık. Yine de
-- açıkça tekrarlıyoruz, sütun eklerken grant'ın sessizce genişlemediği
-- görünsün diye.
revoke all on public.mail_accounts from public, anon, authenticated;
