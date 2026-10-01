-- ============================================================
-- Müşteri takip sayfasında GERÇEK aşamalar
--
-- Takip sayfası bugüne kadar yüzdeden türetilmiş genel beş aşama
-- gösteriyordu (Sözleşme · Planlama · Çalışma · Kontrol · Teslim). Bu
-- BİLİNÇLİ bir karardı: veritabanındaki adım adları müşteriye açılmaz —
-- "İç Kontrol Yapılıyor", "Müşteri İlişkileri Talimatı Bekleniyor" gibi
-- iç dil müşterinin görmesi gereken şeyler değil.
--
-- Artık işin ASAMALARI var (operation_steps.phase_title) ve bunlar
-- gruplamak için yazılmış, müşteriye okunabilir başlıklar: "Literatür",
-- "Yöntem, Veri ve Analiz". Tezini takip eden müşteri için "Çalışma"dan
-- çok daha bilgilendirici.
--
-- Yine de karar KURUMUN ve varsayılan KAPALI: bu migration tek başına
-- hiçbir müşterinin gördüğü sayfayı değiştirmez. Adım başlıkları hiçbir
-- durumda dışarı çıkmıyor; yalnızca aşama başlıkları.
--
-- Var olan takip fonksiyonlarına DOKUNULMUYOR. İmzalarını değiştirmek
-- (RETURNS TABLE) drop + create gerektirir; bunlar anon anahtarla
-- çağrılan, müşteriye bakan fonksiyonlar ve yetkilerini bir an için bile
-- kaybetmeleri sayfayı boş gösterirdi. Ayrı bir fonksiyon eklemek bedava.
-- ============================================================

alter table public.organizations
  add column if not exists tracking_show_phases boolean not null default false;

comment on column public.organizations.tracking_show_phases is
  'Takip sayfası genel beş aşama yerine işin kendi aşamalarını göstersin mi. Varsayılan kapalı.';

create or replace function public.arvo_tracking_asamalar(p_tracking_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_code text := upper(btrim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  v_goster boolean;
  v_asamalar jsonb;
  v_toplam int;
  v_tamam int;
begin
  -- Kapı mevcut takip fonksiyonlarıyla AYNI: altı karakterden kısa kod
  -- denemesi hiç sorgulanmıyor, sözleşme de takibe açık olmak zorunda.
  if char_length(v_code) < 6 then
    return null;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1;
  if c.id is null then
    return null;
  end if;

  select o.tracking_show_phases into v_goster
  from public.organizations o
  where o.id = c.organization_id;
  if not coalesce(v_goster, false) then
    return null;
  end if;

  /*
    Aşamalar başlığa göre toplanıyor, sıra min(sort_order)'dan geliyor.
    Şablon bir aşamanın görevlerini ardışık ürettiği için bu yeterli; aynı
    başlık listenin iki ayrı yerinde geçerse tek grup olur — müşteri
    tarafında bu, iki kez aynı adı görmekten iyidir.

    Adım BAŞLIKLARI dışarı çıkmıyor: yalnızca aşama adı ve durumu.
  */
  with gruplar as (
    select
      s.phase_title as ad,
      min(s.sort_order) as sira,
      count(*) as adet,
      count(*) filter (where s.is_completed) as biten
    from public.operation_steps s
    join public.operation_workflows w on w.id = s.workflow_id
    where w.contract_id = c.id
      and s.phase_title is not null
      and btrim(s.phase_title) <> ''
    group by s.phase_title
  ),
  sirali as (
    select ad, sira, adet, biten, row_number() over (order by sira) as no
    from gruplar
  ),
  ilk_acik as (
    select min(no) as no from sirali where biten < adet
  )
  select
    jsonb_agg(
      jsonb_build_object(
        'ad', s.ad,
        'durum', case
          when s.biten >= s.adet then 'done'
          when s.no = (select no from ilk_acik) then 'current'
          else 'upcoming'
        end
      )
      order by s.sira
    ),
    count(*)::int,
    count(*) filter (where s.biten >= s.adet)::int
  into v_asamalar, v_toplam, v_tamam
  from sirali s;

  -- Aşamasız iş: ekran eski genel beş aşamayı göstermeye devam etsin.
  if v_asamalar is null or v_toplam = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'asamalar', v_asamalar,
    'toplam', v_toplam,
    'tamamlanan', v_tamam,
    'guncel', (
      select e ->> 'ad' from jsonb_array_elements(v_asamalar) as e
      where e ->> 'durum' = 'current' limit 1
    )
  );
end;
$function$;

/*
  Takip sayfası oturumsuz açılıyor; fonksiyon kendi kapısını yukarıda
  kuruyor (altı karakter + takibe açık sözleşme + kurumun izni).
*/
revoke all on function public.arvo_tracking_asamalar(text) from public;
grant execute on function public.arvo_tracking_asamalar(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
