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
  /*
    DAR EKRANDA KAYDIRMA ANA İÇERİKTE (26.11.2026, ürün kararı).
    1200 px altında kartlar içerik boyunda ve .panel-content kayıyor;
    sayfanın kendisi yine kaymıyor. İki şey aranıyor: içerik SONUNA
    kaydırıldığında son kart alt çubuğun altında kalmamalı ve
    kaydırılacak bir şey kalmamalı (kırpılmış içerik yok).
  */
  if (o.sonaKaydir) {
    if (o.sonaKaydir.ortuyor) {
      eksik.push(`sona kaydırıldığında son içerik alt çubuğun altında (içerik ${o.sonaKaydir.sonIcerikAlt}, çubuk ${o.sonaKaydir.dockUstu})`);
    }
    if (o.sonaKaydir.kalanKaydirma > 1) {
      eksik.push(`içerik sonuna kaydırılamıyor (${o.sonaKaydir.kalanKaydirma} px kırpık kalıyor)`);
    }
  }
  if (kayiyor(o.sayfaYatay)) eksik.push(`sayfa yatay kayıyor (${o.sayfaYatay})`);
  /* İçerik kayabiliyorsa "ilk görünümde içerik dock'un altında mı"
     sorusu anlamsız: içerik zaten görünür alanın dışına taşıyor ve
     ölçü yukarıda, sona kaydırılmış hâlde alınıyor. */
  if (!o.sonaKaydir?.kayiyor) {
    /*
      ANA SAYFA DIŞINDAKİ ROTADA ölçülmez: YOL=<rota> ile açılan
      gezinme provasında Ana Sayfa kartları yok, "görünür kart yok"
      demek orada bir kusur değil — ölçülen şey menü (26.11.2026).
    */
    if (o.dockOrtuyor === null && o.anaSayfa !== false) eksik.push("dock örtmesi ölçülemedi (görünür kart yok)");
    else if (o.dockOrtuyor) eksik.push(`dock içeriği örtüyor (içerik ${o.icerikAlt} > dock ${o.dockUstu})`);
  }

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
      if (!e.urunSayisi && o.anaSayfa !== false) eksik.push("ürün satırı bulunamadı");
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
    SOL MENÜ İÇERİĞİN ÜSTÜNE BİNMEZ (26.11.2026, onaylı mockup).
    Menü sabit konumlu; içerik onun sağında başlamazsa ilk sütun
    okunmaz olur. Dar modda ad gizlenebilir ama erişilebilir ad ve
    araç ipucu kalmalı, her girdi klavyeyle odaklanabilmeli.
  */
  if (o.yanMenu) {
    const m = o.yanMenu;
    if (m.ortuyor) eksik.push(`sol menü içeriğin üstüne biniyor (menü ${m.sag}px, içerik ${m.icerikSol}px)`);
    if (!m.oge) eksik.push("sol menüde girdi yok");
    if (m.adsiz) eksik.push(`${m.adsiz} menü girdisinin erişilebilir adı yok`);
    if (m.ipucusuz) eksik.push(`${m.ipucusuz} menü girdisinin araç ipucu yok`);
    if (m.odaklanamayan) eksik.push(`${m.odaklanamayan} menü girdisi klavyeyle odaklanamıyor`);
    /*
      AYNI ANDA İKİ GİRDİ SEÇİLİ GÖRÜNMEZ (26.11.2026, inceleme
      bulgusu). "Uygulamalar" rotaya göre vurgulanıyordu; ürün
      detayında hem "Ürünler" hem "Uygulamalar" seçili görünüyor ve
      kullanıcı hangi sayfada olduğunu menüden okuyamıyordu. Pencere
      kapalıyken en çok BİR girdi seçili olacak.
    */
    /*
      MARKA ÇİZİLİYOR MU (26.11.2026, inceleme bulgusu). Dar menüde
      logo yerine kırık görsel simgesi vardı: dosya yüklenmiş olmalı ve
      çizilen oran kaynağınkinden sapmamalı (kutuya sıkıştırılmış logo).

      Marka 26.11.2026'da sol menüden ÜST ÇUBUĞA taşındı (onaylı
      mockup): aynı üç denetim orada koşuyor. Ölçüm sol menüye bakmayı
      sürdürseydi her ekran "marka çizilmiyor" derdi ve kırık logoyu
      yakalayan denetim susturulmuş olurdu.
    */
    if (m.marka) {
      if (!m.marka.yuklendi) eksik.push(`üst çubuktaki marka dosyası yüklenmedi (${m.marka.dosya})`);
      /* %2: yuvarlamadan gelen sapma (~%1,4) geçer, kutuya sıkıştırılmış
         bir logo (2:1 → 1:1, %100) geçmez. */
      if (m.marka.oranSapmasi > 0.02) eksik.push(`marka oranı bozuk (${m.marka.dosya}, sapma %${(m.marka.oranSapmasi * 100).toFixed(1)})`);
      if (m.marka.genislik < 20) eksik.push(`marka ${m.marka.genislik} px çiziliyor (okunmaz)`);
    } else if (m.oge) {
      eksik.push("üst çubukta marka çizilmiyor");
    }
    if (m.pencereAcik === false && m.secili && m.secili.length > 1) {
      eksik.push(`sol menüde ${m.secili.length} girdi birden seçili (${m.secili.join(", ")})`);
    }
    /*
      MENÜ DURUMU ROTAYI İZLİYOR (27.11.2026, inceleme bulgusu).
      Düzenek doğrudan girilen ürün rotasında bile "Ana Sayfa"yı
      seçili çiziyordu: şim adresi import anında donduruyordu. Ölçüm
      ekranın yanlış menü durumunu gösterdiğinde kanıt kanıt değildir;
      bu ölçüt niyet ile çözülen rotayı karşılaştırıyor.
    */
    if (m.rota?.niyet && m.rota.cozulen && m.rota.niyet.split("?")[0] !== m.rota.cozulen) {
      eksik.push(`menü rotayı izlemiyor (niyet ${m.rota.niyet}, çözülen ${m.rota.cozulen})`);
    }

    /*
      İKİNCİ KAT (26.11.2026, onaylı mockup): modüle girince ana
      listenin yerini bölümler alıyor. Dört koşul birlikte aranıyor,
      çünkü üçü tek başına yanıltıcı:
        - Geri dönüş DÜĞME olmalı; bağlantı olsaydı tıklamak adresi
          değiştirir, açık sayfayı ve süzgeçleri kaybettirirdi.
        - Bölümler BAĞLANTI olmalı: adres paylaşılabilsin, geri/ileri
          çalışsın.
        - Tam BİR bölüm seçili olmalı.
        - Ana liste ile bölümler aynı anda durmamalı (panel taşar) ve
          yatay bölüm şeridi aynı bağlantıları İKİNCİ kez
          göstermemeli — aynı sayfa iki yerde "seçili" görünür.
    */
    if (m.altKat) {
      const k = m.altKat;
      if (!k.geriDugme) eksik.push("alt menüde 'Ana menüye dön' düğme değil (adres değişir)");
      if (!k.baglantili) eksik.push("alt menüdeki bölümler bağlantı değil (adres paylaşılamaz)");
      if (k.secili?.length !== 1) eksik.push(`alt menüde ${k.secili?.length ?? 0} bölüm seçili (tam biri olmalı)`);
      if (!k.anaListeGizli) eksik.push("ana liste ile alt menü aynı anda çiziliyor");
      if (m.seritGorunur) eksik.push("bölüm şeridi alt menüyle birlikte çiziliyor (aynı bağlantı iki yerde)");
    }
  }

  /*
    KAPLAMALAR (26.11.2026). Üç soru, üçü de klavye kullanıcısı için:
    açılınca odak İÇERİ girdi mi, Esc kapattı mı, odak açılmadan
    önceki yere DÖNDÜ mü. Üçüncüsü en çok unutulanı: kapanan bir
    pencereden sonra odak <body>'de kalırsa kullanıcı sayfanın başına
    düşer ve menüyü baştan gezer.
  */
  if (o.kaplamalar) {
    for (const [ad, k] of Object.entries(o.kaplamalar)) {
      if (!k.acik) eksik.push(`${ad} açılmıyor`);
      if (!k.odakIcinde) eksik.push(`${ad} açılınca odak içeri girmiyor (${k.acikkenOdak || "yok"})`);
      if (!k.kapandi) eksik.push(`${ad} Esc ile kapanmıyor`);
      if (k.kapandi && k.odakDondu !== k.beklenenOdak) eksik.push(`${ad} kapanınca odak dönmüyor (${k.beklenenOdak || "yok"} beklenirken ${k.odakDondu || "yok"})`);
    }
  }

  /*
    ÜST İKİ KART (26.11.2026, onaylı mockup). Yan yanayken 58/42, aynı
    üst hatta ve 16–18 px boşlukla; sağ kenarı alttaki ürün kartıyla
    hizalı. Hiza kabulü PR #330'da bir kez düştü: tek çocuklu bir
    ızgara kartı yarım genişlikte bırakmış, sağda 296 px boşluk
    kalmıştı ve hiçbir ölçüt bunu görmüyordu.
  */
  if (o.ustKartlar) {
    const u = o.ustKartlar;
    if (u.yanYana) {
      if (u.ustFarki > 1) eksik.push(`üst iki kartın üst kenarı ${u.ustFarki} px kaymış`);
      if (u.bosluk < 16 || u.bosluk > 18) eksik.push(`üst iki kartın arası ${u.bosluk} px (16–18 olmalı)`);
      if (u.oran < 55 || u.oran > 61) eksik.push(`üst ızgara oranı %${u.oran} (58 olmalı)`);
    }
    if (u.sagFarki !== null && u.sagFarki > 1) eksik.push(`üst kartların sağ kenarı ürün kartıyla hizalı değil (${u.sagFarki} px)`);
    if (u.solFarki !== null && u.solFarki > 1) eksik.push(`üst kartların sol kenarı ürün kartıyla hizalı değil (${u.solFarki} px)`);
  }

  /*
    İKİ KATLI GEZİNME TIKLAMAYLA (26.11.2026, onaylı mockup). Yukarıdaki
    altKat ölçütü "panel doğru çizilmiş mi" diye soruyor; buradaki
    kurucunun yaptığı YOLU sınıyor. En önemlisi ortadaki iki satır:
    "Ana menüye dön" ADRESİ DEĞİŞTİRMEMELİ (bağlantıya dönüştüğü gün
    açık sayfa, süzgeçler ve geçmiş sessizce kaybolur) ve tarayıcının
    geri tuşu bölüm değişikliğini geri almalı.
  */
  if (o.katGezinme) {
    const k = o.katGezinme;
    if (k.modulAcildi?.kat !== "alt") eksik.push("modüle girince alt menü açılmıyor");
    if (k.modulAcildi?.odak !== "Ana menüye dön") eksik.push(`modüle girince odak "Ana menüye dön"e taşınmıyor (${k.modulAcildi?.odak ?? "yok"})`);
    if (k.bolumSecildi && k.bolumSecildi.adres === k.modulAcildi?.adres) eksik.push("alt menüden bölüm seçmek adresi değiştirmiyor");
    if (k.anaMenuyeDonuldu?.kat !== "ana") eksik.push("'Ana menüye dön' ana listeyi getirmiyor");
    if (k.anaMenuyeDonuldu && k.anaMenuyeDonuldu.adres !== k.bolumSecildi?.adres) eksik.push(`ana menüye dönmek adresi değiştiriyor (${k.bolumSecildi?.adres} → ${k.anaMenuyeDonuldu.adres})`);
    /* Odak girilen modülün satırına dönmeli: tam o satır seçili olduğu
       için ikisi aynı metni taşır. */
    if (k.anaMenuyeDonuldu && k.anaMenuyeDonuldu.odak !== k.anaMenuyeDonuldu.secili?.[0]) {
      eksik.push(`ana menüye dönünce odak modül satırına dönmüyor (${k.anaMenuyeDonuldu.odak ?? "yok"})`);
    }
    if (k.tarayiciGeri && k.tarayiciGeri.adres !== k.modulAcildi?.adres) eksik.push(`tarayıcı geri tuşu bölüm değişikliğini geri almıyor (${k.tarayiciGeri.adres})`);
    /*
      MENÜ, ADRES VE İÇERİK AYNI AKIŞI GÖSTERMELİ (26.11.2026,
      inceleme bulgusu). Paylaşılan bir karede Finans alt menüsü
      açıkken sayfa başlığı hâlâ "Ana Sayfa" idi: düzenek rotadan
      bağımsız tek bir ekran çiziyordu ve kanıt aslında hiçbir şeyi
      kanıtlamıyordu.
    */
    for (const [ad, adim] of Object.entries(k)) {
      if (!adim || adim.baslik === undefined) continue;
      const anaSayfada = adim.adres === "/panel";
      if (anaSayfada && adim.baslik !== "Ana Sayfa") eksik.push(`${ad}: adres /panel ama içerik "${adim.baslik}"`);
      if (!anaSayfada && adim.baslik === "Ana Sayfa") eksik.push(`${ad}: adres ${adim.adres} ama içerikte hâlâ Ana Sayfa`);
    }
  }

  /*
    OTOMASYON SATIRLARI: AD + ETİKET + AÇIKLAMA BİRLİKTE (27.11.2026,
    inceleme talebi). Telefon kaydında "Veri senkronizasyonu" satırı
    bağlantı kopukluğunu anlatan bir açıklamayla birlikte "Yeniden
    deneniyor" gösteriyordu: etiket tek başına, açıklama tek başına
    yanlış değildi — ÇİFT yanlıştı.

    Ölçüt sözlüğü kuralın kendisinden (lib/konsol/otomasyonlar):
    hangi etiket hangi cümleyle gidebilir, burada sabit. Yeni bir
    durum eklenince bu listeye de satır eklenmeli; eklenmezse
    "bilinmeyen etiket" düşürür.
  */
  if (o.otomasyonSatirlari?.length) {
    /* Etiket → açıklamada GEÇMESİ gereken ipucu ve beklenen ton. */
    const SOZLUK = {
      "Tamamlandı": { ton: "success", ipucu: /başarılı/i },
      "Gönderildi": { ton: "success", ipucu: /başarılı/i },
      "Yeniden deneniyor": { ton: "warning", ipucu: /deneme hakkı sürüyor/i },
      "Bağlantı kesildi": { ton: "danger", ipucu: /ulaşılamıyor/i },
      "Bağlı değil": { ton: "neutral", ipucu: /anahtar/i },
      "Müdahale gerekiyor": { ton: "danger", ipucu: /düştü|gecikti|koşmadı/i },
      "Kayıt yok": { ton: "neutral", ipucu: /kayıt/i },
    };
    for (const satir of o.otomasyonSatirlari) {
      if (!satir.ad) { eksik.push("otomasyon satırının adı yok"); continue; }
      const kural = SOZLUK[satir.etiket];
      if (!kural) { eksik.push(`${satir.ad}: bilinmeyen durum etiketi (${satir.etiket ?? "yok"})`); continue; }
      if (satir.ton !== kural.ton) eksik.push(`${satir.ad}: "${satir.etiket}" tonu ${satir.ton} (${kural.ton} olmalı)`);
      if (!kural.ipucu.test(satir.aciklama ?? "")) {
        eksik.push(`${satir.ad}: "${satir.etiket}" etiketi açıklamasıyla uyuşmuyor ("${satir.aciklama ?? ""}")`);
      }
      if (satir.aciklamaKirpik) eksik.push(`${satir.ad}: açıklama kırpılıyor`);
    }
  }

  /*
    FİYATLAR SÜZGEÇLERİ BİRLİKTE (27.11.2026, inceleme talebi). İki
    süzgeç birbirini SİLMEMELİ: dönemi seçip durumu değiştiren
    kullanıcı dönemi kaybetmez. Plan bağlantısı da DOĞRU ürünün Fiyat
    basamakları bölümüne gitmeli — yanlış ürüne giden bir bağlantı
    ekranda doğru görünür, tıklanınca anlaşılır.
  */
  if (o.fiyatAkisi) {
    const f = o.fiyatAkisi;
    if (f.donemSuzuldu && f.donemSuzuldu.donemler?.length !== 1) {
      eksik.push(`dönem süzgeci tek döneme indirmiyor (${(f.donemSuzuldu.donemler ?? []).join(", ")})`);
    }
    const iki = f.ikisiBirlikte;
    if (iki) {
      if (iki.donemler?.length !== 1 || iki.durumlar?.length !== 1) {
        eksik.push(`iki süzgeç birlikte çalışmıyor (dönem ${(iki.donemler ?? []).join("/")}, durum ${(iki.durumlar ?? []).join("/")})`);
      }
      if (!/fatura=/.test(iki.adres) || !/durum=/.test(iki.adres)) {
        eksik.push(`süzgeçler adreste birlikte durmuyor (${iki.adres})`);
      }
      if (f.baslangic && iki.satir >= f.baslangic.satir) {
        eksik.push("süzgeç listeyi daraltmıyor");
      }
    }
    const b = f.planBaglantisi;
    if (b) {
      /* Ürün ADI ile adresteki KOD farklı olabilir (ArvoCal → randevu);
         eşleme kodun adreste olmasıyla değil, ürünün kendi sayfasına
         gidilmesiyle doğrulanıyor. */
      const kod = { ArvoOS: "arvoos", ArvoLab: "arvolab", ArvoARC: "arc", ArvoCal: "randevu" }[b.urun];
      if (kod && !(b.href ?? "").includes(`/panel/platform/urunler/${kod}?bolum=fiyat`)) {
        eksik.push(`plan bağlantısı yanlış ürüne gidiyor (${b.urun} → ${b.href})`);
      }
    }
  }

  /*
    ÜRÜN BAĞLAMI VE "ANA MENÜYE DÖN" (27.11.2026, inceleme talebi).
    Doğrudan girilen ürün rotasında sol menüde Ürünler bağlamı etkin
    olmalı; geri dönüş bir MENÜ işlemi, sayfayı değiştirmemeli —
    adres ve açık sayfa aynı kalır.
  */
  if (o.urunBaglami?.dogrudanGiris) {
    const g = o.urunBaglami.dogrudanGiris;
    if (g.kat !== "alt" || g.modul !== "Ürünler") {
      eksik.push(`doğrudan girişte Ürünler bağlamı etkin değil (kat ${g.kat}, modül ${g.modul ?? "yok"})`);
    }
    const d = o.urunBaglami.anaMenuyeDonuldu;
    if (!d) eksik.push("'Ana menüye dön' bulunamadı");
    else {
      if (d.kat !== "ana") eksik.push("'Ana menüye dön' ana listeyi getirmiyor");
      if (d.adres !== g.adres) eksik.push(`ana menüye dönmek adresi değiştiriyor (${g.adres} → ${d.adres})`);
      if (d.baslik !== g.baslik) eksik.push(`ana menüye dönmek açık sayfayı değiştiriyor (${g.baslik} → ${d.baslik})`);
      if (!(d.odak || "").startsWith("Ürünler")) eksik.push(`ana menüye dönünce odak Ürünler satırına dönmüyor (${d.odak || "yok"})`);
    }
  }

  /*
    RAY ÇEKMECESİ (26.11.2026, inceleme talebi). 64 px'lik rayda ikinci
    kat menüye sığmıyor (ad gizli, bölümlerin ikonu yok), o yüzden
    pencereye taşındı. Çekmece aynı sözleşmeyi taşımalı: başında
    "Ana menüye dön", başlıkta modül adı, bölümler METİN etiketiyle ve
    BAĞLANTI olarak. Aynı bağlantıları gösteren içerik üstü şerit
    aynı anda çizilmemeli; Esc kapatınca odak ray düğmesine dönmeli.
  */
  if (o.rayCekmece) {
    const c = o.rayCekmece;
    if (!c.acik) eksik.push("ray ikonu çekmeceyi açmıyor");
    else {
      if (c.geriMetin !== "Ana menüye dön") eksik.push(`çekmecede "Ana menüye dön" yok (${c.geriMetin ?? "yok"})`);
      if (!c.kapatVar) eksik.push("çekmecede Kapat yok (geri ve kapat ayrı denetim olmalı)");
      if (!c.baslik) eksik.push("çekmecede modül başlığı yok");
      if (!c.adlar?.length) eksik.push("çekmecede bölüm yok");
      if (!c.baglantili) eksik.push("çekmecedeki bölümler bağlantı değil (adres paylaşılamaz)");
      if (!c.odakIcinde) eksik.push(`çekmece açılınca odak içeri girmiyor (${c.odak || "yok"})`);
      if (c.seritGorunur) eksik.push("çekmece açıkken içerik üstü şerit de çiziliyor (aynı bağlantı iki yerde)");
      if (!c.kapandi) eksik.push("çekmece Esc ile kapanmıyor");
      if (c.kapandi && !(c.odakDondu || "").startsWith("Finans")) eksik.push(`çekmece kapanınca odak ray düğmesine dönmüyor (${c.odakDondu || "yok"})`);
    }
  }

  /*
    TELEFON PANELİ (26.11.2026, inceleme talebi). "Daha fazla" önce ana
    modülleri gösteriyor; bölümü olan modül açılınca AYNI panelin
    içeriği alt menüyle değişiyor. İki denetim AYRI çalışmalı:
    "Ana menüye dön" bir üst kata çıkar (panel açık kalır), "Kapat"
    paneli kapatır. Tek düğmeye indirmek, modül listesine dönmek
    isteyeni paneli kapatıp yeniden açmaya zorluyordu.
  */
  if (o.telefonPanel) {
    const t = o.telefonPanel;
    if (t.anaKat?.kat !== "ana") eksik.push("telefon paneli ana modül listesiyle açılmıyor");
    if (t.anaKat?.geriVar) eksik.push("ana katta 'Ana menüye dön' çiziliyor (çıkılacak kat yok)");
    if (t.altKat?.kat !== "alt") eksik.push("telefon panelinde modül açılınca içerik alt menüyle değişmiyor");
    if (!t.altKat?.geriVar || !t.altKat?.kapatVar) eksik.push("alt katta geri ve kapat birlikte yok");
    if (t.altKat?.odak !== "Ana menüye dön") eksik.push(`alt kata inince odak geri düğmesine gelmiyor (${t.altKat?.odak || "yok"})`);
    if (t.geriDonuldu?.kat !== "ana" || t.geriDonuldu?.acik !== true) eksik.push("'Ana menüye dön' paneli kapatıyor (bir üst kata çıkmalı)");
    if (t.geriDonuldu?.acik && !(t.geriDonuldu.odak || "").startsWith("Finans")) eksik.push(`üst kata çıkınca odak modül satırına dönmüyor (${t.geriDonuldu.odak || "yok"})`);
    if (t.kapatildi?.acik) eksik.push("'Kapat' paneli kapatmıyor");
  }

  /*
    ÜRÜN İÇİ BÖLÜM ADRESTE (26.11.2026, ürün kararı). Adresteki bölüm,
    seçili sekme ve GÖRÜNEN panel aynı şeyi söylemeli; sekmeler
    bağlantı olmalı ki adres paylaşılabilsin. Eskiden seçim bileşenin
    durumundaydı: paylaşılan bağlantı ve yenileme Genel Bakış'a
    düşüyordu.
  */
  if (o.urunBolumu) {
    const u = o.urunBolumu;
    if (!u.baglantili) eksik.push("ürün sekmeleri bağlantı değil (adres paylaşılamaz)");
    if (u.gorunen !== u.istenen) eksik.push(`adres "${u.istenen}" diyor, görünen panel "${u.gorunen}"`);
    if (u.seciliSekme.length !== 1) eksik.push(`ürün kartında ${u.seciliSekme.length} sekme seçili (tam 1 olmalı)`);
    if (!u.baslik) eksik.push("ürün başlığı yok");
    /*
      Panelin BAŞLIĞI değil, ALANLARI da okunmalı: 390 px'te abonelik
      tablosunun paket, dönem ve ücret hücreleri ekranın dışında
      kalıyordu ve yatay kaydırma olmadığı için hiçbir yoldan
      görünmüyordu (26.11.2026, inceleme bulgusu).
    */
    if (u.alanlar) {
      const a = u.alanlar;
      if (a.yatayKayiyor) eksik.push("panel yatay kayıyor");
      if (a.tasanOge) eksik.push(`${a.tasanOge} hücre ekranın dışında (${a.bicim})`);
      if (a.okunan < a.beklenen) eksik.push(`panelde ${a.okunan}/${a.beklenen} alan okunuyor (${a.metin})`);
    }
  }

  /*
    BAĞLAMLI GEZİNME (26.11.2026, ürün kararı). Ana menü modülü, şerit
    alt bölümü gösterir; sayfa vurgusu ikisinde de TEK olur. Dar ekranda
    şerit yerine seçici çizilir ve seçili bölümün ADI düğmede yazar —
    "Bölümler" yazan bir düğme nerede olunduğunu söylemiyor.
  */
  if (o.bolumSeridi) {
    const b = o.bolumSeridi;
    if (b.etkin.length !== 1) eksik.push(`bölüm şeridinde ${b.etkin.length} bölüm etkin (tam 1 olmalı)`);
    if (b.yatayKayiyor) eksik.push("bölüm şeridi yatay kayıyor");
    if (b.odaklanamayan) eksik.push(`${b.odaklanamayan} bölüm bağlantısı klavyeyle odaklanamıyor`);
    if (b.bicim === "secici" && b.etkin.length === 1 && b.dugmeMetni && !b.dugmeMetni.includes(b.etkin[0])) {
      eksik.push(`seçici düğmesi seçili bölümü yazmıyor (${b.dugmeMetni})`);
    }
  }

  /*
    ÜRÜN DETAYI KARTI İÇERİK GENİŞLİĞİNİ KULLANIR (26.11.2026,
    inceleme bulgusu). Izgara sınıfı iki sütun kuruyordu ve tek çocuk
    olan kart birinci sütunda kalıyordu: 768×600'de sağda 296 px
    boşluk, 1440×900'de kartın sağ kenarı başlıktaki dönem
    seçicisinden 350 px geride. Dar kart metrikleri de alt alta
    diziyordu. Ölçü: kart ızgarayı bitirir (boşluk ≤ 1 px), sağ kenarı
    seçiciyle aynı hatta (fark ≤ 2 px) ve 700 px'den geniş kartta
    metrikler yan yana.
  */
  if (o.kartHizasi) {
    const k = o.kartHizasi;
    if (k.bosluk > 1) eksik.push(`ürün kartı içerik genişliğini kullanmıyor (sağda ${k.bosluk} px boşluk)`);
    /* Hiza yalnızca eylem başlığın YANINDAYKEN anlamlı: telefonda
       dönem seçicisi başlığın altına geçiyor ve sağ kenarı kartın
       kenarıyla aynı hatta olmak zorunda değil. */
    if (k.tekSatir && Math.abs(k.seciciyeFark) > 2) eksik.push(`ürün kartının sağ kenarı dönem seçicisiyle hizalı değil (${k.seciciyeFark} px)`);
    if (k.kartG > 700 && k.metrikSutun === 1) eksik.push(`${k.kartG} px kartta metrikler tek sütunda`);
  }

  /*
    SON ÜRÜNE KART İÇİNDEN ULAŞILMALI (26.11.2026, ürün kararı).
    Dört satır sığmadığında kaydırma kartın içinde olacak ve kartı
    sonuna kaydırınca son ürün TAM görünecek; eylemi de tıklanabilir ve
    klavyeyle odaklanabilir olacak. "Satır DOM'da var" yetmez: kart
    kaymıyorsa son ürüne hiçbir yoldan ulaşılamaz.
  */
  if (o.sonUrun) {
    const u = o.sonUrun;
    if (!u.tam) eksik.push(`son ürüne kart içinden ulaşılamıyor (${u.metin})`);
    if (u.dokunma === false) eksik.push(`son ürünün eylemi tıklanamıyor (${u.metin})`);
    if (u.klavye === false) eksik.push(`son ürünün eylemi klavyeyle odaklanamıyor (${u.metin})`);
    /* Odak halkası satırın dışına taşıyor: kenara yapışmış son satırda
       klavye kullanıcısı nerede olduğunu göremiyor (26.11.2026). */
    if (u.halka === false) eksik.push(`son ürünün odak halkası kesiliyor (${u.metin})`);
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
