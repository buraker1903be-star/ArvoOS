/*
  ORTAK POSTA KUTUSU — Google OAuth'un saf parçaları.

  Burada ağ çağrısı yok: adres kurma, durum (state) doğrulama ve
  Google'ın cevaplarını okuma. Ağa çıkan kısım lib/posta-hesabi.ts'te;
  ayrı durmalarının sebebi bu dosyanın birim testten import
  edilebilmesi (tests/unit/posta-oauth.test.ts).

  NEDEN TEK KAPSAM (gmail.modify):

  Gmail API'sinde mesaj göndermek gmail.send, gmail.compose, gmail.modify
  ya da mail.google.com kapsamlarından BİRİNİ istiyor; gmail.modify ikisini
  birden karşılıyor (okuma + etiketleme + gönderme) ve kalıcı silmeye izin
  vermiyor. İki ayrı kapsam istemek, kullanıcıya iki satır daha gösterip
  aynı yetkiyi almak demekti. mail.google.com ise fazlası: kutuyu kalıcı
  silebilen bir yetkiyi istememek, isteyip kullanmamaktan iyidir.
*/

export const POSTA_KAPSAMLARI = ["https://www.googleapis.com/auth/gmail.modify"] as const;

const YETKILENDIRME_UCU = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_UCU = "https://oauth2.googleapis.com/token";

/**
 * Google'a gönderilecek izin adresi.
 *
 * access_type=offline ve prompt=consent BİRLİKTE gerekiyor: Google
 * yenileme belirtecini yalnızca ilk onayda veriyor, kullanıcı daha önce
 * izin verdiyse ikinci turda refresh_token ALANI HİÇ GELMİYOR. Bağlantıyı
 * yenilemek isteyen kurum bu yüzden "bağlandı" görüp ertesi gün
 * "yetkilendirme düştü" ile karşılaşıyordu. prompt=consent her seferinde
 * yeni bir yenileme belirteci getiriyor.
 *
 * login_hint ortak kutunun adresi: Google hesap seçme ekranında doğru
 * hesabı öne alır. Yanlış hesapla bağlanmayı ENGELLEMEZ — onu geri
 * dönüşte gerçek adresi okuyarak doğruluyoruz.
 */
export function yetkilendirmeUrl(girdi: {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint?: string | null;
}): string {
  const parametreler = new URLSearchParams({
    client_id: girdi.clientId,
    redirect_uri: girdi.redirectUri,
    response_type: "code",
    scope: POSTA_KAPSAMLARI.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: girdi.state,
  });
  if (girdi.loginHint) parametreler.set("login_hint", girdi.loginHint);
  return `${YETKILENDIRME_UCU}?${parametreler.toString()}`;
}

/**
 * Durum (state) değeri: rastgele bir tek seferlik değer + kurum kimliği.
 *
 * Tek seferlik değer çerezde de duruyor ve geri dönüşte karşılaştırılıyor
 * (CSRF). Kurum kimliği ise AYRI bir sorunu çözüyor: kullanıcı izin
 * ekranındayken başka bir çalışma alanına geçebiliyor ve geri dönüş o
 * kurumun bağlamında işleniyordu — A kurumunun kutusu B kurumuna
 * bağlanırdı.
 */
export function durumuKur(tekSeferlik: string, organizationId: string): string {
  return `${tekSeferlik}.${organizationId}`;
}

export type DurumSonucu = { gecerli: true; organizationId: string } | { gecerli: false; sebep: string };

export function durumuDogrula(gelen: string | null, cerezdeki: string | null, aktifKurum: string): DurumSonucu {
  if (!gelen) return { gecerli: false, sebep: "Google'dan dönen istekte doğrulama değeri yok." };
  if (!cerezdeki) return { gecerli: false, sebep: "Bağlantı isteği zaman aşımına uğradı. Baştan deneyin." };
  const ayirac = gelen.indexOf(".");
  if (ayirac < 1) return { gecerli: false, sebep: "Doğrulama değeri tanınmadı." };
  const tekSeferlik = gelen.slice(0, ayirac);
  const organizationId = gelen.slice(ayirac + 1);
  /* Sabit zamanlı karşılaştırmaya gerek yok: değer tek seferlik, çerezde
     ve yalnızca eşitlik soruluyor; sızdıracak bir sır taşımıyor. */
  if (tekSeferlik !== cerezdeki) return { gecerli: false, sebep: "Doğrulama değeri eşleşmedi. Bağlantı isteği baştan başlatılmalı." };
  if (!organizationId) return { gecerli: false, sebep: "Doğrulama değerinde kurum yok." };
  if (organizationId !== aktifKurum) {
    return { gecerli: false, sebep: "Bağlantı başka bir çalışma alanında başlatılmış. O alana geçip tekrar deneyin." };
  }
  return { gecerli: true, organizationId };
}

