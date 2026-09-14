-- İlk kurulumda girilen logo, renk, telefon, web sitesi ve resmi ad eskiden
-- yalnızca organization_onboarding'de kalıyordu; belgeler, takip ekranı ve
-- panel ise organizations kaydını okuyor. Kurulumu tamamlamış kurumlar için
-- bu bilgiler kurum kaydına taşınır. Yalnızca BOŞ alanlar doldurulur; Ayarlar'dan
-- sonradan girilmiş hiçbir değerin üzerine yazılmaz. Tekrar çalıştırılabilir.

update public.organizations org
set
  logo_url      = coalesce(nullif(trim(org.logo_url), ''), nullif(trim(onb.logo_url), '')),
  contact_phone = coalesce(nullif(trim(org.contact_phone), ''), left(nullif(trim(onb.phone), ''), 80)),
  website_url   = coalesce(nullif(trim(org.website_url), ''), left(nullif(trim(onb.website), ''), 500)),
  legal_name    = coalesce(nullif(trim(org.legal_name), ''), left(nullif(trim(onb.legal_name), ''), 200)),
  -- '#111827' tablonun varsayılanı: kullanıcı renk seçmemişse taşınmaz.
  primary_color = coalesce(
    nullif(trim(org.primary_color), ''),
    case when onb.primary_color ~ '^#[0-9a-fA-F]{6}$' and lower(onb.primary_color) <> '#111827' then onb.primary_color end
  ),
  updated_at = now()
from public.organization_onboarding onb
where onb.organization_id = org.id
  and onb.completed_at is not null
  and (
    (nullif(trim(org.logo_url), '') is null and nullif(trim(onb.logo_url), '') is not null)
    or (nullif(trim(org.contact_phone), '') is null and nullif(trim(onb.phone), '') is not null)
    or (nullif(trim(org.website_url), '') is null and nullif(trim(onb.website), '') is not null)
    or (nullif(trim(org.legal_name), '') is null and nullif(trim(onb.legal_name), '') is not null)
    or (nullif(trim(org.primary_color), '') is null and onb.primary_color ~ '^#[0-9a-fA-F]{6}$' and lower(onb.primary_color) <> '#111827')
  );
