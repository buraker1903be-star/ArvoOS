/*
 * OKUNAMAYAN SORGU "SIFIR" DEĞİLDİR.
 *
 * Neden var: Supabase istemcisi hata FIRLATMIYOR, `error` alanına yazıyor.
 * `const { data } = await supabase...` yazan bir sayfa, sorgu düştüğünde
 * `data` null alıyor ve onu "kayıt yok" diye çiziyor. Zararı özet
 * ekranlarında ortaya çıkıyor: 15.10.2026'da beş ekranda on iki okuma
 * böyleydi ve sonuçları şunlardı —
 *   · Sistem Sağlığı "Açık sorun 0 · Her şey yolunda" dedi (kiracı
 *     listesi okunamadığı için kota, limit sapması ve bayat kopya
 *     bölümlerinin üçü birden boşalmıştı).
 *   · Konsolun ana ekranı "Müşteri kurum 0 / 0, Beklenen aylık ₺0,00".
 *   · Tahsilat rakamı ŞİŞTİ: kurum listesi düşünce musteriMi(undefined)
 *     "müşteri" döndüğü için Arvo'nun kendi ödemeleri gelire karıştı.
 *   · Finans genel bakışta kâr oranı yükseldi (maliyetler sıfır sayıldı).
 *   · İK genel bakışta herkes "gizlilik sözleşmesi imzalamamış" göründü.
 *
 * Denetim neden DAR: depoda bu kalıptan seksen küsur yer var ve çoğu
 * zararsız (ad eşlemesi düşerse ekranda "—" yazar, yanlış bir cümle
 * kurulmaz). Her yeri işaretleyen bir denetim, herkesin susturmayı
 * öğrendiği bir denetim olur. Bu yüzden yalnızca ÖZET EKRANLARI
 * taranıyor: orada ekrandaki her şey bir sonuç, dolayısıyla okunamayan
 * her sorgu yanlış bir sonuç demek.
 *
 * Bilerek yutuluyorsa satırın üstüne gerekçe yazılır:
 *   // hata-tamam: yalnızca ad gösteriyor, düşerse "—" yazar
 */
import fs from "node:fs";

/* Ekrandaki her şeyin bir sonuç olduğu sayfalar. Yeni bir özet ekranı
   açıldığında buraya eklenir; liste kısa kalsın diye liste sayfalarının
   tamamı değil, yalnızca sayı/durum özeti çizenler var. */
const EKRANLAR = [
  "app/panel/page.tsx",
  "app/panel/konsol-ana-sayfa.tsx",
  "app/panel/billing/page.tsx",
  "app/panel/crm/genel-bakis/page.tsx",
  "app/panel/operations/page.tsx",
  "app/panel/finance/genel-bakis/page.tsx",
  "app/panel/hr/genel-bakis/page.tsx",
  "app/panel/analitik/page.tsx",
  "app/panel/analitik/canli/page.tsx",
  "app/panel/analitik/kurulum/page.tsx",
  "app/panel/platform/saglik/page.tsx",
  "app/panel/platform/tahsilat/page.tsx",
  "app/panel/platform/billing/page.tsx",
  "app/panel/platform/moduller/page.tsx",
  "app/panel/platform/kurulumlar/page.tsx",
  "app/panel/platform/musteriler/page.tsx",
  "app/panel/platform/kullanicilar/page.tsx",
  "app/panel/platform/fiyatlar/page.tsx",
  "app/panel/platform/payments/page.tsx",
  "app/panel/platform/subscribers/page.tsx",
  "app/panel/platform/ayarlar/page.tsx",
  "app/panel/crm/page.tsx",
  "app/panel/crm/contracts/page.tsx",
  "app/panel/crm/proposals/page.tsx",
  "app/panel/operations/isler/page.tsx",
  "app/panel/operations/pano/page.tsx",
  "app/panel/operations/ekip/page.tsx",
  "app/panel/operations/arsiv/page.tsx",
  "app/panel/finance/page.tsx",
  "app/panel/finance/raporlar/page.tsx",
  "app/panel/hr/page.tsx",
  "app/panel/accounts/page.tsx",
  "app/panel/posta/page.tsx",
];

const MUAFIYET = /hata-tamam:/;
/* Yakalanan hatanın ADI dosyada bir daha geçmiyorsa yakalamak gösterişten
   ibaret: ya fırlatılmalı ya ekrana yazılmalı. */
const sorunlar = [];
let baglama = 0;

for (const dosya of EKRANLAR) {
  if (!fs.existsSync(dosya)) { sorunlar.push(`${dosya}: listede var ama dosya yok (taşındıysa listeyi güncelleyin)`); continue; }
  const metin = fs.readFileSync(dosya, "utf8");
  const satirlar = metin.split("\n");

  satirlar.forEach((satir, sira) => {
    // Üçlü işlecin yedek dalı (`: { data: null }`) bir bağlama değil.
    if (/^\s*[:?]/.test(satir)) return;
    // `Promise.resolve({ data: [] })` ve `(x as { data: T }).data` de değil.
    if (/Promise\.resolve\s*\(|\bas\s*\{/.test(satir)) return;

    /* Tek satırda birden çok bağlama olabiliyor (Promise.all'un destructure
       satırı): hepsi tek tek bakılıyor, ilkinde durulmuyor. */
    for (const eslesme of satir.matchAll(/\{\s*(?:count:\s*[A-Za-z0-9_]+\s*,\s*)?data:\s*([A-Za-z0-9_]+)([^}]*)\}/g)) {
    baglama++;
    const [tumu, ad] = eslesme;
    if (/\berror\b/.test(tumu)) {
      // Hata yakalanmış: adı başka bir yerde geçiyor mu?
      const hataAdi = tumu.match(/error:\s*([A-Za-z0-9_]+)/)?.[1] ?? "error";
      const gecis = metin.split(new RegExp(`\\b${hataAdi}\\b`)).length - 1;
      if (gecis < 2) sorunlar.push(`${dosya}:${sira + 1}  "${hataAdi}" yakalanıyor ama hiç kullanılmıyor — fırlatın ya da ekrana yazın`);
      continue;
    }
    /*
      Muafiyet satırın kendisinde ya da HEMEN ÜSTÜNDEKİ yorum bloğunda
      aranıyor. Önce sabit dört satırlık bir pencere denendi ve yanlış
      çıktı: bir bağlamaya yazılan gerekçe, hemen altındaki komşu
      bağlamayı da susturuyordu (sağlık sayfasında depolamalar'ın
      gerekçesi cronIlk'i sustururken yakalandı). Yorum bloğu ise o
      satıra ait olduğu için sızmıyor ve gerekçe birkaç satır olabiliyor.
    */
    let pencere = satir;
    for (let u = sira - 1; u >= 0 && /^\s*\/\//.test(satirlar[u]); u--) pencere += "\n" + satirlar[u];
    if (MUAFIYET.test(pencere)) continue;
    sorunlar.push(`${dosya}:${sira + 1}  "${ad}" okunuyor ama hatası alınmıyor — düşerse ekran "kayıt yok" der. Yakalayın ya da üstüne "// hata-tamam: <sebep>" yazın.`);
    }
  });
}

if (sorunlar.length) {
  console.error("✗ Okunamayan sorgu denetimi:");
  for (const s of sorunlar) console.error("  " + s);
  console.error(`\n${sorunlar.length} yer. Gerekçe için scripts/check-okunamayan.mjs başındaki nota bakın.`);
  process.exit(1);
}
console.log(`✓ Okunamayan sorgu denetimi: ${EKRANLAR.length} özet ekranı, ${baglama} okuma — hatası alınmayan yok.`);
