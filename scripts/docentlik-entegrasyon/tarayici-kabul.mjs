/*
  DOÇENTLİK — GERÇEK NEXT.JS TARAYICI KABULÜ (F6 PR7). CI'DA DEĞİL.

  Taklit YOK: `next build && next start` ile çalışan uygulama, gerçek
  GoTrue ile parolalı giriş, gerçek PostgREST/PostgreSQL ve gerçek Storage
  API (scripts/docentlik-entegrasyon/ortam.sh). Doğrulama ekranla yetinmez:
  her yazımdan sonra sonuç veritabanında da okunur (psql, yalnızca
  127.0.0.1). Yalnızca sentetik aktörler (tohum.mjs).

  Kullanım: PR7_UYGULAMA=http://127.0.0.1:3100 node scripts/docentlik-entegrasyon/tarayici-kabul.mjs
  Çıktı JSON; FAIL varsa çıkış kodu 1. GORUNTU=<dizin> ekran görüntüsü yazar.
*/
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const UYG = process.env.PR7_UYGULAMA ?? "http://127.0.0.1:3100";
const PG = "postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres";
if (!UYG.startsWith("http://127.0.0.1:")) throw new Error("Kabul yalnızca yerel uygulamada koşar.");
const PAROLA = "pr7-Sentetik-1";
const AM = "00000000-0000-4000-8000-00000000d0a1";
const SAHIP = "00000000-0000-4000-8000-00000000d011";
const FAALIYET = "00000000-0000-4000-8000-00000000d301";
const GORUNTU = process.env.GORUNTU;
const psql = (sql) => execFileSync("psql", [PG, "-tAqc", sql], { encoding: "utf8" }).trim();
const sayi = (sql) => Number(psql(sql));

const sonuc = {};
const kaydet = (ad, deger, kanit = undefined) => { sonuc[ad] = kanit === undefined ? deger : { gecti: deger === true, kanit }; };
const gectiMi = (v) => v === true || v?.gecti === true;

const tarayici = await chromium.launch();
async function oturum(eposta, boyut = { width: 1440, height: 900 }, tema = "light") {
  const ctx = await tarayici.newContext({ viewport: boyut });
  await ctx.addInitScript((t) => { try { localStorage.setItem("arvoos.theme", t); } catch {} }, tema);
  const sayfa = await ctx.newPage();
  const hatalar = [];
  sayfa.on("pageerror", (e) => hatalar.push(e.message));
  await sayfa.goto(`${UYG}/login`);
  await sayfa.fill("input[name=email]", eposta);
  await sayfa.fill("input[name=password]", PAROLA);
  await Promise.all([sayfa.waitForURL(/\/panel/, { timeout: 30000 }), sayfa.click("button[type=submit]")]);
  return { ctx, sayfa, hatalar };
}
const bildirim = async (sayfa, tur, desen, sure = 15000) => {
  const el = sayfa.locator(`.panel-toast[role="${tur === "hata" ? "alert" : "status"}"]`);
  await el.first().waitFor({ timeout: sure }).catch(() => {});
  const metin = (await el.allTextContents().catch(() => [])).join(" | ");
  return { ok: desen.test(metin), metin };
};
const git = async (sayfa, yol) => { await sayfa.goto(`${UYG}${yol}`); await sayfa.waitForLoadState("networkidle").catch(() => {}); };
const goruntu = async (sayfa, ad) => { if (GORUNTU) await sayfa.screenshot({ path: path.join(GORUNTU, `${ad}.png`), fullPage: true }); };
const pdfDosyasi = (ad, icerik = "%PDF-1.4\n%sentetik\n%%EOF\n") => ({ name: ad, mimeType: "application/pdf", buffer: Buffer.from(icerik) });

async function senaryo(ad, is) {
  try { await is(); } catch (e) { kaydet(ad, false, String(e?.message ?? e).slice(0, 400)); }
}

