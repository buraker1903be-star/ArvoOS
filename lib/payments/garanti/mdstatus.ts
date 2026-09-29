/*
  3D SECURE DOĞRULAMA SONUCU (mdstatus).

  Kodlar GOSAS.VirtualPos'un GVPOSMdStatuses tanımından; açıklamalar
  oradaki Türkçe notların aynısı.

  NEDEN AYRI BİR MODÜL. procreturncode "00" ise para hareket etmiştir ve
  sipariş ödenmiştir — bu ayrı bir soru. mdstatus ise ödemenin HANGİ
  3D düzeyiyle yapıldığını söylüyor ve bu bir SORUMLULUK sorusu:

    - Tam doğrulamada (1) kart sahibi bankasında kimliğini kanıtlamıştır;
      "ben yapmadım" itirazının (chargeback) sorumluluğu kart bankasına
      geçer.
    - Yarım doğrulamada (2, 3, 4) geçmez. Banka yine de provizyon
      verebilir ama itiraz gelirse zarar ÜYE İŞYERİNDE kalır.

  Bu yüzden burada bir karar VERİLMİYOR: sınıflandırma açık ediliyor ve
  kararı çağıran veriyor. Sessizce "hepsi olur" demek, aylar sonra
  gelen itirazlarda faturanın bize çıkması demekti.
*/

export type MdDurumu = "tam" | "yarim" | "basarisiz" | "bilinmiyor";

export const MD_STATUS: Record<string, { durum: MdDurumu; aciklama: string }> = {
  "0": { durum: "basarisiz", aciklama: "Doğrulama başarısız" },
  "1": { durum: "tam", aciklama: "Tam doğrulama" },
  "2": { durum: "yarim", aciklama: "Kart sahibi veya banka sisteme kayıtlı değil" },
  "3": { durum: "yarim", aciklama: "Banka sisteme kayıtlı değil (önbellekten)" },
  "4": { durum: "yarim", aciklama: "Doğrulama denemesi; kart sahibi sonra kayıt olmayı seçmiş" },
  "5": { durum: "basarisiz", aciklama: "Doğrulama başarısız (diğer banka)" },
  "6": { durum: "basarisiz", aciklama: "3D Secure hatası; işyeri 3D Secure'a kayıtlı olmayabilir" },
  "7": { durum: "basarisiz", aciklama: "Sistem hatası" },
  "8": { durum: "basarisiz", aciklama: "Bilinmeyen kart numarası" },
};

export function mdDurumu(mdstatus: string | undefined): { durum: MdDurumu; aciklama: string } {
  const kayit = MD_STATUS[(mdstatus ?? "").trim()];
  /* Tanınmayan kod "başarısız" değil "bilinmiyor": banka yeni bir kod
     eklerse onu sessizce reddetmek de sessizce kabul etmek kadar yanlış. */
  return kayit ?? { durum: "bilinmiyor", aciklama: `Tanınmayan 3D durumu: ${mdstatus ?? "yok"}` };
}

/** İtiraz sorumluluğu kart bankasına geçti mi (yalnızca tam doğrulama). */
export const sorumlulukBankada = (mdstatus: string | undefined) => mdDurumu(mdstatus).durum === "tam";
