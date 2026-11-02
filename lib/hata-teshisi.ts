/*
  HATA TEŞHİSİ (02.11.2026) — saf. Sistem sağlığı ekranı ve kurucuya
  giden arıza uyarısı; testi tests/unit/hata-teshisi.test.ts.

  Sistem sağlığı bir işin düştüğünü ya da köprünün koptuğunu söylüyordu
  ama nedenini ham hata metniyle, tek satıra kırpılmış hâlde veriyordu
  ("PGRST205", "fetch failed", "401"). Metni okuyup "anahtar mı değişti,
  migration mı eksik, karşı taraf mı kapalı" sonucuna varmak kurucuya
  kalıyordu — tam da hızlı karar gereken anda.

  Burada bilinen hata türleri tanınıp "muhtemel sebep" ve "ne yapmalı"
  cümlesine çevriliyor. Kural BİLEREK "muhtemel" diyor: metin bir ipucu,
  kesin teşhis değil; ham metin ekranda yine tam hâliyle duruyor. Hiçbir
  kurala uymayan metin null döner ve ekran yalnızca ham metni gösterir —
  uydurma bir sebep göstermekten iyidir.

  SIRA ÖNEMLİ: özelden genele. "PGRST205" bir 404 gibi de okunabilir,
  "RESEND 401" genel bir yetki hatası gibi; önce özel kural yakalamalı.
*/

export type Teshis = { tur: string; sebep: string; yapilacak: string[] };

type Kural = { tur: string; desen: RegExp; sebep: string; yapilacak: string[] };

