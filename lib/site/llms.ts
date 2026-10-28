// llms.txt (llmstxt.org) ve llms-full.txt içerikleri. URL'ler yalnızca
// ROUTES / PRODUCT_APPS / COMPANY'den türetilir. Uydurma istatistik, müşteri,
// deneme süresi veya ödül YAZMAYIN. Fiyat 30.09.2026'dan beri yayımlanıyor
// ama ELLE YAZILMAZ: tutarlar konsolda yayımlanan listeden, yoksa lib/site/pricing.ts'ten üretilir (fiyatListesi).
// Eskiden "fiyat yazmayın" kuralı vardı; liste fiyatı olmadığı içindi. ArvoOS özellikleri panelde
// arayüzü olan (doğrulanmış) özelliklerle sınırlıdır: stok, satın alma,
// sevkiyat, e-fatura, banka mutabakatı, pazaryeri entegrasyonu YOK.
// ArvoARC 28.10.2026'da satıştan kalktı (yalnızca e-ticaret sitesi yaptırana panel);
// entegrasyon/ödeme/kargo iddiası YOK.
import { COMPANY, PRODUCT_APPS, ROUTES, SITE_ORIGIN, absoluteUrl, type Locale, type PageId } from "./routes";
import { SITE_PRODUCTS, YILLIK_BEDAVA_AY, planlar, urunAdi } from "./pricing";
import type { Fiyatlar } from "./fiyat-kaynagi";
import { paraYaz, sayfaPlanTutari, sayfaPlanYillikTutari } from "./doviz";

export const LLMS_UPDATED = "2026-10-28";

/* llms.txt İngilizce ve Türkçe: yanıt motorları bu iki metni kaynak
   gösteriyor; diğer diller (de, es, fr) sitenin kendisinde. */
type LlmsLocale = Extract<Locale, "en" | "tr">;
type PageInfo = Record<LlmsLocale, { name: string; summary: string }>;

/** Her sayfa için kısa, olgusal açıklama (Record → her PageId zorunlu). */
const PAGES: Record<PageId, PageInfo> = {
  home: {
    en: { name: "ArvoOS home", summary: "Overview of the ArvoOS product ecosystem (the ArvoOS business operating system, ArvoLab, ArvoCal) and services." },
    tr: { name: "ArvoOS ana sayfa", summary: "ArvoOS ürün ekosistemine (ArvoOS işletme işletim sistemi, ArvoLab, ArvoCal) ve hizmetlere genel bakış." },
  },
  arvoos: {
    en: { name: "ArvoOS", summary: "Multi-tenant business operating system for service businesses and institutions: CRM and sales pipeline, proposals with online customer acceptance, e-signed contracts, operations (jobs, tasks, stage board, calendar), a customer tracking portal, finance with online payment links, HR, reports and team communication — one flow from request to collection." },
    tr: { name: "ArvoOS", summary: "Hizmet işletmeleri ve kurumlar için çok kiracılı işletme işletim sistemi: CRM ve satış hattı, müşterinin çevrim içi onayladığı teklifler, e-imzalı sözleşmeler, operasyon (iş, görev, aşama panosu, takvim), müşteri takip portalı, çevrim içi ödeme bağlantılı finans, İK, raporlar ve ekip iletişimi — talepten tahsilata tek akış." },
  },
  "arvoos-modules": {
    en: { name: "ArvoOS modules", summary: "CRM & sales, proposals, contracts, document centre, operations, customer tracking portal, finance, HR, reports, communication, governance and branding." },
    tr: { name: "ArvoOS modülleri", summary: "CRM ve satış, teklifler, sözleşmeler, belge merkezi, operasyon, müşteri takip portalı, finans, İK, raporlar, iletişim, yetki ve markalama." },
  },
  "arvoos-industries": {
    en: { name: "ArvoOS industries", summary: "How ArvoOS is configured for healthcare institutions, education institutions, consulting and service firms, and multi-branch businesses." },
    tr: { name: "ArvoOS sektörler", summary: "ArvoOS'un sağlık kurumları, eğitim kurumları, danışmanlık ve hizmet firmaları ile çok şubeli işletmeler için yapılandırılması." },
  },
  "arvoos-solutions": {
    en: { name: "ArvoOS solutions", summary: "Sales and customer management, operations management, financial control and corporate governance use cases." },
    tr: { name: "ArvoOS çözümler", summary: "Satış ve müşteri yönetimi, operasyon yönetimi, finansal kontrol ve kurumsal yönetişim kullanım senaryoları." },
  },
  "arvoos-plans": {
    en: { name: "ArvoOS plans", summary: "Three steps (Starter, Business, Enterprise). Starter and Business have published list prices; Enterprise is scoped per organization (modules, users, branches, workflows)." },
    tr: { name: "ArvoOS paketler", summary: "Üç basamak (Başlangıç, Kurumsal, Özel kurum). Başlangıç ve Kurumsal basamaklarının liste fiyatı yayımlanmıştır; Özel kurum kuruma göre belirlenir (modüller, kullanıcılar, şubeler, iş akışları)." },
  },
  randevu: {
    en: { name: "ArvoCal", summary: "ArvoCal (formerly Arvo Randevu) is an appointment system for hair and beauty salons: an online booking page where the customer picks the service, the stylist (or 'no preference') and the time without signing up, a per-staff calendar, service and staff definitions, weekly working hours and time off in local time, customer records, and a daily reminder list sent from WhatsApp in one tap. Clashing appointments are rejected at database level." },
    tr: { name: "ArvoCal", summary: "ArvoCal (eski adıyla Arvo Randevu): kuaför ve güzellik salonları için randevu sistemi: müşterinin üye olmadan hizmeti, personeli (ya da 'fark etmez') ve saati seçtiği çevrim içi randevu sayfası, personel bazlı takvim, hizmet ve personel tanımı, yerel saatle haftalık çalışma saatleri ve izinler, müşteri kaydı, tek tıkla WhatsApp'tan gönderilen günlük hatırlatma listesi. Çakışan randevu veritabanı düzeyinde reddedilir." },
  },
  pricing: {
    en: { name: "Pricing", summary: "Public monthly and annual subscription prices for ArvoOS, ArvoCal and ArvoLab. ArvoOS and ArvoCal are priced per organization, not per user; ArvoLab is priced per researcher; Turkish-lira prices include VAT, US-dollar and euro prices exclude it; annual billing costs 10 months for 12 months of use. Add-ons, and subscription terms (no automatic card charge, cancellation at period end, 30 days' notice before a price change)." },
    tr: { name: "Ücretler", summary: "ArvoOS, ArvoCal ve ArvoLab için herkese açık aylık ve yıllık abonelik fiyatları. ArvoOS ve ArvoCal kurum başına fiyatlanır, kullanıcı başına değil; ArvoLab araştırmacı başına fiyatlanır; TL fiyatlara KDV dahildir, dolar ve avro fiyatlarına dahil değildir; yıllık ödemede 12 ay kullanım için 10 aylık bedel ödenir. Ek kalemler ve abonelik koşulları (otomatik kart çekimi yok, iptal dönem sonunda, fiyat değişikliği en az 30 gün önce bildirilir)." },
  },
  arvolab: {
    en: { name: "ArvoLab", summary: "Research workspace for literature and citation management, academic writing, guideline checks, quantitative and qualitative analysis, an academic editor and an originality pre-check." },
    tr: { name: "ArvoLab", summary: "Literatür ve atıf yönetimi, akademik yazım, kılavuz kontrolü, nicel ve nitel analiz, akademik editör ve özgünlük ön kontrolü için araştırma çalışma alanı." },
  },
  services: {
    en: { name: "Services", summary: "Website design and development (including e-commerce websites delivered with their own store management panel), SEO and GEO content optimization, custom software development, process and experience design, integrations and automation, corporate digital systems (panels, portals) and ongoing development support." },
    tr: { name: "Hizmetler", summary: "Web sitesi tasarımı ve yapımı (yönetim paneliyle birlikte teslim edilen e-ticaret siteleri dahil), SEO ve GEO içerik düzenleme, özel yazılım geliştirme, süreç ve deneyim tasarımı, entegrasyon ve otomasyon, kurumsal dijital sistemler (panel, portal) ve sürekli geliştirme desteği." },
  },
  "web-design": {
    en: { name: "Web design", summary: "Brand websites delivered end to end: discovery and strategy, content architecture, UX/UI design, development, testing and launch, maintenance." },
    tr: { name: "Web sitesi tasarımı", summary: "Uçtan uca marka web siteleri: keşif ve strateji, içerik mimarisi, UX/UI tasarım, geliştirme, test ve yayın, bakım." },
  },
  "seo-geo": {
    en: { name: "SEO & GEO", summary: "Content editing and technical optimization so that search engines (SEO) and AI answer engines such as ChatGPT, Perplexity and Google AI Overviews (GEO) can understand and cite a website. No ranking guarantees." },
    tr: { name: "SEO ve GEO", summary: "Bir web sitesinin arama motorları (SEO) ve ChatGPT, Perplexity, Google AI Overviews gibi yapay zekâ yanıt motorları (GEO) tarafından anlaşılması ve alıntılanması için içerik düzenleme ve teknik optimizasyon. Sıralama garantisi verilmez." },
  },
  "custom-software": {
    en: { name: "Custom software", summary: "Custom software built around an organization's workflows: panels and portals, integrations and automation requests." },
    tr: { name: "Özel yazılım", summary: "Kurumun iş akışlarına göre özel yazılım: panel ve portal geliştirme, entegrasyon ve otomasyon talepleri." },
  },
  about: {
    en: { name: "About", summary: `About ${COMPANY.legalName}, the company behind ArvoOS, based in ${COMPANY.city}.` },
    tr: { name: "Hakkımızda", summary: `ArvoOS'un arkasındaki şirket ${COMPANY.legalName} (${COMPANY.city}) hakkında.` },
  },
  contact: {
    en: { name: "Contact", summary: `Demo, product access and project requests. Email: ${COMPANY.email}.` },
    tr: { name: "İletişim", summary: `Demo, ürün erişimi ve proje talepleri. E-posta: ${COMPANY.email}.` },
  },
  privacy: {
    en: { name: "Privacy policy", summary: "How ArvoOS processes personal data." },
    tr: { name: "Gizlilik politikası", summary: "ArvoOS'un kişisel verileri nasıl işlediği." },
  },
  "distance-sales": {
    en: { name: "Distance sales agreement", summary: "Terms for the online sale of ArvoOS subscriptions." },
    tr: { name: "Mesafeli satış sözleşmesi", summary: "ArvoOS aboneliklerinin internetten satışına ilişkin sözleşme." },
  },
  refund: {
    en: { name: "Cancellation and refund policy", summary: "How subscriptions are cancelled and refunded." },
    tr: { name: "İptal ve iade koşulları", summary: "Aboneliğin iptali ve iade koşulları." },
  },
  delivery: {
    en: { name: "Delivery and performance", summary: "When accounts open; the services are digital, no shipping." },
    tr: { name: "Teslimat ve hizmetin ifası", summary: "Hesabın ne zaman açıldığı; hizmet dijitaldir, kargo yoktur." },
  },
};

