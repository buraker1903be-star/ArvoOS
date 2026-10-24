import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  crmTutarliligi, finansTutarliligi, kokpitTutarliligi, operasyonTutarliligi,
  personelTutarliligi, satisTutarliligi, tahsilatTutarliligi, teklifTutarliligi,
  type Tutarsizlik,
} from "../../lib/rapor-tutarlilik";
import { kokpitModeli } from "../../lib/rapor-kokpit";
import { satisModeli } from "../../lib/rapor-satis";
import { crmModeli } from "../../lib/rapor-crm";
import { tahsilatModeli } from "../../lib/rapor-tahsilat";
import { finansModeli } from "../../lib/rapor-finans";
import { teklifModeli } from "../../lib/rapor-teklif";
import { operasyonModeli } from "../../lib/rapor-operasyon";
import { personelModeli } from "../../lib/rapor-personel";
import type { Donem } from "../../lib/rapor-donemi";

/*
  ÖZELLİK TABANLI DENETİM.

  Örnek tabanlı testler yazdığım örneği sınar; bu alt sistemdeki
  kusurların hepsi benim AKLIMA GELMEYEN birleşimlerde çıktı (iki işi
  de yapan personel, süresi geçmiş teklif süreci, akademik aşamalar,
  yıl içinde ikinci kez imzalayan müşteri). O yüzden girdiler
  RASTGELE üretiliyor ve her tur için modelin KENDİ İÇİNDE tutarlı
  olduğu sınanıyor.

  Üreteç tohumlu (deterministik): bir tur düşerse aynı tohumla
  yeniden üretilip incelenebilir, "bazen kırılan test" olmuyor.
*/
const TUR = 300;

