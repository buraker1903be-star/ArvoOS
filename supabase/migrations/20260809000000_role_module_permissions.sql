-- Rol bazlı, panelden ayarlanabilir modül yetkilendirmesi. Bir satır
-- olmaması "erişebilir" (varsayılan açık) anlamına gelir; sadece
-- açıkça kapatılan (can_access=false) kombinasyonlar gizlenir. Bu
-- sayede mevcut davranış (sadece Operasyoncu kısıtlı) hiç bozulmadan
-- kalır, kurum sahibi istediği zaman panelden değiştirebilir.

create table if not exists public.role_module_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null,
  module_key text not null,
  can_access boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (organization_id, role, module_key)
);

alter table public.role_module_permissions enable row level security;

drop policy if exists "org members read permissions" on public.role_module_permissions;
create policy "org members read permissions" on public.role_module_permissions
  for select using (
    exists(
      select 1 from public.organization_memberships m
      where m.organization_id = role_module_permissions.organization_id
        and m.user_id = auth.uid() and m.is_active = true
    )
  );

drop policy if exists "owner and admin manage permissions" on public.role_module_permissions;
create policy "owner and admin manage permissions" on public.role_module_permissions
  for all using (
    exists(
      select 1 from public.organization_memberships m
      where m.organization_id = role_module_permissions.organization_id
        and m.user_id = auth.uid() and m.is_active = true
        and m.role in ('owner','admin')
    )
  ) with check (
    exists(
      select 1 from public.organization_memberships m
      where m.organization_id = role_module_permissions.organization_id
        and m.user_id = auth.uid() and m.is_active = true
        and m.role in ('owner','admin')
    )
  );

-- Mevcut davranışı birebir koru: Operasyoncu rolü halihazırda bu
-- modüllerden men ediliyordu (lib/role-permissions.ts, kod içinde
-- sabitti). Artık aynı kural veritabanında, tüm mevcut kurumlar için.
insert into public.role_module_permissions (organization_id, role, module_key, can_access)
select o.id, 'operasyoncu', m.module_key, false
from public.organizations o
cross join (values ('crm'),('finance'),('hr'),('reports'),('documents')) as m(module_key)
on conflict (organization_id, role, module_key) do nothing;
