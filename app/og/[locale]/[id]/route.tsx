import { ImageResponse } from "next/og";
import { LOCALES, ROUTES, type Locale, type PageId } from "@/lib/site/routes";
import { OG_COPY, OG_PRODUCT, ogCharset, type ProductName } from "@/lib/site/og-copy";

// Paylaşım görselleri: /og/{tr|en}/{PageId} — 1200×630 PNG.
// Türkçe karakterler (ş ğ ı İ ç ö ü) için Inter, Google Fonts'tan TTF alt
// kümesi olarak alınır ve bellekte önbelleğe alınır; ağ hatasında next/og'un
// gömülü Geist yazı tipine düşülür (o da Latin Extended kapsar).

type Fonts = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>;

const SIZE = { width: 1200, height: 630 };
const PRODUCTS: ProductName[] = ["ArvoOS", "ArvoLab", "Arc"];
const CHAMPAGNE = "#c9a66a";
// Eski bir Safari UA'sı: Google Fonts woff2 yerine (satori'nin okuyabildiği) TTF döndürür.
const LEGACY_UA = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-us) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

async function loadInter(weight: 400 | 600, text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`;
  const cssRes = await fetch(cssUrl, { headers: { "User-Agent": LEGACY_UA }, signal: AbortSignal.timeout(5000) });
  if (!cssRes.ok) throw new Error(`fonts css ${cssRes.status}`);
  const src = (await cssRes.text()).match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
  if (!src) throw new Error("font src not found");
  const fontRes = await fetch(src, { signal: AbortSignal.timeout(5000) });
  if (!fontRes.ok) throw new Error(`font ${fontRes.status}`);
  return fontRes.arrayBuffer();
}

let fontsPromise: Promise<Fonts | undefined> | null = null;
function getFonts(): Promise<Fonts | undefined> {
  if (!fontsPromise) {
    const text = ogCharset(["ARVO", "arvo-os.com/en", ...PRODUCTS]);
    fontsPromise = Promise.all([loadInter(400, text), loadInter(600, text)])
      .then(([regular, semibold]): Fonts => [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: semibold, weight: 600, style: "normal" },
      ])
      .catch((error: unknown) => {
        console.warn("[og] Inter yüklenemedi, varsayılan yazı tipine düşülüyor:", error);
        fontsPromise = null; // bir sonraki istekte yeniden dene
        return undefined;
      });
  }
  return fontsPromise;
}

const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);
const isPageId = (value: string): value is PageId => Object.prototype.hasOwnProperty.call(ROUTES, value);

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => (Object.keys(ROUTES) as PageId[]).map((id) => ({ locale, id })));
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isPageId(id)) return new Response("Not Found", { status: 404 });

  const copy = OG_COPY[id][locale];
  const product = OG_PRODUCT[id];
  const fonts = await getFonts();
  const titleSize = copy.title.length > 40 ? 62 : copy.title.length > 26 ? 72 : 88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px 56px",
          position: "relative",
          color: "#ffffff",
          ...(fonts ? { fontFamily: "Inter" } : {}),
          backgroundColor: "#050c1a",
          // Katmanlı zemin: sağ üstte şampanya ışıltısı, sol altta soğuk mavi
          // yansıma, altta gece mavisi geçiş. (Taşan mutlak konumlu daire
          // satori'de dikdörtgen kenar bırakıyordu.)
          backgroundImage: [
            "radial-gradient(circle at 86% 6%, rgba(201,166,106,0.34) 0%, rgba(201,166,106,0.12) 24%, rgba(201,166,106,0) 50%)",
            "radial-gradient(circle at 0% 100%, rgba(96,134,196,0.16) 0%, rgba(96,134,196,0) 42%)",
            "linear-gradient(135deg, #050c1a 0%, #0a172c 52%, #13243f 100%)",
          ].join(", "),
        }}
      >

        {/* üst şerit: wordmark + alan adı */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, border: "1.5px solid rgba(201,166,106,0.75)", background: "rgba(201,166,106,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 14, height: 14, background: CHAMPAGNE, transform: "rotate(45deg)", display: "flex" }} />
            </div>
            <div style={{ marginLeft: 18, fontSize: 30, fontWeight: 600, letterSpacing: 11, color: "#f3ead8" }}>ARVO</div>
          </div>
          <div style={{ fontSize: 22, color: "rgba(233,238,247,0.55)", letterSpacing: 0.5 }}>{locale === "en" ? "arvo-os.com/en" : "arvo-os.com"}</div>
        </div>

        {/* başlık bloğu */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 21, fontWeight: 600, letterSpacing: 4, color: CHAMPAGNE }}>
            <div style={{ width: 44, height: 2, background: CHAMPAGNE, marginRight: 18, display: "flex" }} />
            {copy.eyebrow}
          </div>
          <div style={{ marginTop: 26, fontSize: titleSize, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5, color: "#ffffff" }}>{copy.title}</div>
          <div style={{ marginTop: 26, fontSize: 29, lineHeight: 1.42, color: "rgba(233,238,247,0.74)", maxWidth: 940 }}>{copy.tagline}</div>
        </div>

        {/* alt şerit: ürün ailesi */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 24, borderTop: "1px solid rgba(201,166,106,0.28)", fontSize: 21 }}>
          <div style={{ display: "flex" }}>
            {PRODUCTS.map((name) => (
              <div key={name} style={{ display: "flex", marginRight: 34, color: name === product ? CHAMPAGNE : "rgba(233,238,247,0.5)", fontWeight: name === product ? 600 : 400 }}>{name}</div>
            ))}
          </div>
          <div style={{ display: "flex", color: "rgba(233,238,247,0.45)" }}>ArvoCulture Group · İstanbul</div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      // fonts: undefined verilirse next/og'un varsayılan yazı tipi de kaybolur.
      ...(fonts ? { fonts } : {}),
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800" },
    },
  );
}
