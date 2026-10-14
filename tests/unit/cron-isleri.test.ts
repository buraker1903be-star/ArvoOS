import assert from "node:assert/strict";
import test from "node:test";
import { cronAralikMetni, cronAraligiDk, cronDurumlari, cronIsleri, cronSorunlari, cronUyarisi, gecikmeEsigiDk, type CronKaydi } from "@/lib/cron-isleri";

test("cron aralığı yalnızca bu depodaki iki biçimden çıkarılır", () => {
  assert.equal(cronAraligiDk("*/2 * * * *"), 2);
  assert.equal(cronAraligiDk("*/10 * * * *"), 10);
  assert.equal(cronAraligiDk("0 6 * * *"), 24 * 60);
  assert.equal(cronAraligiDk("50 4 * * *"), 24 * 60);
  // Tanınmayan biçimde null: uydurulmuş bir aralık "gecikme yok" derken
  // işin saatlerce durduğunu örtebilirdi.
  assert.equal(cronAraligiDk("0 6 * * 1"), null);
  assert.equal(cronAraligiDk("0 6 1 * *"), null);
  assert.equal(cronAraligiDk("*/15 2 * * *"), null);
  assert.equal(cronAraligiDk("0 6 * *"), null);
  assert.equal(cronAraligiDk("*/0 * * * *"), null);
});

/*
  Bu test vercel.json'ı okuyor. Egzotik bir zamanlamayla yeni bir cron
  eklendiğinde ya da tanımsız bir iş eklendiğinde burada düşüyor; yoksa
  Sistem Sağlığı ekranı o iş için sessizce "aralık çıkarılamadı" ya da
  yolun kendisini ad diye yazardı.
*/
test("vercel.json'daki her zamanlanmış işin aralığı ve tanımı var", () => {
  const isler = cronIsleri();
  assert.ok(isler.length >= 5, "zamanlanmış iş listesi boş");
  for (const is of isler) {
    assert.notEqual(is.aralikDk, null, `${is.yol}: zamanlama ayrıştırılamadı (${is.zamanlama})`);
    assert.ok(is.aciklama.length > 0, `${is.yol}: "durursa ne olur" cümlesi yazılmamış`);
    assert.ok(!is.ad.startsWith("api/"), `${is.yol}: insan okunur adı yok`);
  }
});

test("gecikme eşiği aralığın bir katı artı tolerans; tolerans 5–60 dakika", () => {
  assert.equal(gecikmeEsigiDk(2), 7);
  assert.equal(gecikmeEsigiDk(10), 20);
  assert.equal(gecikmeEsigiDk(60), 120);
  // Günlük iş: 25 saat. Toleransı aralığın katı yapmak iki güne kadar sessiz bırakıyordu.
  assert.equal(gecikmeEsigiDk(24 * 60), 24 * 60 + 60);
});

const SIMDI = new Date("2026-10-14T12:00:00Z");
const once = (dk: number) => new Date(SIMDI.getTime() - dk * 60000).toISOString();
const kayit = (yol: string, alan: Partial<CronKaydi>): CronKaydi => ({
  is_adi: yol, son_calisma: once(1), son_basarili: once(1), sonuc: "tamam", sure_ms: 120, ayrinti: {}, ...alan,
});

test("kaydı olmayan iş 'hic' durumunda ve sorun sayılmaz", () => {
  const durumlar = cronDurumlari([], SIMDI);
  assert.equal(durumlar.length, cronIsleri().length);
  assert.ok(durumlar.every((d) => d.durum === "hic"));
  // Kayıt tutma 14.10.2026'da girdi: ekran ilk açıldığında beş kırmızı
  // satır göstermek, sonraki gerçek alarmın da okunmamasına yol açardı.
  assert.deepEqual(cronSorunlari(durumlar), []);
});

test("son koşmanın eskimesi 'gecikti', yeni koşmanın düşmesi 'dustu'", () => {
  const posta = "/api/cron/posta-esitleme";
  const yeni = cronDurumlari([kayit(posta, {})], SIMDI).find((d) => d.yol === posta)!;
  assert.equal(yeni.durum, "tamam");

  const eski = cronDurumlari([kayit(posta, { son_calisma: once(30), son_basarili: once(30) })], SIMDI)
    .find((d) => d.yol === posta)!;
  assert.equal(eski.durum, "gecikti");
  assert.equal(eski.gecikmeDk, 30);

  const dusen = cronDurumlari([kayit(posta, { sonuc: "hata", son_basarili: once(3) })], SIMDI)
    .find((d) => d.yol === posta)!;
  assert.equal(dusen.durum, "dustu");
});

