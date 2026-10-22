/*
  "EKİBE ÇEVRİMDIŞI GÖRÜN" KALDIRILDI (22.10.2026, kurum sahibinin kararı).

  Hesap menüsündeki anahtar ve işlemi (cevrimiciGorunurlugu) koddan
  çıktı; ekip kimin çevrimiçi olduğunu her zaman görüyor. Anahtarı daha
  önce açmış olanlar burada sıfırlanıyor — yoksa menüde geri dönüş yolu
  olmadan sonsuza dek çevrimdışı görünürlerdi.

  Sütun (user_presence.gizli) bilerek DURUYOR: üst çubuk, mesajlaşma ve
  arvo_panel_kabugu onu okuyor; hepsi false'a bakıyor ve hiçbir yol artık
  true yazmıyor. Sütunu düşürmek bu okumaları aynı anda değiştirmeyi
  gerektirirdi, kazancı yok.
*/
update public.user_presence set gizli = false where gizli;
