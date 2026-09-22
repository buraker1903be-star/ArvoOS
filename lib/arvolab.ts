import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// ArvoLab köprüsü.
//
// ArvoLab ayrı bir Supabase projesinde (zpfpocyajnxcketdjbxm). Lisans durumunu
// her istekte ArvoOS'a sormak yerine ArvoOS değişiklik oldukça ArvoLab'a yazar;
// ArvoLab kendi tablosundaki sütuna bakar. Böylece ArvoOS erişilemese bile
// ArvoLab son bilinen duruma göre çalışmaya devam eder.
//
// Kurum kimliği iki tarafta aynı: ArvoLab'ın organizations.id'si ArvoOS'un
// kurum kimliğiyle açılır, ayrı eşleşme tablosu yok. (ArvoLab'ta henüz kurum
// kaydı yoktu; bu yüzden eşleştirilecek geçmiş veri de yok.)

type ArvolabLicense = {
  organizationId: string;
  name: string;
  status: string;
  planCode: string | null;
  currentPeriodEnd: string | null;
};

export const arvolabConfigured = () =>
  Boolean(process.env.ARVOLAB_SUPABASE_URL && process.env.ARVOLAB_SUPABASE_SECRET_KEY);

export function arvolabClient() {
  const url = process.env.ARVOLAB_SUPABASE_URL;
  const key = process.env.ARVOLAB_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Lisans durumunu ArvoLab'a yazar. Çağıran akışı (ödeme bildirimi, kurucu
 * ekranı) asla düşürmemeli: hata fırlatmaz, sonucu döndürür.
 */
