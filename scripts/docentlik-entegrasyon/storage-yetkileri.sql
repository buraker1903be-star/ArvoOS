-- Barındırılan Supabase'in postgres imajının storage şemasına verdiği varsayılan
-- yetkiler (supabase/postgres init: storage-schema). Düz postgres:17'de yok;
-- olmadan Storage API service_role/authenticated rolüne geçince tabloyu göremiyor.
-- Erişimin asıl kapısı yine storage.objects üzerindeki RLS politikaları.
grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on all tables in schema storage to postgres, anon, authenticated, service_role;
grant all on all sequences in schema storage to postgres, anon, authenticated, service_role;
grant all on all functions in schema storage to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to postgres, anon, authenticated, service_role;
