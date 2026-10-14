import assert from "node:assert/strict";
import test from "node:test";
import { krediEslestir, type KrediOdemesi, type KrediSiparisi } from "@/lib/ai-kredi-yukleme";

const siparis = (id: string, link: string, kredi = 500): KrediSiparisi =>
  ({ id, organization_id: `kurum-${id}`, kredi, payment_link_id: link });
const odeme = (link: string, oid: string, saat: string): KrediOdemesi =>
  ({ payment_link_id: link, merchant_oid: oid, received_at: `2026-10-14T${saat}:00Z` });

/*
  Sipariş satırı ödeme bağlantısıyla birlikte, ödemeden ÖNCE yazılıyor.
  Vazgeçen müşterinin satırı da loaded_at'siz kalıyor; onu "para alındı,
  kredi yüklenmedi" saymak kurucuyu her vazgeçen için uyandırırdı.
*/
test("ödemesi kaydedilmemiş sipariş bekleyen sayılmıyor", () => {
  const sonuc = krediEslestir(
    [siparis("a", "link-1"), siparis("b", "link-2")],
    [odeme("link-1", "OID1", "10")],
  );
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].siparisId, "a");
  assert.equal(sonuc[0].merchantOid, "OID1");
});

/*
  PayTR bildirimi tekrarlanabiliyor. En ESKİ olay asıl ödeme ve ArvoLab'ın
  ilk yüklemede kullandığı tekilleştirme anahtarı o; sonrakini seçmek
  farklı bir anahtarla denemek, yani krediyi İKİNCİ KEZ vermek demekti.
*/
test("aynı bağlantının birden çok olayında en eski ödeme seçiliyor", () => {
  const sonuc = krediEslestir(
    [siparis("a", "link-1")],
    [odeme("link-1", "SONRAKI", "12"), odeme("link-1", "ILK", "09"), odeme("link-1", "ORTA", "11")],
  );
  assert.equal(sonuc.length, 1);
  assert.equal(sonuc[0].merchantOid, "ILK");
  assert.equal(sonuc[0].odendiAt, "2026-10-14T09:00Z");
});

test("liste eskiden yeniye sıralı: en uzun bekleyen müşteri başta", () => {
  const sonuc = krediEslestir(
    [siparis("yeni", "link-2"), siparis("eski", "link-1")],
    [odeme("link-2", "OID2", "15"), odeme("link-1", "OID1", "08")],
  );
  assert.deepEqual(sonuc.map((s) => s.siparisId), ["eski", "yeni"]);
});

test("kredi sayısı ve kurum sipariş kaydından taşınıyor", () => {
  const sonuc = krediEslestir([siparis("a", "link-1", 2500)], [odeme("link-1", "OID1", "10")]);
  assert.equal(sonuc[0].kredi, 2500);
  assert.equal(sonuc[0].organizationId, "kurum-a");
});

test("bekleyen yoksa boş liste", () => {
  assert.deepEqual(krediEslestir([], [odeme("link-1", "OID1", "10")]), []);
  assert.deepEqual(krediEslestir([siparis("a", "link-1")], []), []);
});