const KURALLAR: Kural[] = [
  {
    tur: "posta-baglantisi",
    desen: /invalid_grant|refresh[ _-]?token|token (has been )?(expired|revoked)|yeniden bağla/i,
    sebep: "Posta kutusunun bağlantı yetkisi düşmüş (Google bağlantıyı iptal etti ya da süresi doldu).",
    yapilacak: ["Kurumun Ayarlar → Entegrasyonlar ekranından posta kutusunu yeniden bağlayın.", "Şifre değiştirildiyse ya da hesapta erişim kaldırıldıysa bağlantı her zaman düşer."],
  },
  {
    tur: "eposta-anahtari",
    desen: /resend[\s\S]*(401|403|api key|unauthori)|RESEND_API_KEY/i,
    sebep: "E-posta sağlayıcısı (Resend) anahtarı reddetti ya da anahtar tanımlı değil.",
    yapilacak: ["Vercel → Project → Settings → Environment Variables'da RESEND_API_KEY'i kontrol edin.", "Değiştirdiyseniz yeniden dağıtın (Redeploy); eski dağıtım eski anahtarla çalışır."],
  },
  {
    tur: "migration-tablo",
    desen: /PGRST205|42P01|relation "?[\w.]+"? does not exist|could not find the table/i,
    sebep: "Veritabanında beklenen tablo yok: ilgili migration canlıya uygulanmamış.",
    yapilacak: ["Bekleyen migration'ı Supabase SQL Editor'de çalıştırın.", "Ardından ayrı bir sorgu olarak: notify pgrst, 'reload schema';"],
  },
  {
    tur: "migration-sutun",
    desen: /42703|PGRST204|column "?[\w.]+"? (of relation "?[\w.]+"? )?does not exist|could not find the '?[\w]+'? column/i,
    sebep: "Veritabanında beklenen sütun yok: migration eksik ya da şema önbelleği eski.",
    yapilacak: ["Bekleyen migration'ı uygulayın.", "Uyguladıysanız: notify pgrst, 'reload schema';"],
  },
  {
    tur: "migration-islev",
    desen: /PGRST202|42883|function [\w.]+\(.*\) does not exist|could not find the function/i,
    sebep: "Veritabanında beklenen işlev (RPC) yok ya da imzası farklı: migration eksik.",
    yapilacak: ["Bekleyen migration'ı uygulayın, ardından notify pgrst, 'reload schema';"],
  },
  {
    tur: "kisit",
    desen: /23514|violates check constraint|23505|duplicate key value|23503|violates foreign key/i,
    sebep: "Veritabanı kuralı yazmayı reddetti (kısıt, tekrar eden kayıt ya da bağlı kayıt yok).",
    yapilacak: ["Hata metnindeki kısıt adına bakın: kod ile şema ayrışmış olabilir (yeni bir değer eklenip migration'ı unutulmuş).", "Aynı olay tekrar işleniyorsa (çift bildirim) bu zararsızdır."],
  },
  {
    tur: "veritabani-yetkisi",
    desen: /42501|permission denied|row-level security|violates row-level/i,
    sebep: "Veritabanı yetkisi reddetti: sunucu anahtarı yok ya da yanlış, veya RLS/grant migration'ı eksik.",
    yapilacak: ["Vercel'de SUPABASE_SERVICE_ROLE_KEY tanımlı ve doğru projeye ait mi kontrol edin.", "Yeni tablo/işlev eklendiyse grant ve politika migration'ının uygulandığını doğrulayın."],
  },
  {
    tur: "kimlik",
    desen: /\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid (api[ _-]?)?(key|token|secret)|imza (geçersiz|doğrulanamadı)|signature|jwt|anahtar eksik ya da iki tarafta farklı/i,
    sebep: "Karşı taraf kimliği reddetti: iki uçtaki anahtar ya da sır eşleşmiyor.",
    yapilacak: ["İki projedeki eşleşmesi gereken ortam değişkenini karşılaştırın (ör. ARC_BRIDGE_SECRET, RANDEVU_BRIDGE_SECRET, ARVOLAB_BRIDGE_SECRET, CRON_SECRET).", "Değiştirdiyseniz HER İKİ tarafı da yeniden dağıtın."],
  },
  {
    tur: "ayar-eksik",
    desen: /tanımlı değil|tanımlı olmayan|tanımsız değişken|tanımlanmamış|not configured|is not set|missing (env|environment)|eksik ortam|ortam değişkeni/i,
    sebep: "Gerekli bir ortam değişkeni tanımlı değil.",
    yapilacak: ["Vercel → Project → Settings → Environment Variables'da hata metnindeki değişkeni ekleyin.", "Ekledikten sonra yeniden dağıtın (Redeploy): yeni değişken eski dağıtıma geçmez."],
  },
  {
    tur: "hiz-siniri",
    desen: /\b429\b|rate[ _-]?limit|too many requests/i,
    sebep: "Karşı servis hız sınırına takıldı.",
    yapilacak: ["Geçici olabilir: bir sonraki tur genelde düzelir.", "Sürüyorsa işin sıklığını azaltın ya da sağlayıcının planını kontrol edin."],
  },
  {
    tur: "zaman-asimi",
    desen: /timed? ?out|timeout|aborted|aborterror|ETIMEDOUT|zaman aşımı|FUNCTION_INVOCATION_TIMEOUT/i,
    sebep: "İş ya da karşı servis zamanında yanıt vermedi.",
    yapilacak: ["Tek seferlikse bir sonraki tur düzeltir.", "Sürüyorsa: karşı servisin durumunu ve işin süresini (Vercel günlüğünde) kontrol edin; iş büyüdüyse parçalara bölün."],
  },
  {
    tur: "ulasilamadi",
    desen: /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|network|ulaşılamadı|ulaşamıyor|ECONNRESET/i,
    sebep: "Karşı servise ulaşılamadı (adres yanlış, servis kapalı ya da ağ sorunu).",
    yapilacak: ["Karşı ürünün adresi (ortam değişkenindeki URL) doğru mu, servis ayakta mı kontrol edin.", "Karşı ürünün kendi Vercel dağıtımı başarısız olmuş olabilir."],
  },
  {
    tur: "karsi-sunucu",
    desen: /\b50[0-4]\b|internal server error|bad gateway|service unavailable/i,
    sebep: "Karşı serviste sunucu hatası oluştu.",
    yapilacak: ["Karşı ürünün Vercel günlüğünde aynı saatteki hataya bakın.", "Karşı ürünün son dağıtımı bozuk olabilir; gerekirse bir önceki dağıtıma geri dönün."],
  },
];

export function hataTeshisi(metin: string | null | undefined): Teshis | null {
  if (!metin?.trim()) return null;
  const kural = KURALLAR.find((k) => k.desen.test(metin));
  return kural ? { tur: kural.tur, sebep: kural.sebep, yapilacak: kural.yapilacak } : null;
}

/* Hata metni OLMAYAN arızalar: iş hiç koşmamış ya da gecikmiş ama düşmemiş. */
export const ZAMANLAYICI_TESHISI: Teshis = {
  tur: "zamanlayici",
  sebep: "Zamanlayıcı işi çağırmıyor (hata yok, çünkü iş hiç başlamıyor).",
  yapilacak: [
    "Vercel → Project → Settings → Cron Jobs: iş listede ve etkin mi?",
    "Son üretim dağıtımı başarılı mı? Cron yalnızca üretim dağıtımında çalışır; derleme düştüyse eski dağıtım sürer.",
    "Rotanın yolu değiştiyse vercel.json'daki kaydı da güncelleyip yeniden dağıtın.",
  ],
};

/** Vercel günlüğü: hata metninin tamamı ve yığın izi orada. */
export const VERCEL_GUNLUGU = "https://vercel.com/arvo-os/arvo-os/logs";
