import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { kisaOnbellek } from "@/lib/kisa-onbellek";

describe("kısa önbellek", () => {
  test("aynı anahtar süre dolmadan bir kez getirilir", async () => {
    let sayi = 0;
    const getir = async () => { sayi += 1; return "kurum-1"; };
    assert.equal(await kisaOnbellek("test-a", "ornek.com", getir), "kurum-1");
    assert.equal(await kisaOnbellek("test-a", "ornek.com", getir), "kurum-1");
    assert.equal(sayi, 1);
  });

  test("saklanamaz sonuç (hata/boş) tekrar denenir", async () => {
    let sayi = 0;
    const getir = async () => { sayi += 1; return null as string | null; };
    await kisaOnbellek("test-b", "x.com", getir, (d) => d !== null);
    await kisaOnbellek("test-b", "x.com", getir, (d) => d !== null);
    assert.equal(sayi, 2);
  });

  test("kutular birbirine karışmaz", async () => {
    assert.equal(await kisaOnbellek("test-c1", "k", async () => 1), 1);
    assert.equal(await kisaOnbellek("test-c2", "k", async () => 2), 2);
  });
});
