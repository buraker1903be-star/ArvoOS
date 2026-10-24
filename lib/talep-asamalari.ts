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
  /* `payment` EKSİKTİ (24.10.2026'da bulundu). `stage` kısıtı ona izin
     veriyor ve genel kurumların akışında lead → qualified → proposal →
     contract → payment → won diye duruyor; eşlemede olmadığı için o
     aşamadaki talep çizgide HİÇBİR adıma düşmüyordu (null = arşiv).
     Yani sözleşmesi imzalanıp ödeme bekleyen bir talep, aşama
     çizgisinde arşivlenmiş talep gibi davranıyordu — hata vermeyen,
     yalnızca eksik gösteren bir boşluk. Ayrıntılı ikizleriyle aynı
     adım: ödeme Sözleşme adımının içinde. */
  contract: 3, payment: 3, contract_ready: 3, payment_pending: 3, payment_approved: 3,
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

/*
  HUNİ YÜKLEMLERİ (24.10.2026).

  Raporlardaki huni "ulaşılan" ve "nitelikli" kümelerini KODA YAZILI
  altı aşamayla belirliyordu:

      reachedStages   = ["qualified","proposal","contract","payment","won","lost"]
      qualifiedStages = ["qualified","proposal","contract","payment","won"]

  Oysa `stage` kısıtı ON SEKİZ değere izin veriyor ve akademik
  kurumlar ayrıntılı olanları kullanıyor (`pre_review`,
  `academic_review`, `proposal_ready`, `payment_pending`,
  `work_opened`…). Listede olmayan bir aşamadaki talep huniye HİÇ
  girmiyordu: akademik bir kurumda teklifi hazırlanmış, sözleşmesi
  imzalanmış, işi açılmış talepler "ulaşılamamış" sayılıyor ve
  dönüşüm oranı olduğundan KÜÇÜK çıkıyordu. Hiçbir yerde hata
  görünmüyordu çünkü eksik sayılan talep yalnızca eksik sayılıyordu.

  Karar artık aşama→adım eşlemesinden (yukarıdaki `ADIM`) türetiliyor:
  tek kaynak, on sekiz aşamanın hepsi kapsanıyor ve yeni bir aşama
  eşlemeye eklendiği anda huni de onu tanıyor.

  ARŞİVLENMİŞ TALEP ("lost") TEMAS SAYILIYOR AMA NİTELİKLİ
  SAYILMIYOR — eski davranış bu ve doğrusu da bu: müşteriyle
  görüşülmüş olmasa kaybedildi diye işaretlenmezdi, ama artık aday
  değil. Kaybedilen talebin ne kadar ilerlediği `stage` alanında
  KAYBOLUYOR (aşama "lost" olunca önceki aşama yazılmıyor), o yüzden
  temas en iyi tahmin.
*/

/** Müşteriyle temas kuruldu mu: İnceleme ve sonrası, ya da arşivlenmiş. */
export function temasKuruldu(asama: string): boolean {
  if (asama === "lost") return true;
  const adim = talepAdimi(asama);
  return adim !== null && adim >= 1;
}

/** Gerçek aday mı: İnceleme ve sonrası; arşivlenmiş hariç. */
export function nitelikliAday(asama: string): boolean {
  if (asama === "lost") return false;
  const adim = talepAdimi(asama);
  return adim !== null && adim >= 1;
}

/** Teklif aşamasına ve ötesine geçmiş mi. */
export function teklifeGecti(asama: string): boolean {
  if (asama === "lost") return false;
  const adim = talepAdimi(asama);
  return adim !== null && adim >= 2;
}

/** Kazanılmış mı: aşama çizgisinin son adımı (iş açılmış ve sonrası). */
export function kazanildi(asama: string): boolean {
  return talepAdimi(asama) === 4;
}
