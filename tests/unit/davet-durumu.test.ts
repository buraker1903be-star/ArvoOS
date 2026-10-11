import assert from "node:assert/strict";
import test from "node:test";
import { davetSorunu, davetleriAyir, kisininDaveti, OKUNAN_DAVET_DURUMLARI } from "@/app/panel/hr/davet-durumu";

/*
  Panel yalnızca pending/sent davetleri okuyor ve süresi dolanları
  eliyordu: gönderilemeyen davet de süresi dolan davet de listeden
  sessizce kayboluyor, yönetici "davet gitti" sanıp bekliyordu.
*/

const SIMDI = Date.parse("2026-10-12T09:00:00Z");
const yarin = "2026-10-13T09:00:00Z";
const dun = "2026-10-11T09:00:00Z";

test("gönderilemeyen davet sebebiyle sorunlu", () => {
  assert.equal(
    davetSorunu({ id: "1", email: "a@x.com", status: "failed", expires_at: yarin, error_message: "Resend: domain not verified" }, SIMDI),
    "Resend: domain not verified",
  );
  // Sebep yazılmamışsa da kullanıcı boş bir uyarıyla kalmıyor.
  assert.equal(
    davetSorunu({ id: "1", email: "a@x.com", status: "failed", expires_at: yarin, error_message: null }, SIMDI),
    "Davet e-postası gönderilemedi.",
  );
});

test("süresi dolan davet sorunlu, dolmayan değil", () => {
  assert.match(davetSorunu({ id: "1", email: "a@x.com", status: "sent", expires_at: dun }, SIMDI) ?? "", /süresi doldu/i);
  assert.equal(davetSorunu({ id: "1", email: "a@x.com", status: "sent", expires_at: yarin }, SIMDI), null);
});

test("gönderilemeyen davet süresi de dolmuşsa GÖNDERİM hatasını söylüyor", () => {
  /* Yöneticinin yapacağı iş "süresi doldu"dan değil "gönderilemedi"den
     çıkıyor: adres yanlışsa yeniden göndermek de işe yaramaz. */
  const sebep = davetSorunu({ id: "1", email: "a@x.com", status: "failed", expires_at: dun, error_message: "Geçersiz adres" }, SIMDI);
  assert.equal(sebep, "Geçersiz adres");
});

test("uzun hata mesajı kısaltılıyor ama boş kalmıyor", () => {
  const uzun = "Davet e-postası gönderilemedi: " + "ayrıntı ".repeat(60);
  const sebep = davetSorunu({ id: "1", email: "a@x.com", status: "failed", expires_at: yarin, error_message: uzun }, SIMDI) ?? "";
  assert.ok(sebep.length <= 161, `kısalmadı: ${sebep.length}`);
  assert.ok(sebep.endsWith("…"));
  assert.ok(sebep.startsWith("Davet e-postası gönderilemedi"));
});

test("ayırma: bekleyen ve sorunlu listeleri", () => {
  const { bekleyen, sorunlu } = davetleriAyir([
    { id: "1", email: "bekleyen@x.com", status: "sent", expires_at: yarin },
    { id: "2", email: "gitmeyen@x.com", status: "failed", expires_at: yarin, error_message: "Oran sınırı" },
    { id: "3", email: "suresi@x.com", status: "pending", expires_at: dun },
  ], SIMDI);
  assert.deepEqual(bekleyen.map((d) => d.id), ["1"]);
  assert.deepEqual(sorunlu.map((d) => d.id), ["2", "3"]);
  assert.equal(sorunlu[0].sebep, "Oran sınırı");
});

test("kişinin daveti: bekleyen öncelikli, yoksa sorunlu", () => {
  const satirlar = [
    { id: "1", email: "Ayse@Kurum.COM", status: "failed", expires_at: yarin, error_message: "Gitmedi" },
    { id: "2", email: "ayse@kurum.com", status: "sent", expires_at: yarin },
  ];
  // Adres karşılaştırması harf duyarsız: personel kartındaki yazım farklı olabiliyor.
  const bekleyen = kisininDaveti(satirlar, "AYSE@kurum.com", SIMDI);
  assert.equal(bekleyen.davet?.id, "2");
  assert.equal(bekleyen.sebep, null);

  const yalnizSorunlu = kisininDaveti([satirlar[0]], "ayse@kurum.com", SIMDI);
  assert.equal(yalnizSorunlu.davet?.id, "1");
  assert.equal(yalnizSorunlu.sebep, "Gitmedi");

  // Başkasının daveti kişinin kartına sızmıyor.
  assert.equal(kisininDaveti(satirlar, "veli@kurum.com", SIMDI).davet, null);
  assert.equal(kisininDaveti(satirlar, null, SIMDI).davet, null);
});

test("iptal edilen davet (expired) hiç okunmuyor", () => {
  /* cancelInvitation iptali `expired` olarak yazıyor: yöneticinin
     bilerek kapattığı davet sorun değil, listede de görünmemeli. */
  assert.deepEqual([...OKUNAN_DAVET_DURUMLARI], ["pending", "sent", "failed"]);
});

test("yarıda kalmış gönderim (pending, eski) sorunlu", () => {
  /*
    Kenar fonksiyonu satırı önce `pending` yazıp sonra `sent`e
    çeviriyor; hata olursa `failed`. İkisi de olmazsa (süre aşımı)
    satır pending kalıyor ve panel yedi gün "Gönderiliyor" diyordu.
  */
  const taze = { id: "1", email: "a@x.com", status: "pending", expires_at: yarin, created_at: "2026-10-12T08:55:00Z" };
  assert.equal(davetSorunu(taze, SIMDI), null, "beş dakikalık pending normal");
  const takili = { ...taze, created_at: "2026-10-12T08:30:00Z" };
  assert.match(davetSorunu(takili, SIMDI) ?? "", /yarıda kaldı/i);
  // `sent` olan eski satır sorun değil: gönderim tamamlanmış.
  assert.equal(davetSorunu({ ...takili, status: "sent" }, SIMDI), null);
  // created_at bilinmiyorsa (bazı sorgular okumuyor) varsayım yapılmıyor.
  assert.equal(davetSorunu({ ...taze, created_at: null }, SIMDI), null);
});
