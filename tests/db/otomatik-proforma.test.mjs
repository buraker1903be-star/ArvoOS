/*
  OTOMATİK PROFORMA (migration 20261029160309).

  Sınananlar:
  1. Aynı müşteriye aynı ürün ve dönem için İKİNCİ otomatik proforma
     veritabanında reddediliyor (iş üç günlük pencerede aynı dönemi üç
     kez görüyor; iki koşu çakışsa da tek belge).
  2. Kurucunun iptal ettiği otomatik proforma da dönemi tutuyor: iş ertesi
     sabah aynı dönemi yeniden kesemiyor.
  3. Meşru akışlar kırılmıyor: elle kesilen proforma (otomatik değil) aynı
     dönemde de kesilebiliyor, sonraki dönemin otomatik proforması
     kesilebiliyor, bireysel abonenin proforması kurumunkiyle çakışmıyor.
  4. Gönderim sütunları yazılabiliyor (iş sonucu proformaya yazıyor).
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-00000000d1a1";
const ABONE = "00000000-0000-4000-8000-00000000d1c1";

let db;
const kes = (ek = {}) => {
  const s = { musteri: `organization_id`, id: KURUM, product: "arvoos", donem: "2026-11-01", otomatik: true, durum: "bekliyor", ...ek };
  return db.query(
    `insert into public.platform_proformalari (product, ${s.musteri}, musteri_adi, kalemler, ara_toplam, kdv_orani, kdv, toplam, duzenleme_tarihi, gecerlilik_tarihi, durum, otomatik, donem_sonu)
     values ($1, $2, 'Müşteri', '[{"aciklama":"a","miktar":1,"birim_fiyat":100000}]', 100000, 20, 20000, 120000, '2026-10-29', '2026-11-01', $3, $4, $5::date) returning id`,
    [s.product, s.id, s.durum, s.otomatik, s.donem],
  );
};

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.plans (code, name, description) values ('professional','P','');
    insert into public.organizations (id,name,slug,status,plan_code,kind) values ('${KURUM}','Kurum','kurum','active','professional','customer');
    insert into public.product_subscribers (id,product,email,status,external_user_id) values ('${ABONE}','arvolab','a@x.com','active',gen_random_uuid());
  `);
});

test("aynı dönem için ikinci otomatik proforma reddediliyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    await kes();
    await reddedilir(db, `insert into public.platform_proformalari (product, organization_id, musteri_adi, kalemler, ara_toplam, kdv_orani, kdv, toplam, duzenleme_tarihi, gecerlilik_tarihi, otomatik, donem_sonu)
      values ('arvoos', $1, 'M', '[{"aciklama":"a","miktar":1,"birim_fiyat":1}]', 1, 20, 0, 1, '2026-10-30', '2026-11-01', true, '2026-11-01')`, [KURUM], /duplicate key|unique/i);
  });
});

test("iptal edilen otomatik proforma dönemi tutmaya devam ediyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    await kes({ durum: "iptal" });
    await reddedilir(db, `insert into public.platform_proformalari (product, organization_id, musteri_adi, kalemler, ara_toplam, kdv_orani, kdv, toplam, duzenleme_tarihi, gecerlilik_tarihi, otomatik, donem_sonu)
      values ('arvoos', $1, 'M', '[{"aciklama":"a","miktar":1,"birim_fiyat":1}]', 1, 20, 0, 1, '2026-10-30', '2026-11-01', true, '2026-11-01')`, [KURUM], /duplicate key|unique/i);
  });
});

test("elle kesilen, sonraki dönem, başka ürün ve bireysel abone çakışmıyor; gönderim sütunları yazılıyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const { rows: [ilk] } = await kes();
    await kes({ otomatik: false, donem: null });
    await kes({ otomatik: false, donem: null });
    await kes({ donem: "2026-12-01" });
    await kes({ product: "randevu" });
    await kes({ musteri: "subscriber_id", id: ABONE, product: "arvolab" });
    await db.query(`update public.platform_proformalari set gonderildi_at = now(), gonderilen = array['a@x.com'], bildirildi_at = now(), gonderim_hatasi = null where id = $1`, [ilk.id]);
    const { rows: [say] } = await db.query(`select count(*)::int as n from public.platform_proformalari where organization_id = $1 or subscriber_id = $2`, [KURUM, ABONE]);
    assert.equal(say.n, 6);
  });
});

// 20261030062700: ArvoARC proforması kesilebiliyor; bilinmeyen ürün kodu yine reddediliyor.
test("ArvoARC proforması kabul ediliyor, bilinmeyen ürün reddediliyor", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    await kes({ product: "arc", donem: "2026-11-05" });
    await reddedilir(db, `insert into public.platform_proformalari (product, organization_id, musteri_adi, kalemler, ara_toplam, kdv_orani, kdv, toplam, duzenleme_tarihi, gecerlilik_tarihi)
      values ('arcc', $1, 'M', '[{"aciklama":"a","miktar":1,"birim_fiyat":1}]', 1, 20, 0, 1, '2026-10-30', '2026-11-01')`, [KURUM], /product_check|check constraint/i);
  });
});
