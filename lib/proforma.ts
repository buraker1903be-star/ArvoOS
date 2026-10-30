import { PRODUCTS, type ProductCode } from "@/lib/products";
/*
  PLATFORM PROFORMASI: kalemler, KDV ve ödeme eşleştirme (27.10.2026).

  Akış: proforma → müşteri öder → tahsilat makbuzu → fatura. Proformayı
  kurucu Tahsilat ekranında hazırlıyor; tablo platform_proformalari
  (migration 20261027174258).

  Tutarlar KURUŞ ve KDV HARİÇ yazılıyor; KDV ayrı satır. Toplamı formdan
  almıyoruz, kalemlerden burada hesaplıyoruz: veritabanı yalnızca
  `toplam = ara_toplam + kdv` tutarlılığını denetleyebiliyor, kalemlerle
  ara toplamın uyumunu bu modül sağlıyor.

  Saf modül: Next'e ve Supabase'e dokunmuyor, birim testi
  tests/unit/proforma.test.ts.
*/

export type ProformaKalemi = { aciklama: string; miktar: number; birim_fiyat: number };

export type ProformaToplami = { araToplam: number; kdv: number; toplam: number };

export const AZAMI_KALEM = 20;

/* Proforma kesilebilen ürünler; veritabanı kısıtıyla (platform_proformalari_product_check,
   son tanımı 20261030062700) AYNI küme — tests/unit/proforma-urunleri.test.ts
   ikisini karşılaştırıyor. Kurum ArvoOS, ArvoCal ve ArvoARC proformasını
   ArvoOS panelinde, ArvoLab proformasını ArvoLab'da görür. */
/*
  PROFORMA KESİLEBİLEN ÜRÜNLER = BÜTÜN ÜRÜNLER (lib/products).

  Liste elle yazılıydı ve ArvoARC'ı atlıyordu: ürün dört, proforma üç
  biliyordu. Sonucu, ArvoARC lisansı olan müşteriye ne elle ne otomatik
  proforma kesilebilmesiydi — form seçeneği hiç göstermiyor, sunucu da
  reddediyordu (30.10.2026, kurum sahibinin kararıyla düzeltildi).
*/
export const PROFORMA_URUNLERI: readonly ProductCode[] = PRODUCTS.map((urun) => urun.code);
export const VARSAYILAN_KDV_ORANI = 20;

/** Satır tutarı: miktar × birim fiyat, kuruşa yuvarlanmış. */
export function kalemTutari(k: ProformaKalemi) {
  return Math.round(k.miktar * k.birim_fiyat);
}

/*
  KDV ara toplamın üzerinden BİR KEZ hesaplanıp yuvarlanır, satır satır
  değil: satır başına yuvarlamak çok kalemli proformada toplamı birkaç
  kuruş saptırıyor ve kesilecek faturayla tutmuyordu (faturada KDV
  matrahın tamamı üzerinden).
*/
export function proformaToplami(kalemler: ProformaKalemi[], kdvOrani: number): ProformaToplami {
  const araToplam = kalemler.reduce((t, k) => t + kalemTutari(k), 0);
  const kdv = Math.round((araToplam * kdvOrani) / 100);
  return { araToplam, kdv, toplam: araToplam + kdv };
}

/*
  Formdan gelen satırları okur. Form sabit sayıda satır gönderiyor;
  tamamen boş satır atlanır (kullanıcı kullanmadığı satırı doldurmak
  zorunda kalmasın), yarım satır ise hata: açıklaması olup tutarı
  olmayan bir kalemi sessizce düşürmek müşteriye eksik proforma
  göndermek olurdu.

  Tutar `kurus` ile okunur (çağıran kurusOku'yu verir) — "1.500" bin beş
  yüz liradır, bir buçuk değil.
*/
/*
  Formun gönderebileceği en çok kalem (29.10.2026). Form üç sabit satırdı
  ve sunucu da yalnızca 0-2'yi okuyordu; dördüncü bir hizmeti yazmanın
  yolu yoktu. Artık satır eklenebiliyor; sınır hem formda hem sunucuda
  bu sabitten — biri artıp öteki kalırsa fazla kalem sessizce düşerdi.
*/
export const PROFORMA_KALEM_SINIRI = 10;

