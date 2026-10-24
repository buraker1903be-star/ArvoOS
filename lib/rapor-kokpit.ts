import { monthStartKey } from "@/lib/istanbul-date";
import { AYLAR, aralikYuklemi, gunAnahtari, type Donem } from "@/lib/rapor-donemi";
import { money, percent } from "@/lib/rapor-bicim";
import { kazanildi, nitelikliAday, temasKuruldu } from "@/lib/talep-asamalari";
import type { SeriNoktasi } from "@/lib/rapor-seri";

/*
  YÖNETİCİ KOKPİTİ — KARAR (RPR-00).

  Bu hesap raporun BİLEŞENİNİN içinde duruyordu: öteki yedi raporun
  hepsi saf bir modele taşınmışken kokpit tek istisnaydı. Bedeli
  somuttu — kokpit tutarlılık denetimine ve raporlar arası
  karşılaştırmaya giremiyordu, yani satış tutarını RPR-01'den,
  tahsilatı RPR-03'ten BAĞIMSIZ hesaplayıp onlarla ayrışabilirdi ve
  kullanıcı aynı ekranda iki farklı rakam görürdü.

  Taşıma sırasında matematiğe DOKUNULMADI; satırlar olduğu gibi
  geldi. Rakamları "iyileştirmek", daha önce doğrulanmış bir sonucu
  sessizce değiştirmek olurdu. Raporlar arası testler artık bu
  modelin RPR-01 ve RPR-03 ile aynı sayıyı söylediğini sabitliyor.

  SÖZLEŞME MALİYETİ DIŞARIDAN GELİYOR: o sorgu imzalı sözleşme
  kimliklerine bağlı, yani hesabın ortasında bir okuma vardı. Model
  saf kalsın diye çağıran önce kimlikleri çıkarıyor
  (`kokpitImzaliSozlesmeler`), sonra okuyor, sonra modeli çağırıyor.
*/

export type KokpitTalebi = {
  id: string; stage: string; estimated_value: number;
  source: string | null; lost_reason: string | null;
  created_at: string; updated_at: string;
};
export type KokpitTeklifi = { id: string; opportunity_id: string; amount: number; status: string; superseded_by: string | null; created_at: string };
export type KokpitSozlesmesi = { id: string; opportunity_id: string | null; amount: number; status: string; signed_at: string | null; created_at: string };
export type KokpitIslemi = { transaction_type: "income" | "expense"; status: string; amount: number; category: string | null; paid_at: string | null; created_at: string };
export type KokpitMaliyeti = { contract_id: string; amount: number; status: string; cost_date: string };
export type KokpitHareketi = { entry_type: "debit" | "credit"; source_type: string; amount: number; transaction_date: string };

/** İmzalı sayılan sözleşme durumları — RPR-01 ile aynı küme. */
const IMZALI = ["signed", "completed"];

/**
 * Dönemde imzalanmış sözleşmeler. Maliyet sorgusu bunların
 * kimliklerine bağlı olduğu için ayrı dışa veriliyor.
 */
export function kokpitImzaliSozlesmeler(sozlesmeler: readonly KokpitSozlesmesi[], donem: Donem) {
  const aralikta = aralikYuklemi(donem);
  return sozlesmeler.filter((row) => IMZALI.includes(row.status) && aralikta(row.signed_at ?? row.created_at));
}

