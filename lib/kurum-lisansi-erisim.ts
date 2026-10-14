/*
  Kuruma geçmiş bireysel abonenin erişimi (14.10.2026).

  Bireysel abone satırı bir kuruma bağlandığında (product_subscribers.kurum_id)
  erişim kararı kişinin kendi aboneliğinden değil kurumun o üründeki
  lisansından verilir. Kural konsolun "açık lisans" tanımıyla aynı:
  ödemesi gecikmiş kurum (past_due) KAPANMAZ — kapatma kurucunun kararı,
  askıya alma ya da iptalle olur. Deneme yalnızca süresi sürüyorsa açık.

  Kurumun o ürün için lisans satırı hiç yoksa kapalı: anlaşma kaydı
  girilmeden erişim açılmaz.
*/

export type KurumUrunLisansi = { status: string; trial_ends_at: string | null } | null | undefined;

export function kurumLisansiAcik(lisans: KurumUrunLisansi, simdi: number = Date.now()): boolean {
  if (!lisans) return false;
  if (lisans.status === "active" || lisans.status === "past_due") return true;
  if (lisans.status === "trialing") return Boolean(lisans.trial_ends_at && Date.parse(lisans.trial_ends_at) > simdi);
  return false;
}
