import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIVATE_PATH_PREFIXES,
  hostFromHeaders,
  isDevOrPreviewHost,
  isLocalDevHost,
  isMarketingHost,
  marketingRedirectTarget,
  normalizeHost,
  robotsFor,
  servesSiteFiles,
} from "@/lib/site/host-rules";

const redirect = (host: string, pathname: string, extra: { search?: string; method?: string } = {}) =>
  marketingRedirectTarget({ host, pathname, ...extra });

test("host normalleştirme", () => {
  assert.equal(normalizeHost("App.Arvo-OS.com:443"), "app.arvo-os.com");
  assert.equal(normalizeHost("arvo-os.com."), "arvo-os.com");
  assert.equal(normalizeHost("a.com, b.com"), "a.com");
  assert.equal(normalizeHost(null), "");
});

test("başlıklarda x-forwarded-host önceliklidir", () => {
  const headers = new Map([["x-forwarded-host", "Arvo-OS.com"], ["host", "internal:3000"]]);
  assert.equal(hostFromHeaders({ get: (name) => headers.get(name) ?? null }), "arvo-os.com");
});

test("pazarlama ve yerel host tanımı", () => {
  assert.ok(isMarketingHost("arvo-os.com"));
  assert.ok(isMarketingHost("www.arvo-os.com"));
  assert.ok(!isMarketingHost("app.arvo-os.com"));
  assert.ok(isLocalDevHost("localhost"));
  assert.ok(isLocalDevHost("app.localhost"));
  assert.ok(isDevOrPreviewHost("arvoos-abc123.vercel.app"));
  assert.ok(!isDevOrPreviewHost("app.akademikmerkez.com"));
});

test("pazarlama sayfası kurum alan adından kanonik adrese taşınır", () => {
  assert.equal(
    redirect("app.akademikmerkez.com", "/urunler/arvoos"),
    "https://arvo-os.com/urunler/arvoos",
  );
  assert.equal(
    redirect("app.arvo-os.com", "/urunler/arvoos", { search: "?a=1" }),
    "https://arvo-os.com/urunler/arvoos?a=1",
  );
  // İngilizce yollar da aynı kurala tabidir.
  assert.equal(redirect("app.arvo-os.com", "/en/about"), "https://arvo-os.com/en/about");
});

test("kök yol yönlendirilmez: panel hostunda giriş akışıdır", () => {
  assert.equal(redirect("app.arvo-os.com", "/"), null);
  // Tanınmayan yol da pazarlama sayfası değildir.
  assert.equal(redirect("app.arvo-os.com", "/bilinmeyen"), null);
});

test("kanonik host, yerel ve önizleme dokunulmaz", () => {
  assert.equal(redirect("arvo-os.com", "/hizmetler"), null);
  assert.equal(redirect("localhost", "/hizmetler"), null);
  assert.equal(redirect("arvoos-abc123.vercel.app", "/hizmetler"), null);
  assert.equal(redirect("", "/hizmetler"), null);
});

test("server action POST'ları başka origin'e taşınmaz", () => {
  assert.equal(redirect("app.arvo-os.com", "/hizmetler", { method: "POST" }), null);
  assert.equal(redirect("app.arvo-os.com", "/hizmetler", { method: "head" }), "https://arvo-os.com/hizmetler");
});

test("pazarlama sayfası olmayan yollar yönlendirilmez", () => {
  for (const path of ["/panel/crm", "/login", "/api/paytr/callback", "/takip/ABC123"]) {
    assert.equal(redirect("app.arvo-os.com", path), null, path);
  }
});

test("robots: panel ve müşteri belgeleri hiçbir hostta dizine girmez", () => {
  const disallowHepsi = robotsFor("app.arvo-os.com").rules.every((rule) => rule.disallow === "/");
  assert.ok(disallowHepsi, "pazarlama dışı host tamamen kapalı");

  const marketing = robotsFor("arvo-os.com");
  assert.ok(marketing.sitemap);
  // Belirli bir user-agent grubu "*" grubunu ezdiği için özel yollar her
  // kuralda tekrarlanmalı.
  for (const rule of marketing.rules) {
    assert.deepEqual(rule.disallow, [...PRIVATE_PATH_PREFIXES], String(rule.userAgent));
  }
});

test("llms.txt yalnızca pazarlama hostunda ve yerelde", () => {
  assert.ok(servesSiteFiles("arvo-os.com"));
  assert.ok(servesSiteFiles("localhost"));
  assert.ok(!servesSiteFiles("app.arvo-os.com"));
  assert.ok(!servesSiteFiles("app.akademikmerkez.com"));
});
