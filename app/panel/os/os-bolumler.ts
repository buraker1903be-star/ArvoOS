/*
  MODÜL BÖLÜMLERİ — tek kaynak.

  Her uygulamanın bölümleri (CRM: Genel Bakış, Talepler, WhatsApp…) iki
  yerde görünür: dock'ta ikonun üstüne gelince (dokunmatikte ikona
  dokununca) açılan ikinci dock ve Ctrl+K araması. Sayfa içi sekme
  çubukları 2026-10'da kalktı. Eskiden
  sekmeler her modülün kendi dosyasında, Ctrl+K'nın listesi ayrı bir
  yerde elle yazılıydı; bir sekme eklenince öteki unutuluyordu.

  Görünürlük kuralları sayfaların kendi yetki kurallarıyla aynı
  (finance-navigation.tsx, hr-tabs.tsx bu dosyadaki kuralları kullanır).
  Menüde gizlemek yetkinin üçüncü katmanı; sayfalar kendi kontrolünü yapar.

  Saf modül: birim testi os-bolumler.test.ts.
*/

/** altYollar: bölümün kendi yolu dışında onu etkin sayan yollar (ör. Müşteriler → /panel/finance/musteri/…). */
export type Bolum = { key: string; href: string; label: string; altYollar?: string[] };

export type BolumErisimi = {
  modules: { code: string }[];
  yetkiler: ReadonlySet<string>;
  isPlatformOwner?: boolean;
};

/** İş maliyetleri sekmesi (finance-navigation.tsx). */
export const maliyetGorur = (e: BolumErisimi) => e.yetkiler.has("finance.maliyet.yonet");
/** Raporlar: kurumda Raporlama modülü açık + rolde rapor yetkisi. */
export const finansRaporGorur = (e: BolumErisimi) =>
  e.modules.some((m) => m.code === "reporting") && e.yetkiler.has("finance.rapor.gor");
/** Prim hesaplama: commissions/page.tsx ile aynı kural. */
export const primGorur = (e: Pick<BolumErisimi, "yetkiler" | "isPlatformOwner">) =>
  Boolean(e.isPlatformOwner) || e.yetkiler.has("hr.prim.gor");
/** Gizlilik sözleşmeleri ve personel hareketleri. */
export const ikKayitGorur = (e: Pick<BolumErisimi, "yetkiler">) =>
  e.yetkiler.has("hr.gizlilik.gor") || e.yetkiler.has("hr.hareket.gor");

export function crmBolumleri(): Bolum[] {
  return [
    { key: "genel-bakis", href: "/panel/crm/genel-bakis", label: "Genel Bakış" },
    // Talepler tablosu modülün giriş adresinde: panelin birçok yeri oraya bağlanıyor.
    { key: "talepler", href: "/panel/crm", label: "Talepler" },
    // WhatsApp burada bir bölümdü; artık "Tüm uygulamalar"da ayrı uygulama (os-apps.ts).
    { key: "teklifler", href: "/panel/crm/proposals", label: "Teklifler" },
    { key: "sozlesmeler", href: "/panel/crm/contracts", label: "Sözleşmeler" },
    { key: "takvim", href: "/panel/crm/takvim", label: "Takvim" },
  ];
}

export function operasyonBolumleri(): Bolum[] {
  return [
    { key: "genel-bakis", href: "/panel/operations", label: "Genel Bakış" },
    { key: "is-akisi", href: "/panel/operations/isler", label: "İşler" },
    { key: "pano", href: "/panel/operations/pano", label: "Pano" },
    { key: "takvim", href: "/panel/operations/takvim", label: "Takvim" },
    { key: "arsiv", href: "/panel/operations/arsiv", label: "Arşiv" },
    { key: "sablon", href: "/panel/operations/sablon", label: "Adım Şablonu" },
  ];
}

