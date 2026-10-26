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

export type KopruFaturalama = { odemeler: KopruOdeme[]; toplamOdenen: number; bekleyenTutar: number };

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
  const fatura = await faturalar(admin, "subscriber_payment_id", satirlar.map((s) => s.id));

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
  const [fatura, dekontlar] = await Promise.all([
    faturalar(admin, "payment_request_id", satirlar.filter((s) => s.status === "approved").map((s) => s.id)),
    imzala(admin, "payment-receipts", satirlar.flatMap((s) => (s.receipt_path ? [s.receipt_path] : []))),
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
  };
}
