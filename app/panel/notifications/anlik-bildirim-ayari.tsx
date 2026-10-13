"use client";

import { useEffect, useState, useTransition } from "react";
import { anlikBildirimAc, anlikBildirimDene, anlikBildirimDurumu, anlikBildirimKapat, anlikBildirimPosta } from "./anlik-actions";
import "./anlik-bildirim.css";

/*
  BU CİHAZDA ANLIK BİLDİRİM (13.10.2026, mobil 4. aşama).

  Durumlar tarayıcıdan okunuyor (sunucu bilemez: izin ve abonelik
  cihazda). iPhone'da web push YALNIZCA ana ekrana eklenmiş uygulamada
  çalışıyor (iOS 16.4+); Safari sekmesinde düğme yerine nasıl
  ekleneceği yazılıyor — yoksa "Aç"a basan kişi hiçbir şey olmadığını
  görürdü.

  İki görünüm: "kart" (Bildirimler sayfası, her ekranda) ve "serit"
  (telefonda ana ekran; yalnızca henüz açılmamışken ve kapatılmamışsa
  görünür).
*/
type Durum = "yukleniyor" | "desteksiz" | "ios-ekle" | "engelli" | "kapali" | "acik";

const SERIT_ANAHTARI = "arvo:anlik-bildirim-serit-kapatildi";

