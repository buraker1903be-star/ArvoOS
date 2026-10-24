/*
 * CANLI DUMAN TESTİ: HANGİ SAYFA ÇÖKÜYOR?
 *
 * Neden var: 16.10.2026'da başlangıç paketindeki bir kurumda
 * /panel/finance/raporlar "İŞLEM TAMAMLANAMADI · Bir sorun oluştu ·
 * Hata kodu: 3223241041" ekranını veriyordu. Sebep basitti (reporting
 * modülü o pakette kapalı, sayfa da kapıyı fırlatarak tutuyordu) ama
 * HİÇBİR denetim bunu göremiyordu: tsc, lint, testler ve derleme
 * sayfanın ÇALIŞTIĞINI sınamıyor, yalnızca derlendiğini.
 *
 * Daha kötüsü, sayfanın HTML'ini çekip "Bir sorun oluştu" aramak da
 * yetmiyor — o ekran React'in hata sınırında, yani İSTEMCİDE çiziliyor.
 * Sunucudan gelen HTML'de o metin yok. Bu yüzden ilk taramam "41 rota
 * temiz" demişti ve yanılmıştı.
 *
 * ÇALIŞAN YÖNTEM: sayfayı `RSC: 1` başlığıyla istemek. Dönen akışta
 * sunucu bileşeninin sonucu var ve hatalar bir `digest` ile işaretli:
 *
 *   "digest":"NEXT_HTTP_ERROR_FALLBACK;404"  → kasıtlı notFound()
 *   "digest":"NEXT_REDIRECT;replace;/...;307" → kasıtlı redirect()
 *   "digest":"3223241041"                     → GERÇEK ÇÖKME
 *
 * Yakalanan hata üretimde mesajını soyuyor; sayısal digest de sunucu
 * günlüğündeki kaydın anahtarı. Betik o anahtarı yazıyor ki Vercel
 * günlüğünde aranabilsin.
 *
 * DİNAMİK ROTALAR: örnek kimlik elle yazılmıyor, GEZİLEN SAYFALARDAN
 * toplanıyor. Her yanıtın gövdesinde geçen /panel/<üst>/<uuid> çiftleri
 * bir havuza giriyor; durgun rotalar önce taranıp havuzu dolduruyor,
 * sonra dinamik rotalar oradan örneklenip isteniyor — çözülen her sayfa
 * havuzu yine besliyor. Elle tutulan bir kimlik listesi, ilk silinen
 * kayıtta bayatlıyor ve kapsamı sessizce daraltıyordu.
 *
 * İKİ TUR var, çünkü sıra alfabetik ve bazı bağlantılar başka bir
 * DİNAMİK sayfanın içinde: gizlilik sözleşmesine yalnızca personel
 * detayından gidiliyor, o da "confidentiality"den sonra taranıyor.
 * Birinci turda bulunamayan rota, havuz büyüdükten sonra ikinci turda
 * bulunuyor (16.10.2026'da ölçüldü: 17 rotanın 12'si birinci, 1'i
 * ikinci turda). Kalanlar sorgu değişkeniyle açılıyor ya da kurumda
 * örneği yok; adları "atlandı" diye yazılıyor — betik onları temiz
 * SAYMIYOR.
 *
 * NEDEN CI'DA DEĞİL: oturum çerezi ve gerçek veri istiyor. Dağıtımdan
 * sonra elle koşturulur; kurumun paketine göre sonuç değişir, çünkü
 * kapalı modül artık çökme değil yönlendirme üretiyor (lib/modul-kapisi).
 *
 * KULLANIM
 *   ARVO_COOKIE="$(pbpaste)" node scripts/duman-testi.mjs
 *     (pano "Copy as cURL" çıktısı da olabilir; çerez içinden çıkarılır)
 *   node scripts/duman-testi.mjs --cerez-dosyasi ~/arvo-cerez.txt
 *   node scripts/duman-testi.mjs --taban https://app.arvo-os.com --konsol https://yonetim.arvo-os.com
 *   node scripts/duman-testi.mjs --yalnizca /panel/finance
 *   node scripts/duman-testi.mjs --yalnizca-durgun   (dinamik rotaları hiç deneme)
 *   node scripts/duman-testi.mjs --sekme-yok         (sorgu görünümlerini atla)
 *   node scripts/duman-testi.mjs --bayat-yok         (bayat adres sınamasını atla)
 *
 * Çerez tarayıcıdan alınır (Ağ sekmesinde bir isteğin `cookie` başlığı).
 * Hangi ÇALIŞMA ALANI taranacağını da o çerez söyler: başka bir kurumu
 * taramak için panelde çalışma alanını değiştirip çerezi yeniden alın.
 *
 * Rota listesi app/ ağacından türetiliyor: yeni bir sayfa açıldığında
 * elle eklemek gerekmesin. Dinamik segmentli yollar ([id]) için örnek
 * kimlik ÜST LİSTE SAYFASINDAN okunuyor — elle tutulan bir örnek
 * dosyası ilk silinen kayıtta bayatlardı. Örneği bulunamayan rota
 * atlanıyor ve adıyla yazılıyor; "taradım" derken neyin taranmadığı
 * görünsün.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (ad, varsayilan = null) => {
  const i = argv.indexOf(ad);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : varsayilan;
};
const taban = arg("--taban", "https://app.arvo-os.com").replace(/\/$/, "");
const konsol = arg("--konsol", "https://yonetim.arvo-os.com").replace(/\/$/, "");
const yalnizca = arg("--yalnizca");
const cerezDosyasi = arg("--cerez-dosyasi");

/*
  ÇEREZ "COPY AS CURL" ÇIKTISINDAN DA OKUNUYOR (24.10.2026).

  Önceden yalnızca ham çerez dizesi kabul ediliyordu ve onu almak
  DevTools'ta altı adım sürüyor: Ağ sekmesi → belge isteği →
  Headers → Request Headers → "Raw" → `cookie:` satırını seç →
  kopyala. Kullanıcı bunu denedi, pano boş kaldı ve betik
  "oturum çerezi yok" dedi — yani en çok işe yarayan denetim en zor
  çalıştırılan denetimdi.

  Tarayıcıda tek adımlı bir yol var: isteğe sağ tık → "Copy as cURL".
  Çıktı zaten `-H 'cookie: …'` taşıyor. Betik artık verilen metin bir
  cURL komutuysa çerezi içinden çıkarıyor; ham çerez dizesi de
  çalışmaya devam ediyor.
*/
function cerezCoz(ham) {
  const metin = (ham || "").trim();
  if (!metin) return "";
  /* cURL çıktısı: -H 'cookie: …' / -H "Cookie: …" / --header 'cookie: …'
     Tek ve çift tırnağın ikisi de (Windows'ta çift tırnak çıkıyor). */
  const basliktan = metin.match(/-{1,2}(?:H|header)\s+(['"])\s*cookie\s*:\s*([\s\S]*?)\1/i);
  if (basliktan) return basliktan[2].trim();
  /* Bazı tarayıcılar çerezi -b / --cookie ile veriyor. */
  const bayraktan = metin.match(/-{1,2}(?:b|cookie)\s+(['"])([\s\S]*?)\1/i);
  if (bayraktan) return bayraktan[2].trim();
  /* cURL komutu ama çerez yok: kullanıcıya sebebini söyle. */
  if (/^\s*curl\b/i.test(metin)) return "";
  return metin;
}

/*
  ÇEREZ DOĞRULANIYOR (24.10.2026).

  Pano'da çerez yerine BAŞKA bir şey olduğunda betik onu olduğu gibi
  kabul ediyordu: bir SQL sonucu (`ay,adet,tl\n2026-08,…`) yapıştırıldı,
  her istek `Headers.append: … is an invalid header value` ile düştü ve
  betik bunu "240 SAYFA ÇÖKÜYOR" diye bildirdi. Sayfaların hiçbiri
  denenmemişti.

  Kendinden emin bir biçimde yanlış sonuç söyleyen denetim, denetimin
  kendisinden kötüdür: bu çıktıyı gören biri olmayan bir yangını
  söndürmeye koşar. O yüzden değer ÖNCE sınanıyor — HTTP başlık değeri
  tek satırdır ve kontrol karakteri taşımaz, çerez de en az bir `ad=değer`
  çifti içerir.
*/
const BASLIKTA_YASAK = /[\u0000-\u001f\u007f]/;

function cerezKusuru(cerez) {
  if (BASLIKTA_YASAK.test(cerez)) return "satır sonu ya da kontrol karakteri içeriyor (HTTP başlığına konamaz)";
  if (!cerez.includes("=")) return "`ad=değer` çifti yok";
  return null;
}

const hamCerez = cerezDosyasi ? fs.readFileSync(cerezDosyasi, "utf8") : process.env.ARVO_COOKIE || "";
const cerez = cerezCoz(hamCerez);
if (!cerez) {
  const curlVerildi = /^\s*curl\b/i.test((hamCerez || "").trim());
  console.error(
    curlVerildi
      ? "✗ Verilen cURL komutunda `cookie` başlığı yok.\n"
        + "  Oturum açıkken bir PANEL isteğini kopyalayın (ör. /panel/finance);\n"
        + "  statik dosya isteklerinde çerez başlığı bulunmaz."
      : "✗ Oturum çerezi yok.\n"
        + "  EN KOLAY YOL: tarayıcıda panel açıkken DevTools → Network →\n"
        + "  bir panel isteğine sağ tık → Copy → Copy as cURL, sonra:\n"
        + "    ARVO_COOKIE=\"$(pbpaste)\" npm run duman\n"
        + "  Ham çerez dizesi de kabul ediliyor (--cerez-dosyasi ile dosyadan).",
  );
  process.exit(2);
}

const kusur = cerezKusuru(cerez);
if (kusur) {
  console.error(
    `✗ Verilen değer çerez değil: ${kusur}.\n`
    + `  Gelen (ilk 60 karakter): ${JSON.stringify(cerez.slice(0, 60))}\n`
    + "  Panoda çerez yerine başka bir şey olabilir (ör. bir sorgu sonucu).\n"
    + "  DevTools → Network → bir PANEL isteğine sağ tık → Copy → Copy as cURL.",
  );
  process.exit(2);
}

/** app/ ağacından rota yolları. Grup klasörleri ((site), (tr)) yola girmez. */
function rotalar(kok = "app") {
  const bulunan = [];
  const gez = (dizin) => {
    for (const girdi of fs.readdirSync(dizin, { withFileTypes: true })) {
      const yol = path.join(dizin, girdi.name);
      if (girdi.isDirectory()) {
        if (girdi.name === "node_modules" || girdi.name.startsWith("_") || girdi.name === "api") continue;
        gez(yol);
      } else if (girdi.name === "page.tsx") {
        const rota = dizin
          .replace(/^app/, "")
          .split("/")
          .filter((parca) => parca && !/^\(.*\)$/.test(parca))
          .join("/");
        bulunan.push("/" + rota);
      }
    }
  };
  gez(kok);
  return [...new Set(bulunan)].sort();
}

const tumu = rotalar();
const dinamikler = tumu.filter((r) => r.includes("["));
let taranacak = tumu.filter((r) => !r.includes("["));
if (yalnizca) taranacak = taranacak.filter((r) => r.startsWith(yalnizca));

/* Konsol yolları kendi alan adından istenir: panelden çağrılırsa
   ara katman çalışma alanına göre başka yere yönlendirir. */
const sunucu = (rota) => (rota.startsWith("/panel/platform") ? konsol : taban);

const DIGEST = /"digest\\?":\\?"([^"\\]+)/g;

/*
  DİNAMİK ROTALARIN ÖRNEĞİ, LİSTEDEN BULUNUYOR.

  /panel/crm/contracts/[id] gerçek bir kimlik olmadan çağrılamaz ve
  kimlikler ortamdan ortama değişiyor; elle tutulan bir örnek dosyası
  ise ilk silinen kayıtta bayatlar. Bunun yerine ÜST liste sayfası
  çekiliyor ve içindeki ilk bağlantıdan kimlik alınıyor — kapsam
  kendiliğinden güncel kalıyor.

  Bulunamayan rota ATLANMIŞ sayılıyor ve adıyla yazılıyor: "taradım"
  derken neyin taranmadığı görünsün. Sessizce "temiz" demek, olmayan
  denetimden kötü.

  Sabit değerli segmentler (belge türü gibi) burada; enum oldukları için
  listeden keşfedilemiyorlar. Birden çok aday yazılabiliyor: hangisinin
  havuzda karşılığı varsa o kullanılıyor (belge merkezinde kurumun
  elinde yalnızca teklif ya da yalnızca sözleşme olabilir).
*/
const SABIT_SEGMENT = { "[type]": ["contract", "proposal"] };

/*
  KİMLİK HAVUZU. Tarama zaten onlarca sayfa çekiyor ve o sayfalarda
  başka kayıtların bağlantıları geçiyor (cari ekranı sözleşmeye, ana
  ekran işe bağlanıyor). Havuz bu yanıtlardan doluyor, yani liste
  sayfasının VARSAYILAN SÜZGECİ boş olsa bile örnek bulunabiliyor:
  deneme kurumunda sözleşme "Operasyonda" olduğu için aktif listede
  görünmüyor ve yalnızca listeye bakan bir keşif onu bulamıyordu.
*/
const havuz = new Map();
const KIMLIK = /(\/panel\/[a-z0-9/-]*?)\\?\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
function havuzaTopla(govde) {
  for (const eslesme of govde.matchAll(KIMLIK)) {
    const ust = eslesme[1].replace(/\\/g, "");
    if (!havuz.has(ust)) havuz.set(ust, eslesme[2]);
  }
}

/*
  SORGU GÖRÜNÜMLERİ: SEKMEYİ DE TARA.

  Betik bir süre yalnızca her sayfanın VARSAYILAN hâlini görüyordu, oysa
  panelin yarısı sekmeyi sorgu değişkeniyle açıyor: Ayarlar'ın yedi
  bölümü, sözleşme ve teklif listelerinin durum süzgeçleri, finansın
  maliyet görünümü, takvimin ayları. "Kişi yetkileri" ekranı yalnızca
  ?bolum=kisiler ile çiziliyor — yani kapsamın dışındaydı. Kaçırılan
  sınıf tam da betiğin var olma sebebi: adrese doğrudan gidilen,
  menüden görünmeyen sayfa.

  Adresler elle yazılmıyor, ARAYÜZÜN KENDİ BAĞLANTILARINDAN toplanıyor
  (16.10.2026'da deneme kurumunda 144 ayrı görünüm çıktı, hepsi temiz).
  Satır bağlantıları (kimlik taşıyanlar) dışarıda: onları dinamik rota
  turu zaten istiyor.

  YOL BAŞINA TAVAN var: iki takvim gün/ay bağlantısıyla tek başına 74
  adres üretiyor ve hepsi AYNI kodu çalıştırıyor. Tavan, taramayı
  takvimin aylarını saymakla geçirmesini önlüyor.
*/
const SORGU_HAVUZU = new Map();
/* `&` yükte `\u0026` olarak kaçıyor: ters eğik çizgiyi dışlayan bir
   sınıf, iki süzgeçli bir bağlantıyı ilk parametrede kırpıyordu. */
const SORGU = /\\?"(\/panel\/[a-z0-9/-]*\?(?:\\u0026|[^"\\])+)/g;
const YOL_BASINA_TAVAN = 8;
function sorguTopla(govde) {
  for (const eslesme of govde.matchAll(SORGU)) {
    const adres = eslesme[1].replace(/\\u0026/g, "&").replace(/&amp;/g, "&").split("#")[0];
    if (/[0-9a-f]{8}-[0-9a-f]{4}/.test(adres)) continue;
    const [yol, sorgu] = adres.split("?");
    /* Aynı süzgecin farklı sırayla yazılmış ikizini iki kez istemeyelim. */
    const anahtar = `${yol}?${[...new URLSearchParams(sorgu).entries()].map(([a, b]) => `${a}=${b}`).sort().join("&")}`;
    if (SORGU_HAVUZU.has(anahtar)) continue;
    let sayi = 0;
    for (const v of SORGU_HAVUZU.values()) if (v.startsWith(`${yol}?`)) sayi += 1;
    if (sayi >= YOL_BASINA_TAVAN) continue;
    SORGU_HAVUZU.set(anahtar, adres);
  }
}

async function ornekYol(rota) {
  /* Sabit segmentin birden çok adayı varsa her birini sırayla dene. */
  for (const [desen, adaylar] of Object.entries(SABIT_SEGMENT)) {
    if (!rota.includes(desen)) continue;
    for (const aday of adaylar) {
      const bulunan = await ornekYol(rota.split(desen).join(aday));
      if (bulunan) return bulunan;
    }
    return null;
  }
  const parcalar = rota.split("/");
  const sira = parcalar.findIndex((p) => p.startsWith("["));
  if (sira < 0) return rota;
  const ust = parcalar.slice(0, sira).join("/");
  const kuyruk = parcalar.slice(sira + 1).join("/");
  let kimlik = havuz.get(ust);
  if (!kimlik) {
    /* Havuzda yoksa üst liste sayfasını ayrıca çek. */
    try {
      const cevap = await fetch(sunucu(ust) + ust, { cache: "no-store", headers: { cookie: cerez } });
      if (cevap.ok) {
        havuzaTopla(await cevap.text());
        kimlik = havuz.get(ust);
      }
    } catch { /* ağ hatası: rota atlanmış sayılır */ }
  }
  if (!kimlik) return null;
  const bulunan = `${ust}/${kimlik}${kuyruk ? "/" + kuyruk : ""}`;
  return bulunan.includes("[") ? null : bulunan;
}

const atlanan = [];

async function dene(rota) {
  const adres = sunucu(rota) + rota;
  try {
    const cevap = await fetch(adres, {
      cache: "no-store",
      redirect: "manual",
      headers: { RSC: "1", cookie: cerez },
    });
    const govde = await cevap.text();
    havuzaTopla(govde);
    sorguTopla(govde);
    const imzalar = [...govde.matchAll(DIGEST)].map((m) => m[1]);
    const cokme = imzalar.find((x) => /^\d+$/.test(x));
    if (cokme) return { rota, durum: "COKME", not: `hata kodu ${cokme}` };
    const yonlendirme = imzalar.find((x) => x.startsWith("NEXT_REDIRECT"));
    if (yonlendirme) return { rota, durum: "yonlendirme", not: yonlendirme.split(";")[2] ?? "" };
    if (imzalar.some((x) => x.startsWith("NEXT_HTTP_ERROR_FALLBACK"))) return { rota, durum: "bulunamadi", not: "" };
    /* Oturum düşmüşse her sayfa girişe gider; "hepsi temiz" sanılmasın. */
    if (/\/login|\/giris/.test(cevap.headers.get("location") ?? "")) return { rota, durum: "OTURUM", not: "girişe yönlendi" };
    if (cevap.status >= 500) return { rota, durum: "COKME", not: `HTTP ${cevap.status}` };
    return { rota, durum: "ok", not: `${cevap.status}` };
  } catch (hata) {
    /* Taşıma hatası sayfanın kusuru DEĞİL: ağ kapalı, taban adres
       yanlış ya da başlık kurulamıyor olabilir. Ayrı işaretleniyor ki
       özet "şu kadar sayfa çöküyor" demesin. */
    return { rota, durum: "ULASILAMADI", not: `istek düştü: ${hata.message}` };
  }
}

const DURGUNLAR = [...taranacak];
const sonuclar = [];
/* Önce durgun rotalar: yanıtları kimlik havuzunu dolduruyor. */
for (const rota of taranacak) sonuclar.push(await dene(rota));

/* Sonra dinamikler: örnek kimlik havuzdan, yoksa üst listeden. */
if (!argv.includes("--yalnizca-durgun")) {
  /*
    İKİ TUR. Dinamik rotalar da havuzu besliyor ve sıra alfabetik:
    gizlilik sözleşmesinin bağlantısı PERSONEL DETAYINDA geçiyor, o da
    "confidentiality"den sonra taranıyor. Birinci turda örneği
    bulunamayan rota, havuz büyüdükten sonra ikinci turda bulunabiliyor.
  */
  let bekleyen = dinamikler.filter((r) => !yalnizca || r.startsWith(yalnizca));
  for (let tur = 0; tur < 2 && bekleyen.length; tur += 1) {
    const kalan = [];
    for (const rota of bekleyen) {
      const ornek = await ornekYol(rota);
      if (!ornek) { kalan.push(rota); continue; }
      const sonuc = await dene(ornek);
      sonuclar.push({ ...sonuc, rota: `${rota} → ${ornek.replace(/[0-9a-f-]{36}/g, "…")}` });
      taranacak.push(ornek);
    }
    bekleyen = kalan;
  }
  atlanan.push(...bekleyen);
} else {
  atlanan.push(...dinamikler);
}

/* En son sorgu görünümleri: havuz artık bütün gezilen sayfalardan dolu. */
let sorguSayisi = 0;
if (!argv.includes("--sekme-yok")) {
  for (const adres of SORGU_HAVUZU.values()) {
    if (yalnizca && !adres.startsWith(yalnizca)) continue;
    sorguSayisi += 1;
    sonuclar.push(await dene(adres));
  }
}

/*
  BAYAT ADRES: bağlantılardan toplanan her adres GEÇERLİ.

  Havuz yöntemi arayüzün bağladığı adresleri tarıyor, yani hiçbiri
  bozuk olamaz. Oysa çökme ekranına düşüren adres tam olarak elle
  yazılan, yer imine kaydedilmiş ya da artık var olmayan adrestir —
  betiğin var olma sebebi de buydu (/panel/finance/raporlar menüde
  gizliydi, adrese doğrudan gidilince çöküyordu).

  16.10.2026'da bu sınama sekiz listede çökme buldu: `?sayfa=2` "Bir
  sorun oluştu" veriyordu, çünkü PostgREST son satırın ötesindeki
  aralığı reddediyor ve sayfa onu okuma hatası sayıp fırlatıyordu.
  Sayfa numarası bu yüzden burada: tek bir değişkenle bütün listeler
  sınanıyor ve doğru davranış (ilk sayfaya yönlendirme) çökmeden
  AYIRT EDİLEBİLİYOR.
*/
const BAYAT = ["sayfa=99999"];
let bayatSayisi = 0;
if (!argv.includes("--bayat-yok")) {
  for (const rota of DURGUNLAR) {
    for (const sorgu of BAYAT) {
      bayatSayisi += 1;
      sonuclar.push(await dene(`${rota}?${sorgu}`));
    }
  }
}

/*
  BOZUK KİMLİK: dinamik rotanın kimlik segmenti yerine uuid OLMAYAN bir
  değer koyuluyor. Postgres böyle bir değeri 22P02 ile reddediyor ve
  hatayı fırlatan sayfa çökme ekranı veriyor; doğrusu "kayıt yok"
  (lib/kimlik → kimlikMi).

  Bu sınama bir GERİLEMEYİ yakaladı: beş detay sayfası eskiden HER okuma
  hatasını notFound'a çeviriyordu, yani bozuk kimlik tesadüfen doğru
  davranıyordu. Hata yutma kaldırılırken (231ac64) biçim denetimi onun
  yerine konmadı ve sayfalar çökmeye başladı — tsc, lint, 975 birim ve
  454 akış testi hepsi yeşildi. Yalnızca bu istek gördü.
*/
const BOZUK_KIMLIK = "bozuk-kimlik";
let bozukSayisi = 0;
if (!argv.includes("--bayat-yok")) {
  for (const rota of dinamikler) {
    if (yalnizca && !rota.startsWith(yalnizca)) continue;
    let yol = rota;
    /* Enum segment geçerli kalsın: sınanan şey kimlik. */
    for (const [desen, adaylar] of Object.entries(SABIT_SEGMENT)) yol = yol.split(desen).join(adaylar[0]);
    yol = yol.replace(/\[[^\]]+\]/g, BOZUK_KIMLIK);
    if (yol.includes("[")) continue;
    bozukSayisi += 1;
    sonuclar.push(await dene(yol));
  }
}

