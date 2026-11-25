/*
  TEK EKRAN KABULÜ — ÖLÇÜMDEN HÜKÜM (25.11.2026).

  Ürün kuralı: genel bakışlar hiçbir boyutta sayfa düzeyinde kaymaz; uzun
  içerik yalnızca kendi kartında dikey kayar (dashboard.css, GorunumSecici).
  Ölçüm genel-bakis-yerlesim-tarayici.mjs'de, HÜKÜM burada: karar saf bir
  fonksiyonda durunca betik ile birim testi AYNI ölçütü kullanıyor. Eskiden
  hüküm çağıranın tek satırlık süzgecindeydi, yani ölçüt her koşuda değişiyordu.

  İki ölçüt pahalıya öğrenildi (25.11.2026, konsol ölçümü):
  - "Taşma sıfır" tek başına kabul DEĞİL. Konsolda sayfa taşması sıfır
    çıkarken kuyruk paneli 0 px'e düşüyor ve 453 px'lik kayıt listesine
    erişilemiyordu; varsayılan sekmede ölçüm temizken Tahsilat sekmesinde
    sayfa 657/600 taşıyor, dock içeriği örtüyordu.
  - Ölçülemeyen şey GEÇMİŞ sayılmaz. Dock örtmesi görünür kart bulunamayınca
    boş kümeden hesaplanıyor ve hiçbir şey ölçmeden "örtmüyor" diyordu;
    null artık düşüren bir sonuç.
*/

/** "453/141" → içerik görünenden büyükse kayıyor. */
const kayiyor = (olcu) => {
  const [icerik, gorunen] = String(olcu).split("/");
  return icerik !== gorunen;
};

/**
 * Bir yapılandırmanın (boyut × tema × senaryo) ölçümünden kabul hükmü.
 * @returns {{ ad: string, gecti: boolean, eksik: string[] }}
 */
export function tekEkranHukmu(ad, o) {
  const eksik = [];
  if (kayiyor(o.sayfaDikey)) eksik.push(`sayfa dikey kayıyor (${o.sayfaDikey})`);
  if (kayiyor(o.sayfaYatay)) eksik.push(`sayfa yatay kayıyor (${o.sayfaYatay})`);
  if (o.dockOrtuyor === null) eksik.push("dock örtmesi ölçülemedi (görünür kart yok)");
  else if (o.dockOrtuyor) eksik.push(`dock içeriği örtüyor (içerik ${o.icerikAlt} > dock ${o.dockUstu})`);

  const e = o.erisim;
  if (e) {
    if (e.hata) eksik.push(`kuyruk ölçülemedi: ${e.hata}`);
    if (!e.sonKayitPanelde) eksik.push(`son kayıt panele sığmıyor (satır ${e.sonLiYuk} px, panel ${e.panelH} px)`);
    if (!e.dokunma) eksik.push("son satırın eylemi tıklanamıyor");
    if (!e.klavye) eksik.push("son satırın eylemi klavyeyle odaklanamıyor");
    if (!e.dockUstunde) eksik.push("son satırın eylemi dock'un altında");
    const ic = e.icSekme;
    if (ic) {
      /* Kaydırmayla ulaşmak yeterli sayılmıyor: şerit taşmayacak ve her
         sekme kutusunun içinde, tıklanabilir ve odaklanabilir olacak. */
      if (ic.yatayTasiyor) eksik.push("kuyruk sekmeleri yatay kayıyor");
      if (ic.erisilemeyen?.length) eksik.push(`dokunmayla açılamayan kuyruk sekmesi: ${ic.erisilemeyen.join(", ")}`);
      else if (ic.sonGorunur === false) eksik.push("iç sekme şeridinin sonuna ulaşılamıyor");
      /* Tablist'te Tab ile tek durak olur (gezici odak); sıfır durak şeridin
         klavyeye hiç açılmadığı, birden çoğu kalıbın bozulduğu anlamına gelir. */
      if (ic.tabDurakSayisi !== undefined && ic.tabDurakSayisi !== 1) {
        eksik.push(`sekme şeridinde ${ic.tabDurakSayisi} Tab durağı var (gezici odakta tam 1 olmalı)`);
      }
    }
    const gez = e.klavyeGezinti;
    if (gez) {
      if (ic && gez.length !== ic.sayi) eksik.push(`klavyeyle ${gez.length}/${ic.sayi} sekmeye ulaşıldı`);
      const takilan = gez.filter((g) => !(g.odakSeritte && g.secili && g.panelGorunur)).map((g) => g.ad ?? "?");
      if (takilan.length) eksik.push(`klavyeyle açılamayan kuyruk sekmesi: ${takilan.join(", ")}`);
    }
  }

  /*
    KART KENDİ PANELİNİ AŞMAZ. Kaydıracak alanı olmayan bir kart (Tahsilat
    grafiği) daralan panelin içinde küçülmüyor ve alttaki kartın ÜSTÜNE
    çiziliyordu: 1440×900'de panel 70, kart 187 px. Sayfa taşması sıfır ve
    dock açık olduğu için yalnızca taşmaya bakan kabul bunu görmüyordu.
  */
  for (const k of o.kartPanelde ?? []) {
    if (k.panelAsiyor > 1 && !k.panelKayiyor) {
      eksik.push(`${k.panel}: kart panelini ${k.panelAsiyor} px aşıyor (kart ${k.kartH}, panel ${k.panelH})`);
    }
  }

  /*
    Son kuyruk sekmesi (Sorun) AÇILDIĞINDA da tek ekran sözleşmesi
    sürmeli: sekmeye ulaşmak, açıldığında sayfanın kaymaması demek değil.
  */
  const sonSekmeDenetle = (olcum, etiket) => {
    if (!olcum) return;
    if (kayiyor(olcum.sayfaDikey)) eksik.push(`${etiket} sayfa kayıyor (${olcum.sayfaDikey})`);
    if (kayiyor(olcum.sayfaYatay)) eksik.push(`${etiket} sayfa yatay kayıyor (${olcum.sayfaYatay})`);
    if (olcum.dockOrtuyor) eksik.push(`${etiket} dock içeriği örtüyor`);
    for (const k of olcum.zincir?.kartPanelde ?? []) {
      if (k.panelAsiyor > 1 && !k.panelKayiyor) eksik.push(`${etiket} ${k.panel} kartı panelini ${k.panelAsiyor} px aşıyor`);
    }
  };
  const sonAd = o.sonSekme?.ad ?? "son sekme";
  sonSekmeDenetle(o.sonSekme, `${sonAd} açıkken`);
  /* Telefonda görünüm sekmesine dönüş: kuyruk hâlâ son sekmede. */
  sonSekmeDenetle(o.sonSekmeDonus, `${sonAd} açıkken görünüme dönünce`);

  for (const [sekme, m] of Object.entries(o.secimler ?? {})) {
    if (kayiyor(m.sayfaDikey)) eksik.push(`${sekme}: sayfa kayıyor (${m.sayfaDikey})`);
    if (m.dockOrtuyor) eksik.push(`${sekme}: dock içeriği örtüyor`);
    if (m.govde && !m.govde.kabul) eksik.push(`${sekme}: kart panele sığmıyor ve panel kaymıyor`);
  }

  return { ad, gecti: eksik.length === 0, eksik };
}
