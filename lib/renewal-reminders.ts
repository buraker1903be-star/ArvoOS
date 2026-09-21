// Yaklaşan abonelik ödemeleri: Platform → Abonelikler'deki "Ödeme
// hatırlatmaları" listesinin saf kısmı. Veritabanına dokunmaz; testi
// tests/unit/renewal-reminders.test.ts.
//
// Otomatik karttan çekim yok (PayTR tekrarlayan ödeme kurulmadı); dönem
// sonu yaklaşan kurumlara kurucu WhatsApp'tan hatırlatır, kurum kendi
// panelinden kartla öder. Randevu salonu ArvoOS'a girmez: bağlantı
// Randevu'nun Ayarlar sayfasıdır.

import { productName } from "@/lib/products";

export type RenewalLicense = {
  organization_id: string;
  product: string;
  status: string;
  monthly_fee: number | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
};

export type RenewalOrganization = { id: string; name: string; display_name: string | null; contact_phone: string | null; kind?: string | null };

export type RenewalReminder = {
  organizationId: string;
  organizationName: string;
  product: string;
  productName: string;
  endsAt: string;
  /** Negatifse süresi geçmiş. */
  daysLeft: number;
  fee: number | null;
  message: string;
  whatsappUrl: string | null;
  /* Panelden şablonla gönderim için gerekenler. Şablon parametreleri
     ekranda değil burada hazırlanıyor: aynı biçimlendirme (tarih, tutar)
     hem serbest metinde hem şablonda kullanılsın, ikisi ayrışmasın. */
  trial: boolean;
  /** 905XXXXXXXXX; biçim tutmuyorsa null (kurucu elle arar). */
  phone: string | null;
  endsAtLabel: string;
  feeLabel: string | null;
};

const DAY = 86_400_000;
/** Kaç gün kala listeye girer; süresi geçenler 30 gün boyunca listede kalır. */
export const REMINDER_WINDOW_DAYS = 7;
const OVERDUE_DAYS = 30;

const PAY_URLS: Record<string, string> = {
  randevu: "https://randevu.arvo-os.com/panel/ayarlar",
};
const DEFAULT_PAY_URL = "https://app.arvo-os.com/panel/billing";

/** Türkiye cep numarası → wa.me; biçim tutmuyorsa null (kurucu elle arar). */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("90") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^5\d{9}$/.test(local) ? `90${local}` : null;
}

const trDate = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(kurus / 100);

export function renewalMessage(r: { organizationName: string; productName: string; product: string; endsAt: string; daysLeft: number; fee: number | null; trial: boolean }) {
  const what = r.trial ? `${r.productName} deneme süreniz` : `${r.productName} aboneliğiniz`;
  const when = r.daysLeft < 0 ? `${trDate(r.endsAt)} tarihinde sona erdi` : r.daysLeft === 0 ? "bugün sona eriyor" : r.daysLeft === 1 ? "yarın sona eriyor" : `${trDate(r.endsAt)} tarihinde (${r.daysLeft} gün sonra) sona eriyor`;
  const fee = r.fee ? ` Aylık ücret ${tl(r.fee)}.` : "";
  return `Merhaba, ${r.organizationName} için ${what} ${when}.${fee} Kesintisiz devam için ödemenizi kartla buradan yapabilirsiniz: ${PAY_URLS[r.product] ?? DEFAULT_PAY_URL}\n\nArvo`;
}

export function renewalReminders(licenses: RenewalLicense[], organizations: RenewalOrganization[], now: number): RenewalReminder[] {
  const byId = new Map(organizations.map((o) => [o.id, o]));
  return licenses
    .flatMap((license): RenewalReminder[] => {
      const organization = byId.get(license.organization_id);
      if (!organization || organization.kind === "internal") return [];
      const trial = license.status === "trialing";
      const endsAt = trial ? license.trial_ends_at : ["active", "past_due"].includes(license.status) ? license.current_period_end : null;
      if (!endsAt) return [];
      const daysLeft = Math.ceil((Date.parse(endsAt) - now) / DAY);
      if (daysLeft > REMINDER_WINDOW_DAYS || daysLeft < -OVERDUE_DAYS) return [];
      const organizationName = organization.display_name || organization.name;
      const name = productName(license.product);
      const fee = license.monthly_fee ? Number(license.monthly_fee) : null;
      const message = renewalMessage({ organizationName, productName: name, product: license.product, endsAt, daysLeft, fee, trial });
      const number = whatsappNumber(organization.contact_phone);
      return [{
        organizationId: organization.id, organizationName, product: license.product, productName: name, endsAt, daysLeft, fee, message,
        whatsappUrl: number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null,
        trial,
        phone: number,
        endsAtLabel: trDate(endsAt),
        feeLabel: fee ? tl(fee) : null,
      }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