export type TokenCevabi = {
  erisimBelirteci: string;
  yenilemeBelirteci: string | null;
  sonaErme: Date;
  kapsamlar: string[];
};

/**
 * Google'ın belirteç cevabını okur. Hata durumunda Türkçe sebep döner;
 * Google'ın kendi metni ("invalid_grant") kullanıcıya hiçbir şey
 * anlatmıyor ve en sık sebebi de söylemiyor.
 */
export function tokenCevabiniOku(ham: unknown, simdi = new Date()): TokenCevabi | { hata: string } {
  const veri = (ham ?? {}) as Record<string, unknown>;
  if (typeof veri.error === "string") {
    if (veri.error === "invalid_grant") {
      return { hata: "Google yetkilendirmeyi reddetti. İzin kaldırılmış ya da süresi dolmuş olabilir; bağlantıyı yeniden kurun." };
    }
    if (veri.error === "invalid_client") {
      return { hata: "Google istemci kimliği ya da gizli anahtarı kabul edilmedi. Ayarlardaki değerleri kontrol edin." };
    }
    if (veri.error === "redirect_uri_mismatch") {
      return { hata: "Google'daki yönlendirme adresi bu panelinkiyle aynı değil. Cloud projesindeki OAuth istemcisine panelin adresini ekleyin." };
    }
    return { hata: `Google yetkilendirmeyi tamamlamadı (${veri.error}).` };
  }
  const erisimBelirteci = typeof veri.access_token === "string" ? veri.access_token : "";
  if (!erisimBelirteci) return { hata: "Google'dan erişim belirteci gelmedi." };

  /*
    expires_in saniye; 60 saniye pay bırakıyoruz. Payı bırakmazsak
    "henüz geçerli" diye alınan belirteç, istek Google'a varana kadar
    ölebiliyor ve hata kullanıcıya rastgele düşen bir 401 olarak
    görünüyor.
  */
  const saniye = typeof veri.expires_in === "number" && veri.expires_in > 60 ? veri.expires_in - 60 : 0;
  return {
    erisimBelirteci,
    yenilemeBelirteci: typeof veri.refresh_token === "string" && veri.refresh_token ? veri.refresh_token : null,
    sonaErme: new Date(simdi.getTime() + saniye * 1000),
    kapsamlar: typeof veri.scope === "string" ? veri.scope.split(" ").filter(Boolean) : [],
  };
}

/** İstenen kapsamların hepsi verildi mi. Eksikse hangisi eksik, onu söyler. */
export function kapsamEksigi(verilen: readonly string[]): string | null {
  const eksik = POSTA_KAPSAMLARI.filter((kapsam) => !verilen.includes(kapsam));
  if (!eksik.length) return null;
  return `Google izni eksik verildi (${eksik.join(", ")}). Posta kutusu okunamaz; izni baştan verin.`;
}

/**
 * Bağlanan kutu, kurumun yazdığı adres mi.
 *
 * Adres ekranda kurumun kimliği olarak görünüyor ve giden postalarda
 * "kimden" olarak kullanılacak. Kullanıcının yazdığına güvenmek,
 * kişisel hesabına bağlanıp ekranda ortak adresi gösteren bir kurum
 * bırakırdı. Büyük/küçük harf ve baştaki/sondaki boşluk önemsiz.
 */
export function adresUyusuyorMu(yazilan: string, googledenGelen: string): boolean {
  const sadelestir = (deger: string) => deger.trim().toLowerCase();
  return Boolean(googledenGelen) && sadelestir(yazilan) === sadelestir(googledenGelen);
}
