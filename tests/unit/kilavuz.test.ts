import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { aramaMetni, KILAVUZ, kilavuzBolumleri } from "@/lib/kilavuz";
import { navigationGroups } from "@/app/panel/panel-navigation-config";
import { YETKI_GRUPLARI } from "@/lib/yetkiler";

/*
  KULLANIM KILAVUZU (lib/kilavuz.ts). Kılavuz yanlış bir şey söylediğinde
  kimse fark etmiyor: kullanıcı yalnızca "dediği düğme yok" diye vazgeçiyor.
  Koddan denetlenebilen kısmı burada sabitleniyor:
   - her bağlantı gerçek bir sayfaya gidiyor (sayfa taşınınca test düşer);
   - her uygulama anahtarı dock'un gerçek bir uygulaması;
   - her yetki anahtarı katalogda var (adı değişince konu sessizce
     herkesten gizlenirdi);
   - kişi görmediği uygulamanın bölümünü okumuyor.
*/

const KOK = join(import.meta.dirname, "..", "..");

/** "/panel/hr/maaslar?ay=…" → app/panel/hr/maaslar/page.tsx var mı; [id] gibi dinamik klasörler de eşleşir. */
function sayfaVar(href: string): boolean {
  const parcalar = href.split(/[?#]/)[0].split("/").filter(Boolean);
  let dizin = join(KOK, "app");
  for (const parca of parcalar) {
    const dogrudan = join(dizin, parca);
    if (existsSync(dogrudan)) { dizin = dogrudan; continue; }
    const dinamik = readdirSync(dizin).find((ad) => ad.startsWith("["));
    if (!dinamik) return false;
    dizin = join(dizin, dinamik);
  }
  return existsSync(join(dizin, "page.tsx"));
}

test("kılavuzdaki her bağlantı gerçek bir sayfaya gider", () => {
  for (const b of KILAVUZ) {
    for (const k of b.konular) {
      if (k.baglanti) assert.ok(sayfaVar(k.baglanti.href), `${b.id}/${k.id}: ${k.baglanti.href} sayfası yok`);
    }
  }
});

test("uygulama ve yetki anahtarları gerçek", () => {
  const uygulamalar = new Set([...navigationGroups.map((g) => g.key), "posta"]);
  const yetkiler = new Set(YETKI_GRUPLARI.flatMap((g) => g.yetkiler.map((y) => y.key)));
  for (const b of KILAVUZ) {
    if (b.uygulama) assert.ok(uygulamalar.has(b.uygulama), `${b.id}: bilinmeyen uygulama ${b.uygulama}`);
    for (const k of b.konular) {
      if (k.yetki) assert.ok(yetkiler.has(k.yetki), `${b.id}/${k.id}: katalogda olmayan yetki ${k.yetki}`);
    }
  }
});

test("kimlikler benzersiz ve her konunun bir içeriği var", () => {
  const bolumler = new Set<string>();
  for (const b of KILAVUZ) {
    assert.ok(!bolumler.has(b.id), `yinelenen bölüm ${b.id}`);
    bolumler.add(b.id);
    const konular = new Set<string>();
    for (const k of b.konular) {
      assert.ok(!konular.has(k.id), `${b.id}: yinelenen konu ${k.id}`);
      konular.add(k.id);
      assert.ok((k.metin?.length ?? 0) + (k.adimlar?.length ?? 0) > 0, `${b.id}/${k.id} boş`);
    }
  }
});

test("kişi yalnızca görebildiği uygulamaların bölümlerini okur", () => {
  const yalnizCrm = kilavuzBolumleri({ uygulamalar: new Set(["crm"]), yetkiler: new Set() });
  assert.ok(yalnizCrm.some((b) => b.uygulama === "crm"));
  assert.ok(yalnizCrm.every((b) => b.uygulama === null || b.uygulama === "crm"));
  // Genel bölümler (başlarken, ayarlar) herkese açık.
  assert.ok(yalnizCrm.some((b) => b.uygulama === null));
});

test("yetki isteyen konu yetkisi olmayana görünmez", () => {
  const ik = (yetkiler: string[]) => kilavuzBolumleri({ uygulamalar: new Set(["hr"]), yetkiler: new Set(yetkiler) })
    .flatMap((b) => b.konular.map((k) => k.id));
  assert.ok(!ik([]).includes("maaslar"));
  assert.ok(ik(["hr.maas.yonet"]).includes("maaslar"));
});

test("arama metni Türkçe harf duyarsız ve bölüm adını da taşır", () => {
  const b = KILAVUZ.find((x) => x.uygulama === "crm")!;
  const metin = aramaMetni(b, b.konular[0]);
  assert.equal(metin, metin.toLocaleLowerCase("tr"));
  assert.ok(!/[ışğüöçİ]/.test(metin));
  assert.ok(metin.includes("crm"));
});
