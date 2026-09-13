// ArvoLab araştırma çalışma alanı maketi (kaynaklar, belge, kılavuz kontrolü).
import type { Locale } from "@/lib/site/routes";

const T = {
  tr: {
    label: "ArvoLab çalışma alanı — örnek görünüm", cap: "Örnek arayüz",
    sources: "Kaynaklar", refs: ["Demir ve Kaya, 2023", "Yılmaz, 2022", "Aydın vd., 2021", "Şahin, 2020"],
    doc: "3. Yöntem", cite: "(Demir ve Kaya, 2023)",
    check: "Kılavuz kontrolü", checks: [["Başlık yapısı", "ok"], ["Kaynakça biçimi", "ok"], ["Tablo numaraları", "warn"], ["Özet uzunluğu", "ok"]],
    analysis: "Analiz",
  },
  en: {
    label: "ArvoLab workspace — sample view", cap: "Illustrative interface",
    sources: "Sources", refs: ["Demir & Kaya, 2023", "Yılmaz, 2022", "Aydın et al., 2021", "Şahin, 2020"],
    doc: "3. Method", cite: "(Demir & Kaya, 2023)",
    check: "Guideline check", checks: [["Heading structure", "ok"], ["Reference style", "ok"], ["Table numbering", "warn"], ["Abstract length", "ok"]],
    analysis: "Analysis",
  },
} as const;

export function LabMock({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <figure className="mock mock-lab" aria-label={t.label}>
      <div className="mock-win" aria-hidden="true">
        <div className="mock-chrome"><i /><i /><i /><span className="mock-url">lab.arvo-os.com</span></div>
        <div className="ml-body">
          <div className="ml-col ml-src">
            <p className="ml-h">{t.sources}</p>
            {t.refs.map((r, i) => <div key={r} className={`ml-ref${i === 0 ? " on" : ""}`}><i />{r}</div>)}
          </div>
          <div className="ml-col ml-doc">
            <p className="ml-title">{t.doc}</p>
            <span className="ml-line" style={{ width: "96%" }} /><span className="ml-line" style={{ width: "88%" }} />
            <span className="ml-line" style={{ width: "72%" }} /><span className="ml-cite">{t.cite}</span>
            <span className="ml-line" style={{ width: "92%" }} /><span className="ml-line" style={{ width: "64%" }} />
            <span className="ml-line" style={{ width: "84%" }} />
          </div>
          <div className="ml-col ml-side">
            <p className="ml-h">{t.check}</p>
            {t.checks.map(([c, s]) => <div key={c} className="ml-check" data-s={s}><i />{c}</div>)}
            <p className="ml-h" style={{ marginTop: 14 }}>{t.analysis}</p>
            <svg className="ml-chart" viewBox="0 0 120 48" preserveAspectRatio="none">
              <path d="M0 40 L20 32 L40 35 L60 22 L80 25 L100 12 L120 8" fill="none" stroke="#b28a49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M0 40 L20 32 L40 35 L60 22 L80 25 L100 12 L120 8 V48 H0Z" fill="url(#ml-g)" />
              <defs><linearGradient id="ml-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#dcc28c" stopOpacity=".45" /><stop offset="1" stopColor="#dcc28c" stopOpacity="0" /></linearGradient></defs>
            </svg>
          </div>
        </div>
      </div>
      <figcaption className="mock-cap">{t.cap}</figcaption>
    </figure>
  );
}
