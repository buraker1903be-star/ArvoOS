import assert from "node:assert/strict";
import test from "node:test";
import { arcOrganizationIds, planArcSync, type ArcSource } from "@/lib/arc-bridge-plan";

const ARC = "org-arc", LEGACY = "org-legacy", LAB = "org-lab", OFF = "org-off";

const source: ArcSource = {
  organizations: [ARC, LEGACY, LAB, OFF].map((id) => ({ id, name: id })),
  modules: [
    { organization_id: LEGACY, module_code: "commerce", is_enabled: true },
    { organization_id: OFF, module_code: "commerce", is_enabled: false },
    { organization_id: ARC, module_code: "crm", is_enabled: true },
  ],
  licenses: [
    { organization_id: ARC, product: "arc", status: "active" },
    { organization_id: ARC, product: "arvolab", status: "active" },
    { organization_id: LAB, product: "arvolab", status: "active" },
  ],
  memberships: [
    { organization_id: ARC, user_id: "u1", role: "owner", is_active: true },
    { organization_id: ARC, user_id: "u2", role: "member", is_active: false },
    { organization_id: LEGACY, user_id: "u1", role: "admin", is_active: true },
    { organization_id: LAB, user_id: "u3", role: "owner", is_active: true },
  ],
};

test("ARC kurumu: ARC lisansı ya da açık ticaret modülü", () => {
  // ArvoLab lisansı ve kapalı ticaret modülü ARC'a taşımaz.
  assert.deepEqual(arcOrganizationIds(source), [ARC, LEGACY]);
});

test("askıya alınmış ya da iptal lisans da aktarılır: kademe ARC'ta uygulanır", () => {
  const ids = arcOrganizationIds({ modules: [], licenses: [{ organization_id: OFF, product: "arc", status: "canceled" }] });
  assert.deepEqual(ids, [OFF]);
});

test("plan yalnızca ARC kurumlarını ve ARC'ın okuduğu satırları taşır", () => {
  const plan = planArcSync(source, []);
  assert.deepEqual(plan.organizations.map((o) => o.id), [ARC, LEGACY]);
  assert.deepEqual(plan.licenses, [{ organization_id: ARC, product: "arc", status: "active" }]);
  assert.deepEqual(plan.modules, [{ organization_id: LEGACY, module_code: "commerce", is_enabled: true }]);
  assert.equal(plan.memberships.length, 3);
  assert.ok(!plan.memberships.some((m) => m.organization_id === LAB));
});

test("hesap her üye için bir kez açılır; pasif üye de (üyelik satırı hesaba bağlı)", () => {
  assert.deepEqual(planArcSync(source, []).userIds, ["u1", "u2"]);
});

test("ArvoOS'ta silinen üyelik ARC'ta pasife alınır; kapsam dışı kurumlara dokunulmaz", () => {
  const plan = planArcSync(source, [
    { organization_id: ARC, user_id: "u1" },
    { organization_id: ARC, user_id: "eski" },
    { organization_id: "baska-kurum", user_id: "x" },
  ]);
  assert.deepEqual(plan.deactivate, [{ organization_id: ARC, user_id: "eski" }]);
});

// --- Köprü modu (Standalone / Integrated)
{
  const lisans = (organization_id: string, integrated?: boolean) => ({
    organization_id, product: "arc", ...(integrated === undefined ? {} : { integrated }),
  });

  test("entegre lisans kapsamda", () => {
    assert.deepEqual(arcOrganizationIds({ modules: [], licenses: [lisans("a", true)] }), ["a"]);
  });

  test("bağımsız lisans kapsam dışı", () => {
    /*
      Standalone kiracı ARC'ı kullanmaya devam eder; yalnızca ArvoOS ile
      otomatik veri akışı durur. Erişimi kesen şey status, bu değil.
    */
    assert.deepEqual(arcOrganizationIds({ modules: [], licenses: [lisans("a", false)] }), []);
  });

  test("integrated alanı olmayan eski satır entegre sayılır", () => {
    // Sütun varsayılanı true; migration kimsenin senkronunu kesmemeli.
    assert.deepEqual(arcOrganizationIds({ modules: [], licenses: [lisans("a")] }), ["a"]);
  });

  test("bağımsız lisans senkron planına da girmez", () => {
    const plan = planArcSync(
      { organizations: [{ id: "a" }], modules: [], licenses: [lisans("a", false)], memberships: [] } as unknown as ArcSource,
      [],
    );
    assert.deepEqual(plan.licenses, []);
    assert.deepEqual(plan.organizationIds, []);
  });
}