/* ---------------- 1. Akademisyen: özet, profil, faaliyet ---------------- */
await senaryo("akademisyen", async () => {
  const { ctx, sayfa, hatalar } = await oturum("sahip@am.test");
  // Özet: ekrandaki toplam = veritabanının toplamı (1500 faaliyet, tavan 1000'i aşıyor).
  await git(sayfa, "/panel/docentlik");
  const dbToplam = sayi(`select coalesce(sum(computed_points),0)::int from docentlik_faaliyetleri where owner_id='${SAHIP}'`);
  const dbAdet = sayi(`select count(*) from docentlik_faaliyetleri where owner_id='${SAHIP}'`);
  const serit = await sayfa.locator(".kayit-serit").first().textContent();
  const bicim = (n) => n.toLocaleString("tr-TR");
  kaydet("1.1 özet: ekrandaki sayılan/ham puan = veritabanı toplamı (1500+ faaliyet)", serit.includes(bicim(dbToplam)), { db: dbToplam, adet: dbAdet, ekran: serit.replace(/\s+/g, " ").slice(0, 200) });
  kaydet("1.2 özet: 'Toplam N faaliyet' veritabanıyla aynı", (await sayfa.getByText(`Toplam ${dbAdet} faaliyet`).count()) > 0, { db: dbAdet });
  await goruntu(sayfa, "1-ozet");

  // Profil
  await git(sayfa, "/panel/docentlik/profil");
  const alt = `PR7 alt alan ${Date.now() % 10000}`;
  await sayfa.fill("input[name=alt_alan]", alt);
  await sayfa.locator("form.docentlik-form button[type=submit]").first().click();
  const pb = await bildirim(sayfa, "basari", /Profil kaydedildi/);
  kaydet("1.3 profil kaydı: bildirim + veritabanı", pb.ok && psql(`select alt_alan from docentlik_profilleri where owner_id='${SAHIP}'`) === alt, pb);

  // Faaliyet ekle (çift tıklama dahil)
  await git(sayfa, "/panel/docentlik/faaliyetler");
  const once = sayi(`select count(*) from docentlik_faaliyetleri where owner_id='${SAHIP}'`);
  const baslik = `PR7 tarayıcı ${crypto.randomUUID().slice(0, 8)}`;
  await sayfa.getByRole("button", { name: "Yeni faaliyet" }).first().click();
  const form = sayfa.locator(".panel-modal-root form.docentlik-form");
  await form.locator("select[name=kriter_id]").selectOption({ index: 1 });
  await form.locator("input[name=baslik]").fill(baslik);
  await form.locator("input[name=birim_sayisi]").fill("2");
  await form.locator("input[name=yazar_sayisi]").fill("3");
  await form.locator("input[name=baslica_yazar][value=hayir]").check();
  const dugme = form.locator("button[type=submit]");
  await dugme.click();
  await dugme.click({ force: true, timeout: 500 }).catch(() => {});
  const eb = await bildirim(sayfa, "basari", /Faaliyet eklendi/);
  await sayfa.waitForTimeout(800);
  const yeni = psql(`select computed_points::text||'|'||paylasim_katsayisi::text from docentlik_faaliyetleri where title='${baslik}'`);
  kaydet("1.4 faaliyet ekleme: bildirim, tek satır (çift tıklama), puan tetikleyiciden", eb.ok && sayi(`select count(*) from docentlik_faaliyetleri where owner_id='${SAHIP}'`) === once + 1 && yeni.split("|").map(Number).join("|") === "20|0.5",
    { bildirim: eb.metin, satir: yeni });
  kaydet("1.5 eklemeden sonra liste yenilendi (revalidate)", (await sayfa.getByText(baslik).count()) > 0);

  // DP001 → ekrana: puan tetikleyicisinden SONRA çalışan geçici bir tetikleyici puanı bozuyor
  // (sentetik "çekirdek ≠ veritabanı" durumu). Kayıt yazılmamalı, Türkçe mesaj görünmeli, alanlar kalmalı.
  psql(`create or replace function public.pr7_bozuk() returns trigger language plpgsql as $$ begin new.computed_points := new.computed_points + 1; return new; end $$;
        create trigger zz_pr7_bozuk before insert or update on public.docentlik_faaliyetleri for each row execute function public.pr7_bozuk();`);
  try {
    await git(sayfa, "/panel/docentlik/faaliyetler");
    await sayfa.getByRole("button", { name: "Yeni faaliyet" }).first().click();
    const f2 = sayfa.locator(".panel-modal-root form.docentlik-form");
    await f2.locator("select[name=kriter_id]").selectOption({ index: 1 });
    await f2.locator("input[name=baslik]").fill("PR7 DP001");
    await f2.locator("button[type=submit]").click();
    const hb = await bildirim(sayfa, "hata", /puan|hesap/i);
    kaydet("1.6 DP001 Next.js ekranına ulaşıyor; kayıt yok; alanlar korunuyor",
      hb.ok && sayi(`select count(*) from docentlik_faaliyetleri where title='PR7 DP001'`) === 0 && (await f2.locator("input[name=baslik]").inputValue()) === "PR7 DP001", hb);
  } finally {
    psql("drop trigger if exists zz_pr7_bozuk on public.docentlik_faaliyetleri; drop function if exists public.pr7_bozuk();");
  }

  // Ağ kopması + DP002 → ekrana. İlk istek sunucuda İŞLENİR ama yanıtı tarayıcıya ULAŞMAZ:
  // istek tarayıcı bağlamının DIŞINDAN (Node fetch, aynı başlık ve çerezlerle) sunucuya iletilir,
  // tarayıcıya bağlantı kopması döner. (route.fetch() kullanılmıyor: o, yanıtın Set-Cookie'sini
  // tarayıcı bağlamına yazıyor ve gerçekte gelmeyecek başarı bildirimini gösteriyordu.)
  await git(sayfa, "/panel/docentlik/faaliyetler");
  await sayfa.getByRole("button", { name: "Yeni faaliyet" }).first().click();
  const f3 = sayfa.locator(".panel-modal-root form.docentlik-form");
  await f3.locator("select[name=kriter_id]").selectOption({ index: 1 });
  const b3 = `PR7 kopma ${crypto.randomUUID().slice(0, 6)}`;
  await f3.locator("input[name=baslik]").fill(b3);
  let kesildi = false;
  await sayfa.route("**/panel/docentlik/faaliyetler**", async (route) => {
    const istek = route.request();
    if (kesildi || istek.method() !== "POST") return route.continue();
    kesildi = true;
    const basliklar = { ...(await istek.allHeaders()) };
    delete basliklar["content-length"];
    await fetch(istek.url(), { method: "POST", headers: basliklar, body: istek.postDataBuffer() }).then((y) => y.arrayBuffer()).catch(() => {});
    return route.abort("connectionreset");
  });
  const hataOnce = hatalar.length;
  await f3.locator("button[type=submit]").click();
  const kopmaUyarisi = f3.locator("[role=alert]");
  await kopmaUyarisi.waitFor({ timeout: 10000 }).catch(() => {});
  await sayfa.unroute("**/panel/docentlik/faaliyetler**");
  const kopma = {
    satir: sayi(`select count(*) from docentlik_faaliyetleri where title='${b3}'`),
    uyari: (await kopmaUyarisi.textContent().catch(() => "")) ?? "",
    formAcik: await f3.isVisible().catch(() => false),
    baslikKorundu: (await f3.locator("input[name=baslik]").inputValue().catch(() => "")) === b3,
    yakalanmamis: hatalar.slice(hataOnce),
  };
  kaydet("1.7 ağ kopması: kayıt sunucuda yazıldı, ekran 'sonuç bilinmiyor' der, form ve alanlar korunur, yakalanmamış hata yok",
    kopma.satir === 1 && /Bağlantı koptu/.test(kopma.uyari) && kopma.formAcik && kopma.baslikKorundu && kopma.yakalanmamis.length === 0, kopma);
  // İçerik değişip yeniden gönderilirse aynı istek anahtarı → DP002 bildirimi, ikinci satır yok.
  await f3.locator("input[name=baslik]").fill(`${b3} değişti`);
  await f3.locator("button[type=submit]").click();
  const d2 = await bildirim(sayfa, "hata", /başka|farklı|istek|aynı/i);
  kaydet("1.8 DP002 Next.js ekranına ulaşıyor (yanıtı kaybolan istek + değişen içerik); ikinci satır yok",
    d2.ok && sayi(`select count(*) from docentlik_faaliyetleri where title like '${b3}%'`) === 1, { bildirim: d2.metin });
  // Aynı içerikle yeniden gönderim → "tekrar": başarı, yine tek satır.
  await sayfa.waitForTimeout(800);
  await f3.locator("input[name=baslik]").fill(b3);
  await f3.locator("button[type=submit]").click();
  const t2 = await bildirim(sayfa, "basari", /Faaliyet eklendi/);
  kaydet("1.9 kopmadan sonra aynı formun yeniden gönderimi ikinci kayıt açmıyor (istek anahtarı korunmuş)",
    t2.ok && sayi(`select count(*) from docentlik_faaliyetleri where title like '${b3}%'`) === 1, { bildirim: t2.metin });

  // Düzenle + sil (onay penceresi)
  await git(sayfa, "/panel/docentlik/faaliyetler");
  const satir = sayfa.locator("tr", { hasText: baslik });
  await satir.getByRole("button", { name: /Düzenle/ }).click();
  const fd = sayfa.locator(".panel-modal-root form.docentlik-form");
  await fd.locator("input[name=baslik]").fill(`${baslik} düzenlendi`);
  await fd.locator("button[type=submit]").click();
  const db2 = await bildirim(sayfa, "basari", /kaydedildi/);
  kaydet("1.10 faaliyet düzenleme: bildirim + veritabanı", db2.ok && sayi(`select count(*) from docentlik_faaliyetleri where title='${baslik} düzenlendi'`) === 1, db2);
  await git(sayfa, "/panel/docentlik/faaliyetler");
  await sayfa.locator("tr", { hasText: `${baslik} düzenlendi` }).locator(".docentlik-tehlike").first().click();
  await sayfa.locator("dialog[open] button[type=submit]").click();
  const sb = await bildirim(sayfa, "basari", /silindi/);
  kaydet("1.11 faaliyet silme (onaylı): bildirim + veritabanı", sb.ok && sayi(`select count(*) from docentlik_faaliyetleri where title like '${baslik}%'`) === 0, sb);
  kaydet("1.12 akademisyen akışında istemci hatası yok", hatalar.length === 0, hatalar.slice(0, 3));
  psql(`delete from docentlik_faaliyetleri where title like 'PR7 kopma%'`);
  await ctx.close();
});

