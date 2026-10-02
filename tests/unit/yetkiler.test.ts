import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  TUM_YETKILER,
  YETKI_GRUPLARI,
  acilabilirMi,
  assertYetki,
  etkinYetkiler,
  gizliModulleriHesapla,
  varsayilanAcikMi,
  yetkiDegisikligiEngeli,
  yetkiTanimi,
} from "@/lib/yetkiler";

test("kurum sahibi hiçbir kuralla kısıtlanamaz", () => {
  // Kendi panelinden kilitlenip dışarıda kalmayı önlemek için.
  const yetkiler = etkinYetkiler({
    rol: "owner",
    gizliModuller: new Set(["crm", "finance", "hr", "operations"]),
    rolKurallari: TUM_YETKILER.map((yetki) => ({ capability_key: yetki.key, allowed: false })),
    kisiKurallari: TUM_YETKILER.map((yetki) => ({ capability_key: yetki.key, allowed: false })),
  });
  assert.equal(yetkiler.size, TUM_YETKILER.length);
});

test("ayar yapılmamış kurumda bugünkü davranış birebir korunuyor", () => {
  /*
    Gerileme koruması: yetenek katalogu eskiden kodda sabit olan rol
    listelerinin yerine geçti. Varsayılanlar kaydığında kurumlar sessizce
    yetki kazanır ya da kaybeder.
  */
  const admin = etkinYetkiler({ rol: "admin" });
  const manager = etkinYetkiler({ rol: "manager" });
  const member = etkinYetkiler({ rol: "member" });
  const operasyoncu = etkinYetkiler({ rol: "operasyoncu" });

  // Yönetici: her şey (owner ile aynı küme)
  assert.equal(admin.size, TUM_YETKILER.length);

  // Yönetici (sınırlı): yönetim + şeflik işleri var, silme ve kurum ayarı yok
  assert.ok(manager.has("crm.kayit.ata"));
  assert.ok(manager.has("operations.is.yonet"));
  assert.ok(manager.has("hr.prim.gor"));
  assert.ok(!manager.has("crm.teklif.sil"));
  assert.ok(!manager.has("finance.kayit.yonet"));
  assert.ok(!manager.has("settings.kurum.yonet"));

  // Satış ve operasyon personelinde yönetim yetkisi yok
  for (const yetkiler of [member, operasyoncu]) {
    assert.equal(yetkiler.size, 0);
  }
});

test("rol kuralı varsayılanı ezer, kişi kuralı rolü ezer", () => {
  const rolKurallari = [{ capability_key: "crm.takvim.tum", allowed: true }];
  assert.ok(etkinYetkiler({ rol: "member", rolKurallari }).has("crm.takvim.tum"));

  // Aynı kurum, tek kişi için geri kapatılıyor.
  assert.ok(!etkinYetkiler({
    rol: "member",
    rolKurallari,
    kisiKurallari: [{ capability_key: "crm.takvim.tum", allowed: false }],
  }).has("crm.takvim.tum"));

  // Ters yön: rolde kapalı, kişide açık (en sık istenen istisna).
  assert.ok(etkinYetkiler({
    rol: "operasyoncu",
    rolKurallari: [{ capability_key: "operations.arsiv.yonet", allowed: false }],
    kisiKurallari: [{ capability_key: "operations.arsiv.yonet", allowed: true }],
  }).has("operations.arsiv.yonet"));
});

test("modülü kapalı olanın o modüldeki yetkileri de kapalı", () => {
  // Görmediği ekranda silme yetkisi anlamsız ve yanıltıcı olurdu.
  const yetkiler = etkinYetkiler({
    rol: "admin",
    gizliModuller: new Set(["finance"]),
  });
  assert.ok(!yetkiler.has("finance.kayit.yonet"));
  assert.ok(!yetkiler.has("finance.gor"));
  // Modülden bağımsız yetkiler etkilenmez.
  assert.ok(yetkiler.has("settings.kurum.yonet"));
  assert.ok(yetkiler.has("crm.teklif.yonet"));
});

test("RLS'e bağlı yetki kısıtlanabilir ama açılamaz", () => {
  /*
    Teklif silme politikası yalnızca owner/admin'e izin veriyor. Panelden
    manager'a "aç" demek düğmeyi gösterir, RLS satırı sessizce eler ve
    kullanıcı "sildim ama silinmedi" ile kalır — bu hata bir kez yaşandı.
  */
  const acildiMi = etkinYetkiler({
    rol: "manager",
    rolKurallari: [{ capability_key: "crm.teklif.sil", allowed: true }],
    kisiKurallari: [{ capability_key: "crm.teklif.sil", allowed: true }],
  });
  assert.ok(!acildiMi.has("crm.teklif.sil"));
  assert.equal(acilabilirMi("manager", "crm.teklif.sil"), false);
  assert.equal(acilabilirMi("admin", "crm.teklif.sil"), true);

  // Kısıtlama yönü çalışmaya devam ediyor.
  assert.ok(!etkinYetkiler({
    rol: "admin",
    rolKurallari: [{ capability_key: "crm.teklif.sil", allowed: false }],
  }).has("crm.teklif.sil"));
});

test("RLS'e bağlı olmayan yetki gevşetilebilir", () => {
  // Satış personeline teklif hazırlatmak isteyen kurum bunu yapabilmeli:
  // RLS zaten atanmış kaydın personeline yazma izni veriyor.
  assert.equal(acilabilirMi("member", "crm.teklif.yonet"), true);
  assert.ok(etkinYetkiler({
    rol: "member",
    rolKurallari: [{ capability_key: "crm.teklif.yonet", allowed: true }],
  }).has("crm.teklif.yonet"));
});

