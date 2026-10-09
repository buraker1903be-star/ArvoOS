import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hostFromHeaders, isManagementHost } from "@/lib/site/host-rules";
import { createClient } from "@/lib/supabase/server";
import { etkinYetkiler, gizliModulleriHesapla, type ModulKurali, type YetkiKurali } from "@/lib/yetkiler";

export type PanelModule = { code: string; name: string; description: string };
export const panelModules: Record<string, PanelModule & { icon: string }> = {
  crm: { code: "crm", name: "Müşteri ve Satış", description: "Talep, teklif ve satış süreçleri", icon: "MS" },
  operations: { code: "operations", name: "Operasyon ve İş Akışları", description: "Görevler, terminler ve ilerleme", icon: "OP" },
  finance: { code: "finance", name: "Finans", description: "Gelir, gider ve tahsilat görünümü", icon: "FN" },
  // Ayrı menü değil: Finans → Raporlar sekmesini açar (yalnızca sahip/yönetici)
  reporting: { code: "reporting", name: "Raporlama", description: "Finans → Raporlar: satış ve kârlılık raporları", icon: "RP" },
  hr: { code: "hr", name: "Ekip ve İnsan Kaynakları", description: "Ekip ve organizasyon yönetimi", icon: "İK" },
  documents: { code: "documents", name: "Belgeler", description: "Kurumsal belge merkezi", icon: "BL" },
  support: { code: "support", name: "Destek Merkezi", description: "Destek talepleri ve çözüm takibi", icon: "DS" },
};

export const WORKSPACE_COOKIE = "arvo_workspace_v2";

type PanelOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_code: string;
  sector: string;
  custom_domain: string | null;
  logo_url: string | null;
  brand_color: string | null;
  display_name: string | null;
};

type WorkspaceRpcRow = PanelOrganization & {
  organization_id: string;
  role: string;
};

export type PanelWorkspace = {
  organizationId: string;
  role: string;
  organization: PanelOrganization;
};