/* ---------------- 2. PDF: gerçek Storage ---------------- */
await senaryo("pdf", async () => {
  const { ctx, sayfa } = await oturum("sahip@am.test");
  psql(`update docentlik_faaliyetleri set belge_yolu=null where id='${FAALIYET}'`);
  const nesne = () => sayi(`select count(*) from storage.objects where bucket_id='docentlik-belgeleri' and name like '${AM}/faaliyet/${SAHIP}/${FAALIYET}/%'`);
  const yukle = async (dosya, gondermedenOnce = () => {}) => {
    await git(sayfa, "/panel/docentlik/faaliyetler?sayfa=1");
    const satir = sayfa.locator("tr", { hasText: /^Makale|Makale/ }).filter({ has: sayfa.getByRole("button", { name: /PDF ekle|Değiştir/ }) }).first();
    await satir.getByRole("button", { name: /PDF ekle|Değiştir/ }).click();
    const form = sayfa.locator(".panel-modal-root form.docentlik-form").last();
    await form.locator("input[type=file]").setInputFiles(dosya);
    gondermedenOnce();
    await form.locator("button[type=submit]").click();
    return form;
  };
  // Makale satırı ilk sayfada olmayabilir (1500 faaliyet, en yeniler önde): öne al.
  psql(`update docentlik_faaliyetleri set created_at=now() where id='${FAALIYET}'`);

  const n0 = nesne();
  await yukle(pdfDosyasi("makale.pdf"));
  const b1 = await bildirim(sayfa, "basari", /Belge eklendi/);
  const yol1 = psql(`select coalesce(belge_yolu,'') from docentlik_faaliyetleri where id='${FAALIYET}'`);
  kaydet("2.1 PDF yükleme (gerçek Storage): bildirim, kayıtta yol, depoda nesne", b1.ok && yol1.startsWith(`${AM}/faaliyet/${SAHIP}/${FAALIYET}/`) && nesne() === n0 + 1, { bildirim: b1.metin, yol: yol1 });

  // Görüntüle → imzalı adres yeni sekmede, PDF dönüyor
  await git(sayfa, "/panel/docentlik/faaliyetler");
  /* Headless Chromium PDF'i sekmede göstermez, İNDİRİR: sekmenin adresi about:blank kalır.
     Bu yüzden sekmenin gerçekten açtığı imzalı adres ağ isteğinden okunuyor. */
  const imzaliIstek = ctx.waitForEvent("request", { predicate: (r) => /\/storage\/v1\/object\/sign\/.*token=/.test(r.url()), timeout: 15000 });
  const [sekme] = await Promise.all([ctx.waitForEvent("page", { timeout: 15000 }), sayfa.locator("tr", { hasText: "Makale" }).getByRole("button", { name: /görüntüle/i }).first().click()]);
  const imzali = (await imzaliIstek).url();
  const indir = await fetch(imzali);
  const jeton = new URL(imzali).searchParams.get("token") ?? "";
  const yuk = jeton ? JSON.parse(Buffer.from(jeton.split(".")[1], "base64url").toString()) : {};
  kaydet("2.2 Görüntüle: yeni sekme imzalı adresi (60 sn) açıyor, adres PDF döndürüyor", indir.status === 200 && (await indir.text()).startsWith("%PDF-") && yuk.exp - yuk.iat === 60, { durum: indir.status, omur: yuk.exp - yuk.iat });
  await sekme.close();

  // Değiştir → eski nesne silinir
  await yukle(pdfDosyasi("yeni.pdf", "%PDF-1.7\n%yeni\n"));
  const b2 = await bildirim(sayfa, "basari", /Belge eklendi/);
  const yol2 = psql(`select coalesce(belge_yolu,'') from docentlik_faaliyetleri where id='${FAALIYET}'`);
  kaydet("2.3 PDF değiştirme: yeni yol, eski nesne depodan silindi", b2.ok && yol2 !== yol1 && sayi(`select count(*) from storage.objects where name='${yol1}'`) === 0 && nesne() === n0 + 1, { bildirim: b2.metin });

  // Uzantısı ve türü PDF ama içeriği PDF olmayan dosya → sunucu "%PDF-" imzasında reddeder, nesne temizlenir
  const nOnce = nesne();
  const f3 = await yukle({ name: "sahte.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>pdf değil</html>") });
  const b3 = await bildirim(sayfa, "hata", /PDF değil/);
  await sayfa.waitForTimeout(500);
  kaydet("2.4 içerik PDF değilse sunucu reddeder; bildirim görünür; yüklenen nesne silinir; eski belge kalır",
    b3.ok && nesne() === nOnce && psql(`select belge_yolu from docentlik_faaliyetleri where id='${FAALIYET}'`) === yol2 && (await f3.locator("input[type=file]").evaluate((e) => e.files.length)) === 1, { bildirim: b3.metin });
  await sayfa.keyboard.press("Escape");

  // PDF olmayan tür → tarayıcıda reddedilir, sunucuya gitmez
  const istekler = [];
  const f4 = await yukle({ name: "resim.png", mimeType: "image/png", buffer: Buffer.from("png") }, () => {
    // Dinleyici dosya seçildikten SONRA, gönderimden hemen önce kurulur: sayfa açılışının kendi istekleri sayılmasın.
    sayfa.on("request", (r) => { if (r.method() === "POST" || /storage\/v1\/object/.test(r.url())) istekler.push(`${r.method()} ${r.url()} ${r.headers()["next-action"] ? "(sunucu işlemi)" : ""}`); });
  });
  await sayfa.waitForTimeout(800);
  kaydet("2.5 PDF olmayan tür formda reddedilir, sunucuya istek gitmez", (await f4.locator("[role=alert]").count()) > 0 && istekler.length === 0, { istekler });
  await sayfa.keyboard.press("Escape");

  // Kaldır
  await git(sayfa, "/panel/docentlik/faaliyetler");
  await sayfa.locator("tr", { hasText: "Makale" }).getByRole("button", { name: /kaldır/i }).first().click();
  await sayfa.locator("dialog[open] button[type=submit]").click();
  const b5 = await bildirim(sayfa, "basari", /kaldırıldı/);
  kaydet("2.6 PDF kaldırma: kayıt boş, nesne depodan silindi", b5.ok && psql(`select coalesce(belge_yolu,'') from docentlik_faaliyetleri where id='${FAALIYET}'`) === "" && sayi(`select count(*) from storage.objects where name='${yol2}'`) === 0, { bildirim: b5.metin });
  await ctx.close();
});

