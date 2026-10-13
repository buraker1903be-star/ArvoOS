"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { anlikBildirimAc, anlikBildirimCihazKaldir, anlikBildirimDene, anlikBildirimOzeti, anlikBildirimTercih, type AnlikCihaz, type AnlikOzet } from "./anlik-actions";
import "./anlik-bildirim.css";
/* .talep-musteri kart düzeni orada: bu bileşen ana ekranda da
   çiziliyor ve o rotada stil yüklenmiyordu (npm run check:css
   yakaladı). Bileşen her yerde kullanılıyorsa CSS'ini kendisi import
   eder — AGENTS.md. */
import "../crm/kayit-detay/kayit-detay.css";

/*
  BU CİHAZDA ANLIK BİLDİRİM (13.10.2026, mobil 4. aşama).

  Durumlar tarayıcıdan okunuyor (sunucu bilemez: izin ve abonelik
  cihazda). iPhone'da web push YALNIZCA ana ekrana eklenmiş uygulamada
  çalışıyor (iOS 16.4+); Safari sekmesinde düğme yerine nasıl
  ekleneceği yazılıyor — yoksa "Aç"a basan kişi hiçbir şey olmadığını
  görürdü.

  Ayarlar KİŞİ başına (20261013090223): "Anlık bildirimler" ve "Gelen
  postaları da bildir" hangi cihazdan değişirse değişsin bütün
  cihazlarda geçerli; cihaz listesinden başka bir cihaz kaldırılabilir.
  Yalnızca yeni bir cihazı EKLEMEK o cihazdan yapılır (izin orada).

  İki görünüm: "kart" (Bildirimler sayfası, her ekranda) ve "serit"
  (telefonda ana ekran; yalnızca henüz açılmamışken ve kapatılmamışsa
  görünür).
*/
type Durum = "yukleniyor" | "desteksiz" | "ios-ekle" | "engelli" | "kapali" | "acik";

const SERIT_ANAHTARI = "arvo:anlik-bildirim-serit-kapatildi";

/* Bu cihazın durumu: tek satır başlık + kısa açıklama (yan kartın üstü). */
const BU_CIHAZ: Record<Durum, { baslik: string; aciklama: string; ton: "basari" | "uyari" | "tehlike" | "sessiz" }> = {
  yukleniyor: { baslik: "Bu cihaz denetleniyor…", aciklama: "Tarayıcının bildirim izni okunuyor.", ton: "sessiz" },
  acik: { baslik: "Bu cihaz bildirim alıyor", aciklama: "Atama, müşteri mesajı, yorum ve termin bildirimleri anında gelir.", ton: "basari" },
  kapali: { baslik: "Bu cihaz ekli değil", aciklama: "Eklemek için tarayıcının sorduğu izni vermeniz yeterli.", ton: "uyari" },
  "ios-ekle": { baslik: "Önce ana ekrana ekleyin", aciklama: "", ton: "uyari" },
  engelli: { baslik: "Bildirim izni engelli", aciklama: "Tarayıcının site ayarlarından bu siteye izin verip sayfayı yenileyin.", ton: "tehlike" },
  desteksiz: { baslik: "Bu tarayıcı desteklemiyor", aciklama: "Güncel Chrome, Edge, Firefox ya da Safari ile deneyin.", ton: "sessiz" },
};

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

/*
  BİLDİRİMİ GÖSTEREN KOD KABUĞUN YENİ SÜRÜMÜNDE. Kabuk yeni sürümü
  "Yenile" denene kadar bekletiyor (form dolduran kaybetmesin); telefonda
  eski kabuk (arvo-kabuk-1, push dinleyicisi yok) çalışmaya devam edince
  bildirim Apple'dan telefona ulaşıyor ama ekranda HİÇBİR ŞEY
  görünmüyordu (13.10.2026). Bildirim kartında bekleyen sürüm hemen
  devreye alınır; kabuk controllerchange'de sayfayı yeniler.
  Dönüş: yenileme başladıysa true (çağıran devam etmesin).
*/
async function kabuguGuncelle(kayit: ServiceWorkerRegistration): Promise<boolean> {
  await kayit.update().catch(() => undefined);
  const bekleyen = kayit.waiting ?? (kayit.installing ? await new Promise<ServiceWorker | null>((r) => {
    const sw = kayit.installing as ServiceWorker;
    sw.addEventListener("statechange", () => { if (sw.state === "installed") r(sw); else if (sw.state === "redundant") r(null); });
    setTimeout(() => r(kayit.waiting), 5000);
  }) : null);
  if (!bekleyen || !navigator.serviceWorker.controller) return false;
  bekleyen.postMessage("yeni-surumu-uygula");
  return true;
}

