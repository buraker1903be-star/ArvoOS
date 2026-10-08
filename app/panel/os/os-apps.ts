/*
  Şirket işletim sistemi: her modül bir "uygulama".

  Dock, uygulama başlatıcı, durum çubuğundaki uygulama adı ve Ctrl+K
  araması aynı listeden beslenir. Liste eski kenar menüsünün kuralını
  birebir izler (resolveNavigationGroups): kurumun açık modülleri, rolün
  gizlenen grupları ve kişiye özel gizlenen modüller. Menüde gizlemek
  yetkinin üçüncü katmanı (AGENTS.md); sunucu ve RLS kontrolleri ayrıca
  sayfalarda duruyor.

  Saf modül: Next/React/Supabase'e dokunmaz, birim testi os-apps.test.ts.
*/
import {
  normalizeModuleCode,
  resolveGroupHref,
  resolveNavigationGroups,
  type PanelModule,
} from "../panel-navigation-config";
import { uygulamaBolumleri, type Bolum, type BolumErisimi } from "./os-bolumler";

export type OsIkon =
  | "home" | "crm" | "operations" | "finance" | "hr" | "documents"
  | "posta" | "messages" | "settings" | "apps" | "notifications" | "whatsapp";

export type OsUygulama = {
  key: string;
  label: string;
  href: string;
  ikon: OsIkon;
  /** Bu yollarla başlayan her sayfa bu uygulamanın içinde sayılır. */
  yollar: string[];
  /** Okunmamış sayısı gibi rozet; 0 ya da yoksa gösterilmez. */
  rozet?: number;
  /** Uygulamanın bölümleri (os-bolumler.ts): ikinci dock ve Ctrl+K. */
  bolumler?: Bolum[];
  /** Yalnızca "Tüm uygulamalar"da (ve Ctrl+K'da); dock'ta yer kaplamaz. */
  yalnizBaslatici?: boolean;
};

export type OsSayfa = { label: string; href: string; uygulama: string };

const GRUP_IKONU: Record<string, OsIkon> = {
  crm: "crm",
  operations: "operations",
  finance: "finance",
  hr: "hr",
  documents: "documents",
};

