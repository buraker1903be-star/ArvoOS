import assert from "node:assert/strict";
import test from "node:test";
import { kopruluUrun, yansitmaHatasi } from "@/lib/yansitma-hatasi";

/*
  Karar üç ayrı if bloğunda elle yazılıydı ve sapmıştı: "köprü
  kapalı" hâli ArvoLab ile Randevu'da hata sayılıyor, ArvoARC'ta
  sayılmıyordu. Ortam değişkenleri girilmemiş bir kurulumda ArvoARC
  lisansı yansımıyor ama kurucu ekranında işlem başarılı görünüyordu.
*/
test("köprü kapalıysa ÜÇ ürün için de hata", () => {
  for (const urun of ["arc", "arvolab", "randevu"]) {
    const mesaj = yansitmaHatasi(urun, { status: "not_configured" });
    assert.ok(mesaj, `${urun}: köprü kapalı hata sayılmalı`);
    assert.match(mesaj!, /köprüsü kapalı/);
    /* Mesaj hangi değişkenlerin eksik olduğunu söylemeli: kurucu
       Vercel'de ne ekleyeceğini bilmeli. */
    assert.match(mesaj!, /SUPABASE_URL/);
  }
});

test("ArvoARC köprüsü kapalıyken kendi değişkenlerini söylüyor", () => {
  const mesaj = yansitmaHatasi("arc", { status: "not_configured" })!;
  assert.match(mesaj, /ARC_SUPABASE_URL \/ ARC_SUPABASE_SECRET_KEY/);
  /* Lisansın kaydedildiği de söylenmeli: kurucu baştan girmesin. */
  assert.match(mesaj, /^Lisans kaydedildi ancak/);
});

test("hata listesi doluysa ilk hata gösteriliyor", () => {
  const mesaj = yansitmaHatasi("arc", { status: "partial", errors: ["organizations: izin yok", "memberships: zaman aşımı"] })!;
  assert.match(mesaj, /organizations: izin yok/);
  assert.ok(!mesaj.includes("zaman aşımı"), "ilk hata yeterli; liste kurucuyu boğmasın");
});

test("status failed ama hata listesi boşsa da mesaj var", () => {
  const mesaj = yansitmaHatasi("randevu", { status: "failed", errors: [] })!;
  assert.match(mesaj, /Randevu'ya yansıtılamadı: bilinmeyen hata/);
});

test("yazıldıysa hata yok", () => {
  assert.equal(yansitmaHatasi("arc", { status: "synced", errors: [] }), null);
  assert.equal(yansitmaHatasi("arvolab", { status: "synced" }), null);
});

test("köprüsü olmayan ürün hiç sınanmıyor", () => {
  /* ArvoOS çekirdeği ayrı veritabanında değil; yansıtacak bir şey yok. */
  assert.equal(kopruluUrun("core"), false);
  assert.equal(yansitmaHatasi("core", { status: "not_configured" }), null);
});

test("Türkçe yönelme eki ürüne göre", () => {
  /* "ArvoLab'a" ama "Randevu'ya": ek sesli uyumuna göre değişiyor ve
     mesaj kurucuya gösteriliyor. */
  assert.match(yansitmaHatasi("arvolab", { status: "failed" })!, /ArvoLab'a yansıtılamadı/);
  assert.match(yansitmaHatasi("randevu", { status: "failed" })!, /Randevu'ya yansıtılamadı/);
  assert.match(yansitmaHatasi("arc", { status: "failed" })!, /ArvoARC'a yansıtılamadı/);
});
