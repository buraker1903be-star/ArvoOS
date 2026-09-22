-- ============================================================
-- Depolama kullanımı
--
-- organization_licenses.storage_limit_mb yıllardır giriliyor (lisans
-- ekranında 512000 MB yazıyor) ama KULLANIM hiç hesaplanmıyordu: hangi
-- kurumun ne kadar yer kapladığını kimse bilmiyordu. Limit, karşılığı
-- olmayan bir sayıydı.
--
-- Boyutlar storage.objects.metadata->>'size' içinde. O tablo PostgREST'e
-- açık değil ve olmamalı; bu yüzden toplamı veritabanında alıp yalnızca
-- kurum başına TOPLAM dönen bir fonksiyon veriyoruz. Dosya adları, yolları
-- ve sayıları dışarı çıkmıyor.
--
-- Yol kuralı: her kovada nesne yolu <organization_id>/... ile başlıyor
-- (organization-assets, hr-documents, hr-confidentiality-signatures,
-- internal-message-files, customer-portal-files, payment-receipts,
-- whatsapp-media). İlk klasör uuid'ye çevrilemiyorsa satır atlanıyor —
-- eski ya da elle atılmış bir nesne yüzünden toplamın patlaması,
-- ölçümün hiç olmamasından kötü olurdu.
-- ============================================================

create or replace function public.arvo_storage_usage()
returns table (organization_id uuid, bytes bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (storage.foldername(o.name))[1]::uuid as organization_id,
    sum(coalesce((o.metadata ->> 'size')::bigint, 0))::bigint as bytes
  from storage.objects o
  where coalesce(array_length(storage.foldername(o.name), 1), 0) > 0
    -- uuid'ye çevrilemeyen ilk klasör: kurum klasörü değil, atlanıyor.
    and (storage.foldername(o.name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  group by 1
$function$;

comment on function public.arvo_storage_usage() is
  'Kurum başına toplam depolama (bayt). Yalnızca toplam döner; dosya adı ve yolu dışarı çıkmaz.';

/*
  Postgres yeni fonksiyonu varsayılan olarak herkese açar. Bu fonksiyon
  TÜM kurumların toplamını döndürüyor, yani kurucuya özel: tarayıcıdan
  çağrılabilen rollerden yetkisi geri alınıyor, yalnızca service_role
  çağırabiliyor (konsol sunucu anahtarıyla okuyor).
*/
revoke all on function public.arvo_storage_usage() from public, anon, authenticated;
grant execute on function public.arvo_storage_usage() to service_role;

notify pgrst, 'reload schema';
