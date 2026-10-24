/*
  RAPOR İKON ADLARI — derleyicinin bağladığı liste (2026-10-24).

  `Icon` bileşeni adı `string` alıyordu ve haritada olmayan bir ad
  verildiğinde BOŞ bir `<svg>` çiziyordu: hata yok, uyarı yok, yalnızca
  görünmeyen bir ikon. Tam bu oldu — pencereye "download" adıyla bir
  indirme ikonu kondu, haritada o ad yoktu ve düğme ikonsuz çıktı.
  (Aynı sınıf hata panelde daha önce de görüldü: `background:`
  kısayolu select okunu silmişti ve derleme ile denetimlerin hepsi
  yeşildi.)

  Adlar burada, çizimler `rapor-parcalari.tsx`'te: harita
  `Record<IkonAdi, ReactNode>` olarak yazıldığı için eksik bir çizim
  DERLEME hatası, listede olmayan bir ad da derleme hatası. Liste saf
  bir modülde çünkü rapor tanımları (lib/rapor-tanimlari.ts) da bunu
  kullanıyor ve JSX'e bağlanamaz.
*/
export const IKON_ADLARI = [
  "inbox", "chat", "badge", "doc", "seal", "spark",
  "briefcase", "chart", "wallet", "flow", "alert", "users", "heart",
  "indir",
] as const;

export type IkonAdi = (typeof IKON_ADLARI)[number];
