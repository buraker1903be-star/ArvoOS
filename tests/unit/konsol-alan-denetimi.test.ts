import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/*
  HER KURUCU DENETİMİNİN ARDINDA ALAN DENETİMİ (02.11.2026).

  Kademeli kurucu yetkisi (lib/konsol-alanlari) konsolun her sayfası ve
  sunucu işlemi `isPlatformOwner` denetiminin hemen ardından alanı da
  denetlediği sürece işliyor. Yeni bir sayfa yalnızca kurucuyu denetlerse
  kısıtlı kurucu o sayfayı adresini yazarak açar; menüde görünmemesi bunu
  engellemez. Bu tarama o unutkanlığı yakalıyor.
*/
const KOK = join(import.meta.dirname, "..", "..", "app", "panel", "platform");

function dosyalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return dosyalar(yol);
    return /\.(ts|tsx)$/.test(ad) ? [yol] : [];
  });
}

test("konsoldaki her kurucu denetimini alan denetimi izliyor", () => {
  const eksik: string[] = [];
  for (const dosya of dosyalar(KOK)) {
    const satirlar = readFileSync(dosya, "utf8").split("\n");
    satirlar.forEach((satir, i) => {
      if (!/if \(!(?:c\.)?isPlatformOwner\) (?:throw|notFound|return)/.test(satir)) return;
      const sonraki = satirlar.slice(i + 1, i + 4).join("\n");
      if (!/konsolAlaniniAc|konsolAlaniniDogrula|alanAcik\(/.test(sonraki)) eksik.push(`${relative(KOK, dosya)}:${i + 1}`);
    });
  }
  assert.deepEqual(eksik, [], `alan denetimi olmayan kurucu denetimi: ${eksik.join(", ")}`);
});
