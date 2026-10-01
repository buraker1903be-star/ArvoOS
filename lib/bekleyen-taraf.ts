// "Top kimde": işin beklediği taraf.
//
// Saf modül (Next/React/Supabase yok): testi tests/unit/bekleyen-taraf.test.ts.
// Veritabanı tarafı: supabase/migrations/20261001085845_bekleyen_taraf.sql
//
// Pano işin hangi AŞAMADA olduğunu söylüyordu, kimin elinde olduğunu değil.
// Müşteriden veri bekleyen iş, uzmanın geciktirdiği iş gibi görünüyordu ve
// termin hatırlatması uzmanın yapabileceği bir şey olmadığı hâlde ona
// gidiyordu.

import { gunFarki, type ReminderState } from "./is-adimlari";

export type BekleyenTaraf = "us" | "customer" | "third_party";

export const BEKLEYEN_TARAFLAR: BekleyenTaraf[] = ["us", "customer", "third_party"];

/*
  Üçüncü taraf bilerek GENEL: ArvoOS çok kiracılı bir ürün. "Danışman"
  yazsaydık akademik olmayan kiracıda anlamsız kalırdı; parantez içi
  örnekler yalnızca ipucu.
*/
export const BEKLEYEN_TARAF_ADLARI: Record<BekleyenTaraf, string> = {
  us: "Bizde",
  customer: "Müşteride",
  third_party: "Üçüncü tarafta",
};

export const BEKLEYEN_TARAF_TONLARI: Record<BekleyenTaraf, string> = {
  us: "success",
  customer: "warning",
  third_party: "info",
};

export const bekleyenTarafMi = (value: unknown): value is BekleyenTaraf =>
  typeof value === "string" && (BEKLEYEN_TARAFLAR as string[]).includes(value);

/** Kaç gündür bu tarafta bekliyor; damga yoksa ölçülemiyor. */
export function beklemeGunu(waitingSince: string | null, bugun: string): number | null {
  if (!waitingSince) return null;
  const an = new Date(waitingSince);
  if (Number.isNaN(an.getTime())) return null;
  const gun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(an);
  // Geleceğe dönük damga (saat farkı, elle yazılmış kayıt) negatif gün verirdi.
  return Math.max(gunFarki(gun, bugun), 0);
}

/** Kartta ve listede tek satır: "3 gündür müşteride". */
export function beklemeOzeti(taraf: BekleyenTaraf, waitingSince: string | null, bugun: string): string {
  const ad = BEKLEYEN_TARAF_ADLARI[taraf];
  const gun = beklemeGunu(waitingSince, bugun);
  if (gun === null) return ad;
  if (gun === 0) return `Bugünden beri ${ad.toLocaleLowerCase("tr-TR")}`;
  return `${gun} gündür ${ad.toLocaleLowerCase("tr-TR")}`;
}

export interface HatirlatmaKarari {
  category: string;
  title: string;
  message: string;
  /*
    Bildirim KİŞİYE mi yoksa yalnızca kuruma mı gidiyor. Müşteride bekleyen
    bir adım için uzmanı dürtmek yanlış: yapabileceği bir şey yok ve her
    gecikme ona yazılıyor gibi görünür. O uyarı kuruma gider; müşteriyi
    arayacak olan yöneticiler ve satış tarafı görür.
  */
  kisiye: boolean;
}

/** Bir gecikmenin kime, hangi metinle bildirileceği. */
export function hatirlatmaKarari(girdi: {
  durum: ReminderState;
  adimBasligi: string;
  gecikmeMetni: string;
  taraf: BekleyenTaraf;
  not: string | null;
  bekleyenGun: number | null;
}): HatirlatmaKarari {
  const { durum, adimBasligi, gecikmeMetni, taraf, not, bekleyenGun } = girdi;
  if (taraf === "us") {
    return {
      category: "operation_step_due",
      title: durum === "overdue" ? "İş adımı gecikti" : "İş adımının teslimi yaklaştı",
      message: gecikmeMetni,
      kisiye: true,
    };
  }
  const nerede = BEKLEYEN_TARAF_ADLARI[taraf].toLocaleLowerCase("tr-TR");
  const sure = bekleyenGun === null ? "" : bekleyenGun === 0 ? " (bugünden beri)" : ` (${bekleyenGun} gündür)`;
  return {
    category: "operation_waiting_party",
    title: taraf === "customer" ? "Müşteride bekleyen iş gecikti" : "Üçüncü tarafta bekleyen iş gecikti",
    message:
      `“${adimBasligi}” adımı ${nerede} bekliyor${sure}.` +
      (not ? ` Beklenen: ${not}.` : "") +
      " Takibi gereken taraf bizim dışımızda.",
    kisiye: false,
  };
}
