/*
  SIK EŞİTLEMENİN ÖN KOŞULLARI.

  Eşitleme 10 dakikadan 2 dakikaya indi ve açık sekme dakikada bir
  kendi turunu tetikliyor. Sıklığı artırmak tek başına bir satırlık bir
  değişiklik; ama o satır, altındaki üç kuralı bozan bir değişiklikle
  birleşirse Gmail tarafında sessizce pahalıya ya da yanlışa gidiyor.
  Burada o üç kural duruyor:

   1. Erişim belirteci ÖNBELLEKTEN. Eski kod her turda Google'a gidip
      bir saat geçerli bir belirteç alıyor, tek istekte kullanıp
      atıyordu. Dakikada bir yenileme Google'ın kısıtına çarpar ve
      yenileme belirtecini düşürebilir — yani kutu komple durur.
   2. Önbellekteki belirteç, kimlik bilgileri DEĞİŞTİĞİ her yerde
      düşüyor. Düşmezse yeniden bağlanan kurum bir saat boyunca ESKİ
      hesabın kutusunu okumaya devam eder.
   3. History imleci, okunmayan sayfa kaldıysa İLERLEMİYOR. İlerlerse
      atlanan sayfalardaki mesajlar bir daha hiç istenmez.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { degisimleriTopla, kutudaGorunurMu } from "../../lib/posta-ayristirma";

const oku = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const HESAP = oku("lib/posta-hesabi.ts");
const ESITLEME = oku("lib/posta-esitleme.ts");
const EYLEMLER = oku("app/panel/posta/actions.ts");
const CANLI = oku("app/panel/posta/canli-yenileme.tsx");
/* Yorumsuz sürüm: "sınır sunucuda" diyen bir AÇIKLAMA, sınırın burada
   da olduğu anlamına gelmez. İlk sürüm tam buna takıldı. */
const yorumsuz = (metin: string) =>
  metin.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const VERCEL = JSON.parse(oku("vercel.json")) as { crons: { path: string; schedule: string }[] };

describe("history imleci", () => {
  test("tek sayfa: imleç sayfanın historyId'sine taşınır", () => {
    const sonuc = degisimleriTopla([
      { history: [{ messages: [{ id: "a" }, { id: "b" }] }], historyId: "500" },
    ]);
    assert.deepEqual(sonuc.kimlikler, ["a", "b"]);
    assert.equal(sonuc.yeniImlec, "500");
  });

  test("aynı mesaj birden çok kayıtta geçse de bir kez çekilir", () => {
    // Bir mesaja hem etiket eklenip hem kaldırılınca iki kayıt geliyor;
    // iki kez çekmek aynı mesaj için iki Gmail isteği demekti.
    const sonuc = degisimleriTopla([
      { history: [{ messages: [{ id: "a" }] }, { messages: [{ id: "a" }, { id: "b" }] }], historyId: "7" },
    ]);
    assert.deepEqual(sonuc.kimlikler, ["a", "b"]);
  });

  test("sayfalar BİTMEDİYSE imleç taşınmaz", () => {
    const sonuc = degisimleriTopla([
      { history: [{ messages: [{ id: "a" }] }], historyId: "10", nextPageToken: "s2" },
      { history: [{ messages: [{ id: "b" }] }], historyId: "20", nextPageToken: "s3" },
    ]);
    assert.deepEqual(sonuc.kimlikler, ["a", "b"], "okunan sayfalar yine işlenmeli");
    assert.equal(sonuc.yeniImlec, null, "okunmayan sayfa varken imleç ilerlerse mesajlar kaybolur");
  });

  test("son sayfada belirteç yoksa imleç en son historyId'ye taşınır", () => {
    const sonuc = degisimleriTopla([
      { history: [{ messages: [{ id: "a" }] }], historyId: "10", nextPageToken: "s2" },
      { history: [{ messages: [{ id: "b" }] }], historyId: "20" },
    ]);
    assert.equal(sonuc.yeniImlec, "20");
  });

  test("değişiklik yoksa kimlik yok, imleç yine de ilerler", () => {
    // Boş cevap normal hâl: iki dakikada bir çoğu tur böyle geçiyor.
    const sonuc = degisimleriTopla([{ historyId: "99" }]);
    assert.deepEqual(sonuc.kimlikler, []);
    assert.equal(sonuc.yeniImlec, "99");
  });

  test("hiç sayfa okunamadıysa imleç oynamaz", () => {
    assert.deepEqual(degisimleriTopla([]), { kimlikler: [], yeniImlec: null });
  });
});

describe("kutuda görünecek mesajlar", () => {
  test("gelen ve gönderilen girer", () => {
    assert.equal(kutudaGorunurMu(["INBOX", "UNREAD"]), true);
    assert.equal(kutudaGorunurMu(["SENT"]), true);
  });

  test("taslak, spam ve çöp girmez", () => {
    // Artımlı tur bunları da döndürüyor; süzgeçsiz bırakmak ekibin
    // ortak kutusuna yarım taslakları konuşma diye yazmak demekti.
    assert.equal(kutudaGorunurMu(["DRAFT", "INBOX"]), false);
    assert.equal(kutudaGorunurMu(["SPAM"]), false);
    assert.equal(kutudaGorunurMu(["TRASH", "INBOX"]), false);
  });

  test("etiketsiz ya da yalnızca arşivdeki mesaj girmez", () => {
    assert.equal(kutudaGorunurMu(undefined), false);
    assert.equal(kutudaGorunurMu(["IMPORTANT", "CATEGORY_PERSONAL"]), false);
  });
});