/** Tohumlu sözde rastgele sayı üreteci (mulberry32). */
function uretec(tohum: number) {
  let t = tohum >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

/** Dönem içi/dışı karışık bir gün. */
const gun = (r: () => number) => {
  const aylar = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2025-12"];
  const ay = aylar[Math.floor(r() * aylar.length)];
  return `${ay}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
};
const an = (r: () => number) => `${gun(r)}T${String(Math.floor(r() * 24)).padStart(2, "0")}:30:00Z`;
const belki = <T>(r: () => number, deger: T, olasilik = 0.2): T | null => (r() < olasilik ? null : deger);
const sec = <T>(r: () => number, liste: readonly T[]) => liste[Math.floor(r() * liste.length)];
const tutar = (r: () => number) => Math.floor(r() * 5_000_000);
const adet = (r: () => number, tavan: number) => Math.floor(r() * tavan);

const ASAMALAR = ["lead", "qualified", "proposal", "contract", "payment", "won", "lost",
  "pre_review", "academic_review", "proposal_ready", "proposal_approved", "contract_ready",
  "payment_pending", "payment_approved", "work_opened", "expert_assigned", "delivery", "completed"] as const;
const SOZ_DURUM = ["draft", "sent", "signed", "rejected", "cancelled", "completed"] as const;
const TEKLIF_DURUM = ["draft", "sent", "archived"] as const;
const ARSIV_SEBEP = [null, "accepted", "rejected", "expired", "manual"] as const;
const KISILER = ["e1", "e2", "e3", null] as const;
const KAYNAKLAR = ["Google", "google", "INSTAGRAM", "Referans", null, "  "] as const;

/** Bir turun bulduğu tutarsızlıkları okunur biçimde yazar. */
const anlat = (tohum: number, liste: Tutarsizlik[]) =>
  `tohum ${tohum}: ` + liste.map((t) => `${t.rapor} · ${t.olcut} (beklenen ${t.beklenen}, bulunan ${t.bulunan})`).join(" | ");

describe("rapor tutarlılığı — rastgele girdilerle", () => {
  it("RPR-00 Kokpit: huni daralıyor, marjlar ve seriler tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const sozlesmeler = Array.from({ length: adet(r, 14) }, (_, i) => ({
        id: `s${i}`, opportunity_id: belki(r, `t${adet(r, 16)}`, 0.25),
        amount: tutar(r), status: sec(r, SOZ_DURUM),
        signed_at: belki(r, an(r)), created_at: an(r),
      }));
      const m = kokpitModeli({
        donem: EKIM,
        opportunities: Array.from({ length: adet(r, 16) }, (_, i) => ({
          id: `t${i}`, stage: sec(r, ASAMALAR), estimated_value: tutar(r),
          source: sec(r, [...KAYNAKLAR, "Referans müşteri"]),
          lost_reason: sec(r, ["Fiyat", null, "  "]),
          created_at: an(r), updated_at: an(r),
        })),
        proposals: Array.from({ length: adet(r, 12) }, (_, i) => ({
          id: `p${i}`, opportunity_id: `t${adet(r, 16)}`, amount: tutar(r),
          status: sec(r, TEKLIF_DURUM), superseded_by: belki(r, `p${adet(r, 12)}`, 0.6),
          created_at: an(r),
        })),
        contracts: sozlesmeler,
        transactions: Array.from({ length: adet(r, 12) }, () => ({
          transaction_type: sec(r, ["income", "expense"] as const),
          status: sec(r, ["paid", "planned", "canceled"]), amount: tutar(r),
          category: sec(r, ["Hizmet maliyeti", "Kira", null]),
          paid_at: belki(r, an(r), 0.3), created_at: an(r),
        })),
        costItems: Array.from({ length: adet(r, 10) }, () => ({
          contract_id: `s${adet(r, 14)}`, amount: tutar(r),
          status: sec(r, ["paid", "planned"]), cost_date: gun(r),
        })),
        accountEntries: Array.from({ length: adet(r, 14) }, () => ({
          entry_type: sec(r, ["credit", "debit"] as const),
          source_type: sec(r, ["payment", "adjustment", "contract"]),
          amount: tutar(r), transaction_date: gun(r),
        })),
        sozlesmeMaliyetleri: Array.from({ length: adet(r, 8) }, () => ({
          contract_id: `s${adet(r, 14)}`, amount: tutar(r),
        })),
      });
      const bulgu = kokpitTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-01 Satış: kırılımlar her zaman toplamı tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const talepler = Array.from({ length: adet(r, 12) }, (_, i) => [`t${i}`, {
        assigned_employee_id: sec(r, KISILER),
        customer_name: sec(r, ["Akademik Merkez", "beta", "BETA", ""]),
        service_type: sec(r, ["Tez Yazımı", "tez  yazımı", "İNGİLİZCE", null, "   "]),
      }] as const);
      const m = satisModeli({
        donem: EKIM,
        sozlesmeler: Array.from({ length: adet(r, 16) }, (_, i) => ({
          id: `s${i}`, contract_no: `SOZ-${i}`, title: "İş", amount: tutar(r),
          status: sec(r, SOZ_DURUM), signed_at: belki(r, an(r)), created_at: an(r),
          opportunity_id: belki(r, `t${adet(r, 12)}`, 0.3),
        })),
        teklifler: Array.from({ length: adet(r, 14) }, (_, i) => ({
          id: `p${i}`, root_proposal_id: belki(r, `p${adet(r, 5)}`, 0.5), amount: tutar(r),
          status: sec(r, TEKLIF_DURUM), archive_reason: sec(r, ARSIV_SEBEP), sent_at: belki(r, an(r)),
        })),
        talepler: new Map(talepler),
        personelAdi: new Map([["e1", "Ayşe"], ["e2", "Mehmet"], ["e3", "Zeynep"]]),
      });
      const bulgu = satisTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-02 CRM: huni monoton, kırılımlar tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = crmModeli({
        donem: EKIM,
        talepler: Array.from({ length: adet(r, 20) }, (_, i) => ({
          id: `t${i}`, stage: sec(r, ASAMALAR), source: sec(r, KAYNAKLAR),
          lost_reason: sec(r, ["Fiyat", "fiyat", null, "  "]),
          estimated_value: tutar(r), created_at: an(r), updated_at: an(r),
        })),
        sozlesmeler: Array.from({ length: adet(r, 14) }, (_, i) => ({
          id: `s${i}`, opportunity_id: belki(r, `t${adet(r, 20)}`, 0.3),
          party_id: belki(r, sec(r, ["c1", "c2", "c3"]), 0.3),
          amount: tutar(r), status: sec(r, SOZ_DURUM),
          signed_at: belki(r, an(r)), created_at: an(r),
        })),
        musteriAdi: new Map([["t1", "Delta"], ["t2", "delta"], ["t3", "Gama"]]),
        cariAdi: new Map([["c1", "Akademik"], ["c2", "Beta"], ["c3", "Akademik"]]),
      });
      const bulgu = crmTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-03 Tahsilat: planlı + plansız = açık alacak", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = tahsilatModeli({
        donem: EKIM, bugun: BUGUN,
        hareketler: Array.from({ length: adet(r, 20) }, () => ({
          entry_type: sec(r, ["credit", "debit"]),
          source_type: sec(r, ["payment", "adjustment", "contract", null]),
          amount: tutar(r), transaction_date: gun(r),
        })),
        cariler: Array.from({ length: adet(r, 8) }, (_, i) => {
          const bakiye = tutar(r);
          return {
            id: `c${i}`, ad: sec(r, ["Akademik", "Beta", ""]), bakiye,
            netTahsilat: Math.floor(r() * bakiye * 1.5),
            taksitler: Array.from({ length: adet(r, 5) }, (_, j) => ({
              id: `i${i}-${j}`, due_date: belki(r, gun(r), 0.15),
              amount: Math.floor(r() * bakiye), status: sec(r, ["pending", "paid", "cancelled"]),
            })),
          };
        }),
      });
      const bulgu = tahsilatTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-04 Finans: net sonuç ve kategoriler tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = finansModeli({
        donem: EKIM, bugun: BUGUN,
        hareketler: Array.from({ length: adet(r, 24) }, () => ({
          transaction_type: sec(r, ["income", "expense"]),
          status: sec(r, ["paid", "planned", "canceled"]),
          amount: tutar(r), category: sec(r, ["Kira", "kira", "Danışmanlık", null, " "]),
          title: "Kayıt", counterparty: null,
          due_date: belki(r, gun(r), 0.25), paid_at: belki(r, an(r), 0.3), created_at: an(r),
        })),
        maliyetler: Array.from({ length: adet(r, 10) }, () => ({
          amount: tutar(r), status: sec(r, ["paid", "planned"]),
          cost_date: gun(r), category: sec(r, ["Tedarikçi", "Baskı", null]),
        })),
        kasaHareketleri: Array.from({ length: adet(r, 10) }, () => ({
          entry_type: sec(r, ["credit", "debit"]),
          source_type: sec(r, ["payment", "adjustment", null]),
          amount: tutar(r), transaction_date: gun(r),
        })),
      });
      const bulgu = finansTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-05 Personel: oranlar ve prim sınırları tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const prim = () => ({
        employee_id: sec(r, ["e1", "e2", "e3"]) as string,
        commission_amount: tutar(r), status: sec(r, ["accrued", "approved", "paid", "cancelled"]),
        accrued_at: an(r), paid_at: belki(r, an(r), 0.4),
      });
      const m = personelModeli({
        donem: EKIM, bugun: BUGUN,
        personel: ["e1", "e2", "e3", "e4"].map((id) => ({
          id, full_name: `Kişi ${id}`, job_title: belki(r, "Uzman", 0.2),
          department_id: belki(r, sec(r, ["d1", "d2"]), 0.2),
          employment_status: sec(r, ["active", "terminated", "on_leave"]),
        })),
        talepler: Array.from({ length: adet(r, 14) }, (_, i) => ({
          id: `t${i}`, assigned_employee_id: sec(r, KISILER),
          stage: sec(r, ASAMALAR), created_at: an(r), updated_at: an(r),
        })),
        sozlesmeler: Array.from({ length: adet(r, 12) }, () => ({
          opportunity_id: belki(r, `t${adet(r, 14)}`, 0.3), amount: tutar(r),
          status: sec(r, SOZ_DURUM), signed_at: belki(r, an(r)), created_at: an(r),
        })),
        isler: Array.from({ length: adet(r, 12) }, () => ({
          assigned_employee_id: sec(r, KISILER),
          status: sec(r, ["planned", "in_progress", "blocked", "completed", "cancelled", "archived"]),
          due_date: belki(r, gun(r), 0.2), delivered_at: belki(r, an(r), 0.4),
          start_date: belki(r, gun(r), 0.2), created_at: an(r), updated_at: an(r),
        })),
        satisPrimleri: Array.from({ length: adet(r, 8) }, prim),
        operasyonPrimleri: Array.from({ length: adet(r, 8) }, prim),
        departmanAdi: new Map([["d1", "Satış"], ["d2", "Operasyon"]]),
      });
      const bulgu = personelTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-06 Operasyon: kişi yükü toplamı iş sayısını tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const isler = Array.from({ length: adet(r, 18) }, (_, i) => ({
        id: `i${i}`, title: `İş ${i}`, customer_name: belki(r, "Akademik", 0.2),
        status: sec(r, ["planned", "in_progress", "blocked", "completed", "cancelled", "archived"]),
        priority: sec(r, ["low", "normal", "high", "urgent"]),
        waiting_party: sec(r, ["us", "customer", "third_party"]),
        start_date: belki(r, gun(r), 0.2), due_date: belki(r, gun(r), 0.2),
        delivered_at: belki(r, an(r), 0.4), assigned_employee_id: sec(r, KISILER),
        created_at: an(r), updated_at: an(r),
      }));
      const m = operasyonModeli({
        donem: EKIM, bugun: BUGUN, isler,
        adimlar: Array.from({ length: adet(r, 24) }, () => ({
          workflow_id: `i${adet(r, 18)}`,
          status: sec(r, ["planned", "in_progress", "review", "done"]),
          is_completed: r() < 0.4, due_date: belki(r, gun(r), 0.3), completed_at: belki(r, an(r), 0.5),
        })),
        personelAdi: new Map([["e1", "Ayşe"], ["e2", "Mehmet"], ["e3", "Zeynep"]]),
      });
      const bulgu = operasyonTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });

  it("RPR-07 Teklif: durum dağılımı süreç sayısını tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = teklifModeli({
        donem: EKIM, bugun: BUGUN,
        teklifler: Array.from({ length: adet(r, 16) }, (_, i) => ({
          id: `p${i}`, proposal_no: `TKL-${i}`, title: "Teklif",
          root_proposal_id: belki(r, `p${adet(r, 5)}`, 0.5),
          revision_no: 1 + adet(r, 4), amount: tutar(r),
          status: sec(r, TEKLIF_DURUM), archive_reason: sec(r, ARSIV_SEBEP),
          sent_at: belki(r, an(r)), responded_at: belki(r, an(r), 0.5),
          customer_responded_at: belki(r, an(r), 0.7), opportunity_id: `t${adet(r, 5)}`,
        })),
        sozlesmeler: Array.from({ length: adet(r, 14) }, (_, i) => ({
          id: `s${i}`, contract_no: `SOZ-${i}`, title: "İş", amount: tutar(r),
          status: sec(r, SOZ_DURUM), sent_at: belki(r, an(r)), signed_at: belki(r, an(r)),
          created_at: an(r), first_viewed_at: belki(r, an(r), 0.5), view_count: adet(r, 9),
          opportunity_id: belki(r, `t${adet(r, 5)}`, 0.2),
        })),
        musteriAdi: new Map([["t1", "Akademik"], ["t2", "Beta"]]),
      });
      const bulgu = teklifTutarliligi(m);
      assert.deepEqual(bulgu, [], anlat(tohum, bulgu));
    }
  });
});
