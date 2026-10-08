// Türkiye tarihi (Europe/Istanbul, UTC+3, yaz saati yok). Sunucu (Vercel)
// UTC'de çalışıyor; new Date().toISOString().slice(0, 10) gece 00:00–03:00
// arasında bir önceki günü veriyordu. Ayın 1'inde gece girilen tahsilat bu
// yüzden önceki aya düşüyordu.
export function todayInIstanbul(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// "YYYY-MM-DD" Türkiye gece yarısının UTC anı (timestamptz karşılaştırmaları için).
export function istanbulMidnight(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+03:00`);
}

// Verilen yıl/ay (1–12, taşma serbest) için ayın ilk günü, "YYYY-MM-DD".
export function monthStartKey(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

/*
  İçinde bulunulan ayın İLK ANI (Türkiye gece yarısı), UTC olarak.

  Dönemsel sayımların alt sınırı. lib/urun-kullanimi.ts bunu kendi içinde
  yeniden hesaplıyordu ve UTC gece yarısı üretiyordu — yani Türkiye'de ayın
  1'inde saat 03:00. Ayın ilk üç saatinde kaydedilen kullanım o ayın
  sayımına girmiyordu; önceki ayın penceresi de kapandığı için hiçbir aya
  girmiyordu. Ölçüm her ay üç saat kaybediyordu ve bu doğrudan kredi/kota
  kararına giriyor.
*/
export function istanbulMonthStart(date: Date = new Date()) {
  const [year, month] = todayInIstanbul(date).split("-");
  return istanbulMidnight(`${year}-${month}-01`);
}

/*
  Formdan gelen Türkiye tarih ve saatini ("2026-10-08", "14:00") UTC anına
  çevirir; geçersizse null. Eskiden randevu kaydı new Date("…T14:00:00")
  yazıyordu: dilim belirtilmeyince sunucunun yerel saati sayılıyor ve UTC'de
  çalışan sunucuda 14:00 randevusu 17:00 (Türkiye) olarak kaydediliyordu.
*/
export function istanbulTimestamp(dateKey: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const an = new Date(`${dateKey}T${time}:00+03:00`);
  return Number.isNaN(an.getTime()) ? null : an;
}

// Bir anın Türkiye saatiyle "14:00" gösterimi (sunucu UTC'de olsa da).
export function istanbulTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
