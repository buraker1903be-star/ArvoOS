import assert from "node:assert/strict";
import test from "node:test";
import { planRandevuSync, randevuOrganizationIds, type RandevuSource } from "@/lib/randevu-bridge-plan";

const SALON = "org-salon", ASKIDA = "org-askida", ARC = "org-arc";

const source: RandevuSource = {
  organizations: [SALON, ASKIDA, ARC].map((id) => ({ id, name: id })),
  licenses: [
    { organization_id: SALON, product: "randevu", status: "trialing" },
    { organization_id: SALON, product: "arc", status: "active" },
    { organization_id: ASKIDA, product: "randevu", status: "suspended" },
    { organization_id: ARC, product: "arc", status: "active" },
  ],
  memberships: [
    { organization_id: SALON, user_id: "u1", role: "owner", is_active: true },
    { organization_id: SALON, user_id: "u2", role: "member", is_active: false },
    { organization_id: ASKIDA, user_id: "u1", role: "admin", is_active: true },
    { organization_id: ARC, user_id: "u3", role: "owner", is_active: true },
  ],
};

test("kapsam: randevu lisansı olan her kurum, askıdaki dahil; yalnız ARC lisansı olan hariç", () => {
  assert.deepEqual(randevuOrganizationIds(source.licenses), [ASKIDA, SALON]);
});

test("plan yalnızca randevu lisansını taşır (hedef tablo başka ürünü kabul etmez)", () => {
  const plan = planRandevuSync(source, []);
  assert.deepEqual(plan.licenses.map((l) => `${l.organization_id}:${l.product}`).sort(), [`${ASKIDA}:randevu`, `${SALON}:randevu`]);
  assert.deepEqual(plan.organizations.map((o) => o.id).sort(), [ASKIDA, SALON]);
  assert.ok(!plan.memberships.some((m) => m.organization_id === ARC));
});

test("pasif üye de aktarılır; kullanıcı bir kez", () => {
  const plan = planRandevuSync(source, []);
  assert.equal(plan.memberships.length, 3);
  assert.deepEqual(plan.userIds, ["u1", "u2"]);
});

test("ArvoOS'tan kalkan üyelik Randevu'da pasife alınır; kapsam dışı kuruma dokunulmaz", () => {
  const plan = planRandevuSync(source, [
    { organization_id: SALON, user_id: "u1" },
    { organization_id: SALON, user_id: "eski" },
    { organization_id: "org-baska", user_id: "x" },
  ]);
  assert.deepEqual(plan.deactivate, [{ organization_id: SALON, user_id: "eski" }]);
});
