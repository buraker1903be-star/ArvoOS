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
  /* Konsoldan erişim açıp kapatabilmek için. ArvoLab üyelerinde ve bireysel
     abonelerde null: onların kaydı bu veritabanında değil. */
  organizationId: string | null;
  membershipActive: boolean | null;
}

const ACTIVE_LICENSE = new Set(["active", "trialing"]);

function notExpired(periodEnd: string | null) {
  return !periodEnd || new Date(periodEnd).getTime() > Date.now();
}

/** Lisans erişime dönüşüyor mu (kurum tarafı). */
function licenseOpen(status: string | undefined, periodEnd: string | null) {
  return Boolean(status && ACTIVE_LICENSE.has(status) && notExpired(periodEnd));
}

/**
 * auth.users listesini sayfa sayfa toplar; id → {email, ad} eşlemesi döner.
 *
 * `tam` alanı, listenin KAPSAMIN TAMAMINI getirip getirmediğini söylüyor.
 * Sayfa sınırına (10 × 1000) dayanıldığında ya da bir sayfa hata verdiğinde
 * kalan kullanıcıların e-postası eksik kalıyordu ve bu hiçbir yerde
 * görünmüyordu: satırlar "Adı kayıtlı değil" diye çiziliyor, "Kişi" sayacı
 * da e-postası olmayanları kimliğe göre ayrı kişi sayıp şişiyordu. Eksik
 * olduğunu bilmediğimiz bir liste, dolu bir liste gibi görünür.
 */
async function emailMap(client: SupabaseClient) {
  const map = new Map<string, { email: string | null; name: string | null }>();
  const perPage = 1000;
  const maxPage = 10;
  let tam = true;
  for (let page = 1; page <= maxPage; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[üyeler] kullanıcılar okunamadı", error.message);
      tam = false;
      break;
    }
    for (const user of data.users) {
      const metadata = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
      map.set(user.id, { email: user.email ?? null, name: metadata.full_name ?? metadata.name ?? null });
    }
    if (data.users.length < perPage) break;
    // Son sayfa da doluysa arkada daha çok kullanıcı var demektir.
    if (page === maxPage) tam = false;
  }
  return { map, tam };
}

export interface Directory {
  rows: DirectoryRow[];
  arvolabReachable: boolean;
  /** Kullanıcı listesi eksiksiz mi (auth sayfa sınırı aşılmadı mı). */
  kullanicilarTam: boolean;
}

