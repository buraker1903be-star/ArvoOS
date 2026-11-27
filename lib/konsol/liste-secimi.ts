/*
  KONSOL LİSTE EKRANLARININ SEÇİM VE ADRES KURALI (27.11.2026).

  Onaylı tasarımda her liste ekranının sağında seçili kaydın paneli
  var (Müşteriler, Ödeme onayları, Destek). Seçim İSTEMCİ DURUMU
  DEĞİL, adresin bir parçası (`?secili=`). Üç şey buna bağlı:

    - detay adresi paylaşılabilir,
    - yenileme aynı kaydı getirir,
    - tarayıcı geri/ileri liste ile kayıt arasında gezer.

  Kural burada ve SAF, çünkü üç ekranda da aynı ve üçünde ayrı ayrı
  yazılsa saparlar. Bu depoda tam olarak bu sınıf hata birkaç kez
  yaşandı (fiyat düzenleme, otomasyon etiketleri).

  İKİ AYRI SORU var ve karıştırılmamalı:
    1. Seçili anahtar bir KAYDA çözülüyor mu? Çözülmüyorsa kayıt
       silinmiş ya da erişilemez.
    2. Çözülen kayıt GEÇERLİ SÜZGEÇTE görünüyor mu? Görünmüyorsa
       kayıt duruyor ama listede yok.
  İkisi farklı ekran metni istiyor; "sessizce boş panel" ikisi için
  de yanlış cevap.
*/

/** Seçili anahtarın hangi hâlde olduğu. */
export type SecimHali =
  /** Adreste seçim yok. */
  | { hal: "yok" }
  /** Kayıt çözüldü ve listede görünüyor. */
  | { hal: "listede" }
  /** Kayıt çözüldü ama geçerli süzgeçte görünmüyor. */
  | { hal: "suzgec_disinda" }
  /** Anahtar hiçbir kayda çözülmedi: silinmiş ya da erişilemez. */
  | { hal: "bulunamadi" };

/**
 * Seçimin hâlini belirler.
 *
 * @param anahtar adresteki `?secili=` değeri (boşsa seçim yok).
 * @param tumKayitlar süzgeçten ÖNCEKİ bütün kayıtların anahtarları.
 * @param listedekiler süzgeçten SONRA kalan kayıtların anahtarları.
 */
export function secimHali(
  anahtar: string | null | undefined,
  tumKayitlar: readonly string[],
  listedekiler: readonly string[],
): SecimHali {
  const a = anahtar?.trim();
  if (!a) return { hal: "yok" };
  if (!tumKayitlar.includes(a)) return { hal: "bulunamadi" };
  return listedekiler.includes(a) ? { hal: "listede" } : { hal: "suzgec_disinda" };
}

/**
 * Liste adresini kurar: var olan süzgeçleri KORUR, verilen alanları
 * değiştirir. `null` bir alanı siler, `undefined` ona dokunmaz.
 *
 * Seçim de sıradan bir alan: süzgeç değiştiren bağlantılar onu
 * taşıyor (kullanıcı süzgeci daraltırken seçtiği kaydı kaybetmiyor),
 * "Listeye dön" ise `secili: null` ile düşürüyor.
 *
 * Varsayılan değerler adrese YAZILMIYOR: `/musteriler?sira=ad` ile
 * `/musteriler` aynı ekran demek ve iki ayrı adres iki ayrı geçmiş
 * girdisi üretiyordu.
 */
export function listeAdresi(
  taban: string,
  mevcut: Readonly<Record<string, string | null | undefined>>,
  degisiklik: Readonly<Record<string, string | null | undefined>> = {},
  varsayilanlar: Readonly<Record<string, string>> = {},
): string {
  const p = new URLSearchParams();
  const alanlar = new Set([...Object.keys(mevcut), ...Object.keys(degisiklik)]);
  for (const alan of alanlar) {
    const deger = alan in degisiklik ? degisiklik[alan] : mevcut[alan];
    const temiz = typeof deger === "string" ? deger.trim() : deger;
    if (!temiz) continue;
    if (varsayilanlar[alan] === temiz) continue;
    p.set(alan, temiz);
  }
  const q = p.toString();
  return q ? `${taban}?${q}` : taban;
}

/**
 * Listenin kaydırma konumunun saklanacağı anahtar.
 *
 * SEÇİM VE KUTU AÇIKLIĞI DIŞARIDA: kayıt açıp kapatmak aynı listedir,
 * konum korunmalı. Süzgeç ya da sıralama değişince anahtar da değişir
 * ve liste BAŞTAN başlar — önceki süzgecin konumunu yeni sonuçlara
 * taşımak, kullanıcıyı alakasız bir satırın ortasına bırakıyor.
 *
 * @param yol rotanın yolu (`/panel/platform/musteriler`).
 * @param parametreler adresteki bütün arama parametreleri.
 */
export function kaydirmaAnahtari(
  yol: string,
  parametreler: Readonly<Record<string, string | null | undefined>>,
): string {
  const DISARIDA = new Set(["secili", "filtre"]);
  const p = new URLSearchParams();
  for (const alan of Object.keys(parametreler).sort()) {
    if (DISARIDA.has(alan)) continue;
    const deger = parametreler[alan]?.trim();
    if (deger) p.set(alan, deger);
  }
  const q = p.toString();
  return q ? `${yol}?${q}` : yol;
}
