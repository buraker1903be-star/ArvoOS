import assert from "node:assert/strict";
import test from "node:test";
import {
  POSTA_KAPSAMLARI,
  adresUyusuyorMu,
  durumuDogrula,
  durumuKur,
  kapsamEksigi,
  tokenCevabiniOku,
  yetkilendirmeUrl,
} from "@/lib/posta-oauth";

const KURUM = "11111111-1111-4111-8111-111111111111";
const BASKA_KURUM = "22222222-2222-4222-8222-222222222222";

test("izin adresi yenileme belirteci getirecek biçimde kuruluyor", () => {
  /*
    Gerileme koruması. Google yenileme belirtecini yalnızca
    access_type=offline VE prompt=consent birlikteyken veriyor; kullanıcı
    daha önce izin verdiyse refresh_token alanı hiç gelmiyor ve bağlantı
    ertesi gün "yetkilendirme düştü" diye ölüyor.
  */
  const adres = new URL(yetkilendirmeUrl({
    clientId: "istemci.apps.googleusercontent.com",
    redirectUri: "https://app.arvo-os.com/panel/settings/mail/geri-donus",
    state: "durum",
  }));
  assert.equal(adres.searchParams.get("access_type"), "offline");
  assert.equal(adres.searchParams.get("prompt"), "consent");
  assert.equal(adres.searchParams.get("response_type"), "code");
  assert.equal(adres.searchParams.get("scope"), POSTA_KAPSAMLARI.join(" "));
  assert.equal(adres.searchParams.get("redirect_uri"), "https://app.arvo-os.com/panel/settings/mail/geri-donus");
  // İstenmeyen yetki istenmiyor: kalıcı silme (mail.google.com) dışarıda.
  assert.ok(!adres.searchParams.get("scope")!.includes("mail.google.com"));
});

test("login_hint yalnızca adres varsa ekleniyor", () => {
  const hintli = new URL(yetkilendirmeUrl({ clientId: "a", redirectUri: "https://x/y", state: "d", loginHint: "info@firma.com" }));
  assert.equal(hintli.searchParams.get("login_hint"), "info@firma.com");
  const hintsiz = new URL(yetkilendirmeUrl({ clientId: "a", redirectUri: "https://x/y", state: "d", loginHint: null }));
  assert.equal(hintsiz.searchParams.get("login_hint"), null);
});

test("durum değeri gidiş dönüş eşleşiyor", () => {
  const durum = durumuKur("tek-seferlik", KURUM);
  const sonuc = durumuDogrula(durum, "tek-seferlik", KURUM);
  assert.deepEqual(sonuc, { gecerli: true, organizationId: KURUM });
});

test("durum değeri eşleşmezse reddediliyor", () => {
  const durum = durumuKur("tek-seferlik", KURUM);
  assert.equal(durumuDogrula(durum, "baska-deger", KURUM).gecerli, false);
  assert.equal(durumuDogrula(null, "tek-seferlik", KURUM).gecerli, false);
  assert.equal(durumuDogrula(durum, null, KURUM).gecerli, false);
  assert.equal(durumuDogrula("noktasiz", "noktasiz", KURUM).gecerli, false);
});

test("başka çalışma alanında başlatılan bağlantı bu kuruma yazılmıyor", () => {
  /*
    Kullanıcı izin ekranındayken çalışma alanı değiştirebiliyor ve geri
    dönüş o anki kurumun bağlamında işleniyor: A kurumunun posta kutusu
    B kurumuna bağlanırdı.
  */
  const durum = durumuKur("tek-seferlik", KURUM);
  const sonuc = durumuDogrula(durum, "tek-seferlik", BASKA_KURUM);
  assert.equal(sonuc.gecerli, false);
  assert.match((sonuc as { sebep: string }).sebep, /başka bir çalışma alanında/);
});

test("belirteç cevabı okunuyor ve sona ermeye pay bırakılıyor", () => {
  const simdi = new Date("2026-10-06T12:00:00Z");
  const sonuc = tokenCevabiniOku({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: POSTA_KAPSAMLARI.join(" ") }, simdi);
  assert.ok(!("hata" in sonuc));
  if ("hata" in sonuc) return;
  assert.equal(sonuc.erisimBelirteci, "at");
  assert.equal(sonuc.yenilemeBelirteci, "rt");
  // 3600 - 60 saniye pay: istek Google'a varana kadar ölmesin.
  assert.equal(sonuc.sonaErme.toISOString(), "2026-10-06T12:59:00.000Z");
});

