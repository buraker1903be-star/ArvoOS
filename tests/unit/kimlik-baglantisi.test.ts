import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dogrudanBaglanti } from "../../lib/kimlik-baglantisi.ts";

const ORNEKLER: [string | null, string | null, string, string | null][] = [
  // Davet: doğrudan uygulamaya, next korunuyor.
  ["https://app.arvo-os.com/auth/callback?next=/panel", "abc123", "invite",
    "https://app.arvo-os.com/auth/callback?next=%2Fpanel&token_hash=abc123&type=invite"],
  // Yenileme: tur=yenile korunuyor.
  ["https://app.akademikmerkez.com/auth/callback?next=/panel&tur=yenile", "pkce_x", "recovery",
    "https://app.akademikmerkez.com/auth/callback?next=%2Fpanel&tur=yenile&token_hash=pkce_x&type=recovery"],
  // E-posta değişikliği iki jeton istiyor: Supabase'in adresine geri düşer.
  ["https://app.arvo-os.com/auth/callback?next=/panel", "abc", "email_change", null],
  // Başka bir yol ya da http: doğrudan bağlantı kurulmaz.
  ["https://app.arvo-os.com/panel", "abc", "invite", null],
  ["http://app.arvo-os.com/auth/callback", "abc", "invite", null],
  [null, "abc", "invite", null],
  ["https://app.arvo-os.com/auth/callback", null, "invite", null],
];

test("e-postadaki bağlantı doğrudan uygulamanın callback'ine gider", () => {
  for (const [redirectTo, hash, tur, beklenen] of ORNEKLER) {
    assert.equal(dogrudanBaglanti(redirectTo, hash, tur), beklenen, `${tur} ${redirectTo}`);
  }
});

test("kancadaki kopya aynı kuralı taşıyor (Deno ile kod paylaşılmıyor)", () => {
  const kanca = fs.readFileSync(new URL("../../supabase/functions/send-auth-email/index.ts", import.meta.url), "utf8");
  for (const parca of ['"invite", "recovery", "magiclink", "signup", "email"', 'hedef.pathname !== "/auth/callback"', 'hedef.protocol !== "https:"']) {
    assert.ok(kanca.includes(parca), `kancada yok: ${parca}`);
  }
});
