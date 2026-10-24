import type { SatisModeli } from "@/lib/rapor-satis";
import type { CrmModeli } from "@/lib/rapor-crm";
import type { TahsilatModeli } from "@/lib/rapor-tahsilat";
import type { FinansModeli } from "@/lib/rapor-finans";
import type { TeklifModeli } from "@/lib/rapor-teklif";
import type { OperasyonModeli } from "@/lib/rapor-operasyon";
import type { PersonelModeli } from "@/lib/rapor-personel";

/*
  RAPORLARIN KENDİ KENDİNİ DENETLEMESİ (24.10.2026).

  Bu alt sistemde bulunan kusurların HEPSİ aynı sınıftandı ve hiçbiri
  hata vermiyordu — yalnızca yanlış sayıyordu:

   - personel kutusunda iki işi de yapan kişi İKİ dilimde sayılıyor,
     dilimlerin toplamı kutudaki sayıyı aşıyordu;
   - teklif kutusunda süresi geçen süreçler hiçbir dilime girmiyor,
     toplam süreç sayısını tutmuyordu;
   - huni kümeleri aşamaların üçte birini tanımıyor, dönüşüm
     olduğundan küçük çıkıyordu;
   - kabul `status` sütununda aranıyor, hiçbir koşulda bulunmuyordu.

  Ortak nokta: BİR TOPLAM, OLMASI GEREKEN BAŞKA BİR TOPLAMLA
  TUTMUYORDU. Ekranda bu görünmez; rakam makul durur.

  Buradaki işlevler her raporun modelini alıp tutmayan toplamları
  LİSTELER. İki yerde kullanılıyor:

   1. Birim testlerinde — rastgele üretilmiş girdilerle (özellik
      tabanlı) koşuluyor, yani kusur canlıya çıkmadan yakalanıyor.
   2. Ekranda — tutarsızlık varsa rapor bunu YAZIYOR. Sessizce
      yanlış sayı göstermektense "bu rapordaki şu toplam tutmuyor"
      demek yeğdir; kullanıcı rakama güvenip karar vermez.

  KURAL: buraya yalnızca GERÇEKTEN değişmez olan ilişkiler yazılır.
  Yanlış bir değişmez, olmayan bir hatayı her gün bildiren bir uyarı
  üretir ve kullanıcı uyarıyı okumamayı öğrenir — denetim o gün ölür.
  Kırpılmış listeler (ilk 20, ilk 25) bu yüzden eşitlikle değil
  KÜÇÜKTÜR EŞİTTİR ile sınanıyor.
*/

export type Tutarsizlik = {
  /** Rapor kodu, ör. "RPR-01". */
  rapor: string;
  /** Hangi ilişki tutmadı. */
  olcut: string;
  beklenen: number;
  bulunan: number;
};

const esit = (rapor: string, olcut: string, beklenen: number, bulunan: number): Tutarsizlik[] =>
  beklenen === bulunan ? [] : [{ rapor, olcut, beklenen, bulunan }];

/** En çok `beklenen` kadar olmalı (kırpılmış listeler için). */
const enCok = (rapor: string, olcut: string, tavan: number, bulunan: number): Tutarsizlik[] =>
  bulunan <= tavan ? [] : [{ rapor, olcut, beklenen: tavan, bulunan }];

/** Yüzde karşılaştırması: kayan nokta nedeniyle binde bir tolerans. */
const oranEsit = (rapor: string, olcut: string, beklenen: number | null, bulunan: number | null): Tutarsizlik[] => {
  if (beklenen === null || bulunan === null) {
    return beklenen === bulunan ? [] : [{ rapor, olcut, beklenen: beklenen ?? -1, bulunan: bulunan ?? -1 }];
  }
  return Math.abs(beklenen - bulunan) < 0.001 ? [] : [{ rapor, olcut, beklenen, bulunan }];
};