const cokmeler = sonuclar.filter((s) => s.durum === "COKME");
/*
  ULAŞILAMADI, çökmeden AYRI sayılıyor. Hepsi birden ulaşılamıyorsa
  sorun sayfalarda değil kurulumda (ağ, taban adres, başlık) ve
  "240 sayfa çöküyor" demek yanlış yönlendirmedir.
*/
const ulasilamayan = sonuclar.filter((s) => s.durum === "ULASILAMADI");
const oturum = sonuclar.filter((s) => s.durum === "OTURUM");
const yonlendirmeler = sonuclar.filter((s) => s.durum === "yonlendirme");

for (const s of sonuclar) {
  if (s.durum === "ok") continue;
  const isaret = s.durum === "COKME" ? "✗" : s.durum === "ULASILAMADI" ? "?" : s.durum === "OTURUM" ? "!" : "·";
  console.log(`  ${isaret} ${s.rota}  ${s.durum}${s.not ? "  " + s.not : ""}`);
}

console.log(
  `\n${taranacak.length} rota + ${sorguSayisi} sorgu görünümü + ${bayatSayisi} bayat adres + ${bozukSayisi} bozuk kimlik tarandı`
  + ` · ${sonuclar.length - cokmeler.length - ulasilamayan.length - oturum.length} sorunsuz`
  + ` · ${yonlendirmeler.length} yönlendirme`
  + ` · ${cokmeler.length} çökme`
  + (ulasilamayan.length ? ` · ${ulasilamayan.length} ulaşılamadı` : "")
  + (atlanan.length
    ? `\n${atlanan.length} rota atlandı (örnek kayıt bulunamadı): ${atlanan.join(", ")}`
    : `\n${dinamikler.length} dinamik rotanın örneği listelerden bulundu.`),
);

