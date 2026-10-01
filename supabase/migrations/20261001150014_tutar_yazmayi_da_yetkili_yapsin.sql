-- ============================================================
-- TUTARI YAZMAYI DA YETKİLİ YAPSIN
--
-- Okuma kapatıldı (20261001143617) ama YAZMA açık kaldı: operasyon
-- personeli crm_contracts.amount'u GÖREMEZKEN DEĞİŞTİREBİLİYORDU.
-- Sebebi UPDATE politikalarının hâlâ arvo_can_access_opportunity
-- kullanması — işin sorumlusuna satırın tamamında yazma hakkı veriyor.
-- Göremediği bir alanı yazabilmek okumaktan kötü: yanlışlıkla ya da
-- kasten değişen tutar kimsenin gözüne çarpmaz.
--
-- UPDATE politikasını daraltmak YANLIŞ olurdu: operasyon sözleşmeyi
-- meşru şekilde güncelliyor (iş bağlantısını koparmak gibi). Koruma
-- bu yüzden SÜTUN düzeyinde: satırı yazabilir, para sütunlarına
-- dokunamaz.
--
-- Tetikleyiciler BEFORE UPDATE ve yalnızca DEĞİŞEN tutarı denetliyor;
-- tutara dokunmayan güncellemeler etkilenmiyor.
-- ============================================================

-- Sunucu tarafı (service key ile; auth.uid() yok) ve tutarı görebilen
-- kullanıcılar yazabilir. Diğer herkes hayır.
create or replace function private.arvo_tutar_yazabilir(p_firsat uuid)
returns boolean language sql stable security definer set search_path to ''
as $$ select (select auth.uid()) is null or private.arvo_firsat_tutar_gorebilir(p_firsat) $$;

revoke all on function private.arvo_tutar_yazabilir(uuid) from public, anon;
grant execute on function private.arvo_tutar_yazabilir(uuid) to authenticated, service_role;

create or replace function private.arvo_sozlesme_tutari_korunsun()
returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  if new.amount is distinct from old.amount
     and not private.arvo_tutar_yazabilir(new.opportunity_id) then
    raise exception 'Sözleşme tutarını değiştirme yetkiniz yok.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.arvo_teklif_tutari_korunsun()
returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  if (new.amount is distinct from old.amount
      or new.net_amount is distinct from old.net_amount
      or new.tax_amount is distinct from old.tax_amount
      or new.gross_amount is distinct from old.gross_amount)
     and not private.arvo_tutar_yazabilir(new.opportunity_id) then
    raise exception 'Teklif tutarını değiştirme yetkiniz yok.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.arvo_firsat_degeri_korunsun()
returns trigger language plpgsql security definer set search_path to ''
as $$
begin
  if new.estimated_value is distinct from old.estimated_value
     and not private.arvo_tutar_yazabilir(new.id) then
    raise exception 'Fırsat değerini değiştirme yetkiniz yok.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function private.arvo_sozlesme_tutari_korunsun() from public, anon, authenticated;
revoke all on function private.arvo_teklif_tutari_korunsun() from public, anon, authenticated;
revoke all on function private.arvo_firsat_degeri_korunsun() from public, anon, authenticated;

drop trigger if exists arvo_sozlesme_tutari_korunsun on public.crm_contracts;
create trigger arvo_sozlesme_tutari_korunsun before update on public.crm_contracts
  for each row execute function private.arvo_sozlesme_tutari_korunsun();

drop trigger if exists arvo_teklif_tutari_korunsun on public.crm_proposals;
create trigger arvo_teklif_tutari_korunsun before update on public.crm_proposals
  for each row execute function private.arvo_teklif_tutari_korunsun();

drop trigger if exists arvo_firsat_degeri_korunsun on public.crm_opportunities;
create trigger arvo_firsat_degeri_korunsun before update on public.crm_opportunities
  for each row execute function private.arvo_firsat_degeri_korunsun();

notify pgrst, 'reload schema';