const topla = <T>(liste: readonly T[], sec: (x: T) => number) => liste.reduce((t, x) => t + sec(x), 0);
const oran = (pay: number, payda: number) => (payda ? (pay / payda) * 100 : null);

/* ---------------- RPR-01 Satış ---------------- */
export function satisTutarliligi(m: SatisModeli): Tutarsizlik[] {
  const R = "RPR-01";
  return [
    ...esit(R, "Personel kırılımı tutarı = satış tutarı", m.toplam, topla(m.personel, (k) => k.tutar)),
    ...esit(R, "Personel kırılımı adedi = satış adedi", m.adet, topla(m.personel, (k) => k.adet)),
    ...esit(R, "Hizmet kırılımı tutarı = satış tutarı", m.toplam, topla(m.hizmet, (k) => k.tutar)),
    ...esit(R, "Hizmet kırılımı adedi = satış adedi", m.adet, topla(m.hizmet, (k) => k.adet)),
    ...esit(R, "Ortalama = tutar ÷ adet", m.adet ? Math.round(m.toplam / m.adet) : 0, m.ortalama),
    ...enCok(R, "Kabul edilen ≤ verilen teklif", m.teklifAdet, m.kabulAdet),
    ...enCok(R, "Atanmamış satış ≤ satış adedi", m.adet, m.atanmamisAdet),
    ...enCok(R, "En büyük satış listesi ≤ 10", 10, m.enBuyuk.length),
    ...enCok(R, "En büyük satış listesi ≤ satış adedi", m.adet, m.enBuyuk.length),
    ...oranEsit(R, "Dönüşüm = kabul ÷ teklif", oran(m.kabulAdet, m.teklifAdet), m.donusum),
    ...esit(R, "Aylık seri 6 ay", 6, m.aylik.length),
  ];
}

/* ---------------- RPR-02 CRM ---------------- */
export function crmTutarliligi(m: CrmModeli): Tutarsizlik[] {
  const R = "RPR-02";
  const imzalayan = m.yeniMusteri + m.tekrarEden;
  return [
    ...enCok(R, "Temas ≤ yeni talep", m.yeniTalep, m.temas),
    ...enCok(R, "Nitelikli ≤ temas", m.temas, m.nitelikli),
    ...enCok(R, "Teklife geçen ≤ nitelikli", m.nitelikli, m.teklifli),
    ...enCok(R, "Kazanılan ≤ teklife geçen", m.teklifli, m.kazanilan),
    ...esit(R, "Kaynak kırılımı adedi = yeni talep", m.yeniTalep, topla(m.kaynaklar, (k) => k.adet)),
    ...esit(R, "Kaynak kırılımı kazanımı = kazanılan", m.kazanilan, topla(m.kaynaklar, (k) => k.kazanilan)),
    ...esit(R, "Kayıp sebepleri adedi = kaybedilen", m.kayip, topla(m.kayipSebepleri, (s) => s.adet)),
    ...enCok(R, "Kaynağı girilmemiş ≤ yeni talep", m.yeniTalep, m.kaynakBelirtilmemis),
    ...oranEsit(R, "Tekrar oranı = tekrar ÷ dönemde imzalayan", oran(m.tekrarEden, imzalayan), m.tekrarOrani),
    ...oranEsit(R, "Dönüşüm = kazanılan ÷ yeni talep", oran(m.kazanilan, m.yeniTalep), m.donusum),
    ...enCok(R, "En değerli müşteri listesi ≤ 20", 20, m.enDegerli.length),
    ...esit(R, "Aylık seri 6 ay", 6, m.aylik.length),
  ];
}

