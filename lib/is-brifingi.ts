// İş brifingi: satıştan operasyona geçen bilgi.
//
// Saf modül (Next/React/Supabase yok): testi tests/unit/is-brifingi.test.ts.
// Veritabanı tarafı ve gerekçeler:
// supabase/migrations/20261001064709_is_brifingi.sql
//
// Sorular KURUMUN: ArvoOS çok kiracılı bir ürün ve "Turnitin eşiği" gibi
// bir alanı şemaya gömmek paneli tek bir sektörün yazılımına çevirirdi.
// Burada yalnızca FORMUN KURALLARI var, soruların kendisi değil.

export type BriefFieldType = "text" | "long_text" | "date" | "select" | "multi_select" | "bool";

export const BRIEF_FIELD_TYPES: BriefFieldType[] = ["text", "long_text", "date", "select", "multi_select", "bool"];

export const BRIEF_TYPE_LABELS: Record<BriefFieldType, string> = {
  text: "Kısa metin",
  long_text: "Uzun metin",
  date: "Tarih",
  select: "Tek seçim",
  multi_select: "Çok seçim",
  bool: "Evet / hayır",
};

export interface BriefField {
  code: string;
  label: string;
  field_type: BriefFieldType;
  /** Yalnızca select / multi_select tiplerinde dolu. */
  options: string[] | null;
  hint: string | null;
  is_required: boolean;
  /** Soru hangi çalışma türlerinde sorulsun; boş = hepsinde. */
  set_codes: string[] | null;
  sort_order: number;
  is_active: boolean;
}

/** Brifing değeri; jsonb'de bu şekiller duruyor. */
export type BriefValue = string | string[] | boolean;
export type BriefValues = Record<string, BriefValue>;

/*
  Form sınırları. Otuz soru, doldurulmayan bir formun eşiği: gönderilen
  taslak 60'ın üzerinde kutu içeriyordu ve böyle bir form dürüst
  doldurulmaz — ilk iki bölüm dolar, gerisi boş kalır ve bir süre sonra
  "zaten kimse bakmıyor"a döner.
*/
export const BRIEF_EN_COK = 30;
export const SECENEK_EN_COK = 20;
export const ETIKET_EN_UZUN = 120;
export const IPUCU_EN_UZUN = 200;
export const METIN_EN_UZUN = 2000;

export const BRIEF_KODU = /^[a-z0-9_]{2,40}$/;
const ISO_GUN = /^\d{4}-\d{2}-\d{2}$/;

export const briefTipiMi = (value: unknown): value is BriefFieldType =>
  typeof value === "string" && (BRIEF_FIELD_TYPES as string[]).includes(value);

const secimli = (tip: BriefFieldType) => tip === "select" || tip === "multi_select";

/** Form tanımını veritabanına göndermeden önce denetler. Hata metni ya da null. */
export function brifingFormSorunu(satirlar: unknown): string | null {
  if (!Array.isArray(satirlar)) return "Form okunamadı. Sayfayı yenileyip tekrar deneyin.";
  if (satirlar.length > BRIEF_EN_COK) return `Brifing formuna en fazla ${BRIEF_EN_COK} soru eklenebilir.`;
  const kodlar = new Set<string>();
  for (const [sira, ham] of satirlar.entries()) {
    const satir = (ham ?? {}) as Partial<BriefField>;
    const label = String(satir.label ?? "").trim();
    if (label.length < 2 || label.length > ETIKET_EN_UZUN) {
      return `${sira + 1}. sorunun başlığı 2–${ETIKET_EN_UZUN} karakter olmalı.`;
    }
    const code = String(satir.code ?? "").trim();
    if (!BRIEF_KODU.test(code)) return `${sira + 1}. sorunun kodu geçersiz (küçük harf, rakam ve alt çizgi).`;
    if (kodlar.has(code)) return `“${code}” kodu iki kez kullanılmış; her sorunun kodu benzersiz olmalı.`;
    kodlar.add(code);
    if (!briefTipiMi(satir.field_type)) return `${sira + 1}. sorunun tipi geçersiz.`;
    if ((satir.hint ?? "").length > IPUCU_EN_UZUN) return `${sira + 1}. sorunun açıklaması en fazla ${IPUCU_EN_UZUN} karakter.`;
    /*
      Seçenekler tipe bağlı: seçimli soruda en az iki şık olmalı (tek
      şıklı bir seçim soru değildir), seçimsiz soruda hiç olmamalı —
      aksi hâlde ekranda görünmeyen bir veri taşınır.
    */
    const secenekler = (satir.options ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (secimli(satir.field_type)) {
      if (secenekler.length < 2) return `“${label}” için en az iki seçenek yazın.`;
      if (secenekler.length > SECENEK_EN_COK) return `“${label}” için en fazla ${SECENEK_EN_COK} seçenek.`;
      if (new Set(secenekler).size !== secenekler.length) return `“${label}” içinde aynı seçenek iki kez yazılmış.`;
    } else if (secenekler.length) {
      return `“${label}” seçim sorusu değil; seçenekleri boş bırakın.`;
    }
  }
  return null;
}

/** Çalışma türüne göre sorulacak alanlar (sırayla). */
export function gecerliAlanlar(alanlar: BriefField[], setKodu: string | null): BriefField[] {
  return alanlar
    .filter((alan) => alan.is_active)
    .filter((alan) => !alan.set_codes?.length || (setKodu !== null && alan.set_codes.includes(setKodu)))
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code, "tr"));
}

