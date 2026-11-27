/*
  TEMİZLİK YARIŞLARI VE BAĞLAMA İŞLEVLERİNİN GÜVEN SINIRI — GERÇEK
  PostgreSQL 17 + PostgREST + Storage API (F6 PR8 son güvenlik kabulü). CI'DA DEĞİL.

  Temizleyicinin adımları (al → onayla → Storage silme → sonuç) burada
  route'un yaptığı sırayla ve aynı istemcilerle elle sürülüyor; böylece
  "onaydan sonra / silmeden önce" aralığına araya girilebiliyor. İki yarış
  20261115145234'te KAYDA BAĞLI PDF'i sildi (aynı adla yeniden yükleme +
  bağlama; ÜAK kaydının doğrudan PostgREST'ten yazılması) ve
  20261115154855'le kapandı — bu dosya ikisini de sabitliyor.

  Kural (her senaryonun sonunda denetlenen): HİÇBİR KAYIT var olmayan bir
  nesneyi göstermez.

  Koşturma: PR7_ANON_KEY=… PR7_SERVICE_KEY=… node --test tests/entegrasyon/docentlik-yaris.test.mjs
*/
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { AM, K, R } from "../db/docentlik-ortak.mjs";

const ANON = process.env.PR7_ANON_KEY;
const SERVIS = process.env.PR7_SERVICE_KEY;
const GECIT = "http://127.0.0.1:54400";
const PG = "postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres";
const KOVA = "docentlik-belgeleri";
const PAROLA = "pr7-Sentetik-1";
if (!ANON || !SERVIS) throw new Error("PR7_ANON_KEY ve PR7_SERVICE_KEY gerekli (yerel sentetik).");

