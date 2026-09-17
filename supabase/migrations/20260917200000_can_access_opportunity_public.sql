-- "Bu kayıt bana atandı mı?" sorusunun uygulamadan sorulabilmesi.
--
-- Kural 20260826103000'de private.arvo_can_access_opportunity olarak
-- tanımlı ve RLS politikaları onu kullanıyor:
--   yönetici rolleri (owner/admin/manager) → kurumun her kaydına
--   diğerleri → yalnızca fırsata atanmış AKTİF personelse
--
-- Ama private şeması PostgREST'e açık değil, yani sunucu işlemleri bu soruyu
-- soramıyordu. Sormadan yazınca ne oluyordu: RLS'in engellediği update hata
-- değil 0 SATIR döndürüyor, kullanıcı "kaydedildi" görüp değişikliğini
-- kaybediyordu.
--
-- Kuralı TypeScript'te yeniden yazmak seçenekti; yazılmadı. İki yerde tutulan
-- yetki kuralı er geç ayrışır ve ayrışan taraf sessizce yanlış olur.
-- Bu yüzden ince bir sarmalayıcı: tek kaynak private'taki tanım.

create or replace function public.arvo_can_access_opportunity(target_opportunity uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.arvo_can_access_opportunity(target_opportunity);
$function$;

revoke all on function public.arvo_can_access_opportunity(uuid) from public, anon;
grant execute on function public.arvo_can_access_opportunity(uuid) to authenticated, service_role;

comment on function public.arvo_can_access_opportunity(uuid) is
  'private.arvo_can_access_opportunity için genel sarmalayıcı: sunucu işlemleri atama yetkisini RLS''e 0 satır döndürterek değil, açıkça sorabilsin.';
