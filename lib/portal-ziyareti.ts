/*
  MÜŞTERİ TAKİP PORTALI ZİYARETİ (12.10.2026).

  Kurum, takip kodunu gönderdiği müşterinin portala girip girmediğini ve
  şu an ekranda olup olmadığını göremiyordu. Kayıt veritabanında
  (crm_contract_portal_visits, kapı işlevi arvo_tracking_guard yazıyor);
  bu saf modül kaydı ekrandaki duruma çeviriyor.

  ÇEVRİMİÇİ: takip ekranı sekme görünürken 20 sn'de bir yenileniyor
  (app/takip/takip-form.tsx POLL_MS) ve her yenileme "son görülme"yi
  yazıyor. İki yenilemeyi kaçırma payıyla son 70 sn'de görülen müşteri
  ekranda sayılır. Sekme arka plandaysa yenileme durur; müşteri o an
  "çevrimiçi" görünmez — doğru olan da bu, ekrana bakmıyor.

  Saf modül; testi tests/unit/portal-ziyareti.test.ts.
*/

export const CEVRIMICI_ESIGI_MS = 70_000;

export type PortalZiyaretKaydi = {
  first_login_at: string | null;
  last_login_at: string | null;
  login_count: number;
  last_seen_at: string;
};

export type PortalDurumu =
  | { tur: "hic"; }
  | { tur: "cevrimici"; sonGiris: string | null; girisSayisi: number }
  | { tur: "cevrimdisi"; sonGorulme: string; sonGiris: string | null; girisSayisi: number };

export function portalDurumu(kayit: PortalZiyaretKaydi | null | undefined, simdi: number): PortalDurumu {
  if (!kayit) return { tur: "hic" };
  const gorulme = Date.parse(kayit.last_seen_at);
  if (Number.isFinite(gorulme) && simdi - gorulme <= CEVRIMICI_ESIGI_MS && simdi >= gorulme - 5_000) {
    return { tur: "cevrimici", sonGiris: kayit.last_login_at, girisSayisi: kayit.login_count };
  }
  return { tur: "cevrimdisi", sonGorulme: kayit.last_seen_at, sonGiris: kayit.last_login_at, girisSayisi: kayit.login_count };
}

const TZ = "Europe/Istanbul";
const gunAnahtari = (an: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(an);
const saat = (an: number) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(an);

/** "bugün 14:03", "dün 09:12", "8 Eki 14:03" (Türkiye saatiyle). */
export function zamanYazisi(iso: string, simdi: number): string {
  const an = Date.parse(iso);
  if (!Number.isFinite(an)) return "—";
  const gun = gunAnahtari(an);
  if (gun === gunAnahtari(simdi)) return `bugün ${saat(an)}`;
  if (gun === gunAnahtari(simdi - 86_400_000)) return `dün ${saat(an)}`;
  const tarih = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", ...(gun.slice(0, 4) !== gunAnahtari(simdi).slice(0, 4) ? { year: "numeric" } : {}) }).format(an);
  return `${tarih} ${saat(an)}`;
}

/** Şimdiki an; bileşen gövdesinde Date.now() doğrudan çağrılmasın diye (React saflık kuralı). */
export const simdiAn = () => Date.now();
