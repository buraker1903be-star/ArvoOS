/*
  DOÇENTLİK — EKSİKSİZ OKUMA (F6 PR6b son kabul, 15.11.2026).

  Puan, faaliyet sayısı ve dönem birer SONUÇ: eksik okunan bir liste
  ekranda yanlış değil, EMİN EMİN yanlış bir sayı olur (AGENTS.md: rakam
  denetimi). Eskiden üç hata vardı:
   - kisiOzeti, kurumun bütün faaliyet dönemlerini TEK çağrıyla okuyordu;
     PostgREST'in satır tavanını (1000) aşan kurumda kişinin faaliyetleri
     "bilinmiyor" dönemine düşüyor, doktora sonrası puan eksik çıkıyordu;
   - gözetim listesi profil özetlerini tek çağrıyla okuyordu;
   - sayfalı döngüler "kısa sayfa = son sayfa" varsayıyordu: sunucunun
     satır tavanı 1000'den küçük ayarlanırsa (max-rows) ilk sayfada
     sessizce dururlardı.

  Bu yardımcı bitişi sayfanın KISALIĞINDAN değil, PostgREST'in verdiği
  TOPLAMDAN (count: "exact") anlar; sayfa başlangıcını istenen boy kadar
  değil GELEN satır kadar ilerletir (küçük tavan da tam okunur). Sonunda
  eksiksizlik denetimi yapar: toplam sayfadan sayfaya değiştiyse, bir
  anahtar iki kez geldiyse (kararsız sıralama ya da okuma sırasında
  ekleme/silme) ya da toplam tutmuyorsa FIRLATIR — eksik bir listeyle
  hesap yapmak yerine "yeniden deneyin" demek doğru taraf.

  Sıralama anahtarı BENZERSİZ olmalı (faaliyet kimliği, kişi kimliği):
  benzersiz olmayan anahtarla aralık okumak aynı satırı iki sayfada
  gösterebilir, bir başkasını hiç göstermeyebilir. Saf modül: Supabase'e
  dokunmuyor, okuyucu dışarıdan veriliyor (tests/unit/docentlik-sayfalama).
*/

export const DOCENTLIK_SAYFA_BOYU = 1000;

export type SayfaSonucu<T> = { data: T[] | null; error: unknown; count?: number | null };
export type SayfaOkuyucu<T> = (bas: number, son: number) => PromiseLike<SayfaSonucu<T>>;

export class EksikOkumaHatasi extends Error {
  constructor(ad: string, neden: string) {
    super(`${ad} eksiksiz okunamadı (${neden}). Sayfayı yenileyip yeniden deneyin.`);
    this.name = "EksikOkumaHatasi";
  }
}

export async function hepsiniOku<T>(
  oku: SayfaOkuyucu<T>,
  secenek: {
    ad: string;
    anahtar: (satir: T) => string;
    /** Supabase hatasını panelin mesajıyla fırlatır (okunamadiysaFirlat). */
    hataVarsa: (error: unknown) => void;
    sayfaBoyu?: number;
    /** Sonsuz döngüye karşı üst sınır; sayfa sayısı değil SATIR. */
    azami?: number;
  },
): Promise<T[]> {
  const boy = secenek.sayfaBoyu ?? DOCENTLIK_SAYFA_BOYU;
  const azami = secenek.azami ?? 1_000_000;
  const satirlar: T[] = [];
  let toplam: number | null = null;
  for (let bas = 0; toplam === null || satirlar.length < toplam; ) {
    const { data, error, count } = await oku(bas, bas + boy - 1);
    secenek.hataVarsa(error);
    if (typeof count !== "number") throw new EksikOkumaHatasi(secenek.ad, "toplam kayıt sayısı alınamadı");
    if (toplam === null) toplam = count;
    else if (count !== toplam) throw new EksikOkumaHatasi(secenek.ad, "kayıtlar okunurken değişti");
    if (toplam > azami) throw new EksikOkumaHatasi(secenek.ad, `${toplam} kayıt üst sınırı aşıyor`);
    const sayfa = data ?? [];
    if (sayfa.length === 0) {
      if (satirlar.length < toplam) throw new EksikOkumaHatasi(secenek.ad, `${satirlar.length}/${toplam} kayıt geldi`);
      break;
    }
    satirlar.push(...sayfa);
    bas += sayfa.length;
  }
  const gorulen = new Set<string>();
  for (const s of satirlar) {
    const k = secenek.anahtar(s);
    if (gorulen.has(k)) throw new EksikOkumaHatasi(secenek.ad, "aynı kayıt iki kez geldi");
    gorulen.add(k);
  }
  if (satirlar.length !== toplam) throw new EksikOkumaHatasi(secenek.ad, `${satirlar.length}/${toplam} kayıt geldi`);
  return satirlar;
}
