/*
  PAKET LİMİTLERİ: PANEL = VERİTABANI.

  Yeni kiracının lisansına limitleri private.default_license_limits
  yazıyor; panelin lisans formu ve konsolun Ücret ve Paketler ekranı
  lib/paket-limitleri'ni kullanıyor. 13.10.2026'da SQL 3/15 kullanıcıya
  inmiş, form 5/25'te kalmıştı ve "varsayılanı uygula" kiracıya ödemediği
  koltuk veriyordu. Bu test iki kaynağı her paket için karşılaştırıyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { rol, veritabani } from "./ortam.mjs";
// Node tür ayıklamasıyla TypeScript modülü doğrudan içe aktarılıyor (yalnızca tür ek açıklamaları var).
import { PAKET_VARSAYILANI } from "../../lib/paket-limitleri.ts";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
});

test("her paketin limiti panelde ve veritabanında aynı", async () => {
  for (const [paket, limit] of Object.entries(PAKET_VARSAYILANI)) {
    const { rows: [{ l }] } = await db.query(`select private.default_license_limits($1::public.plan_code) as l`, [paket]);
    assert.deepEqual(
      { userLimit: Number(l.user_limit), storageLimitMb: Number(l.storage_limit_mb), aiCreditLimit: Number(l.ai_credit_limit) },
      limit,
      `${paket}: panel ve veritabanı farklı`,
    );
  }
});
