/*
  İzin akışının iki ucunun paylaştığı sabitler.

  Yönlendirme adresi İKİ YERDE birebir aynı olmak zorunda: Google'a
  giderken ve kodu belirteçle değiştirirken. Farklı olurlarsa Google
  redirect_uri_mismatch diyor ve hangi tarafın yanlış olduğunu
  söylemiyor; tek yerde tutmak o aramayı baştan siliyor.

  Adres aynı zamanda Cloud projesindeki OAuth istemcisine elle
  eklenecek değer: ayarlar ekranı onu buradan okuyup gösteriyor ki
  kurum kopyalayabilsin.
*/
export const POSTA_GERI_DONUS = "/panel/settings/mail/geri-donus";
export const postaDurumCerezi = "arvo_posta_durum";
