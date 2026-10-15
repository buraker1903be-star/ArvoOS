/*
 * SUNUCU UTC'DE, KULLANICI TÜRKİYE'DE.
 *
 * Neden var: Vercel sunucusu UTC'de çalışıyor. `new Date(damga)
 * .toLocaleString("tr-TR")` dilim verilmeden çağrıldığında sunucunun
 * yerel saatini yazıyor — yani Türkiye'den ÜÇ SAAT geri.
 *
 * 15.10.2026'da iş detayında ölçüldü: aynı aşama tamamlama olayı
 * "Son hareketler" listesinde 18:09, hemen ALTINDAKİ "Alan
 * değişiklikleri" listesinde 15:09 görünüyordu. Üstteki dilimi veren
 * formatlayıcıyı kullanıyor, alttaki vermeyeni. Aynı kalıp kurum içi
 * notlarda, teklif revizyonlarında, destek yazışmalarında, ödeme
 * bildirimlerinde ve gizlilik sözleşmesinin imza saatinde de vardı.
 *
 * Yalnızca saat değil GÜN de kayıyor: Türkiye'de gece 00:00–03:00
 * arasında olan her şey bir önceki güne düşüyor. "Müşteri teklifi en
 * son ne zaman açtı" sorusunun cevabı bu yüzden yanlış günü gösterir.
 *
 * Denetim neyi arıyor: `new Date(...).toLocale*` çağrısının dilimi.
 * Saati sabitlenmiş kurgular (`T00:00:00`, `T12:00:00`) muaf, çünkü
 * onlar bir AN değil, bir GÜN taşıyor ve dilim ekleyince de aynı gün
 * kalıyorlar.
 *
 * Neyi ARAMIYOR: hazır bir Date değişkeni üzerinden yapılan çağrıları
 * (`ay.toLocaleDateString(...)`). O değişkenin ne taşıdığını metinden
 * okuyamıyoruz; orada kural insanda.
 *
 * Bilerek dilimsizse satırın üstüne gerekçe yazılır:
 *   // dilim-tamam: gün taşıyor, saat yok
 */
import fs from "node:fs";
import path from "node:path";

const KOKLER = ["app", "lib", "components"];
const MUAFIYET = /dilim-tamam:/;
/* Saati sabitlenmiş kurgu: "2026-10-29T00:00:00" bir günün adıdır,
   bir an değil. Dilim eklense de aynı günü yazar. */
const GUN_KURGUSU = /new Date\(\s*`[^`]*T(?:00:00:00|12:00:00)[^`]*`\s*\)|new Date\(\s*"[^"]*T(?:00:00:00|12:00:00)[^"]*"\s*\)/;

const dosyalar = [];
const gez = (dizin) => {
  for (const girdi of fs.readdirSync(dizin, { withFileTypes: true })) {
    const yol = path.join(dizin, girdi.name);
    if (girdi.isDirectory()) {
      if (girdi.name === "node_modules" || girdi.name === ".next") continue;
      gez(yol);
    } else if (/\.(tsx?|mjs)$/.test(girdi.name)) dosyalar.push(yol);
  }
};
for (const kok of KOKLER) if (fs.existsSync(kok)) gez(kok);

const sorunlar = [];
let cagri = 0;

for (const dosya of dosyalar) {
  const satirlar = fs.readFileSync(dosya, "utf8").split("\n");
  /* Yorumun içindeki örnek kod bir çağrı değil. Deponun blok yorumları
     satır başında yıldız kullanmıyor (bu dosyanın kendi notu dahil), o
     yüzden satır deseniyle değil açılış/kapanışla izleniyor. */
  let yorumda = false;
  satirlar.forEach((satir, sira) => {
    const acilis = satir.lastIndexOf("/*");
    const kapanis = satir.lastIndexOf("*/");
    const satirYorumda = yorumda;
    if (acilis > kapanis) yorumda = true;
    else if (kapanis > acilis) yorumda = false;
    if (satirYorumda || /^\s*(\*|\/\/|\/\*)/.test(satir)) return;
    if (!/new Date\([^)]*\)\s*\.toLocale(String|DateString|TimeString)\s*\(/.test(satir)) return;
    cagri++;
    if (GUN_KURGUSU.test(satir)) return;
    /* Seçenekler birkaç satıra yayılmış olabiliyor; çağrının devamına da
       bakıyoruz. Beş satır, en uzun seçenek nesnesinden geniş. */
    if (/timeZone/.test(satirlar.slice(sira, sira + 5).join(" "))) return;
    let pencere = satir;
    for (let u = sira - 1; u >= 0 && /^\s*\/\//.test(satirlar[u]); u--) pencere += "\n" + satirlar[u];
    if (MUAFIYET.test(pencere)) return;
    sorunlar.push(
      `${dosya}:${sira + 1}  dilimsiz biçimlendirme — sunucu UTC'de, ekranda üç saat geri çıkar. `
      + `lib/istanbul-date.ts → istanbulDateTime() kullanın ya da üstüne "// dilim-tamam: <sebep>" yazın.`,
    );
  });
}

if (sorunlar.length) {
  console.error("✗ Saat dilimi denetimi:");
  for (const s of sorunlar) console.error("  " + s);
  console.error(`\n${sorunlar.length} yer. Gerekçe için scripts/check-saat-dilimi.mjs başındaki nota bakın.`);
  process.exit(1);
}
console.log(`✓ Saat dilimi denetimi: ${cagri} tarih biçimlendirmesi — dilimsiz an yok.`);
