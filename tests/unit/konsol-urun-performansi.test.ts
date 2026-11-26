import assert from "node:assert/strict";
import test from "node:test";
import { donem, donemKodu, donemde, DONEMLER } from "@/lib/konsol/donem";
import { urunPerformansi, type Girdi } from "@/lib/konsol/urun-performansi";

/*
  Ürün performansı tablosunun kuralları. Sayılar uydurma değil, ekranda
  gösterilecek olanın aynısı: bir kuruşu yanlış sayan tablo, kurucunun
  ürün kapatma kararını yanlış veriye dayandırır.
*/

const BUGUN = "2026-11-26";
const D30 = donem("30g", BUGUN);

/** Dönem içine düşen bir damga (Türkiye saatiyle 10 Kasım öğlen). */
const ICERIDE = "2026-11-10T09:00:00.000Z";

const temel = (): Girdi => ({
  donem: D30,
  cekirdek: { veri: [] },
  urunLisanslari: { veri: [] },
  aboneler: { veri: [] },
  aboneOdemeleri: { veri: [] },
  kurumOdemeleri: { veri: [] },
  musteriKurumlar: { veri: new Set<string>() },
});

const satir = (girdi: Girdi, kod: string) => {
  const s = urunPerformansi(girdi).find((x) => x.kod === kod);
  assert.ok(s, `${kod} satırı yok`);
  return s;
};

test("dönem: bugün dahil, sınırlar Türkiye gününe oturuyor", () => {
  /* Bitiş YARIN 00:00 olmalı: "son 30 gün" bugünün tahsilatını da sayar.
     Bugünün 23:00'ında yapılan ödeme düşerse gün sonu kayıtları kaybolur. */
  assert.ok(donemde("2026-11-26T20:59:00.000Z", D30), "bugünün akşamı dönemde");
  assert.ok(!donemde("2026-11-27T05:00:00.000Z", D30), "yarın dönem dışı");
  // 30 günlük pencere: 28 Ekim öncesi dışarıda, sonrası içeride.
  assert.ok(donemde("2026-10-28T06:00:00.000Z", D30), "pencerenin ilk günü içeride");
  assert.ok(!donemde("2026-10-26T20:00:00.000Z", D30), "pencereden önce dışarıda");
  // Önceki dönem bitişi, bu dönemin başlangıcıyla aynı an: boşluk ya da örtüşme yok.
  assert.equal(D30.oncekiBitis, D30.baslangic);
});

test("dönem kodu tanınmıyorsa varsayılana düşer", () => {
  assert.equal(donemKodu(undefined), "30g");
  assert.equal(donemKodu("yok-böyle"), "30g");
  for (const d of DONEMLER) assert.equal(donemKodu(d.kod), d.kod);
});

test("tahsilat yalnızca dönemdeki ve MÜŞTERİ kurumun ödemesini sayar", () => {
  const g = temel();
  g.musteriKurumlar = { veri: new Set(["musteri"]) };
  g.kurumOdemeleri = { veri: [
    { organization_id: "musteri", product: "arc", amount: 1000, reviewed_at: ICERIDE },
    // İç ekip / grup markası: gelir değil.
    { organization_id: "ic-ekip", product: "arc", amount: 9999, reviewed_at: ICERIDE },
    // Dönem dışı.
    { organization_id: "musteri", product: "arc", amount: 5000, reviewed_at: "2026-01-01T00:00:00.000Z" },
    // Başka ürün.
    { organization_id: "musteri", product: "randevu", amount: 7000, reviewed_at: ICERIDE },
  ] };
  assert.deepEqual(satir(g, "arc").tahsilat, { durum: "var", deger: 1000 });
  assert.deepEqual(satir(g, "randevu").tahsilat, { durum: "var", deger: 7000 });
  assert.deepEqual(satir(g, "arvoos").tahsilat, { durum: "var", deger: 0 });
});

