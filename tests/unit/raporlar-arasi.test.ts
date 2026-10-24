import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { satisModeli } from "../../lib/rapor-satis";
import { teklifModeli } from "../../lib/rapor-teklif";
import { tahsilatModeli } from "../../lib/rapor-tahsilat";
import { finansModeli } from "../../lib/rapor-finans";
import { crmModeli } from "../../lib/rapor-crm";
import type { Donem } from "../../lib/rapor-donemi";

/*
  RAPORLAR BİRBİRİNİ TUTMALI.

  Aynı gerçeği iki rapor farklı söylerse kullanıcı hangisine
  güveneceğini bilemez ve ikisine birden güveni gider. Bu dosya
  AYNI ham veriyi iki ayrı modele verip ortak büyüklüklerin
  eşitliğini sınıyor.

  Ölçütler bilerek dar: yalnızca TANIMI AYNI olan büyüklükler
  karşılaştırılıyor. "Satış tutarı" ile "tahsilat" birbirini tutmak
  ZORUNDA DEĞİL — üç kavram ayrıdır (docs §3.2) ve onları eşitlemeye
  çalışmak raporların tamamını bozardı.
*/
const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

/** İki raporun da okuduğu imzalı sözleşme kümesi. */
const SOZLESMELER = [
  { id: "a", amount: 1_900_000, status: "signed", signed_at: "2026-10-10T09:00:00Z", created_at: "2026-10-01T09:00:00Z" },
  { id: "b", amount: 700_000, status: "completed", signed_at: "2026-10-18T09:00:00Z", created_at: "2026-10-05T09:00:00Z" },
  { id: "c", amount: 450_000, status: "signed", signed_at: null, created_at: "2026-10-22T09:00:00Z" },
  // Dönem dışı ve imzasız: ikisi de saymamalı
  { id: "d", amount: 9_999_999, status: "signed", signed_at: "2026-09-20T09:00:00Z", created_at: "2026-09-01T09:00:00Z" },
  { id: "e", amount: 9_999_999, status: "sent", signed_at: null, created_at: "2026-10-11T09:00:00Z" },
];

