/*
  UYGULANMAMIŞ MIGRATION DENETİMİ (02.11.2026).

  29.10.2026'daki otomatik proforma migration'ı canlıya hiç uygulanmadı;
  dört gün boyunca proforma müşteriye gitmedi ve sebep yalnızca sunucu
  günlüğündeydi. Migration'lar SQL Editor'den elle uygulandığı için
  Supabase'in migration defteri bir şey söylemiyor.

  Bu işlev, kodun beklediği nesnelerin (lib/migration-izleri.json: tablo,
  sütun, işlev, tetikleyici) canlıda olup olmadığına bakıp EKSİK olanları
  döndürüyor. Sistem sağlığı → Veritabanı sekmesi onu çağırıyor.

  Yalnızca katalogu okur, veri okumaz. Yine de yalnızca servis rolüne
  açık: kurucu konsolu onu sunucu anahtarıyla çağırıyor; nesne adlarının
  kiracılara ya da oturumsuz ziyaretçiye açılmasına gerek yok.
*/
create or replace function public.platform_sema_eksikleri(p_izler jsonb)
 returns table (eksik_migration text, eksik_tur text, eksik_ad text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  m jsonb;
  i jsonb;
  var_mi boolean;
begin
  for m in select value from jsonb_array_elements(coalesce(p_izler, '[]'::jsonb)) loop
    for i in select value from jsonb_array_elements(coalesce(m->'izler', '[]'::jsonb)) loop
      var_mi := case i->>'tur'
        when 'tablo' then to_regclass(i->>'ad') is not null
        when 'islev' then exists (
          select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = split_part(i->>'ad', '.', 1) and p.proname = split_part(i->>'ad', '.', 2))
        when 'sutun' then exists (
          select 1 from pg_catalog.pg_attribute a
          where a.attrelid = to_regclass(i->>'tablo') and a.attname = i->>'sutun' and not a.attisdropped and a.attnum > 0)
        when 'tetikleyici' then exists (
          select 1 from pg_catalog.pg_trigger t
          where t.tgrelid = to_regclass(i->>'tablo') and t.tgname = i->>'ad' and not t.tgisinternal)
        else true
      end;
      if not coalesce(var_mi, false) then
        eksik_migration := m->>'migration';
        eksik_tur := i->>'tur';
        eksik_ad := case when i->>'tur' = 'sutun' then (i->>'tablo') || '.' || (i->>'sutun')
                         when i->>'tur' = 'tetikleyici' then (i->>'ad') || ' (' || (i->>'tablo') || ')'
                         else i->>'ad' end;
        return next;
      end if;
    end loop;
  end loop;
end;
$function$;
revoke all on function public.platform_sema_eksikleri(jsonb) from public, anon, authenticated;
grant execute on function public.platform_sema_eksikleri(jsonb) to service_role;
