/*
  KURUMUN KENDİ SÖZLEŞME VE TEKLİF METİNLERİ (12.10.2026)

  Sözleşme ve teklif metni kodda sabitti; kurum kendi maddelerini
  yazamıyordu. Artık kurum Ayarlar → Belge metinleri'nde her maddeyi
  değiştirebiliyor, madde ekleyip çıkarabiliyor. Değiştirilmeyen madde
  Arvo'nun metniyle (koddaki, sürümlü) çizilir; content yalnızca
  kurumun DEĞİŞİKLİKLERİNİ tutar (lib/belge-metni).

  İMZALANAN METİN DEĞİŞMEZ. Kurum metni sonradan değiştirse de imzalı
  sözleşme onaylandığı metinle görünmeli. imza anındaki kurum künyesiyle
  (issuer_snapshot, arvo_freeze_issuer_identity) aynı kalıp: sözleşme
  imzalanınca, teklif müşteri kararıyla kapanınca kurumun o anki metni
  satıra kopyalanır (document_text). Kopya yoksa (taslak, gönderilmiş)
  belge kurumun güncel metniyle çizilir.

  Var olan imza ve karar fonksiyonlarına DOKUNULMADI: kopyayı ayrı bir
  tetikleyici alıyor, böylece imza akışının canlı gövdesi değişmiyor.
*/

create table if not exists public.organization_document_texts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in ('contract', 'proposal')),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, document_type)
);

alter table public.organization_document_texts enable row level security;

-- Okuma: kurumun aktif üyeleri (belgeyi panelde çizen herkes metne ihtiyaç duyar).
drop policy if exists members_read_document_texts on public.organization_document_texts;
create policy members_read_document_texts on public.organization_document_texts
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_document_texts.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

-- Yazma: Kurum Sahibi ve Yönetici (çalışma türü şablonlarıyla aynı kural).
-- Panel yeteneği (settings.belge_metni.yonet) bunu yalnızca daraltabilir.
drop policy if exists admins_manage_document_texts on public.organization_document_texts;
create policy admins_manage_document_texts on public.organization_document_texts
  as permissive for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_document_texts.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner'::public.membership_role, 'admin'::public.membership_role])
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_document_texts.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner'::public.membership_role, 'admin'::public.membership_role])
  ));

revoke all on table public.organization_document_texts from anon;
grant select, insert, update, delete on table public.organization_document_texts to authenticated;

-- Belgenin onaylandığı metnin kopyası.
alter table public.crm_contracts add column if not exists document_text jsonb;
alter table public.crm_proposals add column if not exists document_text jsonb;

/*
  KORUMA (invoker): personel kopyayı API'den yazamaz. Oturum jetonu
  tarayıcıda; UPDATE yetkisi olan kullanıcı her sütunu yazabilir (AGENTS.md
  "RLS kim yazabilir'i söyler, neyi'yi söylemez"). İmzalı sözleşmenin
  metni elle değiştirilebilseydi imza kanıtı anlamsızlaşırdı.

  Adı kopya tetikleyicisinden ÖNCE sıralanıyor (a_ / b_): BEFORE
  tetikleyiciler ada göre çalışır ve koruma yalnızca KULLANICININ
  gönderdiği değişikliğe bakmalı, kopyanın kendisine değil. Yoksa
  personelin teklifi müşteri adına sözleşmeye çevirmesi (teklif
  kararlanıyor → kopya alınıyor) reddedilirdi.
*/
create or replace function private.arvo_belge_metni_koruma()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.document_text is not null then
      raise exception 'Belge metninin kopyası elle yazılamaz.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.document_text is distinct from old.document_text then
    raise exception 'Belge metninin kopyası yalnızca imza ya da müşteri kararıyla alınır.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$function$;

/*
  KOPYA (definer): kurum metni RLS'li bir tabloda; imzayı anon'un
  çağırdığı fonksiyon yürütüyor. Kurumun metni yoksa '{}' yazılır: "hepsi
  Arvo'nun metni" demek ve yine de "kopya alındı" demek — sonradan
  eklenen kurum metni imzalı belgeye sızmasın.

  Sözleşme: durum 'signed' olduğu an. Teklif: taslak/gönderilmiş
  dışındaki bir duruma geçtiği an (kabul, ret, süre dolması, arşiv) ya da
  doğrudan öyle oluşturulduğunda (direkt sözleşme).
*/
create or replace function private.arvo_belge_metni_kopyala()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  tur text := case tg_table_name when 'crm_contracts' then 'contract' else 'proposal' end;
  donuyor boolean;
begin
  if new.document_text is not null then
    return new;
  end if;
  if tg_table_name = 'crm_contracts' then
    donuyor := new.status = 'signed' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'signed');
  else
    donuyor := coalesce(new.status, '') not in ('draft', 'sent')
      and (tg_op = 'INSERT' or coalesce(old.status, '') in ('draft', 'sent'));
  end if;
  if donuyor then
    select coalesce(
      (select t.content from public.organization_document_texts t
        where t.organization_id = new.organization_id and t.document_type = tur),
      '{}'::jsonb)
    into new.document_text;
  end if;
  return new;
end;
$function$;

revoke all on function private.arvo_belge_metni_koruma() from public, anon, authenticated;
revoke all on function private.arvo_belge_metni_kopyala() from public, anon, authenticated;

drop trigger if exists arvo_belge_metni_a_koruma on public.crm_contracts;
create trigger arvo_belge_metni_a_koruma before insert or update on public.crm_contracts
  for each row execute function private.arvo_belge_metni_koruma();
drop trigger if exists arvo_belge_metni_b_kopya on public.crm_contracts;
create trigger arvo_belge_metni_b_kopya before insert or update on public.crm_contracts
  for each row execute function private.arvo_belge_metni_kopyala();

drop trigger if exists arvo_belge_metni_a_koruma on public.crm_proposals;
create trigger arvo_belge_metni_a_koruma before insert or update on public.crm_proposals
  for each row execute function private.arvo_belge_metni_koruma();
drop trigger if exists arvo_belge_metni_b_kopya on public.crm_proposals;
create trigger arvo_belge_metni_b_kopya before insert or update on public.crm_proposals
  for each row execute function private.arvo_belge_metni_kopyala();

/*
  HERKESE AÇIK OKUMA: müşterinin sözleşme/teklif sayfası. Bağlantının
  belirtecine bağlı; kopya varsa o, yoksa kurumun güncel metni. Kurum
  künyesini veren arvo_public_organization_legal ile aynı kapı.
*/
create or replace function public.arvo_public_document_text(public_token text, document_type text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with target as (
    select p.organization_id, p.document_text
    from public.crm_proposals p
    where arvo_public_document_text.document_type = 'proposal'
      and p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
    union all
    select c.organization_id, c.document_text
    from public.crm_contracts c
    where arvo_public_document_text.document_type = 'contract'
      and c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  )
  select coalesce(
    t.document_text,
    (select d.content from public.organization_document_texts d
      where d.organization_id = t.organization_id
        and d.document_type = arvo_public_document_text.document_type)
  )
  from target t
  where coalesce(public_token, '') <> ''
  limit 1;
$function$;

revoke all on function public.arvo_public_document_text(text, text) from public, anon;
grant execute on function public.arvo_public_document_text(text, text) to anon, authenticated;
