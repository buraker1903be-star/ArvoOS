/**
 * Panel CSS token doğrulayıcı.
 *
 * Neden var: panel-premium.css sessizce ikinci bir palet tanımlıyordu ve
 * bir otomatik düzenleme onu `--brand-700:var(--brand-700)` haline getirdi.
 * CSS bunu "geçersiz" sayıp değişkeni tüm panel için siler; gradient
 * kullanan her şey (kenar çubuğu, birincil buton, aktif sekme) kaybolur.
 * Sözdizimi geçerli olduğu için hiçbir linter yakalamadı.
 *
 * Bu script cascade'i import sırasına göre simüle eder ve şunları arar:
 *   1. kendine referans veren değişkenler
 *   2. döngüsel referanslar (a -> b -> a)
 *   3. hiç tanımlanmamış değişkenler
 *   4. panel-tokens.css dışında palet tanımlayan dosyalar
 *   5. panel-tokens.css dışında semantik token (yüzey, mürekkep, çizgi,
 *      gölge, köşe, boşluk, yazı ölçeği, birincil renk) yeniden tanımlayan
 *      katmanlar. 2026-10'a kadar panel-premium.css --surface, --ink ve
 *      --r-sm'i sessizce eziyordu; token dosyası tek kaynak değildi.
 *
 * Kullanım:  node scripts/check-css-tokens.mjs
 */
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const PANEL_DIR = "app/panel";
const LAYOUT = path.join(PANEL_DIR, "layout.tsx");
const TOKEN_FILE = "panel-tokens.css";
const PALETTE_PREFIXES = ["--brand-", "--accent-", "--n-"];
const SEMANTIC_RE = /^--(bg|surface(-2|-raised)?|ink(-soft)?|muted|dim|line(-soft)?|focus|shadow-[a-z]+|r-[a-z]+|sp-\d+|fs-[a-z0-9]+|lh-[a-z]+|fw-[a-z]+|primary(-[a-z]+)?|accent(-strong|-soft|-on|-bright)?)$/;

// layout.tsx'teki import sırası = gerçek cascade sırası
const importOrder = [...fs.readFileSync(LAYOUT, "utf8").matchAll(/import\s+"\.\/([\w.-]+\.css)"/g)].map(
  (m) => path.join(PANEL_DIR, m[1]),
);

const problems = [];
const vars = new Map(); // ad -> { value, file }
const paletteOffenders = new Map();
const semanticOffenders = new Map();

for (const file of importOrder) {
  if (!fs.existsSync(file)) {
    problems.push(`${file}: layout.tsx import ediyor ama dosya yok`);
    continue;
  }
  const root = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  root.walkRules((rule) => {
    /* Panel değişkenleri iki kökte tanımlanıyor: .panel-root (tema ve
       palet) ve .os-root (kabuk ölçüleri — üst çubuk yüksekliği, dock
       alanı). İkincisi denetimin dışındaydı: os-shell.css'teki bir
       değişkeni kullanan dosya "tanımsız değişken" uyarısı alıyordu
       (10.10.2026, ayarlar düzeni). */
    if (!/\.(panel-root|os-root)\b/.test(rule.selector)) return;
    rule.walkDecls(/^--/, (decl) => {
      // 1) kendine referans
      if (new RegExp(`var\\(\\s*${decl.prop}(?![\\w-])`).test(decl.value)) {
        problems.push(
          `${file}:${decl.source?.start?.line} — '${decl.prop}' kendine referans veriyor ` +
            `('${decl.value}'). CSS bunu geçersiz sayar ve değişkeni TÜM panelden siler.`,
        );
      }
      // 4) tokens dosyası dışında palet tanımı
      if (
        path.basename(file) !== TOKEN_FILE &&
        PALETTE_PREFIXES.some((p) => decl.prop.startsWith(p))
      ) {
        if (!paletteOffenders.has(file)) paletteOffenders.set(file, []);
        paletteOffenders.get(file).push(decl.prop);
      }
      // 5) tokens dosyası dışında semantik token
      if (path.basename(file) !== TOKEN_FILE && SEMANTIC_RE.test(decl.prop)) {
        if (!semanticOffenders.has(file)) semanticOffenders.set(file, []);
        semanticOffenders.get(file).push(`${decl.prop}:${decl.source?.start?.line}`);
      }
      vars.set(decl.prop, { value: decl.value, file }); // sonraki kazanır
    });
  });
}

// 2 + 3) her değişkeni çöz
const refsOf = (v) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
const KNOWN_EXTERNAL = new Set(["--font-manrope", "--tenant-accent", "--tenant-accent-strong", "--tenant-accent-soft", "--tenant-accent-on"]);

