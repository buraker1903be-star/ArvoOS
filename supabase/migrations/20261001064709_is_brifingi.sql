-- ============================================================
-- İŞ BRİFİNGİ: satıştan operasyona geçen bilgi
--
-- Bugün satışçının bildiği şeyler ("konu belli mi", "müşterinin elinde
-- taslak var mı", "veri ne zaman gelecek", "danışman onayı bekleniyor mu")
-- hiçbir yere yazılmıyor; iş açılıyor ve operasyoncu müşteriyi sıfırdan
-- tanımaya çalışıyor. Fırsatın `notes` alanı serbest metin: aranamıyor,
-- raporlanamıyor, eksik bırakıldığı görülmüyor.
--
-- Brifing SORULARI KURUMUN: ArvoOS çok kiracılı bir ürün. Alanları şemaya
-- gömmek ("Turnitin eşiği", "danışman") paneli bir akademik yazım
-- yazılımına çevirirdi — adım şablonlarında tam olarak bu olmuştu, bir
-- kiracının adımları herkese gidiyordu. Aynı karar üçüncü kez veriliyor
-- (organization_crm_stages, organization_step_templates, şimdi bu).
--
-- İKİ KOPYA, TEK YÖN. Brifing fırsatta doldurulur (satışçının çalıştığı
-- yer), iş açılırken işe KOPYALANIR. Kopya bilerek: fırsattaki metin
-- satışçının o gün söylediği şeydir ve sonradan değişmemelidir;
-- operasyonun kopyası ise süreç ilerledikçe düzeltilebilir. Aynı kalıbı
-- sözleşmenin ara teslim takvimi → iş adımları yolunda da kullanıyoruz.
-- ============================================================

-- ---------- 1. Kurumun brifing alanları ----------

create table if not exists public.organization_brief_fields (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  label text not null,
  /*
    select/multi_select dışındaki tiplerde options boş kalır. Tip metni
    serbest değil: ekran her tip için ayrı girdi basıyor ve bilinmeyen bir
    tip sessizce metin kutusuna düşerdi.
  */
  field_type text not null default 'text',
  options jsonb,
  hint text,
  is_required boolean not null default false,
  /*
    Soru hangi çalışma türlerinde sorulsun; boş = hepsinde. "Veri ne zaman
    gelecek" sorusunun ödev işinde yeri yok, ama her türe ayrı form
    tanımlatmak da aynı soruyu dört kez yazdırırdı.
  */
  set_codes text[],
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, code),
  constraint organization_brief_fields_code_check check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint organization_brief_fields_label_check check (char_length(label) between 2 and 120),
  constraint organization_brief_fields_hint_check check (hint is null or char_length(hint) <= 200),
  constraint organization_brief_fields_type_check
    check (field_type in ('text', 'long_text', 'date', 'select', 'multi_select', 'bool')),
  constraint organization_brief_fields_options_check
    check (
      case
        when field_type in ('select', 'multi_select')
          then jsonb_typeof(options) = 'array'
               and jsonb_array_length(options) between 2 and 20
        else options is null
      end
    ),
  constraint organization_brief_fields_sort_check check (sort_order >= 0)
);

comment on table public.organization_brief_fields is
  'Kurumun iş brifingi formu. Sorular kiracıya göre; ürün hiçbir sektörün alanını şemaya gömmez.';

create index if not exists organization_brief_fields_org_idx
  on public.organization_brief_fields(organization_id, sort_order);

alter table public.organization_brief_fields enable row level security;

drop policy if exists admins_manage_brief_fields on public.organization_brief_fields;
create policy admins_manage_brief_fields on public.organization_brief_fields
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_brief_fields.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner', 'admin']::membership_role[])
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_brief_fields.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner', 'admin']::membership_role[])
  ));

drop policy if exists members_read_brief_fields on public.organization_brief_fields;
create policy members_read_brief_fields on public.organization_brief_fields
  for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_brief_fields.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

revoke all on public.organization_brief_fields from anon;

-- ---------- 2. Doldurulan brifing ----------

/*
  Değerler jsonb: { "<alan_kodu>": <değer> }. Alan tanımı kurumun elinde
  olduğu için sütunlaştırılamaz. Boyut sınırı CHECK ile: serbest metin
  alanı olan bir formda sınırsız jsonb, tek satırda megabaytlara çıkabilir
  ve listeyi okuyan her sorguyu yavaşlatır.
*/
create table if not exists public.crm_opportunity_briefs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid primary key references public.crm_opportunities(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crm_opportunity_briefs_values_check
    check (jsonb_typeof(values) = 'object' and pg_column_size(values) <= 20000)
);

create table if not exists public.operation_workflow_briefs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid primary key references public.operation_workflows(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  /* Fırsattan kopyalandıysa kaynağı: ekran "satıştan geldi" diyebilsin. */
  source_opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint operation_workflow_briefs_values_check
    check (jsonb_typeof(values) = 'object' and pg_column_size(values) <= 20000)
);

create index if not exists crm_opportunity_briefs_org_idx on public.crm_opportunity_briefs(organization_id);
create index if not exists operation_workflow_briefs_org_idx on public.operation_workflow_briefs(organization_id);

alter table public.crm_opportunity_briefs enable row level security;
alter table public.operation_workflow_briefs enable row level security;

