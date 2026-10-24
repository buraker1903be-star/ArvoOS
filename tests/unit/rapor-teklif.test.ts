import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { teklifModeli, teklifSayfalari, type TeklifSatiri, type TeklifSozlesmesi } from "../../lib/rapor-teklif";
import type { Donem } from "../../lib/rapor-donemi";

const EKIM: Donem = { startKey: "2026-10-01", endKey: "2026-10-31", key: "bu_ay" };
const BUGUN = "2026-10-24";

const teklif = (o: Partial<TeklifSatiri>): TeklifSatiri => ({
  id: "p1", proposal_no: "TKL-1", title: "Tez", root_proposal_id: null, revision_no: 1,
  amount: 100_000, status: "sent", archive_reason: null,
  sent_at: "2026-10-05T09:00:00Z", responded_at: null, customer_responded_at: null,
  opportunity_id: "t1", ...o,
});
/* Kabul edilmiş teklif canlıda BÖYLE duruyor: tetikleyici status'ü
   'archived' yapıp gerçek durumu archive_reason'a yazıyor. */
const kabul = (o: Partial<TeklifSatiri> = {}) =>
  teklif({ status: "archived", archive_reason: "accepted", responded_at: "2026-10-09T09:00:00Z", ...o });

const sozlesme = (o: Partial<TeklifSozlesmesi>): TeklifSozlesmesi => ({
  id: "s1", contract_no: "SOZ-1", title: "İş", amount: 200_000, status: "sent",
  sent_at: "2026-10-10T09:00:00Z", signed_at: null, created_at: "2026-10-10T09:00:00Z",
  first_viewed_at: null, view_count: 0, opportunity_id: "t1", ...o,
});

const calistir = (girdi: {
  teklifler?: TeklifSatiri[];
  sozlesmeler?: TeklifSozlesmesi[];
  donem?: Donem;
  bugun?: string;
  musteriler?: [string, string][];
}) => teklifModeli({
  donem: girdi.donem ?? EKIM,
  bugun: girdi.bugun ?? BUGUN,
  teklifler: girdi.teklifler ?? [],
  sozlesmeler: girdi.sozlesmeler ?? [],
  musteriAdi: new Map(girdi.musteriler ?? [["t1", "Akademik Merkez"]]),
});

