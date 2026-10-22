/*
  ÇEVRİMİÇİ SİNYALİ TEK ÇAĞRIDA (22.10.2026, hız çalışması).

  Panel her sayfa açılışında ve dakikada bir "buradayım" diyor. Bu,
  sunucu işlemi (presence-actions.recordPresence) olarak gidiyordu ve
  ardışık beş veritabanı turu atıyordu: bağlam, oturum okuma, user_presence
  upsert, oturum güncelleme (yeni oturumda personel okuma + ekleme de).
  Canlıda tur başına ~170 ms. Daha kötüsü: Next sunucu işlemlerini SIRAYLA
  çalıştırıyor — sayfa açılır açılmaz basılan bir düğme bu sinyalin
  bitmesini bekliyordu. Kullanıcının "tıkladım, bir şey olmadı" dediği
  gecikmenin bir kısmı buydu.

  Artık sinyal ayrı bir uçtan (app/api/varlik) ve bu işlevle tek turda.
  Mantık eskisiyle aynı:
    - Çerezdeki oturum bu kullanıcının, bu kurumun ve kapanmamışsa sürer.
    - Başka kuruma geçildiyse eski oturum "workspace_switch" ile kapanır,
      yenisi açılır (personel kimliği, IP, tarayıcı ile).
    - user_presence'a son görülme, oturum kaydına son görülme ve sayfa.
  security INVOKER: yazılar çağıranın RLS'iyle — eski PostgREST
  çağrılarıyla aynı yetki. Dönüş: oturum kimliği (çerez için).
*/
create or replace function public.arvo_varlik_kaydet(
  p_org uuid,
  p_oturum uuid,
  p_yol text,
  p_ip text,
  p_ua text
)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_ben uuid := (select auth.uid());
  v_simdi timestamptz := now();
  v_id uuid;
  v_kurum uuid;
  v_cikis timestamptz;
  v_ip inet;
begin
  if v_ben is null or p_org is null then
    return null;
  end if;

  if p_oturum is not null then
    select s.id, s.organization_id, s.logout_at into v_id, v_kurum, v_cikis
    from public.user_session_logs s where s.id = p_oturum and s.user_id = v_ben;
  end if;

  if v_id is null or v_kurum <> p_org or v_cikis is not null then
    if v_id is not null and v_cikis is null then
      update public.user_session_logs
      set logout_at = v_simdi, last_seen_at = v_simdi, logout_reason = 'workspace_switch'
      where id = v_id and user_id = v_ben;
    end if;

    /* Bozuk bir IP başlığı oturumu düşürmesin. */
    begin
      v_ip := nullif(trim(coalesce(p_ip, '')), '')::inet;
    exception when others then
      v_ip := null;
    end;

    v_id := gen_random_uuid();
    insert into public.user_session_logs
      (id, organization_id, user_id, employee_id, login_at, last_seen_at, ip_address, user_agent)
    values (
      v_id, p_org, v_ben,
      (select e.id from public.hr_employees e where e.organization_id = p_org and e.user_id = v_ben limit 1),
      v_simdi, v_simdi, v_ip, nullif(left(coalesce(p_ua, ''), 500), '')
    );
  end if;

  insert into public.user_presence (organization_id, user_id, session_id, last_seen_at, updated_at)
  values (p_org, v_ben, v_id, v_simdi, v_simdi)
  on conflict (organization_id, user_id) do update
    set session_id = excluded.session_id, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at;

  update public.user_session_logs
  set last_seen_at = v_simdi, current_path = left(coalesce(nullif(p_yol, ''), '/panel'), 300)
  where id = v_id and user_id = v_ben and logout_at is null;

  return v_id;
end $$;

revoke all on function public.arvo_varlik_kaydet(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.arvo_varlik_kaydet(uuid, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
