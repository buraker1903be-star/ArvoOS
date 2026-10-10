/*
  ÜRETİLMİŞ SÜTUNUN ÇAĞIRDIĞI FONKSİYON, YAZAN ROLE AÇIK OLMALI.

  crm_proposals.teklif_grubu ifadesi
  private.arvo_proposal_effective_status'u çağırıyor. Postgres üretilmiş
  sütunu INSERT/UPDATE anında, YAZAN KULLANICININ yetkisiyle hesaplıyor;
  o fonksiyonun EXECUTE'u ise public'ten alınmış ve kimseye
  verilmemişti (yalnızca sahibi). Sonuç: sütun canlıya eklendiği anda
  panelden teklif oluşturmak ve düzenlemek
  "permission denied for function arvo_proposal_effective_status"
  ile düşüyor (10.10.2026, tests/db akış testleri yakaladı).

  Fonksiyon zaten yalnızca durumu türeten saf bir ifade; okunması bir
  şey açmıyor. Panelin rolü (authenticated) ve sunucunun rolü
  (service_role) yazabilsin diye EXECUTE veriliyor. anon crm_proposals'a
  doğrudan yazmıyor (politikaların hepsi authenticated), o yüzden ona
  verilmiyor.
*/

grant execute on function private.arvo_proposal_effective_status(text, text)
  to authenticated, service_role;
