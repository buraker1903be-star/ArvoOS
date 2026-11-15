/*
  DOÇENTLİK ÇALIŞMA ALANININ GÖRÜNÜM KARARLARI (F6 PR6a).

  Saf modül: Next, React ya da Supabase yok; testi
  tests/unit/docentlik-gorunum.test.ts. Ekranlar (app/panel/docentlik/…)
  yalnızca bu kararları çiziyor; hesap PR #318 çekirdeğinde
  (lib/docentlik/*) ve PR5'in özetinde (lib/docentlik-islem → docentlikOzeti).
  Burada YENİ bir puan kuralı yok — bilerek: ekran kendi toplamını
  hesaplarsa çekirdekle ayrışır ve kullanıcı iki ekranda iki puan görür.

  İki sayı ASLA karıştırılmaz:
   - ham puan: faaliyet puanlarının düz toplamı;
   - sayılan puan: grup tavanları (azami) uygulandıktan sonraki toplam.
  Hedefler sayılan puana göre ölçülür (çekirdek böyle hesaplıyor); ham
  puanı "toplam" diye göstermek, tavanı aşan kişiye hedefi tutturmuş
  izlenimi verirdi.
*/
import { kriterGruplari, kriterUygun, puanYazisi, type Donem, type HedefDurumu, type SayilanGrup } from "@/lib/docentlik/ozet";

/* ---------------------------------------------------------------------- */
/* Profil                                                                 */
/* ---------------------------------------------------------------------- */

export type ProfilGorunumu = { doktora_tarihi: string | null; temel_alan: string | null; alt_alan: string | null } | null;
export type ProfilEksigi = { alan: "temel_alan" | "doktora_tarihi" | "alt_alan"; onem: "uyari" | "bilgi"; metin: string };

/*
  Eksik profil bilgisinin SONUCU yazılır, yalnızca "boş" değil: kullanıcı
  alanı neden doldurması gerektiğini görmeli. Alt alan yalnızca bilgi —
  çoğu hedef temel alana tanımlı, alt alan boşken yanlış bir şey olmuyor.
*/
export function profilEksikleri(p: ProfilGorunumu): ProfilEksigi[] {
  const eksik: ProfilEksigi[] = [];
  if (!p?.temel_alan) {
    eksik.push({ alan: "temel_alan", onem: "uyari", metin: "Temel alan girilmedi: alanınıza özel kriter ve hedefler uygulanamıyor, yalnızca bütün alanlara ait olanlar sayılıyor." });
  }
  if (!p?.doktora_tarihi) {
    eksik.push({ alan: "doktora_tarihi", onem: "uyari", metin: "Doktora tarihi girilmedi: doktora sonrası şartlar hesaplanamıyor." });
  }
  if (p?.temel_alan && !p.alt_alan) {
    eksik.push({ alan: "alt_alan", onem: "bilgi", metin: "Alt alan girilmedi: alt alanınıza özel hedef varsa uygulanmıyor." });
  }
  return eksik;
}

/* ---------------------------------------------------------------------- */
/* Hedefler                                                               */
/* ---------------------------------------------------------------------- */

export type HedefSatiri = {
  anahtar: string;
  baslik: string;
  doktoraSonrasi: boolean;
  asgari: number;
  mevcut: number;
  eksik: number;
  karsilandi: boolean;
  /** Çubuk genişliği (0–100); hedefe göre, 100'de kesilir. */
  oran: number;
};

const satir = (d: HedefDurumu): HedefSatiri => ({
  anahtar: `${d.grup ?? "toplam"}|${d.doktoraSonrasi ? "ds" : "tum"}`,
  baslik: d.grup ?? "Toplam puan",
  doktoraSonrasi: d.doktoraSonrasi,
  asgari: d.hedef,
  mevcut: d.mevcut,
  eksik: d.eksik,
  karsilandi: d.eksik === 0,
  oran: d.hedef > 0 ? Math.min(100, Math.round((d.mevcut / d.hedef) * 100)) : 100,
});

export type HedefGorunumu = {
  toplam: HedefSatiri[];
  gruplar: HedefSatiri[];
  /** Kurumda bu kişiye uygulanan hiç asgari hedef yok (uydurma şart üretilmez). */
  hedefYok: boolean;
  /** Doktora tarihi olmadığı için ölçülemeyen doktora sonrası hedef sayısı. */
  olculemeyen: number;
  eksikToplam: number;
};

export function hedefGorunumu(o: { toplamHedefleri: HedefDurumu[]; grupHedefleri: HedefDurumu[]; olculemeyenHedefSayisi: number }): HedefGorunumu {
  const toplam = o.toplamHedefleri.map(satir);
  const gruplar = o.grupHedefleri.map(satir);
  return {
    toplam,
    gruplar,
    hedefYok: toplam.length === 0 && gruplar.length === 0 && o.olculemeyenHedefSayisi === 0,
    olculemeyen: o.olculemeyenHedefSayisi,
    eksikToplam: [...toplam, ...gruplar].filter((s) => !s.karsilandi).length,
  };
}

