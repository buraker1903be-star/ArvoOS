import { OTOMATIK_PROFORMA_GUN } from "./otomatik-proforma";

/*
  ABONELİK YENİLEME TAKVİMİ (29.10.2026) — saf kural.

  Kurucu "önümüzdeki günlerde kimin dönemi doluyor ve ödeme belgesi
  gitti mi" sorusunu soruyordu ve cevap üç yerdeydi: dönem sonu lisans
  tablolarında (Abonelikler, yalnızca 7 gün), proforma Tahsilat'ta,
  gönderim proformanın kendi sayfasında. Otomatik proforma (lib/otomatik-
  proforma) geldikten sonra soru keskinleşti: iş bu dönemi kesti mi,
  gönderebildi mi, kesmediyse neden?

  Bu modül her aboneliği proformasıyla eşleştiriyor ve tek bir durum
  veriyor. Ekran (app/panel/platform/yenilemeler) yalnızca çiziyor; kural
  burada, birim testi tests/unit/yenileme-takvimi.test.ts.

  EŞLEŞTİRME, en kesinden gevşeğe:
   1. Otomatik proforma, aynı müşteri + ürün + dönem sonu (iş bunu kesti;
      iptal edilmişse de o dönemin proformasıdır ve "iptal" yazılır).
   2. Elle kesilmiş, iptal edilmemiş, aynı müşteri + ürün, dönem sonundan
      en çok 30 gün önce düzenlenmiş proforma (kurucu kendisi göndermiş;
      otomatik iş de bu yüzden kesmemiş olur).
  Hiçbiri yoksa: dönem sonuna üç günden fazla varsa "kesilecek" (iş o
  sabah kesecek), yoksa "kesilmedi" — dikkat isteyen hâl.
*/

export type TakvimAboneligi = {
  anahtar: string;
  tur: "kurum" | "abone";
  musteriId: string;
  musteriAdi: string;
  urun: string;
  durum: string;
  /** Dönem (ya da deneme) sonu, Türkiye günü (YYYY-AA-GG). */
  bitis: string;
  /** Beklenen tutar (kuruş, KDV dahil); bilinmiyorsa null. */
  tutar: number | null;
};

export type TakvimProformasi = {
  id: string;
  proforma_no: string;
  organization_id: string | null;
  subscriber_id: string | null;
  product: string;
  durum: string;
  otomatik: boolean;
  donem_sonu: string | null;
  duzenleme_tarihi: string;
  toplam: number;
  gonderildi_at: string | null;
  bildirildi_at: string | null;
  gonderim_hatasi: string | null;
};

export type ProformaHali =
  | { tur: "deneme" }
  | { tur: "kesilecek"; gun: string }
  | { tur: "kesilmedi" }
  | { tur: "kesildi" | "gonderildi" | "odendi" | "iptal"; proforma: TakvimProformasi };

const GUN = 86_400_000;
const fark = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / GUN);
const gunEkle = (gun: string, n: number) => new Date(Date.parse(`${gun}T00:00:00Z`) + n * GUN).toISOString().slice(0, 10);

export function proformaHali(a: TakvimAboneligi, proformalar: TakvimProformasi[], bugun: string): ProformaHali {
  if (a.durum === "trialing") return { tur: "deneme" };
  const ayni = proformalar.filter((p) =>
    p.product === a.urun && (a.tur === "kurum" ? p.organization_id === a.musteriId : p.subscriber_id === a.musteriId));
  const otomatik = ayni.find((p) => p.otomatik && p.donem_sonu === a.bitis);
  const elle = ayni
    .filter((p) => !p.otomatik && p.durum !== "iptal")
    .filter((p) => { const f = fark(p.duzenleme_tarihi, a.bitis); return f >= 0 && f <= 30; })
    .sort((x, y) => y.duzenleme_tarihi.localeCompare(x.duzenleme_tarihi))[0];
  const p = otomatik ?? elle;
  if (p) {
    if (p.durum === "odendi") return { tur: "odendi", proforma: p };
    if (p.durum === "iptal") return { tur: "iptal", proforma: p };
    return { tur: p.gonderildi_at ? "gonderildi" : "kesildi", proforma: p };
  }
  return fark(bugun, a.bitis) > OTOMATIK_PROFORMA_GUN
    ? { tur: "kesilecek", gun: gunEkle(a.bitis, -OTOMATIK_PROFORMA_GUN) }
    : { tur: "kesilmedi" };
}

export type TakvimSatiri = TakvimAboneligi & { kalan: number; proforma: ProformaHali };

export type Takvim = {
  /** Dönemi geçmiş, ödemesi gelmemiş (son 30 gün). */
  gecikmis: TakvimSatiri[];
  gunler: { gun: string; satirlar: TakvimSatiri[] }[];
  ozet: { adet: number; tutar: number; kesilen: number; gonderilen: number; odenen: number; dikkat: number };
};

/** Dikkat isteyen: proforması kesilmemiş ya da kesilip gönderilememiş, ya da dönemi geçmiş. */
export const dikkatIster = (s: TakvimSatiri) =>
  s.kalan < 0 || s.proforma.tur === "kesilmedi" || (s.proforma.tur === "kesildi" && s.kalan <= OTOMATIK_PROFORMA_GUN);

export function takvimiKur(abonelikler: TakvimAboneligi[], proformalar: TakvimProformasi[], bugun: string, gun = 30): Takvim {
  const satirlar: TakvimSatiri[] = abonelikler
    .map((a) => ({ ...a, kalan: fark(bugun, a.bitis), proforma: proformaHali(a, proformalar, bugun) }))
    .filter((s) => s.kalan <= gun && s.kalan >= -30)
    .sort((x, y) => x.bitis.localeCompare(y.bitis) || x.musteriAdi.localeCompare(y.musteriAdi, "tr"));
  const gecikmis = satirlar.filter((s) => s.kalan < 0);
  const gelecek = satirlar.filter((s) => s.kalan >= 0);
  const gunler: Takvim["gunler"] = [];
  for (const s of gelecek) {
    const son = gunler.at(-1);
    if (son?.gun === s.bitis) son.satirlar.push(s);
    else gunler.push({ gun: s.bitis, satirlar: [s] });
  }
  const odeyen = gelecek.filter((s) => s.proforma.tur !== "deneme");
  return {
    gecikmis,
    gunler,
    ozet: {
      adet: gelecek.length,
      // Denemenin tutarı beklenen gelir değil: deneme bitince ne alacağı belli değil.
      tutar: odeyen.reduce((t, s) => t + (s.tutar ?? 0), 0),
      kesilen: odeyen.filter((s) => ["kesildi", "gonderildi", "odendi"].includes(s.proforma.tur)).length,
      gonderilen: odeyen.filter((s) => s.proforma.tur === "gonderildi" || s.proforma.tur === "odendi").length,
      odenen: odeyen.filter((s) => s.proforma.tur === "odendi").length,
      dikkat: satirlar.filter(dikkatIster).length,
    },
  };
}
