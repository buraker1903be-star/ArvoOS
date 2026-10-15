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
 * NEDEN CI'DA DEĞİL: oturum çerezi ve gerçek veri istiyor. Dağıtımdan
 * sonra elle koşturulur; kurumun paketine göre sonuç değişir, çünkü
 * kapalı modül artık çökme değil yönlendirme üretiyor (lib/modul-kapisi).
 *
 * KULLANIM
 *   ARVO_COOKIE="$(pbpaste)" node scripts/duman-testi.mjs
 *   node scripts/duman-testi.mjs --cerez-dosyasi ~/arvo-cerez.txt
 *   node scripts/duman-testi.mjs --taban https://app.arvo-os.com --konsol https://yonetim.arvo-os.com
 *   node scripts/duman-testi.mjs --yalnizca /panel/finance
 *
 * Çerez tarayıcıdan alınır (Ağ sekmesinde bir isteğin `cookie` başlığı).
 * Hangi ÇALIŞMA ALANI taranacağını da o çerez söyler: başka bir kurumu
 * taramak için panelde çalışma alanını değiştirip çerezi yeniden alın.
 *
 * Rota listesi app/ ağacından türetiliyor: yeni bir sayfa açıldığında
 * elle eklemek gerekmesin. Dinamik segmentli yollar ([id]) atlanıyor —
 * gerçek bir kimlik olmadan çağrılamazlar; kaç tanesi atlandığı
 * yazılıyor ki "taradım" derken kapsam belli olsun.
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

const cerez = (cerezDosyasi ? fs.readFileSync(cerezDosyasi, "utf8") : process.env.ARVO_COOKIE || "").trim();
if (!cerez) {
  console.error(
    "✗ Oturum çerezi yok.\n"
    + "  ARVO_COOKIE ortam değişkenini ya da --cerez-dosyasi verin.\n"
    + "  Çerezi tarayıcının Ağ sekmesinden bir isteğin `cookie` başlığından kopyalayın.",
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
const dinamik = tumu.filter((r) => r.includes("["));
let taranacak = tumu.filter((r) => !r.includes("["));
if (yalnizca) taranacak = taranacak.filter((r) => r.startsWith(yalnizca));

/* Konsol yolları kendi alan adından istenir: panelden çağrılırsa
   ara katman çalışma alanına göre başka yere yönlendirir. */
const sunucu = (rota) => (rota.startsWith("/panel/platform") ? konsol : taban);

const DIGEST = /"digest\\?":\\?"([^"\\]+)/g;

async function dene(rota) {
  const adres = sunucu(rota) + rota;
  try {
    const cevap = await fetch(adres, {
      cache: "no-store",
      redirect: "manual",
      headers: { RSC: "1", cookie: cerez },
    });
    const govde = await cevap.text();
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
    return { rota, durum: "COKME", not: `istek düştü: ${hata.message}` };
  }
}

const sonuclar = [];
for (const rota of taranacak) sonuclar.push(await dene(rota));

const cokmeler = sonuclar.filter((s) => s.durum === "COKME");
const oturum = sonuclar.filter((s) => s.durum === "OTURUM");
const yonlendirmeler = sonuclar.filter((s) => s.durum === "yonlendirme");

for (const s of sonuclar) {
  if (s.durum === "ok") continue;
  const isaret = s.durum === "COKME" ? "✗" : s.durum === "OTURUM" ? "!" : "·";
  console.log(`  ${isaret} ${s.rota}  ${s.durum}${s.not ? "  " + s.not : ""}`);
}

console.log(
  `\n${taranacak.length} rota tarandı`
  + ` · ${sonuclar.length - cokmeler.length - oturum.length} sorunsuz`
  + ` · ${yonlendirmeler.length} yönlendirme`
  + ` · ${cokmeler.length} çökme`
  + `\n${dinamik.length} dinamik rota atlandı (kimlik gerekiyor): ${dinamik.slice(0, 3).join(", ")}…`,
);

if (oturum.length) {
  console.error("\n! Bazı sayfalar girişe yönlendi: çerez eski olabilir. Sonuçlar güvenilir değil.");
  process.exit(2);
}
if (cokmeler.length) {
  console.error(`\n✗ ${cokmeler.length} sayfa çöküyor. Hata kodunu sunucu günlüğünde aratın.`);
  process.exit(1);
}
console.log("✓ Çöken sayfa yok.");
