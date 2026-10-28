// ArvoBook randevu takvimi maketi (28.10.2026): günün personel personel
// takvimi, randevular ve bir izin bloğu. Yalnızca ürünün GERÇEKTEN yaptığı
// şeyler çiziliyor (personel bazlı takvim, hizmet süresi, izin); "Örnek
// arayüz" olarak etiketli. Personel adları yüzen karttaki müşteri adıyla
// (BOOK_CARD) çakışmasın diye ayrı seçildi. Eskiden ArvoBook sayfasında sahne yoktu ve açılış
// öteki ürün sayfalarından farklı (ortalı, görselsiz) duruyordu.
import type { Locale } from "@/lib/site/routes";

type Randevu = { kisi: number; bas: number; sure: number; ad: string; hizmet: string; ton: "gold" | "navy" | "green" };
type Metin = { label: string; cap: string; gun: string; bugun: string; personel: [string, string, string]; izin: string; randevular: Randevu[]; saatler: string[] };

const SAATLER = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
// Randevu yerleşimi dilden bağımsız: başlangıç ve süre yarım saat biriminde (0 = 10:00).
const YER: Omit<Randevu, "ad" | "hizmet">[] = [
  { kisi: 0, bas: 0, sure: 2, ton: "gold" }, { kisi: 0, bas: 3, sure: 3, ton: "navy" }, { kisi: 0, bas: 8, sure: 2, ton: "green" },
  { kisi: 1, bas: 1, sure: 3, ton: "navy" }, { kisi: 1, bas: 9, sure: 2, ton: "gold" },
  { kisi: 2, bas: 0, sure: 2, ton: "green" }, { kisi: 2, bas: 2, sure: 2, ton: "gold" }, { kisi: 2, bas: 7, sure: 3, ton: "navy" },
];
const yerlestir = (adlar: [string, string][]): Randevu[] => YER.map((y, i) => ({ ...y, ad: adlar[i][0], hizmet: adlar[i][1] }));

const T: Record<Locale, Metin> = {
  tr: { label: "ArvoBook randevu takvimi — örnek görünüm", cap: "Örnek arayüz", gun: "Perşembe", bugun: "Bugün", personel: ["Merve", "Mert", "Selin"], izin: "İzin", saatler: SAATLER,
    randevular: yerlestir([["Ayşe K.", "Kesim"], ["Zeynep A.", "Boya"], ["Deniz Y.", "Fön"], ["Can T.", "Sakal ve kesim"], ["Ece S.", "Kesim"], ["Ali V.", "Sakal"], ["Buse O.", "Manikür"], ["Gizem E.", "Bakım"]]) },
  en: { label: "ArvoBook appointment calendar — sample view", cap: "Illustrative interface", gun: "Thursday", bugun: "Today", personel: ["Isla", "Noah", "Olivia"], izin: "Time off", saatler: ["10 am", "11 am", "12 pm", "1 pm", "2 pm", "3 pm", "4 pm"],
    randevular: yerlestir([["Sophie L.", "Haircut"], ["Grace M.", "Colour"], ["Ava R.", "Blow-dry"], ["James T.", "Beard & cut"], ["Mia S.", "Haircut"], ["Leo W.", "Beard trim"], ["Chloe P.", "Manicure"], ["Ella K.", "Treatment"]]) },
  de: { label: "ArvoBook-Terminkalender — Beispielansicht", cap: "Beispieloberfläche", gun: "Donnerstag", bugun: "Heute", personel: ["Julia", "Jonas", "Mia"], izin: "Frei", saatler: SAATLER,
    randevular: yerlestir([["Anna K.", "Schnitt"], ["Laura M.", "Färben"], ["Sophie R.", "Föhnen"], ["Paul T.", "Bart & Schnitt"], ["Lea S.", "Schnitt"], ["Max W.", "Bart"], ["Emma P.", "Maniküre"], ["Marie B.", "Pflege"]]) },
  es: { label: "Agenda de citas de ArvoBook — vista de ejemplo", cap: "Interfaz ilustrativa", gun: "Jueves", bugun: "Hoy", personel: ["Valeria", "Pablo", "Sofía"], izin: "Libre", saatler: SAATLER,
    randevular: yerlestir([["Carmen L.", "Corte"], ["Elena M.", "Color"], ["Marta R.", "Secado"], ["Javier T.", "Barba y corte"], ["Paula S.", "Corte"], ["Diego V.", "Barba"], ["Sara P.", "Manicura"], ["Irene G.", "Tratamiento"]]) },
  fr: { label: "Agenda de rendez-vous ArvoBook — vue d’exemple", cap: "Interface illustrative", gun: "Jeudi", bugun: "Aujourd’hui", personel: ["Clara", "Hugo", "Léa"], izin: "Absence", saatler: ["10 h", "11 h", "12 h", "13 h", "14 h", "15 h", "16 h"],
    randevular: yerlestir([["Julie L.", "Coupe"], ["Manon M.", "Couleur"], ["Inès R.", "Brushing"], ["Lucas T.", "Barbe et coupe"], ["Chloé S.", "Coupe"], ["Louis V.", "Barbe"], ["Emma P.", "Manucure"], ["Zoé B.", "Soin"]]) },
  ar: { label: "تقويم مواعيد ArvoBook — عرض توضيحي", cap: "واجهة توضيحية", gun: "الخميس", bugun: "اليوم", personel: ["فاطمة", "عمر", "سارة"], izin: "إجازة", saatler: SAATLER,
    randevular: yerlestir([["نور ح.", "قص"], ["ريم م.", "صبغة"], ["هدى ر.", "تجفيف"], ["خالد ت.", "لحية وقص"], ["مريم س.", "قص"], ["يوسف و.", "لحية"], ["دانة ب.", "مانيكير"], ["لينا ك.", "عناية"]]) },
};

export function BookMock({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <figure className="mock mock-book" aria-label={t.label}>
      <div className="mock-win" aria-hidden="true">
        <div className="mock-chrome"><i /><i /><i /><span className="mock-url">randevu.arvo-os.com</span></div>
        <div className="mb-head">
          <span className="mb-day">{t.gun}</span><span className="mb-today">{t.bugun}</span>
        </div>
        <div className="mb-grid" style={{ ["--satir" as string]: SAATLER.length * 2 }}>
          <div className="mb-times">{t.saatler.map((s) => <span key={s}>{s}</span>)}</div>
          {t.personel.map((p, k) => (
            <div key={p} className="mb-col">
              <p className="mb-staff"><i>{p.slice(0, 1)}</i>{p}</p>
              <div className="mb-slots">
                {t.randevular.filter((r) => r.kisi === k).map((r) => (
                  <div key={r.ad} className="mb-appt" data-ton={r.ton} style={{ ["--bas" as string]: r.bas, ["--sure" as string]: r.sure }}>
                    <b>{r.ad}</b><span>{r.hizmet}</span>
                  </div>
                ))}
                {k === 1 ? <div className="mb-off" style={{ ["--bas" as string]: 5, ["--sure" as string]: 3 }}>{t.izin}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mock-cap">{t.cap}</figcaption>
    </figure>
  );
}
