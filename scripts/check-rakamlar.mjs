// Konsoldaki sayıların dürüstlük denetimi.
//
//   node scripts/check-rakamlar.mjs
//
// Neden var: 22 Eylül 2026'da kurucu konsolunun beş sayfası tek tek
// gözden geçirildi ve çıkan hataların neredeyse tamamı AYNI İKİ KALIPTI.
// İkisi de derlemede, lint'te, testte ve şema denetiminde görünmüyor:
// sorgu çalışıyor, sayı ekrana yazılıyor, yalnızca YANLIŞ oluyor.
//
// KALIP 1 — sınırlı sorgudan toplam ya da SAYIM.
//   .limit(50) ile çekilen satırlar .reduce() ile toplanıp "Tahsil edildi"
//   diye yazılıyordu. 51. kayıttan sonra rakam sessizce eksilmeye başlar;
//   kimse fark etmez, çünkü hata vermez. Üç sayfada üç kez çıktı
//   (billing .limit(50), payments .limit(100), subscribers .limit(200)).
//
//   26.09.2026'da DÖRDÜNCÜSÜ çıktı ve denetim onu kaçırdı: WhatsApp gelen
//   kutusu kurumun son 300 mesajını çekip bir `for` döngüsünde sohbetlere
//   bölüyordu (messageCount += 1). Toplama .reduce() ile yapılmadığı için
//   desen tutmuyordu. Sonucu daha da ağırdı: 300 mesajdan eskiye kalan
//   sohbet listeden tamamen kayboluyordu. Bu yüzden kalıp artık döngüyle
//   biriktirmeyi ve sınırlı liste üzerinde .filter(…).length saymayı da
//   arıyor.
//
// KALIP 2 — tuzak tablo.
//   Adı doğru gelen ama başka bir şey tutan tablodan okumak:
//   billing_invoices KİRACININ kendi müşterilerine kestiği faturalar,
//   billing_subscriptions bir abonelik kütüğü değil ödeme günlüğü.
//   İkisi de "Arvo'nun geliri" diye gösterildi.
//
// Bu denetim sayının DOĞRU olduğunu kanıtlamaz; yalnızca bu iki kalıbı
// yakalar. Bilerek yapılan bir kullanım varsa satırın kendisine ya da bir
// üst satıra `tuzak-tamam: <sebep>` yazın — sebebi yazmak, denetimi
// susturmanın bedeli.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARANAN = ["app", "lib"];

/*
  Tuzak tablolar ve sütunlar.

  KAPSAM önemli: billing_invoices kiracının Finans modülünde DOĞRU tablo —
  kurumun kendi müşterilerine kestiği faturalar orada tutuluyor. Tuzak
  olduğu yer kurucu konsolu: orada Arvo'nun geliri sanılıyor. Kuralı her
  yere uygulamak yirmi bir uyarı üretip denetimi okunmaz yapıyordu; okunmaz
  bir denetim, olmayan denetimdir.

  `sebep` mesajın kendisi: öğretici olmalı, yoksa kişi kuralı susturup
  geçer.
*/
/* Kurucu konsolu: yalnız platform sayfaları ve konsol bileşenleri. */
const KONSOL = (yol) => /^app\/panel\/(platform\/|konsol-)/.test(yol);
const HER_YER = () => true;

const TUZAKLAR = [
  {
    ad: "billing_invoices",
    kapsam: KONSOL,
    sebep: "kiracının KENDİ müşterilerine kestiği faturalar (Finans modülü yazıyor); Arvo'nun geliri değil. Kiracı panelinde doğru tablo, konsolda değil",
  },
  {
    ad: "billing_subscriptions",
    kapsam: KONSOL,
    sebep: "abonelik kütüğü değil ÖDEME GÜNLÜĞÜ: arvo_record_paytr_payment her ödemede yeni satır atıyor ve status'ü hep 'active' yazıyor. Abonelik sayısı için organization_licenses + organization_product_licenses",
  },
  {
    ad: "ai_credits_used",
    kapsam: HER_YER,
    sebep: "hiçbir kod artırmıyor; ArvoLab tüketimi kendi veritabanında tutuyor, bu sütun her kiracıda 0",
  },
];

const KACIS = /tuzak-tamam\s*:/;

