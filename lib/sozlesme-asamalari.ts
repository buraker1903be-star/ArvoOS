/*
  Sözleşme detayının üstündeki aşama çizgisi: Taslak → İmzaya gönderildi
  → Görüldü → İmzalandı → İş başladı.

  "Görüldü" ayrı bir durum değil: sözleşme "sent" iken müşteri bağlantıyı
  açınca view_count artıyor. İmzalı sözleşmenin iş akışı açıldıysa ya da
  sözleşme tamamlandıysa son adım. Reddedilen ve iptal edilen sözleşme
  çizgide bir adıma düşmez, kapanış sebebi gösterilir.

  Saf modül: birim testi sozlesme-asamalari.test.ts.
*/

export const SOZLESME_ADIMLARI = ["Taslak", "İmzaya gönderildi", "Görüldü", "İmzalandı", "İş başladı"] as const;

export type SozlesmeDurumu = {
  status: string;
  view_count: number | null;
  workflow_id: string | null;
};

export function sozlesmeAdimi(s: SozlesmeDurumu): { adim: number | null; kapanis: string | null } {
  if (s.status === "rejected") return { adim: null, kapanis: "Müşteri reddetti" };
  if (s.status === "cancelled") return { adim: null, kapanis: "İptal edildi" };
  if (s.status === "completed") return { adim: 4, kapanis: null };
  if (s.status === "signed") return { adim: s.workflow_id ? 4 : 3, kapanis: null };
  if (s.status === "sent") return { adim: (s.view_count ?? 0) > 0 ? 2 : 1, kapanis: null };
  return { adim: 0, kapanis: null };
}
