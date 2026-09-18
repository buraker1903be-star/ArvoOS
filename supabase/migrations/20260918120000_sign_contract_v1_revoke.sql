-- ============================================================
-- Eski imza fonksiyonu (v1) dışarıya kapatılıyor
--
-- Sözleşme imzası uygulamada yalnızca sign_crm_contract_v2 ile atılıyor
-- (app/sozlesme/[token]/actions.ts). v2 imza görselini zorunlu tutuyor
-- (data:image/png, en az 200 karakter) ve imzayı v1'e devrederek atıyor.
--
-- Ama v1 canlıda public/anon/authenticated'a açıktı. Sözleşme bağlantısına
-- (token) sahip herkes v1'i PostgREST'ten doğrudan çağırıp sözleşmeyi imza
-- ÇİZMEDEN "signed" yapabiliyordu: signed_signature_data boş kalır, e-imza
-- delili atlanmış olur. İş akışı, ödeme planı ve cari kaydı yine oluşur.
--
-- v2 security definer olduğu için v1'i fonksiyon sahibinin yetkisiyle
-- çağırır; v1'in dış yetkisini kaldırmak v2'yi etkilemez (PGlite'ta anon
-- rolüyle sınandı: v2 çalışıyor, v1 doğrudan reddediliyor).
-- ============================================================

revoke all on function public.sign_crm_contract(text, text, text, text) from public, anon, authenticated;
grant execute on function public.sign_crm_contract(text, text, text, text) to service_role;