describe("raporlar arası tutarlılık", () => {
  it("Satış ile Teklif aynı dönemde aynı imzalı tutarı söylüyor", () => {
    /* İkisi de "imzalı sayılan durumlar + imza günü aralıkta"
       kuralını kullanıyor; biri değişirse bu test düşer ve ötekinin
       de güncellenmesi gerektiğini söyler. */
    const satis = satisModeli({
      donem: EKIM,
      sozlesmeler: SOZLESMELER.map((c) => ({
        ...c, contract_no: `SOZ-${c.id}`, title: "İş", opportunity_id: "t1",
      })),
      teklifler: [],
      talepler: new Map([["t1", { assigned_employee_id: "e1", customer_name: "Akademik", service_type: "Tez" }]]),
      personelAdi: new Map([["e1", "Ayşe"]]),
    });
    const teklif = teklifModeli({
      donem: EKIM, bugun: BUGUN, teklifler: [],
      sozlesmeler: SOZLESMELER.map((c) => ({
        ...c, contract_no: `SOZ-${c.id}`, title: "İş", sent_at: null,
        first_viewed_at: null, view_count: 0, opportunity_id: "t1",
      })),
      musteriAdi: new Map([["t1", "Akademik"]]),
    });
    assert.equal(satis.toplam, teklif.imzalananTutar, "imzalı tutar iki raporda farklı");
    assert.equal(satis.adet, teklif.imzalananSozlesme, "imzalı adet iki raporda farklı");
    assert.equal(satis.toplam, 3_050_000);
  });

  it("Tahsilat ile Finans aynı dönem net tahsilatını söylüyor", () => {
    /* Finans raporundaki rakam REFERANS (gelire eklenmiyor) ama
       Tahsilat raporunun net tahsilatıyla aynı kuraldan çıkıyor:
       alacak kayıtları eksi düzeltme türündeki borç. İkisi
       ayrışırsa kullanıcı aynı ekranda iki ayrı "kasaya giren"
       görür. */
    const hareketler = [
      { entry_type: "credit", source_type: "payment", amount: 1_200_000, transaction_date: "2026-10-05" },
      { entry_type: "credit", source_type: "payment", amount: 300_000, transaction_date: "2026-10-18" },
      { entry_type: "debit", source_type: "adjustment", amount: 100_000, transaction_date: "2026-10-20" },
      { entry_type: "debit", source_type: "contract", amount: 5_000_000, transaction_date: "2026-10-01" },
      { entry_type: "credit", source_type: "payment", amount: 900_000, transaction_date: "2026-09-11" },
    ];
    const tahsilat = tahsilatModeli({ donem: EKIM, bugun: BUGUN, hareketler, cariler: [] });
    const finans = finansModeli({ donem: EKIM, bugun: BUGUN, hareketler: [], maliyetler: [], kasaHareketleri: hareketler });
    assert.equal(finans.tahsilatReferansi, tahsilat.donemNet, "net tahsilat iki raporda farklı");
    assert.equal(tahsilat.donemNet, 1_400_000);
  });

  it("CRM kazanımı ile Satış adedi aynı taleplerden çıkınca uyumlu", () => {
    /*
      Bu ikisi EŞİT OLMAK ZORUNDA DEĞİL ve bunu sabitlemek önemli:
      CRM kazanımı talebin AŞAMASINDAN, satış adedi SÖZLEŞMEDEN
      geliyor. Sözleşmesiz kazanılan talep ya da aşaması
      ilerletilmemiş imzalı sözleşme ikisini ayırır. Test ilişkinin
      yönünü sabitliyor, eşitliği değil.
    */
    const talepler = [
      { id: "t1", stage: "completed", source: "Referans", lost_reason: null, estimated_value: 100_000,
        created_at: "2026-10-02T09:00:00Z", updated_at: "2026-10-14T09:00:00Z" },
      // Kazanılmış ama sözleşmesi yok
      { id: "t2", stage: "work_opened", source: "Google", lost_reason: null, estimated_value: 200_000,
        created_at: "2026-10-03T09:00:00Z", updated_at: "2026-10-16T09:00:00Z" },
    ];
    const crm = crmModeli({
      donem: EKIM, talepler,
      sozlesmeler: [{ id: "a", opportunity_id: "t1", party_id: "c1", amount: 500_000,
        status: "signed", signed_at: "2026-10-14T09:00:00Z", created_at: "2026-10-14T09:00:00Z" }],
      musteriAdi: new Map(), cariAdi: new Map([["c1", "Akademik"]]),
    });
    const satis = satisModeli({
      donem: EKIM,
      sozlesmeler: [{ id: "a", contract_no: "SOZ-a", title: "İş", amount: 500_000,
        status: "signed", signed_at: "2026-10-14T09:00:00Z", created_at: "2026-10-14T09:00:00Z", opportunity_id: "t1" }],
      teklifler: [],
      talepler: new Map([["t1", { assigned_employee_id: null, customer_name: "Akademik", service_type: null }]]),
      personelAdi: new Map(),
    });
    assert.equal(crm.kazanilan, 2, "aşamadan kazanım");
    assert.equal(satis.adet, 1, "sözleşmeden satış");
    assert.ok(crm.kazanilan >= satis.adet, "sözleşmesiz kazanım olabilir, tersi beklenmez");
  });

  it("Satış ve Teklif teklif süreçlerini aynı sayıyor", () => {
    /* İkisi de revizyonları `root_proposal_id` ile tekilleştiriyor
       ve yalnızca GÖNDERİLMİŞ olanı sayıyor. */
    const ham = [
      { id: "p1", root: null, revizyon: 1, tutar: 1_600_000, durum: "sent", sebep: null, gonderim: "2026-10-02T09:00:00Z" },
      { id: "p2", root: "p1", revizyon: 2, tutar: 1_900_000, durum: "archived", sebep: "accepted", gonderim: "2026-10-09T09:00:00Z" },
      { id: "p3", root: null, revizyon: 1, tutar: 300_000, durum: "sent", sebep: null, gonderim: "2026-10-21T09:00:00Z" },
      { id: "p4", root: null, revizyon: 1, tutar: 999_999, durum: "draft", sebep: null, gonderim: null },
    ];
    const satis = satisModeli({
      donem: EKIM, sozlesmeler: [], talepler: new Map(), personelAdi: new Map(),
      teklifler: ham.map((t) => ({
        id: t.id, root_proposal_id: t.root, amount: t.tutar,
        status: t.durum, archive_reason: t.sebep, sent_at: t.gonderim,
      })),
    });
    const teklif = teklifModeli({
      donem: EKIM, bugun: BUGUN, sozlesmeler: [], musteriAdi: new Map(),
      teklifler: ham.map((t) => ({
        id: t.id, proposal_no: t.id, title: "Teklif", root_proposal_id: t.root,
        revision_no: t.revizyon, amount: t.tutar, status: t.durum, archive_reason: t.sebep,
        sent_at: t.gonderim, responded_at: null, customer_responded_at: null, opportunity_id: "t1",
      })),
    });
    assert.equal(satis.teklifAdet, teklif.surecAdet, "teklif süreci sayısı iki raporda farklı");
    assert.equal(satis.kabulAdet, teklif.kabul, "kabul sayısı iki raporda farklı");
    assert.equal(satis.teklifTutari, teklif.surecTutar, "süreç tutarı iki raporda farklı");
    assert.equal(teklif.surecAdet, 2, "taslak sayılmıyor, revizyonlar tek süreç");
  });
});
