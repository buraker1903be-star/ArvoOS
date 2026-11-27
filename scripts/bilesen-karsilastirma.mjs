/*
  ARVOLAB ↔ ARVOOS BİLEŞEN KARŞILAŞTIRMASI (27.11.2026, Tur 2 · madde 4).

  Brief aynı ölçekte yan yana karşılaştırma istiyor: düğme, sekme,
  seçici, tablo satırı, rozet ve açılır yüzey. İki aile aynı markup'la
  çiziliyor; değişen yalnızca yüklenen CSS ve sınıf öneki:

    ArvoLab  os5-*  (app/styles/os5-tokens.css + os5-bilesenler.css,
                     palet app/styles/tokens.css)
    ArvoOS   kb-*   (app/panel/panel-tokens.css + konsol-bilesen.css)

  ARVOOS SÜTUNU .panel-root İÇİNDE: panel-tokens.css değişkenleri o
  sınıfın altında tanımlı. İlk denemede sarmalayıcı yoktu ve --sp-4,
  --fs-sm, --r-md çözülmedi: düğmeler dolgusuz, sekmeler düz yazı
  çıktı ve karşılaştırma ArvoOS'u hatalı gösterdi. Kıyas ancak iki
  aile de kendi kapsamındayken adil.

  İkisi de KENDİ deposundaki kaynak dosyadan okunuyor; elle kopya yok.
  Ölçek aynı: tek sayfa, tek viewport, iki sütun.

  Kullanım: node scripts/bilesen-karsilastirma.mjs <cikti-dizini>
*/
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req("playwright");
const fs = req("fs"), path = req("path");

const OS = process.cwd();
const LAB = path.resolve(OS, "../ArvoLab");
const cikti = process.argv[2];
if (!cikti) { console.error("Kullanım: node scripts/bilesen-karsilastirma.mjs <cikti-dizini>"); process.exit(1); }
fs.mkdirSync(cikti, { recursive: true });

const oku = (p) => fs.readFileSync(p, "utf8");
const labCss = [
  path.join(LAB, "app/styles/tokens.css"),
  path.join(LAB, "app/styles/os5-tokens.css"),
  path.join(LAB, "app/styles/os5-bilesenler.css"),
].map(oku).join("\n");
const osCss = [
  path.join(OS, "app/panel/panel-tokens.css"),
  path.join(OS, "app/panel/konsol-bilesen.css"),
].map(oku).join("\n");

/* Aynı markup, değişen tek şey sınıf öneki. */
const govde = (o) => `
<div class="${o === "os5" ? "" : "panel-root konsol-bilesen"} kars-kol">
  <h3 class="kars-ad">${o === "os5" ? "ArvoLab · os5-*" : "ArvoOS · kb-*"}</h3>

  <div class="kars-grup"><span class="kars-etiket">Düğme</span>
    <div class="kars-sira">
      <button class="${o}-dugme ${o}-dugme--birincil">Yayımla</button>
      <button class="${o}-dugme ${o}-dugme--ikincil">Taslak</button>
      <button class="${o}-dugme ${o}-dugme--sessiz">Vazgeç</button>
      <button class="${o}-dugme ${o}-dugme--ikincil" disabled>Devre dışı</button>
    </div>
  </div>

  <div class="kars-grup"><span class="kars-etiket">Sekme</span>
    <div class="${o}-sekmeler" role="tablist">
      <button class="${o}-sekme" role="tab" aria-selected="true">Genel Bakış</button>
      <button class="${o}-sekme" role="tab" aria-selected="false">Müşteriler</button>
      <button class="${o}-sekme" role="tab" aria-selected="false">Tahsilat</button>
    </div>
  </div>

  <div class="kars-grup"><span class="kars-etiket">Seçici ve girdi</span>
    <div class="kars-sira">
      <span class="${o}-secim-kap">
        <select class="${o}-secim"><option>Son 30 gün</option></select>
        <span class="${o}-secim-ok" aria-hidden="true">▾</span>
      </span>
      <input class="${o}-girdi" placeholder="Müşteri adı" />
    </div>
  </div>

  <div class="kars-grup"><span class="kars-etiket">Tablo satırı</span>
    <table class="${o}-tablo kars-tablo">
      <thead><tr><th>Müşteri</th><th>Paket</th><th>Aylık</th></tr></thead>
      <tbody>
        <tr><td>Akademik Merkez</td><td>Profesyonel</td><td>₺28.900</td></tr>
        <tr><td>Yıldız Eğitim</td><td>Kurumsal</td><td>₺94.600</td></tr>
      </tbody>
    </table>
  </div>

  <div class="kars-grup"><span class="kars-etiket">Durum / boş yüzey</span>
    <div class="${o}-durum">
      <div class="${o}-durum-baslik">Bekleyen karar yok</div>
      <div class="${o}-durum-aciklama">Bütün kaynaklar okundu.</div>
    </div>
  </div>

  <div class="kars-grup"><span class="kars-etiket">Bildirim</span>
    <div class="${o}-bildirim">Taslak kaydedildi.</div>
  </div>
</div>`;

