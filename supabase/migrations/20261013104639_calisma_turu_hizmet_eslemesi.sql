/*
  HİZMET TÜRÜ → ÇALIŞMA TÜRÜ EŞLEMESİ VE AKADEMİKMERKEZ ŞABLONLARI
  (13.10.2026).

  Talep girerken hizmet türü (request_details.service_type: "Makale
  Danışmanlığı") ile çalışma türü (step_template_set: işin adım listesi)
  iki ayrı seçimdi ve aralarında hiçbir bağ yoktu: makale talebi
  öntanımlı türle — AkademikMerkez'de tez listesiyle — açılıyor, makale
  işine "Tez Öneri Formu" adımları düşüyordu. Kurum sahibinin tarifi:
  "Hizmet türü ne seçildiyse çalışma türü otomatik o seçilmeli, adımlar
  ona göre yüklenmeli."

  1) organization_step_template_sets.hizmet_turleri: bu çalışma türünün
     otomatik seçileceği hizmet türleri (adıyla; hizmet türü serbest metin
     saklanıyor). Kurum Şablon sayfasından değiştirir. Talep formu ve
     sunucu (crm/actions.ts) buradan seçer — lib/is-adimlari calismaTuruBul.

  2) AkademikMerkez için her hizmet türünün adım listesi. Kurallar:
     - TEZ'E DOKUNULMAZ (kurum sahibinin şartı): tez listesine satır
       eklenmez, silinmez, değişmez; yalnızca boşsa eşlemesi yazılır.
     - Zaten adımı olan hiçbir türe adım eklenmez (kurumun kendi
       yazdığı liste korunur); aynı adlı tür varsa onun kodu kullanılır.
     - Kurum kendi eşlemesini yazdıysa üstüne yazılmaz.
     Tekrar uygulanabilir: ikinci çalıştırmada hiçbir şey değişmez.
*/

alter table public.organization_step_template_sets
  add column if not exists hizmet_turleri text[] not null default '{}';

alter table public.organization_step_template_sets
  drop constraint if exists organization_step_template_sets_hizmet_check;
alter table public.organization_step_template_sets
  add constraint organization_step_template_sets_hizmet_check
  check (cardinality(hizmet_turleri) <= 30 and array_position(hizmet_turleri, null) is null);

comment on column public.organization_step_template_sets.hizmet_turleri is
  'Bu çalışma türünün talepte otomatik seçileceği hizmet türleri (adıyla). Şablon sayfasından düzenlenir.';

