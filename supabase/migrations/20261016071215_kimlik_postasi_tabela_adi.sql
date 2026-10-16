/*
  KİMLİK E-POSTASI TABELA ADIYLA (16.10.2026, kurum sahibinin isteği:
  "her yerde şirket unvanımı kullanma, daha elit ve premium olsun").

  Şifre yenileme ve davet e-postası gönderen adında, konu satırında ve
  alt bilgide kurumun YASAL UNVANINI yazıyordu ("ARVOCULTURE GROUP
  TEKNOLOJİ SANAYİ VE TİCARET LTD.ŞTİ. şifre yenileme bağlantınız"),
  çünkü bu işlev yalnızca organizations.name döndürüyordu. Tabela adı
  (display_name: "ArvoOS", "AkademikMerkez") hiç gelmiyordu.

  Artık display_name de dönüyor; kanca (send-auth-email) gönderen, konu ve
  başlıkta onu, yasal unvanı yalnızca alt bilgideki küçük yasal satırda
  kullanıyor. Doğrulama kuralı (iddia üyelik ya da bekleyen davetle
  doğrulanır) DEĞİŞMEDİ — gövde canlı şema dökümünden alındı, yalnızca
  çıktıya bir alan eklendi.
*/
CREATE OR REPLACE FUNCTION public.arvo_kimlik_postasi_markasi(p_user_id uuid, p_email text, p_claimed_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with dogrulanmis as (
    select p_claimed_org as id
    where p_claimed_org is not null
      and (
        exists (
          select 1 from public.organization_memberships m
          where m.organization_id = p_claimed_org
            and m.user_id = p_user_id
            and m.is_active = true
        )
        or exists (
          select 1 from public.organization_invitations d
          where d.organization_id = p_claimed_org
            and lower(btrim(d.email)) = lower(btrim(coalesce(p_email, '')))
            and d.status in ('pending', 'sent')
        )
      )
  ),
  kendi as (
    select m.organization_id as id
    from public.organization_memberships m
    where m.user_id = p_user_id and m.is_active = true
    order by m.joined_at nulls last
    limit 1
  ),
  kurum as (
    select id from dogrulanmis
    union all
    select id from kendi where not exists (select 1 from dogrulanmis)
    limit 1
  )
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'display_name', o.display_name,
    'logo_url', o.logo_url,
    'primary_color', o.primary_color,
    'contact_email', o.contact_email,
    'contact_phone', o.contact_phone,
    'website_url', o.website_url
  )
  from kurum k join public.organizations o on o.id = k.id
$function$;

revoke all on function public.arvo_kimlik_postasi_markasi(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.arvo_kimlik_postasi_markasi(uuid, text, uuid) to service_role;
