import type { createAdminClient } from "@/lib/supabase/admin";

/*
  ArvoLab'ın "Faturalar ve ödemeler" bölümüne giden veri (26.10.2026).

  Bireysel abonenin ve kurumun ArvoLab'daki ödeme geçmişi, Arvo'nun
  kestiği faturalar (platform_faturalari, elle yüklenen PDF) ve havale
  dekontları. Müşterinin ArvoOS paneli olmayabiliyor (bireysel abone) ya
  da kurum yöneticisi ArvoLab'da çalışıyor; liste köprüyle oraya gidiyor
  (app/api/bridge/subscription, "billing" / "org_billing").

  Dosyalar özel depolarda; bağlantı kısa süreli imzalı adres. Adres
  ArvoLab'da yalnızca istek anında gösteriliyor, saklanmıyor.

  SINIR: liste son 50 ödeme. Toplam ödenen ise bütün onaylı ödemelerden
  ayrı sorguyla (sınırlı listeden toplam çıkarmak, sınıra ulaşan
  müşteriye eksik toplam göstermek olurdu).
*/

import { kalemleriCoz, type ProformaAlici, type ProformaKalemi } from "@/lib/proforma";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const LISTE = 50;
const IMZA_SURESI = 600;

export type KopruFatura = { no: string; tarih: string; url: string | null };

export type KopruOdeme = {
  id: string;
  tarih: string | null;
  /** Kuruş. */
  tutar: number;
  paraBirimi: string;
  tur: "abonelik" | "kredi";
  durum: "odendi" | "bekliyor" | "reddedildi";
  kanal: "kart" | "havale";
  donemBaslangic: string | null;
  donemBitis: string | null;
  referans: string | null;
  dekontUrl: string | null;
  fatura: KopruFatura | null;
};

/*
  PROFORMA (27.10.2026): ödemeden ÖNCE müşteriye giden belge
  (platform_proformalari). ArvoLab onu yazdırılabilir sayfada gösteriyor;
  belge Arvo'nun unvanını ve banka hesaplarını taşıdığı için onlar da
  burada gidiyor — ArvoLab'ın Arvo'nun hesaplarını bilmesi gerekmesin,
  hesap değişince eski kopya kalmasın.
*/
export type KopruProforma = {
  id: string;
  no: string;
  musteriAdi: string;
  /* Belgedeki alıcı bloğu (28.10.2026). 20261028155350'den önceki
     proformalarda yok; ArvoLab o zaman musteriAdi'yi yazar. */
  alici: ProformaAlici | null;
  kalemler: ProformaKalemi[];
  araToplam: number;
  kdvOrani: number;
  kdv: number;
  toplam: number;
  paraBirimi: string;
  duzenlemeTarihi: string;
  gecerlilikTarihi: string;
  notlar: string | null;
  durum: "bekliyor" | "odendi" | "iptal";
  /** Eşlenen ödemenin kimliği: ArvoLab makbuzda proforma numarasını bununla yazar. */
  odemeId: string | null;
};

export type KopruSatici = {
  unvan: string;
  adres: string | null;
  vergiDairesi: string | null;
  vergiNo: string | null;
  mersisNo: string | null;
  hesaplar: { banka: string; hesapSahibi: string | null; iban: string; paraBirimi: string }[];
};

export type KopruFaturalama = {
  odemeler: KopruOdeme[];
  toplamOdenen: number;
  bekleyenTutar: number;
  proformalar: KopruProforma[];
  satici: KopruSatici | null;
};

/* Abone kaydı olmayan kullanıcının boş faturalaması (köprü bunu döndürüyor). */
export const BOS_FATURALAMA: KopruFaturalama = { odemeler: [], toplamOdenen: 0, bekleyenTutar: 0, proformalar: [], satici: null };

type ProformaSatiri = {
  id: string; proforma_no: string; musteri_adi: string; alici: ProformaAlici | null; kalemler: unknown; ara_toplam: number; kdv_orani: number;
  kdv: number; toplam: number; para_birimi: string; duzenleme_tarihi: string; gecerlilik_tarihi: string;
  notlar: string | null; durum: string; payment_request_id: string | null; subscriber_payment_id: string | null;
};