export function kalemleriOku(
  satirlar: { aciklama: string; miktar: string; birimFiyat: string }[],
  kurus: (deger: string) => number,
): ProformaKalemi[] {
  const kalemler: ProformaKalemi[] = [];
  satirlar.forEach((s, i) => {
    const aciklama = s.aciklama.trim();
    const miktarMetni = s.miktar.trim();
    const fiyatMetni = s.birimFiyat.trim();
    if (!aciklama && !fiyatMetni) return;
    const sira = i + 1;
    if (!aciklama) throw new Error(`${sira}. kalemin açıklamasını yazın.`);
    if (aciklama.length > 200) throw new Error(`${sira}. kalemin açıklaması 200 karakteri aşıyor.`);
    const miktar = miktarMetni ? Number(miktarMetni.replace(",", ".")) : 1;
    if (!Number.isFinite(miktar) || miktar <= 0 || miktar > 10000) throw new Error(`${sira}. kalemin miktarı geçersiz.`);
    const birim_fiyat = kurus(fiyatMetni);
    if (!Number.isFinite(birim_fiyat) || birim_fiyat <= 0) throw new Error(`${sira}. kalemin birim fiyatını yazın.`);
    kalemler.push({ aciklama, miktar, birim_fiyat });
  });
  if (!kalemler.length) throw new Error("En az bir kalem yazın.");
  if (kalemler.length > AZAMI_KALEM) throw new Error(`En fazla ${AZAMI_KALEM} kalem yazılabilir.`);
  return kalemler;
}

/** Veritabanından gelen jsonb'yi tipe çevirir; bozuk satırı atlar (gösterimde çökmesin). */
export function kalemleriCoz(ham: unknown): ProformaKalemi[] {
  if (!Array.isArray(ham)) return [];
  return ham.flatMap((k) => {
    if (!k || typeof k !== "object") return [];
    const { aciklama, miktar, birim_fiyat } = k as Record<string, unknown>;
    if (typeof aciklama !== "string" || typeof miktar !== "number" || typeof birim_fiyat !== "number") return [];
    return [{ aciklama, miktar, birim_fiyat }];
  });
}

export type EslesmeOdemesi = { id: string; tutar: number; tarih: string | null };

/*
  "Ödemeyle eşleştir" penceresindeki seçenekler. Çağıran yalnızca AYNI
  MÜŞTERİNİN ve henüz bir proformaya bağlanmamış ödemelerini veriyor;
  burada sıralanıyor: tutarı proforma toplamına eşit olanlar önce, sonra
  yeniden eskiye. Tutarı tutmayanlar da listede kalıyor — müşteri
  havalede küsuratı yuvarlamış olabilir, karar kurucunun.
*/
export function eslesmeSirasi<T extends EslesmeOdemesi>(toplam: number, odemeler: T[]): (T & { tutarTutuyor: boolean })[] {
  return odemeler
    .map((o) => ({ ...o, tutarTutuyor: o.tutar === toplam }))
    .sort((a, b) => Number(b.tutarTutuyor) - Number(a.tutarTutuyor) || (b.tarih ?? "").localeCompare(a.tarih ?? ""));
}

/*
  Geçerlilik tarihi geçmiş ve ödenmemiş proforma "süresi doldu" görünür.
  Durum sütununa yazılmıyor: tarih geçti diye kayıt değişmesin, geç gelen
  ödeme yine eşlenebilsin. Karşılaştırma Türkiye günüyle (YYYY-MM-DD).
*/
export function proformaGorunumu(durum: string, gecerlilik: string, bugun: string): "bekliyor" | "odendi" | "iptal" | "suresi_doldu" {
  if (durum === "odendi" || durum === "iptal") return durum;
  return gecerlilik < bugun ? "suresi_doldu" : "bekliyor";
}

export const PROFORMA_DURUM_ADI = {
  bekliyor: "Ödeme bekleniyor",
  odendi: "Ödendi",
  iptal: "İptal edildi",
  suresi_doldu: "Süresi doldu",
} as const;

