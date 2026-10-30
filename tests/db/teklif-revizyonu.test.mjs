/*
  TEKLİF REVİZYONU İŞLEVİ DIŞARIYA KAPALI (migration 20261030080627).

  create_crm_proposal_revision panelde hiçbir düğmeden çağrılmıyor;
  herkese açıkken kurumun herhangi bir üyesi API'den teklifi çoğaltıp
  eskisini arşive gönderebiliyordu. Sabitlenen: anon ve oturumlu
  kullanıcı çağıramıyor, service_role çağırabiliyor (işlev silinmedi).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KULLANICI = "00000000-0000-4000-8000-0000000e0001";
const YOK = "00000000-0000-4000-8000-0000000e0999";

let db;
before(async () => {
  db = await veritabani();
});

describe("teklif revizyonu işlevi", () => {
  test("anon ve oturumlu kullanıcı çağıramaz", () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, "select * from public.create_crm_proposal_revision($1, null)", [YOK], /permission denied/i);
      await rol(db, "authenticated", KULLANICI);
      await reddedilir(db, "select * from public.create_crm_proposal_revision($1, null)", [YOK], /permission denied/i);
    }));

  test("service_role için işlev yerinde (yetki hatası değil, kayıt hatası)", () =>
    islem(db, async () => {
      await rol(db, "service_role");
      await assert.rejects(
        db.query("select * from public.create_crm_proposal_revision($1, null)", [YOK]),
        (hata) => !/permission denied/i.test(hata.message),
      );
    }));
});
