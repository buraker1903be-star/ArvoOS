import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const oku = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/*
  ÜRÜNLER VE FİYATLAR EKRANLARININ YAPISAL SÖZLEŞMELERİ (27.11.2026).

  Bu dosyadaki kurallar ölçümle değil KODLA sabitleniyor: hepsi bir kez
  kırıldığında ekranda sessiz kalan, yani gözle fark edilmeyen sınıftan.
*/

test("ürün detayının okumaları ürün kapsamında", () => {
  /*
    Bir ürünün sayfası başka ürünün kaydını göstermemeli (brief §7,
    kayıt kapsamı). Üç okuma da kaynağında ürüne bağlanıyor; kapsamı
    bellekte süzmek, sorgu tavanına çarpıldığı gün sessizce eksilen bir
    liste demekti.
  */
  const sayfa = oku("app/panel/platform/urunler/[urun]/page.tsx");
  /* Ürün lisansları, bireysel aboneler ve dönem ödemeleri. */
  assert.match(sayfa, /organization_product_licenses[\s\S]{0,200}\.eq\("product", urun\)/);
  assert.match(sayfa, /product_subscribers[\s\S]{0,260}\.eq\("product", urun\)/);
  assert.match(sayfa, /organization_payment_requests[\s\S]{0,240}\.eq\("product", urun\)/);
  /* Abone ödemeleri kaynağında ürüne bağlı değil: bu ürünün
     abonelerine eşleşenler alınıyor, hepsi değil. */
  assert.match(sayfa, /aboneAdlari\.has\(o\.subscriber_id\)/);
});

test("telefonda abonelik satırı dört temel alanı taşıyor", () => {
  /*
    26.11.2026'da ölçülen hata: 390 px'te abonelik tablosu 680 px'e
    zorlanıyor ve dokuz hücre ekran dışında kalıyordu. Çözüm MobilSatir
    kalıbı; satır abone, paket, dönem ve ücreti BİRLİKTE taşımalı,
    yoksa telefonda kayıt yarım okunur.
  */
  const sayfa = oku("app/panel/platform/urunler/[urun]/page.tsx");
  const abonelik = sayfa.slice(sayfa.indexOf("<h2>Abonelikler</h2>"), sayfa.indexOf("<h2>Tahsilat</h2>"));
  assert.ok(abonelik.includes("<MobilSatir"), "abonelik satırında MobilSatir yok");
  /* Abone adı başlıkta; paket, dönem ve ücret alt satırda. */
  assert.match(abonelik, /<MobilSatir[\s\S]{0,400}baslik=\{ad\}/);
  assert.match(abonelik, /aboneliği`,[\s\S]{0,200}deneme bitişi/);
  assert.match(abonelik, /Ücret kayıtta yok/);
});

test("ürünler listesi sayıları Ana Sayfa ile aynı çekirdekten", () => {
  /*
    İki ekranda iki farklı "aktif müşteri" sayısı çıkmasın: ikisi de
    lib/konsol/urun-performansi çağırıyor. Liste kendi süzgecini
    kurmaya başladığı gün sayılar sessizce ayrışır.
  */
  const liste = oku("app/panel/platform/urunler/page.tsx");
  assert.match(liste, /urunPerformansi\(\{/);
  assert.match(liste, /from "@\/lib\/konsol\/urun-performansi"/);
  /* Dönem adreste: Tahsilat sütununun kapsamı paylaşılabilir. */
  assert.match(liste, /donemiCoz\(donemKodu\(donem\)\)/);
});

test("ürün adresi ile 'Aç' farklı erişilebilir adlar taşıyor", () => {
  /*
    İki bağlantı iki ayrı iş yapıyor: biri ürünü yeni sekmede açıyor,
    öteki konsoldaki detayı. Erişilebilir adları aynı olsaydı klavyeyle
    gezen kullanıcı hangisinin hangisi olduğunu bilemezdi (brief §3).
  */
  const bilesen = oku("app/panel/platform/urunler/urun-listesi.tsx");
  assert.match(bilesen, /ürününü yeni sekmede aç/);
  assert.match(bilesen, /ürün detayını aç/);
  assert.match(bilesen, /target="_blank" rel="noreferrer"/);
});

test("Fiyatlar varsayılanı karşılaştırma, eski ürün bağlantıları duruyor", () => {
  /*
    Sol menüdeki "Fiyatlar" dört ürünü yan yana açıyor (brief §4);
    ?urun=<kod> ile eski düzenleme ekranı aynı yerde kalıyor —
    paylaşılmış bağlantılar kırılmasın.
  */
  const sayfa = oku("app/panel/platform/fiyatlar/page.tsx");
  assert.match(sayfa, /const seciliUrun = \(LISTE_URUNLERI as readonly string\[\]\)\.includes\(urun \?\? ""\) \? urun! : "tumu"/);
  assert.match(sayfa, /const karsilastirma = seciliUrun === "tumu"/);
  /* Süzgeçler adreste ve birbirini koruyor. */
  assert.match(sayfa, /const suzgecAdresi = \(alan: "urun" \| "fatura" \| "durum"/);
});

test("ürün detayı tek sütun: kart kabuğu ve sağ sütun kalktı", () => {
  /*
    27.11.2026, onaylı mockup. Sayfa kayıt kalıbındaydı (sekmeli KART +
    sağ sütun); mockup tek sütun istiyor. Şeridin taşıdığı bilgi
    kaybolmadı, bölüm başlıklarına geçti.
  */
  const sayfa = oku("app/panel/platform/urunler/[urun]/page.tsx");
  assert.match(sayfa, /<main className="plt urun-detay-sayfa">/);
  assert.doesNotMatch(sayfa, /className="liste-sag"/);
  assert.doesNotMatch(sayfa, /kayit-serit talep-serit/);
  /* Yol içerikte: ürün listesine dönüş buradan. */
  assert.match(sayfa, /className="urd-yol"[\s\S]{0,200}\/panel\/platform\/urunler/);
  /* Sekme bileşeni DEĞİŞMEDİ, yalnızca görünümü: adresli sekmeler duruyor. */
  assert.match(sayfa, /<TalepAkis kimlik="urun-kart" sinif="urd-serit"[\s\S]{0,160}adresler=\{bolumAdresleri\}/);
});

test("ölçüm düzeneği 'işlem bekleyenler' satırlarını kuraldan üretiyor", () => {
  /*
    26.11.2026'da otomasyon kartında yaşandı: düzenekteki fixture elle
    yazılmıştı, kural değişti, fixture eski kaldı ve ekran üretimin
    ÜRETEMEYECEĞİ bir satır çizdi. Aynı hata ürün detayında
    tekrarlanmasın: düzenek gerçek kuralı çağırıyor, fixture yalnızca
    girdi veriyor.
  */
  const duzenek = oku("scripts/genel-bakis-yerlesim-tarayici.mjs");
  assert.match(duzenek, /bekleyenler=\{urunBekleyenleri\(\{/);
  assert.match(duzenek, /import \{ urunBekleyenleri \} from/);
  /* Elle yazılmış başlık kalmadı. */
  assert.doesNotMatch(duzenek, /baslik: "Yanıt bekleyen talepler"/);
});