function base64UrlToUint8Array(metin: string) {
  const dolgu = "=".repeat((4 - (metin.length % 4)) % 4);
  const ham = atob((metin + dolgu).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(ham, (c) => c.charCodeAt(0));
}

function cihazAdi() {
  const ua = navigator.userAgent;
  const sistem = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Cihaz";
  const tarayici = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı";
  return `${sistem} · ${tarayici}`;
}

async function kayitBul(): Promise<ServiceWorkerRegistration | null> {
  // Kabuk (os-uygulama-kabugu.tsx) kaydediyor; yerelde kaydedilmiyor.
  const kayit = await navigator.serviceWorker.getRegistration();
  if (kayit) return kayit;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}

export function AnlikBildirimAyari({ genelAnahtar, gorunum = "kart" }: { genelAnahtar: string | null; gorunum?: "kart" | "serit" }) {
  const [durum, setDurum] = useState<Durum>("yukleniyor");
  const [mesaj, setMesaj] = useState<{ ton: "ok" | "hata"; metin: string } | null>(null);
  const [seritKapali, setSeritKapali] = useState(false);
  const [bekliyor, basla] = useTransition();
  // Gelen posta anahtarı (20261013081415): null = henüz okunmadı / yetki yok.
  const [posta, setPosta] = useState<boolean | null>(null);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try { if (localStorage.getItem(SERIT_ANAHTARI)) setSeritKapali(true); } catch { /* gizli pencere */ }
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const anaEkranda = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const destek = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let yeni: Durum;
      if (!destek) yeni = ios && !anaEkranda ? "ios-ekle" : "desteksiz";
      else if (Notification.permission === "denied") yeni = "engelli";
      else {
        const kayit = await kayitBul();
        if (!kayit) yeni = "desteksiz";
        else {
          const abonelik = await kayit.pushManager.getSubscription();
          yeni = abonelik && Notification.permission === "granted" ? "acik" : "kapali";
          /* Tarayıcı abone ama sunucuda kayıt yoksa (kayıt anında kurulum
             eksikti ya da servis cihazı düşürdü) kart "Açık" görünüp hiçbir
             şey gelmiyordu: kayıt sessizce yenilenir. Yalnızca kartta —
             şerit her ana ekran açılışında sunucuya gitmesin. */
          if (abonelik && yeni === "acik" && gorunum === "kart") {
            const d = await anlikBildirimDurumu(abonelik.endpoint);
            if (!d.kayitli && genelAnahtar) {
              const sonuc = await anlikBildirimAc(abonelik.toJSON(), cihazAdi());
              if (!sonuc.ok && !iptal) setMesaj({ ton: "hata", metin: sonuc.hata });
            }
            if (!iptal) setPosta(d.postaGorur ? d.posta : null);
          }
        }
      }
      if (!iptal) setDurum(yeni);
    })().catch(() => { if (!iptal) setDurum("desteksiz"); });
    return () => { iptal = true; };
  }, [genelAnahtar, gorunum]);

  const ac = () => basla(async () => {
    setMesaj(null);
    if (!genelAnahtar) { setMesaj({ ton: "hata", metin: "Anlık bildirim bu kurulumda henüz açılmadı." }); return; }
    try {
      const izin = await Notification.requestPermission();
      if (izin !== "granted") { setDurum(izin === "denied" ? "engelli" : "kapali"); return; }
      const kayit = await kayitBul();
      if (!kayit) { setDurum("desteksiz"); return; }
      const abonelik = (await kayit.pushManager.getSubscription())
        ?? await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(genelAnahtar) });
      const sonuc = await anlikBildirimAc(abonelik.toJSON(), cihazAdi());
      if (!sonuc.ok) { await abonelik.unsubscribe().catch(() => undefined); setMesaj({ ton: "hata", metin: sonuc.hata }); return; }
      setDurum("acik");
      setMesaj({ ton: "ok", metin: "Açıldı. Bu cihaza iş, mesaj ve yorum bildirimleri gelecek." });
      const d = await anlikBildirimDurumu(abonelik.endpoint);
      setPosta(d.postaGorur ? d.posta : null);
    } catch (hata) {
      setMesaj({ ton: "hata", metin: `Açılamadı: ${(hata as Error).message}` });
    }
  });

  const kapat = () => basla(async () => {
    setMesaj(null);
    const kayit = await kayitBul();
    const abonelik = await kayit?.pushManager.getSubscription();
    if (abonelik) {
      const sonuc = await anlikBildirimKapat(abonelik.endpoint);
      await abonelik.unsubscribe().catch(() => undefined);
      if (!sonuc.ok) { setMesaj({ ton: "hata", metin: sonuc.hata }); return; }
    }
    setDurum("kapali");
    setMesaj({ ton: "ok", metin: "Bu cihazda kapatıldı." });
  });

  const postaDegistir = (acik: boolean) => basla(async () => {
    setMesaj(null);
    const abonelik = await (await kayitBul())?.pushManager.getSubscription();
    if (!abonelik) { setDurum("kapali"); return; }
    const sonuc = await anlikBildirimPosta(abonelik.endpoint, acik);
    if (!sonuc.ok) { setMesaj({ ton: "hata", metin: sonuc.hata }); return; }
    setPosta(acik);
    setMesaj({ ton: "ok", metin: acik ? "Gelen postalar da bu cihaza bildirilecek." : "Gelen postalar artık bildirilmeyecek." });
  });

  const dene = () => basla(async () => {
    setMesaj(null);
    const abonelik = await (await kayitBul())?.pushManager.getSubscription();
    if (!abonelik) { setDurum("kapali"); return; }
    const sonuc = await anlikBildirimDene(abonelik.endpoint);
    setMesaj(sonuc.ok ? { ton: "ok", metin: "Deneme gönderildi; birkaç saniye içinde gelmeli." } : { ton: "hata", metin: sonuc.hata });
  });

  if (gorunum === "serit") {
    if (durum !== "kapali" || seritKapali || !genelAnahtar) return null;
    return (
      <div className="anlik-serit" role="region" aria-label="Anlık bildirim">
        <p><b>Bildirimleri açın</b><span>İş atandığında ya da müşteri yazdığında telefonunuz haber versin.</span></p>
        <button type="button" className="panel-primary" onClick={ac} disabled={bekliyor}>{bekliyor ? "Açılıyor…" : "Aç"}</button>
        <button type="button" className="anlik-serit-kapat" aria-label="Şimdi değil" onClick={() => { setSeritKapali(true); try { localStorage.setItem(SERIT_ANAHTARI, "1"); } catch { /* gizli pencere */ } }}>×</button>
        {mesaj?.ton === "hata" ? <small className="anlik-hata">{mesaj.metin}</small> : null}
      </div>
    );
  }

  return (
    <section className="panel-card anlik-kart" aria-label="Bu cihazda anlık bildirim">
      <div className="anlik-kart-metin">
        <h2>Bu cihazda anlık bildirim <span className="status-pill" data-tone={durum === "acik" ? "success" : durum === "engelli" ? "danger" : "neutral"}>{durum === "acik" ? "Açık" : durum === "yukleniyor" ? "…" : "Kapalı"}</span></h2>
        <p>
          {durum === "ios-ekle" ? <>iPhone&apos;da bildirim yalnızca ana ekrana eklenmiş uygulamada çalışır: Safari&apos;de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>, sonra uygulamayı ana ekrandan açıp buradan bildirimleri açın.</>
            : durum === "engelli" ? <>Bildirim izni bu tarayıcıda engellenmiş. Tarayıcının site ayarlarından bu siteye bildirim izni verip sayfayı yenileyin.</>
            : durum === "desteksiz" ? <>Bu tarayıcı anlık bildirimi desteklemiyor ya da uygulama kabuğu henüz yüklenmedi. Güncel Chrome, Edge, Firefox ya da Safari ile deneyin.</>
            : durum === "acik" ? <>Size iş ya da talep atandığında, müşteri yazdığında, size yorum geldiğinde ve adım termininiz yaklaştığında bu cihaz panel kapalıyken de haber verir.</>
            : <>Panel kapalıyken de haber alın: size iş ya da talep atandığında, müşteri yazdığında, size yorum geldiğinde, adım termininiz yaklaştığında. Gelen postaları da isterseniz açtıktan sonra ayrıca seçebilirsiniz.</>}
        </p>
        {durum === "acik" && posta !== null ? (
          <label className="anlik-posta">
            <input type="checkbox" checked={posta} disabled={bekliyor} onChange={(olay) => postaDegistir(olay.target.checked)} />
            <span><b>Gelen postaları da bildir</b><small>Ortak kutuya düşen her yeni posta bu cihaza bildirilir (gönderen ve konu).</small></span>
          </label>
        ) : null}
        {mesaj ? <small className={mesaj.ton === "hata" ? "anlik-hata" : "anlik-ok"} role="status">{mesaj.metin}</small> : null}
      </div>
      <div className="anlik-kart-eylem">
        {durum === "kapali" ? <button type="button" className="panel-primary" onClick={ac} disabled={bekliyor || !genelAnahtar}>{bekliyor ? "Açılıyor…" : "Bildirimleri aç"}</button> : null}
        {durum === "acik" ? <>
          <button type="button" className="panel-secondary" onClick={dene} disabled={bekliyor}>Deneme gönder</button>
          <button type="button" className="panel-secondary" onClick={kapat} disabled={bekliyor}>Kapat</button>
        </> : null}
      </div>
    </section>
  );
}