/* ---------------- RPR-03 Tahsilat ---------------- */
export function tahsilatTutarliligi(m: TahsilatModeli): Tutarsizlik[] {
  const R = "RPR-03";
  const takvimToplami = topla(m.takvim, (a) => a.tutar);
  return [
    ...esit(R, "Planlı + plansız = açık alacak", m.acikBakiye, m.planliKalan + m.plansizKalan),
    ...enCok(R, "Planlı kalan ≤ açık alacak", m.acikBakiye, m.planliKalan),
    ...enCok(R, "Vadesi geçmiş ≤ planlı kalan", m.planliKalan, m.gecikmisKalan),
    ...enCok(R, "Takvim toplamı ≤ planlı kalan", m.planliKalan, takvimToplami),
    ...esit(R, "Net tahsilat = tahsilat − iade", Math.max(0, m.donemTahsilat - m.donemIade), m.donemNet),
    ...enCok(R, "Listelenen gecikmiş ≤ toplam gecikmiş", m.gecikmisKalan, topla(m.musteriler, (x) => x.gecikmis)),
    ...enCok(R, "Müşteri listesi ≤ 20", 20, m.musteriler.length),
    ...esit(R, "Gerçekleşen tahsilat serisi 6 ay", 6, m.aylikTahsilat.length),
  ];
}

/* ---------------- RPR-04 Finans ---------------- */
export function finansTutarliligi(m: FinansModeli): Tutarsizlik[] {
  const R = "RPR-04";
  return [
    ...esit(R, "Toplam çıkış = genel gider + iş maliyeti", m.gider + m.isMaliyeti, m.toplamCikis),
    ...esit(R, "Net sonuç = gelir − toplam çıkış", m.gelir - m.toplamCikis, m.netSonuc),
    ...esit(R, "Gelir kategorileri = gelir", m.gelir, topla(m.gelirKategorileri, (k) => k.tutar)),
    ...esit(R, "Gider kategorileri = genel gider", m.gider, topla(m.giderKategorileri, (k) => k.tutar)),
    ...esit(R, "Maliyet kategorileri = iş maliyeti", m.isMaliyeti, topla(m.maliyetKategorileri, (k) => k.tutar)),
    ...esit(R, "Gelir kategorileri adedi = gelir kaydı", m.gelirAdet, topla(m.gelirKategorileri, (k) => k.adet)),
    ...esit(R, "Gider kategorileri adedi = gider kaydı", m.giderAdet, topla(m.giderKategorileri, (k) => k.adet)),
    ...oranEsit(R, "Marj = net ÷ gelir", oran(m.netSonuc, m.gelir), m.marj),
    ...esit(R, "Gelir defteri boş = gelir kaydı yok", m.gelirAdet === 0 ? 1 : 0, m.gelirDefteriBos ? 1 : 0),
    ...esit(R, "Aylık seri 6 ay", 6, m.aylik.length),
  ];
}

/* ---------------- RPR-05 Personel ---------------- */
export function personelTutarliligi(m: PersonelModeli): Tutarsizlik[] {
  const R = "RPR-05";
  const satirPrimi = topla(m.satis, (s) => s.primTahakkuk) + topla(m.operasyon, (o) => o.primTahakkuk);
  const satirOdenen = topla(m.satis, (s) => s.primOdenen) + topla(m.operasyon, (o) => o.primOdenen);
  return [
    ...enCok(R, "Atamasız personel ≤ aktif personel", m.aktifPersonel, m.atamasizPersonel),
    /*
      "Ödenen ≤ tahakkuk" DEĞİŞMEZ DEĞİL ve bu ölçüt buradan
      kaldırıldı (rastgele girdi testi ilk turda yakaladı).
      İkisi farklı tarihlerle dönemleniyor: tahakkuk `accrued_at`,
      ödeme `paid_at`. Eylülde tahakkuk edip ekimde ödenen bir prim
      ekim raporunda "tahakkuk 0, ödenen X" verir — doğru davranış.
      Yanlış bir değişmez, olmayan bir hatayı her gün bildirip
      denetimi öldürürdü.
    */
    /* Tablolar yalnızca KAYDI OLAN kişileri gösteriyor; kadroda olup
       primi olan ama kaydı olmayan biri toplamda var, satırda yok. */
    ...enCok(R, "Satırlardaki prim ≤ toplam tahakkuk", m.primTahakkuk, satirPrimi),
    ...enCok(R, "Satırlardaki ödenen ≤ toplam ödenen", m.primOdenen, satirOdenen),
    ...m.satis.flatMap((s) =>
      oranEsit(R, `${s.ad}: dönüşüm = kazanılan ÷ talep`, oran(s.kazanilan, s.talep), s.donusum)),
    /* Kişinin kazanımı talebini AŞABİLİR: talep temmuzda açılmış,
       kazanım bu dönemde olmuş olabilir. Geçerli bir üst sınır yok,
       o yüzden burada bir ölçüt de yok. */
    ...esit(R, "Aylık seri 6 ay", 6, m.aylik.length),
  ];
}

