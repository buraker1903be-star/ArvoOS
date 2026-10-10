/*
  TEKLİFİN LİSTEDEKİ GRUBU VERİTABANINDA.

  "Bu teklif hangi süzgeçte görünür" kuralı yalnızca TypeScript'te
  vardı (lib/teklif-grubu.ts) ve teklifler listesi bu yüzden kurumun
  BÜTÜN tekliflerini çekip bellekte süzüyordu: süzgeç, şerit sayıları
  ve toplam tutar hep o diziden hesaplanıyordu. Kayıt sayısı büyüdükçe
  bu hem yavaşlıyor hem de PostgREST'in satır sınırına çarptığında
  sessizce YANLIŞ sayı gösterecek bir yol (bkz. npm run check:rakamlar).

  Kural artık sütunda: süzgeç, sayım ve sayfalama sunucuda yapılabiliyor.

  KURALIN KENDİSİ YENİDEN YAZILMADI. Durumun "gerçek" hâlini türeten
  private.arvo_proposal_effective_status zaten vardı ve iki ayrı yerde
  kullanılıyor; buradaki ifade onu çağırıyor, kopyalamıyor. Üstüne
  eklenen tek şey, TypeScript tarafındaki iki kural: yeni revizyonla
  değişen teklif "eski", tanınmayan durum "arsiv".

  İkisinin aynı kaldığını tests/fixtures/teklif-gruplari.json üzerinden
  iki test birden sınıyor: biri TypeScript işlevini, öteki bu sütunu.
  Biri değişip öteki kalırsa test kırılıyor.

  NOT: sütun arvo_proposal_effective_status'a BAĞIMLI. İşlev "create or
  replace" ile değiştirilebilir (dönüş türü aynı kaldıkça); "drop
  function ... cascade" bu sütunu da götürür.
*/

alter table public.crm_proposals
  add column if not exists teklif_grubu text
  generated always as (
    case
      when superseded_by is not null then 'eski'
      else case private.arvo_proposal_effective_status(status, archive_reason)
        when 'accepted' then 'accepted'
        when 'rejected' then 'rejected'
        when 'expired' then 'expired'
        when 'draft' then 'draft'
        when 'sent' then 'sent'
        else 'arsiv'
      end
    end
  ) stored;

/* Listenin asıl sorgusu: kurum + grup, tarihe göre sıralı. Sayım
   sorguları (head: true) de bu indeksi kullanıyor. */
create index if not exists crm_proposals_kurum_grup_idx
  on public.crm_proposals (organization_id, teklif_grubu, created_at desc);