/*
  Bir türü (yoksa) kurar, adımları (tür boşsa) yazar, eşlemeyi (boşsa)
  yazar. Yalnızca bu migration kullanıyor; kimseye açık değil.
  adimlar: [[aşama, görev], …] sırasıyla.
*/
create or replace function private.arvo_sablon_kur(
  p_org uuid, p_kod text, p_ad text, p_hizmet text[], p_sira integer, p_adimlar jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kod text;
begin
  -- Aynı adlı tür varsa (kurum elle açmış olabilir) onu kullan.
  select s.code into v_kod from public.organization_step_template_sets s
  where s.organization_id = p_org and (s.code = p_kod or lower(s.name) = lower(p_ad))
  order by (s.code = p_kod) desc limit 1;

  if v_kod is null then
    insert into public.organization_step_template_sets (organization_id, code, name, sort_order, is_default, is_active)
    values (p_org, p_kod, p_ad, p_sira, false, true);
    v_kod := p_kod;
  end if;

  update public.organization_step_template_sets
  set hizmet_turleri = p_hizmet, updated_at = now()
  where organization_id = p_org and code = v_kod and cardinality(hizmet_turleri) = 0;

  if not exists (select 1 from public.organization_step_templates t where t.organization_id = p_org and t.set_code = v_kod) then
    insert into public.organization_step_templates (organization_id, set_code, code, title, phase_title, sort_order, day_offset, is_active)
    select p_org, v_kod, v_kod || '_' || lpad(a.sira::text, 2, '0'), a.adim->>1, a.adim->>0, (a.sira * 10)::integer, null, true
    from jsonb_array_elements(p_adimlar) with ordinality as a(adim, sira);
  end if;
end $$;

revoke all on function private.arvo_sablon_kur(uuid, text, text, text[], integer, jsonb) from public, anon, authenticated;

do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'akademikmerkez';
  if v_org is null then
    return;
  end if;

  -- Tez: yalnızca eşleme (boşsa). Listesine dokunulmaz.
  update public.organization_step_template_sets
  set hizmet_turleri = array['Tez Danışmanlığı'], updated_at = now()
  where organization_id = v_org and (code = 'tez' or lower(name) like 'tez%') and cardinality(hizmet_turleri) = 0;

  perform private.arvo_sablon_kur(v_org, 'makale', 'Makale', array['Makale Danışmanlığı'], 20, '[
    ["Hazırlık", "Hedef Dergi ve Kapsamın Belirlenmesi"],
    ["Hazırlık", "Literatür Taraması"],
    ["Hazırlık", "Makale Planının Hazırlanması"],
    ["Yazım", "Giriş ve Kuramsal Çerçeve"],
    ["Yazım", "Yöntem Bölümü"],
    ["Yazım", "Bulgular ve Tartışma"],
    ["Yazım", "Sonuç, Özet ve Anahtar Kelimeler"],
    ["Kontrol", "Kaynakça ve Atıf Kontrolü"],
    ["Kontrol", "Dergi Yazım Kurallarına Göre Biçimlendirme"],
    ["Kontrol", "Benzerlik (İntihal) Raporu"],
    ["Kontrol", "İç Kontrol"],
    ["Teslim", "Müşteriye Teslim"],
    ["Teslim", "Müşteri Revizyonları"],
    ["Teslim", "Dergiye Gönderim Dosyalarının Hazırlanması"],
    ["Teslim", "Hakem Revizyonlarına Destek"]
  ]'::jsonb);

  perform private.arvo_sablon_kur(v_org, 'ceviri', 'Akademik Çeviri', array['Akademik Çeviri'], 30, '[
    ["Hazırlık", "Metnin Alınması ve Kapsam Analizi"],
    ["Hazırlık", "Terminoloji Sözlüğünün Hazırlanması"],
    ["Çeviri", "Çeviri"],
    ["Çeviri", "Alan Uzmanı Kontrolü"],
    ["Kontrol", "Redaksiyon ve Dil Düzeltmesi"],
    ["Kontrol", "Biçim, Tablo ve Kaynakça Uyumu"],
    ["Kontrol", "Son Okuma"],
    ["Teslim", "Müşteriye Teslim"],
    ["Teslim", "Müşteri Revizyonları"]
  ]'::jsonb);

  perform private.arvo_sablon_kur(v_org, 'literatur', 'Literatür', array['Literatür Danışmanlığı'], 40, '[
    ["Hazırlık", "Konu ve Anahtar Kelimelerin Belirlenmesi"],
    ["Tarama", "Veri Tabanı Taraması"],
    ["Tarama", "Kaynakların Elenmesi ve Seçimi"],
    ["Tarama", "Kaynak Özetlerinin Çıkarılması"],
    ["Yazım", "Literatür Matrisinin Hazırlanması"],
    ["Yazım", "Literatür Bölümünün Yazımı"],
    ["Kontrol", "Kaynakça Düzenlemesi"],
    ["Kontrol", "İç Kontrol"],
    ["Teslim", "Müşteriye Teslim"],
    ["Teslim", "Müşteri Revizyonları"]
  ]'::jsonb);

  perform private.arvo_sablon_kur(v_org, 'veri_analizi', 'Veri Analizi', array['Veri Analizi'], 50, '[
    ["Hazırlık", "Araştırma Soruları ve Hipotezlerin Netleştirilmesi"],
    ["Hazırlık", "Verinin Alınması"],
    ["Hazırlık", "Veri Temizleme ve Kodlama"],
    ["Analiz", "Analiz Yönteminin Belirlenmesi"],
    ["Analiz", "Varsayım Kontrolleri"],
    ["Analiz", "Analizlerin Yapılması"],
    ["Raporlama", "Tablo ve Grafiklerin Hazırlanması"],
    ["Raporlama", "Bulguların Yazımı"],
    ["Raporlama", "İç Kontrol"],
    ["Teslim", "Müşteriye Teslim"],
    ["Teslim", "Müşteri Revizyonları"]
  ]'::jsonb);

  perform private.arvo_sablon_kur(v_org, 'bicimsel', 'Biçimsel Düzenleme', array['Biçimsel Düzenleme'], 60, '[
    ["Hazırlık", "Yazım Kılavuzunun İncelenmesi"],
    ["Düzenleme", "Sayfa Düzeni ve Yazı Tipleri"],
    ["Düzenleme", "Başlık Hiyerarşisi ve İçindekiler"],
    ["Düzenleme", "Tablo, Şekil ve Denklem Numaralandırma"],
    ["Düzenleme", "Atıf ve Kaynakça Biçimi"],
    ["Düzenleme", "Ön Sayfalar (Kapak, Onay, Özet)"],
    ["Kontrol", "Son Kontrol"],
    ["Teslim", "Müşteriye Teslim"],
    ["Teslim", "Müşteri Revizyonları"]
  ]'::jsonb);

  perform private.arvo_sablon_kur(v_org, 'arastirma_tasarimi', 'Araştırma Tasarımı', array['Araştırma Tasarımı'], 70, '[
    ["Hazırlık", "Konu ve Problem Durumunun Belirlenmesi"],
    ["Hazırlık", "Literatür Ön Taraması"],
    ["Tasarım", "Araştırma Soruları ve Hipotezler"],
    ["Tasarım", "Yöntem ve Desen Seçimi"],
    ["Tasarım", "Örneklem ve Veri Toplama Araçları"],
    ["Tasarım", "Etik Kurul Başvuru Dosyası"],
    ["Yazım", "Araştırma Önerisinin Yazımı"],
    ["Yazım", "İç Kontrol"],
    ["Teslim", "Müşteriye Teslim"],
    ["Teslim", "Müşteri Revizyonları"]
  ]'::jsonb);

  perform private.arvo_sablon_kur(v_org, 'docentlik', 'Doçentlik Başvurusu', array['Doçentlik Başvuru Danışmanlığı'], 80, '[
    ["Hazırlık", "Başvuru Şartlarının ve Puanlamanın İncelenmesi"],
    ["Hazırlık", "Yayın ve Faaliyetlerin Toplanması"],
    ["Değerlendirme", "Puan Tablosunun Hesaplanması"],
    ["Değerlendirme", "Eksiklerin Belirlenmesi ve Planlama"],
    ["Dosya", "Belgelerin Hazırlanması"],
    ["Dosya", "Sisteme Yükleme Kontrolü"],
    ["Dosya", "İç Kontrol"],
    ["Teslim", "Müşteri Onayı"],
    ["Teslim", "Başvurunun Tamamlanması"]
  ]'::jsonb);
end $$;
