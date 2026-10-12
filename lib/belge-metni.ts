/*
  KURUMUN BELGE METİNLERİ (12.10.2026) — saf mantık.

  Kurum, sözleşme ve teklifteki her maddeyi Ayarlar → Belge metinleri'nde
  değiştirebiliyor, madde ekleyip çıkarabiliyor. Değiştirilmeyen madde
  Arvo'nun koddaki metniyle çizilir; kayıt (organization_document_texts.
  content) yalnızca kurumun DEĞİŞİKLİKLERİNİ tutar:

    { surum: 1, sira?: string[], maddeler?: { [anahtar]: { baslik, metin } } }

  - sira yoksa Arvo'nun sırası. Varsa etkin sıra odur: listede olmayan
    Arvo maddesi kaldırılmış sayılır (zorunlular hariç, onlar geri
    eklenir).
  - maddeler: değiştirilmiş Arvo maddeleri ve kurumun eklediği maddeler
    ("ek-" önekli anahtar).

  Bu yapı imza anında satıra kopyalanır (document_text); Arvo'nun metni
  sürümlü olduğu için (LEGAL_TEXT_VERSION) imzalı belge birebir yeniden
  çizilebilir.

  METİN SÖZ DİZİMİ (kurumun yazdığı):
    - Boş satır paragrafları ayırır.
    - "- " ile başlayan satırlar madde işaretli listedir.
    - "## " ile başlayan satır alt başlıktır.
    - Tek başına "[[ad]]" satırı sistem bloğudur (taraf kartları, ödeme
      tablosu …); veriden çizilir, kurum yazmaz.
    - Paragraf ya da liste öğesinin başındaki "[tüketici]" / "[tacir]"
      o satırı yalnızca o müşteri türünde gösterir.
    - {yer_tutucu} belgenin verisiyle doldurulur; {madde:anahtar} o
      maddenin numarasını verir.
    - **kalın** yazı.
*/

export type BelgeTuru = "contract" | "proposal";

export type MaddeMetni = { baslik: string; metin: string };

export type KurumMetni = {
  surum: 1;
  sira?: string[] | null;
  maddeler?: Record<string, MaddeMetni>;
};

export const METIN_SINIRI = 20_000;
export const BASLIK_SINIRI = 160;
export const MADDE_SINIRI = 60;
export const EK_ONEKI = "ek-";

/** Kayıttan gelen değeri güvenle okur; bozuk alanlar yok sayılır. */
export function kurumMetniCoz(deger: unknown): KurumMetni {
  const kaynak = deger && typeof deger === "object" && !Array.isArray(deger) ? (deger as Record<string, unknown>) : {};
  const sira = Array.isArray(kaynak.sira) ? kaynak.sira.filter((x): x is string => typeof x === "string" && x.length > 0) : null;
  const maddeler: Record<string, MaddeMetni> = {};
  const hamMaddeler = kaynak.maddeler && typeof kaynak.maddeler === "object" ? (kaynak.maddeler as Record<string, unknown>) : {};
  for (const [anahtar, madde] of Object.entries(hamMaddeler)) {
    if (!madde || typeof madde !== "object") continue;
    const { baslik, metin } = madde as Record<string, unknown>;
    if (typeof baslik === "string" && typeof metin === "string") maddeler[anahtar] = { baslik, metin };
  }
  return { surum: 1, sira: sira && sira.length ? [...new Set(sira)] : null, maddeler };
}

/**
 * Belgede çizilecek madde anahtarları, sırasıyla.
 *
 * Kurum sırası yoksa Arvo'nunki. Varsa kurumunki; ama:
 *  - zorunlu bir Arvo maddesi listede yoksa kendi yerine geri eklenir
 *    (kayıt elle bozulsa da taraflar, ödeme, delil maddesi düşmesin),
 *  - "son" maddesi (yürürlük) her zaman en sonda kalır,
 *  - tanınmayan anahtar (ne Arvo'nun ne kurumun maddesi) atlanır.
 */
