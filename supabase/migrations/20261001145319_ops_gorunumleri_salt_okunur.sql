-- ============================================================
-- OPS GÖRÜNÜMLERİ SALT OKUNUR
--
-- Bir önceki migration görünümleri "revoke all … from public, anon"
-- ile kapatmıştı; bu YETMİYOR. Supabase yeni tablolara/görünümlere
-- varsayılan olarak 'authenticated' rolüne DOĞRUDAN yetki veriyor ve
-- PUBLIC'ten revoke etmek doğrudan verilmiş yetkiyi kaldırmıyor.
--
-- Sonuç ciddi: ops_* görünümleri tek tablolu ve basit, yani Postgres
-- onları OTOMATİK GÜNCELLENEBİLİR sayıyor; security_invoker kapalı
-- (varsayılan) olduğu için yazma görünümün SAHİBİ olarak çalışıyor ve
-- taban tablonun RLS'ini atlıyor. Ölçüldü: operasyon personeli
-- "update public.ops_contracts set contract_no='HACK'" diyebiliyordu.
--
-- Görünümler yalnızca okuma yolu; yazma hiçbir zaman buradan geçmiyor.
-- ============================================================

revoke all on public.ops_contracts from public, anon, authenticated, service_role;
revoke all on public.ops_opportunities from public, anon, authenticated, service_role;
revoke all on public.ops_proposals from public, anon, authenticated, service_role;

grant select on public.ops_contracts to authenticated, service_role;
grant select on public.ops_opportunities to authenticated, service_role;
grant select on public.ops_proposals to authenticated, service_role;

notify pgrst, 'reload schema';
