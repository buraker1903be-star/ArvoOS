import assert from "node:assert/strict";
import test from "node:test";
import type { DirectoryRow } from "@/lib/member-directory";
import { kisilereTopla } from "../../app/panel/platform/kullanicilar/kisiler.ts";

const satir = (s: Partial<DirectoryRow>): DirectoryRow => ({
  product: "arvoos", userId: "u", name: "Ayşe Yılmaz", email: "ayse@x.com", phone: null, title: null, scope: "Kurum A",
  role: "member", individual: false, access: true, status: "active", periodEnd: null, organizationId: "o1", membershipActive: true, ...s,
});

test("kişi e-postayla birleşir; adres kimliği ArvoOS hesabı, satırlar korunur", () => {
  const [kisi, ...kalan] = kisilereTopla([
    satir({ product: "arvolab", userId: "lab-1", email: "AYSE@x.com", organizationId: null, role: "expert" }),
    satir({ product: "arvoos", userId: "os-1" }),
    satir({ product: "arc", userId: "os-1" }),
  ]);
  assert.equal(kalan.length, 0, "üç ürün satırı tek kişi");
  assert.equal(kisi.kimlik, "os-1", "ArvoLab satırı önce gelse de adres ArvoOS kimliği");
  assert.equal(kisi.satirlar.length, 3);
});

test("yalnızca ArvoLab'daki kişinin adresi ArvoLab kimliği", () => {
  const [kisi] = kisilereTopla([satir({ product: "arvolab", userId: "lab-2", email: "b@x.com" })]);
  assert.equal(kisi.kimlik, "lab-2");
});

test("bir üründe bile girebilen aktif; hiçbirinde giremeyen pasif ve sebebi yazılı", () => {
  const [kisi] = kisilereTopla([
    satir({ userId: "os-3", email: "c@x.com", access: false, membershipActive: false }),
  ]);
  assert.equal(kisi.acik, false);
  assert.equal(kisi.sebep, "Kurum pasife aldı");
});
