import Link from "next/link";
import { RaporPencereKabugu } from "./rapor-pencere-kabugu";
import { PrintReportButton } from "./print-report-button";
import { Icon } from "./rapor-parcalari";
import { kapatmaAdresi, raporAdresi, type RaporTanimi } from "@/lib/rapor-tanimlari";
import { istanbulDateTime } from "@/lib/istanbul-date";

/*
  RAPOR PENCERESİNİN ÇERÇEVESİ (2026-10-24).

  Sekiz raporun hepsi aynı çerçeveyi kullanıyor: künye, dönem, dışa
  aktarma, yazdırma, kapatma ve raporlar arası geçiş. Her rapora
  kopyalansaydı biri "Kapat" düğmesini unutur, öteki dönemi
  göstermezdi — ve ikisi de hata vermezdi.

  Çerçeve SUNUCU bileşeni; istemci tarafı yalnızca klavye ve odak
  (rapor-pencere-kabugu). Gövde de sunucuda çiziliyor, yani rapor
  sorguları RLS'li oturum istemcisiyle kalıyor.

  KÜNYE YAZDIRMA İÇİN VAR ve ekranda da duruyor: kâğıda basılan bir
  rapor "hangi marka, hangi rapor, hangi dönem, ne zaman alındı"
  sorularını kendi başına yanıtlamalı. Ekranda gizleyip yalnızca
  baskıda göstermek, kullanıcının çıktıda ne göreceğini bilmemesi
  demekti.

  KÜNYEDEKİ AD MARKA ADIDIR, ticari unvan değil: bu panel içi bir
  yönetim evrakı ve yöneticinin görmesi gereken şey hangi MARKANIN
  rakamlarına baktığı. Ticari unvan teklif/sözleşme gibi YASAL
  belgelerde basılmaya devam ediyor (lib/kurum-adi).
*/
export function RaporPenceresi({
  rapor,
  donemEtiket,
  taban,
  params,
  kurum,
  komsular,
  indirmeAdresi,
  children,
}: {
  rapor: RaporTanimi;
  donemEtiket: string;
  taban: string;
  params: Record<string, string | undefined>;
  /** Markanın adı (ticari unvan değil). */
  kurum: string;
  /** Kullanıcının açabildiği öteki raporlar; pencereden pencereye geçiş. */
  komsular: RaporTanimi[];
  /** Excel adresi; yetkisi yoksa verilmiyor ve düğme hiç çizilmiyor. */
  indirmeAdresi?: string;
  children: React.ReactNode;
}) {
  const basligiId = `rapor-baslik-${rapor.anahtar}`;
  const kapat = kapatmaAdresi(taban, params);
  const digerleri = komsular.filter((k) => k.anahtar !== rapor.anahtar);

  return (
    <RaporPencereKabugu kapatmaAdresi={kapat} basliklendiren={basligiId}>
      <header className="rapor-pencere-bas">
        <div className="rapor-pencere-kimlik">
          <span className="rapor-pencere-ikon" data-tone="brand" aria-hidden="true">
            <Icon name={rapor.ikon} size={20} />
          </span>
          <div>
            <small className="panel-kicker">{rapor.kod}</small>
            <h2 id={basligiId}>{rapor.baslik}</h2>
            <p>{rapor.aciklama}</p>
          </div>
        </div>
        <div className="rapor-pencere-eylem">
          <span className="status-pill" data-tone="gold">{donemEtiket}</span>
          {indirmeAdresi ? (
            /* Dışa aktarma bir GEZİNME: sunucu dosyayı üretip indiriyor.
               İstemcide üretmek, raporun sayılarını ikinci bir yerde
               yeniden hesaplamak olurdu — ekranla çıktının ayrışması
               için en kısa yol. */
            <a className="panel-secondary rapor-indir" href={indirmeAdresi} download>
              <Icon name="indir" size={16} />
              <span>Excel</span>
            </a>
          ) : null}
          <PrintReportButton />
          <Link className="rapor-pencere-kapat" href={kapat} aria-label="Raporu kapat">×</Link>
        </div>
      </header>

      {/* Künye yalnızca baskıda genişliyor; ekranda tek satır. */}
      <p className="rapor-kunye">
        <b>{kurum}</b>
        <span>{rapor.kod} · {rapor.baslik}</span>
        <span>Dönem: {donemEtiket}</span>
        <span>Alındığı an: {istanbulDateTime(new Date(), { dateStyle: "short", timeStyle: "short" })}</span>
      </p>

      <div className="rapor-pencere-govde">{children}</div>

      {digerleri.length ? (
        <nav className="rapor-gecis" aria-label="Diğer raporlar">
          <span className="rapor-gecis-etiket">Diğer raporlar</span>
          <div className="rapor-gecis-liste">
            {digerleri.map((komsu) => (
              /* Dönem ve süzgeçler adreste taşınıyor (raporAdresi):
                 kullanıcı "bu ay" seçtiyse öteki rapor da bu ayı
                 açıyor. Pencereyi kapatıp yeniden seçmek, aynı dönemi
                 ikinci kez kurmasını istemek olurdu. */
              <Link key={komsu.anahtar} href={raporAdresi(taban, komsu.anahtar, params)}>
                <Icon name={komsu.ikon} size={15} />
                <span>{komsu.baslik}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </RaporPencereKabugu>
  );
}
