import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { TOKEN_UCU, adresUyusuyorMu, kapsamEksigi, tokenCevabiniOku } from "@/lib/posta-oauth";

/*
  ORTAK POSTA KUTUSU — bağlantının sunucu tarafı.

  Bu dosya Google'a çıkıyor ve sırlara dokunuyor; saf parçalar
  lib/posta-oauth.ts'te. Buradaki hiçbir fonksiyon belirteç DÖNDÜRMÜYOR,
  yalnızca kullanıyor: ekranı besleyen postaDurumu sırları hiç okumuyor.

  Şifreleme anahtarı PayTR ve WhatsApp ile ortak (PAYMENT_CREDENTIALS_KEY):
  üç sır da aynı yolla saklanıyor, ayrı bir anahtar yönetmek dönüşümü
  üçe katlardı.
*/

export type PostaDurumu = {
  /** Sunucu anahtarları (service role + şifreleme) tanımlı mı. */
  kullanilabilir: boolean;
  kayitliMi: boolean;
  durum: "beklemede" | "bagli" | "hata" | "kapali" | null;
  adres: string | null;
  sonEsitleme: string | null;
  sonHata: string | null;
  guncellendi: string | null;
};

const bos = (kullanilabilir: boolean): PostaDurumu => ({
  kullanilabilir, kayitliMi: false, durum: null, adres: null,
  sonEsitleme: null, sonHata: null, guncellendi: null,
});

export async function postaDurumu(organizationId: string): Promise<PostaDurumu> {
  const admin = createAdminClient();
  const kullanilabilir = Boolean(admin) && paymentCredentialsConfigured();
  if (!admin) return bos(kullanilabilir);

  const { data } = await admin
    .from("mail_accounts")
    .select("email,status,last_sync_at,last_error,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return bos(kullanilabilir);

  return {
    kullanilabilir,
    kayitliMi: true,
    durum: data.status as PostaDurumu["durum"],
    adres: data.email ?? null,
    sonEsitleme: data.last_sync_at ?? null,
    sonHata: data.last_error ?? null,
    guncellendi: data.updated_at ?? null,
  };
}

function sunucuHazirMi() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı olmadığı için posta bağlantısı kullanılamıyor.");
  if (!paymentCredentialsConfigured()) {
    throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil; Google anahtarları güvenle saklanamıyor.");
  }
  return admin;
}

/**
 * Kurumun Google anahtarlarını kaydeder. İzin henüz alınmadığı için
 * durum "beklemede": ekran bir sonraki adımı (Google ile bağlan) gösterir.
 *
 * Anahtarlar DEĞİŞTİĞİNDE yenileme belirteci düşürülüyor. Eski belirteç
 * başka bir istemciye ait ve yeni client_id ile yenilenemez; saklamak
 * "bağlı görünüyor ama çalışmıyor" durumunu üretirdi.
 */
export async function postaAnahtarlariniKaydet(girdi: {
  organizationId: string;
  adres: string;
  clientId: string;
  clientSecret: string;
  userId: string;
}) {
  const admin = sunucuHazirMi();
  const adres = girdi.adres.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres)) throw new Error("Geçerli bir e-posta adresi girin.");
  if (!girdi.clientId.trim()) throw new Error("Google istemci kimliği boş olamaz.");
  if (!girdi.clientSecret.trim()) throw new Error("Google gizli anahtarı boş olamaz.");

  const { error } = await admin.from("mail_accounts").upsert({
    organization_id: girdi.organizationId,
    email: adres,
    client_id: girdi.clientId.trim(),
    client_secret_enc: encryptSecret(girdi.clientSecret.trim()),
    refresh_token_enc: null,
    status: "beklemede",
    last_error: null,
    connected_by: girdi.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error) throw new Error("Posta ayarları kaydedilemedi: " + error.message);
}

export async function postaBaglantisiniKaldir(organizationId: string) {
  const admin = sunucuHazirMi();
  const { error } = await admin.from("mail_accounts").delete().eq("organization_id", organizationId);
  if (error) throw new Error("Posta bağlantısı kaldırılamadı: " + error.message);
}

/** İzin akışını başlatmak için gereken, sır OLMAYAN alanlar. */
export async function postaIstemcisi(organizationId: string): Promise<{ clientId: string; adres: string } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("mail_accounts")
    .select("client_id,email")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? { clientId: data.client_id as string, adres: data.email as string } : null;
}

async function hesabiOku(organizationId: string) {
  const admin = sunucuHazirMi();
  const { data, error } = await admin
    .from("mail_accounts")
    .select("email,client_id,client_secret_enc,refresh_token_enc,status")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Posta hesabı okunamadı: " + error.message);
  if (!data) throw new Error("Bu kurum için posta ayarı yok. Önce Google anahtarlarını girin.");
  return { admin, hesap: data };
}