export async function getMemberDirectory(): Promise<Directory> {
  const admin = createAdminClient();
  if (!admin) return { rows: [], arvolabReachable: false, kullanicilarTam: false };

  const [{ data: organizations }, { data: memberships }, { data: licenses }, { data: productLicenses }, { data: modules }, { data: subscribers }, users, { data: profiles }] =
    await Promise.all([
      admin.from("organizations").select("id,name,display_name,slug"),
      /*
        Pasif üyelikler de çekiliyor. Eskiden yalnızca aktifler geliyordu:
        kurucu bir üyenin erişimini kapattığı anda kişi listeden tamamen
        kayboluyor ve geri açmanın yolu kalmıyordu.
      */
      admin.from("organization_memberships").select("user_id,organization_id,role,is_active"),
      admin.from("organization_licenses").select("organization_id,license_status,current_period_end"),
      admin.from("organization_product_licenses").select("organization_id,product,status,current_period_end"),
      admin.from("organization_modules").select("organization_id,module_code,is_enabled").eq("module_code", "commerce"),
      admin.from("product_subscribers").select("product,external_user_id,email,full_name,status,trial_ends_at,current_period_end"),
      emailMap(admin),
      /*
        Adın ASIL kaynağı profiles: kişi adını panelden buraya yazıyor ve
        konsolun geri kalanı (ana sayfa, kiracı dosyası, CRM geçmişi) hep
        buradan okuyor. Bu liste yalnızca auth user_metadata'ya bakıyordu;
        metadata daveti gönderilirken doldurulduğu için, hesabı başka bir
        yoldan açılmış kişiler "—" görünüyordu — kurucunun kendisi dahil.
      */
      admin.from("profiles").select("id,full_name"),
    ]);

  const userInfo = users.map;
  const profilAdi = new Map(((profiles ?? []) as { id: string; full_name: string | null }[])
    .filter((satir) => satir.full_name?.trim())
    .map((satir) => [satir.id, satir.full_name!.trim()]));
  let kullanicilarTam = users.tam;

  const orgName = new Map((organizations ?? []).map((row) => [row.id, row.display_name || row.name]));
  const osLicense = new Map((licenses ?? []).map((row) => [row.organization_id, row]));
  const productLicense = new Map((productLicenses ?? []).map((row) => [`${row.organization_id}:${row.product}`, row]));
  const commerce = new Map((modules ?? []).map((row) => [row.organization_id, Boolean(row.is_enabled)]));

  const rows: DirectoryRow[] = [];

  for (const membership of memberships ?? []) {
    const user = userInfo.get(membership.user_id);
    const scope = orgName.get(membership.organization_id) ?? "Bilinmeyen kurum";

    const os = osLicense.get(membership.organization_id);
    // Pasif üyenin lisans durumu ne olursa olsun erişimi yoktur.
    const uyelikAcik = Boolean(membership.is_active);
    rows.push({
      product: "arvoos",
      userId: membership.user_id,
      name: profilAdi.get(membership.user_id) ?? user?.name ?? null,
      email: user?.email ?? null,
      scope,
      role: membership.role,
      individual: false,
      access: uyelikAcik && licenseOpen(os?.license_status, os?.current_period_end ?? null),
      status: uyelikAcik ? (os?.license_status ?? "lisans yok") : "erişim kapalı",
      periodEnd: os?.current_period_end ?? null,
      organizationId: membership.organization_id,
      membershipActive: uyelikAcik,
    });

    // Arc: kurumda Arc lisansı ya da commerce modülü açıksa üye sayılır.
    const arc = productLicense.get(`${membership.organization_id}:arc`);
    if (arc || commerce.get(membership.organization_id)) {
      rows.push({
        product: "arc",
        userId: membership.user_id,
        name: profilAdi.get(membership.user_id) ?? user?.name ?? null,
        email: user?.email ?? null,
        scope,
        role: membership.role,
        individual: false,
        // Yaptırım henüz açılmadı: bugün erişimi commerce modülü belirliyor.
        access: uyelikAcik && (commerce.get(membership.organization_id) ?? false),
        status: uyelikAcik ? (arc?.status ?? "lisans yok") : "erişim kapalı",
        periodEnd: arc?.current_period_end ?? null,
        organizationId: membership.organization_id,
        membershipActive: uyelikAcik,
      });
    }

    // Randevu: kurumda randevu lisansı varsa üye sayılır; erişim lisansa bağlı
    // (Randevu tarafında rdv_lisans_acik aynı kuralı uygular).
    const randevu = productLicense.get(`${membership.organization_id}:randevu`);
    if (randevu) {
      rows.push({
        product: "randevu",
        userId: membership.user_id,
        name: profilAdi.get(membership.user_id) ?? user?.name ?? null,
        email: user?.email ?? null,
        scope,
        role: membership.role,
        individual: false,
        access: uyelikAcik && licenseOpen(randevu.status, randevu.current_period_end ?? null),
        status: uyelikAcik ? randevu.status : "erişim kapalı",
        periodEnd: randevu.current_period_end ?? null,
        organizationId: membership.organization_id,
        membershipActive: uyelikAcik,
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
      if (!labUsers.tam) kullanicilarTam = false;
      const labOrgs = new Map((labOrganizations ?? []).map((row) => [row.id, row]));
      const subscriberByUser = new Map((subscribers ?? []).filter((row) => row.product === "arvolab").map((row) => [row.external_user_id, row]));

      for (const profile of labProfiles ?? []) {
        const user = labUsers.map.get(profile.id);
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
          // ArvoLab ayrı veritabanında; erişimi konsoldan değiştirilemiyor.
          organizationId: null,
          membershipActive: null,
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
          // ArvoLab ayrı veritabanında; erişimi konsoldan değiştirilemiyor.
          organizationId: null,
          membershipActive: null,
        });
      }
    }
  }

  rows.sort((a, b) =>
    a.product.localeCompare(b.product, "tr") ||
    Number(b.access) - Number(a.access) ||
    (a.scope ?? "").localeCompare(b.scope ?? "", "tr") ||
    (a.email ?? "").localeCompare(b.email ?? "", "tr"));

  return { rows, arvolabReachable, kullanicilarTam };
}