export function finansBolumleri(e: BolumErisimi): Bolum[] {
  return [
    { key: "genel-bakis", href: "/panel/finance/genel-bakis", label: "Genel Bakış" },
    /* "Cari Hesaplar" 2026-10'da "Müşteriler" oldu: cari artık müşteri
       detayında ortada açılan bir pencere. Anahtar aynı kaldı. */
    { key: "cari", href: "/panel/finance", label: "Müşteriler", altYollar: ["/panel/finance/musteri"] },
    ...(maliyetGorur(e) ? [{ key: "maliyet", href: "/panel/finance?gorunum=maliyet", label: "İş Maliyetleri" }] : []),
    ...(finansRaporGorur(e) ? [{ key: "raporlar", href: "/panel/finance/raporlar", label: "Raporlar" }] : []),
  ];
}

export function ikBolumleri(e: Pick<BolumErisimi, "yetkiler" | "isPlatformOwner">): Bolum[] {
  return [
    { key: "genel-bakis", href: "/panel/hr/genel-bakis", label: "Genel Bakış" },
    { key: "personel", href: "/panel/hr", label: "Personel" },
    ...(primGorur(e)
      ? [
          { key: "prim", href: "/panel/hr/commissions", label: "Prim Hesaplama" },
          { key: "prim-hesabi", href: "/panel/hr/prim-hesabi", label: "Prim Hesabı" },
        ]
      : []),
    ...(ikKayitGorur(e)
      ? [
          { key: "gizlilik", href: "/panel/hr/confidentiality", label: "Gizlilik Sözleşmeleri" },
          { key: "hareketler", href: "/panel/hr/activity", label: "Personel Hareketleri" },
        ]
      : []),
  ];
}

export function dokumanBolumleri(): Bolum[] {
  return [
    { key: "teklifler", href: "/panel/documents?tab=teklifler", label: "Teklifler" },
    { key: "sozlesmeler", href: "/panel/documents?tab=sozlesmeler", label: "Sözleşmeler" },
  ];
}

/** Uygulama anahtarına (os-apps.ts) göre bölümler; bölümü olmayan uygulama boş döner. */
export function uygulamaBolumleri(uygulama: string, e: BolumErisimi): Bolum[] {
  switch (uygulama) {
    case "crm": return crmBolumleri();
    case "operations": return operasyonBolumleri();
    case "finance": return finansBolumleri(e);
    case "hr": return ikBolumleri(e);
    case "documents": return dokumanBolumleri();
    default: return [];
  }
}

/**
 * Açık sayfanın bölümü. Sorgu dizesi de eşleşmeli olanlar (Finans'ın
 * ?gorunum= görünümleri) önce; sonra en uzun yol öneki. "/panel/crm"
 * yalnızca tam eşleşir, yoksa her CRM sayfası "Talepler" sayılırdı.
 */
export function etkinBolum(bolumler: Bolum[], yol: string, sorgu = ""): Bolum | null {
  const parametreler = new URLSearchParams(sorgu);
  let enIyi: Bolum | null = null;
  let puan = -1;
  for (const bolum of bolumler) {
    const [bYol, bSorgu = ""] = bolum.href.split("?");
    const bParam = new URLSearchParams(bSorgu);
    const sorguTutar = [...bParam.entries()].every(([k, v]) => parametreler.get(k) === v);
    if (!sorguTutar) continue;
    const kokYol = bolumler.some((d) => d !== bolum && d.href.split("?")[0].startsWith(`${bYol}/`));
    const yolTutar = yol === bYol || (!kokYol && yol.startsWith(`${bYol}/`)) || Boolean(bolum.altYollar?.some((alt) => yol === alt || yol.startsWith(`${alt}/`)));
    if (!yolTutar) continue;
    // Sorgu koşulu olan bölüm, aynı yoldaki koşulsuz bölümden önce gelir.
    const p = bYol.length * 10 + [...bParam.keys()].length;
    if (p > puan) { enIyi = bolum; puan = p; }
  }
  return enIyi;
}
