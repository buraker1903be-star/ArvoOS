/*
  KURULUM, SAHİP KATILINCA TAMAMLANIR (14.10.2026).

  organizations.provisioning_state'i 'active'e çeken TEK yer ücretli bir
  ArvoOS çekirdek dönemiydi (private.arvo_activate_license_period). Daveti
  kabul edip panele giren, ama denemede olan ya da yalnızca Randevu /
  ArvoLab kullanan kiracılar konsolun Kurulumlar ekranında sonsuza dek
  "Kurulumu devam eden"de kalıyordu; ana sayfanın "bekleyen kurulum"
  sayısı da şişiyordu. Kurulumun bitişi ödemeyle değil, kurum sahibinin
  hesabının kuruma etkin üye olmasıyla belli: sihirbazın son adımı
  "sahibe davet" ve o davet kabul edilince kurulum yapılacak bir şey
  bırakmıyor. Ücret ve deneme Kurulumlar'ın üçüncü aşamasında ayrıca
  izleniyor.

  Yalnızca kurulum durumlarından (creating, inviting_owner,
  waiting_owner, failed) geçiş yapılır; askıya alınmış ya da arşivlenmiş
  bir kurum sahibin yeniden etkinleşmesiyle açılmaz.

  SECURITY DEFINER: daveti kabul eden kişinin organizations'a yazma
  yetkisi yok. İşlev yalnızca tetikleyiciden çağrılır; kimseye
  çalıştırma yetkisi verilmiyor.
*/

create or replace function private.arvo_kurulum_sahip_katildi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.role = 'owner' and new.is_active then
    update public.organizations
    set provisioning_state = 'active', updated_at = now()
    where id = new.organization_id
      and provisioning_state in ('creating', 'inviting_owner', 'waiting_owner', 'failed');
  end if;
  return new;
end
$$;

revoke all on function private.arvo_kurulum_sahip_katildi() from public, anon, authenticated;

drop trigger if exists arvo_kurulum_sahip_katildi on public.organization_memberships;
create trigger arvo_kurulum_sahip_katildi
  after insert or update of role, is_active on public.organization_memberships
  for each row execute function private.arvo_kurulum_sahip_katildi();

-- Bugüne kadar sahibi katıldığı hâlde "devam ediyor"da kalanlar.
update public.organizations o
set provisioning_state = 'active', updated_at = now()
where o.provisioning_state in ('creating', 'inviting_owner', 'waiting_owner', 'failed')
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = o.id and m.role = 'owner' and m.is_active
  );
