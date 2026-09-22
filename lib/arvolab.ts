import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabGirisAdresi } from "@/lib/arvolab-giris";

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
  /** 1 kredi = 1.000 karakter. null: hak bildirilmedi, ArvoLab kapı kapatmaz. */
  aiCreditLimit: number | null;
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
    /*
      AI kredi hakkı da yansıtılıyor: ArvoLab kapıyı kendi tarafında
      uyguluyor ve her istekte ArvoOS'a sormuyor. Yansıtılmazsa (null)
      ArvoLab kimseyi engellemez — bildirilmemiş bir hak, "hak yok"
      demek değil.
    */
    ai_credit_limit: license.aiCreditLimit,
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
    Ad da gönderiliyor. ArvoLab'a ArvoOS üzerinden bağlanan kişi oranın
    kayıt formunu hiç doldurmuyor, dolayısıyla profilinde ad olmuyordu ve
    panel "Hoş geldiniz, uzman@akademikmerkez.com" yazıyordu. Adın asıl
    kaynağı profiles (konsolun geri kalanı da oradan okuyor).
  */
  const { data: profiller } = await admin.from("profiles").select("id,full_name").in("id", kimlikler);
  const adlar = new Map(((profiller ?? []) as { id: string; full_name: string | null }[])
    .filter((satir) => satir.full_name?.trim())
    .map((satir) => [satir.id, satir.full_name!.trim()]));

  /*
    E-postalar auth.users'ta; REST ile sorgulanamıyor, tek tek yönetim
    API'siyle okunuyor. Bir kurumun üye sayısı onlarla ölçüldüğü için
    kabul edilebilir — bütün kullanıcıları sayfalamaktan ucuz.
  */
  const uyeler: { email: string; full_name: string | null }[] = [];
  for (const kimlik of kimlikler) {
    const { data, error } = await admin.auth.admin.getUserById(kimlik);
    if (error || !data.user?.email) continue;
    const ustVeri = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
    uyeler.push({
      email: data.user.email.trim().toLocaleLowerCase("tr-TR"),
      full_name: adlar.get(kimlik) ?? ustVeri.full_name ?? ustVeri.name ?? null,
    });
  }
  if (!uyeler.length) return;

  const { error } = await lab.from("arvoos_members").upsert(
    uyeler.map((uye) => ({
      email: uye.email,
      full_name: uye.full_name,
      organization_id: organizationId,
      synced_at: new Date().toISOString(),
    })),
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

  const [{ data: organization }, { data: license }, { data: cekirdek }] = await Promise.all([
    admin.from("organizations").select("name,display_name").eq("id", organizationId).maybeSingle(),
    admin.from("organization_product_licenses").select("status,plan_code,current_period_end")
      .eq("organization_id", organizationId).eq("product", "arvolab").maybeSingle(),
    // AI kredi hakkı çekirdek lisansta; ek ürün tablosunda değil.
    admin.from("organization_licenses").select("ai_credit_limit").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (!organization) return "failed" as const;

  const status = license?.status ?? "inactive";
  const sonuc = await pushArvolabLicense({
    organizationId,
    name: organization.display_name || organization.name,
    status,
    planCode: license?.plan_code ?? null,
    currentPeriodEnd: license?.current_period_end ?? null,
    aiCreditLimit: cekirdek?.ai_credit_limit ?? null,
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
  hedef = "/dashboard",
  koken = "https://lab.arvo-os.com",
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

  const { data, error } = await lab.auth.admin.generateLink({ type: "magiclink", email: temiz });
  if (error || !data?.properties?.hashed_token) {
    // Bağlantının kendisi loglanmıyor: log'u gören o kişi olarak girebilir.
    console.error("[arvolab] giriş bağlantısı üretilemedi", error?.message ?? "belirteç boş");
    return { hata: "ArvoLab giriş bağlantısı üretilemedi." };
  }

  // Adres kurulumu saf modülde: tests/unit/arvolab-giris.test.ts.
  return { url: arvolabGirisAdresi(koken, data.properties.hashed_token, hedef) };
}

/**
 * Satın alınan krediyi ArvoLab'daki bakiyeye ekler.
 *
 * kaynak = ödemenin kimliği (PayTR merchant_oid). ArvoLab aynı kaynakla
 * ikinci kez yüklemiyor: ödeme bildirimleri tekrar gelebiliyor ve her
 * denemede kredi eklemek, bir kez ödeyen müşteriye kat kat hak vermek
 * demekti.
 *
 * Çağıranı düşürmez; sonucu döndürür. Yükleme başarısızsa ArvoOS'taki
 * sipariş kaydı loaded_at'siz kalıyor ve "para alındı, kredi yüklenmedi"
 * durumu oradan görülebiliyor.
 */
export async function arvolabKrediYukle(
  organizationId: string,
  kredi: number,
  kaynak: string,
): Promise<"loaded" | "not_configured" | "failed"> {
  const lab = arvolabClient();
  if (!lab) return "not_configured";
  const { error } = await lab.rpc("ai_kredi_yukle", {
    p_organization_id: organizationId,
    p_kredi: kredi,
    p_kaynak: kaynak,
  });
  if (error) {
    console.error("[arvolab] kredi yüklenemedi", organizationId, error.message);
    return "failed";
  }
  return "loaded";
}

/**
 * aylikLimit/aylikKalan null: ArvoOS bu kuruma henüz hak BİLDİRMEDİ.
 * 0 ise bildirildi ve hak yok. İkisini aynı göstermek, yansıtması
 * gecikmiş kuruma "hiç AI hakkınız yok" demek olurdu — AkademikMerkez'de
 * tam bu oldu (ArvoLab migration 20260924100017).
 */
export type ArvolabKrediDurumu = { aylikLimit: number | null; aylikKalan: number | null; ekBakiye: number };

/**
 * Kurumun ArvoLab'daki kredi bakiyesi. Kiracının Ödeme sayfası bunu
 * gösteriyor.
 *
 * ULAŞILAMAZSA null. "0 kredi" yazmak, hiç kullanmamış kurumla köprüsü
 * kopmuş kurumu aynı gösterirdi ve ikincisinde müşteri ihtiyacı yokken
 * kredi satın alırdı (lib/urun-kullanimi.ts ile aynı ilke).
 *
 * Ay değişimi kuralı burada DEĞİL: ArvoLab'ın fonksiyonu hesaplıyor
 * (arvoos_ai_kredi_durumu). Aynı kuralın ikinci kopyası ikisi ayrışınca
 * müşteriye yanlış bakiye gösterirdi.
 */
export async function arvolabKrediDurumu(organizationId: string): Promise<ArvolabKrediDurumu | null> {
  const lab = arvolabClient();
  if (!lab) return null;
  const { data, error } = await lab
    .rpc("arvoos_ai_kredi_durumu", { p_organization_id: organizationId })
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[arvolab] kredi bakiyesi okunamadı", organizationId, error.message);
    return null;
  }
  const satir = data as { aylik_limit: number | null; aylik_kalan: number | null; ek_bakiye: number };
  return {
    aylikLimit: satir.aylik_limit === null ? null : Number(satir.aylik_limit),
    aylikKalan: satir.aylik_kalan === null ? null : Number(satir.aylik_kalan),
    ekBakiye: Number(satir.ek_bakiye ?? 0),
  };
}

export type ArvolabYansimasi = {
  syncedAt: string | null;
  status: string;
  aiCreditLimit: number | null;
};

/**
 * ArvoLab'da o kurumun ŞU AN DURAN kopyası.
 *
 * bridge_health köprünün çalışıp çalışmadığını söylüyor; bunu söylemiyor.
 * AkademikMerkez'de tam bu boşluk açığa çıktı: köprü sağlıklıydı ama
 * kopya 16.09.2026'dan kalmaydı, çünkü yansıtma yalnızca kaydederken
 * çalışıyor. Altı gün boyunca konsol "10.000 kredi" derken ArvoLab'da hak
 * hiç yoktu ve kimse bilmiyordu — müşteri şikâyet edene kadar.
 *
 * Ulaşılamazsa null; kurucu ekranı bundan ötürü kapanmamalı.
 */
export async function arvolabYansimasi(organizationId: string): Promise<ArvolabYansimasi | null> {
  const lab = arvolabClient();
  if (!lab) return null;
  const { data, error } = await lab.from("organizations")
    .select("license_status,ai_credit_limit,synced_at").eq("id", organizationId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[arvolab] kopya okunamadı", organizationId, error.message);
    return null;
  }
  const satir = data as { license_status: string | null; ai_credit_limit: number | null; synced_at: string | null };
  return {
    syncedAt: satir.synced_at ?? null,
    status: satir.license_status ?? "inactive",
    aiCreditLimit: satir.ai_credit_limit === null ? null : Number(satir.ai_credit_limit),
  };
}
