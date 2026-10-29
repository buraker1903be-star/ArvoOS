import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { EYLEM_ETIKETLERI, VARLIK_ETIKETLERI, eylemEtiketi, varlikEtiketi } from "../../lib/kayit-etiketleri";

/*
  ETİKETİ OLMAYAN KOD EKRANA HAM DÜŞÜYOR.

  İki ekran aynı olayı yazıyor (kiracı panelinin kayıt geçmişi,
  konsolun müşteri dosyası) ve iki ayrı listeden okuyorlardı. Listeler
  saptı: operasyonun yazdığı sekiz kod yalnızca birine eklenmişti ve
  konsolda kurucu "step_assign" okuyordu (30.10.2026, canlıda
  görüldü). Depoda aynı sınıf daha önce de yaşandı — record-history
  başlığındaki "waiting_party" notu.

  Bu test kaynağı TARIYOR: uygulamanın yazdığı her `action` değerinin
  karşılığı burada olmak zorunda. Listeye bakıp göz kararı
  denetlemek, sapmayı bir sonraki sefere bırakmaktı.
*/

const kok = resolve(import.meta.dirname, "../..");

function kaynaklar(dizin: string, biriken: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    if (ad === "node_modules" || ad === ".next" || ad.startsWith(".")) continue;
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) kaynaklar(yol, biriken);
    else if (yol.endsWith(".ts") || yol.endsWith(".tsx")) biriken.push(yol);
  }
  return biriken;
}

/** Kaynakta `action: "..."` olarak yazılan bütün eylem kodları. */
function yazilanEylemler(): Map<string, string> {
  const bulunan = new Map<string, string>();
  for (const yol of [...kaynaklar(join(kok, "app")), ...kaynaklar(join(kok, "lib"))]) {
    if (yol.endsWith("kayit-etiketleri.ts")) continue;
    const metin = readFileSync(yol, "utf8");
    for (const [, kod] of metin.matchAll(/action:\s*"([a-z_]+)"/g)) {
      if (!bulunan.has(kod)) bulunan.set(kod, yol.slice(kok.length + 1));
    }
  }
  return bulunan;
}

test("uygulamanın yazdığı her eylem kodunun etiketi var", () => {
  const eksikler: string[] = [];
  for (const [kod, yer] of yazilanEylemler()) {
    if (!EYLEM_ETIKETLERI[kod]) eksikler.push(`${kod} (${yer})`);
  }
  assert.deepEqual(eksikler, [], "etiketi olmayan kod ekranda ham görünür; lib/kayit-etiketleri'ye ekleyin");
});

/* İki ekranın dili farklı ama kümeleri aynı olmalı: biri eklenip
   öteki unutulduğunda o ekran ham kod gösterirdi. */
test("her eylemin iki dili de dolu", () => {
  for (const [kod, etiket] of Object.entries(EYLEM_ETIKETLERI)) {
    assert.ok(etiket.kisi.length > 2, `${kod}: kişi cümlesi eksik`);
    assert.ok(etiket.edilgen.length > 2, `${kod}: edilgen hâli eksik`);
  }
});

test("iki dil birbirinin kopyası değil", () => {
  /* "Aşamaya sorumlu atandı" cümlenin içinde, "bir aşamaya sorumlu
     atadı" sütun başlığının altında bozuk okunur. */
  assert.equal(eylemEtiketi("step_assign", "kisi"), "bir aşamaya sorumlu atadı");
  assert.equal(eylemEtiketi("step_assign", "edilgen"), "Aşamaya sorumlu atandı");
});

test("bilinmeyen kod uydurulmuyor, ham dönüyor", () => {
  assert.equal(eylemEtiketi("bilinmeyen_kod", "kisi"), "bilinmeyen_kod");
  assert.equal(varlikEtiketi("bilinmeyen_varlik"), "bilinmeyen_varlik");
});

test("varlık türleri etiketli", () => {
  for (const tur of ["crm_opportunity", "crm_proposal", "crm_contract", "operation_workflow"]) {
    assert.ok(VARLIK_ETIKETLERI[tur], tur);
  }
});
