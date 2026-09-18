-- ============================================================
-- Gizlilik sözleşmesinde çalışan yalnızca imzasını ekleyebilir
--
-- confidentiality_sign_self politikası çalışanın kendi bekleyen sözleşmesini
-- güncellemesine izin veriyor ve sonuçta yalnızca status = 'signed',
-- signature_path ve signed_at'in dolu olmasını arıyor. Satırın geri kalanı
-- serbestti. Oturum jetonu tarayıcıda olduğu için çalışan veritabanı
-- API'sinden:
--
--  - content_snapshot'ı (imzaladığı metni) ve agreement_version'ı istediği
--    gibi değiştirip öyle "imzalayabiliyordu": kayıtta duran metin
--    kurumun hazırladığı metin olmaktan çıkıyordu;
--  - signed_at'e geçmiş ya da ileri bir tarih yazabiliyordu;
--  - signature_path'e kendi yüklemediği herhangi bir yolu yazabiliyordu.
--
-- Tabloda tetikleyici yoktu. Uygulamanın imza işlemi
-- (app/panel/confidentiality/[id]/actions.ts) yalnızca status, signer_name,
-- signature_path, signer_ip, signer_user_agent, signed_at, updated_at
-- yazıyor ve imzayı "<kurum>/<çalışan>/<sözleşme>-<rastgele>.png" yoluna
-- yüklüyor. Bu kural veritabanına taşındı:
--  - kimlik ve içerik alanları istemciden değiştirilemez;
--  - imza anındaki signed_at sunucu saatine sabitlenir;
--  - signature_path bu sözleşmenin klasöründe olmalı.
--
-- Servis anahtarı ve SQL Editor etkilenmez (fonksiyon security INVOKER,
-- çağıranın rolüne bakar).
-- ============================================================

create or replace function private.arvo_guard_confidentiality_signature()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.organization_id   is distinct from old.organization_id
  or new.employee_id       is distinct from old.employee_id
  or new.agreement_no      is distinct from old.agreement_no
  or new.agreement_version is distinct from old.agreement_version
  or new.content_snapshot  is distinct from old.content_snapshot
  or new.created_by        is distinct from old.created_by
  or new.created_at        is distinct from old.created_at
  then
    raise exception 'Gizlilik sözleşmesinin metni ve tarafları değiştirilemez.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status = 'signed' and old.status is distinct from 'signed' then
    if new.signature_path is null
       or new.signature_path not like
          old.organization_id::text || '/' || old.employee_id::text || '/' || old.id::text || '-%.png' then
      raise exception 'İmza dosyası bu sözleşmeye ait değil.'
        using errcode = 'insufficient_privilege';
    end if;
    new.signed_at := now();
  end if;

  return new;
end
$$;
revoke all on function private.arvo_guard_confidentiality_signature() from public, anon;

drop trigger if exists arvo_guard_confidentiality_signature on public.hr_confidentiality_agreements;
create trigger arvo_guard_confidentiality_signature
  before update on public.hr_confidentiality_agreements
  for each row execute function private.arvo_guard_confidentiality_signature();

-- Geri almak için:
-- drop trigger if exists arvo_guard_confidentiality_signature on public.hr_confidentiality_agreements;
-- drop function if exists private.arvo_guard_confidentiality_signature();
