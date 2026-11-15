/*
  F6 PR8 — BELGE YOLU GÜVENLİĞİ, SAHİPSİZ BELGE TEMİZLİĞİ, GÖZETİM ADLARI.
  Saf kurallar (lib/docentlik-temizlik, lib/docentlik-islem → belgeBaglamaHatasi)
  ve dosya sözleşmeleri. Veritabanı kuralları tests/db/docentlik-pr8.test.mjs'te,
  gerçek PostgREST/Storage ile tests/entegrasyon'da.
*/
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { TEMIZLIK_KOVASI, guvenliHataMetni, silinebilirYolMu, temizlikSonucu } from "@/lib/docentlik-temizlik";
import { belgeBaglamaHatasi, DOCENTLIK_KOVASI } from "@/lib/docentlik-islem";

const oku = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, "../..", p), "utf8");
const kod = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const U = "11111111-2222-4333-8444-555555555555";
const U2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("temizlik: yalnızca bu kova, yalnızca doçentlik yolu", () => {
  test("kova sabiti doçentlik kovası", () => assert.equal(TEMIZLIK_KOVASI, DOCENTLIK_KOVASI));
  test("faaliyet ve ÜAK yolları silinebilir", () => {
    assert.ok(silinebilirYolMu(`${U}/faaliyet/${U2}/${U}/${U2}.pdf`));
    assert.ok(silinebilirYolMu(`${U}/uak/${U2}/${U}.pdf`));
  });
  test("başka biçimdeki her ad reddedilir (başka kovanın yolları, '..', fazladan klasör, uzantı)", () => {
    for (const ad of [
      `${U}/faaliyet/${U2}/${U}.pdf`, `${U}/faaliyet/${U2}/${U}/../${U2}.pdf`, `${U}/faaliyet/${U2}/${U}/${U2}.png`,
      `${U}/tez/${U2}.pdf`, `${U2}/${U}.pdf`, `../${U}/uak/${U2}/${U}.pdf`, "", null, 42,
      `${U}/uak/${U2}/${U}.pdf/ek`,
    ]) assert.equal(silinebilirYolMu(ad), false, String(ad));
  });
});

describe("temizlik: günlüğe yol yazılmaz", () => {
  test("hata metnindeki yol ve dosya adı ayıklanır", () => {
    const m = guvenliHataMetni(new Error(`Object not found: ${U}/faaliyet/${U2}/${U}/${U2}.pdf in bucket`));
    assert.ok(!m.includes(U) && !m.includes(U2), m);
    assert.match(m, /\[yol\]/);
  });
  test("düz dosya adı da ayıklanır; metin 200 karakterle sınırlı; boş/bilinmeyen güvenli", () => {
    assert.ok(!guvenliHataMetni("tez-taslagi.pdf okunamadı").includes("tez-taslagi"));
    assert.ok(guvenliHataMetni("x".repeat(500)).length <= 200);
    assert.equal(guvenliHataMetni(undefined), "bilinmeyen hata");
    assert.equal(guvenliHataMetni({ message: "zaman aşımı" }), "zaman aşımı");
  });
  test("sonuç: başarısızlık varsa 'eksik', yoksa 'tamam'", () => {
    assert.equal(temizlikSonucu({ aday: 3, silinen: 3, atlanan: 0, basarisiz: 0 }), "tamam");
    assert.equal(temizlikSonucu({ aday: 3, silinen: 2, atlanan: 0, basarisiz: 1 }), "eksik");
    assert.equal(temizlikSonucu({ aday: 0, silinen: 0, atlanan: 0, basarisiz: 0 }), "tamam");
  });
});

describe("belge bağlama hata kodları", () => {
  test("her kodun Türkçe karşılığı; bilinmeyen kod ham iletiyi sızdırmaz", () => {
    for (const [kod_, desen] of [["DB403", /yetki/], ["DB404", /bulunamadı/], ["DB409", /değişti/], ["DB410", /yeniden yükleyin/], ["DB415", /PDF/], ["42501", /yetki/]] as const) {
      assert.match(belgeBaglamaHatasi({ code: kod_, message: "x" }), desen, kod_);
    }
    const g = belgeBaglamaHatasi({ code: "XX000", message: `iç hata ${U}/faaliyet/...` });
    assert.ok(!g.includes(U));
  });
});

