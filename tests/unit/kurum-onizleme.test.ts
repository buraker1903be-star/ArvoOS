import assert from "node:assert/strict";
import test from "node:test";
import { kurumOnizlemesi, mutlakLogo } from "@/lib/kurum-onizleme";

/*
  Kurumun alan adındaki bağlantı önizlemesi (lib/kurum-onizleme.ts).
  30.10.2026: AkademikMerkez müşterisine takip bağlantısı gönderdiğinde
  WhatsApp önizlemesinde ArvoOS logosu çıkıyordu.
*/
const temel = { kurumAdi: "AkademikMerkez", baslik: "AkademikMerkez | İş Takibi", aciklama: "İşinizi takip edin.", koken: "https://app.akademikmerkez.com" };

test("önizleme kurumun adını ve logosunu taşır, ArvoOS'u değil", () => {
  const o = kurumOnizlemesi({ ...temel, logoUrl: "https://x.supabase.co/storage/v1/object/public/logo.png", yol: "/takip" });
  const og = o.openGraph as { title: string; siteName: string; url: string; images: { url: string }[] };
  assert.equal(og.title, "AkademikMerkez | İş Takibi");
  assert.equal(og.siteName, "AkademikMerkez");
  assert.equal(og.url, "https://app.akademikmerkez.com/takip");
  assert.equal(og.images[0].url, "https://x.supabase.co/storage/v1/object/public/logo.png");
  assert.ok(!JSON.stringify(o).includes("arvoos"));
});

test("logo yoksa görsel YOK: kökteki ArvoOS logosuna düşmez", () => {
  const o = kurumOnizlemesi({ ...temel, logoUrl: null });
  assert.equal((o.openGraph as { images?: unknown }).images, undefined);
  assert.equal((o.twitter as { images?: unknown }).images, undefined);
});

test("göreli logo isteğin adresine göre çözülür; bozuk adres görselsiz kalır", () => {
  assert.equal(mutlakLogo("/kurum-simgesi?x=1", temel.koken), "https://app.akademikmerkez.com/kurum-simgesi?x=1");
  assert.equal(mutlakLogo("javascript:alert(1)", temel.koken), null);
  assert.equal(mutlakLogo("   ", temel.koken), null);
});
