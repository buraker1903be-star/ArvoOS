/*
  SÖZLEŞMEYE ÖZEL MADDE METİNLERİ (03.11.2026, kurum sahibinin isteği).

  Kurum maddeleri Ayarlar → Belge metinleri'nde KURUM için değiştiriyordu
  (organization_document_texts, 20261012083920); tek bir müşteriye özel
  bir hüküm (ör. bu öğrenciye farklı gizlilik süresi) yazmanın yolu
  yoktu, kurum metnini değiştirmek bütün sözleşmeleri değiştiriyordu.

  crm_contracts.ozel_maddeler yalnızca BU sözleşmenin değiştirilmiş
  maddelerini tutar: { anahtar: { baslik, metin } }. Belge kurum metninin
  üstüne bunu bindirir (aynı anahtar → sözleşmeninki). Sıra ve hangi
  maddelerin olduğu kurum metninden gelir; burada yalnızca metin.

  İmzalanınca donar: kopya tetikleyicisi (arvo_belge_metni_kopyala)
  document_text'e kurum metni + sözleşmeye özel maddeleri birlikte yazar;
  imzadan, iptalden ya da retten sonra ozel_maddeler değiştirilemez.
*/
alter table public.crm_contracts add column if not exists ozel_maddeler jsonb;

/*
  Kurum metni + sözleşmeye özel maddeler. Biri yoksa öteki; ikisi de yoksa
  NULL. Özel madde yalnızca NESNEYSE bindirilir: kopya tetikleyicisi değeri
  to_jsonb(new) ile okuyor ve boş sütun orada SQL NULL değil JSON null
  geliyor; nesne || null dizi üretip kurumun metnini bozuyordu (testte
  yakalandı).
*/
create or replace function private.arvo_sozlesme_metni_birlestir(p_kurum jsonb, p_ozel jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_ozel is null or jsonb_typeof(p_ozel) <> 'object' or p_ozel = '{}'::jsonb then p_kurum
    else (case when jsonb_typeof(p_kurum) = 'object' then p_kurum else '{"surum": 1}'::jsonb end)
      || jsonb_build_object('maddeler', (case when jsonb_typeof(p_kurum -> 'maddeler') = 'object' then p_kurum -> 'maddeler' else '{}'::jsonb end) || p_ozel)
  end;
$function$;
revoke all on function private.arvo_sozlesme_metni_birlestir(jsonb, jsonb) from public, anon, authenticated;

/*
  Kopya: gövde canlı anlık görüntüden; tek değişiklik sözleşmede özel
  maddelerin de kopyaya girmesi. Tetikleyici iki tabloda ortak; teklif
  satırında ozel_maddeler sütunu yok, o yüzden to_jsonb ile okunuyor
  (new.ozel_maddeler teklifte çalışma anında düşerdi).
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
      private.arvo_sozlesme_metni_birlestir(
        (select t.content from public.organization_document_texts t
          where t.organization_id = new.organization_id and t.document_type = tur),
        case when tur = 'contract' then to_jsonb(new) -> 'ozel_maddeler' else null end),
      '{}'::jsonb)
    into new.document_text;
  end if;
  return new;
end;
$function$;
revoke all on function private.arvo_belge_metni_kopyala() from public, anon, authenticated;

/*
  Koruma (invoker, panel ve API yolları): kapanmış sözleşmenin özel
  maddeleri değişmez. İmzalı belge zaten document_text'ten çiziliyor,
  ama kayıtta imzalananla farklı bir metin durması kanıtı bulandırırdı.
*/
create or replace function private.arvo_ozel_madde_koruma()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.ozel_maddeler is distinct from old.ozel_maddeler
     and old.status not in ('draft', 'sent') then
    raise exception 'İmzalanmış ya da kapanmış sözleşmenin maddeleri değiştirilemez.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$function$;
revoke all on function private.arvo_ozel_madde_koruma() from public, anon, authenticated;

drop trigger if exists arvo_ozel_madde_koruma on public.crm_contracts;
create trigger arvo_ozel_madde_koruma before update on public.crm_contracts
  for each row execute function private.arvo_ozel_madde_koruma();

/*
  Müşteri sayfası: kopya varsa o (imzalanmış), yoksa kurum metni +
  sözleşmeye özel maddeler. Gövde canlı anlık görüntüden.
*/
create or replace function public.arvo_public_document_text(public_token text, document_type text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with target as (
    select p.organization_id, p.document_text, null::jsonb as ozel
    from public.crm_proposals p
    where arvo_public_document_text.document_type = 'proposal'
      and p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
    union all
    select c.organization_id, c.document_text, c.ozel_maddeler
    from public.crm_contracts c
    where arvo_public_document_text.document_type = 'contract'
      and c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  )
  select coalesce(
    t.document_text,
    private.arvo_sozlesme_metni_birlestir(
      (select d.content from public.organization_document_texts d
        where d.organization_id = t.organization_id
          and d.document_type = arvo_public_document_text.document_type),
      t.ozel)
  )
  from target t
  where coalesce(public_token, '') <> ''
  limit 1;
$function$;
