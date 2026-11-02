/*
  ZAMANLANMIŞ İŞİN ÇALIŞMA GEÇMİŞİ (02.11.2026) — saf. Sistem sağlığının
  iş satırı ve iş ayrıntısı ekranı; testi tests/unit/cron-gecmisi.test.ts.

  Sistem sağlığı her iş için yalnızca SON çalışmayı gösteriyordu. Bir
  arızada sorulan iki soru ise geçmişte: "ne zamandan beri düşüyor?" ve
  "sürekli mi düşüyor, arada bir mi?". İlki bir dağıtıma ya da anahtar
  değişikliğine işaret eder (o saatte ne değişti?), ikincisi karşı
  servisin dalgalanmasına. Kayıtlar zaten tutuluyordu (14 gün,
  platform_cron_kayitlari); okunmuyordu.
*/
import type { CronSonucu } from "./cron-isleri";

export type Kosu = { sonuc: CronSonucu; basladi_at: string; sure_ms: number | null; ayrinti?: unknown };

export type KosuOzeti = {
  /** Şu an süren başarısızlık dizisi (en yeniden geriye, "tamam" görülene kadar). */
  ardisikHata: number;
  /** O dizinin İLK çalışmasının zamanı: "ne zamandan beri". Dizi yoksa null. */
  hataBaslangici: string | null;
  /** Dizi okunan pencerenin sonuna kadar uzanıyorsa başlangıç daha da eski olabilir. */
  diziPencereyiAsiyor: boolean;
  /** Ortalama süre (ms), yalnızca süresi yazılmış çalışmalardan; yoksa null. */
  ortalamaMs: number | null;
};

/** `kosular` en yeniden eskiye sıralı olmalı (sorgu öyle okuyor). */
export function kosuOzeti(kosular: Kosu[]): KosuOzeti {
  let ardisik = 0;
  while (ardisik < kosular.length && kosular[ardisik].sonuc !== "tamam") ardisik += 1;
  const sureler = kosular.map((k) => k.sure_ms).filter((s): s is number => typeof s === "number");
  return {
    ardisikHata: ardisik,
    hataBaslangici: ardisik ? kosular[ardisik - 1].basladi_at : null,
    diziPencereyiAsiyor: ardisik > 0 && ardisik === kosular.length,
    ortalamaMs: sureler.length ? Math.round(sureler.reduce((t, s) => t + s, 0) / sureler.length) : null,
  };
}

/** Başarı oranı (%); hiç çalışma yoksa null. Sayılar head sorgularından gelir, listeden değil. */
export function basariOrani(toplam: number, basarili: number): number | null {
  return toplam ? Math.round((basarili / toplam) * 100) : null;
}

export function sureMetni(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn`;
  return `${Math.round(ms / 60_000)} dk`;
}
