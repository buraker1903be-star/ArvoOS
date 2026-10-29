/*
  KULLANIM SÖZLEŞMESİ ONAY KAYDI (migration 20261029162437).

  Sınananlar:
  1. Meşru akış: sunucu (service_role) onayı yazar; kullanıcı yalnızca
     KENDİ onayını okur, başkasınınkini göremez.
  2. Kullanıcı tabloya yazamaz: istemci IP'sini ve konumunu kendisi
     yazabilseydi kayıt delil olmazdı.
  3. Kayıt değiştirilemez ve silinemez — service_role ve tablo sahibi dâhil.
  4. Hesap silinince kayıt kalır, yalnızca user_id boşalır.
  5. anon hiçbir şey okuyamaz.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const AYSE = "00000000-0000-4000-8000-00000000e1a1";
const BURAK = "00000000-0000-4000-8000-00000000e1a2";
const OZET = "a".repeat(64);

let db;
const yaz = (kim) => db.query(
  `insert into public.sozlesme_onaylari (user_id, belge, surum, dil, metin_ozeti, kaydirma_tamamlandi, ip, ulke, sehir, enlem, boylam, eposta)
   values ($1, 'kullanim_sozlesmesi', '2026-10-29', 'tr', $2, true, '85.1.2.3', 'TR', 'İstanbul', 41.0, 28.9, 'x@y.com') returning id`,
  [kim, OZET],
);

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`insert into auth.users (id, email) values ('${AYSE}','ayse@x.com'),('${BURAK}','burak@x.com');`);
});

test("sunucu yazar, kullanıcı yalnızca kendi onayını okur", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    await yaz(AYSE);
    await yaz(BURAK);
    await rol(db, "authenticated", AYSE);
    const { rows } = await db.query(`select user_id, ip, sehir from public.sozlesme_onaylari`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, AYSE);
    assert.equal(rows[0].sehir, "İstanbul");
  });
});

test("kullanıcı tabloya yazamaz", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", AYSE);
    await reddedilir(db, `insert into public.sozlesme_onaylari (user_id, belge, surum, dil, metin_ozeti, kaydirma_tamamlandi) values ($1, 'kullanim_sozlesmesi', '2026-10-29', 'tr', $2, true)`, [AYSE, OZET], /permission denied/i);
  });
});

test("kayıt değiştirilemez ve silinemez; sahip de değiştiremez", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const { rows: [k] } = await yaz(AYSE);
    await reddedilir(db, `update public.sozlesme_onaylari set ip = '1.1.1.1' where id = $1`, [k.id], /permission denied/i);
    await reddedilir(db, `delete from public.sozlesme_onaylari where id = $1`, [k.id], /permission denied/i);
    await rol(db, "postgres");
    await reddedilir(db, `update public.sozlesme_onaylari set sehir = 'Ankara' where id = $1`, [k.id], /değiştirilemez/);
    await reddedilir(db, `delete from public.sozlesme_onaylari where id = $1`, [k.id], /silinemez/);
  });
});

test("hesap silinince kayıt kalır, user_id boşalır", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const { rows: [k] } = await yaz(BURAK);
    await rol(db, "postgres");
    await db.query(`delete from auth.users where id = $1`, [BURAK]);
    const { rows: [kalan] } = await db.query(`select user_id, eposta, ip from public.sozlesme_onaylari where id = $1`, [k.id]);
    assert.equal(kalan.user_id, null);
    assert.equal(kalan.eposta, "x@y.com");
    assert.equal(kalan.ip, "85.1.2.3");
  });
});

test("anon okuyamaz", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.sozlesme_onaylari`, [], /permission denied/i);
  });
});
