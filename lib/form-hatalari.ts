/*
  FORM HATA METİNLERİ — SAF KURAL (10.11.2026, ortak form kontrolleri).

  Neden ayrı: tarayıcının kendi doğrulama balonu (required, minLength,
  type=email) bir sonraki tıklamada kayboluyor, alana bağlı kalıcı bir metin
  bırakmıyor ve dili tarayıcıya göre değişiyor. Ortak form alanı
  (app/panel/components/form-alani.tsx) hatayı alanın ALTINDA, aria ile
  bağlı ve simgeli yazıyor; metni buradan alıyor. Saf olduğu için birim
  testi var (tests/unit/form-hatalari.test.ts).
*/

/** Tarayıcının ValidityState'inden ihtiyaç duyulan kısım (test edilebilsin diye düz nesne). */
export type AlanGecerliligi = {
  valueMissing?: boolean;
  tooShort?: boolean;
  tooLong?: boolean;
  typeMismatch?: boolean;
  patternMismatch?: boolean;
  rangeUnderflow?: boolean;
  rangeOverflow?: boolean;
  badInput?: boolean;
};

export type AlanBilgisi = {
  /** Kullanıcının gördüğü etiket ("Talep konusu"). */
  etiket: string;
  /** input type: email, tel, date… */
  tur?: string;
  /** Seçim kutusu mu (boşsa "seçin", metin kutusunda "yazın" denir). */
  secim?: boolean;
  minLength?: number;
  maxLength?: number;
};

/** Geçersiz alan için tek cümlelik, ne yapılacağını söyleyen metin; geçerliyse null. */
export function alanHatasi(gecerlilik: AlanGecerliligi, alan: AlanBilgisi): string | null {
  const { etiket } = alan;
  if (gecerlilik.valueMissing) return alan.secim ? `${etiket} seçin.` : `${etiket} boş bırakılamaz.`;
  if (gecerlilik.tooShort) return `${etiket} en az ${alan.minLength ?? 2} karakter olmalı.`;
  if (gecerlilik.tooLong) return `${etiket} en fazla ${alan.maxLength} karakter olabilir.`;
  if (gecerlilik.typeMismatch && alan.tur === "email") return "Geçerli bir e-posta adresi yazın (ör. ad@alan.com).";
  if (gecerlilik.typeMismatch || gecerlilik.patternMismatch || gecerlilik.badInput) return `${etiket} biçimi geçersiz.`;
  if (gecerlilik.rangeUnderflow || gecerlilik.rangeOverflow) return `${etiket} izin verilen aralığın dışında.`;
  return null;
}

/*
  Sunucunun doğrulama mesajını alana eşler: istemci denetimi atlanmışsa
  (eski tarayıcı, doğrudan çağrı) hata yine ilgili alanın altına düşsün.
  Eşleşmeyen mesaj alansızdır ve formun genel hata kutusunda kalır.
  Eşleme MESAJIN BAŞINA bakar; mesaj metni değişirse burası da değişmeli
  (birim testi createOpportunity'nin bugünkü cümlelerini sabitliyor).
*/
const SUNUCU_ALANLARI: { bas: string; alan: string }[] = [
  { bas: "Talep konusu", alan: "title" },
  { bas: "Müşteri veya kurum adı", alan: "customer_name" },
  { bas: "Diğer hizmet türünü", alan: "other_service_type" },
];

export function sunucuHatasiAlani(mesaj: string): string | null {
  return SUNUCU_ALANLARI.find((k) => mesaj.startsWith(k.bas))?.alan ?? null;
}

/** Sunucu işleminin forma döndürdüğü sonuç (lib/panel-action · runPanelActionDurumlu). */
export type FormSonucu = { tamam: true; kimlik: number } | { tamam: false; hata: string; alan: string | null; kimlik: number };

/** "2 alanı kontrol edin" — özet satırı. */
export function hataOzeti(sayi: number): string {
  return sayi === 1 ? "1 alanı kontrol edin." : `${sayi} alanı kontrol edin.`;
}
