-- Özel alan adı müsaitlik kontrolü.
--
-- resolve_organization_by_domain yalnızca "verified" alan adlarını
-- görüyor ve RLS başka kurumların satırlarını gizliyor; bu yüzden panel,
-- başka bir kurumun beklemedeki (pending) alan adını kaydetmeye
-- çalıştığını Vercel'e bağlayıp eski alan adını kaldırdıktan SONRA,
-- benzersizlik hatasıyla öğreniyordu. Bu fonksiyon kayıt öncesi yalnızca
-- "müsait mi" bilgisini döndürür; hangi kurumun kullandığını açığa çıkarmaz.

create or replace function public.arvo_custom_domain_available(p_domain text, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.organizations o
    where lower(o.custom_domain) = lower(trim(p_domain))
      and o.id is distinct from p_organization_id
  );
$$;

revoke all on function public.arvo_custom_domain_available(text, uuid) from public, anon;
grant execute on function public.arvo_custom_domain_available(text, uuid) to authenticated;