/* ---------------- 3. Gözetim ---------------- */
await senaryo("gozetim", async () => {
  const { ctx, sayfa } = await oturum("gozetim@am.test");
  await git(sayfa, "/panel/docentlik/kurum");
  const beklenenKisi = sayi(`select count(distinct k) from (select owner_id k from docentlik_profilleri where organization_id='${AM}' union select owner_id from docentlik_faaliyetleri where organization_id='${AM}') x`);
  /* PR8: liste sunucuda sayfalı (50/sayfa). Şerit özet işlevinden — sayfa satırlarından toplanmıyor. */
  const satir = await sayfa.locator(".docentlik-tablo tbody tr").count();
  const serit = (await sayfa.locator(".kayit-serit").first().textContent()).replace(/\s+/g, " ");
  const sonSayfa = Math.ceil(beklenenKisi / 50);
  const baslikMetni = (await sayfa.locator(".docentlik-kart-bas").first().textContent()).replace(/\s+/g, " ");
  kaydet("3.1 kurum listesi sayfalı: 50 satır, şerit ve toplam tam kişi sayısı (tavan 1000'i aşıyor)",
    satir === 50 && (serit.includes(String(beklenenKisi)) || serit.includes(beklenenKisi.toLocaleString("tr-TR"))) && baslikMetni.includes(`1–50 / ${beklenenKisi}`)
      && (await sayfa.getByText(`Sayfa 1 / ${sonSayfa}`).count()) > 0, { db: beklenenKisi, ekran: satir, baslik: baslikMetni });
  /* Adlar daraltılmış RPC'den (docentlik_kisi_adlari): profiles RLS'i gevşetilmedi. Eskiden personel kaydı olmayanlar
     "Üye xxxxxxxx" yedeğine düşüyordu. */
  const yedek1 = await sayfa.getByText(/^Üye [0-9a-f]{8}$/).count();
  const adlar1 = await sayfa.locator(".docentlik-tablo tbody tr td:first-child b").allTextContents();
  const bag = () => sayfa.locator(".docentlik-tablo tbody tr a").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  const bag1 = await bag();
  // Sıra kararlı: faaliyet çok → az, eşitlikte kişi kimliği. Aynı sayfa iki kez aynı sırayı vermeli.
  await git(sayfa, "/panel/docentlik/kurum?sayfa=1");
  const adlarTekrar = await sayfa.locator(".docentlik-tablo tbody tr td:first-child b").allTextContents();
  await sayfa.getByRole("link", { name: "Sonraki" }).click();
  await sayfa.waitForURL(/sayfa=2/);
  await sayfa.waitForLoadState("networkidle").catch(() => {});
  const adlar2 = await sayfa.locator(".docentlik-tablo tbody tr td:first-child b").allTextContents();
  const baslik2 = (await sayfa.locator(".docentlik-kart-bas").first().textContent()).replace(/\s+/g, " ");
  kaydet("3.2 sayfa 2: 'Sonraki' bağlantısı, 51–100, sayfa 1 ile kesişim yok; sıra kararlı",
    adlar2.length === 50 && baslik2.includes(`51–100 / ${beklenenKisi}`) && JSON.stringify(adlar1) === JSON.stringify(adlarTekrar)
      && !(await bag()).some((h) => bag1.includes(h)), { baslik: baslik2 });
  await git(sayfa, `/panel/docentlik/kurum?sayfa=${sonSayfa}`);
  const sonSatir = await sayfa.locator(".docentlik-tablo tbody tr").count();
  const yedekSon = await sayfa.getByText(/^Üye [0-9a-f]{8}$/).count();
  kaydet(`3.2b son sayfa (${sonSayfa}): kalan ${beklenenKisi - (sonSayfa - 1) * 50} satır, 'Sonraki' yok`,
    sonSatir === beklenenKisi - (sonSayfa - 1) * 50 && (await sayfa.getByRole("link", { name: "Sonraki" }).count()) === 0, { sonSatir });
  await git(sayfa, "/panel/docentlik/kurum?sayfa=99999");
  /* Panelin loading.tsx sınırı akışı başlattığı için redirect() istemcide uygulanıyor; networkidle'dan sonra gelebilir. */
  await sayfa.waitForURL((u) => !u.search, { timeout: 15000 }).catch(() => {});
  await sayfa.waitForLoadState("networkidle").catch(() => {});
  kaydet("3.2c aralık dışı sayfa çökmez, ilk sayfaya döner", new URL(sayfa.url()).pathname === "/panel/docentlik/kurum" && !new URL(sayfa.url()).search && (await sayfa.locator(".docentlik-tablo tbody tr").count()) === 50, { url: sayfa.url() });
  kaydet("3.2d adlar RPC'den: personel kaydı olmayanlar dahil 'Üye xxxxxxxx' yedeği yok (sayfa 1 ve son sayfa)", yedek1 === 0 && yedekSon === 0 && adlar1.every((a) => a.trim().length > 0), { yedek1, yedekSon });
  await git(sayfa, "/panel/docentlik/kurum");
  kaydet("3.3 gözetim listesinde doktora tarihi yok", !/2020|2019/.test(await sayfa.locator(".docentlik-sayfa").textContent()));
  await goruntu(sayfa, "3-kurum");
  await git(sayfa, `/panel/docentlik/kurum/${SAHIP}`);
  const dbToplam = sayi(`select sum(computed_points)::int from docentlik_faaliyetleri where owner_id='${SAHIP}'`);
  const kserit = (await sayfa.locator(".kayit-serit").first().textContent()).replace(/\s+/g, " ");
  kaydet("3.4 kişi sayfası: toplam ve doktora sonrası puan veritabanıyla aynı (1500 faaliyet, dönem eksiksiz)",
    (kserit.match(new RegExp(dbToplam.toLocaleString("tr-TR").replace(".", "\\."), "g")) ?? []).length >= 2, { db: dbToplam, ekran: kserit.slice(0, 220) });
  kaydet("3.5 kişi sayfasında yazma düğmesi yok", (await sayfa.locator(".docentlik-sayfa button").evaluateAll((d) => d.map((b) => b.textContent.trim()).filter((t) => !/Görüntüle/.test(t)))).length === 0);
  await goruntu(sayfa, "3-kisi");
  await ctx.close();
});