describe("dosya sözleşmeleri", () => {
  const BAGLAMA = oku("app/panel/docentlik/belge-baglama.ts");
  const ISLEM = oku("app/panel/docentlik/actions.ts");
  const ROTA = oku("app/api/cron/docentlik-belge-temizligi/route.ts");

  test("belge-baglama.ts server-only ve 'use server' DEĞİL (kimliği parametreyle alan işlev dışarı açılmaz)", () => {
    assert.match(BAGLAMA, /^import "server-only";/);
    assert.ok(!/^\s*["']use server["']/m.test(BAGLAMA));
    const rpcler = [...kod(BAGLAMA).matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(rpcler.sort(), ["docentlik_belge_bagla", "docentlik_belge_kaldir"]);
    // Kimlik ve kurum yalnızca doğrulanmış bağlamdan.
    assert.match(BAGLAMA, /p_kullanici: b\.ben, p_org: b\.kurum/);
  });

  test("bağlama işlevlerini (ve belgeyiBagla/belgeyiKaldir'i) başka hiçbir sunucu yolu çağırmıyor", () => {
    /* Kimliği parametreyle alan işlev service_role'le çağrılıyor: tek kapı belge-baglama.ts, tek
       çağıran actions.ts (kimlik docentlikBaglami()'ndan). Yeni bir yol (route, cron, başka işlem)
       bu işlevi çağırırsa kimliği nereden aldığı burada yeniden incelenmeli. */
    const tara = (dizin: string): string[] => fs.readdirSync(path.resolve(import.meta.dirname, "../..", dizin), { withFileTypes: true })
      .flatMap((g) => (g.isDirectory() ? tara(`${dizin}/${g.name}`) : /\.(ts|tsx|mjs|js)$/.test(g.name) ? [`${dizin}/${g.name}`] : []));
    const dosyalar = [...tara("app"), ...tara("lib")];
    const rpc = dosyalar.filter((d) => /docentlik_belge_(bagla|kaldir)/.test(kod(oku(d))));
    assert.deepEqual(rpc, ["app/panel/docentlik/belge-baglama.ts"]);
    const sarmal = dosyalar.filter((d) => d !== "app/panel/docentlik/belge-baglama.ts" && /belgeyi(Bagla|Kaldir)\b/.test(kod(oku(d))));
    assert.deepEqual(sarmal, ["app/panel/docentlik/actions.ts"]);
  });

  test("actions.ts yönetici istemcisini kendisi açmıyor; belge_yolu'nu doğrudan yazmıyor", () => {
    const k = kod(ISLEM);
    assert.ok(!/createAdminClient/.test(k));
    assert.ok(!/update\(\{\s*belge_yolu/.test(k), "belge_yolu istemci oturumuyla yazılıyor");
    assert.match(k, /await nesneyiDogrula\(b, yol\);\s*await belgeyiBagla\(b, id, yol, mevcut\.belge_yolu\);/, "PDF doğrulaması bağlamadan önce");
    assert.match(k, /await belgeyiKaldir\(b, id, mevcut\.belge_yolu\);\s*await nesneyiSil/);
  });

  test("temizlik rotası: CRON_SECRET, istekten parametre YOK, sıra al → onayla → sil → sonuç, cronRotasi", () => {
    const k = kod(ROTA);
    assert.match(k, /if \(!authorized\(request\)\) return new Response\("Yetkisiz", \{ status: 401 \}\);/);
    assert.ok(!/request\.(json|formData|text)\(|searchParams|new URL\(request/.test(k), "istekten girdi okunuyor");
    assert.match(k, /cronRotasi\("\/api\/cron\/docentlik-belge-temizligi", kosu\)/);
    const sira = ["docentlik_temizlik_al", "docentlik_temizlik_onayla", ".remove([onay])", "await sonucYaz(true, null)"].map((s) => k.indexOf(s));
    assert.ok(sira.every((i) => i > 0) && sira.every((i, n) => n === 0 || i > sira[n - 1]), JSON.stringify(sira));
    assert.match(k, /if \(!silinebilirYolMu\(onay\) \|\| onay !== aday\.ad\)/);
    assert.match(k, /storage\.from\(TEMIZLIK_KOVASI\)/);
    assert.ok(!/console\.\w+\([^)]*\b(ad|onay)\b[^)]*\)/.test(k.replace(/nesne: aday\.nesne_id/g, "")), "günlüğe yol yazılıyor");
  });

  test("vercel.json'da saatlik ve lib/cron-isleri'nde tanımı var", () => {
    const v = JSON.parse(oku("vercel.json")) as { crons: { path: string; schedule: string }[] };
    assert.deepEqual(v.crons.find((c) => c.path === "/api/cron/docentlik-belge-temizligi"), { path: "/api/cron/docentlik-belge-temizligi", schedule: "35 * * * *" });
    assert.match(oku("lib/cron-isleri.ts"), /"\/api\/cron\/docentlik-belge-temizligi": \{\s*ad: "Doçentlik belge temizliği"/);
  });
});