export function etkinSira(varsayilan: readonly string[], kurum: KurumMetni, zorunlu: readonly string[] = [], son?: string): string[] {
  const bilinen = (anahtar: string) => varsayilan.includes(anahtar) || Boolean(kurum.maddeler?.[anahtar]);
  let sira = (kurum.sira ?? [...varsayilan]).filter(bilinen);
  // Önce son madde sona: zorunlular "kendinden sonraki Arvo maddesinin
  // önüne" yerleşiyor ve o ölçü yürürlüğün yerine bakıyor. Eskiden sırası
  // bozuk kayıtta yürürlük başta kalınca ödeme maddesi en başa düşüyordu.
  if (son && sira.includes(son)) sira = [...sira.filter((x) => x !== son), son];
  for (const anahtar of zorunlu) {
    if (!varsayilan.includes(anahtar) || sira.includes(anahtar)) continue;
    const yer = varsayilan.indexOf(anahtar);
    const sonraki = varsayilan.slice(yer + 1).find((x) => sira.includes(x));
    const konum = sonraki ? sira.indexOf(sonraki) : sira.length;
    sira = [...sira.slice(0, konum), anahtar, ...sira.slice(konum)];
  }
  if (son && sira.includes(son)) sira = [...sira.filter((x) => x !== son), son];
  return sira;
}

export type Satir =
  | { tur: "p"; metin: string }
  | { tur: "liste"; ogeler: string[] }
  | { tur: "baslik"; metin: string }
  | { tur: "blok"; ad: string };

const KOSUL = /^\[(tüketici|tacir)\]\s*/i;
const BLOK = /^\[\[([a-z0-9_]+)\]\]$/;

/** "[tüketici] …" öneki: satırın hangi müşteri türünde görüneceği. */
function kosulAyir(satir: string): { metin: string; kosul: "tuketici" | "tacir" | null } {
  const eslesme = satir.match(KOSUL);
  if (!eslesme) return { metin: satir, kosul: null };
  return { metin: satir.slice(eslesme[0].length), kosul: eslesme[1].toLocaleLowerCase("tr") === "tacir" ? "tacir" : "tuketici" };
}

/**
 * Kurumun metnini satırlara ayırır ve müşteri türüne göre süzer.
 * Koşul öneki paragrafın ya da liste öğesinin başında olur. tuketici null:
 * müşteri türü olmayan belge (teklif) — her satır gösterilir, önek atılır.
 */
export function metniCoz(metin: string, tuketici: boolean | null): Satir[] {
  const uygun = (kosul: "tuketici" | "tacir" | null) => kosul === null || tuketici === null || (kosul === "tuketici") === tuketici;
  const satirlar: Satir[] = [];
  for (const paragraf of metin.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const temiz = paragraf.trim();
    if (!temiz) continue;
    const blok = temiz.match(BLOK);
    if (blok) { satirlar.push({ tur: "blok", ad: blok[1] }); continue; }
    if (temiz.startsWith("## ")) {
      const { metin: baslik, kosul } = kosulAyir(temiz.slice(3).trim());
      if (uygun(kosul)) satirlar.push({ tur: "baslik", metin: baslik });
      continue;
    }
    if (temiz.startsWith("- ")) {
      // Liste: her "- " yeni öğe; devam satırları önceki öğeye eklenir.
      const ogeler: string[] = [];
      let gecerli: { metin: string; kosul: "tuketici" | "tacir" | null } | null = null;
      const bitir = () => { if (gecerli && uygun(gecerli.kosul)) ogeler.push(gecerli.metin.trim()); };
      for (const satir of temiz.split("\n")) {
        if (satir.startsWith("- ")) { bitir(); gecerli = kosulAyir(satir.slice(2).trim()); }
        else if (gecerli) gecerli.metin += " " + satir.trim();
      }
      bitir();
      if (ogeler.length) satirlar.push({ tur: "liste", ogeler });
      continue;
    }
    const { metin: govde, kosul } = kosulAyir(temiz.replace(/\s*\n\s*/g, " "));
    if (uygun(kosul)) satirlar.push({ tur: "p", metin: govde });
  }
  return satirlar;
}

