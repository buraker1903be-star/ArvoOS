import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

/*
  Denetimin KENDİSİNİN sınanması.

  Denetim sessizce kör kaldığında, denetlediği hatadan farksız olur: yeşil
  bir çıktı "sorun yok" diye okunur. 26.09.2026'da denetim ArvoLab'a
  taşınırken iki desen elle denenip ikisinin de kaçtığı görüldü —
  `(data ?? []).filter()` (Supabase'in EN yaygın yazımı) ve süslü
  parantezsiz döngü gövdesi. İkisi de BU depodaki özgün sürümde kaçıyordu;
  düzeltme iki depoya birden yazıldı.

  Örnek ağaç: tests/fixtures/rakamlar (tsconfig ve eslint dışarıda bırakır).
*/
function denetim(): { cikis: number; ciktı: string } {
  try {
    const ciktı = execFileSync("node", ["scripts/check-rakamlar.mjs", "tests/fixtures/rakamlar"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { cikis: 0, ciktı };
  } catch (sorun) {
    const hata = sorun as { status?: number; stdout?: string; stderr?: string };
    return { cikis: hata.status ?? -1, ciktı: `${hata.stdout ?? ""}${hata.stderr ?? ""}` };
  }
}

test("rakam denetimi bilinen tuzakları yakalıyor", async (t) => {
  const { cikis, ciktı } = denetim();

  await t.test("sorun bulununca hata koduyla çıkıyor", () => {
    assert.equal(cikis, 1, "CI'da yeşil geçmemeli");
  });

  await t.test("dört tuzağın dördünü de buluyor, fazlasını değil", () => {
    assert.match(ciktı, /4 sorun/);
    // `s` (dotAll) bayrağı yerine [\s\S]: tsconfig hedefi ES2017.
    assert.match(ciktı, /ornekler\.ts:12[\s\S]*?reduce/, "sınırlı sorgudan toplam");
    assert.match(ciktı, /ornekler\.ts:20[\s\S]*?döngüde sayı biriktiriliyor/, "parantezsiz döngü gövdesi");
    assert.match(ciktı, /ornekler\.ts:28[\s\S]*?filter/, "(data ?? []).filter().length");
    assert.match(ciktı, /ornekler\.ts:35[\s\S]*?filter/, "as T[] sarmalayıcısıyla filter().length");
  });

  await t.test("meşru kullanımlarda yanlış alarm vermiyor", () => {
    /*
      Sırasıyla: sınırsız sorgudan sayım (aynı "data" adıyla — ad takibi
      konumla yapılmazsa burası patlar), yalnızca gösterim için kullanılan
      sınırlı liste, ve gerekçesi yazılmış bilinçli kullanım.
    */
    for (const satir of [42, 49, 57]) {
      assert.doesNotMatch(ciktı, new RegExp(`ornekler\\.ts:${satir}`), `satır ${satir} suçlanmamalı`);
    }
  });
});
