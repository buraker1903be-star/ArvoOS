/*
  TAKSİT VADESİ DEĞİŞTİRME (Finans → Müşteriler → cari penceresi, 2026-10).

  Eskiden taksit tarihi tek tek değiştirilemiyordu: yalnızca ödeme planı
  baştan kuruluyordu (rebuild_payment_plan_installments) ve tahsilatı olan
  planda o da kapalıydı. Müşteri "bir sonraki ödemeyi ay sonuna alalım"
  dediğinde yapılacak bir şey yoktu.

  Bir taksitin vadesi değişir; istenirse SONRAKİ taksitler de aynı gün
  kadar kaydırılır (aralar korunur). Gün anahtarı "YYYY-AA-GG", saat yok;
  hesap UTC öğlen üzerinden, saat dilimi kaymasın.

  Saf modül: birim testi tests/unit/taksit-vadesi.test.ts.
*/

const GUN = 86_400_000;
const GECERLI = /^\d{4}-\d{2}-\d{2}$/;

export function gecerliGun(deger: string): boolean {
  if (!GECERLI.test(deger)) return false;
  const an = Date.parse(`${deger}T12:00:00Z`);
  return Number.isFinite(an) && new Date(an).toISOString().slice(0, 10) === deger;
}

/** İki gün anahtarı arasındaki gün farkı (b − a). */
export function gunFarki(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / GUN);
}

export function gunKaydir(gun: string, fark: number): string {
  return new Date(Date.parse(`${gun}T12:00:00Z`) + fark * GUN).toISOString().slice(0, 10);
}

/**
 * Değişecek vadeler. Hedef taksit yeni tarihe; sonrakileriKaydir ise
 * taksit numarası daha büyük ve vadesi olan taksitler aynı gün kadar.
 * İptal edilen taksitlere dokunulmaz.
 */
export function yeniVadeler<T extends { id: string; installment_no: number; due_date: string | null; status: string }>(
  taksitler: T[],
  hedefId: string,
  yeniTarih: string,
  sonrakileriKaydir: boolean,
): { id: string; due_date: string }[] {
  const hedef = taksitler.find((t) => t.id === hedefId);
  if (!hedef || !gecerliGun(yeniTarih)) return [];
  const degisen = [{ id: hedef.id, due_date: yeniTarih }];
  if (!sonrakileriKaydir || !hedef.due_date) return degisen;
  const fark = gunFarki(hedef.due_date, yeniTarih);
  if (!fark) return degisen;
  for (const t of taksitler) {
    if (t.id === hedef.id || t.status === "cancelled" || !t.due_date) continue;
    if (t.installment_no > hedef.installment_no) degisen.push({ id: t.id, due_date: gunKaydir(t.due_date, fark) });
  }
  return degisen;
}