describe("pencere sorgusu", () => {
  test("INBOX ve SENT AYRI sorgularda", () => {
    /* Gmail'de labelIds VE anlamına geliyor ("match ALL of the specified
       label IDs"). Tek sorguda ikisini birden yazmak, gelen postanın
       hiçbirini döndürmeyen bir sorgu üretiyordu. */
    assert.doesNotMatch(
      yorumsuz(ESITLEME), /labelIds=INBOX&labelIds=SENT/,
      "tek sorguda iki etiket: Gmail bunu VE sayıyor, gelen posta hiç gelmez",
    );
    assert.match(ESITLEME, /for \(const etiket of \["INBOX", "SENT"\]\)/);
  });
});

describe("erişim belirteci önbelleği", () => {
  const govde = HESAP.slice(HESAP.indexOf("export async function postaErisimBelirteci"));

  test("süresi dolmamış belirteç Google'a gidilmeden kullanılıyor", () => {
    const erken = govde.indexOf("decryptSecret(hesap.erisim_belirteci_enc");
    const istek = govde.indexOf("fetch(TOKEN_UCU");
    assert.notEqual(erken, -1, "önbellekten okuma yok: her tur Google'a gidiyor");
    assert.ok(erken < istek, "önbellek okuması yenileme isteğinden ÖNCE olmalı");
    assert.match(govde, /erisim_belirteci_biter[\s\S]{0,200}?getTime\(\) > Date\.now\(\)/);
  });

  test("yenilenen belirteç saklanıyor", () => {
    assert.match(govde, /erisim_belirteci_enc:\s*encryptSecret\(okunan\.erisimBelirteci\)/);
    assert.match(govde, /erisim_belirteci_biter:\s*okunan\.sonaErme\.toISOString\(\)/);
  });

  test("belirteç düz metin saklanmıyor", () => {
    assert.doesNotMatch(
      HESAP, /erisim_belirteci_enc:\s*okunan\.erisimBelirteci/,
      "erişim belirteci kutunun tamamını okuyabiliyor; şifresiz saklanamaz",
    );
  });

  test("kimlik bilgisi değişen HER yerde önbellek düşüyor", () => {
    /* Üç yol var ve üçü de aynı tehlikeyi taşıyor: önbellekte kalan
       belirteçle bir saat boyunca ESKİ hesabın kutusu okunur. */
    for (const [ad, imza] of [
      ["anahtarları kaydetme", "refresh_token_enc: null,"],
      ["yeniden bağlanma", "refresh_token_enc: encryptSecret(okunan.yenilemeBelirteci),"],
      ["yetkilendirme reddi", 'status: "hata",'],
    ] as const) {
      const yer = HESAP.indexOf(imza);
      assert.notEqual(yer, -1, `${ad}: beklenen yazma bulunamadı`);
      const blok = HESAP.slice(yer, HESAP.indexOf(")", HESAP.indexOf("}", yer)));
      assert.match(blok, /erisim_belirteci_enc:/, `${ad}: önbellekteki belirteç düşürülmüyor`);
    }
  });
});

describe("tur kilidi ve sıklık", () => {
  test("kilit tek sorguda, koşuluyla birlikte alınıyor", () => {
    // AGENTS.md: "önce kontrol et sonra yaz" yeterli sayılmaz. Kilidi
    // okuyup sonra yazmak, tam da engellemek istediği yarışı bırakır.
    const govde = ESITLEME.slice(ESITLEME.indexOf("async function kilidiAl"));
    const blok = govde.slice(0, govde.indexOf("\n}"));
    assert.match(blok, /\.update\(\{ esitleniyor_at/);
    assert.match(blok, /\.or\(`esitleniyor_at\.is\.null,esitleniyor_at\.lt\./);
    assert.match(blok, /\.select\(/, "güncellenen satır dönmezse kilit alınamamıştır");
  });

  test("kilit hata durumunda da bırakılıyor", () => {
    const govde = ESITLEME.slice(ESITLEME.indexOf("export async function kurumPostasiniEsitle"));
    assert.match(govde.slice(0, govde.indexOf("\n}")), /finally\s*\{[\s\S]*?kilidiBirak/);
  });

  test("zamanlayıcı iki dakikada bir", () => {
    const cron = VERCEL.crons.find((satir) => satir.path === "/api/cron/posta-esitleme");
    assert.ok(cron, "posta eşitleme zamanlayıcısı yok");
    assert.equal(cron!.schedule, "*/2 * * * *");
  });
});

describe("açık sekmede tazeleme", () => {
  test("yalnızca sekme görünürken Gmail'e gidiyor", () => {
    // Görünürlük koşulu olmadan, unutulup açık bırakılan bir sekme
    // kimsenin bakmadığı bir ekran için kutuyu gece boyu yokluyor.
    assert.match(CANLI, /visibilityState !== "visible"\)\s*return/);
    assert.match(CANLI, /addEventListener\("visibilitychange"/);
    assert.match(CANLI, /removeEventListener\("visibilitychange"/, "etki temizlenmezse dinleyici birikir");
  });

  test("hız sınırı tek yerde: sunucuda", () => {
    assert.match(EYLEMLER, /ASGARI_ARALIK_MS/, "sunucuda alt sınır yok: her sekme ayrı tur açar");
    assert.match(EYLEMLER, /sonEsitleme[\s\S]{0,120}?ASGARI_ARALIK_MS\)\s*return/);
    assert.doesNotMatch(
      yorumsuz(CANLI), /ASGARI_ARALIK|Date\.now\(\) -/,
      "sınır istemciye de kopyalanmış: biri değişince diğeri sessizce yanlış kalır",
    );
  });

  test("tazeleme hatası ekrana düşmüyor", () => {
    const govde = EYLEMLER.slice(EYLEMLER.indexOf("export async function kutuyuYenile"));
    assert.match(govde, /try\s*\{[\s\S]*?\}\s*catch/);
  });
});
