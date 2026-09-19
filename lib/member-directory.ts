import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabClient } from "@/lib/arvolab";

// Üç ürünün tüm üyelerini tek listede toplar (Platform → Üyeler).
//
// Veri üç yerde:
//  - Arc üyesi = kurumunda Arc lisansı ya da commerce modülü açık olan, ArvoOS'un
//    organization_memberships tablosundan. Arc 19.09.2026'dan beri ayrı
//    veritabanında ama üyelik kopyasını buradan köprü yazıyor (lib/arc-bridge.ts);
//    kaynak hâlâ burası.
//  - ArvoLab ayrı Supabase projesinde: kendi profiles/organizations tabloları.
//  - Bireysel ArvoLab aboneleri ArvoOS'ta product_subscribers'ta.
//
// E-postalar auth.users'ta; REST ile sorgulanamaz, yönetim API'siyle sayfa sayfa
// çekilir. Ekran kurucuya özel olduğu için maliyeti kabul edilebilir.

export type MemberProduct = "arvoos" | "arvolab" | "arc" | "randevu";

export interface DirectoryRow {
  product: MemberProduct;
  userId: string;
  name: string | null;
  email: string | null;
  scope: string;            // kurum adı ya da "Bireysel"
  role: string | null;
  individual: boolean;
  access: boolean;          // ürüne şu an girebiliyor mu
  status: string;
  periodEnd: string | null;
}

const ACTIVE_LICENSE = new Set(["active", "trialing"]);

function notExpired(periodEnd: string | null) {
  return !periodEnd || new Date(periodEnd).getTime() > Date.now();
}

/** Lisans erişime dönüşüyor mu (kurum tarafı). */
function licenseOpen(status: string | undefined, periodEnd: string | null) {
  return Boolean(status && ACTIVE_LICENSE.has(status) && notExpired(periodEnd));
}

/** auth.users listesini sayfa sayfa toplar; id → {email, ad} eşlemesi döner. */
async function emailMap(client: SupabaseClient) {
  const map = new Map<string, { email: string | null; name: string | null }>();
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[üyeler] kullanıcılar okunamadı", error.message);
      break;
    }
    for (const user of data.users) {
      const metadata = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
      map.set(user.id, { email: user.email ?? null, name: metadata.full_name ?? metadata.name ?? null });
    }
    if (data.users.length < perPage) break;
  }
  return map;
}

export interface Directory {
  rows: DirectoryRow[];
  arvolabReachable: boolean;
}

