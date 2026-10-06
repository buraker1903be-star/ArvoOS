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
