import { PanelModal } from "../components/panel-modal";

/*
  Liste sayfalarının (talepler, teklifler, sözleşmeler) sağındaki
  istatistik kartı. Üstte dört sayı kutusu, altında çubuklu dağılımlar.
  Hesaplar lib/liste-istatistik.ts'te; bu bileşen yalnızca çizer.
*/

export type IstatistikKutusu = { ad: string; deger: string; alt?: string; ton?: "arti" | "uyari" };
export type IstatistikGrubu = { baslik: string; satirlar: { ad: string; adet: number; etiket?: string }[] };

/** Dağılım kartında görünen kalem sayısı; kalanı pencerede. */
const ILK = 3;

const TON_SINIFI = { arti: "cari-arti", uyari: "talep-uyari" } as const;

export function IstatistikKarti({ kapsam, kutular, gruplar }: { kapsam: string; kutular: IstatistikKutusu[]; gruplar: IstatistikGrubu[] }) {
  return (
    <section className="panel-card talep-musteri talep-istatistik" aria-label="İstatistikler">
      <div className="cari-baslik">
        <h2>İstatistikler</h2>
        <small>{kapsam}</small>
      </div>
      <dl className="istat-kutular">
        {kutular.map((kutu) => (
          <div key={kutu.ad}>
            <dt>{kutu.ad}</dt>
            <dd className={kutu.ton === "uyari" ? TON_SINIFI.uyari : undefined}>{kutu.deger}</dd>
            {kutu.alt ? <small className={kutu.ton === "arti" ? TON_SINIFI.arti : kutu.ton === "uyari" ? TON_SINIFI.uyari : undefined}>{kutu.alt}</small> : null}
          </div>
        ))}
      </dl>
      {/*
        DAĞILIMLAR KART (03.11.2026, kurum sahibinin isteği: "sağdaki
        istatistik kartını daraltıp kartlı, pencereli yapalım"). Eskiden
        iki dağılım yan yana bütün satırlarıyla duruyordu ve sütunun
        genişliğini o belirliyordu. Artık her dağılım bir kart: ilk üç
        kalem çubuğuyla, karta basınca bütün liste ortada açılan pencerede.
        Sütun daraldı, liste genişledi.
      */}
      <div className="istat-kartlar">
      {gruplar.map((grup) => {
        const enBuyuk = Math.max(1, ...grup.satirlar.map((s) => s.adet));
        const genislik = (adet: number) => `${adet ? Math.max(4, Math.round((adet / enBuyuk) * 100)) : 0}%`;
        const kalan = grup.satirlar.length - ILK;
        return (
          <PanelModal
            key={grup.baslik}
            triggerClassName="istat-kart"
            triggerLabel={grup.baslik}
            tetik={<>
              <span className="istat-kart-ust"><span>{grup.baslik}</span><small>{grup.satirlar.length ? `${grup.satirlar.length} kalem` : "veri yok"}</small></span>
              {grup.satirlar.slice(0, ILK).map((satir) => (
                <span className="istat-kart-satir" key={satir.ad}>
                  <span title={satir.ad}>{satir.ad}</span>
                  <strong>{satir.etiket ?? satir.adet}</strong>
                  <i aria-hidden="true"><b style={{ width: genislik(satir.adet) }} /></i>
                </span>
              ))}
              {kalan > 0 ? <small className="istat-kart-daha">+{kalan} kalem daha</small> : null}
            </>}
            kicker="İSTATİSTİK"
            title={grup.baslik}
            description={kapsam}
            boy="orta"
          >
            {grup.satirlar.length ? (
              <ul className="istat-cubuklar istat-pencere">
                {grup.satirlar.map((satir) => (
                  <li key={satir.ad}>
                    <span title={satir.ad}>{satir.ad}</span>
                    <i aria-hidden="true"><b style={{ width: genislik(satir.adet) }} /></i>
                    <strong>{satir.etiket ?? satir.adet}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="talep-bos cari-not">Veri yok.</p>}
          </PanelModal>
        );
      })}
      </div>
    </section>
  );
}

/** "+%23" / "−%5" biçimi; önceki dönem yoksa null. */
export function degisimYazisi(degisim: number | null, donem = "önceki 30 güne göre") {
  return degisim === null ? null : `${donem} ${degisim >= 0 ? "+" : "−"}%${Math.abs(degisim)}`;
}

/** Kuruştan kısa TL: "₺1,2 Mn", "₺480 B". Çubuk etiketleri dar. */
export function kisaPara(kurus: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", notation: "compact", maximumFractionDigits: 1 }).format(kurus / 100);
}

/** Kuruştan kuruşsuz TL: "₺38.000". Sayı kutuları dar; kuruş bilgi taşımıyor. */
export function tamPara(kurus: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(kurus / 100);
}
