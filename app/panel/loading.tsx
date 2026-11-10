/*
  PANEL YÜKLEME İSKELETİ — ANA EKRANIN ŞEKLİ (10.11.2026).

  Eskiden iskelet dört eşit ölçü kutusu + iki büyük blok çiziyordu; ana
  ekranda o kutular 2026-10'da kalktı (selamlama · talep grafiği · liste
  kartları) ve PR #314'te liste kartları esnek ızgaraya geçti. Yüklenirken
  dört kutu, yüklenince bambaşka bir düzen: her açılışta göz kayması.

  Şimdi aynı ölçüler ve aynı SABİT düzen (dashboard.css · .dash-sabit):
  sayfa kaymaz, liste kartları kalan yüksekliği paylaşır; telefonda
  görünüm seçici + tek panel. Sol menü ve
  çalışma alanı boşlukları yerleşimde (layout.tsx) olduğu için iskelet
  zaten aynı kutunun içinde çiziliyor; menü yüklenirken yeniden kurulmuyor.

  Tek iskelet bütün panel sayfaları için (app/panel/loading.tsx tek sınır):
  genel bakış şablonunu (os/genel-bakis.tsx) kullanan modül sayfalarına da
  benziyor. Liste sayfaları kendi düzeninde; orada iskelet yaklaşık kalır.
*/
const SATIR = [0, 1, 2, 3];

export default function PanelLoading() {
  return (
    <div className="panel-skeleton skel-genel" aria-hidden="true">
      <div className="skel-hero">
        <div className="skel skel-kicker" />
        <div className="skel skel-title" />
      </div>
      <div className="skel-sekmeler">
        <div className="skel" />
        <div className="skel" />
        <div className="skel" />
      </div>
      <div className="skel-kart">
        <div className="skel skel-kart-bas" />
        <div className="skel skel-kart-alt" />
        <div className="skel skel-cubuklar" />
      </div>
      <div className="skel-izgara">
        {[0, 1, 2].map((kart) => (
          <div className="skel-kart" key={kart}>
            <div className="skel skel-kart-bas" />
            <div className="skel skel-kart-alt" />
            {SATIR.map((satir) => <div className="skel skel-satir" key={satir} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
