/*
  KONSOLUN DESTEK KUYRUĞU (02.11.2026) — saf kurallar. Ekran
  app/panel/platform/destek, testi tests/unit/destek-kuyrugu.test.ts.

  Eskiden müşterinin açtığı destek talebi konsolun hiçbir yerinde
  görünmüyordu: ne dock'ta bir uygulama ne "Bugünün işleri"nde bir
  satır vardı. Talep yalnızca kiracı panelinin Destek sayfasında
  listeleniyordu ve kurucu oraya ancak bildirim zilinden düşüyordu.

  "Kimde top" durumu DEĞİŞTİRİLMEDEN okunuyor: veritabanı mesaj
  eklenince durumu kendisi çeviriyor (private.touch_support_ticket —
  ekip yanıtlayınca waiting_customer, müşteri yazınca kapalı talep
  yeniden open). Kuyruk bu durumdan türetiliyor; ayrı bir "son mesajı
  kim yazdı" sorgusu, aynı bilgiyi iki yerde tutmak olurdu.
*/

export type DestekDurumu = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type KuyrukHali = "yanit" | "musteri" | "kapandi";

export const DURUM_ADI: Record<string, string> = {
  open: "Açık", in_progress: "İşlemde", waiting_customer: "Müşteri bekleniyor", resolved: "Çözüldü", closed: "Kapalı",
};
export const ONCELIK_ADI: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
export const KATEGORI_ADI: Record<string, string> = { general: "Genel", technical: "Teknik", billing: "Faturalama", feature: "Özellik talebi" };

/** Konsolun sekmeleri; anahtar adresteki ?durum= değeri. */
export const KUYRUK_SEKMELERI: { anahtar: KuyrukHali | "tumu"; ad: string; durumlar: DestekDurumu[] | null }[] = [
  { anahtar: "yanit", ad: "Yanıt bekleyen", durumlar: ["open", "in_progress"] },
  { anahtar: "musteri", ad: "Müşteri bekleniyor", durumlar: ["waiting_customer"] },
  { anahtar: "kapandi", ad: "Kapananlar", durumlar: ["resolved", "closed"] },
  { anahtar: "tumu", ad: "Tümü", durumlar: null },
];

/** Dock rozeti ve "Bugünün işleri": sırası bizde olan talepler. */
export const YANIT_BEKLEYEN_DURUMLAR: DestekDurumu[] = ["open", "in_progress"];

export function kuyrukHali(durum: string): KuyrukHali {
  if (durum === "waiting_customer") return "musteri";
  if (durum === "resolved" || durum === "closed") return "kapandi";
  return "yanit";
}

const ONCELIK_SIRASI: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * Yanıt bekleyenler önce ACİLİYETE, sonra EN UZUN BEKLEYENE göre:
 * en yeni mesaj başta olsaydı dün akşamdan beri bekleyen talep her yeni
 * talebin altına itilirdi. Diğer sekmelerde son hareket başta.
 */
export function kuyrukSirala<T extends { status: string; priority: string; last_message_at: string }>(talepler: T[]): T[] {
  return [...talepler].sort((a, b) => {
    const ay = kuyrukHali(a.status) === "yanit";
    const by = kuyrukHali(b.status) === "yanit";
    if (ay !== by) return ay ? -1 : 1;
    if (ay && by) {
      const fark = (ONCELIK_SIRASI[a.priority] ?? 2) - (ONCELIK_SIRASI[b.priority] ?? 2);
      return fark || a.last_message_at.localeCompare(b.last_message_at);
    }
    return b.last_message_at.localeCompare(a.last_message_at);
  });
}

/** "12 dk", "5 saat", "3 gün": talebin ne kadardır beklediği. */
export function beklemeSuresi(sonMesaj: string, simdi: Date): string {
  const dakika = Math.max(0, Math.floor((simdi.getTime() - Date.parse(sonMesaj)) / 60_000));
  if (dakika < 60) return `${dakika} dk`;
  const saat = Math.floor(dakika / 60);
  if (saat < 24) return `${saat} saat`;
  return `${Math.floor(saat / 24)} gün`;
}

/** Bir iş günü (24 saat) yanıtsız kalan talep geç kalmış sayılır; rozet kırmızı. */
export const GECIKME_SAATI = 24;
export const gecikmisMi = (sonMesaj: string, simdi: Date) => simdi.getTime() - Date.parse(sonMesaj) >= GECIKME_SAATI * 3_600_000;

/*
  YANIT HIZI (02.11.2026): talep açıldıktan sonra ekibin İLK yanıtına
  kadar geçen süre. Müşteriye ne kadar hızlı dönüldüğü hiçbir ekranda
  görünmüyordu. Ortalama yerine MEDYAN: bir hafta yanıtsız kalmış tek
  talep ortalamayı anlamsız kılar, tipik deneyimi saklardı. Henüz
  yanıtlanmamış talepler süreye girmiyor ama sayılıyor ("yanıtsız"); 24
  saat oranının paydasında da varlar — yanıtsız kalan talep 24 saatte
  yanıtlanmamış bir taleptir, yok sayılırsa oran olduğundan iyi görünür.
*/
export type YanitHizi = { talep: number; yanitlanan: number; yanitsiz: number; medyanDakika: number | null; gunIcindeOran: number | null };

export function yanitHizi(talepler: { id: string; created_at: string }[], mesajlar: { ticket_id: string; is_staff: boolean; created_at: string }[], simdi: Date): YanitHizi {
  const ilkYanit = new Map<string, string>();
  for (const m of mesajlar) {
    if (!m.is_staff) continue;
    const onceki = ilkYanit.get(m.ticket_id);
    if (!onceki || m.created_at < onceki) ilkYanit.set(m.ticket_id, m.created_at);
  }
  const sureler: number[] = [];
  let gunIcinde = 0;
  let yanitsiz = 0;
  let olculebilen = 0;
  for (const t of talepler) {
    const yanit = ilkYanit.get(t.id);
    const acilis = Date.parse(t.created_at);
    if (yanit) {
      const dakika = Math.max(0, Math.round((Date.parse(yanit) - acilis) / 60_000));
      sureler.push(dakika);
      if (dakika <= GECIKME_SAATI * 60) gunIcinde += 1;
      olculebilen += 1;
    } else {
      yanitsiz += 1;
      /* Henüz 24 saati dolmamış yanıtsız talep orana girmiyor: daha başarısız sayılamaz. */
      if (simdi.getTime() - acilis >= GECIKME_SAATI * 3_600_000) olculebilen += 1;
    }
  }
  sureler.sort((a, b) => a - b);
  const orta = sureler.length ? (sureler.length % 2 ? sureler[(sureler.length - 1) / 2] : Math.round((sureler[sureler.length / 2 - 1] + sureler[sureler.length / 2]) / 2)) : null;
  return { talep: talepler.length, yanitlanan: sureler.length, yanitsiz, medyanDakika: orta, gunIcindeOran: olculebilen ? Math.round((gunIcinde / olculebilen) * 100) : null };
}

/** "45 dk", "3 sa 20 dk", "2 gün 4 sa". */
export function sureYazisi(dakika: number): string {
  if (dakika < 60) return `${dakika} dk`;
  const saat = Math.floor(dakika / 60);
  if (saat < 24) return dakika % 60 ? `${saat} sa ${dakika % 60} dk` : `${saat} sa`;
  return saat % 24 ? `${Math.floor(saat / 24)} gün ${saat % 24} sa` : `${Math.floor(saat / 24)} gün`;
}
