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

/*
  NUMARA VADEYE GÖRE VERİLİR, dizi sırasına göre değil.

  Eskiden `yenidenBol` ödenmiş taksitleri başa, yeni taksitleri sona
  koyup sırayla numaralıyordu. Yeni ilk vade korunan bir taksitten
  ÖNCEYE düştüğünde numaralar tarihlerle uyumsuz kalıyordu:
  "1. taksit" en SON vadeli taksit olabiliyordu. Canlıda görüldü
  (23.10.2026, SOZ-2026-000059): ekranda taksitler 2, 3, 1, 4
  sırasıyla diziliydi ve müşteriye gönderilen ödeme takviminde de
  aynı numaralar yazıyor.

  Sıralama KARARLI: aynı vadeli taksitlerde eklenme sırası korunuyor,
  yani kısmen ödenmiş bir taksitin ödenen kısmı kalanından önce
  numaralanıyor.
*/
const numarala = (liste: { vade: string; tutar: number }[]): PlanTaksidi[] =>
  [...liste]
    .sort((a, b) => a.vade.localeCompare(b.vade))
    .map((t, i) => ({ no: i + 1, vade: t.vade, tutar: t.tutar }));

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

  const tutar = Math.round(toplam);
  if (!Number.isFinite(tutar) || tutar <= 0) return { hata: "Sözleşme tutarı geçersiz." };

  /*
    ÖDENEN TUTAR İLK TAKSİT OLUR, KALAN SONRAKİLERE BÖLÜNÜR.

    Kurum sahibinin kararı (23.10.2026) ve iki aşamada oturdu:

    1. Önce ödenmiş kısımlar AYRI SATIR olarak korunuyor, yalnızca
       kalan bölünüyordu. 19.000 TL'lik sözleşmede "3 taksit"
       seçilince ekranda BEŞ satır çıkıyordu (SOZ-2026-000059) ve
       bir şey ödendiği anda plan bir daha eşit taksitli hâle
       gelemiyordu.
    2. Sonra toplam eşit bölündü; bu kez ilk taksit ödenenden 34
       kuruş fazla kalıyor ve "kısmi" görünüyordu. Ödenmiş bir
       taksitin kuruşu kalması operasyonda takip gerektiriyor.

    Şimdiki kural ikisini de çözüyor: ilk taksit TAM OLARAK ödenen
    tutar (kısmi kalmıyor, kapanıyor), kalan tutar geri kalan
    taksitlere eşit bölünüyor.

      19.000 toplam, 6.333 ödenmiş, 3 taksit:
        6.333,00 (ödendi) + 6.333,50 + 6.333,50 = 19.000,00

    ÖDENEN YOKSA eski davranış: toplam eşit bölünür.

    İLK TAKSİTİN VADESİ `ilkVade`: kullanıcı zaten "ilk vade"yi
    seçiyor ve ödenmiş taksit her hâlükârda en erken vadeli olduğu
    için tahsilat ona dağıtılıyor (lib/taksit-dagitimi.ts — dağıtım
    en erken vadeden başlıyor). Ödemenin GERÇEK tarihi cari hareket
    dökümünde duruyor; taksit planı bir takvim, bir kütük değil.

    TEK TAKSİT SEÇİLİRSE bölünecek bir "sonraki" yok: toplam tek
    taksit olur, yoksa kalan tutar sessizce düşerdi.
  */
  const odenmis = Math.min(
    tutar,
    plan.reduce((s, t) => s + Math.min(t.tutar, Math.max(0, Math.round(t.odenen))), 0),
  );
  if (odenmis < 0) return { hata: "Ödenen tutar okunamadı." };

  const esitBol = (hedef: number, parca: number, baslangic: number) => {
    const taban = Math.floor(hedef / parca);
    const artan = hedef - taban * parca;
    return Array.from({ length: parca }, (_, i) => ({
      vade: ayEkle(secim.ilkVade, (baslangic + i) * aralik),
      tutar: taban + (i < artan ? 1 : 0),
    }));
  };

  if (odenmis <= 0 || adet === 1) {
    return numarala(esitBol(tutar, adet, 0).filter((t) => t.tutar > 0));
  }

  const kalan = tutar - odenmis;
  if (kalan <= 0) {
    /* Tamamı ödenmiş: tek satır, tutarı sözleşme tutarı. */
    return numarala([{ vade: secim.ilkVade, tutar }]);
  }

  return numarala([
    { vade: secim.ilkVade, tutar: odenmis },
    ...esitBol(kalan, adet - 1, 1).filter((t) => t.tutar > 0),
  ]);
}

/*
  EK HİZMETİ AÇIK TAKSİTLERE DAĞITMA (26.10.2026).

  Müşteri ek hizmet aldığında "kalan taksitlere eşit dağıtın" diyebiliyor
  (SOZ-2026-000059: 7.000 TL ek hizmet, ödenmemiş iki taksit → her birine
  3.500 TL). Eskiden bunun yolu yoktu: plan sözleşme tutarına kilitliydi,
  ek hizmet takvimin dışında kalıyordu.

  AÇIK TAKSİT: ödenen kısmı tutarından küçük olan (kısmen ödenmiş dahil).
  Ödenmiş taksite dokunulmaz — kapanmış bir taksitin yeniden açılması
  müşteriye "borcunuz var" demek olur. Vadeler değişmez; yalnızca
  tutarlar. Artan kuruş BAŞTAKİ taksitlere (yenidenBol ile aynı kural).

  NEGATİF tutar ters işlemdir (ek hizmet taksitlerden çıkarılıyor): yine
  eşit düşülür, ama hiçbir taksit ödenen kısmının altına inemez; inen
  taksitin payı ötekilere kayar. Sıfıra inen (ödemesi olmayan) taksit
  plandan çıkar, tutarDegistir'deki gibi.
*/
export function ekHizmetiDagit(
  plan: (PlanTaksidi & { odenen: number })[],
  tutar: number,
): PlanTaksidi[] | { hata: string } {
  const fark = Math.round(tutar);
  if (!Number.isFinite(fark) || fark === 0) return { hata: "Ek hizmet tutarı geçersiz." };
  const sirali = [...plan].sort((a, b) => a.no - b.no).map((t) => ({ ...t, odenen: Math.max(0, Math.round(t.odenen)) }));
  const acik = sirali.filter((t) => t.odenen < t.tutar);
  if (!acik.length) return { hata: "Ödenmemiş taksit yok; ek hizmet dağıtılacak bir taksit kalmamış." };

  if (fark > 0) {
    const taban = Math.floor(fark / acik.length);
    const artan = fark - taban * acik.length;
    acik.forEach((t, i) => { t.tutar += taban + (i < artan ? 1 : 0); });
    return numarala(sirali);
  }

  // Ters işlem: her açık taksit en fazla ödenmemiş kısmı kadar azalır.
  let kalan = -fark;
  let adaylar = acik;
  while (kalan > 0 && adaylar.length) {
    const taban = Math.floor(kalan / adaylar.length);
    const artan = kalan - taban * adaylar.length;
    adaylar.forEach((t, i) => {
      const dus = Math.min(t.tutar - t.odenen, taban + (i < artan ? 1 : 0));
      t.tutar -= dus;
      kalan -= dus;
    });
    adaylar = adaylar.filter((t) => t.tutar > t.odenen);
  }
  if (kalan > 0) return { hata: "Ek hizmetin tutarı ödenmemiş taksitlerin toplamından büyük; taksitlerden çıkarılamaz." };
  const dolu = sirali.filter((t) => t.tutar > 0);
  return numarala(dolu.length ? dolu : sirali.slice(0, 1));
}