export function kokpitModeli({
  donem,
  opportunities,
  proposals,
  contracts,
  transactions,
  costItems,
  accountEntries,
  sozlesmeMaliyetleri,
}: {
  donem: Donem;
  opportunities: readonly KokpitTalebi[];
  proposals: readonly KokpitTeklifi[];
  contracts: readonly KokpitSozlesmesi[];
  transactions: readonly KokpitIslemi[];
  costItems: readonly KokpitMaliyeti[];
  accountEntries: readonly KokpitHareketi[];
  /** İmzalı sözleşmelerin maliyet kalemleri (kalem tarihinden bağımsız). */
  sozlesmeMaliyetleri: readonly { contract_id: string; amount: number }[];
}) {
  const inRange = aralikYuklemi(donem);
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);

  const incoming = opportunities.filter((row) => inRange(row.created_at));
  /*
    HUNİ KÜMELERİ KODA YAZILI DEĞİL, AŞAMA EŞLEMESİNDEN
    (24.10.2026'da düzeltildi).

    Önceden altı aşama elle sayılıyordu
    (`["qualified","proposal","contract","payment","won","lost"]`).
    Oysa `stage` kısıtı ON SEKİZ değere izin veriyor ve akademik
    kurumlar ayrıntılı olanları kullanıyor (`academic_review`,
    `proposal_ready`, `payment_pending`, `work_opened`…). Listede
    olmayan aşamadaki talep huniye HİÇ girmiyordu: akademik bir
    kurumda teklifi hazırlanmış, sözleşmesi imzalanmış talepler
    "ulaşılamamış" sayılıyor ve dönüşüm oranı olduğundan KÜÇÜK
    çıkıyordu. Hata görünmüyordu çünkü eksik sayılan talep yalnızca
    eksik sayılıyordu.

    Karar `lib/talep-asamalari.ts`'te ve testli; yeni bir aşama
    eşlemeye eklendiği anda huni de onu tanıyor.
  */
  const reached = incoming.filter((row) => temasKuruldu(row.stage));
  const qualified = incoming.filter((row) => nitelikliAday(row.stage));
  const signedContracts = contracts.filter((row) => ["signed","completed"].includes(row.status) && inRange(row.signed_at ?? row.created_at));
  const signedOpportunityIds = new Set(signedContracts.map((row) => row.opportunity_id).filter((value): value is string => Boolean(value)));
  /* KAZANILMA da eşlemeden: akademik kurumda kazanılan talep "won"
     değil `work_opened` / `expert_assigned` / `delivery` /
     `completed` oluyor. `stage === "won"` o kurumlarda hiç
     eşleşmiyordu; satış sayısı yalnızca imzalı sözleşmeden
     geliyordu ve sözleşmesiz kazanılmış talep görünmüyordu. */
  const wonOpportunities = opportunities.filter((row) => kazanildi(row.stage) && inRange(row.updated_at));
  const saleOpportunityIds = new Set([...wonOpportunities.map((row) => row.id), ...signedOpportunityIds]);
  const sales = saleOpportunityIds.size;
  const salesValue = signedContracts.length ? signedContracts.reduce((sum, row) => sum + Number(row.amount), 0) : wonOpportunities.reduce((sum, row) => sum + Number(row.estimated_value), 0);
  /*
    Dönüşüm: bu dönemde GÖRÜŞÜLEN adaylardan satışa dönenlerin oranı.
    Eskiden dönemin bütün satışları (önceki aylarda gelmiş müşteriler
    dahil) bu dönemde görüşülenlere bölünüyordu ve oran %275 gibi
    %100'ü aşan değerler çıkıyordu.
  */
  /*
    HUNİ TEK BİR GRUBUN YOLCULUĞU: bu dönemde GELEN adaylar. Her aşama bir
    öncekinin alt kümesi (nitelikli ⊂ ulaşılan ⊂ gelen; teklif ve satış
    niteliklilerden), huni hiçbir zaman genişlemez.

    Eskiden "Teklif" dönemde teklif verilen bütün müşterileri, "Satış"
    dönemin bütün satışlarını sayıyordu (önceki aylarda gelmiş müşteriler
    dahil); huni teklif aşamasında 4'ken satışta 11'e çıkıyor, dönüşüm
    %275 gibi %100'ü aşan değerler veriyordu.

    Satışa dönmüş sayılmak: imzalı sözleşmesi olmak (ne zaman imzalanmış
    olursa) ya da aşamasının "kazanıldı" olması. Teklif verilmiş sayılmak:
    geçerli (yerine yenisi gelmemiş) bir teklifi olmak ya da satışa dönmüş
    olmak — sözleşmesi olan müşteriye teklif de verilmiştir.
  */
  const satisaDonenIds = new Set([
    ...contracts.filter((row) => ["signed", "completed"].includes(row.status)).map((row) => row.opportunity_id).filter((v): v is string => Boolean(v)),
    ...opportunities.filter((row) => kazanildi(row.stage)).map((row) => row.id),
  ]);
  const teklifliIds = new Set(proposals.filter((row) => !row.superseded_by).map((row) => row.opportunity_id));
  const huniTeklif = qualified.filter((row) => teklifliIds.has(row.id) || satisaDonenIds.has(row.id));
  const huniSatis = qualified.filter((row) => satisaDonenIds.has(row.id));
  const conversion = reached.length ? (huniSatis.length / reached.length) * 100 : 0;
  const averageSale = sales ? salesValue / sales : 0;
  /* İmzalı sözleşmelerin maliyeti: kalem TARİHİNDEN bağımsız, sözleşme
     kimliğiyle toplanıyor (kalem sözleşmeden aylar sonra girilebiliyor;
     pencereyle süzmek brüt kârı yanlış gösterirdi). Sorgu yalnızca
     aralıktaki imzalı sözleşmeler için, yani liste kısa. */
  const contractedCost = sozlesmeMaliyetleri.reduce((sum, row) => sum + Number(row.amount), 0);
  const grossProfit=salesValue-contractedCost;
  const grossMargin=salesValue?grossProfit/salesValue*100:0;
  const collections=accountEntries.filter(row=>row.entry_type==="credit"&&inRange(row.transaction_date)).reduce((sum,row)=>sum+Number(row.amount),0);
  const paidJobCost=costItems.filter(row=>row.status==="paid"&&inRange(row.cost_date)).reduce((sum,row)=>sum+Number(row.amount),0);
  const paidTransactions = transactions.filter((row) => row.status === "paid" && inRange(row.paid_at ?? row.created_at));
  const operatingExpense=paidTransactions.filter(row=>row.transaction_type==="expense"&&row.category!=="Hizmet maliyeti").reduce((sum,row)=>sum+Number(row.amount),0);
  const realizedProfit=collections-paidJobCost-operatingExpense;
  const realizedMargin=collections?realizedProfit/collections*100:0;
  const lost = opportunities.filter((row) => row.stage === "lost" && inRange(row.updated_at));
  const referralLeads = incoming.filter((row) => (row.source ?? "").toLocaleLowerCase("tr-TR").includes("referans"));
  const referralSales = referralLeads.filter((row) => saleOpportunityIds.has(row.id)).length;

  const lostReasonMap = new Map<string, number>();
  for (const row of lost) { const reason = row.lost_reason?.trim() || "Neden belirtilmedi"; lostReasonMap.set(reason, (lostReasonMap.get(reason) ?? 0) + 1); }
  const lostReasons = [...lostReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const maxLostReason = Math.max(1, ...lostReasons.map((row) => row.count));
  const funnel = [
    { label: "Gelen lead", value: incoming.length, detail: "Yeni müşteri adayı" },
    { label: "Ulaşılan", value: reached.length, detail: incoming.length ? `${percent((reached.length / incoming.length) * 100)} erişim` : "—" },
    { label: "Nitelikli lead", value: qualified.length, detail: reached.length ? `${percent((qualified.length / reached.length) * 100)} nitelikli` : "—" },
    { label: "Teklif", value: huniTeklif.length, detail: qualified.length ? `${percent((huniTeklif.length / qualified.length) * 100)} teklif` : "—" },
    { label: "Satışa dönen", value: huniSatis.length, detail: reached.length ? `${percent(conversion)} dönüşüm` : "—" },
  ];
  const maxFunnel = Math.max(1, ...funnel.map((row) => row.value));
  const transitionRates = funnel.slice(0, -1).map((row, index) => ({ from: row.label, to: funnel[index + 1].label, rate: row.value ? (funnel[index + 1].value / row.value) * 100 : 0 }));
  const weakestStep = [...transitionRates].sort((a, b) => a.rate - b.rate)[0];
  const months = Array.from({ length: 6 }, (_, index) => { const ayKey = monthStartKey(sonYil, sonAy - (5 - index)).slice(0, 7); return { key: ayKey, label: AYLAR[Number(ayKey.slice(5, 7)) - 1], leads: 0, sales: 0 }; });
  for (const row of opportunities) { const bucket = months.find((month) => month.key === gunAnahtari(row.created_at).slice(0, 7)); if (bucket) bucket.leads += 1; }
  for (const row of opportunities.filter((item) => kazanildi(item.stage))) { const bucket = months.find((month) => month.key === gunAnahtari(row.updated_at).slice(0, 7)); if (bucket) bucket.sales += 1; }
  const maxTrend = Math.max(1, ...months.map((row) => row.leads));
  /* Kart grafikleri için aylık seriler (yukarıdaki months dilimleriyle).
     Satış imzalı sözleşmeden (imza tarihi), maliyet kalem tarihinden,
     tahsilat cari dökümündeki ödemelerden. */
  const aylikSeri = (kayitlar: { tarih: string | null; tutar: number }[], bicim: (n: number) => string): SeriNoktasi[] =>
    months.map((ay, sira) => {
      const deger = kayitlar.filter((k) => k.tarih && gunAnahtari(k.tarih).slice(0, 7) === ay.key).reduce((t, k) => t + k.tutar, 0);
      return { ad: ay.label, eksen: ay.label, deger, etiket: bicim(deger), simdiki: sira === months.length - 1 };
    });
  const adet = (n: number) => String(n);
  const leadSerisi = aylikSeri(opportunities.map((o) => ({ tarih: o.created_at, tutar: 1 })), adet);
  const imzaliTumu = contracts.filter((c) => ["signed", "completed"].includes(c.status));
  const satisSerisi = aylikSeri(imzaliTumu.map((c) => ({ tarih: c.signed_at ?? c.created_at, tutar: 1 })), adet);
  const maliyetSerisi = aylikSeri(costItems.map((c) => ({ tarih: c.cost_date, tutar: Number(c.amount) })), money);
  const tahsilatSerisi = aylikSeri(accountEntries.filter((e) => e.entry_type === "credit").map((e) => ({ tarih: e.transaction_date, tutar: Number(e.amount) })), money);
  return {
    incoming, reached, qualified, signedContracts, wonOpportunities, saleOpportunityIds,
    sales, salesValue, huniTeklif, huniSatis, conversion, averageSale,
    contractedCost, grossProfit, grossMargin,
    collections, paidJobCost, operatingExpense, realizedProfit, realizedMargin,
    lost, lostReasons, maxLostReason,
    funnel, maxFunnel, transitionRates, weakestStep,
    months, maxTrend, leadSerisi, satisSerisi, maliyetSerisi, tahsilatSerisi,
    referralLeads, referralSales,
  };
}

export type KokpitModeli = ReturnType<typeof kokpitModeli>;
