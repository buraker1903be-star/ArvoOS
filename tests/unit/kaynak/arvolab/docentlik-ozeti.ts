/*
  DOÇENTLİK PUANI: GRUPLARA GÖRE ÖZET (26.10.2026, personel gözüyle
  ikinci geçiş). Başvuru hazırlayan akademisyen puanına kategori kategori
  bakıyor ("makalelerden kaç, atıflardan kaç"); eskiden faaliyetler tek
  düz listeydi ve grup toplamları yalnızca küçük etiketlerdeydi.

  Ekran ve yazdırılabilir döküm AYNI fonksiyondan besleniyor: biri bir
  toplam, öteki başka bir toplam yazarsa ikisine de güvenilmez.

  Saf modül; testi tests/unit/docentlik-ozeti.test.ts.
*/

export const GRUPSUZ = "Diğer";

type Kayit = { computed_points: number; criteria: { category_group: string | null } | null };

export type PuanGrubu<T> = { grup: string; toplam: number; pay: number; kayitlar: T[] };

/** Kayıtları kategori grubuna göre toplar; en çok puan getiren grup önce. */
export function puanGruplari<T extends Kayit>(kayitlar: T[]): { toplam: number; gruplar: PuanGrubu<T>[] } {
  const harita = new Map<string, T[]>();
  for (const k of kayitlar) {
    const grup = k.criteria?.category_group?.trim() || GRUPSUZ;
    harita.set(grup, [...(harita.get(grup) ?? []), k]);
  }
  const yuvarla = (n: number) => Math.round(n * 1e6) / 1e6;
  const toplam = yuvarla(kayitlar.reduce((t, k) => t + Number(k.computed_points || 0), 0));
  const gruplar = [...harita.entries()]
    .map(([grup, liste]) => {
      const grupToplami = yuvarla(liste.reduce((t, k) => t + Number(k.computed_points || 0), 0));
      return { grup, toplam: grupToplami, pay: toplam > 0 ? Math.round((grupToplami / toplam) * 100) : 0, kayitlar: liste };
    })
    .sort((a, b) => b.toplam - a.toplam || a.grup.localeCompare(b.grup, "tr"));
  return { toplam, gruplar };
}

/** Kriterleri gruplarına göre dizer; grup ve kod sırasıyla. */
export function kriterGruplari<T extends { code: string; category_group: string | null }>(kriterler: T[]): { grup: string; kriterler: T[] }[] {
  const harita = new Map<string, T[]>();
  for (const k of kriterler) {
    const grup = k.category_group?.trim() || GRUPSUZ;
    harita.set(grup, [...(harita.get(grup) ?? []), k]);
  }
  return [...harita.entries()]
    .sort(([a], [b]) => (a === GRUPSUZ ? 1 : b === GRUPSUZ ? -1 : a.localeCompare(b, "tr")))
    .map(([grup, liste]) => ({ grup, kriterler: liste.sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true })) }));
}

/** "12,5" — ekranda ondalık virgülle, gereksiz sıfırsız. */
export const puanYazisi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

/*
  HEDEFLER (20261027081037, 20261027122336). Bir hedef satırı bir grubun
  SINIRLARI: asgari puan, azami puan (tavan) ya da ikisi; grup null ise
  toplam. doktora_sonrasi işaretli satırın asgarisi yalnızca doktora
  sonrası faaliyetlerle sağlanır ("100 puanın en az 90'ı doktora sonrası").
*/
export type Hedef = {
  organization_id: string | null;
  temel_alan?: string | null;
  /** Temel alanın alt alanı (20261027142035); null = temel alanın tamamı. */
  alt_alan?: string | null;
  grup: string | null;
  asgari_puan: number | null;
  azami_puan?: number | null;
  doktora_sonrasi?: boolean | null;
};
export type HedefDurumu = {
  grup: string | null;
  doktoraSonrasi: boolean;
  hedef: number;
  mevcut: number;
  eksik: number;
  kaynak: "genel" | "kurum";
};

/*
  Geçerli hedefler: başka kurumun ve başka temel alanın hedefi elenir;
  aynı grup (ve aynı dönem şartı) için birden çok aday kalırsa en ÖZEL
  olan kazanır — kurum genelden, temel alanın kendi hedefi "bütün
  alanlar"dan önce gelir. Alan seçilmemişse yalnızca bütün alanlara ait
  hedefler sayılır.
*/
/*
  Alt alan da aynı kuralla süzülür: başka bir alt alanın hedefi elenir,
  alt alan seçilmemişse yalnızca alt alansız hedefler sayılır. Eskiden
  alt alan yoktu ve Plastik sanatlardan başvuran aday Müzik/Kompozisyon'un
  "en az 60 puan" şartını kendi eksiği gibi görürdü.
*/
export function etkinHedefler(hedefler: Hedef[], kurum: string | null, temelAlan: string | null = null, altAlan: string | null = null): Hedef[] {
  const ozgulluk = (h: Hedef) => (h.organization_id ? 4 : 0) + (h.temel_alan ? 2 : 0) + (h.alt_alan ? 1 : 0);
  const harita = new Map<string, Hedef>();
  for (const h of hedefler) {
    if (h.organization_id !== null && h.organization_id !== kurum) continue;
    if (h.temel_alan && h.temel_alan !== temelAlan) continue;
    if (h.alt_alan && h.alt_alan !== altAlan) continue;
    const anahtar = `${h.grup?.trim() || ""}|${h.doktora_sonrasi ? 1 : 0}`;
    const onceki = harita.get(anahtar);
    if (!onceki || ozgulluk(h) > ozgulluk(onceki)) harita.set(anahtar, h);
  }
  return [...harita.values()];
}

