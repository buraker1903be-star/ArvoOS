/*
  Talep detayının üstündeki aşama çizgisi: Yeni → İnceleme → Teklif →
  Sözleşme → İş. Kurumların aşama kodları farklı: genel kurumlarda
  lead/qualified/proposal/contract/won, akademik kurumlarda daha ayrıntılı
  (pre_review, academic_review, proposal_ready, payment_pending…).
  Hepsi bu beş adıma eşlenir; satışçı talebin nerede olduğunu tek bakışta
  görür. Arşivlenen talep ("lost") çizgide bir adıma düşmez.

  Saf modül: birim testi talep-asamalari.test.ts.
*/

export const TALEP_ADIMLARI = ["Yeni", "İnceleme", "Teklif", "Sözleşme", "İş"] as const;

const ADIM: Record<string, number> = {
  lead: 0,
  qualified: 1, pre_review: 1, academic_review: 1,
  proposal: 2, proposal_ready: 2, proposal_approved: 2,
  contract: 3, contract_ready: 3, payment_pending: 3, payment_approved: 3,
  won: 4, work_opened: 4, expert_assigned: 4, delivery: 4, completed: 4,
};

/** Aşamanın çizgideki adımı (0–4); arşivlenmiş ya da bilinmeyen aşamada null. */
export function talepAdimi(asama: string): number | null {
  return asama in ADIM ? ADIM[asama] : null;
}

/*
  ÇİZGİ BAĞLI KAYITLARLA DA İLERLER (16.10.2026). Talebin `stage` alanı
  sözleşme imzalanıp iş açılınca ilerletilmiyor: deneme kurumunda teklif
  kabul edilmiş, sözleşme imzalanmış ve iş başlamışken çizgi hâlâ
  "Teklif"te duruyordu — hemen altındaki Bağlantılar listesi "İmzalandı",
  "Planlandı" yazarken. Çizgi artık bağlı kayıtlara da bakıyor: geçerli
  (iptal ya da red olmayan) sözleşme varsa en az "Sözleşme", sözleşmenin
  işi açıldıysa "İş". Geri gitmez: talebin kendi aşaması daha ilerideyse
  o kalır. Arşivlenmiş talep (null) arşivde kalır.
*/
export function talepAdimiZincirle(asama: string, zincir: { sozlesmeVar: boolean; isVar: boolean }): number | null {
  const kendi = talepAdimi(asama);
  if (kendi === null) return null;
  const zincirden = zincir.isVar ? 4 : zincir.sozlesmeVar ? 3 : 0;
  return Math.max(kendi, zincirden);
}
