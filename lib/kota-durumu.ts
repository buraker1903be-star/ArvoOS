/*
  Kota durumu: kurumun limitine ne kadar yaklaştığı.

  Kotalar veritabanında tanımlı ve lisans ekranında yüzde çubuğuyla
  gösteriliyordu ama YALNIZCA seçili kurum için. Yani "hangi kurumlar
  limitini aşmış" sorusunun yanıtı hiçbir ekranda yoktu; kurucu her kurumu
  tek tek açmadıkça göremiyordu. Kota uygulanmadan önce cevabı bilinmesi
  gereken ilk soru bu: kuralı bugün koyarsak kimin işi durur.

  Saf: veritabanına dokunmaz, testi tests/unit/kota-durumu.test.ts.
*/

/** Bu oranın üstü "yaklaştı" sayılır; limite değmeden önce haber verilsin. */
export const YAKLASMA_ORANI = 85;

export type KotaOlcumu = {
  kullanilan: number;
  limit: number;
  /** Yüzde; limit yoksa 0. */
  oran: number;
  asildi: boolean;
};

/*
  AI kredisi burada YOK — ama "ölçülmüyor" diye değil.

  `organization_licenses.ai_credits_used` sütununu hiçbir kod artırmıyor
  (körelmiş; check:rakamlar onu tuzak olarak gözetiyor). Tüketim ArvoLab'ın
  kendi veritabanında duruyor ve oradan CANLI okunuyor
  (lib/urun-kullanimi → aylik_kredi); limiti de ArvoLab kendi kredi
  kapısında uyguluyor.

  Bu modül saf ve eşzamanlı: girdisi tek bir kiracının sayıları. AI
  kredisini katmak, her çağıranın ayrı bir veritabanından ağ üzerinden
  ölçüm çekmesini gerektirirdi — kota kartı o ölçüm koptuğunda "%0 dolu"
  demeye başlardı. Kredi durumu bu yüzden lisans ekranında kendi
  kutusunda, ölçüm alınamazsa "Ölçülemedi" diyerek gösteriliyor.
*/
export type KotaDurumu = {
  organizationId: string;
  kullanici: KotaOlcumu;
  /** Megabayt cinsinden; limit lisanstaki storage_limit_mb. */
  depolama: KotaOlcumu;
  /** En kötü ölçüme göre genel durum. */
  durum: "normal" | "yaklasti" | "asildi";
};

function olc(kullanilan: number, limit: number): KotaOlcumu {
  const k = Math.max(0, Math.round(kullanilan || 0));
  const l = Math.max(0, Math.round(limit || 0));
  /*
    Limit 0 özel: "hak yok" demek. Hiç kullanılmamışsa sorun değil, bir
    tane bile kullanılmışsa aşılmıştır. Yüzdeyi 0'a bölmemek için ayrı
    ele alınıyor; eskiden bu durumda oran 0 çıkıyor ve aşım görünmüyordu.
  */
  if (l === 0) return { kullanilan: k, limit: 0, oran: k > 0 ? 100 : 0, asildi: k > 0 };
  return { kullanilan: k, limit: l, oran: Math.round((k / l) * 100), asildi: k > l };
}

export function kotaDurumu(girdi: {
  organizationId: string;
  kullaniciSayisi: number;
  kullaniciLimiti: number;
  /** Kullanılan depolama, BAYT. Ölçüm yoksa 0. */
  depolamaBayt?: number;
  /** Lisanstaki storage_limit_mb. */
  depolamaLimitiMb?: number;
}): KotaDurumu {
  const kullanici = olc(girdi.kullaniciSayisi, girdi.kullaniciLimiti);
  /*
    Depolama megabayta çevrilip öyle ölçülüyor: limit MB cinsinden
    giriliyor ve iki farklı birimi karşılaştırmak, oranı bin katı yanlış
    hesaplamak demekti. Yukarı yuvarlıyoruz — 0,4 MB'lık bir dosyayı
    "0 MB" saymak, limiti dolmuş bir kurumu boş göstermeye giden yol.
  */
  const depolama = olc(Math.ceil((girdi.depolamaBayt ?? 0) / (1024 * 1024)), girdi.depolamaLimitiMb ?? 0);
  const enYuksek = Math.max(kullanici.oran, depolama.oran);
  return {
    organizationId: girdi.organizationId,
    kullanici,
    depolama,
    durum: kullanici.asildi || depolama.asildi
      ? "asildi"
      : enYuksek >= YAKLASMA_ORANI ? "yaklasti" : "normal",
  };
}

/** Önce aşanlar, sonra yaklaşanlar; her grupta en doluluk oranı yüksek olan üstte. */
export function kotayaGoreSirala(durumlar: KotaDurumu[]): KotaDurumu[] {
  const agirlik = { asildi: 0, yaklasti: 1, normal: 2 } as const;
  const doluluk = (d: KotaDurumu) => Math.max(d.kullanici.oran, d.depolama.oran);
  return [...durumlar].sort((a, b) => agirlik[a.durum] - agirlik[b.durum] || doluluk(b) - doluluk(a));
}