/* ---------------------------------------------------------------------- */
/* Grup (kategori) dağılımı                                               */
/* ---------------------------------------------------------------------- */

export type GrupSatiri = {
  grup: string;
  ham: number;
  sayilan: number;
  azami: number | null;
  /** Ham puan tavanı aştı: fazlası sayılmıyor. */
  tavanaTakildi: boolean;
  adet: number;
  /** Çubuk genişliği (0–100): en yüksek SAYILAN gruba göre. */
  oran: number;
};

export function grupSatirlari(gruplar: readonly SayilanGrup<unknown>[]): GrupSatiri[] {
  const enYuksek = Math.max(0, ...gruplar.map((g) => g.toplam));
  return [...gruplar]
    .map((g) => ({
      grup: g.grup,
      ham: g.ham,
      sayilan: g.toplam,
      azami: g.azami,
      tavanaTakildi: g.azami !== null && g.ham > g.azami,
      adet: g.kayitlar.length,
      oran: enYuksek > 0 ? Math.round((g.toplam / enYuksek) * 100) : 0,
    }))
    .sort((a, b) => b.sayilan - a.sayilan || a.grup.localeCompare(b.grup, "tr"));
}

/* ---------------------------------------------------------------------- */
/* Kriter seçenekleri                                                     */
/* ---------------------------------------------------------------------- */

export type KriterSatiri = {
  id: string; code: string; label: string; category_group: string | null; points_per_unit: number | string;
  is_active: boolean; temel_alan?: string | null; alt_alan?: string | null;
};
export type KriterSecenegi = { id: string; etiket: string; pasif: boolean };

/*
  Formda yalnızca ETKİN ve kişinin alanına UYGUN kriterler. Tek istisna:
  düzenlenen faaliyetin kendi kriteri pasife alınmış ya da alan dışına
  düşmüş olabilir — onu listeden düşürmek, formu açan kişinin kaydı
  fark etmeden başka kritere taşımasına yol açardı (tetikleyici de
  kriter değişmediği sürece pasif kriterin kaydını düzenlemeye izin veriyor).
*/
export function kriterSecenekleri(
  kriterler: readonly KriterSatiri[],
  profil: ProfilGorunumu,
  mevcutKriterId: string | null = null,
): { grup: string; secenekler: KriterSecenegi[] }[] {
  const uygun = kriterler.filter((k) =>
    k.id === mevcutKriterId || (k.is_active && kriterUygun(k, profil?.temel_alan ?? null, profil?.alt_alan ?? null)));
  return kriterGruplari(uygun.map((k) => ({ ...k }))).map(({ grup, kriterler: liste }) => ({
    grup,
    secenekler: liste.map((k) => ({
      id: k.id,
      etiket: `${k.code} · ${k.label} (${puanYazisi(Number(k.points_per_unit))} puan)`,
      pasif: !k.is_active,
    })),
  }));
}

/* ---------------------------------------------------------------------- */
/* Küçük metinler                                                         */
/* ---------------------------------------------------------------------- */

export const donemEtiketi = (d: Donem): string =>
  d === "sonra" ? "Doktora sonrası" : d === "once" ? "Doktora öncesi" : "Dönem bilinmiyor";

/** Yazar bilgisi tek satırda: "Tek yazar", "3 yazar · başlıca", "3 yazar". */
export function yazarMetni(yazarSayisi: number, baslica: boolean): string {
  if (yazarSayisi <= 1) return "Tek yazar";
  return baslica ? `${yazarSayisi} yazar · başlıca` : `${yazarSayisi} yazar`;
}

/* Takvim günü ("2024-03-01") → "01.03.2024". Bir AN değil GÜN: saat dilimi
   dönüşümü yok, yoksa UTC gece yarısı Türkiye'de bir önceki güne düşebilirdi. */
export function gunMetni(gun: string | null | undefined): string {
  if (!gun || !/^\d{4}-\d{2}-\d{2}/.test(gun)) return "—";
  const [y, a, g] = gun.slice(0, 10).split("-");
  return `${g}.${a}.${y}`;
}

export const puanMetni = (n: number | string | null | undefined): string =>
  n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? "—" : puanYazisi(Number(n));

/*
  Hesaplanan durum bir TAHMİN: kriter ve hedefleri kurum giriyor, ÜAK'ın
  resmî değerlendirmesi değil. Ekranda kesin bir "uygunsunuz" hükmü
  vermek, akademisyeni eksik bir başvuruya yöneltebilir.
*/
export const UAK_BILGI_NOTU =
  "Puan ve hedef durumu, kurumunuzun tanımladığı kriter ve hedeflere göre hesaplanan bilgilendirme amaçlı bir sonuçtur; ÜAK'ın resmî değerlendirmesi yerine geçmez.";
