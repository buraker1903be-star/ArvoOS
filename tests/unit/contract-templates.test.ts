import assert from "node:assert/strict";
import test from "node:test";
import {
  akademikMerkezTemplate,
  arvoOSGeneralTemplate,
  contractTemplateByKey,
  getContractTemplate,
} from "@/lib/contract-templates";

/*
  Şablon seçimi müşteriye İMZAYA giden metni belirliyor. Yanlış seçim,
  akademik etik maddelerinin (vekâleten tez yazmama, intihal, yapay zekâ
  kullanımı, yayın garantisi verilmemesi) sessizce düşmesi demek.
*/

test("slug büyük/küçük harften bağımsız eşleşiyor", () => {
  for (const slug of ["akademikmerkez", "AkademikMerkez", "AKADEMIKMERKEZ", "Akademik-Merkez", "akademik merkez"]) {
    assert.equal(getContractTemplate(slug).key, "akademikmerkez_academic", slug);
  }
});

test("Türkçe I harfi ailesi ASCII yazımı bozmuyor", () => {
  /*
    Gerileme: toLocaleLowerCase("tr-TR") ASCII "I"yı noktasız "ı" yapıyor ve
    sonraki [^a-z0-9] süzgeci onu atıyordu. "AKADEMIKMERKEZ" eşleşmiyor,
    "AKADEMİKMERKEZ" eşleşiyordu — İngilizce yazım çöküyor, Türkçe yazım
    çalışıyordu. Üstelik imza fonksiyonu aynı kuralı düz lower() ile
    uyguluyor ve DOĞRU anahtarı kaydediyordu: iki kopya kural ayrışmıştı.
  */
  assert.equal(getContractTemplate("AKADEMIKMERKEZ").key, "akademikmerkez_academic");
  assert.equal(getContractTemplate("AKADEMİKMERKEZ").key, "akademikmerkez_academic");
});

test("eşleşmeyen kurum genel sözleşmeyi alır", () => {
  for (const slug of ["arvo", "baska-kurum", "", null, undefined]) {
    assert.equal(getContractTemplate(slug).key, "arvoos_general", String(slug));
  }
});

test("kayıtlı anahtar şablonu getiriyor", () => {
  assert.equal(contractTemplateByKey("akademikmerkez_academic"), akademikMerkezTemplate);
  assert.equal(contractTemplateByKey("arvoos_general"), arvoOSGeneralTemplate);
});

test("tanınmayan anahtar null: uydurma şablon çizilmesin", () => {
  assert.equal(contractTemplateByKey("silinmis_sablon"), null);
  assert.equal(contractTemplateByKey(null), null);
  assert.equal(contractTemplateByKey(""), null);
});

test("her şablonda ortak hukuki maddeler var", () => {
  const zorunlu = [
    "Gizlilik",
    "Kişisel Verilerin Korunması",
    "Tüketici İşlemleri ve Mesafeli Sözleşmeler",
    "Elektronik Onay, Kayıtlar ve Delil Niteliği",
    "Uygulanacak Hukuk ve Uyuşmazlıkların Çözümü",
  ];
  for (const sablon of [arvoOSGeneralTemplate, akademikMerkezTemplate]) {
    const basliklar = sablon.clauses.map((madde) => madde.title);
    for (const baslik of zorunlu) {
      assert.ok(basliklar.includes(baslik), `${sablon.key} içinde "${baslik}" yok`);
    }
  }
});

test("akademik şablon kendi maddelerini taşıyor", () => {
  const basliklar = akademikMerkezTemplate.clauses.map((madde) => madde.title);
  // Bu maddeler akademik hizmetin sınırını çiziyor; genel şablonda yok.
  assert.ok(basliklar.some((b) => b.includes("Akademik Etik")));
  assert.ok(basliklar.some((b) => b.includes("Yayın, Kabul ve Sonuç Garantisi")));
  assert.ok(basliklar.some((b) => b.includes("İntihal")));
  const genel = arvoOSGeneralTemplate.clauses.map((madde) => madde.title);
  assert.ok(!genel.some((b) => b.includes("İntihal")), "genel şablonda akademik madde olmamalı");
});

test("hiçbir madde boş paragrafla gitmiyor", () => {
  for (const sablon of [arvoOSGeneralTemplate, akademikMerkezTemplate]) {
    for (const madde of sablon.clauses) {
      assert.ok(madde.title.trim().length > 0, `${sablon.key}: başlıksız madde`);
      assert.ok(madde.paragraphs.length > 0, `${sablon.key}: "${madde.title}" paragrafsız`);
      for (const p of madde.paragraphs) {
        assert.ok(p.trim().length > 20, `${sablon.key}: "${madde.title}" içinde çok kısa paragraf`);
      }
    }
  }
});

test("madde başlıkları şablon içinde tekrar etmiyor", () => {
  /* Ortak maddeler yayılarak ekleniyor; bir başlığın iki kez girmesi
     belgede aynı maddenin iki kez çıkması demek. */
  for (const sablon of [arvoOSGeneralTemplate, akademikMerkezTemplate]) {
    const basliklar = sablon.clauses.map((madde) => madde.title);
    assert.equal(new Set(basliklar).size, basliklar.length, `${sablon.key}: yinelenen madde başlığı`);
  }
});
