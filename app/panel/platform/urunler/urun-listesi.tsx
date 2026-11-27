import Link from "next/link";
import type { Donem } from "@/lib/konsol/donem";
import type { Olcum, UrunSatiri } from "@/lib/konsol/urun-performansi";
import { OsSimge } from "../../os/os-icons";
import "./urun-listesi.css";

/*
  ÜRÜNLER LİSTESİ (27.11.2026, onaylı mockup).

  Yöneticinin bu ekrandaki işi KARŞILAŞTIRMA: dört ürün aynı dönemde,
  tek bir kompakt tablo yüzeyinde. Eskiden burada yedi sütunlu bir tablo
  (kiracı · ödeyen · kullanıcı · bireysel · aylık · köprü), üstünde dört
  kutuluk bir şerit ve sağda ikinci bir "Köprüler" sütunu vardı; aynı
  bilgi üç yerde tekrar ediyor, göz hangi ürünün yaşadığını üç yüzeyden
  topluyordu.

  Sayılar Ana Sayfa'nın tablosuyla AYNI çekirdekten
  (lib/konsol/urun-performansi): iki ekranda iki farklı sayı çıkmasın.
  Sağlık rozeti ürün adının YANINDA — ayrı bir sütun olduğunda satırın
  iki ucuna bakmak gerekiyordu.

  ÜÇ DURUM BİRBİRİNİN YERİNE GEÇMEZ: sayı (0 da bir sayıdır) ·
  "Veri bağlı değil" · "Veri okunamadı". İkisinde de sıfır basılmaz.
*/

/** Ölçümü yazar; kaynağı olmayanla okunamayanı ayırır. */
function Deger({ olcum, bicim }: { olcum: Olcum<number>; bicim: (n: number) => string }) {
  if (olcum.durum === "kaynak_yok") return <span className="url-yok">Veri bağlı değil</span>;
  if (olcum.durum === "okunamadi") return <span className="url-yok" data-tone="danger">Veri okunamadı</span>;
  return <span className="url-sayi">{bicim(olcum.deger)}</span>;
}

export type UrunListeSatiri = UrunSatiri & {
  /** Ürünün kendi adresi (lib/site/routes); tanımlı değilse sütun boş. */
  adres?: { url: string; host: string };
};

export function UrunListesi({ satirlar, donem, para, sayi, secici }: {
  satirlar: UrunListeSatiri[];
  donem: Donem;
  para: (n: number) => string;
  sayi: (n: number) => string;
  /** Dönem seçici; başlık satırının sağında. */
  secici?: React.ReactNode;
}) {
  return (
    <section className="url-kat">
      <header className="url-bas">
        <h1>Ürünler</h1>
        <div className="url-bas-eylem">{secici}</div>
      </header>

      <article className="url-kart">
        <table className="url-tablo">
          <thead>
            <tr>
              <th scope="col">Ürün</th>
              {/*
                Aktif müşteri ANLIK: dönem seçicisi onu değiştirmiyor, o
                yüzden kapsamı başlıkta yazılı. Tahsilat dönemsel; dönemi
                üstteki seçici söylüyor ve başlıkta tekrar edilmiyor —
                ama erişilebilir ad hücrede dönemi taşıyor.
              */}
              <th scope="col" className="url-sag">Aktif müşteri <small>bugün</small></th>
              <th scope="col" className="url-sag">Tahsilat</th>
              <th scope="col">Bağlantı</th>
              <th scope="col"><span className="url-gizli">Ürün detayı</span></th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => (
              <tr key={s.kod}>
                <th scope="row">
                  <span className="url-ad">{s.ad}</span>
                  {s.saglik ? (
                    <span className="urun-saglik" data-tone={s.saglik.ton} title={s.saglik.not}>{s.saglik.etiket}</span>
                  ) : null}
                </th>
                <td className="url-sag" data-label="Aktif müşteri"><Deger olcum={s.aktifMusteri} bicim={sayi} /></td>
                <td className="url-sag" data-label={`${donem.etiket} tahsilat`}><Deger olcum={s.tahsilat} bicim={para} /></td>
                <td data-label="Bağlantı">
                  {/*
                    Ürünün KENDİ adresi ile konsoldaki detayı iki ayrı iş:
                    biri ürünü yeni sekmede açar, öteki konsolda inceleme
                    ekranına gider. Erişilebilir adları bu farkı yazıyor,
                    yoksa klavyeyle gezen kullanıcı iki bağlantıyı
                    ayırt edemiyordu.
                  */}
                  {s.adres ? (
                    <a className="url-adres" href={s.adres.url} target="_blank" rel="noreferrer"
                      aria-label={`${s.ad} ürününü yeni sekmede aç (${s.adres.host})`}>
                      <OsSimge ad="external" boyut={14} />
                      <span>{s.adres.host}</span>
                    </a>
                  ) : <span className="url-yok">—</span>}
                </td>
                <td className="url-ac">
                  <Link href={`/panel/platform/urunler/${s.kod}`} aria-label={`${s.ad} ürün detayını aç`}>Aç →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          TELEFONDA LİSTE (mevcut kalıp: konsol-urun-performansi.tsx).
          Tabloyu dar ekranda ızgaraya çevirmek bu depoda iki kez denendi
          ve iki kez satır kabın dışına taştı. Ürün adı, sağlık, iki
          metrik ve detaya geçiş yatay kaydırma olmadan okunuyor.
        */}
        <ul className="url-mobil">
          {satirlar.map((s) => (
            <li key={s.kod}>
              <Link href={`/panel/platform/urunler/${s.kod}`} aria-label={`${s.ad} ürün detayını aç`}>
                <span className="url-mobil-bas">
                  <b>{s.ad}</b>
                  {s.saglik ? <span className="urun-saglik" data-tone={s.saglik.ton}>{s.saglik.etiket}</span> : null}
                </span>
                <span className="url-mobil-deger">
                  <span><small>Aktif müşteri</small><Deger olcum={s.aktifMusteri} bicim={sayi} /></span>
                  <span><small>Tahsilat · {donem.etiket}</small><Deger olcum={s.tahsilat} bicim={para} /></span>
                </span>
              </Link>
              {s.adres ? (
                <a className="url-adres url-mobil-adres" href={s.adres.url} target="_blank" rel="noreferrer"
                  aria-label={`${s.ad} ürününü yeni sekmede aç (${s.adres.host})`}>
                  <OsSimge ad="external" boyut={14} />
                  <span>{s.adres.host}</span>
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
