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
    /*
      GERİ YÜKLEME BİRKAÇ KARE DENENİYOR. Konum tek seferde
      uygulandığında liste gövdesi henüz tam yüksekliğine ulaşmamış
      oluyor ve tarayıcı değeri kırpıyor: 768 px'te 220 istenip 78'de
      kalıyordu. Üç kare boyunca tekrar deneniyor; tutturamazsa
      (liste gerçekten kısaldıysa) olduğu yerde bırakılıyor.
    */
    let kareler = 0;
    let istek = 0;
    const uygula = (hedef: number) => {
      govde.scrollTop = hedef;
      if (govde.scrollTop < hedef && kareler < 12) {
        kareler += 1;
        istek = requestAnimationFrame(() => uygula(hedef));
      }
    };
    try {
      const kayitli = Number(sessionStorage.getItem(yer) ?? "0");
      /* Yalnızca gerçekten kaydırılmışsa uygula: 0 yazmak, tarayıcının
         kendi konumunu da sıfırlardı. */
      if (kayitli > 0) uygula(kayitli);
    } catch {
      /* depolama kapalı: konum korunmuyor, ekran çalışıyor */
    }

    /*
      YERLEŞME PENCERESİ. Gezinmeden sonra yeni liste gövdesi 0'dan
      başlıyor ve tarayıcı bir kaydırma olayı üretiyor; geri yükleme
      ile o olay yarışınca saklanan konumun üzerine 0 yazılıyordu
      (Destek ve Ödeme onayları'nda ölçüldü: 220 → 0). İlk 400 ms
      yazma kapalı; kullanıcı o aralıkta kaydırsa bile sonraki olay
      konumu yazıyor.
    */
    let hazir = false;
    const hazirlik = setTimeout(() => { hazir = true; }, 400);

    let zamanlayici: ReturnType<typeof setTimeout> | null = null;
    const yaz = () => {
      zamanlayici = null;
      /*
        KOPMUŞ DÜĞÜME YAZMA. Gezinmede React eski `.kl-liste-govde`yi
        belgeden çıkarıyor ve kopmuş bir düğümün scrollTop'u HER ZAMAN
        0. Temizlikte buna bakılmadan yazıldığında saklanan konum
        sıfırlanıyordu: kayıt açmak çalışıyor ama tam karttan geri
        dönmek ve paneli kapatmak listeyi başa sarıyordu (27.11.2026
        akış ölçümü).
      */
      if (!govde.isConnected || !hazir) return;
      try {
        sessionStorage.setItem(yer, String(Math.round(govde.scrollTop)));
      } catch {
        /* yoksay */
      }
    };
    /* Her kaydırma olayında yazmak sekmeyi yoruyor; son konum yeter. */
    const dinle = () => {
      if (!hazir || zamanlayici) return;
      zamanlayici = setTimeout(yaz, 150);
    };
    govde.addEventListener("scroll", dinle, { passive: true });
    return () => {
      cancelAnimationFrame(istek);
      clearTimeout(hazirlik);
      govde.removeEventListener("scroll", dinle);
      if (zamanlayici) clearTimeout(zamanlayici);
      /*
        TEMİZLİKTE YAZILMIYOR. Temizlik gezinme sırasında, DOM
        GÜNCELLENDİKTEN SONRA çalışıyor: aynı düğüm yeniden
        kullanılmış ve konumu çoktan 0'a dönmüş oluyor, yani
        saklanan konumun üzerine 0 yazılıyordu (ölçüldü: yazma
        sırası "0" → sonra geri yükleme "kayitli=0"). Kaydırma
        sırasındaki gecikmeli yazma konumu zaten saklıyor; yalnızca
        son 150 ms içindeki bir kaydırma kaybolabilir.
      */
    };
  }, [anahtar, adres]);
  return null;
}