/*
  Yorumları ve dizgileri boşluğa çevirir; uzunluk korunur, bu yüzden satır
  numaraları kaymaz. Yorum içinde geçen tablo adları yüzünden uyarı
  üretiliyordu — bu denetimin kendi açıklamasını bile suçluyordu.
*/
function koduAyikla(kaynak) {
  let cikti = "";
  let i = 0;
  const bosalt = (metin) => metin.replace(/[^\n]/g, " ");
  while (i < kaynak.length) {
    const iki = kaynak.slice(i, i + 2);
    if (iki === "//") {
      const son = kaynak.indexOf("\n", i);
      const bitis = son === -1 ? kaynak.length : son;
      cikti += bosalt(kaynak.slice(i, bitis));
      i = bitis;
    } else if (iki === "/*") {
      const son = kaynak.indexOf("*/", i + 2);
      const bitis = son === -1 ? kaynak.length : son + 2;
      cikti += bosalt(kaynak.slice(i, bitis));
      i = bitis;
    } else if (kaynak[i] === '"' || kaynak[i] === "'" || kaynak[i] === "`") {
      // Dizgiler DURUYOR: .from("tablo") ve .select("sütun") burada okunuyor.
      const tirnak = kaynak[i];
      let j = i + 1;
      while (j < kaynak.length && kaynak[j] !== tirnak) {
        if (kaynak[j] === "\\") j += 1;
        j += 1;
      }
      cikti += kaynak.slice(i, Math.min(j + 1, kaynak.length));
      i = j + 1;
    } else {
      cikti += kaynak[i];
      i += 1;
    }
  }
  return cikti;
}

/** Dosyaları topla. */
function dosyalar(dizin, bulunan = []) {
  for (const oge of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, oge.name);
    if (oge.isDirectory()) {
      if (oge.name === "node_modules" || oge.name === ".next") continue;
      dosyalar(tam, bulunan);
    } else if (/\.(ts|tsx)$/.test(oge.name)) {
      bulunan.push(tam);
    }
  }
  return bulunan;
}

/** Üst seviye virgülden böler: parantez/köşeli/süslü içindekiler bölünmez. */
function ustSeviyeBol(metin) {
  const parcalar = [];
  let derinlik = 0;
  let bas = 0;
  for (let i = 0; i < metin.length; i += 1) {
    const k = metin[i];
    if (k === "(" || k === "[" || k === "{") derinlik += 1;
    else if (k === ")" || k === "]" || k === "}") derinlik -= 1;
    else if (k === "," && derinlik === 0) {
      parcalar.push(metin.slice(bas, i));
      bas = i + 1;
    }
  }
  parcalar.push(metin.slice(bas));
  return parcalar;
}

/**
 * `{ data: x, error }` içinden x'i, `{ data, error }` içinden "data"yı çıkarır.
 *
 * KISAYOL biçimi eskiden tanınmıyordu: yalnızca `data:` arayan kalıp
 * `const { data } = await …limit(300)` yazan kodu hiç görmüyordu. WhatsApp
 * gelen kutusu (26.09.2026) tam bu yazımla yazılmıştı; denetim bu yüzden
 * .reduce() dalıyla bile yakalayamazdı.
 */
const dataAdi = (kalip) => {
  const takma = kalip.match(/\bdata\s*:\s*([A-Za-z_$][\w$]*)/);
  if (takma) return takma[1];
  return /\bdata\b\s*(?![:\w])/.test(kalip) ? "data" : null;
};

/**
 * Sınırlı sorgudan gelen değişken adları.
 *
 * İki yazım var ve ikisi de kullanılıyor:
 *   const { data: x } = await supabase.from(…).limit(50)
 *   const [{ data: a }, { data: b }] = await Promise.all([ …, … ])
 * İkincisinde eşleşme SIRAYA göre: birinci yıkım birinci sorguya denk.
 */
