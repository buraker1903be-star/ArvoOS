import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { satisModeli, satisSayfalari } from "../../lib/rapor-satis";
import { crmModeli, crmSayfalari } from "../../lib/rapor-crm";
import { finansModeli, finansSayfalari } from "../../lib/rapor-finans";
import { teklifModeli, teklifSayfalari } from "../../lib/rapor-teklif";
import { operasyonModeli, operasyonSayfalari } from "../../lib/rapor-operasyon";
import { tahsilatModeli, tahsilatSayfalari } from "../../lib/rapor-tahsilat";
import type { Hucre } from "../../lib/xlsx";
import type { Donem } from "../../lib/rapor-donemi";

/*
  EXCEL İLE EKRAN AYNI SAYIYI SÖYLEMELİ.

  Dosya ekranla aynı modelden üretiliyor ama sayfa üreteçleri birim
  dönüşümü yapıyor: para KURUŞ tamsayı tutuluyor, Excel'in para
  biçimi LİRA bekliyor, yüzde biçimi ORAN bekliyor (0,5 = %50). Bir
  üreteçte bu dönüşüm atlanırsa hücre yine "geçerli" görünür —
  yalnızca tutar yüz katına çıkar.

  Burada ÖZET sayfasındaki toplam ile AYRINTI sayfasının ilgili
  sütununun toplamı karşılaştırılıyor. İkisi aynı modelden çıkıyor
  ama ayrı kod yollarından geçiyor; ayrışırlarsa dönüşüm kaymıştır.

  Girdiler rastgele (tohumlu): tek bir örnek, sıfır ya da tek
  elemanlı listelerde gizlenen kaymaları göstermez.
*/
const TUR = 120;

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
const sec = <T>(r: () => number, l: readonly T[]) => l[Math.floor(r() * l.length)];
const adet = (r: () => number, t: number) => Math.floor(r() * t);
const tutar = (r: () => number) => Math.floor(r() * 3_000_000);
const an = (r: () => number) =>
  `2026-${sec(r, ["08", "09", "10"])}-${String(1 + adet(r, 27)).padStart(2, "0")}T10:00:00Z`;
const gun = (r: () => number) => an(r).slice(0, 10);

/** Hücrenin sayısal değeri (biçimli hücre de olabilir). */
const sayi = (h: Hucre): number => {
  if (typeof h === "number") return h;
  if (h && typeof h === "object" && "deger" in h && typeof h.deger === "number") return h.deger;
  return Number.NaN;
};
/** Özet sayfasından etikete göre değer. */
const ozet = (sayfalar: { ad: string; satirlar: Hucre[][] }[], etiket: string) =>
  sayi(sayfalar[0].satirlar.find((s) => String(s[0]) === etiket)?.[1] ?? Number.NaN);
/** Bir sayfanın sütun toplamı. */
const sutunToplami = (sayfa: { satirlar: Hucre[][] }, sutun: number) =>
  sayfa.satirlar.reduce((t, s) => t + (Number.isFinite(sayi(s[sutun])) ? sayi(s[sutun]) : 0), 0);
/** Kuruş → lira, iki hane yuvarlamayla (float toplamı için). */
const yakin = (a: number, b: number, ad: string) =>
  assert.ok(Math.abs(a - b) < 0.005, `${ad}: ${a} ≠ ${b}`);

