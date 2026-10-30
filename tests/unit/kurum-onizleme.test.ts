import assert from "node:assert/strict";
import test from "node:test";
import { gorselBoyutu, kurumOnizlemesi, onizlemeSurumu, sigdir } from "@/lib/kurum-onizleme";

/*
  Kurumun alan adındaki bağlantı önizlemesi (lib/kurum-onizleme.ts).
  30.10.2026: AkademikMerkez müşterisine takip bağlantısı gönderdiğinde
  WhatsApp önizlemesinde önce ArvoOS logosu çıktı; logo verilince de
  yatay logo kırpılıp "AkademikMe" diye kesildi.
*/
const temel = { kurumAdi: "AkademikMerkez", baslik: "AkademikMerkez | İş Takibi", aciklama: "İşinizi takip edin.", koken: "https://app.akademikmerkez.com" };

test("önizleme kurumun adını ve kurumun alan adındaki kart görselini taşır, ArvoOS'u değil", () => {
  const o = kurumOnizlemesi({ ...temel, logoUrl: "https://x.supabase.co/logo.png", yol: "/takip" });
  const og = o.openGraph as { title: string; siteName: string; url: string; images: { url: string; width: number; height: number }[] };
  assert.equal(og.title, "AkademikMerkez | İş Takibi");
  assert.equal(og.siteName, "AkademikMerkez");
  assert.equal(og.url, "https://app.akademikmerkez.com/takip");
  // Logonun kendisi değil, kare simge görseli: kırpılacak bir şey kalmasın.
  assert.match(og.images[0].url, /^https:\/\/app\.akademikmerkez\.com\/onizleme-gorseli\?v=/);
  assert.equal(og.images[0].width, 600);
  assert.equal(og.images[0].height, 600);
  assert.equal((o.twitter as { card: string }).card, "summary");
  assert.ok(!JSON.stringify(o).toLowerCase().includes("arvoos"));
});

test("logo değişince görsel adresi değişir (WhatsApp önbelleği eskisini göstermesin)", () => {
  assert.notEqual(onizlemeSurumu("https://x/logo.png?v=1", "A"), onizlemeSurumu("https://x/logo.png?v=2", "A"));
  assert.equal(onizlemeSurumu(null, "A"), onizlemeSurumu(null, "A"));
});

test("PNG ve JPEG boyutu başlıktan okunur", () => {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1600);
  new DataView(png.buffer).setUint32(20, 400);
  assert.deepEqual(gorselBoyutu(png), { genislik: 1600, yukseklik: 400 });

  // SOI, APP0 (uzunluk 16), SOF0: yükseklik 300, genişlik 900.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x03, 0x84, 0x03]);
  assert.deepEqual(gorselBoyutu(jpeg), { genislik: 900, yukseklik: 300 });
  assert.equal(gorselBoyutu(new Uint8Array([1, 2, 3])), null);
});

test("logo kutuya oranını koruyarak sığar, kırpılmaz", () => {
  const kutu = { genislik: 960, yukseklik: 360 };
  // Çok yatay logo genişliğe dayanır.
  assert.deepEqual(sigdir({ genislik: 2000, yukseklik: 400 }, kutu), { genislik: 960, yukseklik: 192 });
  // Kare logo yüksekliğe dayanır.
  assert.deepEqual(sigdir({ genislik: 500, yukseklik: 500 }, kutu), { genislik: 360, yukseklik: 360 });
  // Küçük logo en fazla iki kat büyür.
  assert.deepEqual(sigdir({ genislik: 100, yukseklik: 40 }, kutu), { genislik: 200, yukseklik: 80 });
});
