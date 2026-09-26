import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Ödeme sağlayıcısı kimlik bilgilerinin şifrelenmesi.
//
// Sağlayıcı bir değişken (lib/payments/saglayicilar.ts): PayTR mağaza
// anahtarları, Garanti BBVA terminal ve provizyon şifreleri hep buradan
// geçiyor. Alan adları sağlayıcıya göre değişir, şifreleme değişmez.
//
// Kimlik bilgileri veritabanına düz yazılmaz: AES-256-GCM ile
// şifrelenir, anahtar yalnızca sunucudaki PAYMENT_CREDENTIALS_KEY ortam
// değişkenindedir (32 bayt, base64). Veritabanı sızsa bile anahtarlar
// okunamaz; tablo zaten yalnızca service_role'e açıktır.
//
// Biçim: "v1:<iv base64>:<etiket base64>:<şifreli metin base64>"

const VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!raw) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil. Vercel ortam değişkenlerine ekleyin.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PAYMENT_CREDENTIALS_KEY 32 baytlık base64 bir anahtar olmalıdır.");
  return key;
}

/** Şifreleme anahtarı tanımlı mı (ayarlar ekranında uyarı için). */
export function paymentCredentialsConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Şifreli değer biçimi tanınmadı.");
  /* masterKey() try'ın DIŞINDA: eksik ya da 32 bayt olmayan anahtar için
     kendi kesin mesajı var, aşağıdaki genel mesaj onu ezmesin. */
  const key = masterKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch (sorun) {
    /*
      GCM doğrulaması düşünce Node "Unsupported state or unable to
      authenticate data" diyor; İngilizce, sebebi yazmıyor ve bu mesaj
      kullanıcıya kadar çıkıyordu. En olası sebep PAYMENT_CREDENTIALS_KEY'in
      değişmesi: o anda kayıtlı BÜTÜN kimlik bilgileri çözülemez hâle gelir
      ve yapılacak iş (eski anahtarı geri koymak ya da bilgileri yeniden
      girmek) hiçbir yerde yazmıyordu.

      Ayrıntı dışarı verilmiyor: sır ya da anahtar parçası mesaja girmemeli.
      Asıl hata yalnızca sunucu günlüğüne.
    */
    console.error("[ödeme] kimlik bilgisi çözülemedi", sorun instanceof Error ? sorun.message : sorun);
    throw new Error(
      "Kayıtlı ödeme kimlik bilgisi çözülemedi. Büyük olasılıkla şifreleme anahtarı (PAYMENT_CREDENTIALS_KEY) " +
      "değişti; eski anahtarı geri koyun ya da Ayarlar → Entegrasyonlar'dan bilgileri yeniden girin.",
    );
  }
}
