/*
  KONSOL ANA SAYFASI ÖZETİ (migration 20261103065144).

  Ana sayfa on dört küçük okumayı tek çağrıda alıyor; çağrı düşerse eski
  okumalara dönüyor, yani bu işlevin sessizce bozulması ekranı BOZMAZ,
  yalnızca yavaşlatır. Burada sabitlenen ikisi:
   - MEŞRU AKIŞ: tam yetkili kurucu çağırır, her anahtar gelir ve
     sayımlar/listeler tohumlanan satırları görür (takip bugüne kadar
     olanı alır, yarınkini almaz; Arvo'nun kendi kurumu "yeni müşteri"
     sayılmaz);
   - kiracının sahibi ve KISITLI kurucu reddedilir: işlev ödeme, destek
     ve sözleşme bilgisini servis yetkisiyle okuyor; kısıtlı kurucu bu
     ekranı görmüyor ve o bilgiler alanının dışında.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000c0001";
const KISITLI = "00000000-0000-4000-8000-0000000c0002";
const KIRACI = "00000000-0000-4000-8000-0000000c0003";
const KURUM = "00000000-0000-4000-8000-0000000c0102";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'o-kurucu@x.co'), ('${KISITLI}', 'o-kisitli@x.co'), ('${KIRACI}', 'o-kiraci@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (name, slug, status, plan_code, kind) values ('ArvoOS', 'arvo-os', 'active', 'starter', 'internal')
      on conflict (slug) do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values ('${KURUM}', 'Kurum', 'kurum-ozet', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ((select id from public.organizations where slug = 'arvo-os'), '${KURUCU}', 'owner'),
      ((select id from public.organizations where slug = 'arvo-os'), '${KISITLI}', 'owner'),
      ('${KURUM}', '${KIRACI}', 'owner');
    insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ('${KISITLI}', array['finans'], '${KURUCU}');
    insert into public.platform_musteri_notlari (organization_id, metin, takip_tarihi) values
      ('${KURUM}', 'Bugün ara', current_date), ('${KURUM}', 'Yarın ara', current_date + 1);
  `);
}

const OZET = `select public.platform_konsol_ana_ozeti(now() - interval '1 day', now() - interval '28 days', current_date, array['open']) as o`;
const cagir = () => db.query(OZET);

describe("konsol ana sayfası özeti", () => {
  test("tam yetkili kurucu bütün parçaları alır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      const { rows: [{ o }] } = await cagir();
      for (const anahtar of ["sozlesmeler", "kurulum", "proformalar", "aski_cekirdek", "aski_urun", "yeni_kurum", "yeni_abone",
        "takipler", "destek", "havaleler", "bireysel", "bekleyen_odemeler", "ad"]) assert.ok(anahtar in o, anahtar);
      assert.deepEqual(o.takipler.map((t) => t.metin), ["Bugün ara"]);
      /* Arvo'nun kendi kurumu (internal) sayılmıyor; tohumun kurumu sayılıyor. */
      assert.ok(o.yeni_kurum >= 1);
      await rol(db, "postgres");
      const { rows: [{ n }] } = await db.query(`select count(*)::int n from public.organizations where created_at >= now() - interval '1 day' and kind <> 'internal' and grup_markasi = false`);
      assert.equal(o.yeni_kurum, n);
      assert.ok(Array.isArray(o.destek) && Array.isArray(o.bekleyen_odemeler));
    }));

  test("kiracının sahibi reddedilir", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KIRACI);
      await reddedilir(db, OZET, [], /Tam yetkili kurucu gerekli/);
    }));

  test("kısıtlı kurucu reddedilir", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KISITLI);
      await reddedilir(db, OZET, [], /Tam yetkili kurucu gerekli/);
    }));
});
