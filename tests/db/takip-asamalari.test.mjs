/*
  MÜŞTERİ TAKİP SAYFASINDA GERÇEK AŞAMALAR.

  Takip sayfası yüzdeden türetilmiş genel beş aşama gösteriyordu.
  Aşama başlıkları kurumun açtığı bir bayrakla (tracking_show_phases)
  müşteriye açıldı.

  01.10.2026: KARAR DEĞİŞTİ. Adım (görev) başlıkları da gösteriliyor —
  kurum "Planlama aşaması" yerine müşterinin tam olarak hangi işin
  bittiğini görmesini istedi. Bu, önceki "adım başlıkları hiçbir durumda
  dışarı çıkmaz" kuralının bilinçli olarak geri alınmasıdır; eski testi
  silmedim, YENİ kuralı sabitleyecek biçimde değiştirdim ki ileride biri
  "görev adları sızıyor" diye geri almasın.

  Sabitlenenler: varsayılan KAPALI, görev adları AYNI bayrağa bağlı
  (ikinci bir anahtar yok), kapı mevcut takip fonksiyonlarıyla aynı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, olarak, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);

const SAHIP = "00000000-0000-4000-8000-0000000000c7";
const KURUM = "00000000-0000-4000-8000-0000000000c8";
const FIRSAT = "00000000-0000-4000-8000-0000000000c9";
const TEKLIF = "00000000-0000-4000-8000-0000000000ca";
const SOZLESME = "00000000-0000-4000-8000-0000000000cb";
const KOD = "ABC123";

let db;
before(async () => {
  db = await veritabani();
  /*
    İki koşullu uygulama KALDIRILDI (09.10.2026): her iki sütun da artık
    anlık görüntüde, yani koşul hiç tutmuyordu. Dosyalar yine de
    listedeyken, denetim onları "eski gövdeye döndürüyor" sayıyordu —
    20261001060820 process_won_crm_opportunity ve
    add_standard_operation_steps işlevlerini sonraki iki migration'dan
    önceki hâliyle taşıyor.
  */
  // Görev tanımlarını ekleyen sürüm (create or replace; yeniden koşması zararsız).
  await db.exec(fs.readFileSync(migration("20261001173620_gorev_tanimlari_takipte.sql"), "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum({ goster = true } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code, tracking_show_phases)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter', ${goster});
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Ayşe', '${SAHIP}');
    insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-A-1', 'Tez', 'x', '${SAHIP}', 'accepted');
    insert into public.crm_contracts
      (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
       amount, status, start_date, created_by, tracking_code)
      values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-A-1', 'Tez', 'x',
              1200000, 'signed', current_date, '${SAHIP}', '${KOD}');
  `);
  const is = await tek(
    `insert into public.operation_workflows (organization_id, contract_id, title, status, created_by)
     values ($1, $2, 'Tez', 'in_progress', $3) returning id`, [KURUM, SOZLESME, SAHIP]);
  // Sözleşmenin work_plan'ı yok; adımlar elle kuruluyor (şablon yolu ayrı testte).
  await db.query(`delete from public.operation_steps where workflow_id = $1`, [is.id]);
  await db.exec(`
    insert into public.operation_steps (organization_id, workflow_id, title, sort_order, phase_title, is_completed) values
      ('${KURUM}', '${is.id}', 'Tez Öneri Formu', 10, 'Hazırlık', true),
      ('${KURUM}', '${is.id}', 'Etik Kurul İzni', 20, 'Hazırlık', true),
      ('${KURUM}', '${is.id}', 'Veri Toplama', 30, 'Yöntem, Veri ve Analiz', true),
      ('${KURUM}', '${is.id}', 'Bulgular Bölümü', 40, 'Yöntem, Veri ve Analiz', false),
      ('${KURUM}', '${is.id}', 'Savunma Sunumu', 50, 'Savunma', false);
  `);
  return is.id;
}

const asamalar = (kod = KOD) =>
  olarak(db, "anon", null, async () =>
    (await db.query(`select public.arvo_tracking_asamalar($1) as j`, [kod])).rows[0].j);

describe("takip sayfası aşamaları", () => {
  test("kurum açtıysa aşamalar ve güncel aşama dönüyor", () =>
    islem(db, async () => {
      await tohum({ goster: true });
      const j = await asamalar();
      assert.deepEqual(j.asamalar, [
        { ad: "Hazırlık", durum: "done" },
        { ad: "Yöntem, Veri ve Analiz", durum: "current" },
        { ad: "Savunma", durum: "upcoming" },
      ]);
      assert.equal(j.guncel, "Yöntem, Veri ve Analiz");
      assert.deepEqual([j.toplam, j.tamamlanan], [3, 1]);
    }));

  test("görev tanımları aşamasıyla ve durumuyla dönüyor", () =>
    islem(db, async () => {
      await tohum({ goster: true });
      const j = await asamalar();
      assert.deepEqual(j.gorevler, [
        { ad: "Tez Öneri Formu", asama: "Hazırlık", durum: "done" },
        { ad: "Etik Kurul İzni", asama: "Hazırlık", durum: "done" },
        { ad: "Veri Toplama", asama: "Yöntem, Veri ve Analiz", durum: "done" },
        { ad: "Bulgular Bölümü", asama: "Yöntem, Veri ve Analiz", durum: "current" },
        { ad: "Savunma Sunumu", asama: "Savunma", durum: "upcoming" },
      ]);
      assert.equal(j.guncelGorev, "Bulgular Bölümü");
      assert.deepEqual([j.gorevToplam, j.gorevTamamlanan], [5, 3]);
    }));

  test("şu anki görevi veritabanı seçer: in_progress öne geçer", () =>
    islem(db, async () => {
      const isId = await tohum({ goster: true });
      await rol(db, "postgres");
      // Sıradaki "Bulgular Bölümü" iken ekip "Savunma Sunumu"na başladı.
      await db.query(
        `update public.operation_steps set status = 'in_progress'
         where workflow_id = $1 and title = 'Savunma Sunumu'`, [isId]);
      const j = await asamalar();
      assert.equal(j.guncelGorev, "Savunma Sunumu");
      const simdiki = j.gorevler.filter((g) => g.durum === "current");
      assert.equal(simdiki.length, 1, "şu an yapılan iş tek olmalı");
    }));

  test("bayrak kapalıyken görev adları da çıkmıyor", () =>
    islem(db, async () => {
      await tohum({ goster: false });
      // Aynı anahtar: aşamalar kapalıysa görev adları da kapalı.
      assert.equal(await asamalar(), null);
    }));

  test("bütün görevler bitince şu anki görev kalmıyor", () =>
    islem(db, async () => {
      const isId = await tohum({ goster: true });
      await rol(db, "postgres");
      await db.query(
        `update public.operation_steps set is_completed = true, completed_at = now()
         where workflow_id = $1`, [isId]);
      const j = await asamalar();
      assert.equal(j.guncelGorev, null);
      assert.equal(j.gorevler.every((g) => g.durum === "done"), true);
    }));

  test("varsayılan kapalı: kurum açmadıysa hiçbir şey dönmüyor", () =>
    islem(db, async () => {
      await tohum({ goster: false });
      // Bu migration tek başına hiçbir müşterinin gördüğü sayfayı değiştirmemeli.
      assert.equal(await asamalar(), null);
    }));

  test("kısa kod ve bilinmeyen kod sorgulanmıyor", () =>
    islem(db, async () => {
      await tohum({ goster: true });
      assert.equal(await asamalar("ABC"), null);
      assert.equal(await asamalar("ZZZ999"), null);
    }));

  test("takibe kapalı sözleşmede aşama dönmüyor", () =>
    islem(db, async () => {
      await tohum({ goster: true });
      await rol(db, "postgres");
      await db.query(`update public.crm_contracts set status = 'draft' where id = $1`, [SOZLESME]);
      assert.equal(await asamalar(), null);
    }));

  test("aşaması olmayan işte eski genel görünüm korunuyor", () =>
    islem(db, async () => {
      const isId = await tohum({ goster: true });
      await rol(db, "postgres");
      await db.query(`update public.operation_steps set phase_title = null where workflow_id = $1`, [isId]);
      assert.equal(await asamalar(), null, "null dönmeli ki ekran genel beş aşamaya düşsün");
    }));
});
