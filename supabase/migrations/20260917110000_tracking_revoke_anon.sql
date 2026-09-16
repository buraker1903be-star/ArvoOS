-- Takip fonksiyonlarından anon/authenticated izninin kaldırılması.
--
-- 20260917100000'in ikinci yarısı. AYRI dosya, çünkü sıra önemli:
--   1) 20260917100000 çalışır  → kapı kurulur, service_role izin alır
--                                (canlıdaki eski kod anon ile çalışmaya devam eder)
--   2) Yeni kod Vercel'e yayınlanır → çağrılar service_role'e geçer
--   3) BU DOSYA çalışır         → anon kapısı kapanır
--
-- Bu dosyayı 2. adımdan ÖNCE çalıştırmak müşteri takip sayfasını
-- deploy bitene kadar kapatır.
--
-- Neden gerekli: anon anahtarı tarayıcı paketinde herkese açık. anon
-- çağırabildiği sürece saldırgan Next.js sunucusunu atlayıp doğrudan
-- PostgREST'e gidebiliyor ve IP sınırı anlamsız kalıyor.

-- ---------------------------------------------------------------
-- Bu on fonksiyon takip kodundan kayda ulaşıyor. Hepsi yalnızca
-- sunucudan çağrılıyor; service_role ile çağrılacaklar.
--
-- get_public_organization_branding BİLEREK dışarıda: kurum slug'ıyla
-- çalışıyor, takip koduyla ilgisi yok, sayfa başlığını çizmek için gerekli.

revoke execute on function public.lookup_contract_by_tracking_code_global(text) from anon, authenticated;
revoke execute on function public.lookup_contract_by_tracking_code(text, text) from anon, authenticated;
revoke execute on function public.arvo_tracking_documents(text) from anon, authenticated;
revoke execute on function public.arvo_tracking_document_links(text) from anon, authenticated;
revoke execute on function public.arvo_tracking_work_plan(text) from anon, authenticated;
revoke execute on function public.list_customer_file_messages(text) from anon, authenticated;
revoke execute on function public.list_customer_portal_files(text) from anon, authenticated;
revoke execute on function public.arvo_tracking_confirm_proposal(text, text, text, text) from anon, authenticated;
revoke execute on function public.authorize_customer_portal_file_download(text, uuid, text, text) from anon, authenticated;
revoke execute on function public.send_customer_file_message(text, text) from anon, authenticated;
