/*
  20261028152947 fiyat listesini veritabanında YAYIMLIYOR ve site
  yayımlı satırı koddakinin üstüne yazıyor. İki liste ayrışırsa sitede
  migration'daki rakam görünür, kodda okunan değil — ve hiçbir yerde hata
  çıkmaz. Bu test iki listenin birebir aynı olduğunu sabitler.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ADD_ONS, PLANS } from "@/lib/site/pricing";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20261028152947_fiyatlar_kdv_dahil_yayim.sql"), "utf8");

test("KDV dahil yayım migration'ı koddaki rakamlarla birebir aynı", () => {
  const migration = new Map([...sql.matchAll(/\('([a-z-]+)', '(plan|ek)', (\d+)\)/g)].map((m) => [m[1], Number(m[3])]));
  const kod = new Map([...PLANS, ...ADD_ONS].filter((k) => k.aylikKurus !== null).map((k) => [k.code, k.aylikKurus as number]));
  assert.deepEqual([...migration.entries()].sort(), [...kod.entries()].sort());
});
