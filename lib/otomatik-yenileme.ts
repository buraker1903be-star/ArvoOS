/*
  OTOMATİK YENİLEME KARARI (28.10.2026) — saf kural.
  Uygulayan: app/api/cron/otomatik-yenileme (her sabah, Türkiye saatiyle).

  Kayıtlı karttan çekim YALNIZCA müşterinin açıkça onay verdiği
  aboneliklerde (paytr_otomatik_yenileme; onay kaydı zorunlu). Gün farkı
  Türkiye gününe göre — sunucu UTC'de, gece yarısından sonraki çekim bir
  önceki güne sayılmasın (AGENTS.md; lib/abonelik-bildirimi ile aynı ölçü).

  Takvim:
   - Dönem sonundan 3 gün önce: hatırlatma ("… tarihinde kartınızdan X TL
     çekilecek"). Onay metni bunu vaat ediyor; hatırlatma gitmeden çekim
     yapılmaz — hatırlatmasız çekim harcama itirazının en güçlü dayanağı.
   - Dönem sonu günü ya da geçmişse: çekim. Dönem sonu 7 günden fazla
     geçtiyse çekim DENENMEZ: o kadar uzun süre kullanılmamış bir abonelik
     için habersiz çekim beklenmez; müşteri ödeme bağlantısı yoluna döner.
   - Günde en fazla bir deneme, toplam ÜÇ deneme. Üçüncü başarısızlıktan
     sonra otomatik yenileme durur ve müşteriye haber gider.
   - Kart bankaca kapatılmışsa (PayTR try_again=false) ya da son
     kullanma tarihi geçmişse hiç denenmez, hemen durur.
*/
import { gunFarki } from "@/lib/is-adimlari";

export const HATIRLATMA_GUNU = 3;
export const AZAMI_DENEME = 3;
export const AZAMI_GECIKME_GUNU = 7;

const gunAnahtari = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });

/** Bir anın (ISO) Türkiye günü (YYYY-MM-DD). */
export const turkiyeGunu = (an: string) => gunAnahtari.format(new Date(an));

export type YenilemeDurumu = {
  /** Dönem sonu (ISO). Yoksa (lisans okunamadı ya da süresiz) karar "bekle". */
  donemSonu: string | null;
  bugun: string;
  denemeSayisi: number;
  /** Son denemenin Türkiye günü; aynı gün ikinci deneme yapılmaz. */
  sonDenemeGunu: string | null;
  /** Hatırlatmanın gönderildiği dönemin sonu (Türkiye günü). */
  hatirlatilanDonem: string | null;
  kartSuresiGecti: boolean;
  /** Bekleyen (bildirimi gelmemiş) bir otomatik çekim var mı. */
  bekleyenCekim: boolean;
};

export type YenilemeKarari =
  | { tur: "bekle" }
  | { tur: "hatirlat"; donem: string }
  | { tur: "cek"; donem: string }
  | { tur: "durdur"; neden: "kart-suresi" | "deneme-bitti" | "cok-gecikti" };

export function yenilemeKarari(d: YenilemeDurumu): YenilemeKarari {
  if (!d.donemSonu || d.bekleyenCekim) return { tur: "bekle" };
  const donem = turkiyeGunu(d.donemSonu);
  const kalan = gunFarki(d.bugun, donem);

  if (kalan > HATIRLATMA_GUNU) return { tur: "bekle" };
  if (d.kartSuresiGecti) return { tur: "durdur", neden: "kart-suresi" };
  if (kalan > 0) return d.hatirlatilanDonem === donem ? { tur: "bekle" } : { tur: "hatirlat", donem };

  if (-kalan > AZAMI_GECIKME_GUNU) return { tur: "durdur", neden: "cok-gecikti" };
  if (d.denemeSayisi >= AZAMI_DENEME) return { tur: "durdur", neden: "deneme-bitti" };
  if (d.sonDenemeGunu === d.bugun) return { tur: "bekle" };
  /* Hatırlatma hiç gitmediyse (yenileme dönem sonuna 3 günden az kala
     açıldı ya da iş o günlerde koşmadı) önce hatırlatılır; çekim ertesi
     güne kalır. Onay metninin vaadi bu. */
  if (d.hatirlatilanDonem !== donem) return { tur: "hatirlat", donem };
  return { tur: "cek", donem };
}

const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const uzunTarih = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });

/** Müşteriye giden bildirimlerin metni. */
export function yenilemeBildirimi(g:
  | { tur: "hatirlat"; urun: string; donem: string; tutar: number | null; son4: string }
  | { tur: "basarisiz"; urun: string; mesaj: string; kalanDeneme: number }
  | { tur: "durdu"; urun: string; neden: "kart-suresi" | "deneme-bitti" | "cok-gecikti" | "kart-kapali" | "onay-gecersiz" },
): { baslik: string; metin: string } {
  switch (g.tur) {
    case "hatirlat":
      return {
        baslik: `${g.urun} aboneliğiniz otomatik yenilenecek`,
        metin: `${uzunTarih.format(new Date(`${g.donem}T12:00:00Z`))} tarihinde •••• ${g.son4} kartınızdan ${g.tutar ? tl(g.tutar) : "dönem ücreti"} çekilecek. Otomatik yenilemeyi hesabınızdaki ödeme ekranından kapatabilirsiniz.`,
      };
    case "basarisiz":
      return {
        baslik: `${g.urun} otomatik yenilemesi alınamadı`,
        metin: g.kalanDeneme > 0
          ? `Kartınızdan çekim yapılamadı: ${g.mesaj}. Yarın yeniden denenecek (kalan ${g.kalanDeneme} deneme). İsterseniz hesabınızdaki ödeme ekranından şimdi ödeyebilirsiniz.`
          : `Kartınızdan çekim yapılamadı: ${g.mesaj}. Ödemenizi hesabınızdaki ödeme ekranından yapabilirsiniz.`,
      };
    case "durdu": {
      const neden = {
        "kart-suresi": "Kayıtlı kartınızın son kullanma tarihi geçti.",
        "deneme-bitti": "Üç denemede de kartınızdan çekim yapılamadı.",
        "cok-gecikti": "Dönem sonunun üzerinden bir haftadan fazla geçti.",
        "kart-kapali": "Bankanız kartınızın bu işleme kapalı olduğunu bildirdi.",
        "onay-gecersiz": "Otomatik yenilemeyi onaylayan kullanıcının hesabı artık yok; onayın yenilenmesi gerekiyor.",
      }[g.neden];
      return {
        baslik: `${g.urun} otomatik yenilemesi durdu`,
        metin: `${neden} Aboneliğinizi sürdürmek için hesabınızdaki ödeme ekranından kartla ya da havaleyle ödeyin; dilerseniz yeni kartınızı kaydedip otomatik yenilemeyi yeniden açın.`,
      };
    }
  }
}