const YER_TUTUCU = /\{([a-z_]+)(?::([a-z0-9_-]+))?\}/g;

/**
 * {yer_tutucu} ve {madde:anahtar} doldurur. Bilinmeyen yer tutucu olduğu
 * gibi kalır (denetim kaydederken zaten uyarıyor; çizimde metni yutmasın).
 */
export function yerTutucuDoldur(metin: string, degerler: Record<string, string>, maddeNo: (anahtar: string) => number | null): string {
  return metin.replace(YER_TUTUCU, (tamami, ad: string, arg?: string) => {
    if (ad === "madde" && arg) {
      const no = maddeNo(arg);
      return no === null ? tamami : String(no);
    }
    return Object.prototype.hasOwnProperty.call(degerler, ad) ? degerler[ad] : tamami;
  });
}

export type MetinDenetimi = {
  yerTutucular: readonly string[];
  bloklar: readonly string[];
  maddeler: readonly string[];
};

/** Kaydetmeden önce: sınır, bilinmeyen yer tutucu, blok ve madde atfı. Hata yoksa boş liste. */
export function metniDenetle(baslik: string, metin: string, izin: MetinDenetimi): string[] {
  const hatalar: string[] = [];
  if (!baslik.trim()) hatalar.push("Madde başlığı boş olamaz.");
  if (baslik.length > BASLIK_SINIRI) hatalar.push(`Başlık en fazla ${BASLIK_SINIRI} karakter olabilir.`);
  if (!metin.trim()) hatalar.push("Madde metni boş olamaz.");
  if (metin.length > METIN_SINIRI) hatalar.push(`Madde metni en fazla ${METIN_SINIRI.toLocaleString("tr-TR")} karakter olabilir.`);
  const bilinmeyen = new Set<string>();
  for (const [, ad, arg] of metin.matchAll(YER_TUTUCU)) {
    if (ad === "madde") {
      if (!arg || !izin.maddeler.includes(arg)) bilinmeyen.add(`{madde:${arg ?? ""}}`);
    } else if (!izin.yerTutucular.includes(ad)) bilinmeyen.add(`{${ad}}`);
  }
  if (bilinmeyen.size) hatalar.push(`Tanınmayan yer tutucu: ${[...bilinmeyen].join(", ")}.`);
  const bloklar = [...metin.matchAll(/\[\[([a-z0-9_]+)\]\]/g)].map((x) => x[1]).filter((ad) => !izin.bloklar.includes(ad));
  if (bloklar.length) hatalar.push(`Tanınmayan blok: ${[...new Set(bloklar)].map((ad) => `[[${ad}]]`).join(", ")}.`);
  return hatalar;
}

/** **kalın** parçalarına ayırır: [düz, kalın, düz, …]. */
export function kalinAyir(metin: string): { metin: string; kalin: boolean }[] {
  const parcalar: { metin: string; kalin: boolean }[] = [];
  let son = 0;
  for (const eslesme of metin.matchAll(/\*\*(.+?)\*\*/g)) {
    if (eslesme.index! > son) parcalar.push({ metin: metin.slice(son, eslesme.index), kalin: false });
    parcalar.push({ metin: eslesme[1], kalin: true });
    son = eslesme.index! + eslesme[0].length;
  }
  if (son < metin.length) parcalar.push({ metin: metin.slice(son), kalin: false });
  return parcalar;
}

/**
 * Arvo'nun metnini düzenleme ekranına başlangıç olarak verirken: tüketici
 * ve tacir sürümlerini tek metinde birleştirir. Ortak satırlar düz, yalnız
 * birinde olanlar "[tüketici]" / "[tacir]" önekiyle. En uzun ortak alt dizi
 * (LCS) — iki sürüm aynı sırayı paylaşıyor, araya giren satırlar farklar.
 */
export type Birim = { tur: "p" | "li" | "h" | "blok"; metin: string };