test("kısa ömürlü belirteç payı eksiye düşürmüyor", () => {
  const simdi = new Date("2026-10-06T12:00:00Z");
  const sonuc = tokenCevabiniOku({ access_token: "at", expires_in: 30 }, simdi);
  assert.ok(!("hata" in sonuc));
  if ("hata" in sonuc) return;
  assert.equal(sonuc.sonaErme.toISOString(), "2026-10-06T12:00:00.000Z");
  // Yenileme belirteci ikinci onayda gelmiyor; alan null olmalı, boş metin değil.
  assert.equal(sonuc.yenilemeBelirteci, null);
});

test("Google hataları Türkçe sebebe çevriliyor", () => {
  // "invalid_grant" kullanıcıya hiçbir şey anlatmıyor ve en sık sebebi de söylemiyor.
  assert.match((tokenCevabiniOku({ error: "invalid_grant" }) as { hata: string }).hata, /İzin kaldırılmış/);
  assert.match((tokenCevabiniOku({ error: "invalid_client" }) as { hata: string }).hata, /istemci kimliği/);
  assert.match((tokenCevabiniOku({ error: "redirect_uri_mismatch" }) as { hata: string }).hata, /yönlendirme adresi/);
  assert.match((tokenCevabiniOku({ error: "bilinmeyen" }) as { hata: string }).hata, /bilinmeyen/);
  assert.match((tokenCevabiniOku({}) as { hata: string }).hata, /erişim belirteci gelmedi/);
});

test("eksik kapsam yakalanıyor", () => {
  assert.equal(kapsamEksigi([...POSTA_KAPSAMLARI]), null);
  assert.match(kapsamEksigi([]) ?? "", /Google izni eksik/);
});

test("bağlanan kutu ayardaki adresle karşılaştırılıyor", () => {
  // Yazılan adrese güvenmek, kişisel hesabına bağlanıp ekranda ortak
  // adresi gösteren bir kurum bırakırdı.
  assert.equal(adresUyusuyorMu(" Info@Firma.com ", "info@firma.com"), true);
  assert.equal(adresUyusuyorMu("info@firma.com", "baska@firma.com"), false);
  assert.equal(adresUyusuyorMu("info@firma.com", ""), false);
});

test("geri dönüş adresi isteğin geldiği alan adından kuruluyor", async () => {
  /*
    Gerileme: adres sabit "app.arvo-os.com" yazılıydı. Panel çok kiracılı
    ve kurum kendi doğrulanmış alan adından giriyor; ekran yanlış adresi
    kaydettiriyor, Google'a bulunulan alan adı gidiyor ve bağlantı daha
    ilk denemede redirect_uri_mismatch ile düşüyordu (06.10.2026,
    app.akademikmerkez.com).
  */
  const { postaGeriDonusAdresi } = await import("@/app/panel/settings/mail/ortak");
  const basliklar = (deger: Record<string, string>) => ({ get: (ad: string) => deger[ad] ?? null });

  assert.equal(
    postaGeriDonusAdresi(basliklar({ "x-forwarded-host": "app.akademikmerkez.com" })),
    "https://app.akademikmerkez.com/panel/settings/mail/geri-donus",
  );
  // Proxy arkasında x-forwarded-host kazanır; host iç adresi taşıyabiliyor.
  assert.equal(
    postaGeriDonusAdresi(basliklar({ "x-forwarded-host": "app.arvo-os.com", host: "ic-adres.vercel.app" })),
    "https://app.arvo-os.com/panel/settings/mail/geri-donus",
  );
  // Büyük harf ve port temizleniyor: Google birebir eşleşme istiyor.
  assert.equal(
    postaGeriDonusAdresi(basliklar({ host: "App.Arvo-OS.com:443" })),
    "https://app.arvo-os.com/panel/settings/mail/geri-donus",
  );
});