/* ArvoOS'un kb-tablo'su yok sayılırsa boş çıkmasın diye iki aileyi de
   aynı iskeletle çiziyoruz; eksik sınıf görünümden anlaşılır. */
const sayfa = (tema) => `<!doctype html><html lang="tr" data-theme="${tema}"><head><meta charset="utf-8">
<style>
${labCss}
</style>
<style>
${osCss}
</style>
<style>
  body { margin: 0; padding: 24px; font-family: Inter, system-ui, sans-serif; background: ${tema === "dark" ? "#0b1220" : "#f7f8fa"}; }
  .kars { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .kars-kol { padding: 20px; border: 1px solid rgba(128,128,128,.3); border-radius: 12px; background: ${tema === "dark" ? "#111a2b" : "#fff"}; }
  .kars-ad { margin: 0 0 16px; font-size: 14px; letter-spacing: .04em; text-transform: uppercase; color: ${tema === "dark" ? "#9fb0c9" : "#5a6b80"}; }
  .kars-grup { margin-bottom: 20px; }
  .kars-etiket { display: block; margin-bottom: 8px; font-size: 12px; color: ${tema === "dark" ? "#7f90a8" : "#78879b"}; }
  .kars-sira { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .kars-tablo { width: 100%; border-collapse: collapse; }
  .kars-tablo th, .kars-tablo td { padding: 8px 10px; text-align: left; font-size: 13px; }
</style></head><body>
<div class="kars">${govde("os5")}${govde("kb")}</div>
</body></html>`;

const tarayici = await chromium.launch();
for (const [ad, tema] of [["acik", "light"], ["koyu", "dark"]]) {
  const hedef = path.join(cikti, `bilesen-karsilastirma-${ad}.html`);
  fs.writeFileSync(hedef, sayfa(tema));
  const s = await (await tarayici.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 })).newPage();
  await s.goto("file://" + hedef);
  await s.waitForTimeout(400);
  await s.screenshot({ path: path.join(cikti, `bilesen-karsilastirma-${ad}.png`), fullPage: true });
  /*
    GÖZ KARARI YETMEZ: brief "aynı ölçekte" diyor, o yüzden ölçüler
    sayıyla alınıyor. İki aile arasındaki fark böyle raporlanabiliyor.
  */
  const olcu = await s.evaluate(() => {
    const al = (sec) => {
      const e = document.querySelector(sec);
      if (!e) return null;
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return {
        yukseklik: Math.round(r.height),
        yaricap: c.borderRadius,
        yazi: c.fontSize,
        agirlik: c.fontWeight,
        dolgu: c.paddingLeft + " / " + c.paddingRight,
      };
    };
    return {
      birincilDugme: { os5: al(".os5-dugme--birincil"), kb: al(".kb-dugme--birincil") },
      ikincilDugme: { os5: al(".os5-dugme--ikincil"), kb: al(".kb-dugme--ikincil") },
      sekme: { os5: al('.os5-sekme[aria-selected="true"]'), kb: al('.kb-sekme[aria-selected="true"]') },
      girdi: { os5: al(".os5-girdi"), kb: al(".kb-girdi") },
      secim: { os5: al(".os5-secim"), kb: al(".kb-secim") },
    };
  });
  fs.writeFileSync(path.join(cikti, `olculer-${ad}.json`), JSON.stringify(olcu, null, 1));
  if (ad === "acik") {
    for (const [parca, d] of Object.entries(olcu)) {
      console.log(parca.padEnd(16), "os5:", JSON.stringify(d.os5), " kb:", JSON.stringify(d.kb));
    }
  }
  console.log(ad, "yazıldı");
}
await tarayici.close();