const url = (id: PageId, locale: LlmsLocale) => absoluteUrl(ROUTES[id][locale]);

/*
  Ücret satırları. Rakam ELLE YAZILMAZ: yapay zekâ motorlarının alıntıladığı
  metinde yanlış fiyat, sayfadaki yanlış fiyattan daha uzun yaşar.

  YAYIMLANMIŞ FİYAT (14.10.2026). Tutarlar eskiden doğrudan koddan
  okunuyordu: konsolda yayımlanan zam ücretler sayfasında görünüyor,
  llms-full.txt eski rakamı söylemeye devam ediyordu. Çağıran
  yayımlanmış tabloyu veriyor; verilmezse koddaki değer.
*/
function fiyatListesi(locale: LlmsLocale, fiyatlar?: Fiyatlar): string {
  const tr = locale === "tr";
  return SITE_PRODUCTS.map((product) => {
    const satirlar = planlar(product).map((plan) => {
      // Sayfanın para birimi: İngilizce metin USD, Türkçe metin TL (lib/site/doviz).
      const aylik = sayfaPlanTutari(plan, locale, fiyatlar);
      const yillik = sayfaPlanYillikTutari(plan, locale, fiyatlar);
      const birim = plan.kisiBasi ? (tr ? "kullanıcı/" : "user/") : "";
      const tutar = aylik === null || yillik === null
        ? (tr ? "teklif usulü" : "on request")
        : `${paraYaz(aylik, locale)}/${birim}${tr ? "ay" : "mo"} · ${paraYaz(yillik, locale)}/${birim}${tr ? "yıl" : "yr"}`;
      const enAz = plan.enAzKullanici
        ? tr ? ` (en az ${plan.enAzKullanici} kullanıcı)` : ` (from ${plan.enAzKullanici} users)`
        : "";
      return `- ${plan.ad[locale]}: ${tutar}${enAz}`;
    });
    return `### ${urunAdi(product)}\n${satirlar.join("\n")}`;
  }).join("\n\n") + (tr
    ? "\n\nYukarıdaki tutarlar Türkçe sayfadaki TL fiyatlarıdır. İngilizce sayfada fiyatlar ABD doları, Almanca, İspanyolca ve Fransızca sayfalarda avro cinsindendir; döviz fiyatları sabit listedir, kurla değişmez."
    : `\n\nThe amounts above are the US-dollar prices on the English page. The German, Spanish and French pages list prices in euros, and customers in Türkiye see prices in Turkish lira at ${absoluteUrl(ROUTES.pricing.tr)}. Foreign-currency prices are a fixed list, not converted at the exchange rate.`);
}

