import type { SupabaseClient } from "@supabase/supabase-js";
import { netTahsilat, taksitleriDagit, type TaksitDurumu } from "@/lib/taksit-dagitimi";

/*
  SÖZLEŞME TAKSİTLERİNİN ÖDEME DURUMU. Sözleşme detayı ve belgenin yaşam
  döngüsü aynı sonucu göstersin diye tek yerde (12.10.2026; eskiden
  yalnızca sözleşme detayındaydı, yaşam döngüsü faturanın paid_at'ine
  bakıp tahsilatı hep "bekleniyor" gösteriyordu).

  Taksitin kendi status sütunu cari tahsilatıyla güncellenmiyor
  (tahsil edilmiş taksit "ödenmedi" görünüyordu). Sözleşmenin carisi
  varsa durumlar cari dökümünden türetilir: carinin net tahsilatı,
  carinin BÜTÜN sözleşmelerinin taksitlerine en eski vadeden dağıtılır
  (cari detayıyla aynı kural, lib/taksit-dagitimi.ts); burada bu
  sözleşmenin taksitlerine düşen sonuç döner. Carisi yoksa null: taksitin
  kendi durumu kullanılır (taksitDurumu).

  Hareketler ve taksitler bilerek SINIRSIZ okunuyor: bakiye tüm zamanların
  toplamı, pencereyle daraltmak para hesabını bozar (AGENTS.md "Her
  sınırsız okuma hata değil").
*/
export type TaksitSonucu = Map<number, { odenen: number; kalan: number; durum: TaksitDurumu }>;

export async function cariTaksitSonuclari(
  supabase: SupabaseClient,
  organizationId: string,
  sozlesme: { party_id: string | null; payment_plan_id: string | null },
  bugun: string,
): Promise<TaksitSonucu | null> {
  if (!sozlesme.party_id || !sozlesme.payment_plan_id) return null;
  const [{ data: hareketler }, { data: cariSozlesmeler }] = await Promise.all([
    supabase.from("account_entries").select("entry_type,source_type,amount").eq("organization_id", organizationId).eq("party_id", sozlesme.party_id),
    supabase.from("crm_contracts").select("payment_plan_id").eq("organization_id", organizationId).eq("party_id", sozlesme.party_id).in("status", ["signed", "completed"]),
  ]);
  const planIds = [...new Set([sozlesme.payment_plan_id, ...((cariSozlesmeler ?? []) as { payment_plan_id: string | null }[]).map((c) => c.payment_plan_id).filter((v): v is string => Boolean(v))])];
  const { data: tumTaksitler } = await supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status").eq("organization_id", organizationId).in("payment_plan_id", planIds);
  if (!hareketler || !tumTaksitler) return null;
  const dagilim = taksitleriDagit(
    tumTaksitler as { id: string; payment_plan_id: string; installment_no: number; due_date: string | null; amount: number; status: string }[],
    netTahsilat(hareketler as { entry_type: string; source_type: string | null; amount: number }[]),
    bugun,
  );
  return new Map(dagilim.filter((t) => t.payment_plan_id === sozlesme.payment_plan_id).map((t) => [t.installment_no, { odenen: t.odenen, kalan: t.kalan, durum: t.durum }]));
}

/** Tek taksitin durumu: cari sonucu varsa o, yoksa taksitin kendi kaydı. */
export function taksitDurumu(
  taksit: { no: number; amount: number; status: string | null; due_date: string | null },
  sonuc: TaksitSonucu | null,
  bugun: string,
): { odenen: number; durum: TaksitDurumu } {
  const cariden = sonuc?.get(taksit.no);
  if (cariden) return cariden;
  if (taksit.status === "paid") return { odenen: taksit.amount, durum: "odendi" };
  if (taksit.status === "cancelled") return { odenen: 0, durum: "iptal" };
  return { odenen: 0, durum: taksit.due_date && taksit.due_date < bugun ? "gecikti" : "bekliyor" };
}