export async function getMemberDirectory(): Promise<Directory> {
  const admin = createAdminClient();
  if (!admin) return { rows: [], arvolabReachable: false };

  const [{ data: organizations }, { data: memberships }, { data: licenses }, { data: productLicenses }, { data: modules }, { data: subscribers }, users] =
    await Promise.all([
      admin.from("organizations").select("id,name,display_name,slug"),
      admin.from("organization_memberships").select("user_id,organization_id,role,is_active").eq("is_active", true),
      admin.from("organization_licenses").select("organization_id,license_status,current_period_end"),
      admin.from("organization_product_licenses").select("organization_id,product,status,current_period_end"),
      admin.from("organization_modules").select("organization_id,module_code,is_enabled").eq("module_code", "commerce"),
      admin.from("product_subscribers").select("product,external_user_id,email,full_name,status,trial_ends_at,current_period_end"),
      emailMap(admin),
    ]);

  const orgName = new Map((organizations ?? []).map((row) => [row.id, row.display_name || row.name]));
  const osLicense = new Map((licenses ?? []).map((row) => [row.organization_id, row]));
  const productLicense = new Map((productLicenses ?? []).map((row) => [`${row.organization_id}:${row.product}`, row]));
  const commerce = new Map((modules ?? []).map((row) => [row.organization_id, Boolean(row.is_enabled)]));

  const rows: DirectoryRow[] = [];

  for (const membership of memberships ?? []) {
    const user = users.get(membership.user_id);
    const scope = orgName.get(membership.organization_id) ?? "Bilinmeyen kurum";

    const os = osLicense.get(membership.organization_id);
    rows.push({
      product: "arvoos",
      userId: membership.user_id,
      name: user?.name ?? null,
      email: user?.email ?? null,
      scope,
      role: membership.role,
      individual: false,
      access: licenseOpen(os?.license_status, os?.current_period_end ?? null),
      status: os?.license_status ?? "lisans yok",
      periodEnd: os?.current_period_end ?? null,
    });

    // Arc: kurumda Arc lisansı ya da commerce modülü açıksa üye sayılır.
    const arc = productLicense.get(`${membership.organization_id}:arc`);
    if (arc || commerce.get(membership.organization_id)) {
      rows.push({
        product: "arc",
        userId: membership.user_id,
        name: user?.name ?? null,
        email: user?.email ?? null,
        scope,
        role: membership.role,
        individual: false,
        // Yaptırım henüz açılmadı: bugün erişimi commerce modülü belirliyor.
        access: commerce.get(membership.organization_id) ?? false,
        status: arc?.status ?? "lisans yok",
        periodEnd: arc?.current_period_end ?? null,
      });
    }

    // Randevu: kurumda randevu lisansı varsa üye sayılır; erişim lisansa bağlı
    // (Randevu tarafında rdv_lisans_acik aynı kuralı uygular).
    const randevu = productLicense.get(`${membership.organization_id}:randevu`);
    if (randevu) {
      rows.push({
        product: "randevu",
        userId: membership.user_id,
        name: user?.name ?? null,
        email: user?.email ?? null,
        scope,
        role: membership.role,
        individual: false,
        access: licenseOpen(randevu.status, randevu.current_period_end ?? null),
        status: randevu.status,
        periodEnd: randevu.current_period_end ?? null,
      });
    }
  }

  // --- ArvoLab: ayrı veritabanı
  let arvolabReachable = false;
  const lab = arvolabClient();
  if (lab) {
    const [{ data: labProfiles, error: labError }, { data: labOrganizations }, labUsers] = await Promise.all([
      lab.from("profiles").select("id,full_name,role,organization_id"),
      lab.from("organizations").select("id,name,license_status,current_period_end"),
      emailMap(lab),
    ]);
    if (labError) {
      console.error("[üyeler] ArvoLab okunamadı", labError.message);
    } else {
      arvolabReachable = true;
      const labOrgs = new Map((labOrganizations ?? []).map((row) => [row.id, row]));
      const subscriberByUser = new Map((subscribers ?? []).filter((row) => row.product === "arvolab").map((row) => [row.external_user_id, row]));

      for (const profile of labProfiles ?? []) {
        const user = labUsers.get(profile.id);
        const organization = profile.organization_id ? labOrgs.get(profile.organization_id) : null;
        const subscriber = subscriberByUser.get(profile.id);
        const staff = profile.role === "founder" || profile.role === "system_admin";

        let access: boolean;
        let status: string;
        let periodEnd: string | null = null;
        if (staff) {
          access = true;
          status = "iç ekip";
        } else if (organization) {
          access = licenseOpen(organization.license_status, organization.current_period_end);
          status = organization.license_status ?? "lisans yok";
          periodEnd = organization.current_period_end;
        } else if (subscriber) {
          periodEnd = subscriber.current_period_end;
          access = subscriber.status === "trialing"
            ? Boolean(subscriber.trial_ends_at && new Date(subscriber.trial_ends_at).getTime() > Date.now())
            : subscriber.status === "active" && notExpired(subscriber.current_period_end);
          status = subscriber.status;
        } else {
          access = false;
          status = "abonelik yok";
        }

        rows.push({
          product: "arvolab",
          userId: profile.id,
          name: profile.full_name ?? user?.name ?? null,
          email: user?.email ?? null,
          scope: organization ? organization.name : "Bireysel",
          role: profile.role,
          individual: !organization,
          access,
          status,
          periodEnd,
        });
      }

      // ArvoLab'da profili olmayan ama ArvoOS'ta abone kaydı bulunan kişiler
      const seen = new Set((labProfiles ?? []).map((profile) => profile.id));
      for (const subscriber of subscribers ?? []) {
        if (subscriber.product !== "arvolab" || seen.has(subscriber.external_user_id)) continue;
        rows.push({
          product: "arvolab",
          userId: subscriber.external_user_id,
          name: subscriber.full_name,
          email: subscriber.email,
          scope: "Bireysel",
          role: null,
          individual: true,
          access: subscriber.status === "active" && notExpired(subscriber.current_period_end),
          status: subscriber.status,
          periodEnd: subscriber.current_period_end,
        });
      }
    }
  }

  rows.sort((a, b) =>
    a.product.localeCompare(b.product, "tr") ||
    Number(b.access) - Number(a.access) ||
    (a.scope ?? "").localeCompare(b.scope ?? "", "tr") ||
    (a.email ?? "").localeCompare(b.email ?? "", "tr"));

  return { rows, arvolabReachable };
}