async function hatayaAl(organizationId: string, mesaj: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("mail_accounts")
    .update({ status: "hata", last_error: mesaj, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}

/**
 * Google'ın geri dönüşündeki kodu belirteçle değiştirir ve bağlantıyı
 * tamamlar. Üç şey doğrulanmadan "bağlandı" yazılmıyor:
 *
 *   1. Yenileme belirteci GELDİ mi. Gelmezse bağlantı ertesi gün ölür ve
 *      sebebi o gün aranır; şimdi söylemek ucuz.
 *   2. Kapsamlar tam mı. Google izin ekranında kullanıcı kutucuk
 *      kaldırabiliyor.
 *   3. Bağlanan kutu, kurumun yazdığı adres mi. Yazılan adrese güvenmek,
 *      kişisel hesabına bağlanıp ekranda ortak adresi gösteren bir kurum
 *      bırakırdı.
 */
export async function postaBaglantisiniTamamla(girdi: {
  organizationId: string;
  kod: string;
  redirectUri: string;
  userId: string;
}): Promise<{ adres: string } | { hata: string }> {
  const { admin, hesap } = await hesabiOku(girdi.organizationId);

  const cevap = await fetch(TOKEN_UCU, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: girdi.kod,
      client_id: hesap.client_id as string,
      client_secret: decryptSecret(hesap.client_secret_enc as string),
      redirect_uri: girdi.redirectUri,
      grant_type: "authorization_code",
    }),
  }).catch(() => null);

  if (!cevap) return { hata: "Google'a ulaşılamadı. Birazdan tekrar deneyin." };
  const okunan = tokenCevabiniOku(await cevap.json().catch(() => ({})));
  if ("hata" in okunan) return { hata: okunan.hata };

  if (!okunan.yenilemeBelirteci) {
    return { hata: "Google yenileme belirteci vermedi. Google Hesabı → Güvenlik → Üçüncü taraf erişimi bölümünden bu uygulamanın iznini kaldırıp tekrar bağlanın." };
  }
  const kapsamSorunu = kapsamEksigi(okunan.kapsamlar);
  if (kapsamSorunu) return { hata: kapsamSorunu };

  const profil = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${okunan.erisimBelirteci}` },
  }).then((yanit) => yanit.json()).catch(() => null);
  const baglananAdres = typeof profil?.emailAddress === "string" ? profil.emailAddress : "";
  if (!baglananAdres) return { hata: "Bağlanan posta kutusunun adresi okunamadı." };
  if (!adresUyusuyorMu(hesap.email as string, baglananAdres)) {
    return { hata: `Ayarlarda ${hesap.email} yazıyor ama ${baglananAdres} hesabıyla izin verildi. Doğru hesapla bağlanın ya da ayardaki adresi düzeltin.` };
  }

  const { error } = await admin.from("mail_accounts").update({
    refresh_token_enc: encryptSecret(okunan.yenilemeBelirteci),
    status: "bagli",
    last_error: null,
    connected_by: girdi.userId,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", girdi.organizationId);
  if (error) return { hata: "Bağlantı kaydedilemedi: " + error.message };

  return { adres: baglananAdres };
}

/**
 * Geçerli bir erişim belirteci (gelen kutusu ve gönderim için).
 *
 * Erişim belirteci SAKLANMIYOR, her seferinde yenilemeden üretiliyor.
 * Saklamak bir alan daha şifrelemek, bir sona erme daha yönetmek ve
 * yenileme belirteci düştüğünde iki yerde temizlemek demekti; Google'ın
 * yenileme çağrısı zaten tek ve hızlı bir istek.
 */
export async function postaErisimBelirteci(organizationId: string): Promise<string | { hata: string }> {
  const { hesap } = await hesabiOku(organizationId);
  if (hesap.status === "kapali") return { hata: "Posta bağlantısı kapalı." };
  if (!hesap.refresh_token_enc) return { hata: "Posta kutusuna Google izni verilmemiş." };

  const cevap = await fetch(TOKEN_UCU, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: hesap.client_id as string,
      client_secret: decryptSecret(hesap.client_secret_enc as string),
      refresh_token: decryptSecret(hesap.refresh_token_enc as string),
      grant_type: "refresh_token",
    }),
  }).catch(() => null);

  if (!cevap) return { hata: "Google'a ulaşılamadı." };
  const okunan = tokenCevabiniOku(await cevap.json().catch(() => ({})));
  if ("hata" in okunan) {
    /* Yenileme belirteci reddedildiğinde durum kalıcı olarak bozulur
       (izin kaldırılmış, parola değişmiş, anahtar dönmüş). Ekranın
       "bağlı" göstermeye devam etmesi, sorunu arayan kişiyi yanlış yere
       bakmaya gönderiyordu. */
    await hatayaAl(organizationId, okunan.hata);
    return { hata: okunan.hata };
  }
  return okunan.erisimBelirteci;
}