describe("teklif ve sözleşme — süreçler", () => {
  it("revizyonları tek süreç sayar", () => {
    const m = calistir({ teklifler: [
      teklif({ id: "p1", revision_no: 1, amount: 80_000, sent_at: "2026-10-02T09:00:00Z" }),
      teklif({ id: "p2", root_proposal_id: "p1", revision_no: 2, amount: 95_000, sent_at: "2026-10-06T09:00:00Z" }),
      kabul({ id: "p3", root_proposal_id: "p1", revision_no: 3, amount: 110_000, sent_at: "2026-10-09T09:00:00Z" }),
    ] });
    assert.equal(m.surecAdet, 1);
    assert.equal(m.kabul, 1);
    assert.equal(m.donusum, 100);
    // Sürecin tutarı son GÖNDERİLEN revizyondan.
    assert.equal(m.surecTutar, 110_000);
    assert.equal(m.kabulTutar, 110_000);
    assert.equal(m.revizeSurec, 1);
    assert.equal(m.ortRevizyon, 3);
  });

  it("kabulü archive_reason'dan okur", () => {
    /* `status === "accepted"` arayan kod hiçbir kabul bulamaz:
       tetikleyici o durumu 'archived' yapıyor. */
    const m = calistir({ teklifler: [kabul()] });
    assert.equal(m.kabul, 1);
    assert.equal(m.dagilim[0].durum, "accepted");
    assert.equal(m.dagilim[0].ad, "Kabul edildi");
  });

  it("zincirin ortasındaki kabulü süreç kabulü sayar", () => {
    /* Kabul edilen revizyon sonradan bir düzeltmeyle "superseded"
       olabiliyor; yalnızca son revizyona bakmak kabul edilmiş bir
       satışı "yanıt bekliyor" göstermek olurdu. */
    const m = calistir({ teklifler: [
      kabul({ id: "p1", revision_no: 1, sent_at: "2026-10-02T09:00:00Z" }),
      teklif({ id: "p2", root_proposal_id: "p1", revision_no: 2, status: "sent", sent_at: "2026-10-10T09:00:00Z" }),
    ] });
    assert.equal(m.kabul, 1);
    assert.equal(m.yanitBekleyen, 0);
  });

  it("revizyonlar ters sırada gelse de son revizyonu bulur", () => {
    const m = calistir({ teklifler: [
      teklif({ id: "p2", root_proposal_id: "p1", revision_no: 2, status: "archived", archive_reason: "rejected", sent_at: "2026-10-10T09:00:00Z" }),
      teklif({ id: "p1", revision_no: 1, sent_at: "2026-10-02T09:00:00Z" }),
    ] });
    assert.equal(m.red, 1);
    assert.equal(m.yanitBekleyen, 0);
  });

  it("gönderilmemiş teklifi süreç saymaz", () => {
    const m = calistir({ teklifler: [teklif({ status: "draft", sent_at: null })] });
    assert.equal(m.surecAdet, 0);
    assert.equal(m.donusum, null);
  });

  it("dönem dışında gönderilen süreci saymaz", () => {
    const m = calistir({ teklifler: [teklif({ sent_at: "2026-09-20T09:00:00Z" })] });
    assert.equal(m.surecAdet, 0);
  });

  it("durum dağılımının toplamı süreç sayısına eşit", () => {
    const m = calistir({ teklifler: [
      kabul({ id: "a", opportunity_id: "t1" }),
      teklif({ id: "b", status: "archived", archive_reason: "rejected" }),
      teklif({ id: "c", status: "archived", archive_reason: "expired" }),
      teklif({ id: "d", status: "sent" }),
    ] });
    assert.equal(m.surecAdet, 4);
    assert.equal(m.dagilim.reduce((t, d) => t + d.adet, 0), 4);
    assert.deepEqual([m.kabul, m.red, m.sureGecti, m.yanitBekleyen], [1, 1, 1, 1]);
    assert.equal(m.donusum, 25);
  });

  it("yanıt süresini yanıtı ALAN revizyonun gönderiminden ölçer", () => {
    /* İlk gönderimden ölçmek, araya giren revizyonların süresini de
       müşterinin yanıt süresine yazmak olurdu. */
    const m = calistir({ teklifler: [
      teklif({ id: "p1", revision_no: 1, sent_at: "2026-10-01T09:00:00Z" }),
      kabul({ id: "p2", root_proposal_id: "p1", revision_no: 2, sent_at: "2026-10-20T09:00:00Z", responded_at: "2026-10-22T09:00:00Z" }),
    ] });
    assert.equal(m.ortYanitGun, 2);
  });

  it("yanıt yoksa ortalama null — sıfır değil", () => {
    const m = calistir({ teklifler: [teklif({})] });
    assert.equal(m.ortYanitGun, null);
  });

  it("kararı müşterinin verdiği süreci ayırır", () => {
    const m = calistir({ teklifler: [
      kabul({ id: "a", customer_responded_at: "2026-10-09T10:00:00Z" }),
      kabul({ id: "b" }),
    ] });
    assert.equal(m.kabul, 2);
    assert.equal(m.musteriKarari, 1);
  });

  it("yanıt süresi eksiye düşmez", () => {
    // Bozuk veri (yanıt gönderimden önce) negatif gün üretirdi.
    const m = calistir({ teklifler: [kabul({ sent_at: "2026-10-20T09:00:00Z", responded_at: "2026-10-18T09:00:00Z" })] });
    assert.equal(m.ortYanitGun, 0);
  });
});

