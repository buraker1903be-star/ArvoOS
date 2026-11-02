// MIGRATION İZLERİ ÜRETİMİ (02.11.2026; gerekçe lib/migration-izleri.ts).
//
// Döküm (supabase/schema/canli-sema.sql) tarihinden sonraki migration'lar
// tests/db/ortam.mjs'teki BEKLEYEN_MIGRATIONLAR listesinde duruyor; canlıda
// uygulanmamış olabilecekler tam olarak onlar. Betik her birinin yarattığı
// nesneleri lib/migration-izleri.json'a yazıyor, Sistem sağlığı ekranı da
// canlı veritabanına "bunlar var mı" diye soruyor.
//
//   node scripts/migration-izleri.mjs            → dosyayı yazar
//   node scripts/migration-izleri.mjs --denetle  → güncel değilse 1 ile çıkar (CI)
//
// Liste ortam.mjs'ten metin olarak okunuyor, modül olarak değil: içe
// aktarmak PGlite'ı yüklerdi.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationIzleri } from "../lib/migration-izleri.ts";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ortam = fs.readFileSync(path.join(kok, "tests/db/ortam.mjs"), "utf8");
const blok = ortam.match(/export const BEKLEYEN_MIGRATIONLAR = \[([\s\S]*?)\];/);
if (!blok) {
  console.error("✗ BEKLEYEN_MIGRATIONLAR tests/db/ortam.mjs içinde bulunamadı.");
  process.exit(1);
}
const adlar = [...blok[1].replace(/\/\/[^\n]*/g, "").matchAll(/"([^"]+\.sql)"/g)].map((m) => m[1]);

const izler = adlar.map((ad) => ({
  migration: ad.replace(/\.sql$/, ""),
  izler: migrationIzleri(fs.readFileSync(path.join(kok, "supabase/migrations", ad), "utf8")),
}));
const cikti = JSON.stringify(izler, null, 2) + "\n";
const hedef = path.join(kok, "lib/migration-izleri.json");

if (process.argv.includes("--denetle")) {
  const mevcut = fs.existsSync(hedef) ? fs.readFileSync(hedef, "utf8") : "";
  if (mevcut !== cikti) {
    console.error("✗ lib/migration-izleri.json güncel değil: `npm run migration:izleri` çalıştırıp dosyayı commit'leyin.");
    console.error("  (Bekleyen migration listesi ya da bir migration'ın içeriği değişti; Sistem sağlığı eksik migration'ı ancak bu dosyadan tanıyor.)");
    process.exit(1);
  }
  const izsiz = izler.filter((m) => !m.izler.length).map((m) => m.migration);
  console.log(`✓ Migration izleri: ${izler.length} bekleyen migration, ${izler.reduce((t, m) => t + m.izler.length, 0)} iz${izsiz.length ? ` (${izsiz.length} izsiz: kısıt/politika)` : ""}`);
} else {
  fs.writeFileSync(hedef, cikti);
  console.log(`✓ lib/migration-izleri.json yazıldı: ${izler.length} migration`);
}
