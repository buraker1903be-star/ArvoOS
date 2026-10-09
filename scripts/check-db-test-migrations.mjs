#!/usr/bin/env node
/*
  tests/db DÜZENEĞİNDE ESKİ FONKSİYON GÖVDESİ DENETİMİ.

  Akış testleri canlı şema dökümünü kurup üstüne migration dosyalarını
  yeniden uyguluyor (döküm tablo yetkilerini taşımadığı için çoğu zaman
  gerekiyor). Listede `create or replace function` içeren ESKİ bir
  migration varsa, o işlevin dökümdeki yeni gövdesini eski hâline
  döndürüyor: test artık üretimde olmayan bir davranışı sınıyor ve
  YEŞİL kalıyor.

  09.10.2026'da iki kez oldu. Birincisi sessiz bir yanlış ölçümdü
  (arvo_musteri_bilgisi_yansit, iki yönlü senkrondan önceki gövde).
  İkincisi bir ÜRETİM hatasını gizledi: çöp kutusu migration'ı konuşma
  korumasını eski gövdeden türetip "okunmamis" satırını düşürmüştü ve
  test, dosyadan gelen eski gövdeyi ölçtüğü için iki gün bunu söylemedi.

  Kural: bir test bir işlevi tanımlayan migration'ı uyguluyorsa, o
  işlevi daha SONRA tanımlayan migration'lar da listede ve DAHA SONRA
  olmalı. Bilerek eski gövdeyle koşan bir test satırın sonuna
  `govde-tamam: <sebep>` yazar — sebebi yazmak, denetimi susturmanın
  bedeli.
*/
import fs from "node:fs";
import path from "node:path";

const kok = path.resolve(import.meta.dirname, "..");
const migrationDizini = path.join(kok, "supabase/migrations");
const testDizini = path.join(kok, "tests/db");

const FONKSIYON = /create\s+or\s+replace\s+function\s+([a-z_]+\.[a-z_0-9]+)/gi;

/** Migration dosyası -> içinde yeniden tanımlanan işlev adları. */
function islevler(dosya) {
  const metin = fs.readFileSync(path.join(migrationDizini, dosya), "utf8");
  return new Set([...metin.matchAll(FONKSIYON)].map((eslesme) => eslesme[1].toLowerCase()));
}

const migrationlar = fs.readdirSync(migrationDizini).filter((ad) => ad.endsWith(".sql")).sort();
const islevHaritasi = new Map(migrationlar.map((ad) => [ad, islevler(ad)]));

/** Bir işlevi tanımlayan en yeni migration. */
function enYeni(islev) {
  for (let i = migrationlar.length - 1; i >= 0; i -= 1) {
    if (islevHaritasi.get(migrationlar[i]).has(islev)) return migrationlar[i];
  }
  return null;
}

const bulgular = [];
for (const testAdi of fs.readdirSync(testDizini).filter((ad) => ad.endsWith(".test.mjs"))) {
  const metin = fs.readFileSync(path.join(testDizini, testAdi), "utf8");
  /* Sıra önemli: aynı işlevi iki dosya tanımlıyorsa son uygulanan kazanır.
     Satır sonundaki `govde-tamam:` işareti o satırı denetim dışı bırakır. */
  const satirlar = metin.split("\n");
  const uygulanan = [];
  for (const satir of satirlar) {
    const eslesme = satir.match(/"(\d{14}_[a-z_0-9]+\.sql)"/);
    if (!eslesme) continue;
    uygulanan.push({ ad: eslesme[1], muaf: /govde-tamam:/.test(satir) });
  }
  if (!uygulanan.length) continue;

  // Son uygulayan kim: işlev -> dosya.
  const sonKaynak = new Map();
  for (const { ad } of uygulanan) {
    for (const islev of islevHaritasi.get(ad) ?? []) sonKaynak.set(islev, ad);
  }

  for (const [islev, kaynak] of sonKaynak) {
    const guncel = enYeni(islev);
    if (!guncel || guncel === kaynak) continue;
    const muaf = uygulanan.some((girdi) => girdi.ad === kaynak && girdi.muaf);
    if (muaf) continue;
    bulgular.push({ test: testAdi, islev, kaynak, guncel });
  }
}

if (bulgular.length) {
  console.error("✖ tests/db düzeneği eski fonksiyon gövdesiyle koşuyor:\n");
  for (const bulgu of bulgular) {
    console.error(`  ${bulgu.test}`);
    console.error(`    ${bulgu.islev}: son uygulanan ${bulgu.kaynak}, güncel gövde ${bulgu.guncel}`);
    console.error(`    → ${bulgu.guncel} dosyasını listeye SONDAN ekleyin ya da satıra "govde-tamam: <sebep>" yazın.\n`);
  }
  process.exit(1);
}

console.log(`✓ Düzenek denetimi: ${migrationlar.length} migration, tests/db hiçbir işlevi eski gövdesine döndürmüyor`);
