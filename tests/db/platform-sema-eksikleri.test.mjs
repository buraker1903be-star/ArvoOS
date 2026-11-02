/*
  UYGULANMAMIŞ MIGRATION DENETİMİ (migration 20261102192458).

  Sabitlenen:
   - MEŞRU: düzenek bütün bekleyen migration'ları uyguluyor, yani gerçek
     iz dosyasıyla (lib/migration-izleri.json) denetim HİÇBİR eksik
     döndürmemeli — döndürürse ya ayıklayıcı yanlış iz çıkarıyor ya da
     işlev yanlış arıyor; ikisi de Sistem sağlığında yanlış alarm demek;
   - var olmayan tablo, sütun, işlev ve tetikleyici eksik olarak döner;
   - işlev yalnızca servis rolüne açık.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const IZLER = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../lib/migration-izleri.json"), "utf8"));

let db;
before(async () => {
  db = await veritabani();
});

const denetle = async (izler) =>
  (await db.query(`select * from public.platform_sema_eksikleri($1::jsonb)`, [JSON.stringify(izler)])).rows;

describe("platform_sema_eksikleri", () => {
  test("bütün bekleyen migration'lar uygulanmışken eksik yok", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      assert.ok(IZLER.length > 0);
      assert.deepEqual(await denetle(IZLER), []);
    }));

  test("olmayan nesneler eksik olarak döner", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      const eksik = await denetle([{ migration: "20991231000000_yok", izler: [
        { tur: "tablo", ad: "public.olmayan_tablo" },
        { tur: "sutun", tablo: "public.platform_proformalari", sutun: "olmayan_sutun" },
        { tur: "sutun", tablo: "public.olmayan_tablo", sutun: "x" },
        { tur: "islev", ad: "private.olmayan_islev" },
        { tur: "tetikleyici", ad: "olmayan_tetikleyici", tablo: "public.platform_proformalari" },
        { tur: "tablo", ad: "public.platform_proformalari" },
      ] }]);
      assert.deepEqual(eksik.map((e) => e.eksik_tur), ["tablo", "sutun", "sutun", "islev", "tetikleyici"]);
      assert.equal(eksik[1].eksik_ad, "public.platform_proformalari.olmayan_sutun");
      assert.ok(eksik.every((e) => e.eksik_migration === "20991231000000_yok"));
    }));

  test("yalnızca servis rolü çağırabilir", () =>
    islem(db, async () => {
      await rol(db, "authenticated", "00000000-0000-4000-8000-0000000d0001");
      await reddedilir(db, `select * from public.platform_sema_eksikleri('[]'::jsonb)`, [], /permission denied/i);
      await rol(db, "anon");
      await reddedilir(db, `select * from public.platform_sema_eksikleri('[]'::jsonb)`, [], /permission denied/i);
    }));
});
