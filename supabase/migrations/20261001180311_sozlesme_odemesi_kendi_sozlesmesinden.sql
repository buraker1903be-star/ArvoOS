-- Sözleşmenin ödemesi kendi sözleşmesinden sayılsın.
--
-- CANLI HATA: aynı müşterinin SOZ-2026-000040 ve SOZ-2026-000041
-- sözleşmeleri vardı. 041 için hiç ödeme yapılmadığı hâlde müşteri takip
-- portalında "ödendi" görünüyordu.
--
-- Nedeni: private.arvo_contract_payment_summary tahsilatı CARİ düzeyinde
-- topluyordu, sözleşme süzgeci yoktu. Carinin bütün tahsilatını HER
-- sözleşme için ayrı ayrı sayıp sözleşme tutarında kırpıyordu; yani iki
-- sözleşmeli müşteride aynı para iki kez sayılıyordu.
--
-- Bu yalnız bir görüntü hatası DEĞİLDİ. Aynı fonksiyon
-- "ödeme tamamlanınca açılır" kuralındaki müşteri dosyalarının kilidini
-- de açıyor (arvo_portal_download), işin ödeme rozetini de besliyor
-- (portal_payment_settled, portal_workflow_payment_status). Yani
-- ödenmemiş işin teslim dosyaları indirilebiliyordu.
--
-- ÇÖZÜM: para cariye girer, sözleşmeye değil (account_entries'te
-- contract_id yok) — bu yüzden sözleşme başına "ödendi" her hâlükârda bir
-- DAĞITIM kararıdır. Burada iki aşamalı, muhasebenin kendi sırası:
--
--   1) Sözleşmenin KENDİ ödeme planında kapanmış taksitler doğrudan o
--      sözleşmeye yazılır. En güçlü bağ budur; mutabakat motoru
--      (arvo_reconcile_party_installments) zaten taksitleri kapatırken
--      parayı buraya bağlamış oluyor.
--   2) Kalan (hiçbir taksite bağlanmamış) para, carinin sözleşmelerine
--      ESKİDEN YENİYE sırayla dağıtılır; her sözleşme en çok kendi
--      tutarı kadar alır.
--
-- Böylece toplam dağıtım tahsilatı AŞAMAZ ve yeni bir sözleşme, eskisi
-- kapanmadan "ödendi" görünemez. Tek sözleşmeli caride sonuç eskisiyle
-- birebir aynı kalır (dağıtacak kardeş yok).
--
-- İptal/ret edilmiş sözleşme dağıtıma girmez: kapanmış bir işin parayı
-- yutup açık işi ödenmemiş göstermesi yeni bir hata olurdu.

create or replace function private.arvo_contract_payment_summary(p_contract_id uuid)
returns table(total_amount bigint, paid_amount bigint, remaining_amount bigint, settled boolean)
language sql
stable security definer
set search_path to ''
as $function$
  with hedef as (
    select c.id, c.organization_id, c.party_id, coalesce(c.amount, 0)::bigint as tutar
    from public.crm_contracts c
    where c.id = p_contract_id
  ),
  -- Aynı carinin para isteyen bütün sözleşmeleri, eskiden yeniye.
  kardesler as (
    select
      c.id,
      coalesce(c.amount, 0)::bigint as tutar,
      row_number() over (
        order by coalesce(c.signed_at, c.created_at), c.contract_no, c.id
      ) as sira
    from public.crm_contracts c
    join hedef h
      on c.organization_id = h.organization_id
     and c.party_id = h.party_id
    where h.party_id is not null
      and c.status not in ('rejected', 'cancelled')
  ),
  -- 1. aşama: sözleşmenin kendi planında kapanan taksitler.
  dogrudan as (
    select
      k.id,
      k.tutar,
      k.sira,
      least(k.tutar, coalesce((
        select sum(i.amount)
        from public.payment_plans p
        join public.payment_installments i on i.payment_plan_id = p.id
        where p.contract_id = k.id
          and i.status = 'paid'
      ), 0))::bigint as taksit
    from kardesler k
  ),
  -- Cariye giren net para: tahsilat eksi iade.
  net as (
    select greatest(0,
      coalesce(sum(e.amount) filter (where e.entry_type = 'credit'), 0)
      - coalesce(sum(e.amount) filter (
          where e.entry_type = 'debit' and e.source_type = 'adjustment'
        ), 0)
    )::bigint as tutar
    from public.account_entries e
    join hedef h
      on e.organization_id = h.organization_id
     and e.party_id = h.party_id
  ),
  -- 2. aşama: taksite bağlanmamış artık para, sırayla.
  artik as (
    select greatest(0,
      coalesce((select n.tutar from net n), 0) - coalesce((select sum(d.taksit) from dogrudan d), 0)
    )::bigint as tutar
  ),
  dagitim as (
    select
      d.id,
      d.tutar,
      d.taksit,
      -- Kendisinden önceki sözleşmelerin emeceği açık.
      coalesce(sum(d.tutar - d.taksit) over (
        order by d.sira rows between unbounded preceding and 1 preceding
      ), 0)::bigint as onceki_acik
    from dogrudan d
  ),
  sonuc as (
    select
      g.id,
      g.tutar,
      least(
        g.tutar,
        g.taksit + greatest(0, least(
          g.tutar - g.taksit,
          (select a.tutar from artik a) - g.onceki_acik
        ))
      )::bigint as odenen
    from dagitim g
  )
  select
    h.tutar,
    coalesce(s.odenen, 0)::bigint,
    greatest(0, h.tutar - coalesce(s.odenen, 0))::bigint,
    greatest(0, h.tutar - coalesce(s.odenen, 0)) <= 0
  from hedef h
  left join sonuc s on s.id = h.id;
$function$;

-- Postgres yeni fonksiyonu PUBLIC'e açık oluşturur; yetki geri alınıyor.
-- Bu private fonksiyonu yalnızca onu çağıran definer fonksiyonlar kullanır.
revoke all on function private.arvo_contract_payment_summary(p_contract_id uuid) from public, anon, authenticated, service_role;
