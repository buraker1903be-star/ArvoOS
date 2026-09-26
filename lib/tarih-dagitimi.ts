/*
  AŞAMA TARİHLERİNİ İŞİN TAKVİMİNE DAĞITMAK.

  Neden var: canlıda (27.09.2026) sekiz işin sekizinde de aşama tarihi
  boştu. Tarih olmadan pano gecikme uyarısı üretmiyor, Takvim işi hiç
  göstermiyor, hatırlatma zinciri çalışmıyor — yani operasyon ekibinin
  "planlama yapamıyoruz" şikâyetinin kaynağı doğrudan bu. Elle girmek sekiz
  iş × sekiz aşama demek ve kimse yapmıyor.

  Adım şablonundaki gün ofseti (organization_step_templates.day_offset)
  yalnızca YENİ açılan işe tarih veriyor; açık bir işin adımları altından
  değişmiyor. Bu modül açık işler için.

  ÇAPA FİKRİ: elle girilmiş tarihler sabit kalır ve aralarındaki boşluklar
  onlara göre bölünür. "Üçüncü aşamaya 20 Ekim dedim, gerisini sen dağıt"
  operasyoncunun doğal çalışma biçimi; her dağıtımda elle girilenin
  ezilmesi aracı kullanılamaz yapardı.

  UYDURMA YOK: çapasız kalan aşamaya tarih ATANMAZ. İşin başlangıcı yoksa
  ilk boşluk, termini yoksa son boşluk dağıtılamaz ve kaç aşamanın
  atlandığı geri bildiriliyor — ekran bunu kullanıcıya yazıyor.

  Testi: tests/unit/tarih-dagitimi.test.ts
*/

import { gunFarki } from "./is-adimlari";

export interface DagitilacakAdim {
  id: string;
  sort_order: number;
  due_date: string | null;
  is_completed: boolean;
}

export interface DagitimSonucu {
  /** Yazılacak tarihler. Boşsa dağıtılacak bir şey yok. */
  atamalar: { id: string; tarih: string }[];
  /** Çapa bulunamadığı için tarihsiz bırakılan aşama sayısı. */
  atlanan: number;
}

/** "YYYY-MM-DD" + n gün */
const gunEkle = (gun: string, ekle: number) =>
  new Date(Date.parse(`${gun}T00:00:00Z`) + ekle * 86_400_000).toISOString().slice(0, 10);

type Capa = { sira: number; tarih: string; sanalTermin: boolean };

/**
 * Tarihsiz aşamaları işin başlangıcı, termini ve elle girilmiş aşama
 * tarihleri arasına dağıtır. Tamamlanmış aşamalara ve tarihi olanlara
 * dokunmaz.
 */
export function tarihleriDagit(
  adimlar: DagitilacakAdim[],
  sinirlar: { baslangic: string | null; termin: string | null },
): DagitimSonucu {
  const sirali = [...adimlar].sort((a, b) => a.sort_order - b.sort_order);

  /*
    Üç sınıf:
      çapa   → tarihi olan aşama (tamamlanmış olsun olmasın, tarih tarihtir)
      hedef  → tarihi olmayan ve TAMAMLANMAMIŞ aşama
      yok    → tarihi olmayan ama tamamlanmış aşama

    Sonuncusuna bilerek dokunulmuyor: bitmiş bir işe ileri tarih yazmak
    "bu aşama gelecekte teslim edilecek" demek olurdu ve takvimde biten iş
    yeniden belirirdi. Boşluk sayımına da girmiyor.
  */
  const capalar: Capa[] = [];
  const hedefler: { id: string; sira: number }[] = [];
  sirali.forEach((adim, sira) => {
    if (adim.due_date) capalar.push({ sira, tarih: adim.due_date, sanalTermin: false });
    else if (!adim.is_completed) hedefler.push({ id: adim.id, sira });
  });

  if (!hedefler.length) return { atamalar: [], atlanan: 0 };

  // İşin başlangıcı ve termini de birer çapa; listenin iki ucunda duruyorlar.
  const tumCapalar: Capa[] = [
    ...(sinirlar.baslangic ? [{ sira: -1, tarih: sinirlar.baslangic, sanalTermin: false }] : []),
    ...capalar,
    ...(sinirlar.termin ? [{ sira: sirali.length, tarih: sinirlar.termin, sanalTermin: true }] : []),
  ];

  const atamalar: { id: string; tarih: string }[] = [];

  /*
    Ardışık çapa çiftleri arasındaki hedefler eşit bölünüyor.

    BÖLEN neden iki türlü: aralığın sonu işin TERMİNİ ise son aşama tam
    terminde bitmeli — iş, son aşaması bittiğinde teslim edilir. Sonu
    gerçek bir aşama tarihiyse o tarih zaten dolu, hedefler aralığın
    içine serpiştiriliyor.

    Ters çapa (sonraki tarih öncekinden erken) dağıtılmıyor: elle girilmiş
    iki tarih çelişiyorsa aradaki aşamaya tarih uydurmak yanlışı büyütür.
  */
  for (let i = 0; i < tumCapalar.length - 1; i += 1) {
    const bas = tumCapalar[i];
    const son = tumCapalar[i + 1];
    const arada = hedefler.filter((hedef) => hedef.sira > bas.sira && hedef.sira < son.sira);
    if (!arada.length) continue;
    const gun = gunFarki(bas.tarih, son.tarih);
    if (gun < 0) continue;
    const bolen = son.sanalTermin ? arada.length : arada.length + 1;
    arada.forEach((hedef, sira) => {
      atamalar.push({ id: hedef.id, tarih: gunEkle(bas.tarih, Math.round((gun * (sira + 1)) / bolen)) });
    });
  }

  /*
    Atlananlar dağıtılanların farkı: iki ucundan biri olmayan (işin
    başlangıcı ya da termini girilmemiş) ve iki çapası çelişen hedefler.
    Ayrı ayrı sayılmıyor — ekran için tek soru var: "kaç aşama tarihsiz
    kaldı".
  */
  return { atamalar, atlanan: hedefler.length - atamalar.length };
}
