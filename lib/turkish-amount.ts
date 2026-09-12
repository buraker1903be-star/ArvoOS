// Türkçe yazılmış tutarı sayıya çevirir: "1.500" ve "1.500,00" bin ayırıcılı,
// "1500,5" ondalıklı kabul edilir; ₺/TL ve boşluklar yok sayılır.
// Eskiden yalnızca virgül noktaya çevriliyordu; "1.500" TL, 1,50 TL diye
// kaydediliyordu.
export function parseTurkishAmount(raw: string) {
  const value = raw.replace(/\s|₺|TL/gi, "");
  if (value.includes(",")) return Number(value.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) return Number(value.replace(/\./g, ""));
  return Number(value);
}
