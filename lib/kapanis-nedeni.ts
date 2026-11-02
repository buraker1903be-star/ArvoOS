/*
  KAYIP NEDENİ (02.11.2026).

  Aylık rapor kaybedilen müşterileri sayıyordu (kapanış anı 02.11.2026'dan
  beri tutuluyor) ama NEDEN gittikleri hiçbir yerde yoktu: fiyat mı,
  kullanmamak mı, rakip mi — kurucunun aklında kalan kadar. Kayıp nedeni
  lisans kapatılırken (çekirdekte "İptal", ek üründe "İptal"/"Kapalı")
  seçiliyor, lisans satırında duruyor (kapanis_nedeni, kapanis_notu) ve
  lisans yeniden açılınca kapanış anıyla birlikte siliniyor
  (private.lisans_kapanis_tarihi).

  Liste SABİT ve kısa: serbest metin raporda toplanamaz; ayrıntı nota.
  Veritabanı kısıtı aynı listeyi tutuyor (migration 20261102205003);
  birim testi ikisini karşılaştırıyor. Saf modül.
*/
export const KAPANIS_NEDENLERI = [
  { kod: "fiyat", ad: "Fiyat yüksek bulundu" },
  { kod: "kullanmiyor", ad: "Kullanmıyor / ihtiyacı kalmadı" },
  { kod: "rakip", ad: "Başka bir ürüne geçti" },
  { kod: "eksik_ozellik", ad: "Aradığı özellik yok" },
  { kod: "odeme", ad: "Ödeme yapmadı" },
  { kod: "is_kapandi", ad: "İşini kapattı" },
  { kod: "diger", ad: "Diğer" },
] as const;

export type KapanisNedeni = (typeof KAPANIS_NEDENLERI)[number]["kod"];

const GECERLI = new Set<string>(KAPANIS_NEDENLERI.map((n) => n.kod));
/** Kayıp sayılan durumlar: askı (dondurma) geçici, kayıp değil. */
const KAYIP_DURUMLARI = new Set(["canceled", "inactive"]);
const ACIK_DURUMLAR = new Set(["active", "trialing", "past_due"]);

export const kapanisNedeniAdi = (kod: string | null | undefined) =>
  KAPANIS_NEDENLERI.find((n) => n.kod === kod)?.ad ?? "Belirtilmemiş";

/**
 * Formdan okunan neden. Lisans AÇIK bir durumdan kayıp durumuna geçiyorsa
 * neden zorunlu; açık kalıyorsa ya da açılıyorsa ikisi de boş yazılır.
 * Kapalıdan kapalıya (askıda → iptal) neden istenir ama eskisi verilebilir.
 */
export function kapanisNedeniOku(girdi: { yeniDurum: string; eskiDurum: string | null; neden: string; not: string }):
  { neden: KapanisNedeni | null; not: string | null } {
  if (!KAYIP_DURUMLARI.has(girdi.yeniDurum)) return { neden: null, not: null };
  const neden = girdi.neden.trim();
  const not = girdi.not.trim().slice(0, 500) || null;
  if (neden && !GECERLI.has(neden)) throw new Error("Geçerli bir kayıp nedeni seçin.");
  /* Hiç açılmamış bir ek ürünün "Kapalı" kalması kayıp değil: neden istenmez. */
  const kayip = girdi.eskiDurum === null || ACIK_DURUMLAR.has(girdi.eskiDurum) || girdi.eskiDurum === "suspended";
  if (!neden && kayip && girdi.eskiDurum !== "inactive") throw new Error("Lisans kapatılırken kayıp nedenini seçin; aylık raporda müşterinin neden gittiği buradan okunuyor.");
  return { neden: (neden || null) as KapanisNedeni | null, not };
}

/** Raporun dağılımı: nedene göre adet, çoktan aza; belirtilmemiş en sonda. */
export function nedenDagilimi(nedenler: readonly (string | null | undefined)[]): { kod: string | null; ad: string; adet: number }[] {
  const sayac = new Map<string | null, number>();
  for (const n of nedenler) {
    const kod = n && GECERLI.has(n) ? n : null;
    sayac.set(kod, (sayac.get(kod) ?? 0) + 1);
  }
  return [...sayac.entries()]
    .map(([kod, adet]) => ({ kod, ad: kapanisNedeniAdi(kod), adet }))
    .sort((a, b) => Number(a.kod === null) - Number(b.kod === null) || b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"));
}
