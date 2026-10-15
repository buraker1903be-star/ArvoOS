import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { supabaseAyarlari } from "@/lib/supabase/yapilandirma";

const ADRES = "NEXT_PUBLIC_SUPABASE_URL";
const ANAHTAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const onceki = { adres: process.env[ADRES], anahtar: process.env[ANAHTAR] };

function ayarla(adres: string | undefined, anahtar: string | undefined) {
  if (adres === undefined) delete process.env[ADRES]; else process.env[ADRES] = adres;
  if (anahtar === undefined) delete process.env[ANAHTAR]; else process.env[ANAHTAR] = anahtar;
}

afterEach(() => ayarla(onceki.adres, onceki.anahtar));

/*
  15.10.2026'da yerelde `npm run dev` çalıştırıldığında site tümden
  kapalıydı: ara katman anahtarları `!` ile okuyup createServerClient'a
  veriyor, o da fırlatıyor ve eşleşen HER yol 500 dönüyordu — pazarlama
  sayfaları ve /login dahil. Karar artık tek bir işlevde; bu test onun
  "yarım yapılandırmayı ayarlı sayma" davranışını sabitliyor.
*/
describe("supabaseAyarlari", () => {
  it("ikisi de varsa değerleri verir", () => {
    ayarla("https://ornek.supabase.co", "anahtar");
    assert.deepEqual(supabaseAyarlari(), { adres: "https://ornek.supabase.co", anahtar: "anahtar" });
  });

  it("ikisi de yoksa null", () => {
    ayarla(undefined, undefined);
    assert.equal(supabaseAyarlari(), null);
  });

  // Yarım yapılandırma en sinsi hâli: "adres var" diye ayarlı sayılırsa
  // istemci yine anahtarsız kurulur ve aynı fırlatma geri gelir.
  it("yalnızca adres varsa null", () => {
    ayarla("https://ornek.supabase.co", undefined);
    assert.equal(supabaseAyarlari(), null);
  });

  it("yalnızca anahtar varsa null", () => {
    ayarla(undefined, "anahtar");
    assert.equal(supabaseAyarlari(), null);
  });

  // Boş dize ortam değişkenlerinde sık: tanımlı ama kullanılamaz.
  it("boş dize ayarlı sayılmaz", () => {
    ayarla("", "");
    assert.equal(supabaseAyarlari(), null);
  });
});
