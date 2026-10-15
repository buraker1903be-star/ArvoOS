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

/*
  FORM ALANINDAKİ TUTARI KURUŞA ÇEVİRİR.

  Çağrı yerlerinin hepsi `Math.round(Number(formData.get("amount")) * 100)`
  yazıyordu ve bu, Türkçe yazılmış bir tutarı BİNDE BİRE indiriyor:
  "5.000" (beş bin) → Number → 5 → 500 kuruş → ₺5,00.

  Tarayıcı bunu engellemiyor. 15.10.2026'da cari hesabın tahsilat
  kutusunda ölçüldü (Chrome, tr-TR, `input type="number" step="0.01"`):
  kutuya 5.000 yazılınca value "5.000", valueAsNumber 5, checkValidity()
  true — yani ekranda beş bin yazıyor, hiçbir uyarı çıkmıyor ve para
  kütüğüne ₺5,00 giriyor. Noktayı binlik ayırıcı olarak kullanmak
  Türkçe'de doğal yazım; kullanıcı yanlış bir şey yapmıyor.

  Metin kutusuyla (inputMode="decimal") kullanılan beş form zaten
  parseTurkishAmount'tan geçiyordu — bu yardımcı kuralı geri kalanına da
  taşıyor ve iki giriş biçiminde de aynı sonucu veriyor.

  Boş alan 0 döner (eski davranış); geçersiz metin NaN döner, çağıran
  `Number.isFinite` ile zaten eliyor.
*/
export function kurusOku(deger: FormDataEntryValue | null | undefined) {
  const metin = String(deger ?? "").trim();
  if (!metin) return 0;
  return Math.round(parseTurkishAmount(metin) * 100);
}

/*
  KURUŞU FORM KUTUSUNA YAZILACAK TÜRKÇE TUTARA ÇEVİRİR: 3000000 → "30.000,00".

  Para kutuları `type="number"` değil metin (inputMode="decimal"): sayı
  kutusu Türkçe yazımı ya binde bire indiriyor ("5.000" → 5) ya da iki
  ayırıcılı tutarı ("1.234.567") tamamen reddedip kutuyu boşaltıyordu.
  Metin kutusunda varsayılan değerin de Türkçe olması gerekiyor — yoksa
  kutuda "30000.00" yazıyor, kullanıcı onu düzeltmeden kaydedince
  kurusOku nokta ondalığı okuyup doğru sonucu veriyor ama ekranda
  gördüğü şey kendi yazımı değil.

  Para birimi SİMGESİZ: değer doğrudan kutuya giriyor, kullanıcı üstüne
  yazıyor. Gösterim (okunan tutar) için ekranların kendi `money()`
  yardımcıları var.
*/
export function liraYazisi(kurus: number) {
  return (Number(kurus) / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
