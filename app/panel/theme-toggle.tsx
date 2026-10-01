"use client";

import { useSyncExternalStore } from "react";

const THEME_KEY = "arvoos.theme";

type Tema = "light" | "dark";

/*
  TEMA DÜĞMESİ.

  İLK ÇİZİM SUNUCUDAKİYLE AYNI OLMAK ZORUNDA. Önceki sürüm başlangıç
  durumunu `document.documentElement.getAttribute("data-theme")` ile
  okuyordu: sunucuda `document` yok, orası hep "light" veriyordu;
  istemcide ise gerçek değer okunuyordu. Kayıtlı tema koyuysa ikisi
  uyuşmuyor ve React kökü baştan çiziyor — React'in `<html>` ağacında
  `data-theme` diye bir nitelik olmadığı için, kök yerleşimdeki betiğin
  eklediği nitelik bu sırada SİLİNİYORDU.

  Görünen hata şuydu: panelde koyu tema seçiliyor, sayfa yenilenince
  aydınlığa dönüyor. localStorage'da değer duruyordu, betik de doğru
  çalışıyordu; nitelik hidrasyondan sonra kayboluyordu. 01.10.2026'da
  yerel üretim derlemesinde iki denekle ölçüldü: aynı depo ve aynı
  sistem temasıyla, düğmesi OLMAYAN sayfada nitelik "dark" kalıyor,
  düğmesi OLAN sayfada null oluyordu. Tek fark bu bileşendi.

  Bu yüzden başlangıç değeri artık DOM'dan okunmuyor; sunucunun
  çizdiğiyle aynı sabit değerle başlıyor ve gerçek tema bağlandıktan
  sonra `useEffect` ile alınıyor. Simge bir kare geç düzeliyor, buna
  karşılık tema seçimi yerinde kalıyor.
*/
/** Tek doğruluk kaynağı DOM: temayı kök betik ve düğme aynı niteliğe yazıyor. */
const temaOku = (): Tema =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

/* Sunucuda tema bilinmiyor; istemcinin ilk çizimi de bununla aynı olsun diye
   sabit. Gerçek değer hidrasyondan SONRA okunuyor. */
const sunucuTemasi = (): Tema => "light";

function temayaAbone(bildir: () => void) {
  const gozcu = new MutationObserver(bildir);
  gozcu.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => gozcu.disconnect();
}

export function ThemeToggle() {
  /*
    useState yerine useSyncExternalStore: sunucu ile istemcinin FARKLI
    değer vermesi burada beklenen bir durum ve React bunu uyuşmazlık
    saymadan, yalnızca bu bileşeni yeniden çizerek karşılıyor.
  */
  const theme = useSyncExternalStore(temayaAbone, temaOku, sunucuTemasi);

  function toggle() {
    const next: Tema = theme === "dark" ? "light" : "dark";
    /* Durum ayrıca tutulmuyor: niteliği yazmak gözcüyü tetikliyor ve
       bileşen zaten yeniden çiziliyor. İki kaynak olsaydı biri
       ötekinden sapabilirdi. */
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Gizli sekmede yazılamayabilir; seçim o oturum için yine geçerli. */
    }
  }

  return (
    <button
      type="button"
      className="panel-icon-button panel-theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Aydınlık moda geç" : "Karanlık moda geç"}
      title={theme === "dark" ? "Aydınlık mod" : "Karanlık mod"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