test("aynı ödeme iki kez sayılmaz: kurum ve bireysel kaynaklar ayrık", () => {
  /* Kurum tarafı onaylı ödeme isteğinden, bireysel taraf abone
     ödemesinden geliyor; aynı satır iki kaynakta birden yok. Üçüncü bir
     kaynak (aktivasyon ikizi) eklenirse bu test düşer. */
  const g = temel();
  g.musteriKurumlar = { veri: new Set(["m"]) };
  g.kurumOdemeleri = { veri: [{ organization_id: "m", product: "arvolab", amount: 300, reviewed_at: ICERIDE }] };
  g.aboneler = { veri: [{ id: "a1", product: "arvolab", status: "active", trial_ends_at: null, created_at: ICERIDE }] };
  g.aboneOdemeleri = { veri: [{ subscriber_id: "a1", amount: 200, paid_at: ICERIDE }] };
  assert.deepEqual(satir(g, "arvolab").tahsilat, { durum: "var", deger: 500 });
  // Abone ödemesi başka ürüne yazılmaz.
  assert.deepEqual(satir(g, "arc").tahsilat, { durum: "var", deger: 0 });
});

test("okunamayan kaynak SIFIR basmaz", () => {
  const g = temel();
  g.kurumOdemeleri = { hata: true };
  const s = satir(g, "arc");
  assert.equal(s.tahsilat.durum, "okunamadi");
  assert.ok(!("deger" in s.tahsilat), "okunamayan ölçümde değer olmamalı");

  const g2 = temel();
  g2.urunLisanslari = { hata: true };
  assert.equal(satir(g2, "arc").aktifMusteri.durum, "okunamadi");

  const g3 = temel();
  g3.cekirdek = { hata: true };
  assert.equal(satir(g3, "arvoos").aktifMusteri.durum, "okunamadi");
});

test("bireysel abonesi olmayan üründe dönüşüm 'kaynak yok'tur, %0 değil", () => {
  const g = temel();
  // ArvoOS ve ArvoCal'ın bireysel abonesi yok.
  assert.equal(satir(g, "arvoos").donusum.durum, "kaynak_yok");
  assert.equal(satir(g, "randevu").donusum.durum, "kaynak_yok");
  // ArvoLab'ın var: kaynak bağlı, grup boş olsa bile "var".
  assert.equal(satir(g, "arvolab").donusum.durum, "var");
});

test("dönüşüm grubu: denemesi olan ve dönemde BAŞLAYAN aboneler", () => {
  const g = temel();
  g.aboneler = { veri: [
    // Denemeye başladı ve ödedi.
    { id: "a1", product: "arvolab", status: "active", trial_ends_at: "2026-11-20T00:00:00.000Z", created_at: ICERIDE },
    // Denemeye başladı, ödemedi.
    { id: "a2", product: "arvolab", status: "trialing", trial_ends_at: "2026-12-01T00:00:00.000Z", created_at: ICERIDE },
    // Denemesi yok (doğrudan kapalı açıldı): grupta değil.
    { id: "a3", product: "arvolab", status: "suspended", trial_ends_at: null, created_at: ICERIDE },
    // Dönemden önce başladı: bu dönemin grubunda değil.
    { id: "a4", product: "arvolab", status: "active", trial_ends_at: "2026-02-01T00:00:00.000Z", created_at: "2026-01-05T00:00:00.000Z" },
    // Başka ürün.
    { id: "a5", product: "arc", status: "active", trial_ends_at: "2026-11-20T00:00:00.000Z", created_at: ICERIDE },
  ] };
  g.aboneOdemeleri = { veri: [
    { subscriber_id: "a1", amount: 100, paid_at: ICERIDE },
    { subscriber_id: "a4", amount: 100, paid_at: ICERIDE },
  ] };
  const d = satir(g, "arvolab").donusum;
  assert.equal(d.durum, "var");
  if (d.durum !== "var") return;
  assert.equal(d.deger.denemeye, 2, "grup yalnızca dönemde başlayan denemeler");
  assert.equal(d.deger.ucretliye, 1);
  assert.equal(d.deger.oran, 0.5);
});

test("grup boşsa oran null: paydası sıfır olan yüzde yazılmaz", () => {
  const g = temel();
  const d = satir(g, "arvolab").donusum;
  assert.equal(d.durum, "var");
  if (d.durum !== "var") return;
  assert.deepEqual(d.deger, { denemeye: 0, ucretliye: 0, oran: null });
});

