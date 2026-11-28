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
  /*
    Açılışta odak ilk form kontrolüne (fareli/dokunmatik olmayan cihazda).
    Telefonda kapalı: alana odak sanal klavyeyi hemen açıyor ve formun
    başlığını örtüyordu; orada odak kapsayıcıda kalır.
  */
  ilkKontrol = false,
) {
  /* Dizi her çizimde yeniden kuruluyor; etkinin bağımlılığı dizinin
     KİMLİĞİ olsaydı her çizimde yeniden koşar ve inert bir kare
     boyunca kalkardı. */
  const yonetilenler = kendiniYonetenler.join(",");

  useEffect(() => {
    if (!acik) return;
    const aktif = document.activeElement;
    const geriOdak = aktif instanceof HTMLElement && !aktif.closest(`.${kokSinifi}`) ? aktif : null;
    const kok = odakRef.current?.closest<HTMLElement>(`.${kokSinifi}`) ?? document.querySelector<HTMLElement>(`.panel-root > .${kokSinifi}`);
    const korunan = (el: Element) => (yonetilenler ? yonetilenler.split(",").some((sinif) => el.classList.contains(sinif)) : false);

    /*
      INERT BÜTÜN BELGEDE (10.11.2026, PR #316 · F-01). Eskiden yalnızca
      `.panel-root`'un doğrudan çocukları inert oluyordu; kabuğun DIŞINDA
      `body`ye eklenen her şey odaklanabilir kalıyordu. Vercel Preview'un
      araç çubuğu (vercel-live-feedback) tam böyle bir öğe: Yeni talep
      açıkken Tab, "Talebi kaydet"ten sonra ona, sonra sayfaya (BODY),
      sonra arka plandaki kapatma katmanına gidiyordu. Araç çubuğu yalnızca
      bir durak ekliyordu: yerel sınamada araç çubuğu YOKKEN de odak
      BODY'ye ve kapatma katmanına çıkıyordu (scripts/pencere-odak-tarayici.mjs).
      Şimdi katmanın kökünden `body`ye kadar her atanın kardeşleri inert:
      kabuk, dock, sayfa ve kabuğun dışındaki her şey.
    */
    const disaridakiler: HTMLElement[] = [];
    for (let yol: HTMLElement | null = kok; yol && yol !== document.body; yol = yol.parentElement) {
      const ata = yol.parentElement;
      if (!ata) break;
      for (const el of ata.children) {
        if (el === yol || !(el instanceof HTMLElement) || el.hasAttribute("inert") || korunan(el) || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        el.setAttribute("inert", "");
        disaridakiler.push(el);
      }
    }

    /*
      SINIRDA SARMA. Kabuğun kalanı inert olsa da tarayıcı son kontrolden
      sonra odağı sayfanın DIŞINA (adres çubuğu; Playwright'ta BODY)
      veriyor, oradan belgenin ilk odaklanabilir öğesine dönüyordu. Yalnızca
      sınırda (son → ilk, ilk → son) araya giriliyor; aradaki sıra tarayıcının.
      Kontroller her basışta yeniden sayılıyor: belirip kaybolan hata
      alanları ve beklerken devre dışı kalan düğme döngüyü bozmasın.
      Dinleyici katmanın KENDİ öğesinde: iç içe başka bir katmanın (ya da
      .panel-root'a çizilen takvimin) tuşları buraya hiç ulaşmaz, yani
      odağı yalnızca en üstteki katman yönetir.
    */
    const tabla = (olay: KeyboardEvent) => {
      if (olay.key !== "Tab" || olay.defaultPrevented || olay.altKey || olay.ctrlKey || olay.metaKey || !kok) return;
      const liste = odaklanabilirler(kok);
      if (!liste.length) return;
      const ilk = liste[0], son = liste[liste.length - 1];
      const simdiki = document.activeElement;
      const disarida = !(simdiki instanceof HTMLElement) || !liste.includes(simdiki);
      if (olay.shiftKey && (simdiki === ilk || disarida)) { olay.preventDefault(); son.focus(); }
      else if (!olay.shiftKey && (simdiki === son || disarida)) { olay.preventDefault(); ilk.focus(); }
    };
    kok?.addEventListener("keydown", tabla);
    /*
      ODAK KAYBI: odaktaki düğme beklerken devre dışı kalınca (GonderDugmesi)
      tarayıcı odağı BODY'ye bırakıyor; sonraki Tab artık katmandan gelmediği
      için sarma da çalışmıyordu ve odak bir kez sayfanın dışına çıkıyordu.
      Odak katmanın içinden gidip hiçbir yere varmadıysa (relatedTarget yok,
      bir tık sonra activeElement BODY) katmanın kapsayıcısına geri alınır.
      Pencere başka sekmeye geçince activeElement öğede kaldığı için bu dal
      çalışmaz.
    */
    let etkin = true;
    const kayip = (olay: FocusEvent) => {
      if (olay.relatedTarget) return;
      window.setTimeout(() => {
        if (etkin && (document.activeElement === document.body || document.activeElement === null)) odakRef.current?.focus({ preventScroll: true });
      }, 0);
    };
    kok?.addEventListener("focusout", kayip);

    const kare = window.requestAnimationFrame(() => {
      const alan = ilkKontrol && window.matchMedia("(pointer: fine)").matches && odakRef.current ? ilkFormKontrolu(odakRef.current) : null;
      (alan ?? odakRef.current)?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(kare);
      etkin = false;
      kok?.removeEventListener("keydown", tabla);
      kok?.removeEventListener("focusout", kayip);
      for (const el of disaridakiler) el.removeAttribute("inert");
      if (geriOdak && geriOdak.isConnected && geriOdak.offsetParent !== null) {
        geriOdak.focus({ preventScroll: true });
      }
    };
  }, [acik, odakRef, kokSinifi, yonetilenler, ilkKontrol]);
}

/* Katmanın Tab sırasındaki kontrolleri (DOM sırası): görünür, etkin, tabIndex ≥ 0, inert altında değil. */
function odaklanabilirler(kok: HTMLElement): HTMLElement[] {
  return [...kok.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,summary,[tabindex],[contenteditable='true']")].filter((el) =>
    el.tabIndex >= 0
    && !(el as HTMLButtonElement).disabled
    && !(el instanceof HTMLInputElement && el.type === "hidden")
    && !el.closest("[inert]")
    && el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== "hidden");
}

/* İlk doldurulabilir form kontrolü; yoksa null (katmanın kendisi odak alır). */
function ilkFormKontrolu(kapsayici: HTMLElement): HTMLElement | null {
  return odaklanabilirler(kapsayici).find((el) =>
    (el instanceof HTMLInputElement && !el.readOnly && !["checkbox", "radio", "button", "submit", "reset", "file"].includes(el.type))
    || el instanceof HTMLSelectElement
    || (el instanceof HTMLTextAreaElement && !el.readOnly)) ?? null;
}
