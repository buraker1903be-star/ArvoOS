/**
 * Müşteri adlarını tek biçime getirir.
 *
 * Kayıtlar veritabanına farklı biçimlerde girilmiş: "KÜBRA PERÇEMKAYA"
 * ile "Kerim Demirsöz" aynı tabloda yan yana duruyor ve büyük harfli
 * olanlar gözle daha iri görünüyor. Yazı boyutu aynı, sorun veride.
 *
 * Türkçe'de i/İ ve ı/I eşleşmesi İngilizce'den farklı olduğu için
 * toLocaleUpperCase("tr-TR") kullanmak şart: "istanbul" -> "İstanbul".
 *
 * Veriyi değiştirmiyoruz, yalnızca gösterimde biçimlendiriyoruz;
 * sözleşme ve fatura gibi resmi belgelerde kayıtlı hali kullanılmalı.
 */

const upper = (value: string) => value.toLocaleUpperCase("tr-TR");
const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

// Ad içinde büyük kalması gereken kısaltmalar ve unvanlar
const KEEP_UPPER = new Set(["OP", "DR", "PROF", "DOÇ", "YRD", "MD", "PHD", "AVUKAT", "AV"]);

function formatWord(word: string): string {
  if (!word) return word;

  // "OP." / "DR." gibi unvanlar büyük kalsın
  const bare = word.replace(/[.]/g, "");
  if (KEEP_UPPER.has(upper(bare))) return upper(word);

  // Tireli ve kesme işaretli adlar: "ali-veli", "o'brien"
  return word
    .split(/([-'’])/)
    .map((part) =>
      /^[-'’]$/.test(part) || !part
        ? part
        : upper(part.charAt(0)) + lower(part.slice(1)),
    )
    .join("");
}

export function formatPersonName(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.split(" ").map(formatWord).join(" ");
}
