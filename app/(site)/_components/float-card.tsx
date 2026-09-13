// Sahnede ana pencerenin üzerinde yüzen kartlar (gösterim amaçlı veri).
import type { Locale } from "@/lib/site/routes";

const SIGN = {
  tr: { kicker: "Sözleşme · e-imza", status: "İmzalandı", title: "Hizmet sözleşmesi", party: "Kuzey Klinik · 13.09.2026 14:32", meta: ["Zaman damgası", "IP ve cihaz kaydı", "Doğrulama özeti"] },
  en: { kicker: "Contract · e-signature", status: "Signed", title: "Service agreement", party: "Northside Clinic · 13 Sep 2026, 14:32", meta: ["Timestamp", "IP & device record", "Verification hash"] },
} as const;

/** E-imza kartı: çizilen imza bir kez "yazılır". */
export function SignCard({ locale }: { locale: Locale }) {
  const t = SIGN[locale];
  return (
    <div className="fc" aria-hidden="true">
      <div className="fc-head"><span className="fc-kicker">{t.kicker}</span><span className="mo-pill" data-tone="success">{t.status}</span></div>
      <p className="fc-title">{t.title}</p>
      <p className="fc-sub">{t.party}</p>
      <svg className="fc-signature" viewBox="0 0 220 56" width="220" height="56">
        <path d="M6 40C20 8 32 10 34 32s22 20 34-4 26-18 32 6 18 14 28-6 20-10 24 8 20 8 32-10 18-6 22 4" fill="none" stroke="#0b1b2e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="fc-rule" />
      <ul className="fc-meta">{t.meta.map((m) => <li key={m}><i />{m}</li>)}</ul>
    </div>
  );
}

/** Genel yüzen kart: başlık, alt satır ve durum satırları. */
export function FloatCard({ kicker, status, tone = "success", title, sub, rows }: {
  kicker: string; status?: string; tone?: string; title: string; sub?: string; rows: [string, "ok" | "warn"][];
}) {
  return (
    <div className="fc" aria-hidden="true">
      <div className="fc-head"><span className="fc-kicker">{kicker}</span>{status ? <span className="mo-pill" data-tone={tone}>{status}</span> : null}</div>
      <p className="fc-title">{title}</p>
      {sub ? <p className="fc-sub">{sub}</p> : null}
      <div className="fc-rule" style={{ marginTop: 10 }} />
      <ul className="fc-meta">{rows.map(([r, s]) => <li key={r}><i data-s={s} />{r}</li>)}</ul>
    </div>
  );
}