/*
  Brifingi kurumun AKTİF ÜYESİ okur ve yazar. Modül ayrımı (CRM / operasyon)
  sunucu tarafında yapılıyor: RLS "hangi kurum"u söyler, "hangi ekran"ı
  değil — zaten iki tarafın da aynı metni görmesi işin amacı.
*/
drop policy if exists members_manage_opportunity_briefs on public.crm_opportunity_briefs;
create policy members_manage_opportunity_briefs on public.crm_opportunity_briefs
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_opportunity_briefs.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_opportunity_briefs.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

drop policy if exists members_manage_workflow_briefs on public.operation_workflow_briefs;
create policy members_manage_workflow_briefs on public.operation_workflow_briefs
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = operation_workflow_briefs.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = operation_workflow_briefs.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

revoke all on public.crm_opportunity_briefs from anon;
revoke all on public.operation_workflow_briefs from anon;

-- ---------- 3. Fırsatın brifingi işe kopyalanıyor ----------

create or replace function private.arvo_brief_kopyala(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_workflow_id uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_opportunity_id is null or p_workflow_id is null then
    return;
  end if;
  insert into public.operation_workflow_briefs (organization_id, workflow_id, values, source_opportunity_id, updated_by)
  select b.organization_id, p_workflow_id, b.values, b.opportunity_id, b.updated_by
  from public.crm_opportunity_briefs b
  where b.opportunity_id = p_opportunity_id and b.organization_id = p_organization_id
  -- İşin kendi brifingi varsa dokunulmaz: operasyon onu düzeltmiş olabilir.
  on conflict (workflow_id) do nothing;
end;
$$;

revoke all on function private.arvo_brief_kopyala(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.arvo_brief_kopyala(uuid, uuid, uuid) to service_role;

/*
  Sözleşmeden açılan iş (sign_crm_contract) fırsatı DOLAYLI biliyor:
  crm_contracts.opportunity_id. O yolu değiştirmek yerine tetikleyici
  kuruyoruz — imza fonksiyonu uzun ve donmuş bir gövde, brifing için
  yeniden yazmak gereksiz risk.
*/
create or replace function private.arvo_workflow_brief_devral()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_opportunity uuid;
begin
  if new.contract_id is null then
    return new;
  end if;
  select c.opportunity_id into v_opportunity
  from public.crm_contracts c
  where c.id = new.contract_id and c.organization_id = new.organization_id;
  perform private.arvo_brief_kopyala(new.organization_id, v_opportunity, new.id);
  return new;
end;
$$;

revoke all on function private.arvo_workflow_brief_devral() from public, anon, authenticated;

drop trigger if exists arvo_workflow_brief_devral on public.operation_workflows;
create trigger arvo_workflow_brief_devral
  after insert on public.operation_workflows
  for each row execute function private.arvo_workflow_brief_devral();

/*
  Fırsat "kazanıldı" yolunda iş sözleşmesiz açılıyor; fırsat doğrudan
  elimizde, kopyayı burada alıyoruz. (Gövdenin kalanı 20261001060820'deki
  hâliyle aynı: adım üretmiyor, fatura/otomasyon/bildirim duruyor.)
*/
create or replace function private.process_won_crm_opportunity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_workflow_id uuid;
  new_invoice_id uuid;
  workflow_due_date date;
begin
  if new.stage <> 'won' or old.stage = 'won' then
    return new;
  end if;

  if exists (
    select 1 from public.crm_contracts contract
    where contract.opportunity_id = new.id
      and contract.workflow_id is not null
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.crm_automation_runs automation
    where automation.opportunity_id = new.id
  ) then
    return new;
  end if;

  workflow_due_date := coalesce(new.expected_close_date, current_date + 30);

  insert into public.operation_workflows (
    organization_id, title, customer_name, description,
    status, priority, start_date, due_date, created_by
  ) values (
    new.organization_id,
    new.title,
    new.customer_name,
    concat('CRM fırsatından otomatik oluşturuldu. Fırsat: ', new.title),
    'planned', 'normal', current_date, workflow_due_date, new.created_by
  ) returning id into new_workflow_id;

  -- Adımlar operation_workflows_seed_standard_steps tetikleyicisinden gelir.
  perform private.arvo_brief_kopyala(new.organization_id, new.id, new_workflow_id);

  insert into public.billing_invoices (
    organization_id, provider, status, currency, subtotal, tax, total, due_at
  ) values (
    new.organization_id, 'manual', 'open', 'TRY',
    new.estimated_value, 0, new.estimated_value,
    (workflow_due_date::timestamp at time zone 'Europe/Istanbul')
  ) returning id into new_invoice_id;

  insert into public.crm_automation_runs (opportunity_id, organization_id, workflow_id, invoice_id)
  values (new.id, new.organization_id, new_workflow_id, new_invoice_id);

  insert into public.notifications (
    organization_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id,
    'organization',
    'crm_won_automation',
    'Satış operasyona aktarıldı',
    'Kazanılan fırsat için operasyon iş akışı ve açık ödeme kaydı otomatik oluşturuldu.',
    '/panel/operations',
    jsonb_build_object('opportunity_id', new.id, 'workflow_id', new_workflow_id, 'invoice_id', new_invoice_id)
  );

  return new;
end;
$function$;

revoke all on function private.process_won_crm_opportunity() from public, anon, authenticated;

notify pgrst, 'reload schema';