export async function pushArvolabLicense(license: ArvolabLicense): Promise<"synced" | "not_configured" | "failed"> {
  const client = arvolabClient();
  if (!client) return "not_configured";
  const { error } = await client.from("organizations").upsert({
    id: license.organizationId,
    name: license.name,
    license_status: license.status,
    plan_code: license.planCode,
    current_period_end: license.currentPeriodEnd,
    synced_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) {
    console.error("[arvolab] lisans yansıtılamadı", license.organizationId, error.message);
    return "failed";
  }
  return "synced";
}

export interface ArvolabBridgeHealth {
  /** Köprü çalışmıyor: son deneme hata verdi ve sonrasında başarılı çağrı olmadı. */
  broken: boolean;
  /** Yapılandırma hatası mı (anahtar yanlış/eksik) yoksa geçici arıza mı. */
  permanent: boolean;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

/**
 * ArvoLab köprüsünün son durumu.
 *
 * ArvoLab, ArvoOS'a ulaşamadığında kullanıcıyı engellemiyor — geçici bir arıza
 * yüzünden ödemiş müşteriyi kapıda bırakmak daha pahalı. Ama yanlış yazılmış
 * bir anahtar köprüyü kalıcı kırar ve herkes bedava kullanır. ArvoLab her
 * çağrının sonucunu kendi veritabanına yazıyor; biz oradan okuyup kurucuya
 * gösteriyoruz. Köprü kopukken de çalışır, çünkü okuma doğrudan veritabanından.
 */
export async function getArvolabBridgeHealth(): Promise<ArvolabBridgeHealth | null> {
  const client = arvolabClient();
  if (!client) return null;
  const { data, error } = await client
    .from("bridge_health")
    .select("last_ok_at,last_error_at,last_error,last_error_kind")
    .eq("id", "arvoos")
    .maybeSingle();
  if (error) {
    // Sessiz dönmüyoruz: okuma başarısızsa Platform ekranı köprüyü sağlıklı
    // sanır. En sık sebebi ArvoLab'daki bridge_health izinleri.
    console.error("[arvolab] köprü sağlık kaydı okunamadı", error.message);
    return null;
  }
  if (!data) return null;

  const errorAt = data.last_error_at ? new Date(data.last_error_at).getTime() : 0;
  const okAt = data.last_ok_at ? new Date(data.last_ok_at).getTime() : 0;
  return {
    broken: errorAt > okAt,
    permanent: data.last_error_kind === "permanent",
    lastOkAt: data.last_ok_at ?? null,
    lastErrorAt: data.last_error_at ?? null,
    lastError: data.last_error ?? null,
  };
}

/**
 * Kurumun ArvoLab'a bağlanabilecek üye e-postalarını yansıtır.
 *
 * ArvoLab ayrı bir Supabase projesi ve kendi auth'unu kullanıyor; bir
 * kurumun ArvoOS personeli oraya girdiğinde profili hiçbir kuruma bağlı
 * olmadan açılıyordu. Kişi ürünün içinde ama kurumun çalışmalarını
 * göremiyor, kurum da onu göremiyordu.
 *
 * Burada HESAP AÇILMIYOR, yalnızca eşleşme listesi yazılıyor: kişi ArvoLab'a
 * kendi girdiğinde e-postası listede bulunursa profili kuruma bağlanıyor
 * (migration 20260924100011). Önceden hesap açmak, ürünü hiç kullanmayacak
 * kişiler için hayalet kayıtlar ve müşterinin personeline istenmeyen bir
 * davet e-postası demekti.
 *
 * Lisans kapalıysa liste SİLİNİYOR: aboneliği biten kurumun yeni personeli
 * kendini kuruma bağlayamamalı. Bağlanmış olanlar bağlı kalıyor; lisans
 * kapısı ArvoLab'ın kendi tarafında zaten çalışıyor.
 */
async function pushArvolabMembers(organizationId: string, lisansAcik: boolean) {
  const lab = arvolabClient();
  const admin = createAdminClient();
  if (!lab || !admin) return;

  // Eski liste her seferinde siliniyor: kurumdan çıkarılan kişi listede
  // kalırsa, ArvoLab'a ilk kez girdiğinde hâlâ o kuruma bağlanırdı.
  const { error: silmeHatasi } = await lab.from("arvoos_members").delete().eq("organization_id", organizationId);
  if (silmeHatasi) {
    console.error("[arvolab] üye listesi temizlenemedi", organizationId, silmeHatasi.message);
    return;
  }
  if (!lisansAcik) return;

  const { data: uyelikler } = await admin.from("organization_memberships")
    .select("user_id").eq("organization_id", organizationId).eq("is_active", true);
  const kimlikler = (uyelikler ?? []).map((satir) => satir.user_id as string);
  if (!kimlikler.length) return;

  /*
    E-postalar auth.users'ta; REST ile sorgulanamıyor, tek tek yönetim
    API'siyle okunuyor. Bir kurumun üye sayısı onlarla ölçüldüğü için
    kabul edilebilir — bütün kullanıcıları sayfalamaktan ucuz.
  */
  const epostalar: string[] = [];
  for (const kimlik of kimlikler) {
    const { data, error } = await admin.auth.admin.getUserById(kimlik);
    if (error || !data.user?.email) continue;
    epostalar.push(data.user.email.trim().toLocaleLowerCase("tr-TR"));
  }
  if (!epostalar.length) return;

  const { error } = await lab.from("arvoos_members").upsert(
    epostalar.map((email) => ({ email, organization_id: organizationId, synced_at: new Date().toISOString() })),
    { onConflict: "email" },
  );
  if (error) console.error("[arvolab] üye listesi yazılamadı", organizationId, error.message);
}

/**
 * Kurumun güncel ArvoLab lisansını okuyup yansıtır. Lisans satırı yoksa
 * "inactive" yazılır: ArvoLab tarafında erişim kapalı kalır.
 *
 * Üye listesi de aynı anda yansıtılıyor; lisans ve kimin girebileceği ayrı
 * anlarda güncellenirse ikisi birbirini tutmuyor.
 */
export async function syncArvolabLicense(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) return "failed" as const;

  const [{ data: organization }, { data: license }] = await Promise.all([
    admin.from("organizations").select("name,display_name").eq("id", organizationId).maybeSingle(),
    admin.from("organization_product_licenses").select("status,plan_code,current_period_end")
      .eq("organization_id", organizationId).eq("product", "arvolab").maybeSingle(),
  ]);
  if (!organization) return "failed" as const;

  const status = license?.status ?? "inactive";
  const sonuc = await pushArvolabLicense({
    organizationId,
    name: organization.display_name || organization.name,
    status,
    planCode: license?.plan_code ?? null,
    currentPeriodEnd: license?.current_period_end ?? null,
  });

  // Üye listesi kurumu yazdıktan SONRA: arvoos_members organizations'a
  // yabancı anahtarla bağlı, kurum yoksa satırlar reddedilirdi.
  if (sonuc === "synced") await pushArvolabMembers(organizationId, ACIK_LISANSLAR.has(status));
  return sonuc;
}

/** Erişimi açık sayan lisans durumları (ArvoLab kapısıyla aynı kural). */
const ACIK_LISANSLAR = new Set(["active", "trialing", "past_due"]);

/**
 * Üyelik değişti: ArvoLab'daki eşleşme listesini tazeler.
 *
 * Çağıranı düşürmez — davet ya da erişim kapatma, köprü çalışmıyor diye
 * başarısız olmamalı.
 */
export async function syncArvolabMembers(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: license } = await admin.from("organization_product_licenses")
    .select("status").eq("organization_id", organizationId).eq("product", "arvolab").maybeSingle();
  await pushArvolabMembers(organizationId, ACIK_LISANSLAR.has(license?.status ?? "inactive"));
}