/*
  HİÇBİR SAYFAYA ULAŞILAMADIYSA sorun sayfalarda DEĞİL kurulumda:
  ağ kapalı, taban adres yanlış ya da başlık kurulamıyor. Bunu
  "şu kadar sayfa çöküyor" diye bildirmek, olmayan bir yangına
  koşturmaktır — 24.10.2026'da tam bu oldu (panoda çerez yerine bir
  SQL sonucu vardı, 240 sayfa "çöküyor" sanıldı).
*/
if (ulasilamayan.length === sonuclar.length && sonuclar.length > 0) {
  console.error(
    `\n✗ Hiçbir sayfaya ULAŞILAMADI (${ulasilamayan.length} istek). Sayfalar denenemedi;`
    + " bu sayfaların kusuru değil.\n"
    + `  İlk hata: ${ulasilamayan[0].not}\n`
    + "  Ağ, --taban adresi ve çerez biçimini kontrol edin.",
  );
  process.exit(2);
}
if (ulasilamayan.length) {
  console.error(`\n? ${ulasilamayan.length} isteğe ulaşılamadı (ağ/adres). Bu sayılar çökme değildir.`);
}
if (oturum.length) {
  console.error("\n! Bazı sayfalar girişe yönlendi: çerez eski olabilir. Sonuçlar güvenilir değil.");
  process.exit(2);
}
if (cokmeler.length) {
  console.error(`\n✗ ${cokmeler.length} sayfa çöküyor. Hata kodunu sunucu günlüğünde aratın.`);
  process.exit(1);
}
console.log("✓ Çöken sayfa yok.");