export function surumleriBirlestir(tuketici: Birim[], tacir: Birim[]): (Birim & { kosul: "tuketici" | "tacir" | null })[] {
  const anahtar = (b: Birim) => `${b.tur}\u0000${b.metin}`;
  const n = tuketici.length;
  const m = tacir.length;
  const tablo = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tablo[i][j] = anahtar(tuketici[i]) === anahtar(tacir[j]) ? tablo[i + 1][j + 1] + 1 : Math.max(tablo[i + 1][j], tablo[i][j + 1]);
    }
  }
  const sonuc: (Birim & { kosul: "tuketici" | "tacir" | null })[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && anahtar(tuketici[i]) === anahtar(tacir[j])) { sonuc.push({ ...tuketici[i], kosul: null }); i++; j++; }
    else if (j < m && (i >= n || tablo[i][j + 1] >= tablo[i + 1][j])) { sonuc.push({ ...tacir[j], kosul: "tacir" }); j++; }
    else { sonuc.push({ ...tuketici[i], kosul: "tuketici" }); i++; }
  }
  return sonuc;
}

/** Birleştirilmiş birimleri kurumun yazacağı söz dizimine çevirir. */
export function birimleriYaz(birimler: (Birim & { kosul: "tuketici" | "tacir" | null })[]): string {
  const onek = (kosul: "tuketici" | "tacir" | null) => (kosul === "tuketici" ? "[tüketici] " : kosul === "tacir" ? "[tacir] " : "");
  const paragraflar: string[] = [];
  let liste: string[] = [];
  const listeyiBitir = () => { if (liste.length) { paragraflar.push(liste.join("\n")); liste = []; } };
  for (const birim of birimler) {
    if (birim.tur === "li") { liste.push(`- ${onek(birim.kosul)}${birim.metin}`); continue; }
    listeyiBitir();
    if (birim.tur === "blok") paragraflar.push(`[[${birim.metin}]]`);
    else if (birim.tur === "h") paragraflar.push(`## ${onek(birim.kosul)}${birim.metin}`);
    else paragraflar.push(`${onek(birim.kosul)}${birim.metin}`);
  }
  listeyiBitir();
  return paragraflar.join("\n\n");
}

/** Yeni kurum maddesi anahtarı: çakışmaz, kısa. */
export function yeniEkAnahtari(var_olanlar: readonly string[], rastgele: () => number = Math.random): string {
  for (;;) {
    const anahtar = EK_ONEKI + Math.floor(rastgele() * 36 ** 6).toString(36).padStart(6, "0");
    if (!var_olanlar.includes(anahtar)) return anahtar;
  }
}

/* ---------- Ayarlar ekranının işlemleri (saf; sunucu işlemi yalnızca kaydeder) ---------- */

export type SiraKurali = { varsayilan: readonly string[]; zorunlu: readonly string[]; son?: string };

/** Sıra Arvo'nunkiyle aynıysa kayda yazılmaz: Arvo'nun yeni maddeleri kuruma da gelsin. */
function siraYaz(kurum: KurumMetni, sira: string[], kural: SiraKurali): KurumMetni {
  const ayni = sira.length === kural.varsayilan.length && sira.every((anahtar, i) => anahtar === kural.varsayilan[i]);
  return { ...kurum, sira: ayni ? null : sira };
}

/**
 * Maddeyi kaydeder. Arvo maddesi ilk hâliyle (başlık ve metin aynı)
 * kaydedilirse değişiklik silinir: "değiştirildi" görünmesin, Arvo
 * metnini sonradan güncellediğinde kurum da alsın.
 */
export function maddeyiKaydet(kurum: KurumMetni, anahtar: string, madde: MaddeMetni, varsayilan?: MaddeMetni): KurumMetni {
  const maddeler = { ...(kurum.maddeler ?? {}) };
  const normal = (x: string) => x.replace(/\r\n/g, "\n").trim();
  if (varsayilan && normal(varsayilan.baslik) === normal(madde.baslik) && normal(varsayilan.metin) === normal(madde.metin)) delete maddeler[anahtar];
  else maddeler[anahtar] = { baslik: madde.baslik.trim(), metin: madde.metin.replace(/\r\n/g, "\n").trim() };
  return { ...kurum, maddeler };
}

