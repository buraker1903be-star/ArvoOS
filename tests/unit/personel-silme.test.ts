import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
  PERSONEL SİLME ENGELİ = KASKAT YÜZEYİ (AGENTS.md "Silme engeli, kaskat
  yüzeyi kadar geniş olmalı").

  hr_employees'a yabancı anahtarla bağlanan her tablo, personelSil'in
  engel listesinde olmalı. Yeni bir tablo personele bağlandığında bu test
  kırmızıya döner: engel güncellenmezse silme o tablonun satırlarını
  sessizce götürür (CASCADE) ya da sahipsiz bırakır (SET NULL).

  Engel sayılmayan iki bağ bilerek dışarıda: oran geçmişi
  (hr_employee_commission_rates) personel eklenirken kendiliğinden
  yazılıyor, kaydın parçası; hr_employees.manager_employee_id ise
  yalnızca "yöneticisi" bağı, silinince boşalması doğru.
*/

const kok = path.resolve(import.meta.dirname, "../..");
const sema = fs.readFileSync(path.join(kok, "supabase/schema/canli-sema.sql"), "utf8");
const islem = fs.readFileSync(path.join(kok, "app/panel/hr/actions.ts"), "utf8");
const BILEREK_DISARIDA = new Set(["hr_employee_commission_rates.employee_id", "hr_employees.manager_employee_id"]);

test("personele bağlanan her tablo silme engelinde", () => {
  const baglar = [...sema.matchAll(/alter table public\.(\w+) add constraint \w+ FOREIGN KEY \((\w+)\) REFERENCES hr_employees\(id\)/g)]
    .map(([, tablo, sutun]) => `${tablo}.${sutun}`)
    .filter((bag) => !BILEREK_DISARIDA.has(bag));
  assert.ok(baglar.length >= 10, "şema dökümünden bağlar okunamadı");
  const govde = islem.slice(islem.indexOf("async function personelSil__impl"));
  for (const bag of baglar) {
    const [tablo, sutun] = bag.split(".");
    assert.match(govde, new RegExp(`say\\("${tablo}", "${sutun}"`), `silme engeli ${bag} bağını denetlemiyor`);
  }
});

test("panel hesabı olan personel silinmiyor; RLS'in elediği silme sessiz kalmıyor", () => {
  const govde = islem.slice(islem.indexOf("async function personelSil__impl"));
  assert.match(govde, /if \(personel\.user_id\) throw/);
  assert.match(govde, /if \(!silinen\?\.length\) throw/);
  // Engel sorgusunun hatası yutulmuyor.
  assert.match(govde, /if \(sonuc\.error\) throw/);
});