/* ---------------- 4. Kriter, hedef, ÜAK ---------------- */
await senaryo("yonetim", async () => {
  const { ctx, sayfa } = await oturum("yonetici@am.test");
  await git(sayfa, "/panel/docentlik/kriterler");
  const kod = `T${Date.now() % 100000}`;
  await sayfa.getByRole("button", { name: "Yeni kriter" }).click();
  const f = sayfa.locator(".panel-modal-root form.docentlik-form");
  await f.locator("input[name=kod]").fill(kod);
  await f.locator("input[name=birim_puan]").fill("12,5");
  await f.locator("input[name=etiket]").fill("PR7 kriteri");
  await f.locator("button[type=submit]").click();
  const kb = await bildirim(sayfa, "basari", /Kriter eklendi/);
  kaydet("4.1 kriter ekleme (Türkçe ondalık 12,5): bildirim + veritabanı", kb.ok && Number(psql(`select points_per_unit from docentlik_kriterleri where code='${kod}'`)) === 12.5, { bildirim: kb.metin, db: psql(`select points_per_unit from docentlik_kriterleri where code='${kod}'`) });
  // Faaliyeti olan kriteri silme denemesi → anlaşılır hata
  await git(sayfa, "/panel/docentlik/kriterler");
  await sayfa.locator("tr", { hasText: "A1 · Uluslararası makale" }).locator(".docentlik-tehlike").click();
  await sayfa.locator("dialog[open] button[type=submit]").click();
  const kh = await bildirim(sayfa, "hata", /pasif|faaliyet/i);
  kaydet("4.2 faaliyeti olan kriter silinmez; 'pasife alın' bildirimi", kh.ok && sayi(`select count(*) from docentlik_kriterleri where code='A1' and organization_id='${AM}'`) === 1, kh);
  psql(`delete from docentlik_kriterleri where code='${kod}'`);

  await git(sayfa, "/panel/docentlik/uak");
  const alan = `PR7 Alan ${Date.now() % 10000}`;
  const form = sayfa.locator("form.docentlik-form").last();
  await form.locator("input[name=temel_alan]").fill(alan);
  await form.locator("input[name=donem]").fill("2026 Ekim");
  await form.locator("input[type=file]").setInputFiles(pdfDosyasi("uak.pdf"));
  await form.locator("button[type=submit]").click();
  const ub = await bildirim(sayfa, "basari", /ÜAK tablosu yüklendi/);
  const uyol = psql(`select depo_yolu from docentlik_uak_tablolari where temel_alan='${alan}'`);
  kaydet("4.3 ÜAK yükleme (gerçek Storage): bildirim, kayıt, depoda nesne", ub.ok && uyol !== "" && sayi(`select count(*) from storage.objects where name='${uyol}'`) === 1, { bildirim: ub.metin });
  await git(sayfa, "/panel/docentlik/uak");
  kaydet("4.4 ÜAK onayı devre dışı ve nedeni görünür", await sayfa.getByRole("button", { name: "Onayla" }).first().isDisabled() && await sayfa.locator("#uak-onay-neden").isVisible());
  await sayfa.locator("tr", { hasText: alan }).locator(".docentlik-tehlike").click();
  await sayfa.locator("dialog[open] button[type=submit]").click();
  const ud = await bildirim(sayfa, "basari", /kaldırıldı/);
  kaydet("4.5 ÜAK kaldırma: kayıt ve nesne silindi", ud.ok && sayi(`select count(*) from docentlik_uak_tablolari where temel_alan='${alan}'`) === 0 && sayi(`select count(*) from storage.objects where name='${uyol}'`) === 0, ud);
  await ctx.close();
});

