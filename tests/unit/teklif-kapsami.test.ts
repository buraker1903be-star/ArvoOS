import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kapsamHatasi, teklifKapsamiVarsayilani } from "@/lib/teklif-kapsami";

/*
  OS-01 (09.11.2026): talebin iç notu ("Ek not") teklifin müşteriye
  gidecek "Hizmet kapsamı" kutusunda hazır geliyordu. Varsayılan artık
  yalnızca talepteki müşteri kapsamı (request_details.scope).
*/
const IC_NOT = "Yalnızca kullanıcı deneyimi incelemesi için sentetik kayıt. Dış iletişim gönderilmeyecek. [OS01-IC-NOT]";

describe("teklif kapsamı varsayılanı", () => {
  test("iç not dolu, müşteri kapsamı boş → kapsam boş açılır", () => {
    // Talebin notu request_details'te değil crm_opportunities.notes'ta; işlev ona hiç bakmıyor.
    const talep = { notes: IC_NOT, title: "Tez danışmanlığı", request_details: { service_type: "Tez" } };
    const kapsam = teklifKapsamiVarsayilani(talep.request_details);
    assert.equal(kapsam, "");
    assert.ok(!kapsam.includes("OS01-IC-NOT"));
  });

  test("iki alan da dolu → yalnızca müşteri kapsamı aktarılır", () => {
    const kapsam = teklifKapsamiVarsayilani({ scope: "  Üç bölüm literatür taraması ve analiz raporu  ", notes: IC_NOT });
    assert.equal(kapsam, "Üç bölüm literatür taraması ve analiz raporu");
    assert.ok(!kapsam.includes("OS01-IC-NOT"));
  });

  test("ayrıntı yok, bozuk ya da kapsam metin değil → boş", () => {
    for (const ayrinti of [null, undefined, "metin", 42, [], {}, { scope: null }, { scope: 7 }, { scope: "   " }]) {
      assert.equal(teklifKapsamiVarsayilani(ayrinti), "");
    }
  });
});

describe("sunucu kapsam denetimi", () => {
  test("her iki alan boş → kapsam zorunlu, kullanıcıya ne yazacağı söylenir", () => {
    const hata = kapsamHatasi(teklifKapsamiVarsayilani({}));
    assert.ok(hata);
    assert.match(hata, /Hizmet kapsamını yazın/);
    assert.match(hata, /iç notlar buraya aktarılmaz/);
    assert.match(kapsamHatasi("", "Sözleşme") ?? "", /sözleşme belgesinde/);
  });

  test("yalnızca boşluk ve tek harf yetmez; iki harf ve üstü geçer", () => {
    assert.ok(kapsamHatasi("   "));
    assert.ok(kapsamHatasi("a"));
    assert.equal(kapsamHatasi("ab"), null);
    assert.equal(kapsamHatasi("Analiz raporu"), null);
  });
});

describe("talep sayfası iç notu kapsam yerine koymuyor", () => {
  /* Eski kalıp `scope={d.scope || item.notes || item.title}` iki yerdeydi;
     biri düzeltilip öteki unutulursa bu test düşer. */
  const kaynak = readFileSync("app/panel/crm/requests/[id]/page.tsx", "utf8");

  test("teklif ve direkt sözleşme formu varsayılanı ortak işlevden", () => {
    const kapsamlar = [...kaynak.matchAll(/\bscope=\{([^}]*)\}/g)].map((eslesme) => eslesme[1]);
    assert.ok(kapsamlar.length >= 2, "iki form çağrısı bulunmalı");
    for (const ifade of kapsamlar) {
      assert.ok(!/notes|title/.test(ifade), `kapsam varsayılanında iç not ya da konu var: ${ifade}`);
      assert.match(ifade, /teklifKapsamiVarsayilani\(/);
    }
  });
});
