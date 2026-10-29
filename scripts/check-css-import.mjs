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
  İKİNCİ DENETİM: HİÇ TANIMLANMAMIŞ SINIF (29.10.2026).

  Yukarıdaki denetim yalnızca "tanımlı ama rotaya girmiyor" hâlini
  görüyordu; hiçbir CSS'te KARŞILIĞI OLMAYAN ad sessizce geçiyordu.
  O boşluktan bir sayfa geçti: Hedefler ekranı başka bir depodan
  taşınmış sınıflarla yazıldı (.kayit-kart, .projects-primary-button),
  denetim sustu ve ekran kartsız, düğmesi düz yazı olarak canlıya
  çıktı. Aynı boşlukta duran gerçek bir hata da bu gün bulundu:
  `.cari-eksi` hiç tanımlı değildi, yani dört ekranda "dikkat" rengiyle
  gösterilmesi gereken sayılar olağan renkte duruyordu.

  Yanlış alarmı kesen üç kural:
   - Yalnızca kebab-case adlar (`is-active`, `talep-bas`). Şablon
     ifadesinden artakalan değişken adları (`dragging`, `index`) ve
     nokta taşıyan parçalar elenir.
   - Şablon dizgisindeki `${...}` parçaları okunmadan ATILIR; yoksa
     `${dragging ? "is-dragging" : ""}` içindeki değişken adı sınıf
     sanılıyordu.
   - Gömülü CSS de tanım sayılır: belge bileşenleri stilini kendi
     `<style>` şablonunda taşıyor (.doc-*).

  Dosya başındaki `stil-tamam: <sebep>` işareti o dosyayı denetimden
  çıkarır — sebebi yazmak, denetimi susturmanın bedeli (app/kurulum
  Tailwind ile yazılı).

  BILINEN_BORC bugün var olan tanımsız sınıfların listesi. Muafiyet
  değil, BORÇ: yenisi eklenemiyor ve listeden biri tanımlanınca ya da
  kullanımdan kalkınca denetim "listeden çıkar" diyor, yoksa liste
  ölü satırlarla şişip anlamını yitirirdi.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gomuluCss, siniflar } from "./stil-sinif-ayikla.mjs";
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

/* ---------- Tanımsız sınıf denetimi ---------- */

