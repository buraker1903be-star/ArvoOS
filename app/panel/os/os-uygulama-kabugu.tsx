"use client";

import { useEffect, useRef, useState } from "react";

/*
  UYGULAMA KABUĞU İSTEMCİSİ (13.10.2026). Panel telefonda uygulama gibi
  çalışsın: tarayıcıdan girilse de, ana ekrana eklense de.

  1. Arka plan bileşenini (public/sw.js) kaydeder. Yerel geliştirmede
     kaydetmez: geliştirme sunucusunun dosyaları sürümsüz, önbellek
     eski kodu gösterirdi.
  2. Yeni sürüm hazır olunca "Yenile" der. Kendiliğinden yenilemiyor:
     sahada form dolduran personelin yazdığı kaybolmasın.
  3. Telefonda tarayıcıdan girene bir kez "Ana ekrana ekle" önerir.
     Android'de tarayıcının kendi yükleme penceresi açılır; iPhone'da
     Safari bunu izin vermediği için yolu tarif eder. Kapatılırsa bir daha
     sorulmaz (yalnızca bu cihazda, localStorage).
*/

type YuklemeOlayi = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KAPATILDI = "arvo:ana-ekran-onerisi-kapatildi";

const yerelMi = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.hostname.endsWith(".localhost");
const uygulamaKipinde = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const telefonMu = () => window.matchMedia("(max-width: 760px)").matches;
const iosMu = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
const okuKapatildi = () => { try { return localStorage.getItem(KAPATILDI) === "1"; } catch { return false; } };
const yazKapatildi = () => { try { localStorage.setItem(KAPATILDI, "1"); } catch { /* gizli sekme: yalnızca bu oturum */ } };

export function OsUygulamaKabugu() {
  const [bekleyen, setBekleyen] = useState<ServiceWorker | null>(null);
  /*
    "YENİLE"YE BASILDI MI (15.10.2026)? Aşağıdaki controllerchange
    dinleyicisi koşulsuzdu ve sayfayı yeniliyordu. Oysa o olay yalnızca
    yeni sürüm devreye girince değil, arka plan bileşeni İLK KEZ sayfayı
    devraldığında da geliyor (sw.js'teki clients.claim). Yani bir cihazda
    panele ilk girişte — ya da tarayıcı site verisini temizledikten
    sonra — sayfa kendiliğinden bir kez yenileniyordu. Canlıda ölçüldü:
    kayıt silinip sayfaya GİDİLDİĞİNDE navigation.type "reload" çıkıyor.
    Tam da bu bileşenin kaçınmak istediği şey: o anda form dolduran
    personelin yazdığı gider.
  */
  const yenilemeIstendi = useRef(false);
  const [yukleme, setYukleme] = useState<YuklemeOlayi | null>(null);
  const [iosOnerisi, setIosOnerisi] = useState(false);
  const [gizli, setGizli] = useState(false);

  /*
    YAKINLAŞTIRMA KAPALI (layout.tsx'teki viewport'un iOS tarafı). iOS
    Safari "user-scalable=no"yu yok sayıyor; iki parmak hareketi
    gesture* olaylarıyla, çift dokunuş büyütmesi ise CSS'teki
    touch-action: manipulation ile (mobil-uygulama.css) kapanıyor.
    Tek parmakla kaydırmaya dokunulmuyor: yalnızca iki parmak engelleniyor.
  */
  useEffect(() => {
    const engelle = (olay: Event) => olay.preventDefault();
    const ikiParmak = (olay: TouchEvent) => { if (olay.touches.length > 1) olay.preventDefault(); };
    const secenek = { passive: false } as const;
    document.addEventListener("gesturestart", engelle, secenek);
    document.addEventListener("gesturechange", engelle, secenek);
    document.addEventListener("touchmove", ikiParmak, secenek);
    return () => {
      document.removeEventListener("gesturestart", engelle);
      document.removeEventListener("gesturechange", engelle);
      document.removeEventListener("touchmove", ikiParmak);
    };
  }, []);

  // 1–2: kayıt ve yeni sürüm
  useEffect(() => {
    if (!("serviceWorker" in navigator) || yerelMi()) return;
    let iptal = false;
    let zamanlayici = 0;
    navigator.serviceWorker.register("/sw.js").then((kayit) => {
      if (iptal) return;
      const izle = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // İlk kurulumda "yeni sürüm" demeyiz; yalnızca var olanın yerine gelen için.
          if (sw.state === "installed" && navigator.serviceWorker.controller) setBekleyen(sw);
        });
      };
      if (kayit.waiting && navigator.serviceWorker.controller) setBekleyen(kayit.waiting);
      kayit.addEventListener("updatefound", () => izle(kayit.installing));
      // Uygulama açık kaldıkça (saha telefonu günlerce kapanmıyor) arada yeni sürüme bak.
      zamanlayici = window.setInterval(() => kayit.update().catch(() => undefined), 30 * 60_000);
    }).catch(() => undefined);
    // Yeni sürüm devreye girince sayfa bir kez yenilenir — YALNIZCA kullanıcı
    // "Yenile"ye bastıysa (yukarıdaki not).
    let yenilendi = false;
    const devreyeGirdi = () => {
      if (!yenilemeIstendi.current || yenilendi) return;
      yenilendi = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", devreyeGirdi);
    return () => { iptal = true; window.clearInterval(zamanlayici); navigator.serviceWorker.removeEventListener("controllerchange", devreyeGirdi); };
  }, []);

  // 3: ana ekrana ekleme önerisi
  useEffect(() => {
    if (uygulamaKipinde() || okuKapatildi()) return;
    const yakala = (olay: Event) => {
      olay.preventDefault(); // tarayıcının kendi alt bandı yerine bizim düğmemiz
      if (telefonMu()) setYukleme(olay as YuklemeOlayi);
    };
    window.addEventListener("beforeinstallprompt", yakala);
    // iPhone/iPad Safari: yükleme olayı yok, tarif gösterilir.
    const ios = window.setTimeout(() => { if (iosMu() && telefonMu()) setIosOnerisi(true); }, 2500);
    return () => { window.removeEventListener("beforeinstallprompt", yakala); window.clearTimeout(ios); };
  }, []);

  const kapat = () => { yazKapatildi(); setGizli(true); };

  if (bekleyen) {
    return (
      <div className="os-kabuk-bant" role="status">
        <span><b>Yeni sürüm hazır.</b> Yenileyince güncel hâli açılır.</span>
        <button
          type="button"
          className="panel-primary"
          onClick={() => { yenilemeIstendi.current = true; bekleyen.postMessage("yeni-surumu-uygula"); }}
        >
          Yenile
        </button>
      </div>
    );
  }
  if (gizli || (!yukleme && !iosOnerisi)) return null;
  return (
    <div className="os-kabuk-bant" role="dialog" aria-label="Ana ekrana ekle">
      <span>
        <b>Uygulama olarak kullanın.</b>{" "}
        {yukleme ? "Ana ekrana ekleyin; tam ekran ve daha hızlı açılır." : <>Safari&apos;de <b>Paylaş</b> düğmesine, sonra <b>Ana Ekrana Ekle</b>&apos;ye dokunun.</>}
      </span>
      {yukleme ? (
        <button type="button" className="panel-primary" onClick={async () => {
          await yukleme.prompt();
          await yukleme.userChoice.catch(() => undefined);
          setYukleme(null);
          kapat();
        }}>Yükle</button>
      ) : null}
      <button type="button" className="os-kabuk-kapat" aria-label="Kapat" onClick={kapat}>×</button>
    </div>
  );
}
