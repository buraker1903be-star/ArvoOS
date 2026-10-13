/*
  LİSTELERDE "SON TEMAS" TEK VE HAFİF ÇAĞRIDA (13.10.2026, hızlandırma).

  Talep, teklif, sözleşme ve iş listelerinin "Son temas" sütunu için
  sayfadaki talepler(~25) için BÜTÜN yorumlar gövdeleriyle okunuyor, sonra
  uygulamada her talebin en yenisi seçiliyordu (crm/last-contact.ts).
  EXPLAIN (canlı, owner olarak): 24 yorum için 134 ms; maliyetin çoğu her
  YORUM satırında çalışan RLS işlevi (arvo_yorum_erisimi → arvo_can_access_
  opportunity, satır başına 2–4 ms). Yorum arttıkça doğrusal büyüyor ve
  panelin diğer istekleriyle birlikte canlıda saniyelere (en kötü 23 sn)
  çıkıyordu. Yazar adları için ikinci bir istek de atılıyordu.

  arvo_son_temaslar: talep başına yorum sayısı, en son yorumun tarihi,
  ilk 200 karakteri ve yazarının adı — tek çağrıda.

  GÜVENLİK RLS'LE DENK: security definer, ama erişim açıkça kuruluyor:
    - Yalnızca p_org kurumundaki talepler.
    - Talebe tam erişimi olan (arvo_can_access_opportunity: yönetici,
      talebin satışçısı, işin sorumlusu) o talebin bütün yorumlarını
      sayar — RLS'te de öyle (arvo_yorum_erisimi'nin ilk koşulu).
    - Tam erişimi olmayan için yorum yorum bugünkü RLS kuralı
      (arvo_yorum_erisimi) uygulanır.
  Pahalı kontrol yorum başına değil TALEP başına bir kez çalışır.
*/

create or replace function public.arvo_son_temaslar(p_org uuid, p_firsatlar uuid[])
returns table (opportunity_id uuid, sayi integer, son_tarih timestamptz, son_govde text, yazar text)
language sql
stable
security definer
set search_path = ''
as $$
  with erisim as (
    select o.id, private.arvo_can_access_opportunity(o.id) as tam
    from public.crm_opportunities o
    where o.organization_id = p_org and o.id = any (p_firsatlar)
  ),
  gorunen as (
    select k.opportunity_id, k.body, k.created_at, k.created_by
    from public.crm_internal_comments k
    join erisim e on e.id = k.opportunity_id
    where k.organization_id = p_org
      and (e.tam or private.arvo_yorum_erisimi(k.opportunity_id, k.context_type, k.context_id))
  ),
  sirali as (
    select g.*, count(*) over (partition by g.opportunity_id) as adet,
           row_number() over (partition by g.opportunity_id order by g.created_at desc) as sira
    from gorunen g
  )
  select s.opportunity_id, s.adet::integer, s.created_at, left(s.body, 200),
         coalesce(
           (select e.full_name from public.hr_employees e where e.organization_id = p_org and e.user_id = s.created_by limit 1),
           (select p.full_name from public.profiles p where p.id = s.created_by)
         )
  from sirali s
  where s.sira = 1
$$;

revoke all on function public.arvo_son_temaslar(uuid, uuid[]) from public, anon;
grant execute on function public.arvo_son_temaslar(uuid, uuid[]) to authenticated;
