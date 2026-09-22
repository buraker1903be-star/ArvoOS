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

export type KotaDurumu = {
  organizationId: string;
  kullanici: KotaOlcumu;
  aiKredi: KotaOlcumu;
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
  aiKullanilan: number;
  aiLimiti: number;
  /** Kullanılan depolama, BAYT. Ölçüm yoksa 0. */
  depolamaBayt?: number;
  /** Lisanstaki storage_limit_mb. */
  depolamaLimitiMb?: number;
}): KotaDurumu {
  const kullanici = olc(girdi.kullaniciSayisi, girdi.kullaniciLimiti);
  const aiKredi = olc(girdi.aiKullanilan, girdi.aiLimiti);
  /*
    Depolama megabayta çevrilip öyle ölçülüyor: limit MB cinsinden
    giriliyor ve iki farklı birimi karşılaştırmak, oranı bin katı yanlış
    hesaplamak demekti. Yukarı yuvarlıyoruz — 0,4 MB'lık bir dosyayı
    "0 MB" saymak, limiti dolmuş bir kurumu boş göstermeye giden yol.
  */
  const depolama = olc(Math.ceil((girdi.depolamaBayt ?? 0) / (1024 * 1024)), girdi.depolamaLimitiMb ?? 0);
  const enYuksek = Math.max(kullanici.oran, aiKredi.oran, depolama.oran);
  return {
    organizationId: girdi.organizationId,
    kullanici,
    aiKredi,
    depolama,
    durum: kullanici.asildi || aiKredi.asildi || depolama.asildi
      ? "asildi"
      : enYuksek >= YAKLASMA_ORANI ? "yaklasti" : "normal",
  };
}

/** Önce aşanlar, sonra yaklaşanlar; her grupta en doluluk oranı yüksek olan üstte. */
export function kotayaGoreSirala(durumlar: KotaDurumu[]): KotaDurumu[] {
  const agirlik = { asildi: 0, yaklasti: 1, normal: 2 } as const;
  const doluluk = (d: KotaDurumu) => Math.max(d.kullanici.oran, d.aiKredi.oran, d.depolama.oran);
  return [...durumlar].sort((a, b) => agirlik[a.durum] - agirlik[b.durum] || doluluk(b) - doluluk(a));
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
 * @param limit Lisanstaki user_limit; null ise (lisans satırı yok) sınır
 *              uygulanmaz — olmayan bir limiti gerekçe gösterip daveti
 *              durdurmak, kurulumu yarım kalmış kurumu çalışmaz kılardı.
 */
export function davetEngeli(aktifKullanici: number, limit: number | null | undefined): string | null {
  if (limit === null || limit === undefined) return null;
  const l = Math.round(limit);
  if (l <= 0) return null;
  // Limite EŞİT olmak aşım değil: 10 kullanıcılık pakette onuncu kullanıcı
  // hakkın içinde. Yeni davet on birinciyi yaratacağı için burada bakılıyor.
  if (aktifKullanici < l) return null;
  return `Kullanıcı limitiniz dolu (${aktifKullanici}/${l}). Yeni kullanıcı davet etmek için paketinizi yükseltin ya da kullanılmayan bir hesabı pasife alın.`;
}
