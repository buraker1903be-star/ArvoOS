import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMA_ANAHTARI, TEMA_BETIGI, TEMA_RENGI, TEMA_TERCIHLERI, temaCoz, tercihOku } from "../../lib/konsol-giris/tema";

test("üç tercih var ve bilinmeyen değer sisteme düşer", () => {
  assert.deepEqual([...TEMA_TERCIHLERI], ["light", "dark", "system"]);
  assert.equal(tercihOku("light"), "light");
  assert.equal(tercihOku("dark"), "dark");
  assert.equal(tercihOku("system"), "system");
  /* Kaydı olmayan ya da bozuk değer taşıyan kullanıcı "system" sayılır:
     eskiden kayıtsız kullanıcının aldığı davranışın aynısı. */
  for (const bozuk of [null, undefined, "", "koyu", 1]) assert.equal(tercihOku(bozuk), "system");
});

test("tema çözümü: sistem işletim sistemini izler, ötekiler sabit", () => {
  assert.equal(temaCoz("system", true), "dark");
  assert.equal(temaCoz("system", false), "light");
  assert.equal(temaCoz("dark", false), "dark");
  assert.equal(temaCoz("light", true), "light");
});

test("depolama anahtarı DEĞİŞMEDİ: panelin yazdığı değer geçerli kalır", () => {
  assert.equal(TEMA_ANAHTARI, "arvoos.theme");
});

test("tarayıcı çubuğu renkleri panel-tokens.css'teki --bg ile aynı", () => {
  /* Değer CSS'te değişip burada kalırsa çubuk ile sayfa ayrışır. */
  const css = readFileSync(new URL("../../app/panel/panel-tokens.css", import.meta.url), "utf8");
  const bgler = [...css.matchAll(/^\s*--bg:\s*([^;]+);/gm)].map((m) => m[1].trim());
  assert.ok(bgler.includes(TEMA_RENGI.light), `açık --bg ${TEMA_RENGI.light} bulunamadı: ${bgler.join(", ")}`);
  assert.ok(bgler.includes(TEMA_RENGI.dark), `koyu --bg ${TEMA_RENGI.dark} bulunamadı: ${bgler.join(", ")}`);
});

test("ön boyama betiği üç tercihi, sistem dinleyicisini ve sekmeler arası eşitlemeyi taşır", () => {
  /* Betik ilk boyamadan önce çalışır; eksik bir parça yanlış tema
     parlamasına ya da sistem değişiminin izlenmemesine yol açar. */
  assert.match(TEMA_BETIGI, /data-theme-tercih/);
  assert.match(TEMA_BETIGI, /prefers-color-scheme: dark/);
  assert.match(TEMA_BETIGI, /addEventListener\("change"/);
  assert.match(TEMA_BETIGI, /"storage"/);
  assert.match(TEMA_BETIGI, /theme-color/);
});
