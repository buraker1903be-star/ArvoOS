import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { accessChangeError, canIssuePasswordLink, canManageMembers, parseRandevuMemberRequest } from "@/lib/randevu-members";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

describe("parseRandevuMemberRequest", () => {
  test("ekleme e-postayı küçük harfe çevirir, rol verilmezse personel olur", () => {
    const r = parseRandevuMemberRequest({ action: "add", actorId: ACTOR, organizationId: ORG, email: " Ayse@Ornek.com " });
    assert.ok(r.ok);
    assert.equal(r.value.email, "ayse@ornek.com");
    assert.equal(r.value.role, "member");
  });

  test("Kurum Sahibi rolü bu uçtan verilemez", () => {
    const r = parseRandevuMemberRequest({ action: "add", actorId: ACTOR, organizationId: ORG, email: "a@b.co", role: "owner" });
    assert.deepEqual(r, { ok: false, error: "invalid_role" });
  });

  test("bilinmeyen işlem, bozuk kimlik ve hedefsiz bağlantı reddedilir", () => {
    assert.deepEqual(parseRandevuMemberRequest({ action: "drop", actorId: ACTOR, organizationId: ORG }), { ok: false, error: "invalid_action" });
    assert.deepEqual(parseRandevuMemberRequest({ action: "list", actorId: "x", organizationId: ORG }), { ok: false, error: "invalid_ids" });
    assert.deepEqual(parseRandevuMemberRequest({ action: "link", actorId: ACTOR, organizationId: ORG }), { ok: false, error: "invalid_user" });
    assert.deepEqual(parseRandevuMemberRequest(null), { ok: false, error: "invalid_action" });
  });
});

describe("yetki kuralları", () => {
  test("yalnızca sahip ve yönetici kullanıcı yönetir", () => {
    assert.deepEqual(["owner", "admin", "manager", "member", undefined].map(canManageMembers), [true, true, false, false, false]);
  });

  test("sahip ve kişinin kendisi kapatılamaz", () => {
    assert.equal(accessChangeError(ACTOR, { user_id: USER, role: "owner" }), "owner_protected");
    assert.equal(accessChangeError(ACTOR, { user_id: ACTOR, role: "admin" }), "self");
    assert.equal(accessChangeError(ACTOR, null), "not_member");
    assert.equal(accessChangeError(ACTOR, { user_id: USER, role: "member" }), null);
  });
});

describe("şifre belirleme bağlantısı", () => {
  const ORG_B = "00000000-0000-4000-8000-0000000000a2";

  test("yeni açılan hesaba verilir", () => {
    assert.equal(canIssuePasswordLink({ createdNow: true, memberships: [], organizationId: ORG }), true);
  });

  test("yalnızca bu salonun kullanıcısıysa verilir", () => {
    assert.equal(canIssuePasswordLink({
      createdNow: false,
      memberships: [{ organization_id: ORG, is_active: true }],
      organizationId: ORG,
    }), true);
  });

  test("başka kurumda da kullanılan mevcut hesaba VERİLMEZ", () => {
    // Salon yöneticisi başka bir salonun kullanıcısının e-postasını yazarak
    // o hesabın şifresini belirleyip kurbanın paneline girebiliyordu.
    assert.equal(canIssuePasswordLink({
      createdNow: false,
      memberships: [{ organization_id: ORG, is_active: true }, { organization_id: ORG_B, is_active: true }],
      organizationId: ORG,
    }), false);
    assert.equal(canIssuePasswordLink({
      createdNow: false,
      memberships: [{ organization_id: ORG_B, is_active: true }],
      organizationId: ORG,
    }), false);
  });

  test("pasif üyelikler kararı etkilemez", () => {
    assert.equal(canIssuePasswordLink({
      createdNow: false,
      memberships: [{ organization_id: ORG, is_active: true }, { organization_id: ORG_B, is_active: false }],
      organizationId: ORG,
    }), true);
  });
});