/* ---------------- 5. Yetkisiz, kurumlar arası, modül ---------------- */
await senaryo("yetki", async () => {
  const uye = await oturum("uye@am.test");
  for (const yol of ["/panel/docentlik/kurum", `/panel/docentlik/kurum/${SAHIP}`, "/panel/docentlik/kriterler", "/panel/docentlik/uak"]) {
    await git(uye.sayfa, yol);
    const metin = await uye.sayfa.locator(".docentlik-sayfa").textContent();
    kaydet(`5.1 yetkisiz üye ${yol}: kapalı ekran, veri yok`, /yetkiniz yok/.test(metin) && !/Ayşe Sentetik|Sentetik 1\b|Uluslararası makale|30\.000/.test(metin));
  }
  await uye.ctx.close();
  const yab = await oturum("sahip@am2.test");
  await git(yab.sayfa, `/panel/docentlik/kurum/${SAHIP}`);
  const ym = await yab.sayfa.locator("main").last().textContent();
  kaydet("5.2 başka kurumun sahibi AM akademisyenini göremez", !/Sentetik 1\b|30\.000|Ayşe Sentetik/.test(ym), ym.replace(/\s+/g, " ").slice(0, 160));
  await yab.ctx.close();

  psql(`update organization_modules set is_enabled=false where organization_id='${AM}' and module_code='docentlik'`);
  try {
    const s = await oturum("sahip@am.test");
    await git(s.sayfa, "/panel/docentlik");
    const mm = (await s.sayfa.locator("main").last().textContent()).replace(/\s+/g, " ");
    kaydet("5.3 modül kapanınca doçentlik ekranı kapalı, veri yok", !/30\.000|Sentetik 1\b/.test(mm) && /kapalı|erişim|modül/i.test(mm), mm.slice(0, 160));
    await s.ctx.close();
  } finally {
    psql(`update organization_modules set is_enabled=true where organization_id='${AM}' and module_code='docentlik'`);
  }
});

