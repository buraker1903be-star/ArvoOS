// ARC köprüsünün saf kısmı: ArvoOS'taki satırlardan ARC'a ne yazılacağını
// hesaplar. Veritabanına dokunmaz; tests/unit/arc-bridge-plan.test.ts sınar.
// Köprünün kendisi: lib/arc-bridge.ts. Neden var: ArvoARC/AYRILMA.md.

export type Row = Record<string, unknown>;

export type ArcSource = {
  organizations: Row[];
  modules: Row[];
  licenses: Row[];
  memberships: Row[];
};

export type ArcPlan = {
  organizationIds: string[];
  organizations: Row[];
  modules: Row[];
  licenses: Row[];
  memberships: Row[];
  /** ARC'ta olup ArvoOS'ta artık olmayan üyelikler: silinmez, pasife alınır. */
  deactivate: { organization_id: string; user_id: string }[];
  /**
   * ARC'ta hesabı olması gereken kullanıcılar. Pasif üyeler de dahil:
   * üyelik satırı hesaba yabancı anahtarla bağlı, hesap yoksa satır
   * yazılamaz. Pasif üye hesabıyla ARC'a giremez (üyelik is_active = false).
   */
  userIds: string[];
};

/**
 * ARC'a aktarılacak kurum: ARC lisansı olan (durumu ne olursa olsun; kademe
 * yaptırımı "canceled"/"suspended"ı ARC'ta uygular) ya da ticaret modülü
 * açık olan kurum. Lisansı hiç olmayan ama modülü açık kurumlar eski
 * mağazalardır (ArvoCulture); arc_store_stage onları açık tutar.
 */
export function arcOrganizationIds(source: Pick<ArcSource, "modules" | "licenses">): string[] {
  const ids = new Set<string>();
  for (const license of source.licenses) {
    if (license.product === "arc") ids.add(String(license.organization_id));
  }
  for (const row of source.modules) {
    if (row.module_code === "commerce" && row.is_enabled === true) ids.add(String(row.organization_id));
  }
  return [...ids].sort();
}

export function planArcSync(source: ArcSource, targetMemberships: { organization_id: string; user_id: string }[]): ArcPlan {
  const organizationIds = arcOrganizationIds(source);
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
    // ARC yalnızca ticaret modülüne ve ARC lisansına bakıyor; diğer ürünlerin
    // lisansı (ArvoLab) oraya taşınmaz.
    modules: scoped(source.modules).filter((m) => m.module_code === "commerce"),
    licenses: scoped(source.licenses).filter((l) => l.product === "arc"),
    memberships,
    deactivate,
    userIds: [...new Set(memberships.map((m) => String(m.user_id)))].sort(),
  };
}
