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
