/*
  YÖNETİM GİRİŞİNİN ARAYÜZ DİLİ (26.11.2026). Saf modül; DOM'a ve
  Next'e dokunmaz, testi tests/unit/konsol-giris-dil.test.ts.

  Kapsam BİLEREK dar: yalnızca yonetim.arvo-os.com'daki giriş ekranı.
  Panelin tamamı Türkçe (AGENTS.md) ve bu teslim onu değiştirmiyor;
  giriş ekranı ArvoLab'ın iki dilli giriş ekranıyla eşleşsin diye iki
  dilli. Panele dil geldiğinde bu modül oraya taşınabilir — o yüzden
  Metin tipi ve çevirici ArvoLab'daki ile aynı biçimde yazıldı
  (ArvoLab lib/dil.ts, canlı commit b3fab7a4).

  Metinler ANAHTARLI bir katalogda değil, kullanıldıkları yerde iki
  dilde birden yazılıyor: t({ tr: "…", en: "…" }). Tip sistemi her
  metnin iki dilde de yazıldığını zorunlu kılar.

  Dil ADRESTE değil çerezde: /login kiracılarla paylaşımlı ve arama
  motoruna kapalı; /en/... öneki bütün giriş bağlantılarını ikiye
  bölerdi. Çerez sunucuda okunur, böylece ilk boyamada doğru dil çizilir
  (istemcide seçilseydi sayfa bir an yanlış dilde görünürdü).
*/

export const DILLER = ["tr", "en"] as const;
export type Dil = (typeof DILLER)[number];

/** Bir metnin bütün dillerdeki yazımı. */
export type Metin = Record<Dil, string>;

export type Cevirici = (metin: Metin) => string;

export const VARSAYILAN_DIL: Dil = "tr";
export const DIL_CEREZI = "arvoos_giris_dil";

/** Dil adı, KENDİ dilinde: yanlış dilde açılmış ekranda kullanıcı kendi dilini ancak böyle tanır. */
export const DIL_ADLARI: Record<Dil, string> = { tr: "Türkçe", en: "English" };

export function dilMi(deger: unknown): deger is Dil {
  return deger === "tr" || deger === "en";
}

export function ceviriciKur(dil: Dil): Cevirici {
  return (metin) => metin[dil];
}

/*
  Tarayıcının Accept-Language başlığından dil. Çerezi olmayan ilk
  ziyaretçi için; Türkçe varsayılan, yalnızca başlıkta İngilizce
  Türkçe'den ÖNCE geliyorsa İngilizce seçilir. Ağırlık (q) okunur:
  "tr;q=0.8,en;q=0.9" İngilizce demektir.
*/
export function tarayicidanDil(baslik: string | null | undefined): Dil {
  if (!baslik) return VARSAYILAN_DIL;
  let enAgirlik = -1;
  let trAgirlik = -1;
  for (const parca of baslik.split(",")) {
    const [adHam, ...ekler] = parca.trim().split(";");
    const ad = adHam.trim().toLowerCase();
    if (!ad) continue;
    const q = ekler.map((e) => e.trim()).find((e) => e.startsWith("q="));
    const agirlik = q ? Number.parseFloat(q.slice(2)) : 1;
    if (!Number.isFinite(agirlik)) continue;
    if (ad === "tr" || ad.startsWith("tr-")) trAgirlik = Math.max(trAgirlik, agirlik);
    else if (ad === "en" || ad.startsWith("en-")) enAgirlik = Math.max(enAgirlik, agirlik);
  }
  return enAgirlik > trAgirlik ? "en" : VARSAYILAN_DIL;
}
