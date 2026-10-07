/*
  Posta ekranlarının tarih biçimi. Sunucu UTC'de çalışıyor; kullanıcı
  Türkiye saatini bekliyor (AGENTS.md "Tarih Türkiye saatiyle").
*/
export function istanbulTarihSaat(deger: string | null | undefined): string {
  if (!deger) return "—";
  const tarih = new Date(deger);
  if (Number.isNaN(tarih.getTime())) return "—";
  return tarih.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/** Ek dosya boyutu. Gmail bayt veriyor; ekranda okunabilir olmalı. */
export function dosyaBoyutu(bayt: number): string {
  if (!Number.isFinite(bayt) || bayt <= 0) return "";
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${Math.round(bayt / 1024)} KB`;
  return `${(bayt / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
