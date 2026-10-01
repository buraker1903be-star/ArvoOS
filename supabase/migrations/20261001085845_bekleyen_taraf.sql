-- ============================================================
-- "TOP KİMDE": işin beklediği taraf
--
-- Pano işin hangi aşamada olduğunu söylüyor ama kimin elinde olduğunu
-- söylemiyordu. İki somut sonucu vardı:
--
--   * Gecikme raporu haksızdı. Müşteriden veri bekleyen iş, uzmanın
--     geciktirdiği iş gibi görünüyordu.
--   * Termin hatırlatması yanlış adrese gidiyordu. Müşteride bekleyen bir
--     adım için uzmana "gecikti" bildirimi düşüyor, uzmanın yapabileceği
--     bir şey olmuyordu.
--
-- İşin durumu (status) ile KARIŞTIRILMAMALI: 'blocked' işin ilerlemediğini
-- söyler, bekleyen taraf ise ilerlemeyi KİMİN sürdüreceğini. Devam eden bir
-- iş de müşteriden yanıt bekliyor olabilir; bu yüzden ayrı sütun, status'e
-- dokunulmuyor.
-- ============================================================

alter table public.operation_workflows
  add column if not exists waiting_party text not null default 'us',
  add column if not exists waiting_note text,
  add column if not exists waiting_since timestamptz;

comment on column public.operation_workflows.waiting_party is
  'Top kimde: us (bizde) | customer (müşteride) | third_party (üçüncü tarafta: danışman, kurum, tedarikçi).';
comment on column public.operation_workflows.waiting_note is
  'Neyin beklendiği ("ham veri dosyası"). Gecikme raporunda sebebi okunur kılıyor.';
comment on column public.operation_workflows.waiting_since is
  'Bekleyen tarafın en son değiştiği an. "3 gündür müşteride" bundan hesaplanıyor.';

/*
  Üçüncü taraf bilerek GENEL: ArvoOS çok kiracılı bir ürün. "Danışman"
  yazsaydık akademik olmayan kiracıda anlamsız kalırdı; etiketi arayüz
  kurumun diline göre yazıyor.
*/
alter table public.operation_workflows drop constraint if exists operation_workflows_waiting_party_check;
alter table public.operation_workflows
  add constraint operation_workflows_waiting_party_check
    check (waiting_party in ('us', 'customer', 'third_party'));

alter table public.operation_workflows drop constraint if exists operation_workflows_waiting_note_check;
alter table public.operation_workflows
  add constraint operation_workflows_waiting_note_check
    check (waiting_note is null or char_length(waiting_note) <= 200);

/*
  Bekleyen taraf değişince süre sayacı sıfırlanıyor. Uygulama koduna
  bırakılsaydı panelden yazan yol damgayı koyar, SQL Editor'den ya da
  köprüden yazan yol koymazdı; "kaç gündür bekliyor" o satırlarda sessizce
  yanlış çıkardı.
*/
create or replace function private.arvo_bekleyen_taraf_damgasi()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    new.waiting_since := coalesce(new.waiting_since, now());
  elsif new.waiting_party is distinct from old.waiting_party then
    new.waiting_since := now();
    -- Taraf değişti: eski beklemenin notu yeni tarafa taşınmamalı.
    if new.waiting_note is not distinct from old.waiting_note then
      new.waiting_note := null;
    end if;
  end if;
  -- "Bizde" bekleyen işin notu olmaz: beklenen bir şey yok.
  if new.waiting_party = 'us' then
    new.waiting_note := null;
  end if;
  return new;
end;
$$;

revoke all on function private.arvo_bekleyen_taraf_damgasi() from public, anon, authenticated;

drop trigger if exists arvo_bekleyen_taraf_damgasi on public.operation_workflows;
create trigger arvo_bekleyen_taraf_damgasi
  before insert or update on public.operation_workflows
  for each row execute function private.arvo_bekleyen_taraf_damgasi();

-- Bekleyen işler listesi: "top bizde olmayanlar" sorgusu kısmi dizinden okunur.
create index if not exists operation_workflows_bekleyen_idx
  on public.operation_workflows(organization_id, waiting_party, waiting_since)
  where waiting_party <> 'us';

notify pgrst, 'reload schema';
