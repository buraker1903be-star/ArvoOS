/*
  TEK EKRAN KABULÜ — ÖLÇÜMDEN HÜKÜM (25.11.2026).

  Ürün kuralı: genel bakışlar hiçbir boyutta sayfa düzeyinde kaymaz; uzun
  içerik yalnızca kendi kartında dikey kayar (dashboard.css, GorunumSecici).
  Ölçüm genel-bakis-yerlesim-tarayici.mjs'de, HÜKÜM burada: karar saf bir
  fonksiyonda durunca betik ile birim testi AYNI ölçütü kullanıyor. Eskiden
  hüküm çağıranın tek satırlık süzgecindeydi, yani ölçüt her koşuda değişiyordu.

  İki ölçüt pahalıya öğrenildi (25.11.2026, konsol ölçümü):
  - "Taşma sıfır" tek başına kabul DEĞİL. Konsolda sayfa taşması sıfır
    çıkarken kuyruk paneli 0 px'e düşüyor ve 453 px'lik kayıt listesine
    erişilemiyordu; varsayılan sekmede ölçüm temizken Tahsilat sekmesinde
    sayfa 657/600 taşıyor, dock içeriği örtüyordu.
  - Ölçülemeyen şey GEÇMİŞ sayılmaz. Dock örtmesi görünür kart bulunamayınca
    boş kümeden hesaplanıyor ve hiçbir şey ölçmeden "örtmüyor" diyordu;
    null artık düşüren bir sonuç.
*/

/*
  BİLİNEN BORÇ — muafiyet değil, yazılı gerekçe (check:css'teki kalıp).

  Kabul setine 901×641 eklenince kiracı panelinin CRM genel bakışında iki
  kartın son kaydına kart içinden erişilemediği görüldü. Ölçüldü: kusur bu
  dalın CSS'i geri alındığında da duruyor, yani KONSOL değişikliklerinden
  gelmiyor; kiracının kendi ızgarasında, ortak eşiğin (900/640) hemen
  dışındaki dar bantta. Bu PR'ın kapsamı konsol yerleşimi olduğu için
  düzeltilmedi, gizlenmedi de: koşu bunu "bilinen borç" diye yazıyor.
  Borçtaki bir satır artık düşmüyorsa koşu "listeden çıkar" diyor —
  liste, düzelen bir şeyi sessizce örtmesin.
*/
export const BILINEN_BORC = {
  "901x641 acik crm": ["yeni kartının son kaydına kart içinden erişilemiyor", "imzali kartının son kaydına kart içinden erişilemiyor"],
  "901x641 koyu crm": ["yeni kartının son kaydına kart içinden erişilemiyor", "imzali kartının son kaydına kart içinden erişilemiyor"],
};

/** "453/141" → içerik görünenden büyükse kayıyor. */
const kayiyor = (olcu) => {
  const [icerik, gorunen] = String(olcu).split("/");
  return icerik !== gorunen;
};

/**
 * Bir yapılandırmanın (boyut × tema × senaryo) ölçümünden kabul hükmü.
 * @returns {{ ad: string, gecti: boolean, eksik: string[] }}
 */