/*
  GECİKME SON BAŞARILI KOŞMAYA GÖRE. Her iki dakikada bir düşen bir iş
  "son koşma"ya bakıldığında her zaman yeni koşmuş görünür ve ekran yeşil
  kalırdı — oysa iş saatlerdir yapılmıyor.
*/
test("sürekli düşen iş, son koşması yeni olsa bile gecikmiş sayılır", () => {
  const posta = "/api/cron/posta-esitleme";
  const d = cronDurumlari([kayit(posta, { son_calisma: once(1), sonuc: "hata", son_basarili: once(180) })], SIMDI)
    .find((d) => d.yol === posta)!;
  assert.equal(d.durum, "gecikti");
  // Ekranda yazan "en son koşma" yine bir dakika önce: iki bilgi ayrı.
  assert.equal(d.gecikmeDk, 1);
  assert.equal(cronSorunlari(cronDurumlari([kayit(posta, { son_calisma: once(1), sonuc: "hata", son_basarili: once(180) })], SIMDI)).length, 1);
});

test("hiç başarılı koşması olmayan iş, son koşmasına göre ölçülür", () => {
  const posta = "/api/cron/posta-esitleme";
  const d = cronDurumlari([kayit(posta, { son_calisma: once(2), sonuc: "hata", son_basarili: null })], SIMDI)
    .find((d) => d.yol === posta)!;
  assert.equal(d.durum, "dustu");
  const eski = cronDurumlari([kayit(posta, { son_calisma: once(60), sonuc: "hata", son_basarili: null })], SIMDI)
    .find((d) => d.yol === posta)!;
  assert.equal(eski.durum, "gecikti");
});

test("günlük iş 25 saate kadar gecikmiş sayılmaz", () => {
  const hatirlatma = "/api/cron/abonelik-hatirlatma";
  const bul = (dk: number) => cronDurumlari([kayit(hatirlatma, { son_calisma: once(dk), son_basarili: once(dk) })], SIMDI)
    .find((d) => d.yol === hatirlatma)!.durum;
  assert.equal(bul(24 * 60), "tamam");
  assert.equal(bul(25 * 60), "tamam");
  assert.equal(bul(26 * 60), "gecikti");
});

test("zamanlayıcıda olmayan bir işin kaydı listeyi şişirmez", () => {
  // vercel.json kaynak: girdisi kaldırılmış bir işin eski kayıtları ekranda
  // "koşan iş" gibi görünmemeli.
  const durumlar = cronDurumlari([kayit("/api/cron/kaldirilmis", {})], SIMDI);
  assert.ok(durumlar.every((d) => d.yol !== "/api/cron/kaldirilmis"));
  assert.ok(durumlar.every((d) => d.durum === "hic"));
});

test("aralık metni ekranda ve bildirimde aynı cümle", () => {
  assert.equal(cronAralikMetni(2), "2 dakikada bir");
  assert.equal(cronAralikMetni(10), "10 dakikada bir");
  assert.equal(cronAralikMetni(24 * 60), "her gün");
  assert.equal(cronAralikMetni(null), "aralık çıkarılamadı");
});

/*
  Bildirim telefonda saatler sonra okunabiliyor: metinde saat değil GEÇEN
  SÜRE yazıyor. İlk cümle "durursa ne olur" — kurucu işin adından değil
  sonucundan karar veriyor.
*/
test("gecikme uyarısı beklenen aralığı ve son başarılı koşmayı söylüyor", () => {
  const posta = "/api/cron/posta-esitleme";
  const simdi = new Date();
  const oncesi = (dk) => new Date(simdi.getTime() - dk * 60000).toISOString();
  const durum = cronDurumlari([{
    is_adi: posta, son_calisma: oncesi(1), son_basarili: oncesi(185), sonuc: "hata", sure_ms: 90, ayrinti: {},
  }], simdi).find((d) => d.yol === posta)!;
  assert.equal(durum.durum, "gecikti");

  const uyari = cronUyarisi(durum);
  assert.equal(uyari.baslik, "Posta eşitlemesi gecikti");
  assert.match(uyari.metin, /ortak kutulara gelen e-posta panele düşmez/);
  assert.match(uyari.metin, /2 dakikada bir/);
  assert.match(uyari.metin, /3 saat önce/);
  // Mutlak saat yazılmıyor.
  assert.ok(!/\d{2}:\d{2}/.test(uyari.metin), uyari.metin);
});

