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

// layout.tsx'teki import sırası = gerçek cascade sırası
const importOrder = [...fs.readFileSync(LAYOUT, "utf8").matchAll(/import\s+"\.\/([\w.-]+\.css)"/g)].map(
  (m) => path.join(PANEL_DIR, m[1]),
);

const problems = [];

// 0) çözülmemiş birleştirme çakışması.
// Bu bir kez canlıya kadar gitti: postcss "<<<<<<< HEAD" satırlarını
// hata vermeden yutuyor, bu yüzden CSS "geçerli" görünüyordu ve hata
// ancak Turbopack derlemesinde ortaya çıktı. Kaynak dosyaların hepsini
// tarıyoruz; çakışma yalnızca CSS'te olmak zorunda değil.
const SOURCE_DIRS = ["app", "lib", "scripts", "supabase"];
const CONFLICT = /^(<{7} |={7}$|>{7} )/;
function scanConflicts(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scanConflicts(full); continue; }
    if (!/\.(css|ts|tsx|js|mjs|json|sql|md)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, "utf8");
    text.split("\n").forEach((line, idx) => {
      if (CONFLICT.test(line)) {
        problems.push(`${full}:${idx + 1} — çözülmemiş birleştirme çakışması ('${line.slice(0, 24)}')`);
      }
    });
  }
}
for (const dir of SOURCE_DIRS) scanConflicts(dir);
const vars = new Map(); // ad -> { value, file }
const paletteOffenders = new Map();

for (const file of importOrder) {
  if (!fs.existsSync(file)) {
    problems.push(`${file}: layout.tsx import ediyor ama dosya yok`);
    continue;
  }
  const root = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  root.walkRules((rule) => {
    if (!/\.panel-root\b/.test(rule.selector)) return;
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
      vars.set(decl.prop, { value: decl.value, file }); // sonraki kazanır
    });
  });
}

// 2 + 3) her değişkeni çöz
const refsOf = (v) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
const KNOWN_EXTERNAL = new Set(["--font-manrope", "--tenant-accent", "--tenant-accent-strong", "--tenant-accent-soft"]);

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

for (const [file, props] of paletteOffenders) {
  problems.push(
    `${file}: palet değişkeni tanımlıyor (${[...new Set(props)].join(", ")}). ` +
      `Palet yalnızca ${TOKEN_FILE} içinde olmalı.`,
  );
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`\n✖ ${unique.length} sorun bulundu:\n`);
  for (const p of unique) console.error("  • " + p);
  process.exit(1);
}
console.log(`✓ ${importOrder.length} dosya, ${vars.size} değişken — döngü yok, tanımsız yok, palet tek kaynakta, ${MIN_FONT_PX}px altı yazı yok.`);