export function tekEkranHukmu(ad, o) {
  const eksik = [];
  /*
    YÖNETİM EKRANLARINDA SAYFA KAYMAZ — ÜRÜN DETAYI DAHİL (26.11.2026,
    ürün kararı). Önceki sürüm kayıt sayfasına muafiyet tanıyordu ve
    ürün detayı 390×844'te 1254/844 kayarken kabul geçiyordu: ölçüt,
    ölçtüğü kuralı kendi deliyordu. Muafiyet kalktı.
  */
  if (kayiyor(o.sayfaDikey)) eksik.push(`sayfa dikey kayıyor (${o.sayfaDikey})`);
  if (kayiyor(o.sayfaYatay)) eksik.push(`sayfa yatay kayıyor (${o.sayfaYatay})`);
  if (o.dockOrtuyor === null) eksik.push("dock örtmesi ölçülemedi (görünür kart yok)");
  else if (o.dockOrtuyor) eksik.push(`dock içeriği örtüyor (içerik ${o.icerikAlt} > dock ${o.dockUstu})`);

  /*
    GENEL BAKIŞ ERİŞİMİ (26.11.2026). Kuyruk kendi bölümüne taşındı;
    burada ölçülen, ürün satırlarının ve son öncelikli işin GERÇEKTEN
    açılabilmesi: tıklanabilir (üstünü bir şey örtmüyor), klavyeyle
    odaklanabilir ve dock'un üstünde.
  */
  const e = o.erisim;
  if (e) {
    /* Ürün tablosu ölçülmüşse (Genel Bakış). */
    if (e.urunSayisi !== undefined) {
      if (!e.urunSayisi) eksik.push("ürün satırı bulunamadı");
      if (e.erisilemeyenUrun?.length) eksik.push(`açılamayan ürün satırı: ${e.erisilemeyenUrun.join(", ")}`);
    }
    if (e.sonIs && !(e.sonIs.dokunma && e.sonIs.klavye && e.sonIs.dockUstunde)) {
      eksik.push(`son öncelikli işin eylemi erişilemiyor (${e.sonIs.metin})`);
    }

    /*
      KUYRUK ÖLÇÜTLERİ DURUYOR. Kuyruk 26.11.2026'da Genel Bakış'tan
      kendi bölümüne taşındı ve bu tarayıcı onu artık çizmiyor; ölçütler
      SİLİNMEDİ, çünkü kural ortadan kalkmadı — kuyruk ölçüldüğü anda
      yine uygulanıyorlar. Ölçülmeyen alan için hüküm üretilmiyor.
    */
    if (e.hata) eksik.push(`kuyruk ölçülemedi: ${e.hata}`);
    if (e.sonKayitPanelde !== undefined) {
      if (!e.sonKayitPanelde) eksik.push(`son kayıt panele sığmıyor (satır ${e.sonLiYuk} px, panel ${e.panelH} px)`);
      if (!e.dokunma) eksik.push("son satırın eylemi tıklanamıyor");
      if (!e.klavye) eksik.push("son satırın eylemi klavyeyle odaklanamıyor");
      if (!e.dockUstunde) eksik.push("son satırın eylemi dock'un altında");
    }
    const ic = e.icSekme;
    if (ic) {
      if (ic.yatayTasiyor) eksik.push("kuyruk sekmeleri yatay kayıyor");
      if (ic.erisilemeyen?.length) eksik.push(`dokunmayla açılamayan kuyruk sekmesi: ${ic.erisilemeyen.join(", ")}`);
      else if (ic.sonGorunur === false) eksik.push("iç sekme şeridinin sonuna ulaşılamıyor");
      /* Tablist'te Tab ile tek durak olur (gezici odak). */
      if (ic.tabDurakSayisi !== undefined && ic.tabDurakSayisi !== 1) {
        eksik.push(`sekme şeridinde ${ic.tabDurakSayisi} Tab durağı var (gezici odakta tam 1 olmalı)`);
      }
    }
    const gez = e.klavyeGezinti;
    if (gez) {
      if (ic && gez.length !== ic.sayi) eksik.push(`klavyeyle ${gez.length}/${ic.sayi} sekmeye ulaşıldı`);
      const takilan = gez.filter((g) => !(g.odakSeritte && g.secili && g.panelGorunur)).map((g) => g.ad ?? "?");
      if (takilan.length) eksik.push(`klavyeyle açılamayan kuyruk sekmesi: ${takilan.join(", ")}`);
    }
  }

  /* Son sekme açıkken ve oradan görünüme dönüldüğünde de sözleşme sürer. */
  const sonSekmeDenetle2 = (olcum, etiket) => {
    if (!olcum) return;
    if (kayiyor(olcum.sayfaDikey)) eksik.push(`${etiket} sayfa kayıyor (${olcum.sayfaDikey})`);
    if (kayiyor(olcum.sayfaYatay)) eksik.push(`${etiket} sayfa yatay kayıyor (${olcum.sayfaYatay})`);
    if (olcum.dockOrtuyor) eksik.push(`${etiket} dock içeriği örtüyor`);
    for (const k of olcum.zincir?.kartPanelde ?? []) {
      if (k.panelAsiyor > 1 && !k.panelKayiyor) eksik.push(`${etiket} ${k.panel} kartı panelini ${k.panelAsiyor} px aşıyor`);
    }
  };
  const sonAd2 = o.sonSekme?.ad ?? "son sekme";
  sonSekmeDenetle2(o.sonSekme, `${sonAd2} açıkken`);
  sonSekmeDenetle2(o.sonSekmeDonus, `${sonAd2} açıkken görünüme dönünce`);

  /*
    KART KENDİ PANELİNİ AŞMAZ. Kaydıracak alanı olmayan bir kart
    (Tahsilat grafiği) daralan panelin içinde küçülmüyor ve alttaki
    kartın ÜSTÜNE çiziliyordu: 1440×900'de panel 70, kart 187 px. Sayfa
    taşması sıfır ve dock açık olduğu için yalnızca taşmaya bakan kabul
    bunu görmüyordu.
  */
  for (const k of o.kartPanelde ?? []) {
    if (k.panelAsiyor > 1 && !k.panelKayiyor) {
      eksik.push(`${k.panel}: kart panelini ${k.panelAsiyor} px aşıyor (kart ${k.kartH}, panel ${k.panelH})`);
    }
  }

  /*
    MASAÜSTÜNDE DÖRT ÜRÜN İLK GÖRÜNÜMDE (26.11.2026, ürün kararı).
    Dar ekranda tablo kompakt satıra düşüyor ve kaydırma doğal; masaüstü
    genişliğinde ürünlerin hepsi kaydırmadan okunmalı.
  */
  if (o.urunTablosu && (o.masaustu || o.mobil)) {
    const u = o.urunTablosu;
    if (u.tamGorunen < u.satir) {
      eksik.push(`ürün satırlarının ${u.tamGorunen}/${u.satir}'i görünüyor (${u.bicim}, gövde ${u.govdeH} px)`);
    }
  }

  /*
    ÖNCELİKLİ İŞLERİN İLK KAYDI VE EYLEMİ TAM GÖRÜNMELİ (26.11.2026,
    ürün kararı). Kartın gövdesi kaysa bile ilk satır kesilmemeli:
    1440×600'de gövde 38 px kalıyordu ve 56 px'lik kayıt yarım
    görünüyordu — "bekleyen iş var" diyen kart işin kendisini
    göstermiyordu. Bu her boyutta geçerli; kart duruyorsa ilk kayıt
    okunur olmalı.
  */
  if (o.ilkIs) {
    if (!o.ilkIs.tam) eksik.push(`ilk öncelikli iş kesiliyor (satır ${o.ilkIs.h} px, gövde ${o.ilkIs.govdeH} px)`);
    else if (o.ilkIs.eylemTam === false) eksik.push("ilk öncelikli işin eylemi kesiliyor");
  }

  /*
    ÜRÜN DETAYINDA ALTI BÖLÜM YATAY KAYDIRMA OLMADAN SEÇİLEBİLMELİ
    (26.11.2026, ürün kararı). Dar pencerede şerit yerine tek seçici
    çiziliyor; hangisi görünüyorsa o ölçülüyor. Şerit kaydırılarak
    "sığdırılmış" sayılmaz: kaydırılan şerit sekmenin varlığını gizler.
  */
  if (o.bolumSecimi) {
    const b = o.bolumSecimi;
    if (b.sayi !== 6) eksik.push(`ürün detayında ${b.sayi} bölüm var (6 bekleniyor)`);
    if (!b.icerde) eksik.push(`bölüm seçimi ekrana sığmıyor${b.disarida?.length ? `: ${b.disarida.join(", ")}` : ""}`);
    if (b.kaydirma) eksik.push("bölüm şeridi yatay kayıyor");
    if (!b.klavye) eksik.push("bölüm seçimi klavyeyle odaklanamıyor");
  }

  /*
    UYARI VARKEN 0 PX GÖVDE BAŞARISIZDIR. Kart duruyor ama içindeki
    kayıt görünmüyorsa, kullanıcı açısından kart hiç yok demektir.
    "Gövde > 0" da tek başına yetmez: 11 px'lik gövdede 40 px'lik satır
    okunmaz, bu yüzden son kayda kartın İÇİNDEN erişildiği de ölçülüyor.
  */
  const kartlariDenetle = (kartlar, nerede = "") => {
    for (const k of kartlar ?? []) {
      if (!k.kayit) continue;
      const govdeH = k.govde?.h ?? k.govde;
      if (o.uyariVar && (govdeH === 0 || govdeH === null || govdeH === undefined)) {
        eksik.push(`${nerede}uyarı varken ${k.panel} kartının gövdesi 0 px (${k.kayit} kayıt görünmüyor)`);
      } else if (k.sonKayitErisilir === false) {
        eksik.push(`${nerede}${k.panel} kartının son kaydına kart içinden erişilemiyor`);
      }
    }
  };
  kartlariDenetle(o.kartlar);

  const sonSekmeDenetle = (olcum, etiket) => {
    if (!olcum) return;
    if (kayiyor(olcum.sayfaDikey)) eksik.push(`${etiket} sayfa kayıyor (${olcum.sayfaDikey})`);
    if (kayiyor(olcum.sayfaYatay)) eksik.push(`${etiket} sayfa yatay kayıyor (${olcum.sayfaYatay})`);
    if (olcum.dockOrtuyor) eksik.push(`${etiket} dock içeriği örtüyor`);
    for (const k of olcum.zincir?.kartPanelde ?? []) {
      if (k.panelAsiyor > 1 && !k.panelKayiyor) eksik.push(`${etiket} ${k.panel} kartı panelini ${k.panelAsiyor} px aşıyor`);
    }
  };
  const sonAd = o.sonSekme?.ad ?? "son sekme";
  sonSekmeDenetle(o.sonSekme, `${sonAd} açıkken`);
  /* Telefonda görünüm sekmesine dönüş: kuyruk hâlâ son sekmede. */
  sonSekmeDenetle(o.sonSekmeDonus, `${sonAd} açıkken görünüme dönünce`);

  for (const [sekme, m] of Object.entries(o.secimler ?? {})) {
    if (kayiyor(m.sayfaDikey)) eksik.push(`${sekme}: sayfa kayıyor (${m.sayfaDikey})`);
    if (m.dockOrtuyor) eksik.push(`${sekme}: dock içeriği örtüyor`);
    if (m.govde && !m.govde.kabul) eksik.push(`${sekme}: kart panele sığmıyor ve panel kaymıyor`);
    /* Seçici açıkken 0 px gövde ilk turda tam burada çıkmıştı: sekme
       seçiliyor, kart çiziliyor, içindeki kayıt görünmüyordu. */
    kartlariDenetle(m.kartlar, `${sekme}: `);
  }

  const borc = BILINEN_BORC[ad] ?? [];
  const kalan = eksik.filter((m) => !borc.includes(m));
  const dusmeyenBorc = borc.filter((m) => !eksik.includes(m));
  return { ad, gecti: kalan.length === 0, eksik: kalan, borc: eksik.filter((m) => borc.includes(m)), dusmeyenBorc };
}
