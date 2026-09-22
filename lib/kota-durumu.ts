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
}): KotaDurumu {
  const kullanici = olc(girdi.kullaniciSayisi, girdi.kullaniciLimiti);
  const aiKredi = olc(girdi.aiKullanilan, girdi.aiLimiti);
  const enYuksek = Math.max(kullanici.oran, aiKredi.oran);
  return {
    organizationId: girdi.organizationId,
    kullanici,
    aiKredi,
    durum: kullanici.asildi || aiKredi.asildi ? "asildi" : enYuksek >= YAKLASMA_ORANI ? "yaklasti" : "normal",
  };
}

/** Önce aşanlar, sonra yaklaşanlar; her grupta en doluluk oranı yüksek olan üstte. */
export function kotayaGoreSirala(durumlar: KotaDurumu[]): KotaDurumu[] {
  const agirlik = { asildi: 0, yaklasti: 1, normal: 2 } as const;
  const doluluk = (d: KotaDurumu) => Math.max(d.kullanici.oran, d.aiKredi.oran);
  return [...durumlar].sort((a, b) => agirlik[a.durum] - agirlik[b.durum] || doluluk(b) - doluluk(a));
}