/*
  EK KULLANICI (13.10.2026).

  Fiyat listesi "pakete dahil kullanıcı sayısını aşan her kullanıcı için
  249 TL/ay" diyordu ama sistemde karşılığı yoktu: `davetEngeli` limiti
  dolan kurumu yalnızca durduruyor, "paketinizi yükseltin" diyordu. Yani
  altıncı kullanıcıyı isteyen Başlangıç müşterisine liste 249 TL derken
  panel +4.000 TL diyordu — yayımlanmış bir taahhüdün karşılanmaması.

  Ölçüm AYRI BİR SAYAÇ TUTMUYOR: ek kullanıcı = aktif üye − dahil limit.
  Türetilmiş olması kendi kendini düzeltiyor; bir hesap pasife alınınca
  ücret aynı dönem içinde düşüyor. Ayrı bir sayaç tutsaydık pasife alma,
  silme ve davet iptali yollarının üçünü de ayrıca azaltmak gerekirdi ve
  biri unutulduğunda kurum ödemediği koltuğa fatura görürdü.

  Üst sınır (`cap`) hâlâ var: sınırsız açılan koltuk, kurumun onay
  vermediği bir faturaya dönüşür. Sınır dahil limitin ÜSTÜNE eklenir ve
  lisans satırında durur; kurucu kurum bazında yükseltebilir.
*/

/** Ücretlendirilen ek koltuk sayısı. Limit yoksa (lisans satırı yok) sıfır. */
export function ekKullaniciSayisi(aktifKullanici: number, limit: number | null | undefined): number {
  if (limit === null || limit === undefined) return 0;
  const l = Math.round(limit);
  if (l <= 0) return 0;
  return Math.max(0, Math.round(aktifKullanici || 0) - l);
}

/** Ek koltukların aylık bedeli, kuruş. */
export function ekKullaniciUcretiKurus(
  aktifKullanici: number,
  limit: number | null | undefined,
  birimKurus: number | null | undefined,
): number {
  const birim = Math.max(0, Math.round(birimKurus ?? 0));
  return ekKullaniciSayisi(aktifKullanici, limit) * birim;
}

/**
 * Yeni bir kullanıcı davet edilebilir mi; edilemezse sebebi.
 *
 * Denetim VERİTABANINDA değil burada: üyelikler auth.users üzerindeki bir
 * tetikleyiciden yazılıyor (activate_organization_owner_invitation), yani
 * veritabanı tarafında "bu yazma istemciden mi geliyor" ayrımı yapılamıyor.
 * Oraya konan bir koruma ya hiç çalışmaz ya da kurucunun kendi davetlerini
 * ve ürün köprülerini de keserdi. Davet akışı ise tek bir kapıdan geçiyor
 * (app/panel/hr/team-actions.ts), kural orada anlamlı.
 *
 * Kota bir yetki sınırı değil ticari sınır; bu yüzden RLS'in üç katmanlı
 * kuralına tabi değil.
 *
 * Eskiden dahil limit dolunca davet DURUYORDU. Artık duran yer dahil
 * limit + ek koltuk tavanı; arada kalan davetler ücretlendiriliyor ve
 * `ekUcretKurus` ile çağırana bildiriliyor (kullanıcı onu görmeden
 * davet göndermesin).
 *
 * @param limit Lisanstaki user_limit; null ise (lisans satırı yok) sınır
 *              uygulanmaz — olmayan bir limiti gerekçe gösterip daveti
 *              durdurmak, kurulumu yarım kalmış kurumu çalışmaz kılardı.
 * @param tavan Dahil limitin üstüne açılabilen ek koltuk sayısı.
 */
export function davetDurumu(girdi: {
  aktifKullanici: number;
  limit: number | null | undefined;
  tavan: number | null | undefined;
  birimKurus: number | null | undefined;
}): { engel: string | null; ekUcretKurus: number; yeniEkKoltuk: number } {
  const { aktifKullanici, limit } = girdi;
  if (limit === null || limit === undefined) return { engel: null, ekUcretKurus: 0, yeniEkKoltuk: 0 };
  const l = Math.round(limit);
  if (l <= 0) return { engel: null, ekUcretKurus: 0, yeniEkKoltuk: 0 };

  const aktif = Math.max(0, Math.round(aktifKullanici || 0));
  const tavan = Math.max(0, Math.round(girdi.tavan ?? 0));
  const birim = Math.max(0, Math.round(girdi.birimKurus ?? 0));

  // Davet GÖNDERİLDİKTEN sonraki durum hesaplanıyor: limite eşit olmak
  // aşım değil, on kullanıcılık pakette onuncu kullanıcı hakkın içinde.
  const sonra = aktif + 1;
  if (sonra > l + tavan) {
    return {
      engel: `Kullanıcı hakkınız doldu (${aktif}/${l} dahil, ${tavan} ek koltuk). Yeni kullanıcı için paketinizi yükseltin ya da kullanılmayan bir hesabı pasife alın.`,
      ekUcretKurus: 0,
      yeniEkKoltuk: 0,
    };
  }

  const yeniEkKoltuk = Math.max(0, sonra - l);
  return { engel: null, ekUcretKurus: yeniEkKoltuk * birim, yeniEkKoltuk };
}