function sinirliAdlar(kaynak) {
  const sinirli = new Set();

  for (const m of kaynak.matchAll(/const\s*\{([^{}]*)\}\s*=\s*await\s+[\s\S]*?;/g)) {
    if (!/\.limit\(/.test(m[0])) continue;
    const ad = dataAdi(m[1]);
    if (ad) sinirli.add(ad);
  }

  for (const m of kaynak.matchAll(/const\s*\[([\s\S]*?)\]\s*=\s*await\s+Promise\.all\(\s*\[([\s\S]*?)\]\s*\)\s*;/g)) {
    const hedefler = ustSeviyeBol(m[1]);
    const sorgular = ustSeviyeBol(m[2]);
    hedefler.forEach((hedef, sira) => {
      const sorgu = sorgular[sira];
      if (!sorgu || !/\.limit\(/.test(sorgu)) return;
      const ad = dataAdi(hedef);
      if (ad) sinirli.add(ad);
    });
  }

  /*
    Türev adlar: `const satirlar = (data ?? []) as T[]` ve ardından
    `const odeyenler = satirlar.filter(…)`. Sınır türevlerde de duruyor;
    üç geçiş zincirin bu derinliğine yetiyor.
  */
  for (let gecis = 0; gecis < 3; gecis += 1) {
    for (const m of kaynak.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g)) {
      const [, hedef, sag] = m;
      if (sinirli.has(hedef)) continue;
      const tureyen = [...sinirli].some((ad) => new RegExp(`\\b${ad}\\b`).test(sag));
      if (tureyen && /\?\?\s*\[\]|\.filter\(|\.map\(|\.slice\(|\.\.\./.test(sag)) sinirli.add(hedef);
    }
  }

  return sinirli;
}

/**
 * `for (… of ad)` / `ad.forEach(…)` gövdesi: eşleşen kapanışa kadar.
 *
 * Döngünün KENDİSİ suç değil — sınırlı bir listeyi ekrana dizmek doğru.
 * Suç, o döngüde SAYI BİRİKTİRMEK: sınır aşıldığında liste kısalır,
 * biriken sayı da sessizce eksilir.
 */
function dongununGovdesi(kaynak, baslangic) {
  const acilis = kaynak.indexOf("{", baslangic);
  if (acilis === -1) return "";
  let derinlik = 0;
  for (let i = acilis; i < kaynak.length; i += 1) {
    if (kaynak[i] === "{") derinlik += 1;
    else if (kaynak[i] === "}") {
      derinlik -= 1;
      if (derinlik === 0) return kaynak.slice(acilis, i + 1);
    }
  }
  return kaynak.slice(acilis);
}

/*
  Biriktirme belirtisi yalnızca SAYAÇ artırma.

  `.push(` de denendi ve yanlış alarm verdi: sınırlı bir listeyi ekrana
  dizmek için gruplamak (app/panel/hr/activity groupByDay) doğru bir
  kullanım — yalnızca çekileni gösteriyor, bir sayı iddia etmiyor. Suç,
  o döngüde SAYI biriktirip onu bir ölçü gibi sunmak.
*/
const BIRIKTIRME = /\+=|\+\+/;

const sorunlar = [];

for (const dizin of TARANAN) {
  const tam = path.join(root, dizin);
  if (!fs.existsSync(tam)) continue;

  for (const dosya of dosyalar(tam)) {
    const ham = fs.readFileSync(dosya, "utf8");
    const kaynak = koduAyikla(ham);
    const goreli = path.relative(root, dosya).split(path.sep).join("/");
    const satirNo = (indeks) => kaynak.slice(0, indeks).split("\n").length;
    const satirlar = ham.split("\n");
    /*
      Kaçış: satırın kendisinde ya da HEMEN ÜSTÜNDEKİ yorum bloğunun
      herhangi bir satırında. Sabit "bir üst satır" kuralı, açıklaması iki
      satır süren bir kaçışı görmüyordu; kaçışın başına yazmak da sonuna
      yazmak kadar doğal.
    */
    /*
      Yorum satırı, AYIKLANMIŞ kaynakla karşılaştırılarak bulunuyor:
      koduAyikla yorumları boşluğa çevirip uzunluğu koruyor, yani ham satırda
      içerik varken ayıklanmış satır boşsa o satır yorumdur.

      Eskiden ölçüt "satır //, * ya da /* ile başlıyor mu" idi ve bu deponun
      blok yorum üslubuyla (ara satırlar yıldızsız) çalışmıyordu: iki satırdan
      uzun bir açıklamanın içine yazılan `tuzak-tamam:` hiç görünmüyordu.
      Belgelenen kaçış yolunun kendisi işlemiyordu.
    */
    const ayiklanmisSatirlar = kaynak.split("\n");
    const yorumMu = (no) =>
      (satirlar[no] ?? "").trim().length > 0 && (ayiklanmisSatirlar[no] ?? "").trim().length === 0;
    const kacisVar = (no) => {
      if (KACIS.test(satirlar[no - 1] ?? "")) return true;
      for (let i = no - 2; i >= 0 && yorumMu(i); i -= 1) {
        if (KACIS.test(satirlar[i])) return true;
      }
      return false;
    };

    // --- KALIP 1
    const sinirli = sinirliAdlar(kaynak);
    if (sinirli.size) {
      for (const m of kaynak.matchAll(/\.reduce\(/g)) {
        const no = satirNo(m.index);
        if (kacisVar(no)) continue;
        // Toplamanın alıcısı bu ifadenin solunda; zincir satıra yayılabiliyor.
        const onceki = kaynak.slice(Math.max(0, m.index - 400), m.index);
        const suclu = [...sinirli].find((ad) => new RegExp(`\\b${ad}\\b[^;]*$`).test(onceki));
        if (!suclu) continue;
        sorunlar.push(
          `${goreli}:${no}  "${suclu}" .limit() ile sınırlı bir sorgudan geliyor ama .reduce() ile toplanıyor.\n` +
          "      Toplam, sınıra ulaşıldığı anda sessizce eksilmeye başlar. Toplamı ayrı ve sınırsız bir\n" +
          "      sorgudan hesaplayın; liste kısa kalabilir, toplam kısalmamalı.",
        );
      }

      // --- KALIP 1b: sınırlı liste üzerinde döngü kurup sayı biriktirmek
      for (const ad of sinirli) {
        const desenler = [
          new RegExp(`for\\s*\\([^)]*\\bof\\s+[^)]*\\b${ad}\\b[^)]*\\)`, "g"),
          new RegExp(`\\b${ad}\\b[^;=]{0,40}?\\.forEach\\(`, "g"),
        ];
        for (const desen of desenler) {
          for (const m of kaynak.matchAll(desen)) {
            const no = satirNo(m.index);
            if (kacisVar(no)) continue;
            if (!BIRIKTIRME.test(dongununGovdesi(kaynak, m.index + m[0].length - 1))) continue;
            sorunlar.push(
              `${goreli}:${no}  "${ad}" .limit() ile sınırlı ama bir döngüde sayı biriktiriliyor (+= ya da ++).\n` +
              "      Sınır aşıldığında liste kısalır, biriken sayı da sessizce eksilir — üstelik listeye hiç\n" +
              "      girmeyen kayıt varsa ekranda yokmuş gibi görünür. Sayımı veritabanına taşıyın\n" +
              "      (count veya gruplayan bir fonksiyon) ya da sınırı sayılan şeye değil GÖSTERİLEN\n" +
              "      şeye uygulayın.",
            );
          }
        }
      }

      // --- KALIP 1c: sınırlı liste üzerinde .filter(…).length ile saymak
      for (const ad of sinirli) {
        const desen = new RegExp(`\\b${ad}\\b\\s*\\.filter\\(`, "g");
        for (const m of kaynak.matchAll(desen)) {
          const kalan = kaynak.slice(m.index, m.index + 600);
          if (!/\)\s*\.length\b/.test(kalan)) continue;
          const no = satirNo(m.index);
          if (kacisVar(no)) continue;
          sorunlar.push(
            `${goreli}:${no}  "${ad}" .limit() ile sınırlı ama .filter(…).length ile SAYILIYOR.\n` +
            "      Sayı, sınıra ulaşıldığı anda sessizce eksilmeye başlar. Sayımı veritabanına taşıyın.",
          );
        }
      }
    }

    // --- KALIP 2
    for (const tuzak of TUZAKLAR) {
      if (!tuzak.kapsam(goreli)) continue;
      for (const m of kaynak.matchAll(new RegExp(`\\b${tuzak.ad}\\b`, "g"))) {
        const no = satirNo(m.index);
        if (kacisVar(no)) continue;
        sorunlar.push(
          `${goreli}:${no}  "${tuzak.ad}" tuzak: ${tuzak.sebep}.\n` +
          "      Bilerek kullanıyorsanız satıra `tuzak-tamam: <sebep>` yazın.",
        );
      }
    }
  }
}

if (sorunlar.length) {
  console.error(`✗ Rakam denetimi: ${sorunlar.length} sorun\n${sorunlar.map((s) => `  ${s}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `✓ Rakam denetimi: sınırlı sorgudan toplam/sayım yok (reduce, döngüde biriktirme, filter().length), ` +
  `${TUZAKLAR.length} tuzak tablo/sütun gözetiliyor`,
);
