-- ============================================================
-- REVİZYON PENCERESİ: teslim sonrası ücretsiz düzeltme hakkı
--
-- "2 ay ücretsiz revizyon" bugün hiçbir yerde tutulmuyor; sözleşmenin
-- metninde bir cümle, panelde hiçbir şey. Sonucu: hakkın ne zaman
-- dolduğunu kimse bilmiyor, dolmuş bir hak için ücretsiz çalışılıyor ya
-- da dolmamış bir hak reddediliyor — ikisi de müşteriyle tartışma.
--
-- Pencere TÜRETİLİYOR, elle girilmiyor: teslim anı + gün sayısı. Elle
-- girilen bir tarih, teslim ertelendiğinde sessizce yanlış kalırdı.
--
-- Gün sayısı iki yerden: kurumun varsayılanı (organizations) ve işin
-- kendi istisnası (operation_workflows). Özel anlaşma her müşteride
-- olmuyor ama olduğunda kuruma ait varsayılanı bozmadan yazılabilmeli.
-- ============================================================

alter table public.organizations
  add column if not exists revision_days integer;

comment on column public.organizations.revision_days is
  'Teslimden sonra ücretsiz revizyon süresi (gün). Boş = kurumun revizyon penceresi yok.';

alter table public.organizations drop constraint if exists organizations_revision_days_check;
alter table public.organizations
  add constraint organizations_revision_days_check
    check (revision_days is null or revision_days between 1 and 3650);

alter table public.operation_workflows
  add column if not exists revision_days integer,
  add column if not exists delivered_at timestamptz,
  add column if not exists revision_until date;

comment on column public.operation_workflows.revision_days is
  'Bu işe özel revizyon süresi (gün). Boşsa kurumun varsayılanı kullanılır.';
comment on column public.operation_workflows.delivered_at is
  'İşin İLK tamamlandığı an. Revizyon penceresi buradan başlıyor.';
comment on column public.operation_workflows.revision_until is
  'Ücretsiz revizyon hakkının son günü. Türetilmiştir; elle yazılmaz.';

alter table public.operation_workflows drop constraint if exists operation_workflows_revision_days_check;
alter table public.operation_workflows
  add constraint operation_workflows_revision_days_check
    check (revision_days is null or revision_days between 1 and 3650);

/*
  Pencereyi İŞ TAMAMLANINCA veritabanı açıyor.

  delivered_at İLK teslimde yazılıyor ve bir daha değişmiyor: revizyon
  süresi teslimden işler, revizyonun kendisi teslimi ileri atmamalı. İş
  revizyon için yeniden açılıp tekrar kapandığında pencere uzamıyor —
  uzasaydı "iki ay" fiilen sınırsız olurdu.

  İŞİN kendi süresi sonradan değiştirilirse (özel anlaşma) pencere yeniden
  hesaplanıyor; teslim tarihi sabit kaldığı için bu güvenli. KURUMUN
  varsayılanı değişince eski işler ETKİLENMİYOR (tetikleyici o sütunu
  dinlemiyor): müşteriye verilmiş bir hak, ayar değiştirildi diye geriye
  dönük kısalmamalı.
*/
create or replace function private.arvo_revizyon_penceresi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_gun integer;
begin
  if new.status in ('completed', 'archived') and new.delivered_at is null then
    new.delivered_at := now();
  end if;

  if new.delivered_at is null then
    new.revision_until := null;
    return new;
  end if;

  v_gun := new.revision_days;
  if v_gun is null then
    select o.revision_days into v_gun
    from public.organizations o
    where o.id = new.organization_id;
  end if;

  -- Süre tanımlı değilse pencere yok; boş bir tarih uydurmuyoruz.
  new.revision_until := case
    when v_gun is null then null
    else (new.delivered_at at time zone 'Europe/Istanbul')::date + v_gun
  end;
  return new;
end;
$$;

revoke all on function private.arvo_revizyon_penceresi() from public, anon, authenticated;

drop trigger if exists arvo_revizyon_penceresi on public.operation_workflows;
create trigger arvo_revizyon_penceresi
  before insert or update of status, delivered_at, revision_days on public.operation_workflows
  for each row execute function private.arvo_revizyon_penceresi();

/*
  Hatırlatma işareti: aynı uyarı iki kez gitmesin. Adım terminlerindeki
  kalıbın aynısı (operation_steps.reminder_state).
*/
alter table public.operation_workflows
  add column if not exists revision_reminder_state text;

alter table public.operation_workflows drop constraint if exists operation_workflows_revision_reminder_check;
alter table public.operation_workflows
  add constraint operation_workflows_revision_reminder_check
    check (revision_reminder_state is null or revision_reminder_state in ('ending_soon', 'ended'));

create index if not exists operation_workflows_revizyon_idx
  on public.operation_workflows(revision_until)
  where revision_until is not null;

notify pgrst, 'reload schema';
