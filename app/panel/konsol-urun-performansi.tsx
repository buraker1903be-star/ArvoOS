import Link from "next/link";
import type { ReactNode } from "react";
import type { Donem } from "@/lib/konsol/donem";
import type { Olcum, OlcutKodu, UrunSatiri } from "@/lib/konsol/urun-performansi";
import "./konsol-urun-performansi.css";

/*
  ÜRÜN PERFORMANSI VE ÖNCELİKLİ İŞLER (26.11.2026, onaylı mockup).

  Kurucunun ilk sorusu "hangi ürün yaşıyor": dört ürün yan yana, aynı
  dönemde. Tablo ürün listesini SATIR OLARAK alıyor (lib/products →
  PRODUCTS); beşinci ürün eklendiğinde buradaki JSX değişmez.

  ÜÇ DURUM AYRI YAZILIR (lib/konsol/urun-performansi):
    var        → sayı (0 da bir sayıdır)
    kaynak_yok → "Veri bağlı değil"
    okunamadi  → "Veri okunamadı"
  İkincisinde ve üçüncüsünde SIFIR BASILMAZ: okunamayan bir sorgudan
  gelen 0, "satış yok" diye okunur.
*/

/** Ölçümü ekrana yazar; kaynağı olmayanla okunamayanı ayırır. */
function Deger({ olcum, bicim }: { olcum: Olcum<number>; bicim: (n: number) => string }) {
  if (olcum.durum === "kaynak_yok") return <span className="kup-yok">Veri bağlı değil</span>;
  if (olcum.durum === "okunamadi") return <span className="kup-yok" data-tone="danger">Veri okunamadı</span>;
  return <>{bicim(olcum.deger)}</>;
}

/** Dönüşüm: payda sıfırsa yüzde yazılmaz, "deneme yok" denir. */
function Donusum({ olcum }: { olcum: UrunSatiri["donusum"] }) {
  if (olcum.durum === "kaynak_yok") return <span className="kup-yok">Veri bağlı değil</span>;
  if (olcum.durum === "okunamadi") return <span className="kup-yok" data-tone="danger">Veri okunamadı</span>;
  const { denemeye, ucretliye, oran } = olcum.deger;
  if (oran === null) return <span className="kup-yok">Dönemde deneme yok</span>;
  /* Oranın payı/paydası BAŞLIKTA, hücrede değil: dar sütunda yan
     sütunun üstüne biniyordu. Sayı tek başına yanıltmasın diye
     title ile okunabiliyor, ürün detayında ise iki adım açıkça yazılı. */
  return (
    <span className="kup-oran" title={`${ucretliye}/${denemeye} abone`}>
      %{Math.round(oran * 100)}
    </span>
  );
}

export { DonemSecici } from "./konsol-donem-secici";

export function UrunPerformansiKarti({ satirlar, donem, olcut = "musteri", para, sayi, secici, olcutSecici }: {
  satirlar: UrunSatiri[];
  donem: Donem;
  /** Dar kartta gösterilecek tek ölçüt; geniş kartta üçü de çizilir. */
  olcut?: OlcutKodu;
  para: (n: number) => string;
  sayi: (n: number) => string;
  secici?: ReactNode;
  olcutSecici?: ReactNode;
}) {
  return (
    <article className="dash-card dash-col kup-kart">
      <header className="dash-card-head">
        <div>
          <h2>Ürün performansı</h2>
          <p>{donem.etiket} · aktif müşteri, deneme dönüşümü ve tahsilat</p>
        </div>
        <div className="kup-secici">{olcutSecici}{secici}</div>
      </header>
      <div className="dash-col-govde kup-govde">
        <table className="crm-data-table kup-tablo" data-olcut={olcut}>
          <thead>
            <tr>
              <th scope="col">Ürün</th>
              <th scope="col" data-olcut="musteri">Aktif müşteri</th>
              <th scope="col" data-olcut="donusum">Denemeden ücretliye</th>
              <th scope="col" data-olcut="tahsilat">{donem.etiket} tahsilat</th>
              <th scope="col"><span className="kup-gizli">Aç</span></th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => (
              <tr key={s.kod}>
                <th scope="row">{s.ad}</th>
                <td data-olcut="musteri" data-label="Aktif müşteri"><Deger olcum={s.aktifMusteri} bicim={sayi} /></td>
                <td data-olcut="donusum" data-label="Denemeden ücretliye"><Donusum olcum={s.donusum} /></td>
                <td data-olcut="tahsilat" data-label={`${donem.etiket} tahsilat`}><Deger olcum={s.tahsilat} bicim={para} /></td>
                <td className="kup-ac">
                  <Link href={`/panel/platform/urunler/${s.kod}`}>Aç</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/*
          DAR KARTTA KOMPAKT LİSTE. Tabloyu dar kartta ızgaraya çevirmek
          iki kez denendi ve iki kez satır kabın dışına taştı (seçili
          hücre 390 px'lik ekranda x=565'te çiziliyordu). Depoda zaten
          olan kalıp kullanılıyor: dar ekranda tablo gizlenir, aynı veri
          listeyle çizilir (crm/table-cells MobilSatir'ın yaptığı gibi).
          Yatay kaydırma yok; hangi ölçütün yazılacağını seçici söyler.
        */}
        <ul className="kup-mobil">
          {satirlar.map((s) => (
            <li key={s.kod}>
              <Link href={`/panel/platform/urunler/${s.kod}`}>
                <span className="kup-mobil-ad">{s.ad}</span>
                <span className="kup-mobil-deger">
                  {olcut === "donusum" ? <Donusum olcum={s.donusum} />
                    : olcut === "tahsilat" ? <Deger olcum={s.tahsilat} bicim={para} />
                    : <Deger olcum={s.aktifMusteri} bicim={sayi} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Link className="dash-card-link" href="/panel/platform/urunler">Ürünler</Link>
    </article>
  );
}

export type { OncelikliIs } from "./konsol-oncelikli-is";
export { OncelikliIslerKarti } from "./konsol-oncelikli-is";
