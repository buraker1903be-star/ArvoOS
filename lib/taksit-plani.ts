/*
  TAKSİT PLANI DÜZENLEME (Finans → Müşteriler → cari penceresi, 2026-10).

  İki işlem, ikisi de planın TOPLAMINI sözleşme tutarında tutar (toplam
  saptığında kalanlar açık bakiyeyi aşıyor, "30.000 TL açık, 40.000 TL
  vadesi geçti" gibi imkânsız tablolar çıkıyordu — 09.10.2026):

  1) tutarDegistir: bir taksitin tutarı değişir, fark SONRAKİ taksitlere
     gider (kurum sahibinin kararı). Azalırsa fark bir sonrakine eklenir;
     artarsa sonrakilerden sırayla düşülür (sıfırın altına inmez). Son
     taksit azalırsa fark bir ay sonra vadeli yeni bir taksit olur. Sıfıra
     inen taksit plandan çıkar, numaralar yeniden sıralanır.

  2) yenidenBol: taksit seçeneği değişir (adet, ilk vade, aralık). Ödenmiş
     kısım korunur: tamamen ödenmiş taksitler olduğu gibi kalır, kısmen
     ödenmişin ödenen kısmı ayrı (ödenmiş) taksit olur; kalan tutar yeni
     taksitlere bölünür. Artan kuruş BAŞTAKİ taksitlere eklenir (AGENTS.md:
     toplam her zaman birebir tutar).

  Tutarlar kuruş, tarihler "YYYY-AA-GG". Saf modül: tests/unit/taksit-plani.test.ts.
*/

export type PlanTaksidi = { no: number; vade: string; tutar: number };

/** "YYYY-AA-GG" + k ay; ayın günü taşarsa ay sonuna çekilir (31 Ocak + 1 ay = 28/29 Şubat). */
export function ayEkle(gun: string, ay: number): string {
  const [y, m, d] = gun.split("-").map(Number);
  const hedef = new Date(Date.UTC(y, m - 1 + ay, 1));
  const sonGun = new Date(Date.UTC(hedef.getUTCFullYear(), hedef.getUTCMonth() + 1, 0)).getUTCDate();
  hedef.setUTCDate(Math.min(d, sonGun));
  return hedef.toISOString().slice(0, 10);
}

const numarala = (liste: { vade: string; tutar: number }[]): PlanTaksidi[] => liste.map((t, i) => ({ no: i + 1, vade: t.vade, tutar: t.tutar }));

export function tutarDegistir(plan: PlanTaksidi[], hedefNo: number, yeniTutar: number): PlanTaksidi[] | { hata: string } {
  const sirali = [...plan].sort((a, b) => a.no - b.no).map((t) => ({ ...t }));
  const sira = sirali.findIndex((t) => t.no === hedefNo);
  if (sira < 0) return { hata: "Taksit bulunamadı." };
  const yeni = Math.round(yeniTutar);
  if (!Number.isFinite(yeni) || yeni < 0) return { hata: "Geçerli bir tutar girin." };

  let fark = sirali[sira].tutar - yeni; // > 0: azaldı, sonrakilere eklenecek; < 0: arttı, sonrakilerden düşülecek
  sirali[sira].tutar = yeni;
  for (let i = sira + 1; i < sirali.length && fark !== 0; i++) {
    if (fark > 0) {
      sirali[i].tutar += fark;
      fark = 0;
    } else {
      const dus = Math.min(sirali[i].tutar, -fark);
      sirali[i].tutar -= dus;
      fark += dus;
    }
  }
  if (fark < 0) return { hata: "Bu tutar, sonraki taksitlerin toplamını aşıyor; plan sözleşme tutarını geçemez." };
  if (fark > 0) sirali.push({ no: sirali.length + 1, vade: ayEkle(sirali[sirali.length - 1].vade, 1), tutar: fark });
  // Sıfıra inen taksit plandan çıkar; tamamı sıfırsa (sözleşme 0) en az bir taksit kalır.
  const dolu = sirali.filter((t) => t.tutar > 0);
  return numarala(dolu.length ? dolu : sirali.slice(0, 1));
}

export function yenidenBol(
  plan: (PlanTaksidi & { odenen: number })[],
  toplam: number,
  secim: { adet: number; ilkVade: string; aralikAy: number },
): PlanTaksidi[] | { hata: string } {
  const adet = Math.round(secim.adet);
  const aralik = Math.round(secim.aralikAy);
  if (!Number.isInteger(adet) || adet < 1 || adet > 36) return { hata: "Taksit sayısı 1–36 arasında olmalı." };
  if (!Number.isInteger(aralik) || aralik < 1 || aralik > 12) return { hata: "Taksit aralığı 1–12 ay arasında olmalı." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(secim.ilkVade)) return { hata: "İlk vade tarihi seçin." };

  // Ödenmiş kısım korunur: tamamı ödenenler aynen, kısmen ödenenin ödenen kısmı.
  const korunan: { vade: string; tutar: number }[] = [];
  for (const t of [...plan].sort((a, b) => a.no - b.no)) {
    const odenen = Math.min(t.tutar, Math.max(0, Math.round(t.odenen)));
    if (odenen > 0) korunan.push({ vade: t.vade, tutar: odenen });
  }
  const odenmis = korunan.reduce((s, t) => s + t.tutar, 0);
  const kalan = Math.round(toplam) - odenmis;
  if (kalan < 0) return { hata: "Ödenen tutar sözleşme tutarını aşıyor; plan yeniden bölünemez." };
  if (kalan === 0) return { hata: "Bu sözleşmenin ödenecek kalanı yok." };

  const taban = Math.floor(kalan / adet);
  const artan = kalan - taban * adet;
  const yeni = Array.from({ length: adet }, (_, i) => ({
    vade: ayEkle(secim.ilkVade, i * aralik),
    tutar: taban + (i < artan ? 1 : 0),
  })).filter((t) => t.tutar > 0);
  return numarala([...korunan, ...yeni]);
}
