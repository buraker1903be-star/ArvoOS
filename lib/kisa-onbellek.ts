/*
  SUNUCUDA KISA ÖMÜRLÜ ÖNBELLEK (13.10.2026, hızlandırma).

  Kurumun kendi alan adında (akademikmerkez.com) HER istekte üç çağrı
  gidiyordu: proxy alan adını kuruma çözüyor (resolve_organization_by_domain),
  sayfa başlığı aynı çözümü tekrarlıyor, sonra marka okunuyor. Yavaş sorgu
  günlüğünde alan adı çözümü ortalama 0,58 sn, en kötü 1,36 sn sürüyordu —
  dakikalarca değişmeyen bir bilgi için.

  Sunucu örneği (sıcak fonksiyon) ömrünce bellekte; SÜRE kısa tutuldu:
  alan adı kaldırılırsa ya da marka değişirse en geç bu süre sonra
  yansır. Yalnızca KAMUSAL bilgi (alan adı → kurum, logo/renk) için;
  kişiye ya da yetkiye bağlı hiçbir şey burada saklanmaz. Hata sonuçları
  saklanmaz (bir anlık arıza bir dakika boyunca tekrarlanmasın).
*/
const SURE_MS = 60_000;
const ENCOK = 500;

type Kayit<T> = { deger: T; bitis: number };
const kutular = new Map<string, Map<string, Kayit<unknown>>>();

export async function kisaOnbellek<T>(kutu: string, anahtar: string, getir: () => Promise<T>, saklanabilir: (deger: T) => boolean = () => true): Promise<T> {
  let harita = kutular.get(kutu);
  if (!harita) kutular.set(kutu, (harita = new Map()));
  const simdi = Date.now();
  const kayit = harita.get(anahtar) as Kayit<T> | undefined;
  if (kayit && kayit.bitis > simdi) return kayit.deger;
  const deger = await getir();
  if (saklanabilir(deger)) {
    // Sınırsız büyümesin: dolunca en eski kayıt atılır (Map ekleme sırasını korur).
    if (harita.size >= ENCOK) harita.delete(harita.keys().next().value as string);
    harita.set(anahtar, { deger, bitis: simdi + SURE_MS });
  }
  return deger;
}