export const getPanelContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: rows, error } = await supabase.rpc("get_my_workspaces");
  if (error) throw new Error("Çalışma alanları okunamadı: " + error.message);

  const workspaces = ((rows ?? []) as WorkspaceRpcRow[]).map((row) => ({
    organizationId: row.organization_id,
    role: row.role,
    organization: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan_code: row.plan_code,
      sector: row.sector,
      custom_domain: row.custom_domain,
      logo_url: row.logo_url,
      brand_color: row.brand_color ?? null,
      display_name: row.display_name,
    },
  })) as PanelWorkspace[];

  if (!workspaces.length) redirect("/kurulum");

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(WORKSPACE_COOKIE)?.value;

  /*
    Kurucu yönetim alan adında çalışma alanı ZORLA Arvo'nun kendi kurumu.

    Varsayılan seçim akademikmerkez'i tercih ediyor; yönetim alan adına
    giren kurucu o kuruma düşüyor, isPlatformOwner false oluyor ve platform
    sayfası 404 veriyordu. Çerezdeki seçimi de dinlemiyoruz: bu alan adının
    tamamı kurucu konsolu, müşteri kurumunda yapılan bir geçiş buraya
    taşınmamalı.
  */
  const yonetimHostu = isManagementHost(hostFromHeaders(await headers()));
  const selectedWorkspace = (yonetimHostu ? workspaces.find((item) => item.organization.slug === "arvo-os") : null)
    ?? workspaces.find((item) => item.organizationId === requestedOrganizationId)
    ?? workspaces.find((item) => item.organization.slug === "akademikmerkez")
    ?? workspaces.find((item) => item.organization.slug === "arvo-os")
    ?? workspaces[0];

  const membership = {
    organization_id: selectedWorkspace.organizationId,
    role: selectedWorkspace.role,
  };
  const organization = selectedWorkspace.organization;

  /*
    Modüller ve yetki kuralları AYNI ANDA okunur: ikisi de yalnızca kurum ve
    role bağlı. Eskiden modüller okunup bitince yetkilere geçiliyordu; bu
    bağlam her panel isteğinin (sayfa, yerleşim, sunucu işlemi) kritik
    yolunda olduğu için fazladan bir veritabanı turu her tıklamaya ekleniyordu.
    Kurum Sahibi için yetki sorgusu yok (kısıtlanamaz).
  */
  const yetkiSorgulari = membership.role === "owner"
    ? null
    : Promise.all([
        supabase.from("role_module_permissions").select("module_key,can_access")
          .eq("organization_id", membership.organization_id).eq("role", membership.role),
        supabase.from("member_module_permissions").select("module_key,can_access")
          .eq("organization_id", membership.organization_id).eq("user_id", userId),
        supabase.from("role_capability_permissions").select("capability_key,allowed")
          .eq("organization_id", membership.organization_id).eq("role", membership.role),
        supabase.from("member_capability_permissions").select("capability_key,allowed")
          .eq("organization_id", membership.organization_id).eq("user_id", userId),
      ]);
  const [{ data: moduleRows, error: moduleError }, yetkiSonuclari] = await Promise.all([
    supabase.from("organization_modules")
      .select("module_code,arvo_modules(name,description,sort_order)")
      .eq("organization_id", membership.organization_id)
      .eq("is_enabled", true),
    yetkiSorgulari,
  ]);
  if (moduleError) throw new Error("Modül yetkileri okunamadı.");

  const modules = (moduleRows ?? []).map((row) => {
    const relation = row.arvo_modules as { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null;
    const item = Array.isArray(relation) ? relation[0] : relation;
    const fallback = panelModules[row.module_code];
    return { code: row.module_code, name: fallback?.name ?? item?.name ?? row.module_code, description: fallback?.description ?? item?.description ?? "", sortOrder: item?.sort_order ?? 0, icon: fallback?.icon ?? "•" };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const isPlatformOwner = membership.role === "owner" && organization.slug === "arvo-os";

  /*
    Panelden ayarlanabilir yetkilendirme. Üç soru, aynı yerden:
      hangi modüller gizli, hangi yetenekler açık, kişiye özel istisna var mı.

    Kurum Sahibi hiçbir zaman kısıtlanamaz; diğer roller için önce rol
    satırı, sonra kişi satırı okunur — kişi satırı rolü ezer. Eskiden
    yalnızca rol satırları ve yalnızca `can_access = false` olanlar
    okunuyordu: bu yüzden "rolde kapalı ama bu kişide açık" ifade
    edilemiyordu ve tek bir kişiye istisna tanımanın yolu yoktu.
  */
  let hiddenModuleKeys = new Set<string>();
  let yetkiler = etkinYetkiler({ rol: "owner" });
  if (yetkiSonuclari) {
    const [rolModulleri, kisiModulleri, rolYetkileri, kisiYetkileri] = yetkiSonuclari;
    /*
      Okunamazsa kısıt YOK sayılamaz: boş küme kapatılmış her şeyi açar.
      Yukarıdaki organization_modules okuması da aynı şekilde fırlatıyor.

      TEK İSTİSNA: tablonun henüz OLMAMASI. Üç istisna tablosu 02.10.2026
      migration'ıyla geldi; kod canlıya migration'dan önce çıkarsa her panel
      isteği "relation does not exist" ile düşerdi — kimse içeri giremez.
      Tablo yoksa istisna da yoktur ve doğru cevap boş kümedir (migration
      hiç satır yazmıyor, yani tablo yeni geldiğinde de küme boş). Bu
      yalnızca "tablo bulunamadı" koduna açık; başka her hata fırlatır.
    */
    const tabloYok = (hata: { code?: string } | null) => hata?.code === "42P01" || hata?.code === "PGRST205";
    for (const [sonuc, ad, yeniTablo] of [
      [rolModulleri, "Rol modül yetkileri", false],
      [kisiModulleri, "Kişi modül istisnaları", true],
      [rolYetkileri, "Rol yetkileri", true],
      [kisiYetkileri, "Kişi yetki istisnaları", true],
    ] as const) {
      if (!sonuc.error) continue;
      if (yeniTablo && tabloYok(sonuc.error)) continue;
      throw new Error(`${ad} okunamadı: ${sonuc.error.message}`);
    }

    hiddenModuleKeys = gizliModulleriHesapla({
      rol: membership.role,
      rolSatirlari: (rolModulleri.data ?? []) as ModulKurali[],
      kisiSatirlari: (kisiModulleri.data ?? []) as ModulKurali[],
    });
    yetkiler = etkinYetkiler({
      rol: membership.role,
      gizliModuller: hiddenModuleKeys,
      rolKurallari: (rolYetkileri.data ?? []) as YetkiKurali[],
      kisiKurallari: (kisiYetkileri.data ?? []) as YetkiKurali[],
    });
  }

  /** Tek yetenek sorusu. Sayfalarda `izin("crm.teklif.sil")` biçiminde okunur. */
  const izin = (key: string) => yetkiler.has(key);

  return { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys, yetkiler, izin };
});
