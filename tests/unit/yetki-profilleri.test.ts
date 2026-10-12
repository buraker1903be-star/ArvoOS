import assert from "node:assert/strict";
import test from "node:test";
import { departmanaUygunProfiller, departmanTuru, profilBul, profilDepartmanEngeli, profilModulKararlari, profilUygulandiMi, YETKI_PROFILLERI } from "@/lib/yetki-profilleri";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";
import { TUM_YETKILER, varsayilanAcikMi } from "@/lib/yetkiler";

/*
  Profil, yetkilendirme ekranındaki on beş kutucuğu isimlendiriyor.
  Burada sınananlar: katalog tutarlılığı (var olmayan modül/yetenek
  yazılmamış, Kurum Sahibi atanmıyor), kararın BÜTÜN modülleri
  kapsaması ve "uygulandı mı" ölçütünün gevşememesi.
*/

const MODULLER = PERMISSION_MODULES.map((m) => ({ key: m.key }));
const profil = profilBul("operasyon-muduru")!;

test("katalog tutarlı: bilinen rol, bilinen modül, bilinen yetenek", () => {
  for (const p of YETKI_PROFILLERI) {
    assert.ok(PERMISSION_ROLES.some((r) => r.key === p.rol), `bilinmeyen rol: ${p.rol}`);
    /* Kurum Sahibi profille atanmaz: owner kısıtlanamaz, profilin
       kapattığı modüller onda sessizce etkisiz kalırdı. */
    assert.notEqual(p.rol, "owner");
    for (const modul of p.acikModuller) {
      assert.ok(MODULLER.some((m) => m.key === modul), `bilinmeyen modül: ${modul}`);
    }
    for (const yetki of p.acikYetkiler) {
      assert.ok(TUM_YETKILER.some((y) => y.key === yetki), `bilinmeyen yetenek: ${yetki}`);
    }
  }
});

test("profilin yetenekleri rolün VARSAYILANI içinde — RLS gevşetilmiyor", () => {
  /*
    rlsBagli yetenekler panelden "açılamaz": veritabanı politikası da
    rolü denetliyor, düğmeyi göstermek kullanıcıyı "sildim ama
    silinmedi"de bırakır (AGENTS.md). Profil bu yüzden yalnızca
    rolünde zaten varsayılan olan yetenekleri sabitliyor.
  */
  for (const p of YETKI_PROFILLERI) {
    for (const yetki of p.acikYetkiler) {
      assert.ok(varsayilanAcikMi(p.rol, yetki), `${p.rol} rolünde varsayılan kapalı: ${yetki}`);
    }
  }
});

test("modül kararı bütün modülleri kapsıyor, listede olmayan kapalı", () => {
  const kararlar = profilModulKararlari(profil, MODULLER);
  assert.equal(kararlar.length, MODULLER.length, "her modül için açık bir karar olmalı");
  const harita = new Map(kararlar.map((k) => [k.module_key, k.can_access]));
  assert.equal(harita.get("operations"), true);
  assert.equal(harita.get("posta"), true);
  assert.equal(harita.get("crm"), false);
  assert.equal(harita.get("finance"), false);
  assert.equal(harita.get("hr"), false);
  assert.equal(harita.get("reports"), false);
});

const uygun = () => ({
  rol: "manager",
  modulIstisnalari: new Map(profilModulKararlari(profil, MODULLER).map((k) => [k.module_key, k.can_access])),
  yetkiIstisnalari: new Map(profil.acikYetkiler.map((k) => [k, true])),
});

test("uygulandı mı: tam küme doğru, eksik parça yanlış", () => {
  assert.equal(profilUygulandiMi(profil, uygun(), MODULLER), true);

  const rolFarkli = { ...uygun(), rol: "member" };
  assert.equal(profilUygulandiMi(profil, rolFarkli, MODULLER), false, "rol tutmuyorsa uygulanmış sayılmaz");

  /* "Rolden gelen" bırakılmış tek bir modül bile uyumsuz: profilin
     amacı rol kuralı değişince kaymamaktı. */
  const eksikModul = uygun();
  eksikModul.modulIstisnalari.delete("crm");
  assert.equal(profilUygulandiMi(profil, eksikModul, MODULLER), false);

  const acilmisModul = uygun();
  acilmisModul.modulIstisnalari.set("finance", true);
  assert.equal(profilUygulandiMi(profil, acilmisModul, MODULLER), false, "elle açılan modül profili bozar");

  const eksikYetki = uygun();
  eksikYetki.yetkiIstisnalari.delete("operations.ekip.gor");
  assert.equal(profilUygulandiMi(profil, eksikYetki, MODULLER), false);
});

test("bilinmeyen profil anahtarı null", () => {
  assert.equal(profilBul("yok-boyle-bir-profil"), null);
  assert.equal(profilBul(null), null);
});

test("departman türü addan çıkıyor; Türkçe harf ve büyük harf gözetilmez", () => {
  assert.equal(departmanTuru("Satış Departmanı"), "satis");
  assert.equal(departmanTuru("SATIŞ"), "satis");
  assert.equal(departmanTuru("satis ekibi"), "satis");
  assert.equal(departmanTuru("Operasyon Departmanı"), "operasyon");
  assert.equal(departmanTuru("OPERASYON"), "operasyon");
  assert.equal(departmanTuru("Yönetim Departmanı"), null);
  assert.equal(departmanTuru(null), null);
});

test("satış departmanı Satış Müdürü, operasyon departmanı Operasyon Müdürü olabilir", () => {
  const satis = profilBul("satis-muduru")!;
  const operasyon = profilBul("operasyon-muduru")!;
  assert.deepEqual(departmanaUygunProfiller("Satış Departmanı").map((p) => p.key), ["satis-muduru"]);
  assert.deepEqual(departmanaUygunProfiller("Operasyon Departmanı").map((p) => p.key), ["operasyon-muduru"]);
  assert.equal(profilDepartmanEngeli(satis, "Satış Departmanı"), null);
  assert.equal(profilDepartmanEngeli(operasyon, "Operasyon Departmanı"), null);
  assert.match(profilDepartmanEngeli(operasyon, "Satış Departmanı") ?? "", /yalnızca operasyon departmanındaki/);
  assert.match(profilDepartmanEngeli(satis, "Operasyon Departmanı") ?? "", /yalnızca satış departmanındaki/);
});

test("tanınmayan ya da boş departmanda her profil açık", () => {
  assert.equal(departmanaUygunProfiller("Muhasebe").length, YETKI_PROFILLERI.length);
  assert.equal(departmanaUygunProfiller(null).length, YETKI_PROFILLERI.length);
  for (const p of YETKI_PROFILLERI) assert.equal(profilDepartmanEngeli(p, "Muhasebe"), null);
});
