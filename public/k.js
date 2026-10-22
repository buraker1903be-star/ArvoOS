/*
  ArvoOS Analitik — takip kodu (22.10.2026).

  Kurumun sitesine şu satırla eklenir:
    <script defer src="https://app.arvo-os.com/k.js" data-site="SİTE_ANAHTARI"></script>

  ÇEREZ YOK, DEPOLAMA YOK: ziyaretçi tarayıcıda işaretlenmiyor; tekil
  ziyaretçi sayısı sunucuda günlük değişen bir karmayla tahmin
  ediliyor. Bu yüzden KVKK çerez onayı gerektirmiyor.

  ADLAR BİLEREK SADE ("k.js", "/api/k"): reklam engelleyicilerin
  listeleri "analytics", "track", "collect" geçen adresleri kesiyor ve
  kesilen kod hiçbir hata vermeden SIFIR ziyaret gösteriyor.

  sendBeacon + text/plain: tarayıcı ön uçuş (CORS preflight) istemiyor,
  sayfa kapanırken bile gönderim tamamlanıyor.

  Tek sayfalı sitelerde (React, Vue) adres değişimi history.pushState
  ile oluyor ve yeni sayfa yüklenmiyor; o yüzden pushState/popstate
  da sayfa açılışı sayılıyor.
*/
(function () {
  "use strict";
  var betik = document.currentScript;
  if (!betik) return;
  var anahtar = betik.getAttribute("data-site");
  if (!anahtar) return;
  var uc = new URL("/api/k", betik.src).href;
  var sonYol = null;

  function utm(ad) {
    try { return new URL(location.href).searchParams.get(ad); } catch { return null; }
  }

  function gonder(tur) {
    var govde = JSON.stringify({
      k: anahtar,
      t: tur,
      /* Yalnızca adres + yol: sorgu dizesinde e-posta, arama terimi, oturum anahtarı olabilir. */
      p: location.origin + location.pathname,
      r: document.referrer || null,
      s: utm("utm_source"),
      m: utm("utm_medium"),
      c: utm("utm_campaign"),
      w: window.innerWidth || null
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(uc, new Blob([govde], { type: "text/plain" }))) return;
    } catch { /* aşağıdaki yedek */ }
    try { fetch(uc, { method: "POST", body: govde, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }); } catch { /* sessiz */ }
  }

  function sayfa() {
    /* Aynı adrese ikinci kez (ör. yalnızca #çapa değişimi) sayılmaz. */
    var yol = location.pathname + location.search;
    if (yol === sonYol) return;
    sonYol = yol;
    gonder("sayfa");
  }

  var itme = history.pushState;
  history.pushState = function () {
    var sonuc = itme.apply(this, arguments);
    setTimeout(sayfa, 0);
    return sonuc;
  };
  window.addEventListener("popstate", sayfa);

  /*
    FORM GÖNDERİMİ = DÖNÜŞÜM. Yakalama aşamasında dinleniyor: sitenin
    kendi kodu olayı durdursa (preventDefault ile fetch'e çevirse) bile
    görülsün. Alanların İÇERİĞİ okunmuyor, yalnızca "form gönderildi".
  */
  document.addEventListener("submit", function () { gonder("form"); }, true);

  /* Sayfadan elle de çağrılabilir: window.arvoAnalitik("form"). */
  window.arvoAnalitik = function (tur) { gonder(tur === "form" ? "form" : "sayfa"); };

  if (document.visibilityState === "prerender") {
    document.addEventListener("visibilitychange", function ilk() {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", ilk);
      sayfa();
    });
  } else {
    sayfa();
  }
})();
