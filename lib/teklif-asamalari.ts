/*
  Teklif detayının üstündeki aşama çizgisi: Taslak → Gönderildi →
  Görüldü → Kabul → Sözleşme.

  "Görüldü" ayrı bir durum değil: teklif "sent" iken müşteri bağlantıyı
  açınca view_count artıyor. Kabul, durumdan ya da arşiv sebebinden
  (arşiv tetikleyicisi kabulü archive_reason'a yazıyor) okunur; teklifin
  sözleşmesi varsa son adım. Reddedilen, süresi dolan ve yeni revizyonla
  değişen teklif çizgide bir adıma düşmez, kapanış sebebi gösterilir.

  Saf modül: birim testi teklif-asamalari.test.ts.
*/

export const TEKLIF_ADIMLARI = ["Taslak", "Gönderildi", "Görüldü", "Kabul", "Sözleşme"] as const;

export type TeklifDurumu = {
  status: string;
  view_count: number | null;
  archive_reason: string | null;
  superseded_by: string | null;
  /** Bu tekliften üretilmiş, iptal edilmemiş sözleşme var mı. */
  sozlesmeVar: boolean;
};

export function teklifAdimi(t: TeklifDurumu): { adim: number | null; kapanis: string | null } {
  if (t.superseded_by) return { adim: null, kapanis: "Yeni revizyonla değiştirildi" };
  const kabul = t.status === "accepted" || t.archive_reason === "accepted";
  if (kabul || t.sozlesmeVar) return { adim: t.sozlesmeVar ? 4 : 3, kapanis: null };
  if (t.status === "rejected" || t.archive_reason === "rejected") return { adim: null, kapanis: "Müşteri reddetti" };
  if (t.status === "expired" || t.archive_reason === "expired") return { adim: null, kapanis: "Süresi doldu" };
  if (t.status === "archived") return { adim: null, kapanis: "Arşivlendi" };
  if (t.status === "sent") return { adim: (t.view_count ?? 0) > 0 ? 2 : 1, kapanis: null };
  return { adim: 0, kapanis: null };
}