test("aktif müşteri: açık kurum lisansı + açık bireysel abone", () => {
  const g = temel();
  g.urunLisanslari = { veri: [
    { organization_id: "k1", product: "arvolab", status: "active" },
    { organization_id: "k2", product: "arvolab", status: "trialing" },
    { organization_id: "k3", product: "arvolab", status: "canceled" },
    { organization_id: "k4", product: "arc", status: "active" },
  ] };
  g.aboneler = { veri: [
    { id: "a1", product: "arvolab", status: "active", trial_ends_at: null, created_at: ICERIDE },
    { id: "a2", product: "arvolab", status: "canceled", trial_ends_at: null, created_at: ICERIDE },
  ] };
  assert.deepEqual(satir(g, "arvolab").aktifMusteri, { durum: "var", deger: 3 });
  assert.deepEqual(satir(g, "arc").aktifMusteri, { durum: "var", deger: 1 });
});

test("BEŞİNCİ ÜRÜN: liste arayüz değişmeden büyür", () => {
  /* Tablo ürün listesini PARAMETRE olarak alıyor; yeni ürün bir satır
     eklemekle geliyor, JSX'e dokunulmuyor. */
  const g = temel();
  g.urunler = [...(g.urunler ?? []), { code: "arvodesk", name: "ArvoDesk" }];
  g.urunLisanslari = { veri: [{ organization_id: "k1", product: "arvodesk", status: "active" }] };
  g.musteriKurumlar = { veri: new Set(["m"]) };
  g.kurumOdemeleri = { veri: [{ organization_id: "m", product: "arvodesk", amount: 2500, reviewed_at: ICERIDE }] };
  const satirlar = urunPerformansi(g);
  const yeni = satirlar.find((s) => s.kod === "arvodesk");
  assert.ok(yeni, "beşinci ürün listede yok");
  assert.equal(yeni.ad, "ArvoDesk");
  assert.deepEqual(yeni.aktifMusteri, { durum: "var", deger: 1 });
  assert.deepEqual(yeni.tahsilat, { durum: "var", deger: 2500 });
  // Bireysel abonesi tanımlı değil: dönüşüm uydurulmuyor.
  assert.equal(yeni.donusum.durum, "kaynak_yok");
});

test("ürün listesi verilmezse dört çekirdek ürün çizilir", () => {
  const kodlar = urunPerformansi(temel()).map((s) => s.kod);
  assert.deepEqual(kodlar, ["arvoos", "arvolab", "arc", "randevu"]);
});

test("BEŞİNCİ ÜRÜN: detay şablonu da tek satırla besleniyor", () => {
  /* Ürün detayı aynı çekirdeği TEK ürünle çağırıyor; beşinci ürün için
     ayrı bir kod yolu yok, dolayısıyla JSX de değişmiyor. */
  const g = temel();
  g.urunler = [{ code: "arvodesk", name: "ArvoDesk" }];
  g.aboneliUrunler = ["arvodesk"];
  g.aboneler = { veri: [
    { id: "d1", product: "arvodesk", status: "trialing", trial_ends_at: "2026-12-10T00:00:00.000Z", created_at: ICERIDE },
    { id: "d2", product: "arvodesk", status: "active", trial_ends_at: "2026-11-20T00:00:00.000Z", created_at: ICERIDE },
  ] };
  g.aboneOdemeleri = { veri: [{ subscriber_id: "d2", amount: 400, paid_at: ICERIDE }] };
  const satirlar = urunPerformansi(g);
  assert.equal(satirlar.length, 1, "detayda tek satır beklenir");
  const s = satirlar[0];
  assert.equal(s.ad, "ArvoDesk");
  assert.deepEqual(s.aktifMusteri, { durum: "var", deger: 2 });
  assert.equal(s.donusum.durum, "var");
  if (s.donusum.durum !== "var") return;
  assert.deepEqual(s.donusum.deger, { denemeye: 2, ucretliye: 1, oran: 0.5 });
  assert.deepEqual(s.tahsilat, { durum: "var", deger: 400 });
});
