-- ============================================================
-- AYRIŞMIŞ CARİLERİN TALEPLE HİZALANMASI (tek seferlik, 09.10.2026)
--
-- 20261009082529'dan önce CRM'den cariye yansıtma yalnızca cari alanı
-- hâlâ eski değeri taşıyorsa çalışıyordu; iki cari taleplerinden
-- ayrışmış kalmıştı (önizleme sorgusuyla bulundu, kurum sahibi onayladı):
--
--   Cemre Bey                         → Cemre Vural (+ e-posta)
--   ERENCAN EREN FUTBOL … LTD. ŞTİ.   → Erencan Eren (kişisel carisi;
--                                       şirket carisi ayrı, dokunulmuyor)
--
-- Her cari bağlı en son sözleşmesinin talebindeki ad/telefon/e-postaya
-- eşleniyor. Kimliklerle sınırlı: önizlemede görülmeyen hiçbir kayda
-- dokunulmuyor. Yeni tetikleyici (arvo_cari_bilgisi_yansit) aynı carinin
-- diğer taleplerini de bu değere çekiyor.
-- ============================================================

update public.account_parties p
   set name = o.customer_name,
       phone = o.contact_phone,
       email = o.contact_email,
       updated_at = now()
  from public.crm_opportunities o
 where (p.id, o.id) in (
         ('e6d08165-ff43-4475-91a4-67b90886b23d'::uuid, '6b5f24aa-4b1c-4b8a-b691-fd7234031cec'::uuid),
         ('d8698602-cd61-4e15-adc1-f106e5d4ee3d'::uuid, 'eeb32310-d711-4ac3-b38b-e0a418bdc18d'::uuid)
       )
   and p.organization_id = o.organization_id;