/* ---------------- 6. Duyarlı yerleşim + PanelModal (gerçek uygulama) ---------------- */
await senaryo("yerlesim", async () => {
  const boyutlar = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];
  const sorunlar = [];
  for (const [w, h] of boyutlar) for (const tema of ["light", "dark"]) {
    const { ctx, sayfa } = await oturum("yonetici@am.test", { width: w, height: h }, tema);
    for (const yol of ["/panel/docentlik", "/panel/docentlik/faaliyetler", "/panel/docentlik/kurum", "/panel/docentlik/kriterler", "/panel/docentlik/uak"]) {
      await git(sayfa, yol);
      const o = await sayfa.evaluate(() => ({ tasma: document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1, tema: document.documentElement.dataset.theme }));
      if (o.tasma) sorunlar.push(`${w}x${h} ${tema} ${yol}: yatay taşma`);
      if (o.tema !== tema) sorunlar.push(`${w}x${h} ${yol}: tema ${o.tema}`);
      if (w === 390 || w === 1440) await goruntu(sayfa, `6-${w}-${tema}-${yol.split("/").pop()}`);
    }
    await ctx.close();
  }
  kaydet("6.1 5 ekran × 4 boyut × 2 tema: yatay taşma yok, tema uygulanıyor (gerçek uygulama)", sorunlar.length === 0, sorunlar.slice(0, 6));

  const { ctx, sayfa } = await oturum("sahip@am.test");
  await git(sayfa, "/panel/docentlik/faaliyetler");
  const ac = sayfa.getByRole("button", { name: "Yeni faaliyet" }).first();
  await ac.click();
  await sayfa.waitForTimeout(300);
  const icerde = await sayfa.evaluate(() => Boolean(document.querySelector(".panel-modal-root")?.contains(document.activeElement)));
  for (let i = 0; i < 25; i++) await sayfa.keyboard.press("Tab");
  const halaIcerde = await sayfa.evaluate(() => Boolean(document.querySelector(".panel-modal-root")?.contains(document.activeElement)));
  await sayfa.keyboard.press("Escape");
  await sayfa.waitForTimeout(300);
  const kapandi = (await sayfa.locator(".panel-modal-root form.docentlik-form").count()) === 0;
  const geriDondu = await sayfa.evaluate(() => document.activeElement?.textContent?.includes("Yeni faaliyet") ?? false);
  kaydet("6.2 PanelModal (gerçek uygulama): odak içeride, 25 Tab sonra hâlâ içeride, Esc kapatır, odak açana döner", icerde && halaIcerde && kapandi && geriDondu, { icerde, halaIcerde, kapandi, geriDondu });
  await ctx.close();
});

await tarayici.close();
const basarisiz = Object.entries(sonuc).filter(([, v]) => !gectiMi(v)).map(([k]) => k);
console.log(JSON.stringify({ uygulama: UYG, toplam: Object.keys(sonuc).length, gecen: Object.keys(sonuc).length - basarisiz.length, basarisiz, sonuc }, null, 1));
process.exit(basarisiz.length ? 1 : 0);