/*
  ALICI BİLGİSİ (28.10.2026). Proforma eskiden yalnızca tek satırlık
  "müşteri adı" taşıyordu ve bireysel abonede bu çoğu zaman e-posta
  adresiydi: belgede "Sayın ali@…" yazıyordu. Kurum sahibi belgede ad
  soyad ve kurum unvanının da olmasını istedi. Bilgi proformaya KOPYA
  olarak yazılıyor, kuruma ya da aboneye bağlanmıyor: kurum sonradan
  unvanını değiştirse de düzenlenmiş belge düzenlendiği gibi kalmalı.
*/
export type ProformaAlici = {
  adSoyad: string | null;
  unvan: string | null;
  vergiDairesi: string | null;
  /** VKN (10 hane) ya da TCKN (11 hane). */
  vergiNo: string | null;
  adres: string | null;
  eposta: string | null;
};

const ALAN_SINIRI = { adSoyad: 120, unvan: 200, vergiDairesi: 80, vergiNo: 11, adres: 400, eposta: 200 } as const;

/*
  Formdan alıcıyı okur. Kurum proformasında unvan, bireysel abonede ad
  soyad zorunlu: belgede muhatabı olmayan bir proforma müşteriye
  gönderilemez. Vergi numarası yazıldıysa 10 (VKN) ya da 11 (TCKN) hane
  olmalı — yanlış haneli bir numara faturaya da yanlış geçerdi.
*/
export function aliciOku(ham: Record<keyof ProformaAlici, string>, tur: "kurum" | "abone"): ProformaAlici {
  const alici = {} as ProformaAlici;
  for (const alan of Object.keys(ALAN_SINIRI) as (keyof ProformaAlici)[]) {
    const deger = (ham[alan] ?? "").replace(/\s+/g, " ").trim();
    if (deger.length > ALAN_SINIRI[alan] && alan !== "vergiNo") throw new Error(`Alıcı bilgisi çok uzun (${alan}).`);
    alici[alan] = deger || null;
  }
  if (alici.vergiNo) {
    const rakam = alici.vergiNo.replace(/\D/g, "");
    if (rakam.length !== 10 && rakam.length !== 11) throw new Error("Vergi numarası 10 haneli VKN ya da 11 haneli TCKN olmalı.");
    alici.vergiNo = rakam;
  }
  if (alici.eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alici.eposta)) throw new Error("Alıcının e-posta adresi geçersiz.");
  if (tur === "kurum" && !alici.unvan) throw new Error("Kurum proformasında ticari unvanı yazın.");
  if (tur === "abone" && !alici.adSoyad) throw new Error("Bireysel proformada alıcının adını soyadını yazın.");
  return alici;
}

/** Belgenin tek satırlık muhatabı: unvan, yoksa ad soyad, yoksa e-posta. */
export const aliciAdi = (a: ProformaAlici): string => a.unvan || a.adSoyad || a.eposta || "";

/** Vergi numarasının türü: 10 hane VKN, 11 hane TCKN. */
export const vergiNoTuru = (no: string): "VKN" | "TCKN" | "Vergi No" =>
  no.length === 10 ? "VKN" : no.length === 11 ? "TCKN" : "Vergi No";

/*
  KDV DAHİL TUTARDAN PROFORMA (28.10.2026). Liste fiyatları KDV dahile
  geçti; form ise yalnızca KDV hariç birim fiyat kabul ediyordu ve 4.990
  TL'lik abonelik için kurucunun 4.158,33 yazması gerekiyordu. Elle
  bölmek bazı tutarlarda toplamı bir kuruş saptırıyor — müşteri 4.990
  öderken proforma 4.989,99 diyor, havale eşleşmiyor.

  Kural: TOPLAM yazılan brüt tutara BİREBİR eşittir. Her satırın brütü
  KDV hariç tutara ayrıştırılır (kalemler KDV hariç saklanıyor, ArvoLab
  kalemlerin toplamını ara toplamla karşılaştırıyor), KDV ise brüt
  toplamdan ara toplam çıkarılarak bulunur. Yuvarlama farkı KDV satırına
  düşer, toplama değil.
*/
export function kdvDahilProforma(brutKalemler: ProformaKalemi[], kdvOrani: number): { kalemler: ProformaKalemi[] } & ProformaToplami {
  const kalemler = brutKalemler.map((k) => ({ ...k, birim_fiyat: Math.round((k.birim_fiyat * 100) / (100 + kdvOrani)) }));
  const araToplam = kalemler.reduce((t, k) => t + kalemTutari(k), 0);
  const toplam = brutKalemler.reduce((t, k) => t + kalemTutari(k), 0);
  return { kalemler, araToplam, kdv: toplam - araToplam, toplam };
}
