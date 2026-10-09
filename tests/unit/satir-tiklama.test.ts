import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
  SATIRIN TAMAMI TIKLANABİLİR — kaynak düzeyinde sabitleme.

  Davranış tarayıcıda (olay dinleyicisi + yönlendirme) gerçekleşiyor ve
  birim testte kurulamaz; sabitlenebilen şey KALIBIN KENDİSİ.

  08.10.2026: satır tıklaması, ilk hücredeki bağlantıya konan mutlak
  konumlu bir ::after kaplamasıyla yapılıyordu. Bu, <tr>'nin kapsayıcı
  blok oluşturmasına dayanıyor; Safari bunu yapmıyor ve kaplama kartın
  tamamına yayılıyordu — boş bir yere tıklamak alakasız bir kayıt
  açıyor, tekerlek ve klavye liste kabına hiç ulaşamıyordu.

  Bu test o kalıba dönüşü yakalar.
*/

const kok = path.resolve(import.meta.dirname, "../..");
const oku = (gorece: string) => fs.readFileSync(path.join(kok, gorece), "utf8");

const LISTE_SAYFALARI = [
  "app/panel/crm/page.tsx",
  "app/panel/crm/contracts/page.tsx",
  "app/panel/crm/proposals/page.tsx",
  "app/panel/operations/isler/page.tsx",
  "app/panel/hr/page.tsx",
  "app/panel/finance/page.tsx",
  // Detay tabloları (09.10.2026): müşteri kayıtları, maliyet kalemleri, cari ödeme takvimi.
  "app/panel/musteri/musteri-detayi.tsx",
  "app/panel/finance/costs/maliyet-detayi.tsx",
  "app/panel/accounts/cari-hesap.tsx",
];

test("satır kaplaması hiçbir biçeme geri gelmedi", () => {
  const biçemler = ["app/panel/crm/kayit-detay/kayit-detay.css", "app/panel/panel-premium.css", "app/panel/panel-ui.css"];
  for (const dosya of biçemler) {
    const metin = oku(dosya);
    assert.ok(!/\.crm-row-link::after\s*\{[^}]*position:\s*absolute/.test(metin),
      `${dosya}: satır kaplaması geri gelmiş (Safari'de kartın tamamını kaplıyor)`);
  }
});

test("satır <tr>'si konumlandırılmıyor", () => {
  // Kaplamanın satırda kalması buna dayanıyordu; Safari <tr>'yi kapsayıcı
  // blok yapmıyor. Kural geri gelirse kaplama da geri gelir.
  for (const dosya of ["app/panel/crm/kayit-detay/kayit-detay.css", "app/panel/panel-premium.css"]) {
    const metin = oku(dosya);
    assert.ok(!/tbody tr\s*\{[^}]*position:\s*relative/.test(metin),
      `${dosya}: tbody tr yeniden position:relative olmuş`);
  }
});

test("liste ve detay tablolarının hepsi satır tıklamasını kuruyor", () => {
  /* Bileşen tabloya TEK dinleyici bağlıyor; sayfalardan birinde unutulursa
     o listede satır tıklaması sessizce kaybolur — görünür bir hata vermez. */
  for (const sayfa of LISTE_SAYFALARI) {
    const metin = oku(sayfa);
    assert.match(metin, /<SatirTiklama \/>/, `${sayfa}: <SatirTiklama /> yok`);
    assert.match(metin, /import \{ SatirTiklama \}/, `${sayfa}: SatirTiklama içe aktarılmamış`);
  }
});

test("bileşen satırdaki gerçek bağlantıya gidiyor", () => {
  /* Adres JSX'ten prop olarak değil DOM'dan okunuyor; gerçek bağlantı
     yerinde kaldığı için klavye, ekran okuyucu ve "yeni sekmede aç"
     çalışmaya devam ediyor. */
  const metin = oku("app/panel/crm/satir-tiklama.tsx");
  assert.match(metin, /a\.crm-row-link/);
  assert.match(metin, /closest\("tbody tr[",]/);
  /* Gidecek sayfası olmayan satır (maliyet kalemi, taksit) penceresini
     açan .satir-ac düğmesine basar; liste öğesi .satir-tiklanir ile. */
  assert.match(metin, /button\.satir-ac/);
  assert.match(metin, /\.satir-tiklanir > li/);
  // Hücredeki kendi bağlantısı/düğmesi satır tıklamasını yutmamalı.
  assert.match(metin, /KENDI_ISI/);
  // Metin seçerken yanlışlıkla kayıt açılmamalı.
  assert.match(metin, /getSelection/);
});

test("satırda Ctrl/Cmd yeni sekmede, Shift yeni pencerede açar", async () => {
  /*
    09.10.2026: değiştirici tuşlara bakılmıyordu; satırın boş yerine
    Ctrl/Cmd ile tıklamak kaydı aynı sekmede açıyor ve listeyi
    kaybettiriyordu.
  */
  const { satirTiklamaKipi } = await import("@/lib/satir-tiklama");
  const tik = (ek: Partial<Parameters<typeof satirTiklamaKipi>[0]> = {}) =>
    satirTiklamaKipi({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...ek });
  assert.equal(tik(), "ayni-sekme");
  assert.equal(tik({ ctrlKey: true }), "yeni-sekme");
  assert.equal(tik({ metaKey: true }), "yeni-sekme");
  assert.equal(tik({ shiftKey: true }), "yeni-pencere");
  assert.equal(tik({ altKey: true }), "yoksay");
  assert.equal(tik({ button: 1 }), "yoksay");
  assert.equal(tik({ defaultPrevented: true }), "yoksay");
  assert.match(oku("app/panel/crm/satir-tiklama.tsx"), /satirTiklamaKipi\(olay\)/, "bileşen kararı bu fonksiyondan almıyor");
});
