import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KURULUM_ISLEMI } from "@/app/panel/platform/bicim";

/*
  15.10.2026'da konsolun ana sayfasında bir satır "owner_accepted ·
  Kullanımda" diyordu: etiket haritası yerel, iki girişlikti ve üçüncü
  değeri tanımıyordu. Üç değer üç AYRI yerden yazılıyor (kenar
  fonksiyonu, sunucu işlemi, veritabanı tetikleyicisi), yani eksik
  kalması kolay. Bu test üçünü de sabitliyor.
*/
describe("KURULUM_ISLEMI", () => {
  // Yazan yerler: supabase/functions/provision-organization,
  // app/panel/platform/actions.ts, migration 20260802170500.
  const YAZILAN = ["provision_organization", "owner_access_link", "owner_accepted"];

  it("yazılan her işlemin Türkçe karşılığı var", () => {
    for (const kod of YAZILAN) {
      assert.ok(KURULUM_ISLEMI[kod], `${kod} için etiket yok`);
      assert.notEqual(KURULUM_ISLEMI[kod], kod, `${kod} ham kodun kendisiyle eşleşmiş`);
    }
  });

  // Ham kod ekrana düşmesin diye: etiketler alt çizgili kod gibi görünmemeli.
  it("etiketler kod değil, metin", () => {
    for (const etiket of Object.values(KURULUM_ISLEMI)) assert.doesNotMatch(etiket, /_/);
  });
});
