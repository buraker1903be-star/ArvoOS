/*
  Ortak form alanının hata metinleri (lib/form-hatalari.ts) ve Yeni talep
  formunun gönderim kararları (kaynak düzeyinde).

  Hata (10.11.2026): form `action={createOpportunity}` ile gönderiliyordu;
  sunucu hatası fırlatılmadığı için React formu sıfırlıyor, kullanıcının
  yazdığı her şey kayboluyordu. Düğmede bekleme kilidi de yoktu.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { alanHatasi, hataOzeti, sunucuHatasiAlani } from "@/lib/form-hatalari";

test("eksik, kısa ve biçimsiz alan için ne yapılacağını söyleyen metin", () => {
  assert.equal(alanHatasi({ valueMissing: true }, { etiket: "Talep konusu" }), "Talep konusu boş bırakılamaz.");
  assert.equal(alanHatasi({ valueMissing: true }, { etiket: "Hizmet türü", secim: true }), "Hizmet türü seçin.");
  assert.equal(alanHatasi({ tooShort: true }, { etiket: "Müşteri / kurum", minLength: 2 }), "Müşteri / kurum en az 2 karakter olmalı.");
  assert.match(alanHatasi({ typeMismatch: true }, { etiket: "E-posta", tur: "email" }) ?? "", /e-posta adresi/);
  assert.equal(alanHatasi({}, { etiket: "X" }), null);
});

test("sunucunun doğrulama mesajı ilgili alana düşer; tanınmayan mesaj alansız kalır", () => {
  // createOpportunity__impl'in bugünkü cümleleri (app/panel/crm/actions.ts).
  const kaynak = fs.readFileSync(path.join(process.cwd(), "app/panel/crm/actions.ts"), "utf8");
  for (const [mesaj, alan] of [
    ["Talep konusu en az 2 karakter olmalıdır.", "title"],
    ["Müşteri veya kurum adı en az 2 karakter olmalıdır.", "customer_name"],
    ["Diğer hizmet türünü yazmalısınız.", "other_service_type"],
  ] as const) {
    assert.ok(kaynak.includes(mesaj), `sunucu mesajı değişmiş: ${mesaj}`);
    assert.equal(sunucuHatasiAlani(mesaj), alan);
  }
  assert.equal(sunucuHatasiAlani("Hesabınız aktif bir satış personeli kaydıyla eşleşmiyor."), null);
});

test("özet satırı", () => {
  assert.equal(hataOzeti(1), "1 alanı kontrol edin.");
  assert.equal(hataOzeti(3), "3 alanı kontrol edin.");
});

test("Yeni talep formu: sonucu bilen işlemle elle gönderilir, düğme gerçek bekleme durumunu kullanır", () => {
  const form = fs.readFileSync(path.join(process.cwd(), "app/panel/crm/request-entry-form.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(form, /action=\{createOpportunity\}/, "eski gönderim: hata olunca React formu sıfırlıyor");
  assert.match(form, /useActionState\(talepOlusturDurumlu/);
  assert.match(form, /<GonderDugmesi bekliyor=\{bekliyor\}/);
  // İç not müşteriye gitmez açıklaması korunuyor (OS-01).
  assert.match(form, /Yalnızca ekip görür; teklife, sözleşmeye ve müşteri sayfasına aktarılmaz\./);
  // Form yalnızca sunucu "tamam" dediğinde sıfırlanır.
  assert.match(form, /if \(sonuc\.tamam\) \{[\s\S]*?form\?\.reset\(\)/);
});
