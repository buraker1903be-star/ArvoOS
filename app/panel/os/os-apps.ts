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

export type OsIkon =
  | "home" | "crm" | "operations" | "finance" | "hr" | "documents"
  | "posta" | "messages" | "settings" | "apps" | "notifications";

export type OsUygulama = {
  key: string;
  label: string;
  href: string;
  ikon: OsIkon;
  /** Bu yollarla başlayan her sayfa bu uygulamanın içinde sayılır. */
  yollar: string[];
  /** Okunmamış sayısı gibi rozet; 0 ya da yoksa gösterilmez. */
  rozet?: number;
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
}: {
  modules: PanelModule[];
  role?: string;
  hiddenModuleKeys?: Iterable<string>;
  posta?: { okunmamis: number } | null;
  mesajlar?: { okunmamis: number } | null;
}): OsUygulama[] {
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
    uygulamalar.push({ key: grup.key, label: grup.label, href, ikon: GRUP_IKONU[grup.key] ?? "apps", yollar });
  }
  if (posta) {
    uygulamalar.push({ key: "posta", label: "Posta", href: "/panel/posta", ikon: "posta", yollar: ["/panel/posta"], rozet: posta.okunmamis });
  }
  if (mesajlar) {
    uygulamalar.push({ key: "messages", label: "Mesajlar", href: "/panel/messages", ikon: "messages", yollar: ["/panel/messages"], rozet: mesajlar.okunmamis });
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
  Ctrl+K'da uygulamaların içindeki sık kullanılan sayfalar. Yalnızca
  kişinin dock'unda olan uygulamaların sayfaları gösterilir: CRM'i
  görmeyen birine "Teklifler" önermek, açınca yetki hatası verir.
*/
const SAYFALAR: OsSayfa[] = [
  { label: "Talepler", href: "/panel/crm", uygulama: "crm" },
  { label: "Teklifler", href: "/panel/crm/proposals", uygulama: "crm" },
  { label: "Sözleşmeler", href: "/panel/crm/contracts", uygulama: "crm" },
  { label: "CRM takvimi", href: "/panel/crm/takvim", uygulama: "crm" },
  { label: "WhatsApp", href: "/panel/crm/whatsapp", uygulama: "crm" },
  { label: "İşler", href: "/panel/operations/isler", uygulama: "operations" },
  { label: "İş panosu", href: "/panel/operations/pano", uygulama: "operations" },
  { label: "Operasyon takvimi", href: "/panel/operations/takvim", uygulama: "operations" },
  { label: "Cari hesaplar", href: "/panel/finance", uygulama: "finance" },
  { label: "Finans raporları", href: "/panel/finance/raporlar", uygulama: "finance" },
  { label: "Ekip ve personel", href: "/panel/hr", uygulama: "hr" },
  { label: "Bildirimler", href: "/panel/notifications", uygulama: "home" },
];

export function osSayfalari(uygulamalar: OsUygulama[]): OsSayfa[] {
  const acik = new Set(uygulamalar.map((u) => u.key));
  return SAYFALAR.filter((sayfa) => acik.has(sayfa.uygulama));
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