/* İptal edilenler gösterilmiyor: müşteriye "ödeme bekleniyor" gibi okunmasın, kafası karışmasın. */
export async function proformalar(admin: Admin, alan: "organization_id" | "subscriber_id", id: string, product?: string): Promise<KopruProforma[]> {
  let sorgu = admin
    .from("platform_proformalari")
    .select("id,proforma_no,musteri_adi,alici,kalemler,ara_toplam,kdv_orani,kdv,toplam,para_birimi,duzenleme_tarihi,gecerlilik_tarihi,notlar,durum,payment_request_id,subscriber_payment_id")
    .eq(alan, id)
    .neq("durum", "iptal");
  if (product) sorgu = sorgu.eq("product", product);
  const { data, error } = await sorgu.order("created_at", { ascending: false }).limit(LISTE);
  if (error) throw new Error("Proformalar okunamadı: " + error.message);
  return ((data ?? []) as ProformaSatiri[]).map((p) => ({
    id: p.id,
    no: p.proforma_no,
    musteriAdi: p.musteri_adi,
    alici: p.alici && typeof p.alici === "object" ? p.alici : null,
    kalemler: kalemleriCoz(p.kalemler),
    araToplam: Number(p.ara_toplam),
    kdvOrani: Number(p.kdv_orani),
    kdv: Number(p.kdv),
    toplam: Number(p.toplam),
    paraBirimi: p.para_birimi || "TRY",
    duzenlemeTarihi: p.duzenleme_tarihi,
    gecerlilikTarihi: p.gecerlilik_tarihi,
    notlar: p.notlar,
    durum: p.durum === "odendi" ? "odendi" : "bekliyor",
    odemeId: p.payment_request_id ?? p.subscriber_payment_id,
  }));
}

/*
  Satıcı bilgisi: Arvo kurumunun (slug arvo-os) yasal bilgileri ve
  platform banka hesapları. Yalnızca proforma varsa okunuyor.
*/
export async function satici(admin: Admin): Promise<KopruSatici> {
  const [{ data: kurum, error: kurumHatasi }, { data: hesaplar, error: hesapHatasi }] = await Promise.all([
    admin.from("organizations").select("name,legal_name,legal_address,legal_district,legal_city,tax_office,tax_number,mersis_no").eq("slug", "arvo-os").maybeSingle(),
    admin.from("platform_bank_accounts").select("bank_name,account_holder,iban,currency").eq("is_active", true).order("sort_order"),
  ]);
  if (kurumHatasi) throw new Error("Satıcı bilgisi okunamadı: " + kurumHatasi.message);
  if (hesapHatasi) throw new Error("Banka hesapları okunamadı: " + hesapHatasi.message);
  const adres = [kurum?.legal_address, [kurum?.legal_district, kurum?.legal_city].filter(Boolean).join(" / ")].filter(Boolean).join(", ");
  return {
    unvan: kurum?.legal_name || kurum?.name || "Arvo",
    adres: adres || null,
    vergiDairesi: kurum?.tax_office ?? null,
    vergiNo: kurum?.tax_number ?? null,
    mersisNo: kurum?.mersis_no ?? null,
    hesaplar: ((hesaplar ?? []) as { bank_name: string; account_holder: string | null; iban: string; currency: string }[])
      .map((h) => ({ banka: h.bank_name, hesapSahibi: h.account_holder, iban: h.iban, paraBirimi: h.currency })),
  };
}

async function imzala(admin: Admin, kova: string, yollar: string[]): Promise<Map<string, string>> {
  const harita = new Map<string, string>();
  if (!yollar.length) return harita;
  const { data, error } = await admin.storage.from(kova).createSignedUrls(yollar, IMZA_SURESI);
  if (error) {
    console.error("[faturalama] imzalı bağlantı üretilemedi", kova, error.message);
    return harita;
  }
  for (const satir of data ?? []) if (satir.path && satir.signedUrl) harita.set(satir.path, satir.signedUrl);
  return harita;
}

type FaturaSatiri = {
  fatura_no: string;
  fatura_tarihi: string;
  dosya_yolu: string;
  subscriber_payment_id: string | null;
  payment_request_id: string | null;
};