function resolve(name, seen = []) {
  if (seen.includes(name)) {
    problems.push(`Döngüsel referans: ${[...seen, name].join(" -> ")}`);
    return;
  }
  const entry = vars.get(name);
  if (!entry) return;
  for (const ref of refsOf(entry.value)) {
    // var(--x, fallback) içindeki fallback varsa tanımsızlık sorun değil
    const hasFallback = new RegExp(`var\\(\\s*${ref}(?![\\w-])\\s*,`).test(entry.value);
    if (!vars.has(ref) && !KNOWN_EXTERNAL.has(ref) && !hasFallback) {
      problems.push(`${entry.file}: '${name}' tanımsız '${ref}' değişkenine bakıyor`);
    }
    resolve(ref, [...seen, name]);
  }
}
for (const name of vars.keys()) resolve(name);

// panel genelinde kullanılan ama hiç tanımlanmayan değişkenler
const allCss = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".css")) allCss.push(p);
  }
})(PANEL_DIR);

for (const file of allCss) {
  const css = fs.readFileSync(file, "utf8");
  for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
    const [, name, next] = m;
    if (next === ",") continue; // fallback var
    if (!vars.has(name) && !KNOWN_EXTERNAL.has(name) && !css.includes(`${name}:`)) {
      problems.push(`${file}: tanımsız değişken kullanılıyor -> ${name}`);
    }
  }
}

// 5) okunamayacak kadar küçük yazı.
// Bu iki kez kaçtı: ilk seferinde regex boşluksuz yazımı arıyordu
// ("font-size: 8px" atlandı), ikincisinde de sadece bir dosyaya bakılmıştı.
// Artık boşluklu/boşluksuz her iki yazım da taranıyor.
const MIN_FONT_PX = 11;
for (const file of allCss) {
  const css = fs.readFileSync(file, "utf8");
  for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    if (Number(m[1]) < MIN_FONT_PX) {
      const line = css.slice(0, m.index).split("\n").length;
      problems.push(`${file}:${line} — ${m[1]}px yazı boyutu okunamaz (alt sınır ${MIN_FONT_PX}px)`);
    }
  }
  for (const m of css.matchAll(/font:[^;{}]*?\s(\d+(?:\.\d+)?)px/g)) {
    if (Number(m[1]) < MIN_FONT_PX) {
      const line = css.slice(0, m.index).split("\n").length;
      problems.push(`${file}:${line} — font kısayolunda ${m[1]}px okunamaz`);
    }
  }
}

/*
  6) SEÇİCİ SÖZDİZİMİ: parantez ve köşeli parantez dengeli mi?

  14.10.2026: ölü CSS temizleyen bir betik `:is(...)` listesini virgülden
  bölerken parantezi hesaba katmadı ve geriye
  ".panel-drawer-header,.panel-sheet,.panel-toast){…}" kaldı — önek ve
  açılış parantezi düşmüş. ÜRETİM DERLEMESİ dört saat düştü ve o süre
  boyunca hiçbir değişiklik canlıya çıkmadı.

  Hiçbir denetim yakalamadı: bu dosya PostCSS kullanıyor ama PostCSS
  hoşgörülü, seçiciyi ".a,.b)" diye okuyup geçiyor. Derlemedeki
  Lightning CSS katı ve orada patlıyor; derleme de CI'da yapılmıyor
  (AGENTS.md). Denge sayımı bu boşluğu kapatıyor.
*/
for (const file of allCss) {
  const kok = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  const dengeli = (metin) => {
    let p = 0, k = 0;
    for (const ch of metin) {
      if (ch === "(") p++; else if (ch === ")") p--;
      else if (ch === "[") k++; else if (ch === "]") k--;
      if (p < 0 || k < 0) return false;
    }
    return p === 0 && k === 0;
  };
  kok.walkRules((kural) => {
    if (!dengeli(kural.selector)) {
      problems.push(`${file}:${kural.source?.start?.line ?? "?"} — seçicide parantez dengesiz: ${kural.selector.slice(0, 80)}`);
    }
  });
  kok.walkAtRules((kural) => {
    if (kural.params && !dengeli(kural.params)) {
      problems.push(`${file}:${kural.source?.start?.line ?? "?"} — @${kural.name} koşulunda parantez dengesiz: ${kural.params.slice(0, 80)}`);
    }
  });
}

for (const [file, props] of paletteOffenders) {
  problems.push(
    `${file}: palet değişkeni tanımlıyor (${[...new Set(props)].join(", ")}). ` +
      `Palet yalnızca ${TOKEN_FILE} içinde olmalı.`,
  );
}

for (const [file, props] of semanticOffenders) {
  problems.push(
    `${file}: tasarım token'ı yeniden tanımlıyor (${props.join(", ")}). ` +
      `Değerler yalnızca ${TOKEN_FILE} içinde; burada sessizce onları ezer.`,
  );
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`\n✖ ${unique.length} sorun bulundu:\n`);
  for (const p of unique) console.error("  • " + p);
  process.exit(1);
}
console.log(`✓ ${importOrder.length} dosya, ${vars.size} değişken — döngü yok, tanımsız yok, palet tek kaynakta, ${MIN_FONT_PX}px altı yazı yok, seçiciler dengeli.`);
