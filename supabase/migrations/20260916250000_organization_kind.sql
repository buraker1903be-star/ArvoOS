-- Kurum türü: müşteri mi, kendi markamız mı.
--
-- ArvoOS, AkademikMerkez ve ArvoCulture aynı tüzel kişiliğe ait; kendilerine
-- fatura kesilmiyor (ücretleri boş). Ama Platform ekranlarında müşteri
-- kurumlarla aynı listede görünüyorlar ve "kaç müşterim var, aylık ne
-- kazanıyorum" sorusunu bulandırıyorlar. Üç kurumla fark edilmiyor; gerçek
-- müşteriler geldiğinde sayılar yanlış okunur.
--
-- Bu alan yalnızca gösterim ve sayım içindir. Erişimi, lisansı, tahsilatı
-- etkilemez: iç kurum da müşteri de aynı kurallarla çalışır.

alter table public.organizations
  add column if not exists kind text not null default 'customer';

alter table public.organizations drop constraint if exists organizations_kind_check;
alter table public.organizations add constraint organizations_kind_check
  check (kind in ('customer','internal'));

comment on column public.organizations.kind is
  'customer = müşteri kurum, internal = kendi markamız. Yalnızca Platform ekranlarındaki sayım ve etiket içindir.';

-- Platformun kendi kurumu tartışmasız iç kurum; diğerlerini kurucu
-- Platform → Yönetim'den işaretler.
update public.organizations set kind = 'internal', updated_at = now()
where slug = 'arvo-os' and kind <> 'internal';

create index if not exists organizations_kind_idx on public.organizations(kind);
