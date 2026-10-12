import assert from "node:assert/strict";
import test from "node:test";
import { geriHedefi, kokSayfaMi, type OsUygulama } from "@/app/panel/os/os-apps";

/*
  Telefonda geri düğmesi (os-geri.tsx): kök sayfalarda yok, alt
  sayfalarda var; uygulama içi geçmiş yoksa en yakın bölüme döner.
*/

const uygulamalar: OsUygulama[] = [
  { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: ["/panel"] },
  {
    key: "crm", label: "CRM", href: "/panel/crm/genel-bakis", ikon: "crm", yollar: ["/panel/crm"],
    bolumler: [
      { key: "talepler", label: "Talepler", href: "/panel/crm" },
      { key: "teklifler", label: "Teklifler", href: "/panel/crm/proposals" },
    ],
  },
  { key: "finance", label: "Finans", href: "/panel/finance/genel-bakis", ikon: "finance", yollar: ["/panel/finance"], bolumler: [{ key: "cari", label: "Müşteriler", href: "/panel/finance" }] },
];

test("kök sayfalar: ana ekran, uygulama ve bölüm adresleri (sorgu ve sondaki / önemsiz)", () => {
  for (const y of ["/panel", "/panel/", "/panel/crm", "/panel/crm/genel-bakis", "/panel/crm/proposals?durum=sent", "/panel/finance/"]) {
    assert.equal(kokSayfaMi(uygulamalar, y), true, y);
  }
  for (const y of ["/panel/crm/requests/abc", "/panel/crm/proposals/abc", "/panel/finance/musteri/abc"]) {
    assert.equal(kokSayfaMi(uygulamalar, y), false, y);
  }
});

test("geri hedefi: en yakın bölüm; bölüm yoksa uygulamanın ana sayfası; hiçbiri yoksa ana ekran", () => {
  assert.equal(geriHedefi(uygulamalar, "/panel/crm/proposals/abc"), "/panel/crm/proposals");
  assert.equal(geriHedefi(uygulamalar, "/panel/crm/requests/abc"), "/panel/crm");
  assert.equal(geriHedefi(uygulamalar, "/panel/finance/musteri/abc"), "/panel/finance");
  assert.equal(geriHedefi(uygulamalar, "/panel/bilinmeyen/x"), "/panel");
});
