"use client";

import { useEffect, type RefObject } from "react";

/*
  AÇILIR KATMANDA KLAVYE TUZAĞI (15.10.2026).

  Panelde dört ayrı açılır katman var (bildirim çekmecesi, mesaj
  penceresi, PanelDrawer, PanelBottomSheet) ve dördü de aynı şekilde
  yazılmıştı: portal ile .panel-root'a basılıyor, role="dialog"
  aria-modal="true" taşıyor, Esc ile kapanıyor. Hiçbirinde odak tuzağı
  yoktu.

  ARIA ODAĞI TUTMAZ. aria-modal ekran okuyucuya "arkası kapalı" der;
  klavyeyi hapsetmez. Canlıda ölçüldü: bildirim çekmecesinde dokuz
  Tab'da, mesaj penceresinde üç Tab'da odak arkadaki sayfaya düşüyordu.
  Katman o sırada ekranı kaplıyor, yani kullanıcı görmediği kontrollerde
  geziniyor ve bastığında arkada bir şey oluyor.

  Üç parça birlikte gerekiyor; biri eksikse ötekiler yarım kalıyor:
   1. Açılışta odak katmana alınır (kapsayıcıya tabIndex -1 verilir ya
      da kapat düğmesi gösterilir).
   2. Açıkken kabuğun kalanı inert olur.
   3. Kapanışta odak geldiği yere döner.

  Kapatma yüzeyi (backdrop) katmanın KENDİ kökünün içinde olduğu için
  dışarı tıklayıp kapatma inert'ten etkilenmiyor.

  Yalnızca bu kancanın eklediği inert geri alınır: başka bir sebeple
  zaten inert olan bir öğeyi kapanışta açmak, sessizce yeni bir kapı
  açmak olurdu.
*/
export function useOdakTuzagi(
  acik: boolean,
  /** Açılışta odaklanacak öğe: katmanın kapsayıcısı ya da kapat düğmesi. */
  odakRef: RefObject<HTMLElement | null>,
  /** Katmanın .panel-root altındaki kök sınıfı (ör. "ntd-root"). */
  kokSinifi: string,
  /*
    KENDİ INERT'İNİ YÖNETEN ÖTEKİ KATMANLAR (2026-10-24).

    Bu kanca `.panel-root`'un doğrudan çocuklarından katmanın kendisi
    dışındakileri inert yapıyor. İÇ İÇE KATMANDA bu, bir sonraki
    pencereyi daha açılmadan öldürüyordu: rapor penceresi açılırken
    kokpitin kart pencereleri (`panel-drawer-root`) de portalla
    `.panel-root`'ta duruyor ve inert alıyordu; kullanıcı kartın
    "Aç" düğmesine bastığında pencere çiziliyor ama hiçbir şeye
    tıklanamıyordu — hata da vermiyordu.

    Burada sayılan sınıflara dokunulmuyor, çünkü onlar kapalıyken
    kendi içeriğini zaten inert tutuyor (PanelDrawer: `<aside
    inert={!open}>`). Yani klavye kapalı bir pencereye kaçamıyor,
    açılan pencere de ölü kalmıyor.
  */
  kendiniYonetenler: readonly string[] = [],
) {
  /* Dizi her çizimde yeniden kuruluyor; etkinin bağımlılığı dizinin
     KİMLİĞİ olsaydı her çizimde yeniden koşar ve inert bir kare
     boyunca kalkardı. */
  const yonetilenler = kendiniYonetenler.join(",");

  useEffect(() => {
    if (!acik) return;
    const aktif = document.activeElement;
    const geriOdak = aktif instanceof HTMLElement && !aktif.closest(`.${kokSinifi}`) ? aktif : null;

    const kabuk = document.querySelector(".panel-root");
    const disaridakiler = kabuk
      ? [...kabuk.children].filter(
          (el): el is HTMLElement =>
            el instanceof HTMLElement
            && !el.classList.contains(kokSinifi)
            && !(yonetilenler ? yonetilenler.split(",").some((sinif) => el.classList.contains(sinif)) : false)
            && !el.hasAttribute("inert"),
        )
      : [];
    for (const el of disaridakiler) el.setAttribute("inert", "");

    const kare = window.requestAnimationFrame(() => odakRef.current?.focus({ preventScroll: true }));

    return () => {
      window.cancelAnimationFrame(kare);
      for (const el of disaridakiler) el.removeAttribute("inert");
      if (geriOdak && geriOdak.isConnected && geriOdak.offsetParent !== null) {
        geriOdak.focus({ preventScroll: true });
      }
    };
  }, [acik, odakRef, kokSinifi, yonetilenler]);
}
