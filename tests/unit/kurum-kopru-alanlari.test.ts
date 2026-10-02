/*
  ARVOOS'A SÜTUN EKLEMEK KÖPRÜYÜ SESSİZCE KIRMASIN.

  Köprü kurumları `select("*")` ile okuyordu: ArvoOS'un organizations
  tablosuna eklenen her sütun hedefe de gidiyordu. revision_days
  eklendiği an ArvoRandevu ve ArvoARC eşitlemesi tamamen durdu
  ("Could not find the 'revision_days' column") ve bu bir gün boyunca
  yalnızca sunucu günlüğünde kaldı — kimse fark etmedi.

  Asıl kusur sütunun kendisi değil, HATANIN SESSİZ OLMASIYDI. Bu test onu
  sesli yapıyor: organizations'a yeni bir sütun eklendiğinde, taşınacak
  mı yoksa ArvoOS'a mı özel olduğu söylenene kadar test kırmızı kalır.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ARVOOS_OZEL_KURUM_ALANLARI,
  KURUM_KOPRU_ALANLARI,
  KURUM_KOPRU_SECIMI,
} from "../../lib/kurum-kopru-alanlari";

/** Canlı şemadaki organizations sütunları. */
function semaSutunlari(): string[] {
  const sema = fs.readFileSync(
    path.join(process.cwd(), "supabase/schema/canli-sema.sql"),
    "utf8",
  );
  const blok = sema.match(/create table if not exists public\.organizations \(([\s\S]*?)\n\);/);
  assert.ok(blok, "organizations tablosu şemada bulunamadı");
  return blok[1]
    .split("\n")
    .map((satir) => satir.match(/^\s+([a-z_]+)\s/)?.[1])
    .filter((ad): ad is string => Boolean(ad));
}

describe("kurum köprüsü alanları", () => {
  test("şemadaki her sütun ya taşınır ya ArvoOS'a özeldir", () => {
    const bilinen = new Set([...KURUM_KOPRU_ALANLARI, ...ARVOOS_OZEL_KURUM_ALANLARI]);
    const siniflandirilmamis = semaSutunlari().filter((s) => !bilinen.has(s));
    assert.deepEqual(
      siniflandirilmamis,
      [],
      `organizations'a yeni sütun eklenmiş: ${siniflandirilmamis.join(", ")} — ` +
        "lib/kurum-kopru-alanlari.ts içinde ya KURUM_KOPRU_ALANLARI'na ya da " +
        "ARVOOS_OZEL_KURUM_ALANLARI'na ekleyin.",
    );
  });

  test("taşınan her alan şemada gerçekten var", () => {
    // Olmayan sütunu select etmek sorgunun tamamını düşürür.
    const sema = new Set(semaSutunlari());
    const olmayan = KURUM_KOPRU_ALANLARI.filter((a) => !sema.has(a));
    assert.deepEqual(olmayan, [], `şemada olmayan alan taşınıyor: ${olmayan.join(", ")}`);
  });

  test("iki liste çakışmıyor", () => {
    const ozel = new Set(ARVOOS_OZEL_KURUM_ALANLARI);
    const cakisan = KURUM_KOPRU_ALANLARI.filter((a) => ozel.has(a));
    assert.deepEqual(cakisan, [], `hem taşınıyor hem özel: ${cakisan.join(", ")}`);
  });

  test("hedefte olmayan alanlar bilerek dışarıda", () => {
    // Hatanın sebebi buydu; geri sızarsa eşitleme yine durur.
    for (const alan of ["revision_days", "tracking_show_phases"]) {
      assert.equal(KURUM_KOPRU_ALANLARI.includes(alan), false, `${alan} karşıya gitmemeli`);
    }
  });

  test("seçim dizgesi ile liste aynı şey", () => {
    assert.deepEqual(KURUM_KOPRU_SECIMI.split(","), KURUM_KOPRU_ALANLARI);
    assert.ok(KURUM_KOPRU_ALANLARI.includes("id"), "upsert onConflict:id'ye dayanıyor");
  });

  test("köprüler yıldız seçimi kullanmıyor", () => {
    for (const dosya of ["lib/randevu-bridge.ts", "lib/arc-bridge.ts"]) {
      const kaynak = fs.readFileSync(path.join(process.cwd(), dosya), "utf8");
      assert.doesNotMatch(
        kaynak,
        /from\("organizations"\)\.select\("\*"\)/,
        `${dosya} hâlâ select("*") ile kurum okuyor`,
      );
      assert.match(kaynak, /from\("organizations"\)\.select\(KURUM_KOPRU_SECIMI\)/);
    }
  });
});
