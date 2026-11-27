// PayTR Link bildirimi — callback düzeyinde (PR #313 son kontrol, 10.11.2026).
//
// app/api/paytr/callback imzayı doğruladıktan sonra lib/paytr-link-bildirimi
// içindeki linkBildiriminiIsle'yi çağırıyor. Burada AYNI işlev, rotanın
// verdiği bağımlılıkların karşılığıyla çalışıyor:
//   - kaydet / oncekiOlay: gerçek veritabanı işlevleri (PGlite, service_role);
//   - kapat: PayTR'nin bağlantı kapatma çağrısının TAKLİDİ (dış istek yok);
//   - tahsilatSonrasi: sayaç (AI kredisi / köprü yan işleri burada yok).
// Gerçek ödeme, e-posta, üretim verisi yok.
//
// Sabitlenen davranış:
//   1. Tahsilat başarılı + kapatma başarısız → PayTR'ye 503 (yeniden
//      gönderir), hata günlükte; tahsilat bir kez yazılı.
//   2. Aynı bildirim yeniden gelir → 'duplicate': tahsilat ve lisans dönemi
//      ikinci kez uygulanmaz; önceki olay bu bağlantının tahsilatıysa
//      kapatma yeniden denenir.
//   3. Müşteri kapanmamış eski adresten yeniden öderse (farklı merchant_oid)
//      ikinci tahsilat ayrı olay olarak işlenir — kaybolmaz, yok sayılmaz —
//      ve günlüğe uyarı düşer.
//   4. Her 'duplicate' başarılı sayılmaz: başka bağlantının, test ödemesinin
//      ya da eksik ödemenin tekrarı bağlantıyı kapatmaz; önceki olay
//      okunamazsa 503.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";
import { baglantiKapatilmaliMi, linkBildiriminiIsle } from "../../lib/paytr-link-bildirimi.ts";

const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const L1 = "00000000-0000-4000-8000-0000000000f1";
const L2 = "00000000-0000-4000-8000-0000000000f2";

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const sayi = async (sql, p = []) => Number((await tek(sql, p)).n);

