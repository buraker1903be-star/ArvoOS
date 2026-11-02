/*
  KONSOL İŞLEMLERİNİN "ÖNCE → SONRA" KAYDI (02.11.2026).

  Konsoldan yapılan lisans, ürün lisansı, modül ve kurum ayarı
  değişiklikleri iz bırakmıyordu: yalnızca son düzenleyen (updated_by)
  tutuluyordu, ESKİ değer hiçbir yerde yoktu. Müşteri "geçen ay limitim
  20'ydi, neden 10 oldu" diye sorduğunda yanıt yoktu; Ayarlar → İşlem
  kayıtları da bunu açıkça yazıyordu ("genel işlem günlüğü sonraki adım").

  Kayıt activity_logs'a, hedef KURUMUN altına düşüyor (üye erişimi
  kaydıyla aynı yer, metadata.by = "founder_console"): müşteri kartının
  Hareketler sekmesi ve Ayarlar → İşlem kayıtları onu zaten okuyor.

  Saf modül: Next/React/Supabase'e dokunmaz (tests/unit/konsol-degisiklik.test.ts).
  Yazan taraf app/panel/platform/konsol-kaydi.ts.
*/

export type Degisiklik = { alan: string; ad: string; once: string; sonra: string };

export type AlanTanimi = {
  ad: string;
  /** Ekranda görünen değer; verilmezse düz metin. Boş değer her zaman "—". */
  yaz?: (deger: unknown) => string;
};

const BOS = "—";

function bosMu(deger: unknown): boolean {
  if (deger === null || deger === undefined || deger === "") return true;
  if (typeof deger === "object" && !Array.isArray(deger) && Object.keys(deger as object).length === 0) return true;
  return false;
}

/*
  Karşılaştırma YAZILMIŞ DEĞER üzerinden: veritabanı tarihi
  "2026-11-30T00:00:00+00:00", form "2026-11-30T00:00:00.000Z" olarak
  döndürüyor; ham karşılaştırma her kayıtta "değişti" derdi. Ekranda aynı
  görünen iki değer değişmemiş sayılır — kullanıcının göreceği şey de bu.
  Nesneler (ürün kotaları) anahtar sırasından bağımsız karşılaştırılır.
*/
function metne(deger: unknown, tanim: AlanTanimi): string {
  if (bosMu(deger)) return BOS;
  if (tanim.yaz) return tanim.yaz(deger);
  if (typeof deger === "object") return siraliJson(deger);
  return String(deger);
}

function siraliJson(deger: unknown): string {
  if (Array.isArray(deger)) return `[${deger.map(siraliJson).join(",")}]`;
  if (deger && typeof deger === "object") {
    const nesne = deger as Record<string, unknown>;
    return `{${Object.keys(nesne).sort().map((k) => `${k}:${siraliJson(nesne[k])}`).join(",")}}`;
  }
  return String(deger);
}

/**
 * Tanımlı alanlarda değişeni döndürür. `once` null ise (satır yeni açıldı)
 * yalnızca dolu alanlar yazılır: "— → 10" bilgi, "— → —" gürültü.
 */
export function alanFarki(
  once: Record<string, unknown> | null,
  sonra: Record<string, unknown>,
  alanlar: Record<string, AlanTanimi>,
): Degisiklik[] {
  const sonuc: Degisiklik[] = [];
  for (const [alan, tanim] of Object.entries(alanlar)) {
    if (!(alan in sonra)) continue;
    const a = metne(once?.[alan], tanim);
    const b = metne(sonra[alan], tanim);
    if (a !== b) sonuc.push({ alan, ad: tanim.ad, once: a, sonra: b });
  }
  return sonuc;
}

/** Tek satırlık özet: "Durum: Deneme → Aktif · Kullanıcı limiti: 10 → 20". */
export function degisiklikOzeti(degisiklikler: Degisiklik[], sinir = 4): string {
  const parcalar = degisiklikler.slice(0, sinir).map((d) => `${d.ad}: ${d.once} → ${d.sonra}`);
  const kalan = degisiklikler.length - sinir;
  return kalan > 0 ? `${parcalar.join(" · ")} · +${kalan} alan` : parcalar.join(" · ");
}

/** Kayıt türleri; ekranların okuduğu ad buradan. */
export const KONSOL_KAYIT_TURU: Record<string, string> = {
  organization_membership: "Üye erişimi",
  organization_license: "ArvoOS lisansı",
  product_license: "Ürün lisansı",
  product_bridge: "Ürün köprüsü",
  organization_settings: "Kurum ayarları",
  organization_module: "Panel modülü",
  founder_scope: "Kurucu yetkisi",
  package_limits: "Paket limiti",
  proforma: "Proforma",
};

/**
 * Bir konsol kaydının ekrandaki cümlesi. Hareketler sekmesi ve İşlem
 * kayıtları aynı cümleyi yazsın diye tek yerde: iki ekranda iki ayrı
 * çeviri, birinin sapması demekti.
 */
export function konsolKaydiCumlesi(kayit: { action: string; entity_type: string; metadata: Record<string, unknown> | null }): {
  olay: string; ayrinti: string | null; ton: "info" | "warning" | "success";
} {
  const m = kayit.metadata ?? {};
  if (kayit.entity_type === "organization_membership") {
    const acik = m.is_active === true;
    return { olay: acik ? "Üye erişimi açıldı" : "Üye erişimi kapatıldı", ayrinti: null, ton: acik ? "info" : "warning" };
  }
  const tur = KONSOL_KAYIT_TURU[kayit.entity_type];
  if (!tur) return { olay: kayit.action, ayrinti: null, ton: "info" };
  const baslik = typeof m.baslik === "string" && m.baslik ? m.baslik : `${tur} değişti`;
  const degisiklikler = Array.isArray(m.degisiklikler) ? (m.degisiklikler as Degisiklik[]) : [];
  const ayrinti = degisiklikler.length ? degisiklikOzeti(degisiklikler) : null;
  /* Askıya alma ve kapatma dikkat ister; gerisi bilgi. */
  const uyari = degisiklikler.some((d) => /Askıda|Kapalı|İptal|Kapatıldı|Silindi/.test(d.sonra));
  return { olay: baslik, ayrinti, ton: uyari ? "warning" : "info" };
}