/** Arvo maddesindeki değişikliği bırakır. */
export function maddeyiSifirla(kurum: KurumMetni, anahtar: string): KurumMetni {
  const maddeler = { ...(kurum.maddeler ?? {}) };
  delete maddeler[anahtar];
  return { ...kurum, maddeler };
}

/** Maddeyi belgeden çıkarır. Zorunlu madde çıkarılamaz; kurumun maddesi tümden silinir. */
export function maddeyiKaldir(kurum: KurumMetni, anahtar: string, kural: SiraKurali): KurumMetni {
  if (kural.zorunlu.includes(anahtar)) throw new Error("Bu madde sözleşmenin kurulması için gerekli; çıkarılamaz, yalnızca metni değiştirilebilir.");
  const sira = etkinSira(kural.varsayilan, kurum, kural.zorunlu, kural.son).filter((x) => x !== anahtar);
  const sonuc = siraYaz(kurum, sira, kural);
  if (anahtar.startsWith(EK_ONEKI)) return maddeyiSifirla(sonuc, anahtar);
  return sonuc;
}

/** Çıkarılmış Arvo maddesini Arvo sırasındaki yerine geri koyar. */
export function maddeyiGeriEkle(kurum: KurumMetni, anahtar: string, kural: SiraKurali): KurumMetni {
  if (!kural.varsayilan.includes(anahtar)) throw new Error("Bu madde geri eklenemez.");
  const sira = etkinSira(kural.varsayilan, kurum, kural.zorunlu, kural.son);
  if (sira.includes(anahtar)) return kurum;
  const yer = kural.varsayilan.indexOf(anahtar);
  const sonraki = kural.varsayilan.slice(yer + 1).find((x) => sira.includes(x));
  const konum = sonraki ? sira.indexOf(sonraki) : sira.length;
  return siraYaz(kurum, [...sira.slice(0, konum), anahtar, ...sira.slice(konum)], kural);
}

/** Maddeyi bir yukarı ya da aşağı taşır; son madde (yürürlük) yerinde kalır. */
export function maddeyiTasi(kurum: KurumMetni, anahtar: string, yon: "yukari" | "asagi", kural: SiraKurali): KurumMetni {
  const sira = etkinSira(kural.varsayilan, kurum, kural.zorunlu, kural.son);
  const i = sira.indexOf(anahtar);
  const j = yon === "yukari" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sira.length || anahtar === kural.son || sira[j] === kural.son) return kurum;
  const yeni = [...sira];
  [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
  return siraYaz(kurum, yeni, kural);
}

/** Kurumun yeni maddesi: son maddenin (yürürlük) hemen önüne, yoksa en sona. */
export function maddeEkle(kurum: KurumMetni, madde: MaddeMetni, kural: SiraKurali, rastgele: () => number = Math.random): { kurum: KurumMetni; anahtar: string } {
  const sira = etkinSira(kural.varsayilan, kurum, kural.zorunlu, kural.son);
  if (sira.length >= MADDE_SINIRI) throw new Error(`Belgede en fazla ${MADDE_SINIRI} madde olabilir.`);
  const anahtar = yeniEkAnahtari([...sira, ...Object.keys(kurum.maddeler ?? {})], rastgele);
  const konum = kural.son && sira.includes(kural.son) ? sira.indexOf(kural.son) : sira.length;
  const yeniSira = [...sira.slice(0, konum), anahtar, ...sira.slice(konum)];
  const sonuc = maddeyiKaydet(siraYaz(kurum, yeniSira, kural), anahtar, madde);
  // Yeni madde sırada olmalı; siraYaz Arvo sırasıyla eşleşmez (ek anahtar var) — her zaman yazılır.
  return { kurum: { ...sonuc, sira: yeniSira }, anahtar };
}
