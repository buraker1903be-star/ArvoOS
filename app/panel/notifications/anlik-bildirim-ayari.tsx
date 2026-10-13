"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { anlikBildirimAc, anlikBildirimCihazKaldir, anlikBildirimDene, anlikBildirimOzeti, anlikBildirimTercih, type AnlikCihaz, type AnlikOzet } from "./anlik-actions";
import "./anlik-bildirim.css";

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
    if (gorunum === "kart") {
      const o = await anlikBildirimOzeti(endpoint);
      if (iptal()) return;
      setOzet(o);
      if (yeni === "acik" && o && !o.buCihazKayitli) yeni = "kapali";
    }
    if (!iptal()) setDurum(yeni);
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

  return (
    <section className="panel-card anlik-kart" aria-label="Anlık bildirim">
      <div className="anlik-kart-metin">
        <h2>Anlık bildirim {genelDurum ? <span className="status-pill" data-tone={genelDurum.ton}>{genelDurum.ad}</span> : null}</h2>
        <p>
          <b>Bu cihaz: </b>
          {durum === "ios-ekle" ? <>iPhone&apos;da bildirim yalnızca ana ekrana eklenmiş uygulamada çalışır: Safari&apos;de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>, sonra uygulamayı ana ekrandaki simgeden açın. Ana ekran uygulaması Safari&apos;den ayrı çalıştığı için bir kez yeniden giriş yapmanız gerekir; ardından Bildirimler sayfasından bu cihazı ekleyin.</>
            : durum === "engelli" ? <>bildirim izni bu tarayıcıda engellenmiş. Tarayıcının site ayarlarından bu siteye bildirim izni verip sayfayı yenileyin.</>
            : durum === "desteksiz" ? <>bu tarayıcı anlık bildirimi desteklemiyor ya da uygulama kabuğu henüz yüklenmedi. Güncel Chrome, Edge, Firefox ya da Safari ile deneyin.</>
            : durum === "acik" ? <>bildirim alıyor. Size iş ya da talep atandığında, müşteri yazdığında, size yorum geldiğinde ve adım termininiz yaklaştığında panel kapalıyken de haber verir.</>
            : durum === "yukleniyor" ? <>denetleniyor…</>
            : <>bildirim almıyor. Yeni bir cihaz yalnızca kendisinden eklenebilir (izni tarayıcı orada soruyor); ayarlar ise hangi cihazdan değişirse değişsin hepsinde geçerli.</>}
        </p>

        {ozet ? (
          <div className="anlik-ayarlar">
            <label className="anlik-posta">
              <input type="checkbox" checked={ozet.acik} disabled={bekliyor} onChange={(olay) => tercih({ acik: olay.target.checked })} />
              <span><b>Anlık bildirimler</b><small>Bütün cihazlarınızda geçerli. Kapatınca hiçbir cihaza bildirim gitmez; cihazlar listede kalır.</small></span>
            </label>
            {ozet.postaGorur ? (
              <label className="anlik-posta" data-pasif={!ozet.acik || undefined}>
                <input type="checkbox" checked={ozet.posta} disabled={bekliyor || !ozet.acik} onChange={(olay) => tercih({ posta: olay.target.checked })} />
                <span><b>Gelen postaları da bildir</b><small>Ortak kutuya düşen her yeni posta, gönderen ve konuyla, bütün cihazlarınıza.</small></span>
              </label>
            ) : null}
            <div className="anlik-cihazlar">
              <h3>Cihazlarım <small>{cihazSayisi}</small></h3>
              {cihazSayisi ? (
                <ul>
                  {ozet.cihazlar.map((c) => (
                    <li key={c.id}>
                      <span>
                        <b>{c.cihaz}{c.buCihaz ? <em>bu cihaz</em> : null}</b>
                        <small>Eklendi {tarihBicim.format(new Date(c.eklendi))}{c.sonBasari ? ` · son bildirim ${tarihBicim.format(new Date(c.sonBasari))}` : ""}</small>
                      </span>
                      <button type="button" className="panel-secondary" onClick={() => kaldir(c)} disabled={bekliyor}>Kaldır</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="anlik-bos">Henüz cihaz yok. Telefonunuzdan bu sayfayı açıp &quot;Bu cihazı ekle&quot;ye dokunun.</p>}
            </div>
          </div>
        ) : null}
        {mesaj ? <small className={mesaj.ton === "hata" ? "anlik-hata" : "anlik-ok"} role="status">{mesaj.metin}</small> : null}
      </div>
      <div className="anlik-kart-eylem">
        {durum === "kapali" ? <button type="button" className="panel-primary" onClick={ac} disabled={bekliyor || !genelAnahtar}>{bekliyor ? "Ekleniyor…" : "Bu cihazı ekle"}</button> : null}
        {cihazSayisi ? <button type="button" className="panel-secondary" onClick={dene} disabled={bekliyor}>Deneme gönder</button> : null}
      </div>
    </section>
  );
}