test("kişi modül istisnası rolde kapalı modülü açabilir", () => {
  // Eskiden yalnızca rol satırları ve yalnızca can_access=false okunuyordu;
  // "rolde kapalı ama bu kişide açık" ifade edilemiyordu.
  const gizli = gizliModulleriHesapla({
    rol: "operasyoncu",
    rolSatirlari: [{ module_key: "crm", can_access: false }, { module_key: "finance", can_access: false }],
    kisiSatirlari: [{ module_key: "crm", can_access: true }],
  });
  assert.deepEqual([...gizli], ["finance"]);
});

test("kurum sahibinin gizli modülü olmaz", () => {
  const gizli = gizliModulleriHesapla({
    rol: "owner",
    rolSatirlari: [{ module_key: "crm", can_access: false }],
    kisiSatirlari: [{ module_key: "hr", can_access: false }],
  });
  assert.equal(gizli.size, 0);
});

test("kendi yetkilendirme yetkisini kapatmak engellenir", () => {
  // Kapatan Yönetici sayfaya bir daha giremez; geri açacak tek kişi Kurum
  // Sahibi kalır ve küçük kurumlarda o kişi aynı kişidir.
  assert.match(
    yetkiDegisikligiEngeli({ rol: "admin", kendisiMi: true, yetkiYonetimiAcikKaliyor: false }) ?? "",
    /bir daha giremezsiniz/,
  );
  assert.equal(yetkiDegisikligiEngeli({ rol: "admin", kendisiMi: true, yetkiYonetimiAcikKaliyor: true }), null);
  assert.equal(yetkiDegisikligiEngeli({ rol: "admin", kendisiMi: false, yetkiYonetimiAcikKaliyor: false }), null);
  // Kurum Sahibi kısıtlanamadığı için onun kuralı yok.
  assert.equal(yetkiDegisikligiEngeli({ rol: "owner", kendisiMi: true, yetkiYonetimiAcikKaliyor: false }), null);
});

test("hata metni hangi yetkinin eksik olduğunu söylüyor", () => {
  // "Bu işlem için yetkiniz yok." diyen eski mesajlar yüzünden hangi
  // kutucuğun kapalı olduğunu bulmak tahmine kalıyordu.
  assert.throws(() => assertYetki(new Set(), "crm.teklif.sil"), /Teklif silme/);
  assert.doesNotThrow(() => assertYetki(new Set(["crm.teklif.sil"]), "crm.teklif.sil"));
});

test("katalog tutarlı: anahtarlar tekil, modüller bilinen küme", () => {
  const anahtarlar = TUM_YETKILER.map((yetki) => yetki.key);
  assert.equal(new Set(anahtarlar).size, anahtarlar.length, "yinelenen yetki anahtarı");
  const modulAnahtarlari = new Set(["crm", "operations", "finance", "hr", "documents", "reports"]);
  for (const yetki of TUM_YETKILER) {
    if (yetki.modul !== null) assert.ok(modulAnahtarlari.has(yetki.modul), `bilinmeyen modül: ${yetki.modul}`);
    assert.ok(yetki.varsayilan.every((rol) => ["admin", "manager", "member", "operasyoncu"].includes(rol)),
      `owner varsayılanda yazılmaz (zaten her şeye sahip): ${yetki.key}`);
    assert.equal(yetkiTanimi(yetki.key)?.label, yetki.label);
  }
  // Her yetenek tek bir grupta duruyor; matris aksi hâlde satırı iki kez çizer.
  assert.equal(YETKI_GRUPLARI.flatMap((grup) => grup.yetkiler).length, TUM_YETKILER.length);
  assert.ok(varsayilanAcikMi("admin", "settings.yetki.yonet"));
});

test("panelde yetki kararı rol listesiyle verilmiyor", () => {
  /*
    Gerileme koruması. Yetki kararları eskiden seksen kadar yerde
    `["owner","admin"].includes(membership.role)` olarak yazılıydı; kurum
    bunların hiçbirini değiştiremiyordu. Yeni bir karar eklenirken aynı
    kalıba dönülürse kurum o kararı da göremez.

    İzin verilen tek kullanım: rolün GEÇERLİ olup olmadığını denetlemek
    (ekip davetinde gelen rol adı) ve bildirim alıcısı sorgusu.
  */
  const kok = path.resolve(import.meta.dirname, "../../app/panel");
  const desen = /\[[^\]]*"(?:owner|admin|manager)"[^\]]*\]\s*\.includes\(\s*[a-zA-Z_.]*\.role\s*\)/;
  const bulunan: string[] = [];
  const gez = (dizin: string) => {
    for (const girdi of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, girdi.name);
      if (girdi.isDirectory()) { gez(tam); continue; }
      if (!/\.tsx?$/.test(girdi.name)) continue;
      const metin = fs.readFileSync(tam, "utf8");
      metin.split("\n").forEach((satir, index) => {
        if (!desen.test(satir)) return;
        // Geçerli rol adı denetimi yetki kararı değil.
        if (satir.includes("Geçersiz rol")) return;
        bulunan.push(`${path.relative(kok, tam)}:${index + 1}`);
      });
    }
  };
  gez(kok);
  assert.deepEqual(bulunan, [], `yetki kararı rol listesiyle veriliyor:\n${bulunan.join("\n")}`);
});
