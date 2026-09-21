import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { arsivdeMi } from "@/lib/whatsapp-arsiv";

const ARSIV = "2026-09-21T10:00:00.000Z";

describe("sohbet arşivde mi", () => {
  test("arşivlenmemiş sohbet arşivde değildir", () => {
    assert.equal(arsivdeMi(null, "2026-09-21T09:00:00.000Z"), false);
  });

  test("arşivden önceki mesajlar damgayı düşürmez", () => {
    assert.equal(arsivdeMi(ARSIV, "2026-09-21T09:59:59.000Z"), true);
  });

  test("arşivden sonra gelen mesaj sohbeti arşivden çıkarır", () => {
    // Müşteri yeniden yazmış; arşivde kalsaydı kimse görmeyecekti.
    assert.equal(arsivdeMi(ARSIV, "2026-09-21T10:00:01.000Z"), false);
  });

  test("tam aynı ana damgalanan sohbet arşivde kalır", () => {
    // Arşivleme anıyla son mesaj aynı olabilir: kullanıcı son mesajı
    // okuyup hemen arşivliyor. Bu mesaj "yeni" sayılmamalı.
    assert.equal(arsivdeMi(ARSIV, ARSIV), true);
  });

  test("mesajı olmayan sohbet damgalıysa arşivdedir", () => {
    assert.equal(arsivdeMi(ARSIV, null), true);
  });

  test("okunamayan zamanda sohbet listede kalır", () => {
    // Kaybolan sohbet, gereksiz görünen sohbetten çok daha kötü.
    assert.equal(arsivdeMi(ARSIV, "bozuk"), false);
    assert.equal(arsivdeMi("bozuk", ARSIV), false);
  });
});