const tarihBicim = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AnlikBildirimAyari({ genelAnahtar, gorunum = "kart" }: { genelAnahtar: string | null; gorunum?: "kart" | "serit" }) {
  const [durum, setDurum] = useState<Durum>("yukleniyor");
  const [mesaj, setMesaj] = useState<{ ton: "ok" | "hata"; metin: string } | null>(null);
  // İlk çizimde durum "yukleniyor" ve şerit hiç basılmıyor; sunucuyla istemci ayrışmaz.
  const [seritKapali, setSeritKapali] = useState(() => {
    try { return typeof window !== "undefined" && Boolean(localStorage.getItem(SERIT_ANAHTARI)); } catch { return false; }
  });
  const [bekliyor, basla] = useTransition();
  /* Kişinin tercihi ve cihazları (20261013090223): hangi cihazdan
     değişirse değişsin hepsinde geçerli. null = okunmadı / kurulum yok. */
  const [ozet, setOzet] = useState<AnlikOzet | null>(null);
  /* Telefonda yan kart katlı başlar (yalnızca durum özeti); işlem
     gerektiren bir durum okununca açılır. Geniş ekranda CSS yok sayar. */
  const [katli, setKatli] = useState(true);

  /* Bu tarayıcının durumu + (kartta) sunucudaki kişi özeti. Tarayıcı abone
     ama sunucuda bu cihaz yoksa (başka bir cihazdan kaldırıldı) cihaz
     KAPALI sayılır: eskiden kart kaydı kendiliğinden yeniliyordu, bu da
     başka cihazdan "Kaldır"ı geri alırdı. */
  const yukle = useCallback(async (iptal: () => boolean = () => false) => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const anaEkranda = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const destek = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let yeni: Durum;
    let endpoint: string | null = null;
    /* iPhone'da Safari SEKMESİ push alamaz (Apple yalnızca ana ekrana
       eklenmiş uygulamaya izin veriyor). Eskiden yalnızca PushManager'ın
       varlığına bakılıyordu; yeni iOS sürümleri onu sekmede de tanımlıyor,
       kart "Bildirimleri aç" gösteriyor, dokununca hiçbir şey olmuyordu
       (13.10.2026, kurum sahibinin telefonu). */
    if (ios && !anaEkranda) yeni = "ios-ekle";
    else if (!destek) yeni = "desteksiz";
    else if (Notification.permission === "denied") yeni = "engelli";
    else {
      const kayit = await kayitBul();
      if (!kayit) yeni = "desteksiz";
      else if (gorunum === "kart" && await kabuguGuncelle(kayit)) return; // sayfa yenileniyor
      else {
        const abonelik = await kayit.pushManager.getSubscription();
        endpoint = abonelik?.endpoint ?? null;
        yeni = abonelik && Notification.permission === "granted" ? "acik" : "kapali";
      }
    }
    /*
      Kişi özeti (ayarlar + cihazlar) sunucu işleminden geliyor. İstek
      yarıda kesilirse (sayfa yenilemesiyle iptal edilen sunucu işlemi)
      söz hiç sonuçlanmıyor ve kart "denetleniyor…"da takılı kalıyordu
      (13.10.2026). Süre sınırıyla bekleniyor, gelmezse bir kez daha
      isteniyor; cihazın kendi durumu özetten bağımsız yazılıyor.
    */
    if (gorunum === "kart") {
      const sinirli = () => Promise.race([
        anlikBildirimOzeti(endpoint).catch(() => undefined),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000)),
      ]);
      const o = (await sinirli()) ?? (await sinirli());
      if (iptal()) return;
      if (o !== undefined) setOzet(o);
      if (yeni === "acik" && o && !o.buCihazKayitli) yeni = "kapali";
    }
    if (!iptal()) {
      setDurum(yeni);
      if (yeni === "kapali" || yeni === "ios-ekle") setKatli(false);
    }
  }, [gorunum]);

  useEffect(() => {
    let iptal = false;
    // Tarayıcı durumu dış bir sistem: okuma eşzamansız, sonuç geldiğinde durum yazılır.
    Promise.resolve().then(() => yukle(() => iptal)).catch(() => { if (!iptal) setDurum("desteksiz"); });
    return () => { iptal = true; };
  }, [yukle]);

  const ac = () => basla(async () => {
    setMesaj(null);
    if (!genelAnahtar) { setMesaj({ ton: "hata", metin: "Anlık bildirim bu kurulumda henüz açılmadı." }); return; }
    try {
      const izin = await Notification.requestPermission();
      if (izin !== "granted") {
        setDurum(izin === "denied" ? "engelli" : "kapali");
        // Eskiden sessizdi: izin penceresi kapatılınca kişi neden bir şey olmadığını bilmiyordu.
        if (izin !== "denied") setMesaj({ ton: "hata", metin: "Bildirim izni verilmedi. Yeniden deneyip çıkan pencerede İzin Ver'e dokunun." });
        return;
      }
      const kayit = await kayitBul();
      if (!kayit) { setDurum("desteksiz"); return; }
      const abonelik = (await kayit.pushManager.getSubscription())
        ?? await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(genelAnahtar) });
      const sonuc = await anlikBildirimAc(abonelik.toJSON(), cihazAdi());
      if (!sonuc.ok) { await abonelik.unsubscribe().catch(() => undefined); setMesaj({ ton: "hata", metin: sonuc.hata }); return; }
      setMesaj({ ton: "ok", metin: "Bu cihaz eklendi. Ayarlarınız bütün cihazlarınızda geçerli." });
      await yukle();
    } catch (hata) {
      setMesaj({ ton: "hata", metin: `Açılamadı: ${(hata as Error).message}` });
    }
  });

  const kaldir = (cihaz: AnlikCihaz) => basla(async () => {
    setMesaj(null);
    const sonuc = await anlikBildirimCihazKaldir(cihaz.id);
    if (!sonuc.ok) { setMesaj({ ton: "hata", metin: sonuc.hata }); return; }
    // Bu cihazsa tarayıcının aboneliği de bırakılır; başka cihaz kendi açılışında "kapalı" görür.
    if (cihaz.buCihaz) await (await (await kayitBul())?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
    setMesaj({ ton: "ok", metin: `${cihaz.cihaz} kaldırıldı; bu cihaza artık bildirim gitmez.` });
    await yukle();
  });

  const tercih = (degisiklik: { acik?: boolean; posta?: boolean }) => basla(async () => {
    setMesaj(null);
    const sonuc = await anlikBildirimTercih(degisiklik);
    if (!sonuc.ok) { setMesaj({ ton: "hata", metin: sonuc.hata }); return; }
    setOzet((o) => (o ? { ...o, ...degisiklik } : o));
    setMesaj({
      ton: "ok",
      metin: degisiklik.posta !== undefined
        ? (degisiklik.posta ? "Gelen postalar bütün cihazlarınıza bildirilecek." : "Gelen postalar artık bildirilmeyecek.")
        : (degisiklik.acik ? "Anlık bildirimler bütün cihazlarınızda açık." : "Anlık bildirimler bütün cihazlarınızda kapatıldı."),
    });
  });

  const dene = () => basla(async () => {
    setMesaj(null);
    const sonuc = await anlikBildirimDene();
    setMesaj(sonuc.ok
      ? { ton: "ok", metin: sonuc.toplam > 1 ? `Deneme ${sonuc.gonderilen} cihazınıza gönderildi; birkaç saniye içinde gelmeli.` : "Deneme gönderildi; birkaç saniye içinde gelmeli." }
      : { ton: "hata", metin: sonuc.hata });
    await yukle();
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

  const cihazSayisi = ozet?.cihazlar.length ?? 0;
  const genelDurum = !ozet ? null : !ozet.acik ? { ad: "Kapalı", ton: "neutral" } : cihazSayisi ? { ad: "Açık", ton: "success" } : { ad: "Cihaz yok", ton: "neutral" };
  const buCihaz = BU_CIHAZ[durum];

  /*
    YAN KART (13.10.2026). Eskiden listenin üstünde tam genişlikte bir
    blok: uzun bir paragraf, gri kutulu onay kutuları ve kaba düğmeler;
    listeyi ekranın altına itiyordu. Artık işler listesindeki istatistik
    kartının yerinde: üstte bu cihazın durumu (tek satır + gereken tek
    düğme), altında anahtarlar ve cihazlar. Telefonda kart listenin
    altına düşmesin diye üstte, durum özetiyle KATLI duruyor; işlem
    gerektiren durumda (cihaz ekli değil, ana ekrana eklenmeli) açık.
  */
  return (
    <section className="panel-card talep-musteri anlik-panel" data-katli={katli || undefined} aria-label="Anlık bildirimler">
      <header className="anlik-bas">
        <span className="anlik-simge" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        </span>
        <div className="anlik-bas-metin">
          <h2>Anlık bildirimler</h2>
          <small>Panel kapalıyken de haber verir</small>
        </div>
        {genelDurum ? <span className="status-pill" data-tone={genelDurum.ton}>{genelDurum.ad}</span> : null}
        <button type="button" className="anlik-katla" aria-expanded={!katli} aria-label={katli ? "Ayarları göster" : "Ayarları gizle"} onClick={() => setKatli((k) => !k)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </header>

      <div className="anlik-govde">
        <div className="anlik-bu-cihaz" data-ton={buCihaz.ton}>
          <i aria-hidden="true" />
          <div>
            <b>{buCihaz.baslik}</b>
            {durum === "ios-ekle" ? (
              <ol className="anlik-adimlar">
                <li>Safari&apos;de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b></li>
                <li>Ana ekrandaki simgeden açıp giriş yapın</li>
                <li>Bu sayfada <b>Bu cihazı ekle</b>&apos;ye dokunun</li>
              </ol>
            ) : <small>{buCihaz.aciklama}</small>}
          </div>
        </div>
        {durum === "kapali" ? (
          <button type="button" className="panel-primary anlik-ekle" onClick={ac} disabled={bekliyor || !genelAnahtar}>{bekliyor ? "Ekleniyor…" : "Bu cihazı ekle"}</button>
        ) : null}

        {ozet ? (
          <>
            <ul className="anlik-anahtarlar">
              <li>
                <span><b>Anlık bildirimler</b><small>Bütün cihazlarınızda</small></span>
                <button type="button" role="switch" aria-checked={ozet.acik} aria-label="Anlık bildirimler" className={`anlik-anahtar${ozet.acik ? " is-on" : ""}`} disabled={bekliyor} onClick={() => tercih({ acik: !ozet.acik })}><i /></button>
              </li>
              {ozet.postaGorur ? (
                <li data-pasif={!ozet.acik || undefined}>
                  <span><b>Gelen postalar</b><small>Ortak kutuya düşen her yeni posta</small></span>
                  <button type="button" role="switch" aria-checked={ozet.posta} aria-label="Gelen postaları bildir" className={`anlik-anahtar${ozet.posta ? " is-on" : ""}`} disabled={bekliyor || !ozet.acik} onClick={() => tercih({ posta: !ozet.posta })}><i /></button>
                </li>
              ) : null}
            </ul>

            <div className="anlik-cihazlar">
              <h3>Cihazlarım <small>{cihazSayisi}</small></h3>
              {cihazSayisi ? (
                <ul>
                  {ozet.cihazlar.map((c) => (
                    <li key={c.id}>
                      <span className="anlik-cihaz-simge" aria-hidden="true">
                        {/iPhone|iPad|Android/.test(c.cihaz)
                          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
                          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="11" rx="2" /><path d="M2 19.5h20" /></svg>}
                      </span>
                      <span className="anlik-cihaz-metin">
                        <b>{c.cihaz}{c.buCihaz ? <em>bu cihaz</em> : null}</b>
                        <small>{c.sonBasari ? `Son bildirim ${tarihBicim.format(new Date(c.sonBasari))}` : `Eklendi ${tarihBicim.format(new Date(c.eklendi))}`}</small>
                      </span>
                      <button type="button" className="anlik-kaldir" onClick={() => kaldir(c)} disabled={bekliyor} aria-label={`${c.cihaz} cihazını kaldır`} title="Kaldır">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="anlik-bos">Henüz cihaz yok. Telefonunuzdan bu sayfayı açıp cihazı ekleyin.</p>}
            </div>
          </>
        ) : null}

        {mesaj ? <p className={mesaj.ton === "hata" ? "anlik-hata" : "anlik-ok"} role="status">{mesaj.metin}</p> : null}
        {cihazSayisi ? <button type="button" className="panel-secondary anlik-dene" onClick={dene} disabled={bekliyor}>Deneme bildirimi gönder</button> : null}
      </div>
    </section>
  );
}
