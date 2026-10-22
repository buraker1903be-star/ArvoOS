import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Site } from "./veri";
import { sayiYaz } from "./veri";
import "./analitik.css";

/*
  Analitik ekranlarının ortak parçaları. Dağılım kartı genel bakışın
  liste kartıyla (os/genel-bakis.tsx ListeKarti) aynı kabukta, ama
  satırları bağlantı DEĞİL: "Instagram 42" tıklanacak bir kayıt değil,
  bir pay. Payı satırın arkasındaki soluk dolgu gösteriyor.
*/
export function DagilimKarti({ baslik, alt, bos, satirlar, toplam, ekSutun }: {
  baslik: string;
  alt: string;
  bos: string;
  satirlar: { ad: ReactNode; anahtar: string; adet: number; ek?: ReactNode }[];
  /** Pay hesabının paydası (genelde ziyaretçi). */
  toplam: number;
  /** Sağdaki ikinci sayının başlığı (ör. "Form"). */
  ekSutun?: string;
}) {
  return (
    <article className="dash-card dash-col an-dagilim">
      <header className="dash-card-head"><div><h2>{baslik}</h2><p>{alt}</p></div></header>
      {satirlar.length ? (
        <ul className="an-satirlar">
          {ekSutun ? <li className="an-satir an-satir-baslik" aria-hidden="true"><span /><small>{ekSutun}</small><small>Ziyaret</small></li> : null}
          {satirlar.map((satir) => (
            <li className="an-satir" key={satir.anahtar} style={{ "--pay": toplam ? Math.min(1, Math.max(0.02, satir.adet / toplam)) : 0 } as CSSProperties}>
              <span className="an-satir-ad">{satir.ad}</span>
              {ekSutun ? <small className="an-satir-ek">{satir.ek ?? "—"}</small> : null}
              <b>{sayiYaz(satir.adet)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="dash-empty">{bos}</p>}
    </article>
  );
}

/* Site ve aralık seçimi: hap bağlantılar; sorgu değişkeni korunur. */
export function SeciciSeridi({ siteler, secili, yol, gun, gunler }: {
  siteler: Site[];
  secili: Site;
  yol: string;
  gun?: number;
  gunler?: number[];
}) {
  const adres = (site: string, g?: number) => {
    const p = new URLSearchParams();
    if (siteler.length > 1) p.set("site", site);
    if (g) p.set("gun", String(g));
    const q = p.toString();
    return q ? `${yol}?${q}` : yol;
  };
  return (
    <nav className="an-secici" aria-label="Site ve tarih aralığı">
      {siteler.length > 1 ? (
        <div className="an-hap-grubu" role="group" aria-label="Site">
          {siteler.map((site) => (
            <Link key={site.id} className="an-hap" aria-current={site.id === secili.id ? "true" : undefined} href={adres(site.id, gun)}>{site.ad}</Link>
          ))}
        </div>
      ) : <span className="an-site-adi">{secili.ad} <small>{secili.alan_adi}</small></span>}
      {gunler && gun ? (
        <div className="an-hap-grubu" role="group" aria-label="Tarih aralığı">
          {gunler.map((g) => (
            <Link key={g} className="an-hap" aria-current={g === gun ? "true" : undefined} href={adres(secili.id, g)}>Son {g} gün</Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

/* Kurulum henüz doğrulanmadıysa ya da site yoksa sayfanın yerine geçen kutu. */
export function KurulumUyarisi({ baslik, metin, yonetebilir }: { baslik: string; metin: string; yonetebilir: boolean }) {
  return (
    <section className="an-kurulum-uyari">
      <h2>{baslik}</h2>
      <p>{metin}</p>
      {yonetebilir
        ? <Link className="panel-primary" href="/panel/analitik/kurulum">Kuruluma git</Link>
        : <p className="an-not">Kurulumu kurum sahibi ya da yönetici yapabilir.</p>}
    </section>
  );
}

/*
  ÜST ŞERİT KUTUSU. Genel bakış ve canlı ekran aynı kutuyu kullanıyor.
  Değişim önceki AYNI UZUNLUKTAKİ dönemle; önceki dönem boşsa yüzde
  yazılmıyor (sıfırdan büyümenin yüzdesi yok).
*/
export function SeritKutusu({ deger, etiket, alt, degisimYuzde, ton, canli }: {
  deger: string;
  etiket: string;
  alt?: string;
  degisimYuzde?: number | null;
  ton?: "success";
  canli?: boolean;
}) {
  return (
    <div className={canli ? "an-serit-kutu is-canli" : "an-serit-kutu"} data-tone={ton}>
      {canli ? <span className="an-nabiz" aria-hidden="true" /> : null}
      <small className="an-serit-etiket">{etiket}</small>
      <strong>{deger}</strong>
      {degisimYuzde !== undefined ? (
        degisimYuzde === null
          ? <small className="an-serit-alt">önceki dönemde veri yok</small>
          : <small className="an-serit-alt" data-yon={degisimYuzde > 0 ? "artis" : degisimYuzde < 0 ? "dusus" : undefined}>
              {degisimYuzde > 0 ? "▲" : degisimYuzde < 0 ? "▼" : "•"} %{Math.abs(degisimYuzde)} önceki döneme göre
            </small>
      ) : alt ? <small className="an-serit-alt">{alt}</small> : null}
    </div>
  );
}