describe("Excel ↔ ekran paritesi", () => {
  it("RPR-01 Satış: kırılım sayfaları özetteki tutarı tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = satisModeli({
        donem: EKIM,
        sozlesmeler: Array.from({ length: adet(r, 10) }, (_, i) => ({
          id: `s${i}`, contract_no: `SOZ-${i}`, title: "İş", amount: tutar(r),
          status: sec(r, ["signed", "completed", "draft"]), signed_at: an(r), created_at: an(r),
          opportunity_id: "t1",
        })),
        teklifler: [],
        talepler: new Map([["t1", { assigned_employee_id: "e1", customer_name: "A", service_type: "Tez" }]]),
        personelAdi: new Map([["e1", "Ayşe"]]),
      });
      const s = satisSayfalari({ model: m, donemEtiket: "Bu ay" });
      yakin(ozet(s, "Satış tutarı (imzalanan sözleşme)"), sutunToplami(s[2], 1), `tohum ${tohum} personel`);
      yakin(ozet(s, "Satış tutarı (imzalanan sözleşme)"), sutunToplami(s[3], 1), `tohum ${tohum} hizmet`);
      yakin(ozet(s, "Satış adedi"), sutunToplami(s[2], 2), `tohum ${tohum} personel adedi`);
    }
  });

  it("RPR-04 Finans: kategori sayfaları özetteki tutarları tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = finansModeli({
        donem: EKIM, bugun: BUGUN,
        hareketler: Array.from({ length: adet(r, 14) }, () => ({
          transaction_type: sec(r, ["income", "expense"]),
          status: sec(r, ["paid", "planned", "canceled"]),
          amount: tutar(r), category: sec(r, ["Kira", "Danışmanlık", null]),
          title: "K", counterparty: null, due_date: gun(r), paid_at: an(r), created_at: an(r),
        })),
        maliyetler: Array.from({ length: adet(r, 6) }, () => ({
          amount: tutar(r), status: sec(r, ["paid", "planned"]), cost_date: gun(r), category: "Tedarikçi",
        })),
      });
      const s = finansSayfalari({ model: m, donemEtiket: "Bu ay" });
      yakin(ozet(s, "Gelir (muhasebesel, ödenmiş)"), sutunToplami(s[2], 1), `tohum ${tohum} gelir`);
      yakin(ozet(s, "Genel gider (ödenmiş)"), sutunToplami(s[3], 1), `tohum ${tohum} gider`);
      yakin(ozet(s, "İş maliyeti (ödenmiş)"), sutunToplami(s[4], 1), `tohum ${tohum} maliyet`);
      // Aylık sayfanın net sütunu = gelir − gider − maliyet
      for (const satir of s[1].satirlar) {
        yakin(sayi(satir[1]) - sayi(satir[2]) - sayi(satir[3]), sayi(satir[4]), `tohum ${tohum} aylık net`);
      }
    }
  });

  it("RPR-02 CRM: kaynak sayfası özetteki talep sayısını tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = crmModeli({
        donem: EKIM,
        talepler: Array.from({ length: adet(r, 12) }, (_, i) => ({
          id: `t${i}`, stage: sec(r, ["lead", "won", "lost", "work_opened", "proposal_ready"]),
          source: sec(r, ["Google", "Referans", null]), lost_reason: "Fiyat",
          estimated_value: tutar(r), created_at: an(r), updated_at: an(r),
        })),
        sozlesmeler: [], musteriAdi: new Map(), cariAdi: new Map(),
      });
      const s = crmSayfalari({ model: m, donemEtiket: "Bu ay" });
      yakin(ozet(s, "Yeni talep"), sutunToplami(s[1], 1), `tohum ${tohum} kaynak talep`);
      yakin(ozet(s, "Kazanılan"), sutunToplami(s[1], 2), `tohum ${tohum} kaynak kazanım`);
      yakin(ozet(s, "Kaybedilen"), sutunToplami(s[2], 1), `tohum ${tohum} kayıp sebebi`);
    }
  });

  it("RPR-07 Teklif: durum sayfası özetteki süreç sayısını tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = teklifModeli({
        donem: EKIM, bugun: BUGUN,
        teklifler: Array.from({ length: adet(r, 10) }, (_, i) => ({
          id: `p${i}`, proposal_no: `T${i}`, title: "T", root_proposal_id: null,
          revision_no: 1, amount: tutar(r), status: sec(r, ["sent", "archived"]),
          archive_reason: sec(r, [null, "accepted", "rejected", "expired"]),
          sent_at: an(r), responded_at: null, customer_responded_at: null, opportunity_id: "t1",
        })),
        sozlesmeler: [], musteriAdi: new Map(),
      });
      const s = teklifSayfalari({ model: m, donemEtiket: "Bu ay" });
      yakin(ozet(s, "Gönderilen teklif süreci"), sutunToplami(s[1], 1), `tohum ${tohum} durum adedi`);
      yakin(ozet(s, "Gönderilen teklif tutarı"), sutunToplami(s[1], 2), `tohum ${tohum} durum tutarı`);
    }
  });

  it("RPR-06 Operasyon: ekip ve dağılım sayfaları özetle tutuyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = operasyonModeli({
        donem: EKIM, bugun: BUGUN,
        isler: Array.from({ length: adet(r, 12) }, (_, i) => ({
          id: `i${i}`, title: `İş ${i}`, customer_name: "A",
          status: sec(r, ["planned", "in_progress", "blocked", "completed", "cancelled"]),
          priority: sec(r, ["low", "normal", "high", "urgent"]),
          waiting_party: sec(r, ["us", "customer", "third_party"]),
          start_date: gun(r), due_date: gun(r), delivered_at: an(r),
          assigned_employee_id: sec(r, ["e1", "e2", null]), created_at: an(r), updated_at: an(r),
        })),
        adimlar: [], personelAdi: new Map([["e1", "Ayşe"], ["e2", "Mehmet"]]),
      });
      const s = operasyonSayfalari({ model: m, donemEtiket: "Bu ay" });
      yakin(ozet(s, "Devam eden iş (şu an)"), sutunToplami(s[4], 1), `tohum ${tohum} ekip aktif`);
      yakin(ozet(s, "Termini geçmiş iş (şu an)"), sutunToplami(s[4], 2), `tohum ${tohum} ekip geciken`);
      yakin(ozet(s, "Dönemde tamamlanan iş"), sutunToplami(s[4], 3), `tohum ${tohum} ekip tamamlanan`);
      yakin(ozet(s, "Devam eden iş (şu an)"), sutunToplami(s[2], 1), `tohum ${tohum} öncelik`);
      yakin(ozet(s, "Devam eden iş (şu an)"), sutunToplami(s[3], 1), `tohum ${tohum} bekleyen taraf`);
    }
  });

  it("RPR-03 Tahsilat: takvim toplamı planlı kalanı aşmıyor", () => {
    for (let tohum = 1; tohum <= TUR; tohum += 1) {
      const r = uretec(tohum);
      const m = tahsilatModeli({
        donem: EKIM, bugun: BUGUN, hareketler: [],
        cariler: Array.from({ length: adet(r, 5) }, (_, i) => {
          const bakiye = tutar(r);
          return {
            id: `c${i}`, ad: `C${i}`, bakiye, netTahsilat: adet(r, bakiye),
            taksitler: Array.from({ length: adet(r, 4) }, (_, j) => ({
              id: `i${i}-${j}`, due_date: gun(r), amount: adet(r, bakiye),
              status: sec(r, ["pending", "paid", "cancelled"]),
            })),
          };
        }),
      });
      const s = tahsilatSayfalari({ model: m, donemEtiket: "Bu ay" });
      const takvim = sutunToplami(s[1], 1);
      const planli = ozet(s, "Ödeme planına bağlı kalan");
      assert.ok(takvim <= planli + 0.005, `tohum ${tohum}: takvim ${takvim} > planlı ${planli}`);
      yakin(ozet(s, "Açık alacak (şu an)"), planli + ozet(s, "Planı olmayan kalan"), `tohum ${tohum} bakiye`);
    }
  });
});