async function faturalar(admin: Admin, alan: "subscriber_payment_id" | "payment_request_id", idler: string[]) {
  if (!idler.length) return new Map<string, KopruFatura>();
  const { data, error } = await admin
    .from("platform_faturalari")
    .select("fatura_no,fatura_tarihi,dosya_yolu,subscriber_payment_id,payment_request_id")
    .in(alan, idler);
  if (error) throw new Error("Faturalar okunamadı: " + error.message);
  const satirlar = (data ?? []) as FaturaSatiri[];
  const urller = await imzala(admin, "platform-faturalari", satirlar.map((s) => s.dosya_yolu));
  return new Map(
    satirlar.map((s) => [
      (alan === "subscriber_payment_id" ? s.subscriber_payment_id : s.payment_request_id) as string,
      { no: s.fatura_no, tarih: s.fatura_tarihi, url: urller.get(s.dosya_yolu) ?? null },
    ]),
  );
}

/** Bireysel abonenin ödemeleri (kart; abonelik ve AI kredisi). */
export async function aboneFaturalamasi(admin: Admin, subscriberId: string): Promise<KopruFaturalama> {
  const [{ data, error }, { data: tutarlar, error: toplamHatasi }] = await Promise.all([
    admin
      .from("subscriber_payments")
      .select("id,amount,currency,paid_at,period_start,period_end,merchant_oid")
      .eq("subscriber_id", subscriberId)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(LISTE),
    // tuzak-tamam: toplam SINIRSIZ ayrı sorgudan; liste ise son 50.
    admin.from("subscriber_payments").select("amount").eq("subscriber_id", subscriberId),
  ]);
  if (error) throw new Error("Ödemeler okunamadı: " + error.message);
  if (toplamHatasi) throw new Error("Ödeme toplamı okunamadı: " + toplamHatasi.message);

  const satirlar = (data ?? []) as {
    id: string; amount: number; currency: string; paid_at: string | null;
    period_start: string | null; period_end: string | null; merchant_oid: string | null;
  }[];
  const [fatura, proformaListesi] = await Promise.all([
    faturalar(admin, "subscriber_payment_id", satirlar.map((s) => s.id)),
    proformalar(admin, "subscriber_id", subscriberId),
  ]);

  return {
    odemeler: satirlar.map((s) => ({
      id: s.id,
      tarih: s.paid_at,
      tutar: Number(s.amount),
      paraBirimi: s.currency || "TRY",
      // Dönemsiz ödeme kredi satışı (20261026183021): abonelik dönemini uzatmaz.
      tur: s.period_start ? "abonelik" : "kredi",
      durum: "odendi",
      kanal: "kart",
      donemBaslangic: s.period_start,
      donemBitis: s.period_end,
      referans: s.merchant_oid,
      dekontUrl: null,
      fatura: fatura.get(s.id) ?? null,
    })),
    // tuzak-tamam: sınırsız sorgunun toplamı.
    toplamOdenen: ((tutarlar ?? []) as { amount: number }[]).reduce((t, s) => t + Number(s.amount), 0),
    bekleyenTutar: 0,
    proformalar: proformaListesi,
    satici: proformaListesi.length ? await satici(admin) : null,
  };
}

