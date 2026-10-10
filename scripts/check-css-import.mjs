/*
  CSS İMPORT DENETİMİ.

  Next, bir rotanın CSS'ini o rotanın MODÜL AĞACINDAN topluyor: sayfa
  (ya da içinden geçtiği bir bileşen/layout) dosyayı import etmiyorsa o
  rotada stil YOK. Sınıf adı yanlış yazılmış gibi değil, hiç yazılmamış
  gibi davranıyor ve hata da vermiyor.

  10.10.2026'da iki sayfada vardı: posta konuşma ekranı ve operasyon
  şablon ekranı `talep-bas`, `talep-izgara` gibi düzen sınıflarını
  kullanıyor ama kayit-detay.css'i hiç import etmiyordu. Listeden
  tıklayarak girince doğru görünüyordu (önceki sayfanın CSS'i hâlâ
  yüklü), sayfayı YENİLEYİNCE düzen dağılıyordu — kullanıcı "sayfa
  bozuk" diye bildirene kadar kimse görmedi.

  Denetim: her rota için modül ağacındaki CSS'leri toplar, JSX'te geçen
  sınıf adlarından app içindeki bir CSS'te TANIMLI olanları ayıklar ve
  tanımın bulunduğu dosyalardan hiçbiri rotaya yüklenmiyorsa bildirir.
  Hiçbir CSS'te tanımlı olmayan ad (Tailwind benzeri yardımcı, dinamik
  ad) denetlenmiyor: burada ölçülen "bu sınıfın stili bu rotaya
  giriyor mu", "bu sınıf var mı" değil.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const kok = resolve(import.meta.dirname, "..");
const KAYNAK_UZANTI = [".tsx", ".ts", ".jsx", ".js"];

function dosyalar(dizin, suzgec, biriken = []) {
  for (const ad of readdirSync(dizin)) {
    if (ad === "node_modules" || ad === ".next" || ad.startsWith(".")) continue;
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) dosyalar(yol, suzgec, biriken);
    else if (suzgec(yol)) biriken.push(yol);
  }
  return biriken;
}

/* Sınıf → onu tanımlayan CSS dosyaları. Seçicideki ".ad" parçaları;
   ad içinde tire ve alt çizgi var, kaçışlı karakter yok. */
const sinifHaritasi = new Map();
for (const yol of dosyalar(join(kok, "app"), (y) => y.endsWith(".css"))) {
  const metin = readFileSync(yol, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const [, ad] of metin.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    if (!sinifHaritasi.has(ad)) sinifHaritasi.set(ad, new Set());
    sinifHaritasi.get(ad).add(yol);
  }
}

function cozumle(kaynakDosya, istek) {
  if (istek.endsWith(".css")) {
    const taban = istek.startsWith("@/") ? join(kok, istek.slice(2)) : resolve(dirname(kaynakDosya), istek);
    return [taban];
  }
  const taban = istek.startsWith("@/")
    ? join(kok, istek.slice(2))
    : istek.startsWith(".") ? resolve(dirname(kaynakDosya), istek) : null;
  if (!taban) return [];
  const adaylar = [taban, ...KAYNAK_UZANTI.map((u) => taban + u), ...KAYNAK_UZANTI.map((u) => join(taban, "index" + u))];
  return adaylar.filter((aday) => {
    try { return statSync(aday).isFile(); } catch { return false; }
  }).slice(0, 1);
}

/* Rotanın modül ağacı: sayfadan başlayıp yerel importları izliyor.
   node_modules'a girilmiyor; oradaki CSS zaten paketin kendi işi. */
function agac(girisler) {
  const gorulen = new Set();
  const cssler = new Set();
  const kaynaklar = [];
  const sira = [...girisler];
  while (sira.length) {
    const dosya = sira.shift();
    if (gorulen.has(dosya)) continue;
    gorulen.add(dosya);
    if (dosya.endsWith(".css")) { cssler.add(dosya); continue; }
    let metin;
    try { metin = readFileSync(dosya, "utf8"); } catch { continue; }
    /* Yalnızca .tsx taranıyor: JSX orada yaşıyor. Bir .ts dosyasındaki
       "className" metni (ör. lib/tenant-theme.ts kendi yazdığı <style>
       için kapsayıcı adı üretiyor) stil dosyası gerektirmiyor. */
    if (dosya.endsWith(".tsx")) kaynaklar.push([dosya, metin]);
    for (const [, istek] of metin.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*from\s*)?["']([^"']+)["']/g)) {
      for (const hedef of cozumle(dosya, istek)) sira.push(hedef);
    }
  }
  return { cssler, kaynaklar };
}

/* Üstteki layout'lar da rotanın parçası: panel düzeninin CSS'i oradan
   geliyor ve her sayfanın onu ayrıca import etmesi beklenmiyor. */
function ustLayoutlar(sayfa) {
  const bulunan = [];
  let dizin = dirname(sayfa);
  while (dizin.startsWith(join(kok, "app"))) {
    for (const uzanti of KAYNAK_UZANTI) {
      const aday = join(dizin, "layout" + uzanti);
      try { if (statSync(aday).isFile()) bulunan.push(aday); } catch { /* yok */ }
    }
    dizin = dirname(dizin);
  }
  return bulunan;
}

const sayfalar = dosyalar(join(kok, "app"), (y) => /\/(page|layout|template|error|not-found|loading)\.tsx$/.test(y));
const sorunlar = [];

for (const sayfa of sayfalar) {
  if (!sayfa.endsWith("page.tsx")) continue;
  const { cssler, kaynaklar } = agac([sayfa, ...ustLayoutlar(sayfa)]);
  const eksikler = new Map();
  for (const [dosya, metin] of kaynaklar) {
    for (const [, deger] of metin.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const ad of String(deger ?? "").split(/[\s${}?:()|&'"]+/).filter(Boolean)) {
        const tanimlar = sinifHaritasi.get(ad);
        if (!tanimlar || [...tanimlar].some((css) => cssler.has(css))) continue;
        const kayit = eksikler.get(ad) ?? { siniflar: tanimlar, nerede: dosya };
        eksikler.set(ad, kayit);
      }
    }
  }
  if (eksikler.size) sorunlar.push({ sayfa, eksikler });
}

if (sorunlar.length) {
  for (const { sayfa, eksikler } of sorunlar) {
    console.error(`\n✗ ${relative(kok, sayfa)} — rotaya yüklenmeyen stiller:`);
    for (const [ad, { siniflar, nerede }] of eksikler) {
      const dosyalarMetni = [...siniflar].map((css) => relative(kok, css)).join(", ");
      console.error(`   .${ad}  (tanım: ${dosyalarMetni}; kullanım: ${relative(kok, nerede)})`);
    }
  }
  console.error("\nSayfanın (ya da bir bileşeninin) o CSS dosyasını import etmesi gerekiyor.\n");
  process.exit(1);
}

console.log(`✓ CSS import denetimi: ${sayfalar.filter((s) => s.endsWith("page.tsx")).length} sayfa, kullanılan her sınıfın stili rotaya giriyor`);