/*
  BUGÜNÜN BORCU, SINIFLANDIRILMIŞ (29.10.2026). Her satır bir sınıf,
  ne olduğu ve ilk görüldüğü dosya:

   - "kanca (…)": öğenin yanında TANIMLI sınıflar var, görünümü onlar
     veriyor. Zararsız ama ölü ad; temizlenecek.
   - "yalnız": öğenin hiç stili yok. Asıl şüpheliler bunlar — biri
     gerçek çıktı (`.panel-ghost`, operasyon şablon ekranında iki
     düğme çıplak tarayıcı düğmesi olarak çiziliyordu) ve düzeltildi.
     Kalanlar kapsayıcı `div`'ler: görünümü üst öğe veriyor.

  Liste kısaldıkça silinir; uzamasına denetim izin vermiyor.
*/
const BILINEN_BORC = new Set([
  "abk", // kanca (talep cari liste-sayfa) — app/panel/billing/page.tsx
  "abk-belgeler", // kanca (pu-liste) — app/panel/billing/page.tsx
  "an-dagilim", // kanca (dash-card dash-col) — app/panel/analitik/page.tsx
  "appointment-form", // kanca (panel-form kayit-formu) — app/panel/crm/takvim/appointment-form.tsx
  "bm-cikar", // kanca (panel-secondary) — app/panel/settings/belge-metinleri.tsx
  "crm-birakma-sebebi", // kanca (crm-liste-sebep) — app/panel/crm/page.tsx
  "dp", // kanca (talep cari liste-sayfa) — app/panel/hr/departmanlar/page.tsx
  "flowx", // kanca (section) — app/(site)/_components/story-stage.tsx
  "flowx-copy", // yalnız: öğenin hiç stili yok — app/(site)/_components/story-stage.tsx
  "is-disabled", // kanca (panel-secondary) — app/panel/crm/contracts/page.tsx
  "kisi-yetki-ozet", // kanca (stg-muted) — app/panel/settings/permissions/kisi-yetkileri.tsx
  "kisi-yetkileri", // kanca (stg) — app/panel/settings/permissions/kisi-yetkileri.tsx
  "login-card-logo", // yalnız: öğenin hiç stili yok — app/auth/dogrula/page.tsx
  "maliyet-pencere", // yalnız: öğenin hiç stili yok — app/panel/finance/costs/maliyet-detayi.tsx
  "ml-side", // kanca (ml-col) — app/(site)/_components/mock-lab.tsx
  "ntf-card", // kanca (panel-card talep-bilgi) — app/panel/notifications/page.tsx
  "opd-mesaj", // yalnız: öğenin hiç stili yok — app/panel/operations/[id]/page.tsx
  "opd-pf", // kanca (opd-card) — app/panel/operations/[id]/portal-files.tsx
  "panel-form-error", // kanca (wide kayit-formu-hata) — app/panel/crm/contract-addendum-form.tsx
  "panel-form-success", // kanca (wide kayit-formu-basari) — app/panel/crm/contract-addendum-form.tsx
  "panel-page", // kanca (sozlesmelerim) — app/panel/sozlesmelerim/page.tsx
  "personel-sayfalar", // kanca (hr-act-sayfalar) — app/panel/hr/personel-hareketleri.tsx
  "pillars", // kanca (section) — app/(site)/_views/home.tsx
  "posta-govde-metin", // yalnız: öğenin hiç stili yok — app/panel/posta/posta-govde.tsx
  "posta-konusma", // kanca (talep cari) — app/panel/posta/[threadId]/page.tsx
  "pp-isler", // kanca (pp-liste) — app/panel/hr/prim-penceresi.tsx
  "rpt-range-pill", // kanca (status-pill) — app/panel/finance/raporlar/page.tsx
  "schedule-dates", // kanca (wide custom-plan-editor) — app/panel/crm/schedule-date-rows.tsx
  "status-lookup", // yalnız: öğenin hiç stili yok — app/durum/[slug]/lookup-form.tsx
  "suite", // kanca (section) — app/(site)/_views/home.tsx
  "talep-menu", // kanca (os-menu) — app/panel/accounts/cari-hesap.tsx
  "trio-phone", // yalnız: öğenin hiç stili yok — app/(site)/_components/trio.tsx
  "trio-win", // kanca (mock-win) — app/(site)/_components/trio.tsx
  "trk-offer-card", // kanca (trk-card) — app/takip/takip-form.tsx
  "trk-plan-card", // kanca (trk-card) — app/takip/takip-form.tsx
  "trk-sign-card", // kanca (trk-card) — app/takip/takip-form.tsx
  "work-plan-editor", // kanca (wide custom-plan-editor) — app/panel/crm/work-plan-editor.tsx
]);

const gomuluCssTopla = (metin) => {
  for (const ad of gomuluCss(metin)) if (!sinifHaritasi.has(ad)) sinifHaritasi.set(ad, new Set());
};
for (const dizin of ["app", "lib"]) {
  for (const yol of dosyalar(join(kok, dizin), (y) => y.endsWith(".tsx") || y.endsWith(".ts"))) {
    gomuluCssTopla(readFileSync(yol, "utf8"));
  }
}

const tanimsizlar = new Map();
for (const yol of dosyalar(join(kok, "app"), (y) => y.endsWith(".tsx"))) {
  const metin = readFileSync(yol, "utf8");
  if (/stil-tamam:/.test(metin)) continue;
  for (const ad of siniflar(metin)) {
    if (sinifHaritasi.has(ad)) continue;
    if (!tanimsizlar.has(ad)) tanimsizlar.set(ad, relative(kok, yol));
  }
}

const yeniler = [...tanimsizlar].filter(([ad]) => !BILINEN_BORC.has(ad));
const kalkanlar = [...BILINEN_BORC].filter((ad) => !tanimsizlar.has(ad));

if (yeniler.length || kalkanlar.length) {
  if (yeniler.length) {
    console.error("\n✗ Hiçbir CSS'te tanımı olmayan sınıf:");
    for (const [ad, yer] of yeniler) console.error(`   .${ad}  (kullanım: ${yer})`);
    console.error("\nStilini yazın, adı düzeltin ya da sınıfı kaldırın. Tailwind gibi");
    console.error("karşılığı derlemede üretilen bir dosyaysa başına `stil-tamam: <sebep>` yazın.\n");
  }
  if (kalkanlar.length) {
    console.error("\n✗ BILINEN_BORC listesinden çıkarılacaklar (artık tanımsız değil):");
    for (const ad of kalkanlar) console.error(`   .${ad}`);
    console.error("\nscripts/check-css-import.mjs içindeki listeden silin.\n");
  }
  process.exit(1);
}

console.log(`✓ Tanımsız sınıf denetimi: ${tanimsizlar.size} bilinen borç, yenisi yok`);