/* ---------------- RPR-06 Operasyon ---------------- */
export function operasyonTutarliligi(m: OperasyonModeli): Tutarsizlik[] {
  const R = "RPR-06";
  return [
    ...esit(R, "Kişi yükü (devam eden) = devam eden iş", m.devamEden, topla(m.kisiYuku, (k) => k.aktif)),
    ...esit(R, "Kişi yükü (geciken) = termini geçmiş", m.geciken, topla(m.kisiYuku, (k) => k.geciken)),
    ...esit(R, "Kişi yükü (tamamlanan) = dönemde tamamlanan", m.tamamlanan, topla(m.kisiYuku, (k) => k.tamamlanan)),
    ...esit(R, "Öncelik dağılımı = devam eden iş", m.devamEden, topla(m.oncelikDagilimi, (d) => d.adet)),
    ...esit(R, "Bekleyen taraf dağılımı = devam eden iş", m.devamEden, topla(m.bekleyenTarafDagilimi, (d) => d.adet)),
    ...enCok(R, "Termini geçmiş ≤ devam eden", m.devamEden, m.geciken),
    ...enCok(R, "Bizde olmayan ≤ devam eden", m.devamEden, m.bizdeOlmayan),
    ...enCok(R, "Tamamlanan görev ≤ görev sayısı", m.adimToplam, m.adimTamamlanan),
    ...enCok(R, "Termini geçmiş görev ≤ görev sayısı", m.adimToplam, m.adimGeciken),
    ...enCok(R, "Gecikme listesi ≤ 25", 25, m.gecikenler.length),
    ...enCok(R, "Gecikme listesi ≤ termini geçmiş", m.geciken, m.gecikenler.length),
    ...esit(R, "Aylık seri 6 ay", 6, m.aylik.length),
  ];
}

/* ---------------- RPR-07 Teklif ---------------- */
export function teklifTutarliligi(m: TeklifModeli): Tutarsizlik[] {
  const R = "RPR-07";
  return [
    ...esit(R, "Durum dağılımı = gönderilen süreç", m.surecAdet, topla(m.dagilim, (d) => d.adet)),
    ...enCok(R, "Kabul + ret + süre + bekleyen ≤ süreç", m.surecAdet, m.kabul + m.red + m.sureGecti + m.yanitBekleyen),
    ...enCok(R, "Kabul ≤ süreç", m.surecAdet, m.kabul),
    ...enCok(R, "Revize edilen ≤ süreç", m.surecAdet, m.revizeSurec),
    ...enCok(R, "Kararı müşteri veren ≤ süreç", m.surecAdet, m.musteriKarari),
    ...enCok(R, "Listelenen bekleyen tutarı ≤ toplam bekleyen", m.bekleyenTutar, topla(m.bekleyenler, (b) => b.tutar)),
    ...enCok(R, "Bekleyen listesi ≤ 20", 20, m.bekleyenler.length),
    ...oranEsit(R, "Dönüşüm = kabul ÷ süreç", oran(m.kabul, m.surecAdet), m.donusum),
    ...esit(R, "Durum dağılımı tutarı = süreç tutarı", m.surecTutar, topla(m.dagilim, (d) => d.tutar)),
  ];
}
