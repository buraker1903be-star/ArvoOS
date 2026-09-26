// WhatsApp gelen kutusu sayımı (migration 20260926113129).
//
// lib/whatsapp-inbox.ts kurumun SON 300 MESAJINI çekip uygulamada sohbetlere
// bölüyordu: messageCount "son 300'ün kaçı bu sohbette" oluyor, unread o
// pencerede sayılıyor ve 300 mesajdan eskiye kalan sohbet listeden TAMAMEN
// kayboluyordu — gelen kutusunda bu, müşterinin yazdığını hiç görmemek.
//
// Test sınırın ÜSTÜNDE veri kuruyor: eski davranışla kaybolan sohbet burada
// görünmek zorunda.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260926113129_whatsapp_sohbet_sayimi_veritabaninda.sql");

const KURUM = "00000000-0000-4000-8000-0000000000c1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000000c2";
const ESKI = "905550000001";   // çok mesaj gerisinde kalan sohbet
const YENI = "905550000002";
const OKUNMUS = "905550000003";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await db.exec("grant all on public.whatsapp_messages, public.whatsapp_conversation_state to anon, authenticated, service_role");
});

/* Sınırın üstünde veri: ESKI sohbeti 400 mesaj geride kalıyor. */
async function tohum() {
  await rol(db, "postgres");
  const satir = (telefon, yon, dakika, govde, ad) => `(
    gen_random_uuid(), '${KURUM}', 'arvolab', 'arvo', '${yon}', '${telefon}',
    ${govde === null ? "null" : `'${govde}'`}, 'sent', now() - interval '${dakika} minutes',
    now(), ${ad === null ? "null" : `'${ad}'`}, 'text', 'none'
  )`;
  const satirlar = [
    // ESKI: en eski uçta iki mesaj (biri müşteriden)
    satir(ESKI, "inbound", 5000, "Eski müşteri mesajı", "Ayşe"),
    satir(ESKI, "outbound", 4990, "Cevabımız", null),
    // Aradaki 400 mesaj başka bir sohbette
    ...Array.from({ length: 400 }, (_, i) => satir(YENI, i % 2 ? "inbound" : "outbound", 1000 - i, `m${i}`, i % 2 ? "Veli" : null)),
    // OKUNMUS: ikisi okundu damgasından önce, biri sonra
    satir(OKUNMUS, "inbound", 300, "okundu sayılan", "Zeynep"),
    satir(OKUNMUS, "inbound", 200, "okundu sayılan 2", "Zeynep"),
    satir(OKUNMUS, "inbound", 10, "okunmamış", "Zeynep"),
  ];
  await db.exec(`
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'AkademikMerkez', 'akademikmerkez', 'active', 'starter'),
      ('${BASKA_KURUM}', 'Başka Kurum', 'baska-kurum', 'active', 'starter');
    insert into public.whatsapp_messages
      (id, organization_id, product, sender, direction, counterpart_phone, body, status, created_at, updated_at, profile_name, message_type, media_status)
    values ${satirlar.join(",")};
    insert into public.whatsapp_conversation_state
      (organization_id, counterpart_phone, last_read_at, created_at, updated_at)
      values ('${KURUM}', '${OKUNMUS}', now() - interval '100 minutes', now(), now());
    insert into public.whatsapp_messages
      (id, organization_id, product, sender, direction, counterpart_phone, body, status, created_at, updated_at, message_type, media_status)
      values (gen_random_uuid(), '${BASKA_KURUM}', 'arvolab', 'arvo', 'inbound', '${ESKI}', 'başka kurumun mesajı', 'sent', now(), now(), 'text', 'none');
  `);
}

const sohbetler = async (limit = 300) => {
  const { rows } = await db.query(`select * from public.whatsapp_sohbetler($1, $2)`, [KURUM, limit]);
  return new Map(rows.map((r) => [r.counterpart_phone, r]));
};

describe("whatsapp sohbet sayımı", () => {
  test("400 mesaj gerisinde kalan sohbet listeden düşmüyor", () =>
    islem(db, async () => {
      await tohum();
      const s = await sohbetler();
      assert.ok(s.has(ESKI), "eski sohbet görünmeli");
      assert.equal(Number(s.get(ESKI).message_count), 2);
      assert.equal(Number(s.get(ESKI).unread), 1, "hiç okunmamış sohbette gelen mesajların hepsi okunmamıştır");
    }));

  test("mesaj sayısı sohbetin gerçek sayısı", () =>
    islem(db, async () => {
      await tohum();
      const s = await sohbetler();
      assert.equal(Number(s.get(YENI).message_count), 400);
    }));

  test("okundu damgasından sonraki gelenler okunmamış sayılıyor", () =>
    islem(db, async () => {
      await tohum();
      const s = await sohbetler();
      assert.equal(Number(s.get(OKUNMUS).unread), 1);
      assert.equal(Number(s.get(OKUNMUS).message_count), 3);
    }));

  test("son mesajın gövdesi ve yönü doğru", () =>
    islem(db, async () => {
      await tohum();
      const s = await sohbetler();
      assert.equal(s.get(OKUNMUS).last_body, "okunmamış");
      assert.equal(s.get(OKUNMUS).last_direction, "inbound");
      // Müşteri adı en yeni GELEN mesajdan; giden mesajlarda profile_name yok.
      assert.equal(s.get(YENI).profile_name, "Veli");
    }));

  test("sohbetler en yeni mesaja göre sıralı", () =>
    islem(db, async () => {
      await tohum();
      const { rows } = await db.query(`select counterpart_phone from public.whatsapp_sohbetler($1, 300)`, [KURUM]);
      assert.deepEqual(rows.map((r) => r.counterpart_phone), [OKUNMUS, YENI, ESKI]);
    }));

  test("başka kurumun sohbeti karışmıyor", () =>
    islem(db, async () => {
      await tohum();
      const s = await sohbetler();
      assert.equal(Number(s.get(ESKI).message_count), 2, "başka kurumdaki aynı numara sayıya girmemeli");
    }));

  /* Sınır artık SOHBET sayısına uygulanıyor; mesaj sayısına değil. */
  test("sınır sohbet sayısına uygulanıyor", () =>
    islem(db, async () => {
      await tohum();
      const { rows } = await db.query(`select counterpart_phone from public.whatsapp_sohbetler($1, 2)`, [KURUM]);
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((r) => r.counterpart_phone), [OKUNMUS, YENI]);
    }));

  /*
    Fonksiyon kurum kimliğini PARAMETRE alıyor: authenticated'a açık olsaydı
    herkes başka kurumun gelen kutusunu okuyabilirdi.
  */
  test("oturumlu kullanıcıya ve anonime kapalı", () =>
    islem(db, async () => {
      await tohum();
      for (const r of ["authenticated", "anon"]) {
        await rol(db, r, "00000000-0000-4000-8000-00000000dead");
        await reddedilir(db, `select * from public.whatsapp_sohbetler($1, 10)`, [KURUM], /permission denied/i);
      }
    }));
});