export function osUygulamalari({
  modules,
  role,
  hiddenModuleKeys,
  posta,
  mesajlar,
  erisim,
}: {
  modules: PanelModule[];
  role?: string;
  hiddenModuleKeys?: Iterable<string>;
  posta?: { okunmamis: number } | null;
  mesajlar?: { okunmamis: number } | null;
  /** Bölümlerin yetki kuralları için; verilmezse yalnızca herkese açık bölümler. */
  erisim?: Omit<BolumErisimi, "modules">;
}): OsUygulama[] {
  const bolumErisimi: BolumErisimi = { modules, yetkiler: erisim?.yetkiler ?? new Set(), isPlatformOwner: erisim?.isPlatformOwner };
  const gruplar = resolveNavigationGroups(modules, role, new Set(hiddenModuleKeys ?? []))
    .filter((grup) => grup.items.length > 0);

  const uygulamalar: OsUygulama[] = [
    { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
  ];
  for (const grup of gruplar) {
    const href = resolveGroupHref(grup);
    const yollar = [...new Set([
      `/panel/${grup.key}`,
      ...grup.items.map((item) => `/panel/${item.code}`),
      ...grup.items.map((item) => `/panel/${normalizeModuleCode(item.code)}`),
    ])];
    const bolumler = uygulamaBolumleri(grup.key, bolumErisimi);
    uygulamalar.push({ key: grup.key, label: grup.label, href, ikon: GRUP_IKONU[grup.key] ?? "apps", yollar, ...(bolumler.length ? { bolumler } : {}) });
  }
  /*
    WhatsApp (2026-10): eskiden CRM'in ikinci dock'unda bir bölümdü; kurum
    sahibinin isteğiyle "Tüm uygulamalar"da ayrı uygulama. Sayfası CRM'in
    içinde (/panel/crm/whatsapp), CRM açıksa görünür; dock'ta yer kaplamaz.
  */
  if (gruplar.some((grup) => grup.key === "crm")) {
    uygulamalar.push({ key: "whatsapp", label: "WhatsApp", href: "/panel/crm/whatsapp", ikon: "whatsapp", yollar: ["/panel/crm/whatsapp"], yalnizBaslatici: true });
  }
  /*
    Posta ve Mesajlar dock'ta değil, "Tüm uygulamalar"da (kurum sahibinin
    isteği, 2026-10). Dock gün içinde sürekli girilen bölümler için;
    ikisi de gün boyu açık tutulan değil, gidip gelinen ekranlar.

    Mesajlar zaten üst çubukta kendi çekmecesiyle duruyor
    (MessagesDrawer) ve okunmamış sayısı orada görünüyor, yani dock'taki
    girdi ikinci bir kopyaydı. Postanın okunmamış rozeti ise yalnızca
    dock'ta çiziliyordu; kaldırınca o sayı hiçbir yerde görünmüyor —
    gerekirse üst çubuğa kendi düğmesi eklenir.
  */
  if (posta) {
    uygulamalar.push({ key: "posta", label: "Posta", href: "/panel/posta", ikon: "posta", yollar: ["/panel/posta"], rozet: posta.okunmamis, yalnizBaslatici: true });
  }
  if (mesajlar) {
    uygulamalar.push({ key: "messages", label: "Mesajlar", href: "/panel/messages", ikon: "messages", yollar: ["/panel/messages"], rozet: mesajlar.okunmamis, yalnizBaslatici: true });
  }
  uygulamalar.push({ key: "settings", label: "Ayarlar", href: "/panel/settings", ikon: "settings", yollar: ["/panel/settings"] });
  return uygulamalar;
}

/**
 * Açık sayfanın uygulaması. En uzun eşleşen yol kazanır; "/panel/crm"
 * "/panel/crmx" ile eşleşmez. Ana ekran yalnızca tam "/panel".
 */
export function etkinUygulama(uygulamalar: OsUygulama[], yol: string): OsUygulama | null {
  if (yol === "/panel" || yol === "/panel/") return uygulamalar.find((u) => u.key === "home") ?? null;
  let enIyi: OsUygulama | null = null;
  let enUzun = 0;
  for (const uygulama of uygulamalar) {
    for (const onek of uygulama.yollar) {
      if ((yol === onek || yol.startsWith(`${onek}/`)) && onek.length > enUzun) {
        enIyi = uygulama;
        enUzun = onek.length;
      }
    }
  }
  return enIyi;
}

/*
  Ctrl+K'daki sayfalar uygulamaların BÖLÜMLERİNDEN (os-bolumler.ts) gelir;
  eskiden burada elle yazılmış ayrı bir liste vardı ve sekmelerle
  ayrışıyordu. Yalnızca kişinin dock'unda olan uygulamaların, yetkisinin
  yettiği bölümleri önerilir.
*/
export function osSayfalari(uygulamalar: OsUygulama[]): OsSayfa[] {
  const sayfalar: OsSayfa[] = uygulamalar.flatMap((u) => (u.bolumler ?? []).map((b) => ({ label: b.label === "Genel Bakış" ? `${u.label} genel bakış` : b.label, href: b.href, uygulama: u.key })));
  // Bölümü olmayan, yalnızca başlatıcıdaki uygulamalar (WhatsApp) Ctrl+K'da da bulunsun.
  for (const u of uygulamalar) if (u.yalnizBaslatici) sayfalar.push({ label: u.label, href: u.href, uygulama: u.key });
  sayfalar.push({ label: "Bildirimler", href: "/panel/notifications", uygulama: "home" });
  return sayfalar;
}

/** Avatar için baş harfler: "burak erdoğan" → "BE". Türkçe büyük harf (i → İ). */
export function basHarfler(ad: string): string {
  return ad.split(/\s+/).filter(Boolean).slice(0, 2).map((parca) => parca[0]!.toLocaleUpperCase("tr")).join("") || "?";
}

/** Türkçe büyük/küçük harf ve aksan duyarsız arama (İ/ı, ş/s…). */
export function aramaAnahtari(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* Ctrl+K → "Müşteri sorgula" penceresi (crm/customer-lookup.tsx). Ad burada:
   palet, pencerenin bütün kodunu kabuğa çekmeden olayı gönderebilsin. */
export const MUSTERI_SORGU_OLAYI = "os:musteri-sorgula";

/* Anlık bir değişiklik sayfayı tazelediğinde durum çubuğu kısa süre
   "Güncellendi" der (os-canli-yenile.tsx yazar, os-status.tsx dinler). */
export const CANLI_GUNCELLEME_OLAYI = "os:guncellendi";

/*
  Hangi sayfa hangi tabloların değişikliğiyle kendiliğinden tazelenir
  (os-canli-yenile.tsx). Yalnızca LİSTE ve ÖZET ekranları: detay ve form
  sayfalarında başkasının değişikliğiyle ekranın kıpırdaması, yazılan
  formun altından verinin kaymasına yol açar. İş panosu da dışarıda:
  sürükle-bırak sırasında tazeleme kartı elden kaçırır.
*/
const CRM_TABLOLARI = ["crm_opportunities", "crm_proposals", "crm_contracts", "activity_logs"];
const CANLI_SAYFALAR: Record<string, string[]> = {
  // Ana ekran: talep trendi + dört liste (operasyon, aşama, müşteri mesajı, posta).
  "/panel": ["crm_opportunities", "operation_workflows", "operation_steps", "customer_file_messages", "mail_threads"],
  "/panel/crm": CRM_TABLOLARI,
  "/panel/crm/genel-bakis": CRM_TABLOLARI,
  "/panel/crm/proposals": CRM_TABLOLARI,
  "/panel/crm/contracts": CRM_TABLOLARI,
  "/panel/operations": ["operation_workflows"],
  "/panel/operations/isler": ["operation_workflows"],
};

export function canliTablolar(yol: string): string[] {
  const temiz = yol.length > 1 ? yol.replace(/\/+$/, "") : yol;
  return CANLI_SAYFALAR[temiz] ?? [];
}
