/*
  SERBEST METNİ GRUPLAMA ANAHTARI (24.10.2026).

  Raporlar serbest metin alanlarını grupluyor: hizmet türü, talep
  kaynağı, kayıp sebebi, cari kaydı olmayan müşterinin adı. Aynı şeyi
  farklı yazan iki kayıt iki ayrı grup olursa rapor aynı kalemi iki
  satırda gösterir ve paylar bölünür.

  TÜRKÇE KÜÇÜLTME TEK BAŞINA YETMİYOR ve iki yönde de yanılıyor:

   - `"Instagram".toLocaleLowerCase("tr")` → **"ınstagram"** (noktasız ı).
     Yani "Instagram" ile "instagram" AYRI gruplara düşüyor. Bu
     testle yakalandı: iki kayıt, iki satır.
   - Varsayılan küçültme ise İ'yi "i̇" (i + birleşen nokta) yapıyor:
     "İNGİLİZCE ÇEVİRİ" ile "ingilizce çeviri" ayrı gruplar.

   Ve hangi kuralı seçerseniz BÜYÜK HARFLE yazılmış Türkçe metin
   ötekiyle ayrışıyor: "TEZ YAZIMI" Türkçe kuralla "tez yazımı",
   I→i katlamasıyla "tez yazimi".

  ÇÖZÜM: Türkçe küçültmeden sonra ı ve i TEK HARFE indiriliyor. Bunun
  bedeli bilinçli: yalnızca ı/i ile ayrılan iki GERÇEKTEN farklı
  kelime ("sıra" / "sira") aynı gruba düşer. Karşılığı, kullanıcının
  Türkçe klavye kullanmadan yazdığı kaydın doğru kalemle
  birleşmesi — ki panelde çok daha sık olan durum bu.

  ANAHTAR GÖSTERİLMEZ. Ekranda ilk görülen yazım duruyor; kullanıcı
  kendi yazdığı adı tanısın diye (normalleştirilmiş anahtarı
  göstermek "tez yazimi" yazmak olurdu).
*/
export function gruplamaAnahtari(metin: string): string {
  return metin
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr")
    /* ı ve i aynı harfe: Türkçe küçültme "I"yı ı, "İ"yi i yapıyor ve
       ikisi ayrı anahtar üretiyordu. */
    .replace(/ı/g, "i");
}