describe("teklif ve sözleşme — sözleşme tarafı", () => {
  it("dönemde gönderilen ve imzalananı ayrı sayar", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", status: "sent", sent_at: "2026-10-10T09:00:00Z" }),
      sozlesme({ id: "b", status: "signed", sent_at: "2026-10-12T09:00:00Z", signed_at: "2026-10-15T09:00:00Z", amount: 300_000 }),
    ] });
    assert.equal(m.gonderilenSozlesme, 2);
    assert.equal(m.imzalananSozlesme, 1);
    assert.equal(m.imzalananTutar, 300_000);
    assert.equal(m.ortImzaGun, 3);
  });

  it("imza bekleyen DÖNEMDEN BAĞIMSIZ", () => {
    /* İki ay önce gönderilip hâlâ imzalanmamış sözleşme bu ayın
       raporunda da görünmeli; dönem süzgecinin arkasına saklamak
       raporun en çok işe yarayan satırını gizlemek olurdu. */
    const m = calistir({ sozlesmeler: [sozlesme({ sent_at: "2026-08-01T09:00:00Z", amount: 500_000 })] });
    assert.equal(m.gonderilenSozlesme, 0, "dönem akışına girmiyor");
    assert.equal(m.bekleyenler.length, 1);
    assert.equal(m.bekleyenTutar, 500_000);
    assert.equal(m.bekleyenler[0].beklemeGun, 84);
  });

  it("en uzun bekleyeni üste alır", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", contract_no: "SOZ-A", sent_at: "2026-10-20T09:00:00Z" }),
      sozlesme({ id: "b", contract_no: "SOZ-B", sent_at: "2026-09-01T09:00:00Z" }),
    ] });
    assert.equal(m.bekleyenler[0].no, "SOZ-B");
  });

  it("müşteri açtı mı bilgisini taşır", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", first_viewed_at: "2026-10-11T09:00:00Z", view_count: 3 }),
      sozlesme({ id: "b", contract_no: "SOZ-2", first_viewed_at: null, view_count: 0, sent_at: "2026-10-01T09:00:00Z" }),
    ] });
    const acilan = m.bekleyenler.find((b) => b.no === "SOZ-1");
    const acilmayan = m.bekleyenler.find((b) => b.no === "SOZ-2");
    assert.equal(acilan?.goruldu, true);
    assert.equal(acilan?.goruntuleme, 3);
    assert.equal(acilmayan?.goruldu, false);
  });

  it("imzalı ve tamamlanmışı ayırır — devam eden yalnızca imzalı", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", status: "signed", signed_at: "2026-10-15T09:00:00Z", amount: 100_000 }),
      sozlesme({ id: "b", status: "completed", signed_at: "2026-10-16T09:00:00Z", amount: 200_000 }),
    ] });
    assert.equal(m.imzalananSozlesme, 2, "ikisi de dönemde imzalandı");
    assert.equal(m.aktifAdet, 1, "devam eden yalnızca tamamlanmamış");
    assert.equal(m.aktifTutar, 100_000);
  });

  it("gönderimi olmayan imzayı ortalama imza süresine katmaz", () => {
    const m = calistir({ sozlesmeler: [
      sozlesme({ id: "a", status: "signed", sent_at: null, signed_at: "2026-10-15T09:00:00Z" }),
    ] });
    assert.equal(m.ortImzaGun, null);
  });

  it("müşterisi okunamayan bekleyende çizgi gösterir", () => {
    const m = calistir({ sozlesmeler: [sozlesme({ opportunity_id: null })] });
    assert.equal(m.bekleyenler[0].musteri, "—");
  });

  it("boş kurumda sıfır döner, çökmez", () => {
    const m = calistir({});
    assert.deepEqual([m.surecAdet, m.kabul, m.bekleyenTutar, m.aktifAdet], [0, 0, 0, 0]);
    assert.equal(m.donusum, null);
    assert.equal(m.ortRevizyon, null);
    assert.deepEqual(m.dagilim, []);
  });
});

describe("teklif Excel sayfaları", () => {
  const model = calistir({
    teklifler: [kabul({ amount: 150_000 })],
    sozlesmeler: [sozlesme({ amount: 200_000, first_viewed_at: "2026-10-11T09:00:00Z", view_count: 2 })],
  });
  const sayfalar = teklifSayfalari({ model, donemEtiket: "Bu ay" });
  const oku = (ad: string) => sayfalar[0].satirlar.find((r) => String(r[0]) === ad)?.[1];

  it("üç sekme üretir", () => {
    assert.deepEqual(sayfalar.map((s) => s.ad), ["Özet", "Teklif durumları", "İmza bekleyenler"]);
  });

  it("tutarı liraya, oranı orana çevirir", () => {
    assert.deepEqual(oku("Gönderilen teklif tutarı"), { deger: 1500, bicim: "para" });
    assert.deepEqual(oku("Teklif → kabul dönüşümü"), { deger: 1, bicim: "yuzde" });
  });

  it("ölçülemeyen ortalamayı boş bırakır", () => {
    const bos = teklifSayfalari({ model: calistir({}), donemEtiket: "Bu ay" });
    const bosOku = (ad: string) => bos[0].satirlar.find((r) => String(r[0]) === ad)?.[1];
    assert.equal(bosOku("Ortalama yanıt süresi (gün)"), null);
    assert.equal(bosOku("Ortalama imza süresi (gün)"), null);
    assert.deepEqual(bosOku("Teklif → kabul dönüşümü"), { deger: null, bicim: "yuzde" });
  });

  it("imza bekleyenler sekmesinde gönderim tarihi tarih biçiminde", () => {
    assert.equal(sayfalar[2].sutunlar[4].bicim, "tarih");
    assert.equal(sayfalar[2].satirlar[0][4], "2026-10-10");
    assert.equal(sayfalar[2].satirlar[0][6], "Evet (2 görüntüleme)");
  });

  it("her sayfada satır uzunluğu sütun sayısına eşit", () => {
    for (const sayfa of sayfalar) {
      for (const satir of sayfa.satirlar) {
        assert.equal(satir.length, sayfa.sutunlar.length, `${sayfa.ad} sayfasında satır/sütun uyuşmuyor`);
      }
    }
  });
});
