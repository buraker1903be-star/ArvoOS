/*
  LİSTE ARAMASI — PostgREST süzgecine girecek desen ve telefon anahtarı.

  İki ayrı kural, ikisi de saf:

  1) DESEN. Arama PostgREST'in `or` süzgeciyle yapılıyor ve o süzgeç
     virgülle ayrılmış bir METİN: terimdeki virgül ya da parantez
     süzgecin dilbilgisini bozup sorguyu hataya düşürüyor. Yüzde ve alt
     çizgi ise LIKE joker karakterleri. Hepsi boşluğa çevriliyor.

  2) TELEFON. Kullanıcı "0532 111" ya da "+90 532" yazıyor; veritabanı
     telefonu arvo_search_digits ile "5321112233" anahtarına indiriyor.
     Aynı indirgemeyi arama terimine de uygulamak gerekiyor, yoksa
     telefonla arama hiçbir şey bulmuyor. Üç haneden kısa rakam dizisi
     aranmıyor: "12" bütün listeyi getirir.
*/

export function aramaDeseni(ham: string): string | null {
  const sade = (ham ?? "")
    .replace(/[,()%_*\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (sade.length < 2) return null;
  return sade.slice(0, 80);
}

export const TELEFON_EN_AZ_HANE = 3;

export function telefonAnahtari(ham: string): string | null {
  const rakamlar = (ham ?? "").replace(/\D+/g, "");
  if (rakamlar.length < TELEFON_EN_AZ_HANE) return null;
  /* Baştaki ülke kodu ve sıfır düşüyor: veritabanındaki anahtar on
     haneli yerel numara ("5321112233"). */
  const yerel = rakamlar.replace(/^(?:0090|90|0)/, "");
  return yerel.length >= TELEFON_EN_AZ_HANE ? yerel.slice(-10) : null;
}
