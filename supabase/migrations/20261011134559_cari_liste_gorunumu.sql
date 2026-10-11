/*
  CARİ LİSTESİ: GÖRÜNÜM VE TAHSİLAT ÖZETİ.

  Finans cari sekmesi kurumun bütün carilerini, HER BİRİNİN BÜTÜN
  HAREKETLERİYLE birlikte çekiyor (account_entries gömülü). Defter
  büyüdükçe en pahalı okuma bu: bir carinin yüzlerce hareketi olabilir
  ve sayfa hepsini yalnızca TOPLAMLARI için taşıyor.

  KURAL TAŞINMIYOR, YALNIZCA TOPLAMLAR. Bakiye kuralı (sözleşme borcu
  mu defter borcu mu, tahsilatın borcu aşamaması, bakiyenin eksiye
  düşmemesi) TypeScript'te kalıyor — para hesabını iki yere kopyalamak
  en kötü kayma biçimi olurdu. Görünüm yalnızca dört toplam ve son
  hareket tarihini veriyor; karar yine app/panel/finance/
  account-balances.ts'te (11.10.2026'da testlendi).

  source_type bugün NOT NULL ve CHECK'li (manual, invoice, payment,
  expense, adjustment, crm_contract) — yani boş gelemiyor. coalesce
  yine de duruyor: TypeScript tarafı `!== "adjustment"` diyor, yani
  boş bir değer orada borç sayılır; kısıt bir gün gevşerse iki taraf
  aynı şeyi söylemeye devam etsin.

  GÜVENLİK: security_invoker — RLS çağıranın yetkisiyle işliyor.
*/

create or replace view public.cari_liste
with (security_invoker = true, security_barrier = true) as
  select
    p.id,
    p.organization_id,
    p.party_type,
    p.name,
    p.email,
    p.phone,
    p.tax_number,
    p.is_active,
    coalesce(h.defter_borc, 0) as defter_borc,
    coalesce(h.ek_hizmet, 0) as ek_hizmet,
    coalesce(h.tahsilat, 0) as tahsilat,
    coalesce(h.iade, 0) as iade,
    h.son_hareket_at
  from public.account_parties p
  left join lateral (
    select
      sum(e.amount) filter (
        where e.entry_type = 'debit' and coalesce(e.source_type, '') <> 'adjustment'
      ) as defter_borc,
      /* "Ek hizmet ·" ile BAŞLAYAN elle girilmiş borç: sözleşme
         sonrası satılan hizmet. Büyük/küçük harfe duyarlı, çünkü
         TypeScript tarafı da öyle. */
      sum(e.amount) filter (
        where e.entry_type = 'debit' and e.source_type = 'manual'
          and e.description like 'Ek hizmet ·%'
      ) as ek_hizmet,
      sum(e.amount) filter (where e.entry_type = 'credit') as tahsilat,
      sum(e.amount) filter (
        where e.entry_type = 'debit' and e.source_type = 'adjustment'
      ) as iade,
      max(e.transaction_date) as son_hareket_at
    from public.account_entries e
    where e.party_id = p.id
  ) h on true;

revoke all on public.cari_liste from public, anon;
grant select on public.cari_liste to authenticated, service_role;

/*
  TAHSİLAT ÖZETİ: son 30 gün, önceki 30 gün ve son 6 ayın aylık
  toplamı. Sayfa bunları bütün hareketleri belleğe alıp hesaplıyordu.
  Ay sınırı Türkiye saatiyle; transaction_date zaten tarih olduğu için
  ay anahtarı doğrudan ondan çıkıyor.
*/
create or replace function public.cari_tahsilat_ozeti(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with tahsilat as (
    select e.amount, e.transaction_date
    from public.account_entries e
    where e.organization_id = p_organization_id and e.entry_type = 'credit'
  ),
  aylik as (
    select to_char(transaction_date, 'YYYY-MM') as ay, count(*) as adet, sum(amount) as toplam
    from tahsilat
    where transaction_date >= (date_trunc('month', timezone('Europe/Istanbul', now())) - interval '5 months')::date
    group by 1
  )
  select jsonb_build_object(
    'son30', coalesce((select sum(amount) from tahsilat
                       where transaction_date > (timezone('Europe/Istanbul', now()))::date - 30), 0),
    'onceki30', coalesce((select sum(amount) from tahsilat
                          where transaction_date > (timezone('Europe/Istanbul', now()))::date - 60
                            and transaction_date <= (timezone('Europe/Istanbul', now()))::date - 30), 0),
    'aylik', coalesce((select jsonb_agg(jsonb_build_object('ay', ay, 'adet', adet, 'toplam', toplam) order by ay)
                       from aylik), '[]'::jsonb)
  )
$$;

revoke all on function public.cari_tahsilat_ozeti(uuid) from public, anon;
grant execute on function public.cari_tahsilat_ozeti(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