/** "- [ArvoOS](en-url): özet Türkçe: [ArvoOS](tr-url)" */
function item(id: PageId, extra = ""): string {
  const { en, tr } = PAGES[id];
  return `- [${en.name}](${url(id, "en")}): ${en.summary}${extra} Türkçe: [${tr.name}](${url(id, "tr")})`;
}

const SECTIONS: { title: string; ids: PageId[] }[] = [
  { title: "Products", ids: ["arvoos", "arvoos-modules", "arvoos-industries", "arvoos-solutions", "arvoos-plans", "arvolab", "randevu"] },
  { title: "Pricing", ids: ["pricing"] },
  { title: "Services", ids: ["services", "web-design", "seo-geo", "custom-software"] },
  { title: "Company", ids: ["home", "about"] },
  { title: "Contact", ids: ["contact"] },
  { title: "Optional", ids: ["privacy", "distance-sales", "refund", "delivery"] },
];

const SIGN_IN: Partial<Record<PageId, string>> = {
  arvoos: ` Sign in: ${PRODUCT_APPS.arvoos.url}.`,
  arvolab: ` Sign in: ${PRODUCT_APPS.arvolab.url}.`,
  randevu: ` Panel: ${PRODUCT_APPS.randevu.url}.`,
};

export function buildLlmsTxt(): string {
  // Her PageId bir bölümde yer almalı (yeni sayfa eklenirse Optional'a düşer).
  const listed = new Set(SECTIONS.flatMap((s) => s.ids));
  const missing = (Object.keys(ROUTES) as PageId[]).filter((id) => !listed.has(id));
  const sections = missing.length ? [...SECTIONS.slice(0, -1), { title: "Optional", ids: [...SECTIONS[SECTIONS.length - 1].ids, ...missing] }] : SECTIONS;

  const lines = [
    `# ${COMPANY.brand}`,
    "",
    `> ArvoOS is the software brand of ${COMPANY.legalName}, a technology company based in ${COMPANY.city}, Türkiye. It builds three products: ArvoOS, a multi-tenant business operating system that shares the brand's name and runs a service business from request to collection (CRM, proposals, e-signed contracts, operations, customer portal, finance, HR, reports); ArvoLab, a research workspace for academic work; and ArvoCal, an appointment system for salons. The brand also delivers services: website design (including e-commerce websites with their own management panel), SEO and GEO content optimization, and custom software. The website is available in six languages: English at ${absoluteUrl(ROUTES.home.en)}, Turkish at ${absoluteUrl(ROUTES.home.tr)}, German at ${absoluteUrl(ROUTES.home.de)}, Spanish at ${absoluteUrl(ROUTES.home.es)}, French at ${absoluteUrl(ROUTES.home.fr)} and Arabic at ${absoluteUrl(ROUTES.home.ar)}; this file and the knowledge base are in English and Turkish.`,
    "",
    "Key facts:",
    "",
    `- Company: ${COMPANY.legalName} (brand: ${COMPANY.brand}).`,
    `- Address: ${COMPANY.address.displayIntl}.`,
    `- Contact: ${COMPANY.email} (no public phone number).`,
    "- Website languages: English (en-US, default, at the site root), Turkish (tr-TR, under /tr), German (de-DE, under /de), Spanish (es-ES, under /es) and French (fr-FR, under /fr). This file and llms-full.txt are in English and Turkish only.",
    `- Each product is a web application on its own subdomain: ArvoOS at ${PRODUCT_APPS.arvoos.host}, ArvoLab at ${PRODUCT_APPS.arvolab.host}, ArvoCal at ${PRODUCT_APPS.randevu.host}.`,
    "- ArvoOS flagship flow: request → proposal (online acceptance) → contract (e-signature) → automatic job workflow → customer tracking portal → online collection → profitability report.",
    `- Prices are not published. Contact ${COMPANY.email}.`,
    `- A longer knowledge base (English and Turkish) is available at ${SITE_ORIGIN}/llms-full.txt.`,
    "",
  ];
  for (const section of sections) {
    lines.push(`## ${section.title}`, "");
    for (const id of section.ids) lines.push(item(id, SIGN_IN[id] ?? ""));
    if (section.title === "Company") {
      lines.push(`- Legal name and address: ${COMPANY.legalName}, ${COMPANY.address.displayIntl}. Email: ${COMPANY.email}.`);
    }
    if (section.title === "Optional") {
      lines.push(`- [Full knowledge base](${SITE_ORIGIN}/llms-full.txt): Detailed product descriptions and FAQ in English and Turkish.`);
      lines.push(`- [Sitemap](${SITE_ORIGIN}/sitemap.xml): All public pages with language alternates.`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildLlmsFullTxt(fiyatlar?: Fiyatlar): string {
  const u = (id: PageId, locale: LlmsLocale) => url(id, locale);
  const os = PRODUCT_APPS.arvoos;
  const lab = PRODUCT_APPS.arvolab;
  const rdv = PRODUCT_APPS.randevu;
  const mail = COMPANY.email;
  const address = `${COMPANY.address.displayIntl}`;

  return `# ArvoOS — knowledge base / bilgi tabanı

> Factual reference about the ArvoOS brand, its products (the ArvoOS business operating system, ArvoLab, ArvoCal) and services, written for AI assistants and answer engines. English first, Turkish below. Last updated: ${LLMS_UPDATED}. Canonical site: ${SITE_ORIGIN}. Short index: ${SITE_ORIGIN}/llms.txt.
>
> ArvoOS markası, ürünleri (ArvoOS işletme işletim sistemi, ArvoLab, ArvoCal) ve hizmetleri hakkında yapay zekâ asistanları ve yanıt motorları için hazırlanmış olgusal başvuru metni. Önce İngilizce, ardından Türkçe.

---

# English

## Overview

ArvoOS is the software brand of ${COMPANY.legalName}, a technology company based in ${COMPANY.city}, Türkiye. ArvoOS designs and builds software products for organizations, researchers and appointment-based businesses, and delivers digital services such as website design, SEO and GEO content optimization, and custom software.

- ArvoOS — business operating system for service businesses and institutions (${os.host}).
- ArvoLab — research workspace for academic work (${lab.host}).
- ArvoCal (formerly Arvo Randevu) — appointment system for hair and beauty salons (${rdv.host}).
- Services: website design and development (e-commerce websites are delivered with their own store management panel), SEO and GEO content optimization, custom software development, process and experience design, integrations and automation, corporate digital systems (panels, portals), ongoing development support.
- Website: ${u("home", "en")} (English), ${u("home", "tr")} (Turkish), ${absoluteUrl(ROUTES.home.de)} (German), ${absoluteUrl(ROUTES.home.es)} (Spanish), ${absoluteUrl(ROUTES.home.fr)} (French).
- Contact: ${mail}

## ArvoOS — business operating system

Page: ${u("arvoos", "en")} · Modules: ${u("arvoos-modules", "en")} · Sign in: ${os.url}

**What it is.** ArvoOS is a multi-tenant, web-based business operating system. It runs a service business from the first customer request to the final collection in one connected flow: CRM and sales, proposals, e-signed contracts, operations, a customer tracking portal, finance, HR, reports and team communication. Each organization works in its own isolated workspace, optionally on its own domain and with its own branding. The interface is in Turkish.

**Who it is for.** Service businesses and institutions that sell, deliver and collect across several people, teams or branches — for example healthcare institutions, education institutions, consulting and service firms, and multi-branch businesses.

**Flagship flow — from request to collection.** Request → proposal (the customer accepts online) → contract (electronic signature) → automatic job workflow → customer tracking portal → online collection via payment links → profitability report. Data entered once flows through every step.

### Features

1. **CRM & sales.** Requests with pipeline stages (lead → qualified → proposal → won / lost, with lost reasons). A new request automatically shows the customer's history. Customer lookup: instant, fuzzy search by phone or name across proposals, contracts and jobs. Sales rep assignment (required when a request is converted to a proposal). Sales calendar for appointments. Internal comments and record history.
2. **Proposals.** Revisions; VAT included, excluded or exempt; payment plans (single payment or instalments). Share links via WhatsApp and e-mail. The customer accepts or rejects online with one click; the decision is recorded with date-time, IP address and device. Expired proposals are archived automatically; accepted proposals are locked. A4 PDF output.
3. **Contracts.** Contract templates, including a detailed service contract under Turkish law (confidentiality, KVKK / personal data protection, right of withdrawal, payment clauses; consumer vs. merchant customers are handled automatically). Electronic acceptance and signature: drawn signature, consent statements, IP address, timestamp, device and a verification hash. Content is locked after signing. A4 PDF. A proposal converts to a contract in one step.
4. **Document centre.** A lifecycle timeline per customer deal (request → proposal → contract → operations → collection), document access logs, preview and PDF.
5. **Operations.** Overview of new, in-progress and due-soon jobs and customer messages; jobs table; stage board; job calendar; due dates; tasks and steps with progress percentage; assignees; archive; alerts for customer messages. Team workload: open jobs, overdue, due this week, open steps and unread messages per person, with unassigned jobs on their own row. Step templates per work type; the type can be changed after a job starts (completed tasks are kept). Signing a contract automatically starts the job workflow.
6. **Customer tracking portal.** Customers follow their job with a tracking code on a branded status page showing progress and stages, a payment summary and their proposal and contract documents, and can message the operations team. The team sees the customer's last portal visit, visit count and whether they are online. File delivery is gated by payment: unpaid customers cannot open or download deliverables and see a "pay now" link. Downloads use short-lived secure links.
7. **Finance.** Customer accounts (current accounts) and ledger entries; collections, refunds and extra services; instalment plans; online payment links per instalment; invoices; per-job cost items and real profitability.
8. **Human resources.** Staff and departments, e-mail invitations, roles, commission calculation with rate history, staff activity and session logs, e-signed staff confidentiality agreements (NDA) and staff documents.
9. **Reports.** Sales funnel and conversion with the weakest step flagged, sales and real profitability, six-month trends, lost reasons, print / PDF.
10. **Communication.** Team messaging (direct messages with attachments), a notification centre (real-time counter, categories, bulk-clear read items), push notifications to phone and desktop (enabled per device), management announcements and a support centre (tickets).
11. **Governance and security.** Role × module permission matrix and action-level capabilities; per-person exceptions; ready-made permission profiles (e.g. Operations Manager: sees and assigns every job, with CRM and finance closed); record-level access (sales reps see their own records); the organization owner cannot be locked out; row-level security in the database; audit history.
12. **Multi-tenant and branding.** Each organization has its own workspace; custom domain with DNS verification; branded login and customer-facing pages; logo, brand colour and stamp / signature; legal and bank details (tax ID / national ID and IBAN are validated) are used automatically in proposals and contracts; onboarding wizard; subscription / licence with bank-transfer payment notices.
13. **Experience.** Works like a mobile app (installable PWA, bottom tab bar, bottom sheets), dark and light themes, collapsible sidebar, instant feedback on actions, Turkish interface.

**Industries** (${u("arvoos-industries", "en")}): healthcare, education, consulting and services, multi-branch businesses; modules, screens and permissions are configured to each organization's way of working.

**Plans** (${u("arvoos-plans", "en")}): Starter and Business have published list prices (see Pricing below); Enterprise is scoped together with each organization based on modules, number of users, branch structure and workflows.

## Pricing

Page: ${u("pricing", "en")}

ArvoOS and ArvoCal are priced per organization, not per user — each plan includes a set number of users. ArvoLab is the exception: it is sold to individual researchers and priced per researcher; the Institution tier is a site licence offered only to universities and educational institutions, on request. All amounts are in Turkish lira and include VAT. On annual billing you pay for 10 months and use 12 (${YILLIK_BEDAVA_AY} months free), invoiced once at the start of the period.

${fiyatListesi("en", fiyatlar)}

Charged separately: additional user, additional branch (ArvoCal), data migration and setup, custom development.

Subscription terms: the card is never charged automatically — a payment link is sent for each period and the subscriber approves it. Cancellation takes effect at the end of the paid period. Price changes are announced at least 30 days in advance and apply from the next period only; the current period is unaffected. An upgrade takes effect the same day, charging only the remaining days; a downgrade applies at the end of the period. If an annual plan is cancelled early, the months used are recalculated at the monthly list price and the remaining balance is refunded. Full text: ${u("distance-sales", "en")} and ${u("refund", "en")}.

## ArvoLab — research workspace

Page: ${u("arvolab", "en")} · Sign in: ${lab.url}

**What it is.** ArvoLab is a web-based research workspace that brings the core steps of academic production into one place: from literature to writing, from document checks to analysis.

**Who it is for.** Individual researchers, academic teams and institutions.

**Core capabilities:**

- Literature and citations: organize sources and manage the literature and citation flow systematically.
- Academic writing: develop research texts with a sound structure and a consistent working order.
- Guideline checks: compare document structure and formatting requirements against guidelines faster.
- Analysis: organize quantitative and qualitative research processes in one workspace.
- Academic editor: include text review and improvement steps in the research flow.
- Originality pre-check: evaluate a text before submission to spot potential risks earlier. It is a pre-check; institutions may still require their own official originality reports.

**Access.** Request access via ${mail}; sign in at ${lab.url}.

## ArvoCal — appointment management for salons

Page: ${u("randevu", "en")} · Panel: ${rdv.url} · Pricing: ${u("pricing", "en")}

**What it is.** ArvoCal (formerly Arvo Randevu) is an appointment system for hair and beauty salons: an online booking page for customers, an appointment calendar, staff and service definitions, and customer records with history.

**Who it is for.** Hairdressers, beauty salons and care centres — both single-location salons and multi-branch businesses.

**How it works.** Cloud-based and used in a browser. Each salon works in its own space (multi-tenant). Working hours are defined in Türkiye local time. Double booking is prevented by the database itself, not only by the interface. Its prices are listed on the pricing page.

## How the products relate

ArvoOS, ArvoLab and ArvoCal are separate web applications, each on its own subdomain of arvo-os.com (${os.host}, ${lab.host}, ${rdv.host}), built by the same company under one brand and quality standard. ArvoOS runs a company's operations (CRM, proposals, contracts, jobs, finance, HR); ArvoLab supports academic research; ArvoCal runs a salon's appointment book.

## Services

Page: ${u("services", "en")}

- Website design and development (${u("web-design", "en")}): discovery and strategy, content architecture, UX/UI design, development (fast, accessible, SEO-ready, manageable), testing and launch, maintenance and growth.
- SEO and GEO content optimization (${u("seo-geo", "en")}): content editing and technical optimization so that search engines (SEO) and AI answer engines such as ChatGPT, Perplexity and Google AI Overviews (GEO) can understand, index and cite a website accurately. ArvoOS does not promise specific rankings.
- Custom software development (${u("custom-software", "en")}): software designed around an organization's real workflows — custom panels and portals, integrations and automation requests.
- Process and experience design: analysing scattered operations and turning them into simpler, measurable systems.
- Integrations and automation: connecting existing tools and reducing repetitive work.
- Corporate digital systems: panels, portals, customer areas and management screens.
- Ongoing development support: performance, security, content and experience improvements after launch.

## Company

- Legal name: ${COMPANY.legalName}
- Brand: ${COMPANY.brand}
- Address: ${address}
- Email: ${mail} (no public phone number)
- About: ${u("about", "en")}

## FAQ

**What is ArvoOS?**
ArvoOS is a web-based, multi-tenant business operating system; it shares its name with the brand. It connects CRM and sales, proposals, e-signed contracts, operations, a customer tracking portal, finance, HR, reports and team communication in one flow.

**How does ArvoOS take a job from request to collection?**
A request enters the CRM pipeline and is assigned to a sales rep; it becomes a proposal the customer accepts online; the proposal converts to a contract the customer signs electronically; signing automatically opens the job workflow; the customer follows progress in the tracking portal; instalments are collected online through payment links; the reports show conversion and real profitability.

**Does ArvoOS support electronic signatures?**
Yes. Customers accept contracts electronically with a drawn signature and consent statements; the IP address, timestamp, device and a verification hash are recorded and the content is locked after signing. Staff confidentiality agreements can also be e-signed.

**How do customers accept proposals in ArvoOS?**
The proposal is shared as a link via WhatsApp or e-mail; the customer accepts or rejects it online with one click, and the decision is recorded with date-time, IP and device.

**Can customers track their job and pay online?**
Yes. The customer tracking portal shows progress, stages, documents and a payment summary, lets customers message the operations team, and offers online payment links. Deliverable files stay locked until payment.

**How much does ArvoOS cost?**
Monthly and annual prices for the Starter and Business plans are published at ${u("pricing", "en")}. Pricing is per organization, not per user; Turkish-lira prices include VAT. For Enterprise, the fee is scoped per organization based on modules, users and branches. Contact ${mail}.

**Can ArvoOS run on our own domain with our branding?**
Yes. Organizations can connect a custom domain (verified via DNS) and use their logo, brand colour, stamp / signature and legal and bank details on login pages, customer pages, proposals and contracts.

**Is ArvoOS secure and permission-controlled?**
It uses a role × module permission matrix, record-level access (sales reps see their own records), row-level security in the database and audit history.

**Does ArvoOS work on mobile?**
Yes. It can be installed as a PWA and behaves like a mobile app, with a bottom tab bar and bottom sheets.

**Which industries is ArvoOS for?**
Healthcare institutions, education institutions, consulting and service firms, and multi-branch businesses.

**Where do I sign in to ArvoOS?**
${os.url}

**What is ArvoLab?**
ArvoLab is the ArvoOS brand's research workspace for literature and citation management, academic writing, guideline checks, quantitative and qualitative analysis, academic editing and an originality pre-check.

**How do I get access to ArvoLab?**
Request access at ${mail}. Sign in at ${lab.url}.

**Is ArvoOS a company or a product?**
ArvoOS is the brand of ${COMPANY.legalName} (arvo-os.com is its website) and also the name of its business operating system. ArvoLab and ArvoCal are its other products.

**Does ArvoOS build websites or custom software?**
Yes. ArvoOS's services include website design and development, SEO and GEO content optimization, custom software development (panels, portals, integrations and automation), process and experience design, and ongoing development support. See ${u("services", "en")}.

**Does ArvoOS offer SEO and GEO (AI search) optimization?**
Yes. ArvoOS edits content and improves the technical setup of websites so that search engines and AI answer engines such as ChatGPT, Perplexity and Google AI Overviews can understand and cite them. No specific rankings are promised. See ${u("seo-geo", "en")}.

**Where is ArvoOS based and how can I contact it?**
${address}. Email ${mail} or use ${u("contact", "en")}.

---

# Türkçe

## Genel bakış

ArvoOS, ${COMPANY.city} merkezli teknoloji şirketi ${COMPANY.legalName} bünyesindeki yazılım markasıdır. ArvoOS; kurumlar, araştırmacılar ve randevuyla çalışan işletmeler için yazılım ürünleri geliştirir, ayrıca web sitesi tasarımı, SEO ve GEO içerik düzenleme ve özel yazılım gibi dijital hizmetler sunar.

- ArvoOS — hizmet işletmeleri ve kurumlar için işletme işletim sistemi (${os.host}).
- ArvoLab — akademik çalışma için araştırma çalışma alanı (${lab.host}).
- ArvoCal (eski adıyla Arvo Randevu) — kuaför ve güzellik salonları için randevu sistemi (${rdv.host}).
- Hizmetler: web sitesi tasarımı ve yapımı (e-ticaret siteleri kendi mağaza yönetim paneliyle teslim edilir), SEO ve GEO içerik düzenleme, özel yazılım geliştirme, süreç ve deneyim tasarımı, entegrasyon ve otomasyon, kurumsal dijital sistemler (panel, portal), sürekli geliştirme desteği.
- Web sitesi: ${u("home", "tr")} (Türkçe), ${u("home", "en")} (İngilizce), ${absoluteUrl(ROUTES.home.de)} (Almanca), ${absoluteUrl(ROUTES.home.es)} (İspanyolca), ${absoluteUrl(ROUTES.home.fr)} (Fransızca).
- İletişim: ${mail}

## ArvoOS — işletme işletim sistemi

Sayfa: ${u("arvoos", "tr")} · Modüller: ${u("arvoos-modules", "tr")} · Giriş: ${os.url}

**Nedir?** ArvoOS, çok kiracılı ve web tabanlı bir işletme işletim sistemidir. Bir hizmet işletmesini ilk müşteri talebinden son tahsilata kadar tek bağlantılı akışta yönetir: CRM ve satış, teklifler, e-imzalı sözleşmeler, operasyon, müşteri takip portalı, finans, İK, raporlar ve ekip iletişimi. Her kurum kendi yalıtılmış çalışma alanında, isterse kendi alan adı ve markasıyla çalışır. Arayüz Türkçedir.

**Kimler için?** Satış, teslimat ve tahsilatı birden çok kişi, ekip veya şube üzerinden yürüten hizmet işletmeleri ve kurumlar — örneğin sağlık kurumları, eğitim kurumları, danışmanlık ve hizmet firmaları, çok şubeli işletmeler.

**Talepten tahsilata tek akış.** Talep → teklif (müşteri çevrim içi onaylar) → sözleşme (elektronik imza) → otomatik iş akışı → müşteri takip portalı → online tahsilat → kârlılık raporu. Bir kez girilen veri tüm adımlara taşınır.

### Özellikler

1. **CRM ve satış.** Satış hattı aşamalarıyla talepler (aday → nitelikli → teklif → kazanıldı / kaybedildi, kayıp nedenleriyle). Yeni talepte müşteri geçmişi otomatik gösterilir. Müşteri sorgulama: teklif, sözleşme ve işlerde telefon veya isimle anlık, esnek arama. Satış temsilcisi ataması (teklife dönüştürürken zorunlu). Randevular için satış takvimi. İç yorumlar ve kayıt geçmişi.
2. **Teklifler.** Revizyonlar; KDV dahil, hariç veya muaf; ödeme planı (tek ödeme veya taksit). WhatsApp ve e-posta ile paylaşım bağlantısı. Müşteri tek tıkla çevrim içi onaylar veya reddeder; karar tarih-saat, IP adresi ve cihaz bilgisiyle kaydedilir. Süresi dolan teklifler otomatik arşivlenir, onaylanan teklif kilitlenir. A4 PDF çıktı.
3. **Sözleşmeler.** Sözleşme şablonları; Türk hukukuna uygun ayrıntılı hizmet sözleşmesi (gizlilik, KVKK, cayma hakkı, ödeme maddeleri; tüketici ve tacir müşteri ayrımı otomatik). Elektronik onay ve imza: çizilen imza, onay beyanları, IP adresi, zaman damgası, cihaz ve doğrulama özeti (hash). İmzadan sonra içerik kilitlenir. A4 PDF. Teklif tek adımda sözleşmeye dönüşür.
4. **Belge merkezi.** Her iş için yaşam döngüsü zaman çizelgesi (talep → teklif → sözleşme → operasyon → tahsilat), belge erişim kayıtları, önizleme ve PDF.
5. **Operasyon.** Yeni, devam eden ve termini yaklaşan işler ile müşteri mesajlarının genel görünümü; iş tablosu; aşama panosu; iş takvimi; terminler; ilerleme yüzdesiyle görev ve adımlar; sorumlular; arşiv; müşteri mesajı uyarıları. Ekip yükü: kişi kişi açık iş, termini geçen, bu hafta teslim, açık adım ve yeni mesaj; sorumlusu olmayan işler ayrı satırda. Çalışma türüne göre adım şablonları; iş açıldıktan sonra da tür değiştirilebilir (tamamlanan görevler korunur). Sözleşme imzalanınca iş akışı otomatik başlar.
6. **Müşteri takip portalı.** Müşteri, takip koduyla markalı durum sayfasında ilerlemeyi ve aşamaları, ödeme özetini, teklif ve sözleşme belgelerini görür; operasyon ekibiyle mesajlaşır. Ekip, müşterinin portala son girişini, giriş sayısını ve o an çevrim içi olup olmadığını görür. Dosya teslimi ödemeye bağlıdır: ödeme yapmamış müşteri teslim dosyalarını açamaz veya indiremez, "şimdi öde" bağlantısı görür. İndirmeler kısa ömürlü güvenli bağlantılarla yapılır.
7. **Finans.** Cari hesaplar ve hesap hareketleri; tahsilat, iade ve ek hizmetler; taksit planları; taksit başına çevrim içi ödeme bağlantısı; faturalar; iş bazında maliyet kalemleri ve gerçek kârlılık.
8. **İnsan kaynakları.** Personel ve departmanlar, e-posta ile davet (ulaşmayan davet sebebiyle birlikte görünür), roller, oran geçmişiyle prim (komisyon) hesabı — prim ödemesi işlere dağıtılır, devam eden işler için erken (avans) ödeme yapılabilir —, personel etkinlik ve oturum kayıtları, e-imzalı personel gizlilik sözleşmesi (NDA) ve personel belgeleri.
9. **Raporlar.** En zayıf adımı işaretleyen satış hunisi ve dönüşüm, satış ve gerçek kârlılık, altı aylık eğilimler, kayıp nedenleri, yazdırma / PDF.
10. **İletişim.** Ekip içi mesajlaşma (dosya ekli birebir mesajlar), bildirim merkezi (anlık sayaç, kategoriler, okunanları toplu kaldırma), telefona ve masaüstüne anlık bildirim (cihaz başına açılır, kapatılır), yönetim duyuruları ve destek merkezi (talepler).
11. **Yetki ve güvenlik.** Rol × modül yetki matrisi ve işlem düzeyinde yetkiler; kişiye özel istisnalar; hazır yetki profilleri (ör. Operasyon Müdürü: bütün işleri görür ve atar, CRM ve finans kapalı); kayıt düzeyinde erişim (satış temsilcisi kendi kayıtlarını görür); kurum sahibi sistem dışında kalamaz; veritabanında satır düzeyinde güvenlik (RLS); denetim geçmişi.
12. **Çok kiracılı yapı ve markalama.** Her kurumun kendi çalışma alanı; DNS doğrulamalı özel alan adı; markalı giriş ve müşteri sayfaları; logo, marka rengi, sekme simgesi, kaşe / imza; teklif ve sözleşmelerin madde metinleri kurum tarafından düzenlenebilir; teklif ve sözleşmelerde otomatik kullanılan yasal ve banka bilgileri (VKN / TCKN ve IBAN doğrulanır); kurulum sihirbazı; havale / EFT ödeme bildirimli abonelik ve lisans.
13. **Deneyim.** Mobil uygulama gibi çalışır (yüklenebilir PWA, alt sekme çubuğu, alt paneller), koyu ve açık tema, daraltılabilir kenar çubuğu, işlemlerde anında geri bildirim, Türkçe arayüz.

**Sektörler** (${u("arvoos-industries", "tr")}): sağlık, eğitim, danışmanlık ve hizmet, çok şubeli işletmeler; modüller, ekranlar ve yetkiler kurumun çalışma biçimine göre yapılandırılır.

**Paketler** (${u("arvoos-plans", "tr")}): Başlangıç ve Kurumsal basamaklarının liste fiyatı yayımlanmıştır (aşağıdaki Ücretler bölümü); Özel kurum basamağı gerekli modüller, kullanıcı sayısı, şube yapısı ve iş akışlarına göre kurumla birlikte belirlenir.

## Ücretler

Sayfa: ${u("pricing", "tr")}

ArvoOS ve ArvoCal kurum başına fiyatlanır, kullanıcı başına değil — her pakette belirli sayıda kullanıcı dahildir. ArvoLab istisnadır: bireysel araştırmacıya satılır ve araştırmacı başına fiyatlanır; Kurum basamağı yalnızca üniversite ve eğitim kurumlarına, teklif usulüyle verilen site lisansıdır. Tutarlar Türk lirasıdır ve KDV dahildir. Yıllık ödemede 12 aylık kullanım için 10 aylık bedel ödenir (${YILLIK_BEDAVA_AY} ay bedava) ve tutar dönem başında tek seferde faturalanır.

${fiyatListesi("tr", fiyatlar)}

Ayrıca ücretlendirilen kalemler: ek kullanıcı, ek şube (ArvoCal), veri aktarımı ve kurulum, kuruma özel geliştirme.

Abonelik koşulları: karttan otomatik tahsilat yapılmaz — her dönem için ödeme bağlantısı gönderilir ve abone onaylar. İptal, ödenmiş dönemin sonunda yürürlüğe girer. Fiyat değişikliği en az 30 gün önce bildirilir ve yalnızca sonraki dönemde uygulanır; yürürlükteki dönem etkilenmez. Yükseltme aynı gün yürürlüğe girer ve yalnızca dönemin kalan günleri için fark alınır; düşürme dönem sonunda uygulanır. Yıllık abonelik erken iptal edilirse kullanılan aylar aylık liste fiyatı üzerinden hesaplanır ve kalan bakiye iade edilir. Tam metin: ${u("distance-sales", "tr")} ve ${u("refund", "tr")}.

## ArvoLab — araştırma çalışma alanı

Sayfa: ${u("arvolab", "tr")} · Giriş: ${lab.url}

**Nedir?** ArvoLab, literatürden akademik yazıma, belge kontrolünden analize kadar bilimsel üretimin temel adımlarını tek bir çalışma alanında birleştiren web tabanlı araştırma ortamıdır.

**Kimler için?** Bireysel araştırmacılar, akademik ekipler ve kurumlar.

**Temel yetenekler:**

- Literatür ve atıf: kaynakları düzenleme, literatür ve atıf akışını sistemli yönetme.
- Akademik yazım: araştırma metinlerini doğru yapı ve tutarlı bir çalışma düzeniyle geliştirme.
- Kılavuz kontrolü: belge yapısını ve biçimsel gereklilikleri kılavuzlarla daha hızlı karşılaştırma.
- Analiz merkezi: nicel ve nitel araştırma süreçlerini tek alanda organize etme.
- Akademik editör: metin kontrolü ve iyileştirme adımlarını araştırma akışına dahil etme.
- Özgünlük ön kontrolü: teslim öncesi olası riskleri daha erken fark etmek için metni değerlendirme. Bir ön kontroldür; kurumlar kendi resmî özgünlük raporlarını ayrıca isteyebilir.

**Erişim.** ${mail} adresinden erişim talep edin; giriş: ${lab.url}.

## ArvoCal — salonlar için randevu yönetimi

Sayfa: ${u("randevu", "tr")} · Panel: ${rdv.url} · Ücretler: ${u("pricing", "tr")}

**Nedir?** ArvoCal (eski adıyla Arvo Randevu), kuaför ve güzellik salonları için randevu sistemidir: müşteriye açık çevrim içi randevu sayfası, randevu takvimi, personel ve hizmet tanımları, geçmişiyle birlikte müşteri kaydı.

**Kimler için?** Kuaförler, güzellik salonları ve bakım merkezleri; tek şubeli salonlar ve çok şubeli işletmeler.

**Nasıl çalışır?** Bulut tabanlıdır, tarayıcıda çalışır. Her salon kendi çalışma alanında çalışır (çok kiracılı). Çalışma saatleri Türkiye saatiyle tanımlanır. Çakışan randevuyu arayüz değil veritabanının kendisi engeller. Fiyatları Ücretler sayfasında yayımlanır.

## Ürünler arasındaki ilişki

ArvoOS, ArvoLab ve ArvoCal; her biri arvo-os.com'un kendi alt alan adında (${os.host}, ${lab.host}, ${rdv.host}) çalışan ayrı web uygulamalarıdır ve aynı şirket tarafından ortak marka ve kalite standardıyla geliştirilir. ArvoOS bir şirketin operasyonunu (CRM, teklif, sözleşme, iş, finans, İK) yönetir; ArvoLab akademik araştırmayı destekler; ArvoCal bir salonun randevu defterini yönetir.

## Hizmetler

Sayfa: ${u("services", "tr")}

- Web sitesi tasarımı ve yapımı (${u("web-design", "tr")}): keşif ve strateji, içerik mimarisi, UX/UI tasarım, geliştirme (hızlı, erişilebilir, SEO temelli, yönetilebilir), test ve yayın, bakım ve büyüme.
- SEO ve GEO içerik düzenleme (${u("seo-geo", "tr")}): bir web sitesinin arama motorları (SEO) ve ChatGPT, Perplexity, Google AI Overviews gibi yapay zekâ yanıt motorları (GEO) tarafından doğru anlaşılması, dizine alınması ve alıntılanması için içerik düzenleme ve teknik optimizasyon. Belirli bir sıralama vaat edilmez.
- Özel yazılım geliştirme (${u("custom-software", "tr")}): kurumun gerçek iş akışlarına göre tasarlanan yazılım — kuruma özel panel ve portallar, entegrasyon ve otomasyon talepleri.
- Süreç ve deneyim tasarımı: dağınık operasyonları daha sade ve ölçülebilir sistemlere dönüştürme.
- Entegrasyon ve otomasyon: kullanılan araçları birbirine bağlama, tekrar eden işleri azaltma.
- Kurumsal dijital sistemler: panel, portal, müşteri alanı ve yönetim ekranları.
- Sürekli geliştirme desteği: yayın sonrası performans, güvenlik, içerik ve deneyim iyileştirmeleri.

## Şirket

- Ticari unvan: ${COMPANY.legalName}
- Marka: ${COMPANY.brand}
- Adres: ${address}
- E-posta: ${mail} (herkese açık telefon numarası yoktur)
- Hakkımızda: ${u("about", "tr")}

## Sık sorulan sorular

**ArvoOS nedir?**
ArvoOS, web tabanlı, çok kiracılı bir işletme işletim sistemidir; adını markayla paylaşır. CRM ve satış, teklif, e-imzalı sözleşme, operasyon, müşteri takip portalı, finans, İK, raporlar ve ekip iletişimini tek akışta birleştirir.

**ArvoOS bir işi talepten tahsilata nasıl götürür?**
Talep CRM satış hattına girer ve bir satış temsilcisine atanır; müşterinin çevrim içi onayladığı teklife dönüşür; teklif, müşterinin elektronik olarak imzaladığı sözleşmeye dönüşür; imza iş akışını otomatik başlatır; müşteri ilerlemeyi takip portalından izler; taksitler çevrim içi ödeme bağlantılarıyla tahsil edilir; raporlar dönüşümü ve gerçek kârlılığı gösterir.

**ArvoOS elektronik imzayı destekliyor mu?**
Evet. Müşteri sözleşmeyi çizilen imza ve onay beyanlarıyla elektronik olarak onaylar; IP adresi, zaman damgası, cihaz ve doğrulama özeti kaydedilir, imzadan sonra içerik kilitlenir. Personel gizlilik sözleşmeleri de e-imzayla onaylanabilir.

**Müşteri teklifi ArvoOS'ta nasıl onaylar?**
Teklif WhatsApp veya e-posta ile bağlantı olarak paylaşılır; müşteri tek tıkla çevrim içi onaylar ya da reddeder, karar tarih-saat, IP ve cihaz bilgisiyle kaydedilir.

**Müşteri işini takip edip çevrim içi ödeme yapabilir mi?**
Evet. Müşteri takip portalı ilerlemeyi, aşamaları, belgeleri ve ödeme özetini gösterir, operasyon ekibiyle mesajlaşmayı ve çevrim içi ödeme bağlantılarını sunar. Teslim dosyaları ödeme yapılana kadar kilitli kalır.

**ArvoOS'un fiyatı nedir?**
Başlangıç ve Kurumsal paketlerin aylık ve yıllık fiyatları ${u("pricing", "tr")} sayfasında yayımlanmıştır. Fiyat kurum başınadır, kullanıcı başına değil; KDV dahildir. Özel kurum basamağında bedel modül, kullanıcı ve şube yapısına göre kurumla birlikte belirlenir. İletişim: ${mail}.

**ArvoOS kendi alan adımızda ve markamızla çalışabilir mi?**
Evet. Kurum, DNS ile doğrulanan özel alan adını bağlayabilir; logo, marka rengi, kaşe / imza ile yasal ve banka bilgilerini giriş sayfalarında, müşteri sayfalarında, teklif ve sözleşmelerde kullanabilir.

**ArvoOS güvenli ve yetki kontrollü mü?**
Rol × modül yetki matrisi, kayıt düzeyinde erişim (satış temsilcisi kendi kayıtlarını görür), veritabanında satır düzeyinde güvenlik ve denetim geçmişi kullanır.

**ArvoOS mobilde çalışır mı?**
Evet. PWA olarak yüklenebilir; alt sekme çubuğu ve alt panellerle mobil uygulama gibi çalışır.

**ArvoOS hangi sektörler için uygun?**
Sağlık kurumları, eğitim kurumları, danışmanlık ve hizmet firmaları ile çok şubeli işletmeler.

**ArvoOS'a nereden giriş yapılır?**
${os.url}

**ArvoLab nedir?**
ArvoLab, ArvoOS markasının literatür ve atıf yönetimi, akademik yazım, kılavuz kontrolü, nicel ve nitel analiz, akademik editör ve özgünlük ön kontrolü sunan araştırma çalışma alanıdır.

**ArvoLab'e nasıl erişilir?**
${mail} adresinden erişim talep edin. Giriş: ${lab.url}.

**ArvoOS bir şirket mi, ürün mü?**
ArvoOS, ${COMPANY.legalName} şirketinin markasıdır (arvo-os.com da web sitesidir); aynı zamanda markanın işletme işletim sisteminin adıdır. Diğer ürünler ArvoLab ve ArvoCal'dır.

**ArvoOS web sitesi veya özel yazılım yapıyor mu?**
Evet. ArvoOS'un hizmetleri arasında web sitesi tasarımı ve yapımı, SEO ve GEO içerik düzenleme, özel yazılım geliştirme (panel, portal, entegrasyon ve otomasyon), süreç ve deneyim tasarımı ile sürekli geliştirme desteği bulunur. Bkz. ${u("services", "tr")}.

**ArvoOS SEO ve GEO (yapay zekâ araması) optimizasyonu yapıyor mu?**
Evet. ArvoOS, web sitelerinin arama motorları ve ChatGPT, Perplexity, Google AI Overviews gibi yapay zekâ yanıt motorları tarafından anlaşılması ve alıntılanması için içerik düzenler ve teknik altyapıyı iyileştirir. Belirli bir sıralama vaat edilmez. Bkz. ${u("seo-geo", "tr")}.

**ArvoOS nerede, nasıl iletişime geçilir?**
${address}. E-posta: ${mail} veya ${u("contact", "tr")}.
`;
}