/**
 * Kişiyi ArvoLab'a oturumu açılmış olarak gönderecek TEK KULLANIMLIK bağlantı.
 *
 * Kurumun personeli ArvoLab'a geçmek için ikinci bir kez giriş yapmak
 * zorundaydı: ayrı proje, ayrı auth, ayrı parola. Çoğu kişi ArvoLab'da bir
 * hesabı olduğunu bile bilmiyordu.
 *
 * Bağlantı ArvoLab'ın kendi auth'undan üretiliyor (magic link): tek
 * kullanımlık ve kısa ömürlü. ASLA ekrana yazılmıyor, yalnızca sunucudan
 * yönlendirme olarak kullanılıyor — bağlantıyı gören herkes o kişi olarak
 * girebilir.
 *
 * Hesap yoksa BU ANDA açılıyor. Önceden toplu hesap açmamıştık çünkü
 * ürünü hiç kullanmayacak kişilere hayalet kayıt ve istenmeyen davet
 * e-postası demekti; burada kişi zaten "ArvoLab'a geç" diyor. E-posta
 * doğrulanmış işaretleniyor, yani Supabase hiçbir posta göndermiyor.
 * Yeni hesabın profili, ArvoOS'un ittiği eşleşme listesi sayesinde
 * kendiliğinden kuruma bağlanıyor (ArvoLab migration 20260924100011).
 *
 * Çağıran, kişinin bu kurumda AKTİF üye olduğunu ve kurumun ArvoLab
 * lisansının açık olduğunu kendisi doğrulamalı: burası yalnızca bağlantıyı
 * üretir.
 */
export async function arvolabGirisBaglantisi(
  email: string,
  hedef = "https://lab.arvo-os.com/dashboard",
): Promise<{ url: string } | { hata: string }> {
  const lab = arvolabClient();
  if (!lab) return { hata: "ArvoLab bağlantısı yapılandırılmamış." };

  const temiz = email.trim().toLocaleLowerCase("tr-TR");
  if (!temiz) return { hata: "Hesabınızda e-posta adresi yok." };

  /*
    Önce hesabı açmayı deniyoruz. Zaten varsa Supabase "already registered"
    diyor ve bu bir hata değil, beklenen durum: akış devam ediyor.
    email_confirm: true — doğrulama postası gitmesin; kişinin kimliğini
    ArvoOS oturumu zaten doğrulamış durumda.
  */
  const { error: acmaHatasi } = await lab.auth.admin.createUser({ email: temiz, email_confirm: true });
  if (acmaHatasi && !/already|registered|exists/i.test(acmaHatasi.message)) {
    console.error("[arvolab] hesap açılamadı", acmaHatasi.message);
    return { hata: "ArvoLab hesabı açılamadı." };
  }

  const { data, error } = await lab.auth.admin.generateLink({
    type: "magiclink",
    email: temiz,
    options: { redirectTo: hedef },
  });
  if (error || !data?.properties?.action_link) {
    // Bağlantının kendisi loglanmıyor: log'u gören o kişi olarak girebilir.
    console.error("[arvolab] giriş bağlantısı üretilemedi", error?.message ?? "bağlantı boş");
    return { hata: "ArvoLab giriş bağlantısı üretilemedi." };
  }
  return { url: data.properties.action_link };
}
