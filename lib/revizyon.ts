// Teslim sonrası ücretsiz revizyon penceresi.
//
// Saf modül (Next/React/Supabase yok): testi tests/unit/revizyon.test.ts.
// Veritabanı tarafı: supabase/migrations/20261001090934_revizyon_penceresi.sql
//
// "2 ay ücretsiz revizyon" sözleşme metninde bir cümleydi; panelde hiçbir
// karşılığı yoktu. Hakkın ne zaman dolduğunu kimse bilmiyor, dolmuş bir
// hak için ücretsiz çalışılıyor ya da dolmamış bir hak reddediliyordu.

import { gunFarki, isoGunMu } from "./is-adimlari";

export type RevizyonDurumu = "open" | "ending_soon" | "ended";

/*
  Bitimine bu kadar gün kala uyarı çıkıyor. Bir hafta, müşteriyi arayıp
  "başka düzeltme var mı" diye sormaya yetecek en kısa süre; adım
  terminlerindeki üç günlük eşikten bilerek uzun, çünkü burada yapılacak
  iş bizde değil müşteride.
*/
export const REVIZYON_UYARI_GUN = 7;

export interface RevizyonBilgisi {
  durum: RevizyonDurumu;
  /** Bitişe kalan gün; geçmişse negatif. */
  kalanGun: number;
}

/** Pencere yoksa (süre tanımlı değil) null. */
export function revizyonBilgisi(revisionUntil: string | null, bugun: string): RevizyonBilgisi | null {
  if (!isoGunMu(revisionUntil)) return null;
  const kalanGun = gunFarki(bugun, revisionUntil);
  const durum: RevizyonDurumu =
    kalanGun < 0 ? "ended" : kalanGun <= REVIZYON_UYARI_GUN ? "ending_soon" : "open";
  return { durum, kalanGun };
}

export const REVIZYON_TONLARI: Record<RevizyonDurumu, string> = {
  open: "success",
  ending_soon: "warning",
  ended: "neutral",
};

const GUN_YAZ = (iso: string) => iso.split("-").reverse().join(".");

/** Kartta tek satır: "Revizyon hakkı 20.12.2026'ya kadar · 47 gün kaldı". */
export function revizyonOzeti(revisionUntil: string | null, bugun: string): string | null {
  const bilgi = revizyonBilgisi(revisionUntil, bugun);
  if (!bilgi) return null;
  const tarih = GUN_YAZ(revisionUntil as string);
  if (bilgi.kalanGun < 0) return `Revizyon hakkı ${tarih} tarihinde doldu`;
  if (bilgi.kalanGun === 0) return `Revizyon hakkı bugün doluyor (${tarih})`;
  return `Revizyon hakkı ${tarih} tarihine kadar · ${bilgi.kalanGun} gün kaldı`;
}

export interface RevizyonSatiri {
  id: string;
  organization_id: string;
  title: string | null;
  customer_name: string | null;
  revision_until: string | null;
  revision_reminder_state: string | null;
  assigned_employee_id: string | null;
}

export interface RevizyonUyarisi {
  is: RevizyonSatiri;
  durum: Exclude<RevizyonDurumu, "open">;
  baslik: string;
  mesaj: string;
}

/*
  Hangi işler için uyarı gidecek. Aynı uyarı iki kez gitmiyor: en son hangi
  durum için gönderildiği işte yazılı (revision_reminder_state) ve yalnızca
  değiştiğinde yeniden gidiyor — adım terminlerindeki kalıbın aynısı.
*/
export function revizyonUyarilari(isler: RevizyonSatiri[], bugun: string): RevizyonUyarisi[] {
  const uyarilar: RevizyonUyarisi[] = [];
  for (const is of isler) {
    const bilgi = revizyonBilgisi(is.revision_until, bugun);
    if (!bilgi || bilgi.durum === "open") continue;
    if (bilgi.durum === is.revision_reminder_state) continue;
    const ad = is.customer_name?.trim() || is.title?.trim() || "Müşteri";
    uyarilar.push({
      is,
      durum: bilgi.durum,
      baslik: bilgi.durum === "ended" ? "Revizyon hakkı doldu" : "Revizyon hakkı doluyor",
      mesaj:
        bilgi.durum === "ended"
          ? `${ad} için ücretsiz revizyon süresi doldu. Yeni talepler ücretlendirilecek.`
          : `${ad} için ücretsiz revizyon süresinin bitmesine ${bilgi.kalanGun === 0 ? "bugün" : `${bilgi.kalanGun} gün`} kaldı. Müşteriye son düzeltmeleri sorun.`,
    });
  }
  return uyarilar;
}
