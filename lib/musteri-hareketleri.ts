/*
  MÜŞTERİ KARTININ HAREKETLERİ (29.10.2026).

  Kurucu bir müşteri hakkında "ne oldu, hangi sırayla" sorusunu
  soruyordu ve cevap dört ayrı yerdeydi: ödemeler Ödemeler sekmesinde,
  proformalar aynı sekmenin alt kartında, kurulum adımları Kurulum
  sekmesinde, konsolun yaptığı erişim değişiklikleri Sistem Ayarları'nın
  işlem kaydında (o da bütün kurumlar karışık). "Proformayı kestim, ödeme
  geldi mi, lisans açıldı mı" sırasını görmek için üç ekranı yan yana
  okumak gerekiyordu.

  Bu modül o kayıtları TEK zaman çizelgesine çeviriyor. Saf: okuma
  sayfada yapılıyor, burada yalnızca hangi satırın hangi olayı ürettiği
  ve sıralama var — birim testi kuralı sabitliyor.

  02.11.2026: destek talepleri ve kurucunun müşteri notları da çizelgede
  ("ödeme gecikti → aradım, not düştüm → talep açtı → ödedi" sırası).

  Bir kayıt birden çok olay üretebilir: havale bildirimi geldiği an bir
  olay, kararı verildiği an ayrı bir olay. İkisi arasındaki süre kurucunun
  bilmek istediği şeyin kendisi ("dekont iki gündür bekliyor").
*/

import { konsolKaydiCumlesi } from "./konsol-degisiklik";

export type HareketTuru = "odeme" | "proforma" | "fatura" | "kurulum" | "konsol" | "destek" | "not";
export type HareketTonu = "success" | "warning" | "danger" | "info" | "neutral";

export type Hareket = {
  anahtar: string;
  zaman: string;
  tur: HareketTuru;
  olay: string;
  ayrinti: string | null;
  /** Kuruş; para olmayan olayda null. */
  tutar: number | null;
  paraBirimi: string;
  ton: HareketTonu;
  /** Satırın açacağı kayıt (yalnızca kendi sayfası olan proforma). */
  proformaId: string | null;
  /** Kendi sayfası olan destek talebinin kimliği. */
  destekId: string | null;
};

export const HAREKET_TURU_ADI: Record<HareketTuru, string> = {
  odeme: "Ödeme", proforma: "Proforma", fatura: "Fatura", kurulum: "Kurulum", konsol: "Konsol", destek: "Destek", not: "Not",
};

export type HareketGirdisi = {
  kayitAcildi: string | null;
  odemeler: {
    id: string; amount: number; currency: string | null; status: string; product: string | null;
    payment_method: string | null; created_at: string; reviewed_at: string | null; review_note: string | null;
  }[];
  proformalar: {
    id: string; proforma_no: string; durum: string; toplam: number; para_birimi: string | null; product: string | null;
    created_at: string; odendi_at: string | null; updated_at: string | null;
  }[];
  faturalar: { id: string; fatura_no: string; fatura_tarihi: string | null; created_at: string; payment_request_id: string | null }[];
  kurulum: { id: string | number; action: string; state: string | null; result: string | null; created_at: string }[];
  konsol: { id: string | number; action: string; entity_type: string; metadata: Record<string, unknown> | null; created_at: string }[];
  /** Verilmezse çizelgede yok (eski çağıranlar ve testler). */
  destek?: { id: string; subject: string; priority: string; status: string; created_at: string; resolved_at: string | null }[];
  notlar?: { id: string; metin: string; takip_tarihi: string | null; tamamlandi_at: string | null; olusturuldu: string }[];
  /** Ad haritaları çağırandan: ekranın geri kalanı aynı adları yazıyor. */
  urunAdi: (kod: string) => string;
  kurulumIslemi: (kod: string) => string;
  kurulumAsamasi: (kod: string) => string;
};

const ODEME_YOLU: Record<string, string> = { bank_transfer: "Havale", paytr: "Kart (PayTR)", garanti: "Kart (Garanti)" };
const KARTLA = new Set(["paytr", "garanti"]);