const psql = (sql) => execFileSync("psql", [PG, "-tAqc", sql], { encoding: "utf8" }).trim();
/* Tek OTURUM, ayrı ifadeler (psql -c hepsini tek örtük işlemde koşturur; burada işlem sınırları sınanıyor). */
const oturum = (sql) => execFileSync("psql", [PG, "-tAqX", "-v", "ON_ERROR_STOP=0"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const admin = createClient(GECIT, SERVIS, { auth: { persistSession: false } });
const istemci = async (eposta) => {
  const c = createClient(GECIT, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: eposta, password: PAROLA });
  if (error) throw new Error(error.message);
  return c;
};
const PDF = () => new Blob([`%PDF-1.4\n%yaris ${crypto.randomUUID()}\n`], { type: "application/pdf" });
const faaliyetYolu = () => `${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf`;
const uakYolu = () => `${AM}/uak/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`;
const yaslandir = (ad) => psql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id='${KOVA}' and name='${ad}'`);
const varMi = (ad) => psql(`select count(*) from storage.objects where bucket_id='${KOVA}' and name='${ad}'`) === "1";
const belgeYolu = () => psql(`select coalesce(belge_yolu,'') from public.docentlik_faaliyetleri where id='${R.faaliyet}'`) || null;
const bagla = (yol, eski = belgeYolu(), kullanici = K.sahip, faaliyet = R.faaliyet) =>
  admin.rpc("docentlik_belge_bagla", { p_kullanici: kullanici, p_org: AM, p_faaliyet: faaliyet, p_yol: yol, p_eski: eski });
/* Değişmez: hiçbir faaliyet ya da ÜAK kaydı kovada olmayan bir nesneyi göstermez. */
const sahipsizBaglanti = () => psql(`select count(*) from (
    select belge_yolu y from public.docentlik_faaliyetleri where belge_yolu is not null
    union all select depo_yolu from public.docentlik_uak_tablolari) k
  where not exists (select 1 from storage.objects o where o.bucket_id='${KOVA}' and o.name = k.y)`);

/* Temizleyicinin adımları — route'taki sırayla. */
async function alVeOnayla(ad) {
  const al = await admin.rpc("docentlik_temizlik_al", { p_esik: "24 hours", p_sinir: 500 });
  if (al.error) throw new Error(al.error.message);
  const aday = al.data.find((x) => x.ad === ad);
  assert.ok(aday, "aday alınmadı");
  const onay = await admin.rpc("docentlik_temizlik_onayla", { p_nesne: aday.nesne_id, p_kira: aday.kira });
  if (onay.error) throw new Error(onay.error.message);
  return { ...aday, onay: onay.data };
}
const depodanSil = (ad) => admin.storage.from(KOVA).remove([ad]);
const sonuc = (a, basarili) => admin.rpc("docentlik_temizlik_sonuc", { p_nesne: a.nesne_id, p_kira: a.kira, p_basarili: basarili, p_hata: basarili ? null : "x" });

let sahip, yonetici, uye;
const yollar = [];
const temizle = () => {
  psql("delete from private.docentlik_belge_temizligi");
  psql(`update public.docentlik_faaliyetleri set belge_yolu = null where id in ('${R.faaliyet}','${R.faaliyetIptal}')`);
  psql("delete from public.docentlik_uak_tablolari where temel_alan like 'PR8 yarış%'");
};
before(async () => {
  temizle();
  [sahip, yonetici, uye] = await Promise.all([istemci("sahip@am.test"), istemci("yonetici@am.test"), istemci("uye@am.test")]);
});
after(async () => {
  temizle();
  for (const ad of yollar) await admin.storage.from(KOVA).remove([ad]).catch(() => {});
});
const yukle = async (c, ad) => {
  const r = await c.storage.from(KOVA).upload(ad, PDF(), { contentType: "application/pdf" });
  if (r.error) throw new Error(r.error.message);
  yollar.push(ad);
  return ad;
};

describe("temizlik yarışları (gerçek PG + Storage)", () => {
  test("onaydan sonra AYNI nesneyi bağlama: reddedilir (24 saatten eski + kiralı); kayıt değişmez", async () => {
    temizle();
    const ad = await yukle(sahip, faaliyetYolu());
    yaslandir(ad);
    const a = await alVeOnayla(ad);
    assert.equal(a.onay, ad);
    assert.equal((await bagla(ad)).error?.code, "DB410");
    assert.equal(belgeYolu(), null);
    assert.equal((await depodanSil(a.onay)).data?.length, 1);
    await sonuc(a, true);
    assert.equal(sahipsizBaglanti(), "0");
  });

  test("onaydan sonra sahip nesneyi silip AYNI adla yeniden yükler ve bağlamaya çalışır: reddedilir; gecikmiş silme bağlı bir belgeyi götürmez", async () => {
    temizle();
    const ad = await yukle(sahip, faaliyetYolu());
    yaslandir(ad);
    const a = await alVeOnayla(ad);
    assert.equal(a.onay, ad);
    assert.equal((await sahip.storage.from(KOVA).remove([ad])).data?.length, 1, "sahip kendi sahipsiz nesnesini silebilir");
    await yukle(sahip, ad); // yeni kimlik, yeni tarih, aynı ad
    // 20261115145234'te bu çağrı GEÇİYORDU (kira nesne kimliğine bakıyordu) ve aşağıdaki silme bağlı belgeyi götürüyordu.
    assert.equal((await bagla(ad)).error?.code, "DB410", "temizlikteki ad bağlandı");
    assert.equal(belgeYolu(), null);
    await depodanSil(a.onay); // gecikmiş silme
    await sonuc(a, true);
    assert.equal(sahipsizBaglanti(), "0", "bir kayıt silinmiş nesneyi gösteriyor");
  });

  test("kira süresi dolar, ikinci temizleyici işi bitirir; ilkinin gecikmiş silmesi aynı adla yeni bağlanan bir belgeyi götüremez (24 saatlik ad kilidi)", async () => {
    temizle();
    const ad = await yukle(sahip, faaliyetYolu());
    yaslandir(ad);
    const a = await alVeOnayla(ad); // A onayladı, silme isteği "yolda"
    psql(`update private.docentlik_belge_temizligi set kira_bitis = now() - interval '1 second' where ad = '${ad}'`);
    const b = await alVeOnayla(ad); // kira düştü: B aynı nesneyi alır
    assert.notEqual(b.kira, a.kira);
    assert.equal(b.onay, ad);
    assert.equal((await depodanSil(b.onay)).data?.length, 1);
    await sonuc(b, true);
    assert.equal(psql(`select count(*) from private.docentlik_belge_temizligi where ad='${ad}' and kapandi_at is not null`), "1", "satır kapanmış olarak kalmalı");
    // Sahip aynı adla yeniden yükleyip bağlamaya çalışır → kilitli.
    await yukle(sahip, ad);
    assert.equal((await bagla(ad)).error?.code, "DB410");
    // A'nın gecikmiş silmesi şimdi gelir: yalnızca bağlanmamış yeni nesneyi götürür.
    await depodanSil(a.onay);
    await sonuc(a, true); // bayat kira: etkisiz
    assert.equal(psql(`select count(*) from private.docentlik_belge_temizligi where ad='${ad}' and kapandi_at is not null`), "1");
    assert.equal(belgeYolu(), null);
    assert.equal(sahipsizBaglanti(), "0");
  });

  test("Storage silmesi gecikir ve başarısız sayılır; kayıt yine bağlanamaz, nesne sonra silinir", async () => {
    temizle();
    const ad = await yukle(sahip, faaliyetYolu());
    yaslandir(ad);
    const a = await alVeOnayla(ad);
    await sonuc(a, false); // silme yanıtı gelmedi → başarısız
    assert.equal((await bagla(ad)).error?.code, "DB410");
    psql(`update private.docentlik_belge_temizligi set kira_bitis = now() - interval '1 second' where ad = '${ad}'`);
    const b = await alVeOnayla(ad);
    assert.equal(b.onay, ad);
    assert.equal((await depodanSil(b.onay)).data?.length, 1);
    await sonuc(b, true);
    assert.equal(varMi(ad), false);
    assert.equal(sahipsizBaglanti(), "0");
  });

  test("iki eşzamanlı temizleyici (ayrı bağlantılar): adaylar ayrık, her nesne bir kez", async () => {
    temizle();
    const adlar = [];
    for (let i = 0; i < 12; i++) adlar.push(await yukle(sahip, faaliyetYolu()));
    for (const ad of adlar) yaslandir(ad);
    const [x, y] = await Promise.all([
      admin.rpc("docentlik_temizlik_al", { p_esik: "24 hours", p_sinir: 500 }),
      admin.rpc("docentlik_temizlik_al", { p_esik: "24 hours", p_sinir: 500 }),
    ]);
    const xa = x.data.filter((d) => adlar.includes(d.ad)).map((d) => d.ad);
    const ya = y.data.filter((d) => adlar.includes(d.ad)).map((d) => d.ad);
    assert.equal(xa.filter((ad) => ya.includes(ad)).length, 0, "aynı nesne iki temizleyiciye verildi");
    assert.equal(new Set([...xa, ...ya]).size, adlar.length);
  });

  test("ÜAK: onaydan sonra PostgREST'ten doğrudan o nesneye ÜAK kaydı yazılamaz; silme kayıtlı bir dosyayı götürmez", async () => {
    temizle();
    const ad = await yukle(yonetici, uakYolu());
    yaslandir(ad);
    const a = await alVeOnayla(ad);
    assert.equal(a.onay, ad);
    // 20261115145234'te bu yazım GEÇİYORDU.
    const ekle = await yonetici.from("docentlik_uak_tablolari").insert({ organization_id: AM, temel_alan: "PR8 yarış ÜAK", donem: "2026", depo_yolu: ad }).select("id");
    assert.equal(ekle.error?.code, "42501", JSON.stringify(ekle.error));
    await depodanSil(a.onay);
    await sonuc(a, true);
    assert.equal(sahipsizBaglanti(), "0");
  });

  test("ÜAK meşru akış hâlâ çalışıyor: yeni yüklenen kendi dosyası kaydedilir ve temizlenmez", async () => {
    temizle();
    const ad = await yukle(yonetici, uakYolu());
    const ekle = await yonetici.from("docentlik_uak_tablolari").insert({ organization_id: AM, temel_alan: "PR8 yarış meşru", donem: "2026", depo_yolu: ad }).select("id");
    assert.equal(ekle.error, null);
    yaslandir(ad);
    const al = await admin.rpc("docentlik_temizlik_al", { p_esik: "24 hours", p_sinir: 500 });
    assert.ok(!al.data.some((d) => d.ad === ad), "kayıtlı ÜAK dosyası aday oldu");
    // Var olan kaydı başka (eski) bir nesneye çevirmek de reddedilir.
    const eski = await yukle(yonetici, uakYolu());
    yaslandir(eski);
    const cevir = await yonetici.from("docentlik_uak_tablolari").update({ depo_yolu: eski }).eq("id", ekle.data[0].id).select("id");
    assert.equal(cevir.error?.code, "42501");
  });
});

describe("bağlama işlevlerinin service_role güven sınırı (gerçek PG + PostgREST)", () => {
  test("authenticated ve anon işlevi PostgREST'ten çağıramaz; yazım da reddedilir", async () => {
    temizle();
    const ad = await yukle(sahip, faaliyetYolu());
    const args = { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_yol: ad, p_eski: null };
    for (const c of [sahip, uye, createClient(GECIT, ANON, { auth: { persistSession: false } })]) {
      for (const fn of ["docentlik_belge_bagla", "docentlik_belge_kaldir", "docentlik_temizlik_al", "docentlik_temizlik_onayla", "docentlik_temizlik_sonuc"]) {
        const r = await c.rpc(fn, fn === "docentlik_belge_kaldir" ? { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_eski: null } : fn === "docentlik_belge_bagla" ? args : {});
        assert.ok(r.error, `${fn} istemciye açık`);
        assert.ok(["42501", "PGRST202"].includes(r.error.code), `${fn}: ${r.error.code}`);
      }
      assert.equal((await c.from("docentlik_faaliyetleri").update({ belge_yolu: ad }).eq("id", R.faaliyet).select("id")).error?.code, "42501");
    }
    assert.equal(belgeYolu(), null);
  });

  test("sahte jeton (yanlış imza, imzasız 'service_role') reddedilir", async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const govde = b64({ role: "service_role", iss: "supabase", exp: Math.floor(Date.now() / 1000) + 600 });
    const imzali = `${b64({ alg: "HS256", typ: "JWT" })}.${govde}`;
    const yanlis = `${imzali}.${crypto.createHmac("sha256", "yanlis-anahtar").update(imzali).digest("base64url")}`;
    const imzasiz = `${b64({ alg: "none", typ: "JWT" })}.${govde}.`;
    for (const jeton of [yanlis, imzasiz]) {
      const r = await fetch(`${GECIT}/rest/v1/rpc/docentlik_belge_kaldir`, {
        method: "POST", headers: { apikey: ANON, authorization: `Bearer ${jeton}`, "content-type": "application/json" },
        body: JSON.stringify({ p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_eski: null }),
      });
      assert.equal(r.status, 401, `sahte jeton kabul edildi (${r.status})`);
    }
  });

  test("kimlik yalnızca p_kullanici: işlemde önceden ayarlanmış başka bir JWT iddiası kararı değiştirmez", () => {
    const cikti = oturum(`
      set role service_role;
      begin;
      select set_config('request.jwt.claims', '{"sub":"${K.sahip}","role":"authenticated"}', true);
      select 'YABANCI:' || count(*) from public.docentlik_belge_kaldir('${K.yabanci}', '${AM}', '${R.faaliyet}', null);
      rollback;
      begin;
      select set_config('request.jwt.claims', '{"sub":"${K.yabanci}","role":"authenticated"}', true);
      select 'SAHIP:' || count(*) from public.docentlik_belge_kaldir('${K.sahip}', '${AM}', '${R.faaliyet}', null);
      rollback;
    `);
    assert.doesNotMatch(cikti, /YABANCI:/, "başka kullanıcı adına kaldırma geçti");
    assert.match(cikti, /SAHIP:1/, "sahip adına (önceden yabancı iddiası varken) geçmeliydi");
  });

  test("üyeliği iptal edilmiş kişi adına bağlama reddedilir (faaliyetin sahibi olsa da)", async () => {
    temizle();
    const ad = `${AM}/faaliyet/${K.iptal}/${R.faaliyetIptal}/${crypto.randomUUID()}.pdf`;
    // İptal edilmiş üye yükleyemez (kova politikası); nesneyi sunucu koyar — yalnızca işlevin kendi kararı sınanıyor.
    psql(`insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('${KOVA}', '${ad}', '${K.iptal}', '${K.iptal}', '{"mimetype":"application/pdf","size":10}')`);
    try {
      const r = await bagla(ad, null, K.iptal, R.faaliyetIptal);
      assert.equal(r.error?.code, "DB403", JSON.stringify(r.error));
    } finally {
      psql(`delete from storage.objects where bucket_id='${KOVA}' and name='${ad}'`);
    }
  });

  test("request.jwt.claims işlem dışına taşmaz: başarı, hata ve oturum düzeyi değer", () => {
    psql(`update public.docentlik_faaliyetleri set belge_yolu = null where id='${R.faaliyet}'`);
    const cikti = oturum(`
      set role service_role;
      select 'ONCE:' || coalesce(current_setting('request.jwt.claims', true), '');
      begin;
      select count(*) from public.docentlik_belge_kaldir('${K.sahip}', '${AM}', '${R.faaliyet}', null);
      select 'ICERIDE:' || current_setting('request.jwt.claims', true);
      commit;
      select 'BASARI_SONRA:' || coalesce(current_setting('request.jwt.claims', true), '') || '|' || coalesce(auth.uid()::text, '');
      begin;
      select count(*) from public.docentlik_belge_bagla('${K.sahip}', '${AM}', '${R.faaliyet}', '${AM}/faaliyet/${K.sahip}/${R.faaliyet}/${crypto.randomUUID()}.pdf', null);
      rollback;
      select 'HATA_SONRA:' || coalesce(current_setting('request.jwt.claims', true), '') || '|' || coalesce(auth.uid()::text, '');
      select set_config('request.jwt.claims', '{"sub":"${K.uye}"}', false);
      begin;
      select count(*) from public.docentlik_belge_kaldir('${K.sahip}', '${AM}', '${R.faaliyet}', null);
      commit;
      select 'OTURUM_SONRA:' || coalesce(auth.uid()::text, '');
    `);
    const satir = (etiket) => cikti.split("\n").find((s) => s.startsWith(etiket)) ?? "";
    assert.match(satir("ICERIDE:"), new RegExp(K.sahip), "işlem içinde iddia o kişi olmalı (beklenen, yalnızca bu işlem)");
    assert.equal(satir("BASARI_SONRA:"), "BASARI_SONRA:|", `başarıdan sonra sızdı: ${satir("BASARI_SONRA:")}`);
    assert.equal(satir("HATA_SONRA:"), "HATA_SONRA:|", `hatadan sonra sızdı: ${satir("HATA_SONRA:")}`);
    assert.equal(satir("OTURUM_SONRA:"), `OTURUM_SONRA:${K.uye}`, "oturum düzeyindeki değer işlevden sonra geri gelmeli");
  });

  test("PostgREST bağlantı havuzu: bağlama çağrılarıyla iç içe gelen başka kullanıcının isteği sahip kimliğini devralmaz", async () => {
    temizle();
    const turlar = [];
    for (let i = 0; i < 15; i++) {
      turlar.push(admin.rpc("docentlik_belge_kaldir", { p_kullanici: K.sahip, p_org: AM, p_faaliyet: R.faaliyet, p_eski: null }));
      turlar.push(uye.from("docentlik_faaliyetleri").select("id").eq("id", R.faaliyet));
    }
    const sonuclar = await Promise.all(turlar);
    for (let i = 0; i < sonuclar.length; i += 2) {
      assert.equal(sonuclar[i].error, null, JSON.stringify(sonuclar[i].error));
      assert.deepEqual(sonuclar[i + 1].data, [], "üye, sahibin faaliyetini gördü (kimlik sızdı)");
    }
  });
});