/*
  TAVAN. Grubun sayılan puanı tavanı aşamaz; toplam sayılan puanların
  toplamıdır. Tavan yalnızca "bütün faaliyetler" satırından okunur (ÜAK
  tavanı dönemden bağımsız yazıyor). Eskiden tavan yoktu: atıftan 30
  puanı olan aday, tavan 10 iken toplamda 20 puan fazla görüyordu.
*/
export type SayilanGrup<T> = PuanGrubu<T> & { ham: number; azami: number | null };

export function tavanUygula<T>(ozet: { toplam: number; gruplar: PuanGrubu<T>[] }, hedefler: Hedef[]): { toplam: number; ham: number; gruplar: SayilanGrup<T>[] } {
  const yuvarla = (n: number) => Math.round(n * 1e6) / 1e6;
  const tavan = (grup: string) => {
    const h = hedefler.find((x) => !x.doktora_sonrasi && x.grup?.trim() === grup && x.azami_puan != null);
    return h ? Number(h.azami_puan) : null;
  };
  const gruplar = ozet.gruplar.map((g) => {
    const azami = tavan(g.grup);
    return { ...g, ham: g.toplam, azami, toplam: azami !== null ? Math.min(g.toplam, azami) : g.toplam };
  });
  return { toplam: yuvarla(gruplar.reduce((t, g) => t + g.toplam, 0)), ham: ozet.toplam, gruplar };
}

export function hedefDurumlari(
  hedefler: Hedef[],
  tum: { toplam: number; gruplar: { grup: string; toplam: number }[] },
  sonra: { toplam: number; gruplar: { grup: string; toplam: number }[] } | null = null,
): { toplamHedefleri: HedefDurumu[]; grupHedefleri: HedefDurumu[] } {
  const yuvarla = (n: number) => Math.round(n * 1e6) / 1e6;
  const durumlar = hedefler
    .filter((h) => h.asgari_puan != null && Number(h.asgari_puan) > 0)
    // Doktora tarihi bilinmiyorsa doktora sonrası şartı ölçülemez; "0 / 90" diye eksik göstermek yanlış alarm olurdu.
    .filter((h) => !h.doktora_sonrasi || sonra !== null)
    .map((h): HedefDurumu => {
      const kaynak = h.doktora_sonrasi ? sonra! : tum;
      const grup = h.grup?.trim() || null;
      const mevcut = grup ? kaynak.gruplar.find((g) => g.grup === grup)?.toplam ?? 0 : kaynak.toplam;
      return {
        grup,
        doktoraSonrasi: Boolean(h.doktora_sonrasi),
        hedef: Number(h.asgari_puan),
        mevcut,
        eksik: Math.max(0, yuvarla(Number(h.asgari_puan) - mevcut)),
        kaynak: h.organization_id ? "kurum" : "genel",
      };
    });
  return {
    toplamHedefleri: durumlar.filter((d) => !d.grup).sort((a, b) => Number(a.doktoraSonrasi) - Number(b.doktoraSonrasi)),
    grupHedefleri: durumlar
      .filter((d) => d.grup)
      .sort((a, b) => b.eksik - a.eksik || (a.grup ?? "").localeCompare(b.grup ?? "", "tr") || Number(a.doktoraSonrasi) - Number(b.doktoraSonrasi)),
  };
}

/*
  DÖNEM. Faaliyet doktora tarihinden SONRA mı? Tarih karşılaştırması gün
  anahtarıyla ("2024-05-01"), saat dilimi yok: ikisi de takvim günü.
  Aynı gün "sonra" sayılmıyor — unvan o gün alınıyor, ÜAK "aldıktan
  sonra" diyor; şüphede kullanıcının lehine değil, temkinli taraf.
  Tarihi girilmemiş faaliyet hiçbir döneme sayılmaz, ayrıca sayılır:
  sessizce "sonra" saymak puanı şişirirdi.
*/
export type Donem = "sonra" | "once" | "bilinmiyor";

export function faaliyetDonemi(faaliyetTarihi: string | null | undefined, doktoraTarihi: string | null | undefined): Donem {
  if (!faaliyetTarihi || !doktoraTarihi) return "bilinmiyor";
  return faaliyetTarihi.slice(0, 10) > doktoraTarihi.slice(0, 10) ? "sonra" : "once";
}

/*
  Temel alan adları için ÖNERİ listesi (yazarken tamamlansın diye). Kural
  değil: ÜAK adları dönemden döneme değişebiliyor; yönetici PDF'teki adı
  birebir yazabilir. Akademisyen ve kriter aynı adı taşıdığında eşleşir.
*/
export const TEMEL_ALAN_ONERILERI = [
  "Eğitim Bilimleri",
  "Fen Bilimleri ve Matematik",
  "Filoloji",
  "Güzel Sanatlar",
  "Hukuk",
  "İlahiyat",
  "Mimarlık, Planlama ve Tasarım",
  "Mühendislik",
  "Sağlık Bilimleri",
  "Sosyal, Beşeri ve İdari Bilimler",
  "Spor Bilimleri",
  "Ziraat, Orman ve Su Ürünleri",
];

/** Kriter görünür mü: temel alanı ve alt alanı kişininkiyle uyuşmalı (boş = hepsi). */
export function kriterUygun(
  c: { temel_alan?: string | null; alt_alan?: string | null },
  temelAlan: string | null,
  altAlan: string | null,
): boolean {
  if (!temelAlan) return true;
  if (c.temel_alan && c.temel_alan !== temelAlan) return false;
  // Alt alan seçilmemişse bütün alt alanlar görünür (aday seçene kadar ne aradığını görsün).
  return !c.alt_alan || !altAlan || c.alt_alan === altAlan;
}
