/*
  ArvoOS UYGULAMA KABUĞU (service worker), 13.10.2026.

  Panel telefonda (tarayıcıdan da, ana ekrana eklenince de) uygulama
  gibi çalışsın diye. Ne YAPMIYOR, neden:

  - Panel sayfalarını (HTML) ve veriyi ÖNBELLEĞE ALMIYOR. Ortak bir
    telefonda bir kullanıcının talepleri, carisi diskte kalıp oturumu
    kapatıldıktan sonra başkasına görünmesin. Sayfa her zaman ağdan gelir.
  - Oturum çerezlerine, API isteklerine, POST'lara dokunmuyor.

  Ne yapıyor:
  - Sürümle adlandırılmış (değişmez) derleme dosyalarını (/_next/static)
    ve simgeleri saklıyor: uygulama ikinci açılışta anında açılır.
  - Bağlantı yokken sayfa açılamazsa boş beyaz ekran yerine
    "Bağlantı yok" ekranı (/cevrimdisi.html) gösteriyor.
  - Yeni sürüm yüklenince sayfaya haber veriyor; "Yenile" denince devreye
    giriyor (os-uygulama-kabugu.tsx). Kullanıcı form doldururken sayfa
    kendiliğinden yenilenmesin diye beklemeye alınıyor.

  Önbellek adı değişince eskiler silinir; bu dosyada bir şey değişirse
  SURUM artırılır.
*/
/*
  İKİ AYRI ÖNBELLEK VE BİR TAVAN (15.10.2026).

  Hepsi tek önbellekteydi ve derleme dosyaları hiç temizlenmiyordu:
  `/_next/static/...` yolları her derlemede yeni karma alıyor, önbellek
  adı ise yalnızca BU DOSYA değişince değişiyor. Yani her dağıtımın
  parçaları öncekilerin üstüne biniyordu. Ölçüldüğünde 1282 dosya /
  57,6 MB vardı (573 CSS + 705 JS) ve büyümenin durduğu bir nokta yok —
  günde birkaç dağıtım olan bir üründe bu, telefonda sınırsız şişen bir
  klasör demek.

  Asıl zarar yer kaplaması değil: tarayıcı alan baskısı altında bir
  kaynağın deposunu TOPTAN boşaltıyor. Tek önbellekte çevrimdışı ekranı
  da derleme çöpüyle aynı torbada olduğu için, önbelleğin biricik amacı
  (bağlantı yokken beyaz ekran göstermemek) tam da en muhtemel anında
  kayboluyordu.

  Bu yüzden kabuk (çevrimdışı ekranı + simgeler) ayrı önbellekte ve
  kendi başına birkaç yüz kilobayt: ona dokunulmuyor. Derleme dosyaları
  kendi önbelleğinde ve TAVAN'ı aşınca en eskiden başlayarak atılıyor —
  Cache.keys() eklenme sırasını koruyor, yani baştakiler en eski
  dağıtımın artıkları. Atılan bir parça gerekirse ağdan yeniden iniyor;
  bedeli bir istek, karşılığı sınırlı bir depo.
*/
const SURUM = "arvo-kabuk-4";
const STATIK = "arvo-statik-4";
const BIZIM = new Set([SURUM, STATIK]);
/* Tek bir derlemenin parçaları birkaç düzine; 400 hem rahat bir pay
   bırakıyor hem de şişmeyi birkaç dağıtımla sınırlıyor. */
const TAVAN = 400;
const CEVRIMDISI = "/cevrimdisi.html";
const ONCEDEN = [CEVRIMDISI, "/icon-192.png", "/icon-512.png", "/favicon.svg"];

self.addEventListener("install", (olay) => {
  olay.waitUntil(caches.open(SURUM).then((onbellek) => onbellek.addAll(ONCEDEN)));
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil((async () => {
    const adlar = await caches.keys();
    await Promise.all(adlar.filter((ad) => !BIZIM.has(ad)).map((ad) => caches.delete(ad)));
    await self.clients.claim();
  })());
});

/* En eskiden başlayarak tavana indir. Silme, yeni kaydın ARDINDAN
   yapılıyor: yanıtı döndürmeyi bekletmesin. */
async function buda(onbellek) {
  const kayitlar = await onbellek.keys();
  if (kayitlar.length <= TAVAN) return;
  await Promise.all(kayitlar.slice(0, kayitlar.length - TAVAN).map((istek) => onbellek.delete(istek)));
}

// Sayfadaki "Yenile" düğmesi: bekleyen yeni sürüm devreye girsin.
self.addEventListener("message", (olay) => {
  if (olay.data === "yeni-surumu-uygula") self.skipWaiting();
});

const degismezMi = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname) || url.pathname.startsWith("/assets/_vinext_fonts/"));

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);

  // Sayfa açılışı: her zaman ağdan; ağ yoksa "Bağlantı yok" ekranı.
  if (istek.mode === "navigate") {
    olay.respondWith(fetch(istek).catch(async () => (await caches.match(CEVRIMDISI)) || Response.error()));
    return;
  }

  // Değişmez derleme dosyaları ve simgeler: önce önbellek.
  if (degismezMi(url)) {
    olay.respondWith((async () => {
      // Kabuk önbelleği de sorulur: simgeler kurulumda oraya yazıldı.
      const kabuk = await caches.match(istek, { cacheName: SURUM });
      if (kabuk) return kabuk;
      const onbellek = await caches.open(STATIK);
      const kayitli = await onbellek.match(istek);
      if (kayitli) return kayitli;
      const yanit = await fetch(istek);
      if (yanit.ok && yanit.type === "basic") {
        await onbellek.put(istek, yanit.clone());
        olay.waitUntil(buda(onbellek));
      }
      return yanit;
    })());
  }
  // Geri kalan her şey (veri, API, oturum) tarayıcının kendi yolundan.
});

/*
  ANLIK BİLDİRİM (13.10.2026, 4. aşama). Sunucu (app/api/push/gonder)
  yükü { baslik, metin, adres, etiket } olarak gönderiyor. Her push bir
  bildirim GÖSTERMELİ: iOS ve Chrome sessiz push'a izin vermiyor,
  göstermeyen sitenin iznini geri alıyor.
*/
self.addEventListener("push", (olay) => {
  let yuk = {};
  try { yuk = olay.data ? olay.data.json() : {}; } catch { yuk = { metin: olay.data ? olay.data.text() : "" }; }
  const adres = typeof yuk.adres === "string" && yuk.adres.startsWith("/") && !yuk.adres.startsWith("//") ? yuk.adres : "/panel/notifications";
  olay.waitUntil(self.registration.showNotification(yuk.baslik || "Yeni bildirim", {
    body: yuk.metin || "",
    tag: yuk.etiket || undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { adres },
  }));
});

// Dokununca: açık bir panel penceresi varsa onu öne getirip adrese götür, yoksa yeni pencere.
self.addEventListener("notificationclick", (olay) => {
  olay.notification.close();
  const adres = new URL(olay.notification.data?.adres || "/panel", self.location.origin).href;
  olay.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const pencere = pencereler.find((p) => new URL(p.url).origin === self.location.origin);
    if (!pencere) return self.clients.openWindow(adres);
    await pencere.focus();
    return "navigate" in pencere ? pencere.navigate(adres).catch(() => self.clients.openWindow(adres)) : undefined;
  })());
});
