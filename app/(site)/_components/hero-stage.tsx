// Açılış sahnesi: eğik başlayıp kaydırdıkça düzleşen katmanlı arayüz.
// ArvoOS: panel + e-imza kartı + PWA müşteri portalı. ArvoLab: ana pencere +
// ürüne özgü yüzen kart. ArvoBook: günün takvimi + onaylanan randevu kartı.
// Hepsi "Örnek arayüz" olarak etiketlidir.
import type { Locale } from "@/lib/site/routes";
import { FloatCard, SignCard } from "./float-card";
import { BookMock } from "./mock-book";
import { LabMock } from "./mock-lab";
import { OsPanelMock } from "./mock-os";
import { PhoneFrame } from "./mock-phone";

const CARDS = {
  tr: {
    lab: { kicker: "Kılavuz kontrolü", status: "Hazır", title: "Tez taslağı · 3. bölüm", sub: "Son kontrol birkaç saniye önce", rows: [["Başlık yapısı", "ok"], ["Kaynakça biçimi", "ok"], ["Tablo numaraları", "warn"]] as [string, "ok" | "warn"][] },
  },
  en: {
    lab: { kicker: "Guideline check", status: "Ready", title: "Thesis draft · chapter 3", sub: "Last checked a few seconds ago", rows: [["Heading structure", "ok"], ["Reference style", "ok"], ["Table numbering", "warn"]] as [string, "ok" | "warn"][] },
  },
  de: {
    lab: { kicker: "Richtlinienprüfung", status: "Bereit", title: "Entwurf der Abschlussarbeit · Kapitel 3", sub: "Zuletzt vor wenigen Sekunden geprüft", rows: [["Gliederung", "ok"], ["Zitierstil", "ok"], ["Tabellennummerierung", "warn"]] as [string, "ok" | "warn"][] },
  },
  es: {
    lab: { kicker: "Revisión de la guía", status: "Listo", title: "Borrador de tesis · capítulo 3", sub: "Revisado hace unos segundos", rows: [["Estructura de títulos", "ok"], ["Estilo de referencias", "ok"], ["Numeración de tablas", "warn"]] as [string, "ok" | "warn"][] },
  },
  fr: {
    lab: { kicker: "Contrôle des consignes", status: "Prêt", title: "Brouillon de thèse · chapitre 3", sub: "Vérifié il y a quelques secondes", rows: [["Structure des titres", "ok"], ["Style des références", "ok"], ["Numérotation des tableaux", "warn"]] as [string, "ok" | "warn"][] },
  },
  ar: {
    lab: { kicker: "فحص الدليل", status: "جاهز", title: "مسودة الأطروحة · الفصل 3", sub: "آخر فحص قبل ثوانٍ", rows: [["بنية العناوين", "ok"], ["أسلوب المراجع", "ok"], ["ترقيم الجداول", "warn"]] as [string, "ok" | "warn"][] },
  },
} as const;

/** Onaylanan randevu kartı: ArvoBook sahnesi ve ana sayfadaki ArvoBook kutusu. */
export const BOOK_CARD = {
  tr: { kicker: "Yeni randevu", status: "Onaylandı", title: "Saç kesimi · Elif", sub: "Perşembe 14:30 · 45 dk", rows: [["Personel takvimi uygun", "ok"], ["Müşteriye bildirim hazır", "ok"]] as [string, "ok" | "warn"][] },
  en: { kicker: "New booking", status: "Confirmed", title: "Haircut · Emma", sub: "Thursday 2:30 pm · 45 min", rows: [["Stylist calendar free", "ok"], ["Customer notice ready", "ok"]] as [string, "ok" | "warn"][] },
  de: { kicker: "Neuer Termin", status: "Bestätigt", title: "Haarschnitt · Lena", sub: "Donnerstag 14:30 · 45 Min.", rows: [["Kalender der Mitarbeiterin frei", "ok"], ["Kundenbenachrichtigung bereit", "ok"]] as [string, "ok" | "warn"][] },
  es: { kicker: "Nueva cita", status: "Confirmada", title: "Corte de pelo · Lucía", sub: "Jueves 14:30 · 45 min", rows: [["Agenda de la estilista libre", "ok"], ["Aviso al cliente listo", "ok"]] as [string, "ok" | "warn"][] },
  fr: { kicker: "Nouveau rendez-vous", status: "Confirmé", title: "Coupe · Camille", sub: "Jeudi 14 h 30 · 45 min", rows: [["Agenda de la coiffeuse libre", "ok"], ["Notification client prête", "ok"]] as [string, "ok" | "warn"][] },
  ar: { kicker: "حجز جديد", status: "مؤكَّد", title: "قص الشعر · ليلى", sub: "الخميس 14:30 · 45 دقيقة", rows: [["تقويم المصففة متاح", "ok"], ["إشعار العميل جاهز", "ok"]] as [string, "ok" | "warn"][] },
} as const;

export function HeroStage({ locale, product = "arvoos" }: { locale: Locale; product?: "arvoos" | "arvolab" | "randevu" }) {
  const c = CARDS[locale];
  return (
    <div className="hero-stage">
      <div className="tilt">
        <div className="layers" data-product={product}>
          <div className="layer-main">
            {product === "arvoos" ? <OsPanelMock locale={locale} /> : product === "randevu" ? <BookMock locale={locale} /> : <LabMock locale={locale} />}
          </div>
          {product === "arvoos" ? (
            <>
              <div className="layer-float layer-sign"><div className="bob"><SignCard locale={locale} /></div></div>
              <div className="layer-float layer-phone"><div className="bob bob-b"><PhoneFrame locale={locale} /></div></div>
            </>
          ) : (
            <div className="layer-float layer-card"><div className="bob"><FloatCard {...(product === "randevu" ? BOOK_CARD[locale] : c.lab)} /></div></div>
          )}
        </div>
      </div>
    </div>
  );
}
