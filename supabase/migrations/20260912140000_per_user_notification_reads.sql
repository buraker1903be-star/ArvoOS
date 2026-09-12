-- Bildirimlerde okundu bilgisi kişiye özel; bildirim içeriği değiştirilemez.
--
-- Sorunlar:
--  * Toplu bildirimler (user_id null: yönetici duyurusu, ödeme onayı, destek
--    talebi…) tek bir read_at taşıyordu. Bir kişi "Okundu" veya "Tümünü
--    okundu işaretle" deyince bildirim herkes için okunmuş oluyordu.
--  * authenticated rolüne notifications üzerinde TÜM sütunlarda UPDATE
--    yetkisi verilmişti ve güncelleme politikası toplu bildirimleri de
--    kapsıyordu. Herhangi bir üye API üzerinden bir duyurunun başlığını,
--    metnini veya "Kaydı Aç" linkini değiştirip herkese sahte içerik
--    gösterebiliyordu.
--
-- Çözüm:
--  * notification_user_reads: toplu bildirimlerde her kullanıcının okundu
--    bilgisi ayrı tutulur.
--  * Üyeler notifications'ta yalnızca read_at sütununu ve yalnızca kendi
--    kişisel bildirimlerinde güncelleyebilir. Kurucu (founder) bildirimleri
--    eskisi gibi.
--  * Şu an okunmuş görünen toplu bildirimler kurumun tüm aktif üyeleri için
--    okunmuş sayılır; kimse bir anda yığınla "Yeni" bildirim görmez.
--  * arvo_unread_notification_count: üst menü ve ana sayfa sayacı için tek
--    doğru hesap (RLS uygulanır).

create table if not exists public.notification_user_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_user_reads enable row level security;
revoke all on public.notification_user_reads from public, anon;
grant select, insert on public.notification_user_reads to authenticated;

drop policy if exists "users read own notification reads" on public.notification_user_reads;
create policy "users read own notification reads"
on public.notification_user_reads for select to authenticated
using (user_id = (select auth.uid()));

-- Yalnızca kendisi için ve görebildiği bir bildirim için (notifications
-- alt sorgusu da RLS'e tabi).
drop policy if exists "users mark own notification reads" on public.notification_user_reads;
create policy "users mark own notification reads"
on public.notification_user_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.notifications n where n.id = notification_id)
);

create index if not exists notification_user_reads_user_idx
  on public.notification_user_reads (user_id, read_at desc);

-- Bildirim içeriği kilidi
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "members_mark_own_notifications_read" on public.notifications;
create policy "members_mark_own_notifications_read"
on public.notifications for update to authenticated
using (
  (audience = 'organization' and user_id = (select auth.uid()))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
)
with check (
  (audience = 'organization' and user_id = (select auth.uid()))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
);

-- Mevcut okunmuş toplu bildirimleri kurumun aktif üyeleri için okunmuş say.
insert into public.notification_user_reads (notification_id, user_id, read_at)
select n.id, m.user_id, n.read_at
from public.notifications n
join public.organization_memberships m
  on m.organization_id = n.organization_id and m.is_active
where n.audience = 'organization'
  and n.user_id is null
  and n.read_at is not null
on conflict do nothing;

create or replace function public.arvo_unread_notification_count(p_organization_id uuid)
returns integer
language sql
stable
security invoker
set search_path to ''
as $function$
  select count(*)::integer
  from public.notifications n
  where n.audience = 'organization'
    and n.organization_id = p_organization_id
    and (
      (n.user_id = (select auth.uid()) and n.read_at is null)
      or (n.user_id is null and not exists (
        select 1 from public.notification_user_reads r
        where r.notification_id = n.id and r.user_id = (select auth.uid())
      ))
    )
    and not exists (
      select 1 from public.notification_user_dismissals d
      where d.notification_id = n.id and d.user_id = (select auth.uid())
    );
$function$;

revoke all on function public.arvo_unread_notification_count(uuid) from public, anon;
grant execute on function public.arvo_unread_notification_count(uuid) to authenticated;