export interface BrifingSatiri {
  alan: BriefField;
  deger: BriefValue | null;
  /** Ekrana basılacak hâli; boşsa null. */
  yazi: string | null;
}

/** Kayıtlı değerleri alan tanımlarıyla eşleyip okunur hâle getirir. */
export function brifingOku(alanlar: BriefField[], values: BriefValues | null): BrifingSatiri[] {
  const kayit = values ?? {};
  return alanlar.map((alan) => {
    const ham = kayit[alan.code];
    let yazi: string | null = null;
    if (alan.field_type === "bool") yazi = typeof ham === "boolean" ? (ham ? "Evet" : "Hayır") : null;
    else if (alan.field_type === "multi_select") yazi = Array.isArray(ham) && ham.length ? ham.join(", ") : null;
    else yazi = typeof ham === "string" && ham.trim() ? ham.trim() : null;
    return { alan, deger: ham ?? null, yazi };
  });
}

/** "4/9 yanıtlandı" — eksik brifing görünür olmalı, sessizce boş kalmamalı. */
export function brifingDoluluk(alanlar: BriefField[], values: BriefValues | null) {
  const satirlar = brifingOku(alanlar, values);
  return { dolu: satirlar.filter((satir) => satir.yazi !== null).length, toplam: satirlar.length };
}

export interface BrifingSonucu {
  values: BriefValues;
  hata: string | null;
}

/*
  Formdan gelen ham girdiyi doğrular ve jsonb'ye yazılacak hâle getirir.

  Boş yanıt KAYDEDİLMEZ (anahtar hiç yazılmaz): "boş string" ile
  "yanıtlanmadı" ayrımı olmazsa doluluk sayacı yalan söyler ve zorunlu
  alan denetimi boş metni yanıt sayar.
*/
export function brifingDogrula(
  alanlar: BriefField[],
  girdi: Record<string, string | string[] | undefined>,
): BrifingSonucu {
  const values: BriefValues = {};
  for (const alan of alanlar) {
    const ham = girdi[alan.code];
    if (alan.field_type === "multi_select") {
      const secilen = (Array.isArray(ham) ? ham : ham === undefined ? [] : [ham])
        .map((s) => String(s).trim())
        .filter(Boolean);
      const gecerli = secilen.filter((s) => alan.options?.includes(s));
      if (gecerli.length !== secilen.length) return { values, hata: `“${alan.label}” için geçersiz seçenek.` };
      if (gecerli.length) values[alan.code] = gecerli;
    } else if (alan.field_type === "bool") {
      const metin = String(Array.isArray(ham) ? ham[0] ?? "" : ham ?? "").trim();
      if (metin === "evet") values[alan.code] = true;
      else if (metin === "hayir") values[alan.code] = false;
      else if (metin !== "") return { values, hata: `“${alan.label}” için geçersiz yanıt.` };
    } else {
      const metin = String(Array.isArray(ham) ? ham[0] ?? "" : ham ?? "").trim();
      if (metin === "") {
        // boş: anahtar yazılmıyor
      } else if (alan.field_type === "date" && !ISO_GUN.test(metin)) {
        return { values, hata: `“${alan.label}” için tarihi gün/ay/yıl olarak seçin.` };
      } else if (alan.field_type === "select" && !alan.options?.includes(metin)) {
        return { values, hata: `“${alan.label}” için geçersiz seçenek.` };
      } else if (metin.length > METIN_EN_UZUN) {
        return { values, hata: `“${alan.label}” en fazla ${METIN_EN_UZUN} karakter olabilir.` };
      } else {
        values[alan.code] = metin;
      }
    }
    if (alan.is_required && values[alan.code] === undefined) {
      return { values, hata: `“${alan.label}” zorunlu.` };
    }
  }
  return { values, hata: null };
}

/*
  Ön ayar. Bilerek SEKTÖRSÜZ: kurumun kendi sorularını yazacağı bir forma
  başlangıç noktası veriyor. Akademik bir kurumun formu (konu durumu,
  veri/analiz, danışman, benzerlik raporu) bu listenin üstüne kurulur —
  ürüne gömülmez.
*/
export const VARSAYILAN_BRIEF_ALANLARI: Omit<BriefField, "sort_order" | "is_active">[] = [
  {
    code: "kapsam",
    label: "İşin kapsamı",
    field_type: "long_text",
    options: null,
    hint: "Müşteriyle anlaşılan iş: ne teslim edilecek?",
    is_required: true,
    set_codes: null,
  },
  {
    code: "verilen_sozler",
    label: "Müşteriye verilen sözler",
    field_type: "long_text",
    options: null,
    hint: "Sözleşmede yazmayan ama söz verilen her şey.",
    is_required: false,
    set_codes: null,
  },
  {
    code: "musteri_malzemesi",
    label: "Müşterinin elinde ne var",
    field_type: "multi_select",
    options: ["Taslak", "Kaynaklar", "Veri", "Yazım kılavuzu", "Hiçbiri"],
    hint: null,
    is_required: false,
    set_codes: null,
  },
  {
    code: "ilk_ara_teslim",
    label: "Müşterinin beklediği ilk ara teslim",
    field_type: "date",
    options: null,
    hint: "Nihai teslim sözleşmeden gelir; bu, müşterinin beklediği ilk paylaşım.",
    is_required: false,
    set_codes: null,
  },
  {
    code: "iletisim_kanali",
    label: "Müşteriyle iletişim kanalı",
    field_type: "select",
    options: ["E-posta", "WhatsApp", "Telefon", "Panel"],
    hint: null,
    is_required: false,
    set_codes: null,
  },
];