test("hiç başarılı koşmamış iş için 'başarılı koşması yok' yazıyor", () => {
  const posta = "/api/cron/posta-esitleme";
  const simdi = new Date();
  const durum = cronDurumlari([{
    is_adi: posta, son_calisma: new Date(simdi.getTime() - 90 * 60000).toISOString(),
    son_basarili: null, sonuc: "hata", sure_ms: null, ayrinti: {},
  }], simdi).find((d) => d.yol === posta)!;
  assert.equal(durum.durum, "gecikti");
  assert.match(cronUyarisi(durum).metin, /Hiç başarılı koşması yok/);
});

test("yeni koşması düşen iş için başlık 'düştü'", () => {
  const arc = "/api/cron/arc-sync";
  const simdi = new Date();
  const durum = cronDurumlari([{
    is_adi: arc, son_calisma: new Date(simdi.getTime() - 60000).toISOString(),
    son_basarili: new Date(simdi.getTime() - 3 * 60000).toISOString(), sonuc: "hata", sure_ms: 800, ayrinti: {},
  }], simdi).find((d) => d.yol === arc)!;
  assert.equal(durum.durum, "dustu");
  const uyari = cronUyarisi(durum);
  assert.equal(uyari.baslik, "ArvoARC köprüsü düştü");
  assert.match(uyari.metin, /Son koşma hata verdi/);
});

/*
  ZAMANLAYICIYA HİÇ KAYDOLMAMIŞ İŞ. "Kaydı yok" kuralının kendi kör
  noktası: kayıt tutma yeni başladığında bütün işler kayıtsız olur ve
  nötr sayılmaları doğrudur — ama hiç çağrılmayan bir iş de sonsuza
  kadar nötr kalıyordu. Ayıraç sistemin kendi geçmişi.
*/
test("kayıt tutma eskiyse, hiç koşmamış iş gecikmiş sayılır", () => {
  const posta = "/api/cron/posta-esitleme";
  const baslangic = (dk: number) => new Date(SIMDI.getTime() - dk * 60000);

  // Kayıt tutma 3 dakikadır sürüyor: 2 dakikalık işin eşiği 7 dk, henüz erken.
  const taze = cronDurumlari([], SIMDI, baslangic(3)).find((d) => d.yol === posta)!;
  assert.equal(taze.durum, "hic");

  // 90 dakikadır kayıt tutuluyor ama bu iş hiç koşmamış: arıza.
  const eski = cronDurumlari([], SIMDI, baslangic(90)).find((d) => d.yol === posta)!;
  assert.equal(eski.durum, "gecikti");
  assert.equal(eski.gecikmeDk, 90);
  assert.equal(eski.sonCalisma, null);
});

test("günlük iş, kayıt tutma 25 saati geçene kadar nötr kalır", () => {
  const gunluk = "/api/cron/abonelik-hatirlatma";
  const bul = (dk: number) => cronDurumlari([], SIMDI, new Date(SIMDI.getTime() - dk * 60000))
    .find((d) => d.yol === gunluk)!.durum;
  assert.equal(bul(20 * 60), "hic");
  assert.equal(bul(26 * 60), "gecikti");
});

test("kayıt başlangıcı bilinmiyorsa eski davranış: hepsi nötr", () => {
  assert.ok(cronDurumlari([], SIMDI).every((d) => d.durum === "hic"));
  assert.ok(cronDurumlari([], SIMDI, null).every((d) => d.durum === "hic"));
});

test("hiç çağrılmamış iş için uyarı zamanlayıcıyı işaret ediyor", () => {
  const posta = "/api/cron/posta-esitleme";
  const d = cronDurumlari([], SIMDI, new Date(SIMDI.getTime() - 120 * 60000)).find((x) => x.yol === posta)!;
  const uyari = cronUyarisi(d);
  assert.match(uyari.metin, /Zamanlayıcı bu işi hiç çağırmadı/);
  // "Hiç başarılı koşması yok" başka bir durum: iş koşuyor ama düşüyor.
  assert.doesNotMatch(uyari.metin, /Hiç başarılı koşması yok/);
});
