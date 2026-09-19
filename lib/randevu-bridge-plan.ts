// Randevu köprüsünün saf kısmı: ArvoOS'taki satırlardan Arvo Randevu'ya ne
// yazılacağını hesaplar. Veritabanına dokunmaz; tests/unit/randevu-bridge-plan.test.ts
// sınar. Köprünün kendisi: lib/randevu-bridge.ts. ARC köprüsüyle
// (lib/arc-bridge-plan.ts) aynı ilke; fark: kapsam yalnızca "randevu"
// lisansı (modül yok) ve hedefin lisans tablosu yalnızca bu ürünü kabul eder.

import type { Row } from "@/lib/arc-bridge-plan";

export type RandevuSource = {
  organizations: Row[];
  licenses: Row[];
  memberships: Row[];
};

export type RandevuPlan = {
  organizationIds: string[];
  organizations: Row[];
  licenses: Row[];
  memberships: Row[];
  /** Randevu'da olup ArvoOS'ta artık olmayan üyelikler: silinmez, pasife alınır. */
  deactivate: { organization_id: string; user_id: string }[];
  /** Randevu'da hesabı olması gerekenler (pasif üyeler dahil: üyelik hesaba bağlı). */
  userIds: string[];
};

/**
 * Randevu'ya aktarılacak kurum: randevu lisansı olan, durumu ne olursa olsun.
 * Askıya alınan ya da iptal edilen salon da aktarılır; kapanmayı Randevu
 * kendi tarafında lisansa bakarak uygular (rdv_lisans_acik).
 */
export function randevuOrganizationIds(licenses: Row[]): string[] {
  return [...new Set(licenses.filter((l) => l.product === "randevu").map((l) => String(l.organization_id)))].sort();
}

export function planRandevuSync(source: RandevuSource, targetMemberships: { organization_id: string; user_id: string }[]): RandevuPlan {
  const organizationIds = randevuOrganizationIds(source.licenses);
  const inScope = new Set(organizationIds);
  const scoped = (rows: Row[]) => rows.filter((row) => inScope.has(String(row.organization_id)));

  const memberships = scoped(source.memberships);
  const present = new Set(memberships.map((m) => `${m.organization_id}|${m.user_id}`));
  const deactivate = targetMemberships
    .filter((m) => inScope.has(m.organization_id) && !present.has(`${m.organization_id}|${m.user_id}`))
    .map((m) => ({ organization_id: m.organization_id, user_id: m.user_id }));

  return {
    organizationIds,
    organizations: source.organizations.filter((o) => inScope.has(String(o.id))),
    // Hedef tablo check (product = 'randevu'); başka ürünün lisansı gitmez.
    licenses: scoped(source.licenses).filter((l) => l.product === "randevu"),
    memberships,
    deactivate,
    userIds: [...new Set(memberships.map((m) => String(m.user_id)))].sort(),
  };
}