/** Kurumun bir üründeki ödemeleri (kart ve havale; onaylı, bekleyen, reddedilen). */
export async function kurumFaturalamasi(admin: Admin, organizationId: string, product: string): Promise<KopruFaturalama> {
  const [{ data, error }, { data: tutarlar, error: toplamHatasi }] = await Promise.all([
    admin
      .from("organization_payment_requests")
      .select("id,amount,currency,status,payment_method,receipt_path,reference_no,review_note,created_at,reviewed_at")
      .eq("organization_id", organizationId)
      .eq("product", product)
      .order("created_at", { ascending: false })
      .limit(LISTE),
    // tuzak-tamam: toplamlar SINIRSIZ ayrı sorgudan; liste ise son 50.
    admin.from("organization_payment_requests").select("amount,status").eq("organization_id", organizationId).eq("product", product),
  ]);
  if (error) throw new Error("Ödemeler okunamadı: " + error.message);
  if (toplamHatasi) throw new Error("Ödeme toplamı okunamadı: " + toplamHatasi.message);

  const satirlar = (data ?? []) as {
    id: string; amount: number; currency: string; status: string; payment_method: string | null;
    receipt_path: string | null; reference_no: string | null; review_note: string | null;
    created_at: string; reviewed_at: string | null;
  }[];
  const [fatura, dekontlar, proformaListesi] = await Promise.all([
    faturalar(admin, "payment_request_id", satirlar.filter((s) => s.status === "approved").map((s) => s.id)),
    imzala(admin, "payment-receipts", satirlar.flatMap((s) => (s.receipt_path ? [s.receipt_path] : []))),
    proformalar(admin, "organization_id", organizationId, product),
  ]);
  const hepsi = (tutarlar ?? []) as { amount: number; status: string }[];

  return {
    odemeler: satirlar.map((s) => ({
      id: s.id,
      tarih: s.reviewed_at ?? s.created_at,
      tutar: Number(s.amount),
      paraBirimi: s.currency || "TRY",
      // Kredi satışının kaydı kendini notunda söylüyor (arvo_record_paytr_payment).
      tur: /AI kredisi/i.test(s.review_note ?? "") ? "kredi" : "abonelik",
      durum: s.status === "approved" ? "odendi" : s.status === "pending" ? "bekliyor" : "reddedildi",
      kanal: s.payment_method === "paytr" ? "kart" : "havale",
      donemBaslangic: null,
      donemBitis: null,
      referans: s.reference_no,
      dekontUrl: s.receipt_path ? dekontlar.get(s.receipt_path) ?? null : null,
      fatura: fatura.get(s.id) ?? null,
    })),
    // tuzak-tamam: sınırsız sorgunun toplamları (hepsi = sınırsız sorgu).
    toplamOdenen: hepsi.filter((s) => s.status === "approved").reduce((t, s) => t + Number(s.amount), 0),
    // tuzak-tamam: sınırsız sorgunun toplamı (hepsi = sınırsız sorgu).
    bekleyenTutar: hepsi.filter((s) => s.status === "pending").reduce((t, s) => t + Number(s.amount), 0),
    proformalar: proformaListesi,
    satici: proformaListesi.length ? await satici(admin) : null,
  };
}

/*
  KURUMUN ArvoOS PANELİNDEKİ BELGELERİ (28.10.2026).

  Proforma ve fatura bugüne kadar YALNIZCA ArvoLab'da gösteriliyordu;
  ArvoOS ya da ArvoCal lisansı için kesilen bir belgeyi kurumun görebileceği
  hiçbir yer yoktu ("kurumlara fatura kesilemiyor"). Kurumun Ödeme ve
  Lisans ekranı bütün ürünlerin belgelerini burada okuyor; ArvoLab
  belgesi ArvoLab'da da görünmeye devam ediyor.
*/
export type KurumProformasi = KopruProforma & { urun: string };
export type KurumFaturasi = KopruFatura & { urun: string; tutar: number; paraBirimi: string };

export async function kurumBelgeleri(admin: Admin, organizationId: string): Promise<{ proformalar: KurumProformasi[]; faturalar: KurumFaturasi[] }> {
  const [{ data: urunler, error: urunHatasi }, { data: odemeler, error: odemeHatasi }] = await Promise.all([
    admin.from("platform_proformalari").select("id,product").eq("organization_id", organizationId).neq("durum", "iptal")
      .order("created_at", { ascending: false }).limit(LISTE),
    admin.from("organization_payment_requests").select("id,product,amount,currency").eq("organization_id", organizationId)
      .eq("status", "approved").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(LISTE),
  ]);
  if (urunHatasi) throw new Error("Proformalar okunamadı: " + urunHatasi.message);
  if (odemeHatasi) throw new Error("Ödemeler okunamadı: " + odemeHatasi.message);
  const urunu = new Map(((urunler ?? []) as { id: string; product: string }[]).map((p) => [p.id, p.product]));
  const odemeSatirlari = (odemeler ?? []) as { id: string; product: string | null; amount: number; currency: string | null }[];
  const [liste, fatura] = await Promise.all([
    urunu.size ? proformalar(admin, "organization_id", organizationId) : Promise.resolve([] as KopruProforma[]),
    faturalar(admin, "payment_request_id", odemeSatirlari.map((o) => o.id)),
  ]);
  return {
    proformalar: liste.map((p) => ({ ...p, urun: urunu.get(p.id) ?? "arvoos" })),
    faturalar: odemeSatirlari.flatMap((o) => {
      const f = fatura.get(o.id);
      return f ? [{ ...f, urun: o.product ?? "arvoos", tutar: Number(o.amount), paraBirimi: o.currency || "TRY" }] : [];
    }),
  };
}
