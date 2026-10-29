#!/usr/bin/env node
/*
  SATIR TAVANI DENETİMİ (konsol).

  PostgREST yanıtı 1.000 satırda kesiyor ve bunu SÖYLEMİYOR: `.limit(2000)`
  yazmak tavanı yükseltmiyor, hata da dönmüyor (lib/rapor-okuma başlığı).
  Konsol ekranları Arvo'nun BÜTÜN kiracılarını, lisanslarını ve abonelerini
  okuyor; tavana çarpıldığı gün aylık gelir, lisans sayıları, yenileme
  takvimi ve proforma alıcı listesi sessizce eksilir — hem de kurucunun
  ekosistemi yönettiği ekranlarda.

  29.10.2026'da elle tarandığında on bir okuma sayfasızdı; en hızlısı
  `organization_product_licenses` (kiracı × ürün), yaklaşık 250 müşteride
  tavana çarpıyordu.

  Denetim yalnızca KONSOLA bakıyor (app/panel/platform + konsol ana
  sayfası): kiracı panelindeki okumalar tek kurumla sınırlı ve orada
  tavan başka bir büyüklükte.

  Bilerek sınırsız bir okuma varsa satıra ya da üstündeki yoruma
  `sınırsız-tamam: <sebep>` yazılır — sebebi yazmak, denetimi
  susturmanın bedeli. Katalog tabloları (paketler, banka hesapları,
  zamanlanmış işler) böyle işaretli.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const kok = resolve(import.meta.dirname, "..");
const ALANLAR = [join(kok, "app/panel/platform"), join(kok, "app/panel/konsol-ana-sayfa.tsx")];

function dosyalar(yol, biriken = []) {
  if (statSync(yol).isFile()) { biriken.push(yol); return biriken; }
  for (const ad of readdirSync(yol)) {
    if (ad === "node_modules" || ad.startsWith(".")) continue;
    const alt = join(yol, ad);
    if (statSync(alt).isDirectory()) dosyalar(alt, biriken);
    else if (alt.endsWith(".ts") || alt.endsWith(".tsx")) biriken.push(alt);
  }
  return biriken;
}

/* Tek kayda bağlayan süzgeçler: bunlar zaten tavanın altında kalır. */
const TEKIL = /\.eq\("(organization_id|id|user_id|request_id|payment_id|slug)"/;
/* Sayfalanmış ya da sınırlanmış okuma. */
const SINIRLI = /head:\s*true|\.maybeSingle\(|\.single\(|\.range\(|\.limit\(|\.in\(/;

const sorunlar = [];
for (const yol of ALANLAR.flatMap((a) => dosyalar(a))) {
  const metin = readFileSync(yol, "utf8");
  const satirlar = metin.split("\n");
  /* Zincirin ortasındaki yorum bloğu okunmuyor ama zinciri BİTİRMİYOR:
     `.select(...)` ile `.limit(10)` arasına yazılmış bir açıklama
     yüzünden sınırlı bir okuma "sınırsız" sayılıyordu. */
  for (const eslesme of metin.matchAll(/\.from\("([a-z_0-9]+)"\)([\s\S]{0,420}?)(?=\n\s*(?:\]|\);|\},|const |await |return )|;)/g)) {
    const [, tablo, zincir] = eslesme;
    if (!/\.select\(/.test(zincir)) continue;
    if (SINIRLI.test(zincir) || TEKIL.test(zincir)) continue;
    const satirNo = metin.slice(0, eslesme.index).split("\n").length;
    /* Gerekçe satırın kendisinde ya da üstündeki üç satırda aranır:
       çoğu okumanın açıklaması bir yorum bloğunda duruyor. */
    const yakin = satirlar.slice(Math.max(0, satirNo - 4), satirNo + 1).join("\n");
    if (/sınırsız-tamam:/.test(yakin)) continue;
    sorunlar.push(`${relative(kok, yol)}:${satirNo}  ${tablo}`);
  }
}

if (sorunlar.length) {
  console.error(`\n✗ Satır tavanı denetimi: ${sorunlar.length} sayfalanmamış konsol okuması\n`);
  for (const s of sorunlar) console.error("   " + s);
  console.error("\n`sayfaliSonuc` (lib/rapor-okuma) ile sayfalayın; bilerek sınırsızsa");
  console.error("satırın üstüne `sınırsız-tamam: <sebep>` yazın.\n");
  process.exit(1);
}
console.log("✓ Satır tavanı denetimi: konsolun bütün okumaları sayfalı ya da gerekçeli");
