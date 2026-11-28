"use client";

import { useEffect } from "react";

/*
  LİSTENİN KAYDIRMA KONUMU (27.11.2026 ara kontrolü).

  Kaydırma listenin GÖVDESİNDE (`.kl-liste-govde`), sayfada değil:
  tarayıcının kendi konum geri yüklemesi ve Next'in yönlendirici
  davranışı iç kaydırıcıyı görmüyor. Kullanıcı listeyi aşağı kaydırıp
  bir kayıt açtığında ve geri döndüğünde liste başa sarıyordu — uzun
  listede aradığı satırı yeniden bulmak zorunda kalıyordu.

  Konum `sessionStorage`da ANAHTARLA saklanıyor (lib/konsol/liste-secimi
  → kaydirmaAnahtari). Anahtar seçimi ve "Filtreler" kutusunun
  açıklığını DIŞARIDA bırakır: kayıt açıp kapatmak aynı listedir.
  Süzgeç ya da sıralama değişince anahtar değişir ve liste baştan
  başlar; önceki süzgecin konumunu yeni sonuçlara taşımak kullanıcıyı
  alakasız bir satırın ortasına bırakıyor.

  sessionStorage SEKMEYE ÖZEL ve geri/ileri gezinmede duruyor; özel
  pencerede ya da depolama kapalıyken okuma/yazma fırlatabiliyor, bu
  yüzden ikisi de try/catch içinde ve hata hâlinde ekran normal
  çalışıyor (konum korunmuyor, o kadar).
*/
const ON_EK = "konsol-liste-kaydirma:";

export function KonsolListeKaydirma({ anahtar, adres }: {
  /** Konumun saklandığı anahtar: yalnızca süzgeçler (kaydirmaAnahtari). */
  anahtar: string;
  /*
    TAM ADRES — seçim dahil. Geri yükleme her GEZİNMEDE çalışmalı:
    kayıt açılınca sunucu listeyi yeniden çiziyor, `.kl-liste-govde`
    yeni bir DOM düğümü oluyor ve konum sıfırlanıyor. Yalnızca
    `anahtar`a bakan bir etki o sırada ÇALIŞMIYORDU (anahtar seçimi
    dışarıda bırakıyor, yani değişmiyor) ve konum korunmuyordu.
  */
  adres: string;
}) {
  useEffect(() => {
    const govde = document.querySelector<HTMLElement>(".kl-liste-govde");
    if (!govde) return;
    const yer = ON_EK + anahtar;

    let hedef = 0;
    try {
      hedef = Number(sessionStorage.getItem(yer) ?? "0") || 0;
    } catch {
      /* depolama kapalı: konum korunmuyor, ekran çalışıyor */
    }

    /*
      YAZMA YALNIZCA KULLANICI KAYDIRDIKTAN SONRA.

      Gezinmeden sonra liste gövdesi 0'dan başlıyor ve içerik
      yerleşene kadar `scrollTop = hedef` KIRPILIYOR; bu sırada çıkan
      kaydırma olayları saklanan konumun üzerine 0 yazıyordu (Destek
      ve Ödeme onayları'nda ölçüldü: 220 → 0, Müşteriler'de aynı kod
      çalışıyordu çünkü listesi daha hızlı yerleşiyor). Zamana bağlı
      bir "yerleşme penceresi" denendi ve yavaş derlemede yetmedi.

      Doğru ölçüt süre değil NİYET: kullanıcı tekerleği çevirdi,
      parmağını sürdü, tuşa bastı ya da listeye tıkladıysa kaydırma
      onundur ve yazılır. Hedefe ulaşıldığında da yazma açılıyor:
      geri yükleme bitmiştir, sonrası kullanıcının.
    */
    let yazilabilir = hedef === 0;
    let sonJest = 0;
    const kullaniciDokundu = () => {
      yazilabilir = true;
      sonJest = Date.now();
      govde.dataset.kaydirma = "hazir";
    };
    /*
      Yalnızca KAYDIRMA niyeti: tekerlek, parmak, tuş. `pointerdown`
      bilerek YOK — satıra tıklamak bir gezinme; onu niyet saymak,
      gezinme sırasında React'in listeyi 0'a döndürmesiyle çıkan
      kaydırma olayını "kullanıcı kaydırdı" diye kaydediyordu
      (ölçüldü: tıklamadan ~100 ms sonra 220 → 0 yazılıyor).
    */
    for (const olay of ["wheel", "touchmove", "keydown"] as const) {
      govde.addEventListener(olay, kullaniciDokundu, { passive: true });
    }

    /*
      GERİ YÜKLEME YERLEŞENE KADAR DENENİYOR (en çok ~1 sn). Tek
      karede uygulandığında liste tam yüksekliğine ulaşmamış oluyor
      ve tarayıcı değeri kırpıyordu: 768 px'te 220 istenip 78'de
      kalıyordu.
    */
    let kare = 0;
    let istek = 0;
    const uygula = () => {
      istek = 0;
      if (hedef <= 0) return;
      govde.scrollTop = hedef;
      if (govde.scrollTop >= hedef) { kullaniciDokundu(); return; }
      if (kare < 60) { kare += 1; istek = requestAnimationFrame(uygula); }
      else kullaniciDokundu(); /* ulaşılamadı: liste gerçekten kısalmış */
    };
    if (hedef > 0) uygula();
    else govde.dataset.kaydirma = "hazir";

    let zamanlayici: ReturnType<typeof setTimeout> | null = null;
    const yaz = () => {
      zamanlayici = null;
      /*
        Kopmuş düğüme yazılmaz: kopmuş bir düğümün scrollTop'u her
        zaman 0 ve saklanan konumu sıfırlardı.
      */
      if (!govde.isConnected || !yazilabilir) return;
      const deger = Math.round(govde.scrollTop);
      /*
        SIFIRI YALNIZCA TAZE BİR JESTLE YAZ. Gezinme başlayınca React
        listeyi yeniden çiziyor, konum 0'a dönüyor ve bu da bir
        kaydırma olayı üretiyor; gecikmeli yazma bazen bileşenin
        temizliğinden ÖNCE yetişip saklanan konumu sıfırlıyordu
        (Destek ve Ödeme onayları'nda ölçüldü, Müşteriler'de
        yetişemediği için aynı kod çalışıyor görünüyordu). Kullanıcı
        gerçekten başa döndüyse jest 400 ms içindedir.
      */
      if (deger === 0 && Date.now() - sonJest > 400) return;
      try {
        sessionStorage.setItem(yer, String(deger));
      } catch {
        /* yoksay */
      }
    };
    /* Her kaydırma olayında yazmak sekmeyi yoruyor; son konum yeter. */
    const dinle = () => {
      if (!yazilabilir || zamanlayici) return;
      zamanlayici = setTimeout(yaz, 150);
    };
    govde.addEventListener("scroll", dinle, { passive: true });

    return () => {
      if (istek) cancelAnimationFrame(istek);
      govde.removeEventListener("scroll", dinle);
      for (const olay of ["wheel", "touchmove", "keydown"] as const) {
        govde.removeEventListener(olay, kullaniciDokundu);
      }
      if (zamanlayici) clearTimeout(zamanlayici);
      delete govde.dataset.kaydirma;
      /*
        TEMİZLİKTE YAZILMIYOR: temizlik gezinme sırasında, DOM
        güncellendikten sonra çalışıyor ve konum çoktan 0'a dönmüş
        oluyor. Kaydırma sırasındaki gecikmeli yazma konumu zaten
        saklıyor.
      */
    };
  }, [anahtar, adres]);
  return null;
}