export function musteriHareketleri(g: HareketGirdisi): Hareket[] {
  const liste: Hareket[] = [];
  const ekle = (h: Omit<Hareket, "paraBirimi" | "proformaId" | "destekId"> & { paraBirimi?: string | null; proformaId?: string | null; destekId?: string | null }) =>
    liste.push({ ...h, paraBirimi: h.paraBirimi || "TRY", proformaId: h.proformaId ?? null, destekId: h.destekId ?? null });

  if (g.kayitAcildi) ekle({ anahtar: "kayit", zaman: g.kayitAcildi, tur: "kurulum", olay: "Müşteri kaydı açıldı", ayrinti: null, tutar: null, ton: "info" });

  for (const o of g.odemeler) {
    const urun = g.urunAdi(o.product ?? "arvoos");
    const yol = ODEME_YOLU[o.payment_method ?? ""] ?? o.payment_method ?? null;
    const tutar = Number(o.amount);
    /*
      Kartla ödeme tek olay: bildirim ile karar aynı anda (sağlayıcı
      onayladığında) yazılıyor. İki satır göstermek "bildirildi, sonra
      onaylandı" diye ikinci bir insan kararı varmış gibi okunurdu.
    */
    if (KARTLA.has(o.payment_method ?? "")) {
      ekle({
        anahtar: `odeme-${o.id}`, zaman: o.reviewed_at ?? o.created_at, tur: "odeme",
        olay: o.status === "approved" ? "Kartla ödendi" : o.status === "rejected" ? "Kart ödemesi reddedildi" : "Kart ödemesi başladı",
        ayrinti: [urun, yol].filter(Boolean).join(" · "), tutar, paraBirimi: o.currency,
        ton: o.status === "approved" ? "success" : o.status === "rejected" ? "danger" : "warning",
      });
      continue;
    }
    ekle({
      anahtar: `odeme-${o.id}-bildirim`, zaman: o.created_at, tur: "odeme", olay: "Ödeme bildirildi",
      ayrinti: [urun, yol].filter(Boolean).join(" · "), tutar, paraBirimi: o.currency,
      ton: o.status === "pending" ? "warning" : "neutral",
    });
    if (o.reviewed_at && o.status !== "pending") {
      ekle({
        anahtar: `odeme-${o.id}-karar`, zaman: o.reviewed_at, tur: "odeme",
        olay: o.status === "approved" ? "Ödeme onaylandı" : o.status === "rejected" ? "Ödeme reddedildi" : "Ödeme iptal edildi",
        ayrinti: [urun, o.review_note].filter(Boolean).join(" · "), tutar, paraBirimi: o.currency,
        ton: o.status === "approved" ? "success" : o.status === "rejected" ? "danger" : "neutral",
      });
    }
  }

  for (const p of g.proformalar) {
    const urun = g.urunAdi(p.product ?? "arvoos");
    const ortak = { tur: "proforma" as const, tutar: Number(p.toplam), paraBirimi: p.para_birimi, proformaId: p.id };
    ekle({ ...ortak, anahtar: `proforma-${p.id}`, zaman: p.created_at, olay: "Proforma kesildi", ayrinti: `${p.proforma_no} · ${urun}`, ton: "info" });
    if (p.durum === "odendi" && p.odendi_at) {
      ekle({ ...ortak, anahtar: `proforma-${p.id}-odendi`, zaman: p.odendi_at, olay: "Proforma ödendi", ayrinti: `${p.proforma_no} · ödemeyle eşleşti`, ton: "success" });
    }
    /* İptalin kendi zamanı tutulmuyor; iptal son değişiklik olduğu için updated_at onun zamanı. */
    if (p.durum === "iptal" && p.updated_at) {
      ekle({ ...ortak, anahtar: `proforma-${p.id}-iptal`, zaman: p.updated_at, olay: "Proforma iptal edildi", ayrinti: p.proforma_no, ton: "neutral" });
    }
  }

  const odemeTutari = new Map(g.odemeler.map((o) => [o.id, o]));
  for (const f of g.faturalar) {
    const odeme = f.payment_request_id ? odemeTutari.get(f.payment_request_id) : undefined;
    ekle({
      anahtar: `fatura-${f.id}`, zaman: f.created_at, tur: "fatura", olay: "Fatura yüklendi",
      ayrinti: [f.fatura_no, f.fatura_tarihi ? `fatura tarihi ${f.fatura_tarihi.split("-").reverse().join(".")}` : null].filter(Boolean).join(" · "),
      tutar: odeme ? Number(odeme.amount) : null, paraBirimi: odeme?.currency, ton: "neutral",
    });
  }

  for (const k of g.kurulum) {
    ekle({
      anahtar: `kurulum-${k.id}`, zaman: k.created_at, tur: "kurulum", olay: g.kurulumIslemi(k.action),
      ayrinti: [k.state ? g.kurulumAsamasi(k.state) : null, k.result === "failed" ? "hata" : null].filter(Boolean).join(" · ") || null,
      tutar: null, ton: k.result === "failed" ? "danger" : k.result === "success" ? "success" : "info",
    });
  }

  /* Cümle lib/konsol-degisiklik'te: İşlem kayıtları ekranı da aynısını
     yazıyor. 02.11.2026'dan beri lisans, modül ve kurum ayarı
     değişiklikleri de "önce → sonra"sıyla burada. */
  for (const k of g.konsol) {
    const c = konsolKaydiCumlesi(k);
    ekle({
      anahtar: `konsol-${k.id}`, zaman: k.created_at, tur: "konsol",
      olay: c.olay, ayrinti: c.ayrinti ?? "konsoldan", tutar: null, ton: c.ton,
    });
  }

  for (const d of g.destek ?? []) {
    const acil = d.priority === "urgent" || d.priority === "high";
    ekle({ anahtar: `destek-${d.id}`, zaman: d.created_at, tur: "destek", olay: "Destek talebi açıldı", ayrinti: d.subject, tutar: null, ton: acil ? "warning" : "info", destekId: d.id });
    /* resolved_at durum "çözüldü" ya da "kapalı"ya çekilince yazılıyor (support/actions). */
    /* Yalnızca hâlâ kapalıysa: kapanan talebe yanıt yazılınca veritabanı onu yeniden
       açıyor (touch_support_ticket) ama resolved_at kalıyor; eskiden çizelge yeniden
       açılan talebi "çözüldü" gösteriyordu. */
    if (d.resolved_at && (d.status === "resolved" || d.status === "closed")) ekle({ anahtar: `destek-${d.id}-kapandi`, zaman: d.resolved_at, tur: "destek", olay: d.status === "closed" ? "Destek talebi kapatıldı" : "Destek talebi çözüldü", ayrinti: d.subject, tutar: null, ton: "success", destekId: d.id });
  }

  for (const n of g.notlar ?? []) {
    const kisa = n.metin.length > 140 ? `${n.metin.slice(0, 137)}…` : n.metin;
    const takip = n.takip_tarihi ? `takip ${n.takip_tarihi.split("-").reverse().join(".")}` : null;
    ekle({ anahtar: `not-${n.id}`, zaman: n.olusturuldu, tur: "not", olay: "Not yazıldı", ayrinti: [kisa, takip].filter(Boolean).join(" · "), tutar: null, ton: "neutral" });
    if (n.tamamlandi_at) ekle({ anahtar: `not-${n.id}-tamam`, zaman: n.tamamlandi_at, tur: "not", olay: "Takip tamamlandı", ayrinti: kisa, tutar: null, ton: "success" });
  }

  // En yeni üstte; aynı anda yazılan iki olayda sıra anahtara göre sabit (yenilemede satırlar oynamasın).
  return liste.sort((a, b) => b.zaman.localeCompare(a.zaman) || a.anahtar.localeCompare(b.anahtar));
}

export function hareketSayimi(liste: Hareket[]): Record<HareketTuru, number> {
  const sayim: Record<HareketTuru, number> = { odeme: 0, proforma: 0, fatura: 0, kurulum: 0, konsol: 0, destek: 0, not: 0 };
  for (const h of liste) sayim[h.tur] += 1;
  return sayim;
}