async function tohum({ lisans = true } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'salon@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'Arvo', 'arvo-os', 'active', 'starter'), ('${SALON}', 'Güzel Salon', 'guzel-salon', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values ('${SALON}', '${SAHIP}', 'owner');
  `);
  // Kurum + ürün başına tek açık abonelik bağlantısı (payment_links_one_active_subscription): L2 ArvoARC'ın.
  for (const [id, plk, urun] of [[L1, "PL-1", "arvoos"], [L2, "PL-2", "arc"]]) {
    await db.query(
      `insert into public.payment_links (id, organization_id, provider, provider_link_id, url, amount, status, purpose, payer_organization_id, plan_code, product, created_by)
       values ($1, $2, 'paytr', $3, 'https://paytr.example/' || $3, 150000, 'active', 'subscription', $4, 'starter', $5, $6)`,
      [id, ARVO, plk, SALON, urun, SAHIP],
    );
  }
  if (!lisans) await db.query(`delete from public.organization_licenses where organization_id = $1`, [SALON]);
}

/** Taklit PayTR: kapatma çağrılarını sayar; verilen sıradaki denemeler başarısız olur. */
function taklitPaytr(basarisizlar = []) {
  const cagrilar = [];
  return {
    cagrilar,
    kapat: (linkKimligi) => async () => {
      cagrilar.push(linkKimligi);
      if (basarisizlar.includes(cagrilar.length)) throw new Error("PayTR bağlantıyı kapatamadı: taklit hata");
    },
  };
}

/**
 * Rotanın yaptığı: bağlantıyı okur (durum KAYITTAN ÖNCE), sonra karar
 * işlevini gerçek veritabanı bağımlılıklarıyla çağırır.
 */
async function callback({ link = L1, oid, tutar = 150000, test = false, paytr, oncekiHata = null }) {
  await rol(db, "postgres");
  const baglanti = await tek(`select id, provider_link_id, status, payer_organization_id from public.payment_links where id = $1`, [link]);
  const gunluk = { hata: [], uyari: [] };
  let sonrasi = 0;
  const sonuc = await linkBildiriminiIsle(
    { linkId: baglanti.id, merchantOid: oid, baglantiDurumu: baglanti.status, payerOrganizationId: baglanti.payer_organization_id },
    {
      kaydet: async () => {
        await rol(db, "service_role");
        try {
          const r = await tek(
            `select public.arvo_record_paytr_payment($1, $2, $3, $3, 'TL', $4, '{"payment_type":"card"}'::jsonb) as s`,
            [baglanti.id, oid, tutar, test],
          );
          return { sonuc: r.s, hata: null };
        } finally {
          await rol(db, "postgres");
        }
      },
      oncekiOlay: async () => {
        if (oncekiHata) return { olay: null, hata: oncekiHata };
        await rol(db, "service_role");
        const olay = await tek(`select payment_link_id, result, test_mode from public.payment_provider_events where provider = 'paytr' and merchant_oid = $1`, [oid]);
        await rol(db, "postgres");
        return { olay: olay ?? null, hata: null };
      },
      kapat: paytr.kapat(baglanti.provider_link_id),
      tahsilatSonrasi: async () => { sonrasi += 1; },
      hata: (...a) => gunluk.hata.push(a.join(" ")),
      uyari: (...a) => gunluk.uyari.push(a.join(" ")),
    },
  );
  return { ...sonuc, gunluk, sonrasi };
}

const durum = async () => {
  await rol(db, "postgres");
  return {
    olaylar: (await db.query(`select merchant_oid, result from public.payment_provider_events order by merchant_oid`)).rows.map((r) => `${r.merchant_oid}:${r.result}`),
    onayli: await sayi(`select count(*) as n from public.organization_payment_requests where organization_id = $1 and status = 'approved' and product = 'arvoos'`, [SALON]),
    aktivasyon: await sayi(`select count(*) as n from public.billing_subscriptions where organization_id = $1`, [SALON]),
    donemSonu: (await tek(`select extract(epoch from current_period_end) as s from public.organization_licenses where organization_id = $1`, [SALON]))?.s ?? null,
    baglanti: (await tek(`select status from public.payment_links where id = $1`, [L1])).status,
  };
};

describe("tahsilat başarılı, PayTR bağlantısı kapatılamadı", () => {
  test("no_license + kapatma hatası → 503 ve izlenebilir hata; tekrar bildirim duplicate, ikinci tahsilat yok, kapatma yeniden denenir", () =>
    islem(db, async () => {
      await tohum({ lisans: false });
      const paytr = taklitPaytr([1]);

      const ilk = await callback({ oid: "OID-1", paytr });
      assert.equal(ilk.sonuc, "no_license");
      assert.equal(ilk.kapatma, "basarisiz");
      assert.equal(ilk.durum, 503, "OK dönülmedi: PayTR bildirimi yeniden gönderecek");
      assert.ok(ilk.gunluk.hata.some((h) => h.includes("bağlantı kapatılamadı") && h.includes(L1) && h.includes("OID-1")), "kapatma hatası günlükte, bağlantı kimliğiyle");
      assert.ok(ilk.gunluk.hata.some((h) => h.includes("lisans kaydı yok")));
      const sonra1 = await durum();
      assert.deepEqual(sonra1.olaylar, ["OID-1:no_license"]);
      assert.equal(sonra1.onayli, 0);
      assert.equal(sonra1.baglanti, "paid");

      const tekrar = await callback({ oid: "OID-1", paytr });
      assert.equal(tekrar.sonuc, "duplicate");
      assert.equal(tekrar.kapatma, "kapatildi", "önceki olay bu bağlantının tahsilatı: kapatma yeniden denendi");
      assert.equal(tekrar.durum, 200);
      assert.deepEqual(paytr.cagrilar, ["PL-1", "PL-1"]);
      assert.deepEqual(await durum(), sonra1, "tekrar bildirim hiçbir kaydı değiştirmedi");
      assert.equal(tekrar.gunluk.uyari.length, 0, "tekrar, ikinci tahsilat sayılmadı");
    }));

  test("recorded + kapatma hatası → lisans bir kez uzar; tekrar bildirimde ikinci uzama ve ikinci yan iş yok", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr([1]);
      const ilk = await callback({ oid: "OID-1", paytr });
      assert.equal(ilk.sonuc, "recorded");
      assert.equal(ilk.durum, 503);
      assert.equal(ilk.sonrasi, 1, "kredi/köprü yan işleri kapatma hatasından ÖNCE çalıştı");
      const sonra1 = await durum();
      assert.equal(sonra1.onayli, 1);
      assert.equal(sonra1.aktivasyon, 1);

      const tekrar = await callback({ oid: "OID-1", paytr });
      assert.equal(tekrar.sonuc, "duplicate");
      assert.equal(tekrar.kapatma, "kapatildi");
      assert.equal(tekrar.sonrasi, 0, "yan işler tekrar edilmedi");
      assert.deepEqual(await durum(), sonra1, "dönem sonu, onaylı ödeme ve aktivasyon aynı");
    }));

  test("kapatma ikinci denemede de başarısızsa yine 503; kayıtlar değişmez", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr([1, 2]);
      await callback({ oid: "OID-1", paytr });
      const once = await durum();
      const tekrar = await callback({ oid: "OID-1", paytr });
      assert.equal(tekrar.durum, 503);
      assert.equal(tekrar.kapatma, "basarisiz");
      assert.deepEqual(await durum(), once);
    }));
});

describe("müşteri kapanmamış eski adresten yeniden öder (farklı merchant_oid)", () => {
  test("lisans yokken: ikinci tahsilat ayrı 'no_license' olayı — kaybolmaz, operatör listesinde ikisi de görünür; günlükte uyarı", () =>
    islem(db, async () => {
      await tohum({ lisans: false });
      const paytr = taklitPaytr([1]);
      await callback({ oid: "OID-1", paytr });
      const ikinci = await callback({ oid: "OID-2", paytr });
      assert.equal(ikinci.sonuc, "no_license");
      assert.ok(ikinci.gunluk.uyari.some((u) => u.includes("ikinci tahsilat") && u.includes("OID-2")));
      const s = await durum();
      assert.deepEqual(s.olaylar, ["OID-1:no_license", "OID-2:no_license"]);
      assert.equal(s.onayli, 0);
    }));

  test("lisans varken: ikinci tahsilat ikinci ödeme olarak işlenir (ikinci onaylı ödeme, dönem bir ay daha uzar); günlükte uyarı", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr([1]);
      await callback({ oid: "OID-1", paytr });
      const birinci = await durum();
      const ikinci = await callback({ oid: "OID-2", paytr });
      assert.equal(ikinci.sonuc, "recorded");
      assert.ok(ikinci.gunluk.uyari.some((u) => u.includes("ikinci tahsilat")));
      const s = await durum();
      assert.equal(s.onayli, 2);
      assert.equal(s.aktivasyon, 2);
      assert.ok(Number(s.donemSonu) > Number(birinci.donemSonu), "ikinci gerçek ödeme dönemi uzattı (yok sayılmadı)");
    }));
});

describe("her 'duplicate' başarılı sayılmaz", () => {
  test("önceki olay başka bağlantıya aitse kapatma denenmez", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr();
      await callback({ link: L2, oid: "OID-X", paytr });
      paytr.cagrilar.length = 0;
      const r = await callback({ link: L1, oid: "OID-X", paytr });
      assert.equal(r.sonuc, "duplicate");
      assert.equal(r.kapatma, "atlandi");
      assert.equal(paytr.cagrilar.length, 0, "L1 kapatılmadı");
      assert.equal(r.durum, 200);
    }));

  test("önceki olay eksik ödemeyse (amount_mismatch) bağlantı açık kalır, kapatma denenmez", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr();
      const ilk = await callback({ oid: "OID-E", tutar: 100, paytr });
      assert.equal(ilk.sonuc, "amount_mismatch");
      assert.equal(ilk.kapatma, "atlandi");
      const tekrar = await callback({ oid: "OID-E", tutar: 100, paytr });
      assert.equal(tekrar.sonuc, "duplicate");
      assert.equal(tekrar.kapatma, "atlandi");
      assert.equal(paytr.cagrilar.length, 0);
      assert.equal((await durum()).baglanti, "active");
    }));

  test("önceki olay test ödemesiyse kapatma denenmez", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr();
      assert.equal((await callback({ oid: "OID-T", test: true, paytr })).sonuc, "test");
      const tekrar = await callback({ oid: "OID-T", test: true, paytr });
      assert.equal(tekrar.kapatma, "atlandi");
      assert.equal(paytr.cagrilar.length, 0);
    }));

  test("önceki olay okunamazsa başarılı sayılmaz: 503, kapatma yok", () =>
    islem(db, async () => {
      await tohum();
      const paytr = taklitPaytr([1]);
      await callback({ oid: "OID-1", paytr });
      const r = await callback({ oid: "OID-1", paytr, oncekiHata: "bağlantı koptu" });
      assert.equal(r.durum, 503);
      assert.equal(r.kapatma, "atlandi");
      assert.equal(paytr.cagrilar.length, 1, "yalnızca ilk (başarısız) deneme");
    }));
});

describe("karar işlevi (saf)", () => {
  test("tahsil edilmiş sonuçlar kapatır; diğerleri kapatmaz", () => {
    assert.equal(baglantiKapatilmaliMi("recorded", L1, null).kapat, true);
    assert.equal(baglantiKapatilmaliMi("no_license", L1, null).kapat, true);
    for (const s of ["test", "amount_mismatch", "invalid_amount", "no_party", "not_found", "invalid", null]) {
      assert.equal(baglantiKapatilmaliMi(s, L1, null).kapat, false, String(s));
    }
    assert.equal(baglantiKapatilmaliMi("duplicate", L1, null).kapat, false);
    assert.equal(baglantiKapatilmaliMi("duplicate", L1, { payment_link_id: null, result: "recorded", test_mode: false }).kapat, false);
    assert.equal(baglantiKapatilmaliMi("duplicate", L1, { payment_link_id: L1, result: "recorded", test_mode: false }).kapat, true);
  });
});
