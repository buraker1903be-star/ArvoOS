/*
  GRUP MARKASI (14.10.2026, kurum sahibinin kararı).

  AkademikMerkez ve ArvoCulture müşteri değil: ArvoOS ile aynı şirketin
  (ArvoCulture Group) markaları. Konsol onları müşteri gibi sayıyordu:
  müşteri listesinde, "beklenen aylık" gelirde ve ödeme hatırlatmasında.

  Neden kind = 'internal' DEĞİL: o işaret "Arvo'nun KENDİSİ" demek ve
  işleyişi değiştiriyor — WhatsApp gelen kutusu Arvo'nun kurumunu onunla
  buluyor (lib/whatsapp-inbox), Arvo kurumunun sözleşmesi platform
  abonelik isteğine dönüşüyor (arvo_sozlesmeden_abonelik_istegi), belge
  gönderim yolu ona bakıyor. AkademikMerkez'i internal yapmak, kendi
  müşterileriyle yaptığı sözleşmeleri konsola abonelik isteği olarak
  düşürürdü.

  grup_markasi yalnızca RAPORLAMA işareti: kiracı her şeyiyle normal
  çalışır; ücreti girilir ama müşteri gelirine ve tahsilata karışmaz,
  konsolda ayrıca "grup içi değer" olarak görünür — kurum sahibinin
  istediği, ArvoOS'un gruba yarattığı değeri görmek. Ödeme hatırlatması
  ve otomatik "gecikmiş" işaretlemesi grup markasına uygulanmaz (para el
  değiştirmiyor).
*/

alter table public.organizations
  add column if not exists grup_markasi boolean not null default false;

update public.organizations
set grup_markasi = true, updated_at = now()
where slug in ('akademikmerkez', 'arvoculture') and coalesce(kind, 'customer') <> 'internal';

/* Konsolun kiracı görünümü: sütun SONA ekleniyor (create or replace view
   yalnızca sona ekleme kabul ediyor); gövdenin kalanı anlık görüntüdeki
   tanımın aynısı. */
create or replace view public.platform_kiraci_liste with (security_invoker = true, security_barrier = true) as
 SELECT o.id,
    o.name,
    o.display_name,
    o.slug,
    o.status,
    o.plan_code,
    o.sector,
    o.kind,
    o.custom_domain,
    o.custom_domain_status,
    o.provisioning_state,
    o.logo_url,
    o.contact_phone,
    l.user_limit,
    l.storage_limit_mb,
    l.monthly_fee,
    l.current_period_end,
    l.license_status,
    l.trial_ends_at,
    COALESCE(u.aktif_uye, 0::bigint) AS aktif_uye,
    d.davet_eposta,
    d.davet_durumu,
    d.davet_gonderildi,
    d.davet_kabul,
    d.davet_hatasi,
    o.grup_markasi
   FROM public.organizations o
     LEFT JOIN public.organization_licenses l ON l.organization_id = o.id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE m.is_active) AS aktif_uye
           FROM public.organization_memberships m
          WHERE m.organization_id = o.id) u ON true
     LEFT JOIN LATERAL ( SELECT i.email AS davet_eposta,
            i.status AS davet_durumu,
            i.sent_at AS davet_gonderildi,
            i.accepted_at AS davet_kabul,
            i.error_message AS davet_hatasi
           FROM public.organization_invitations i
          WHERE i.organization_id = o.id
          ORDER BY i.created_at DESC
         LIMIT 1) d ON true;

revoke all on public.platform_kiraci_liste from public, anon;
grant select on public.platform_kiraci_liste to authenticated, service_role;

-- Tahsilat özeti: gövde 20261014062145'ten; tek fark grup markasının dışarıda kalması.
create or replace function public.platform_tahsilat_ozeti()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with musteri as (
    select id from public.organizations
    where coalesce(kind, 'customer') <> 'internal' and not grup_markasi
  ),
  hepsi as (
    select r.amount, r.currency, r.reviewed_at as tarih
    from public.organization_payment_requests r
    join musteri m on m.id = r.organization_id
    where r.status = 'approved'
    union all
    select s.amount, s.currency, s.paid_at as tarih
    from public.subscriber_payments s
  )
  select jsonb_build_object(
    'adet', (select count(*) from hepsi),
    'toplam', coalesce((select sum(amount) from hepsi), 0),
    'bu_ay', coalesce((select sum(amount) from hepsi
                       where tarih is not null
                         and timezone('Europe/Istanbul', tarih)
                             >= date_trunc('month', timezone('Europe/Istanbul', now()))), 0),
    'birimler', coalesce((select jsonb_agg(distinct coalesce(nullif(btrim(currency), ''), 'TRY')) from hepsi), '[]'::jsonb)
  )
$function$;

revoke all on function public.platform_tahsilat_ozeti() from public, anon;
grant execute on function public.platform_tahsilat_ozeti() to authenticated, service_role;

-- Otomatik "gecikmiş": gövde 20261014071519'dan; grup markası dışarıda.
create or replace function public.platform_gecikenleri_isaretle()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cekirdek jsonb;
  v_urun jsonb;
begin
  with g as (
    update public.organization_licenses l
    set license_status = 'past_due', updated_at = now()
    from public.organizations o
    where o.id = l.organization_id
      and coalesce(o.kind, 'customer') <> 'internal'
      and not o.grup_markasi
      and l.license_status = 'active'
      and l.current_period_end is not null
      and l.current_period_end < now()
    returning l.organization_id
  )
  select coalesce(jsonb_agg(g.organization_id), '[]'::jsonb) into v_cekirdek from g;

  with g as (
    update public.organization_product_licenses l
    set status = 'past_due', updated_at = now()
    from public.organizations o
    where o.id = l.organization_id
      and coalesce(o.kind, 'customer') <> 'internal'
      and not o.grup_markasi
      and l.status = 'active'
      and l.current_period_end is not null
      and l.current_period_end < now()
    returning l.organization_id, l.product
  )
  select coalesce(jsonb_agg(jsonb_build_object('organization_id', g.organization_id, 'product', g.product)), '[]'::jsonb)
  into v_urun from g;

  return jsonb_build_object('cekirdek', v_cekirdek, 'urun', v_urun);
end
$$;

revoke all on function public.platform_gecikenleri_isaretle() from public, anon, authenticated;
grant execute on function public.platform_gecikenleri_isaretle() to service_role;
