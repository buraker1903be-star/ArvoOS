import type { CSSProperties } from "react";
import { etiketliMi, type GunSatiri } from "@/lib/analitik-seri";
import { sayiYaz } from "./veri";

/*
  ANALİTİK TREND GRAFİĞİ (22.10.2026).

  Genel bakış şablonunun SeriKarti'si 14 çubuk için yazılmış: 30 gün
  seçilince çubuklar iki satıra taşıp alttaki kartların üstüne
  biniyordu (kurum sahibinin ekran görüntüsü). Bu grafik sütun sayısını
  gün sayısından alıyor, her aralıkta TEK satır; etiketler seyreltiliyor
  (7 günde her gün, 30 günde beşte bir; bugün her zaman yazılı).

  Çubuk ziyaretçi; form gönderilen günün çubuğunun üstünde yeşil nokta.
  İpucunda o günün üç sayısı.
*/
const GUN_ADI = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "short" });
const UZUN_AD = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const tarih = (gun: string) => new Date(`${gun}T00:00:00Z`);

export function TrendGrafigi({ gunler, enCok }: { gunler: GunSatiri[]; enCok: number }) {
  const bos = gunler.every((g) => !g.ziyaretci && !g.form);
  if (bos) return <p className="an-trend-bos">Bu aralıkta ziyaret yok.</p>;
  /* Üç yatay kılavuz: 0, yarı, tepe. Tepe yuvarlak bir sayı olsun. */
  const tepe = enCok <= 5 ? enCok : Math.ceil(enCok / 5) * 5;
  return (
    <div className="an-trend" style={{ "--gun": gunler.length } as CSSProperties}>
      <div className="an-trend-eksen" aria-hidden="true">
        <span>{sayiYaz(tepe)}</span>
        <span>{tepe > 1 ? sayiYaz(Math.round(tepe / 2)) : ""}</span>
        <span>0</span>
      </div>
      <ol className="an-trend-cubuklar" aria-label="Günlük ziyaretçi">
        {gunler.map((g, sira) => {
          const bugun = sira === gunler.length - 1;
          return (
            <li key={g.gun} className={bugun ? "is-bugun" : undefined}
              title={`${UZUN_AD.format(tarih(g.gun))}\n${sayiYaz(g.ziyaretci)} ziyaretçi · ${sayiYaz(g.sayfa)} sayfa · ${sayiYaz(g.form)} form`}>
              <span className="an-trend-alan">
                <span className="an-trend-cubuk" data-bos={g.ziyaretci ? undefined : ""} style={{ "--h": `${(g.ziyaretci / tepe) * 100}%` } as CSSProperties}>
                  {g.form ? <i className="an-trend-form" aria-label={`${g.form} form`} /> : null}
                </span>
              </span>
              <small aria-hidden={!etiketliMi(sira, gunler.length)}>{etiketliMi(sira, gunler.length) ? (bugun ? "Bugün" : GUN_ADI.format(tarih(g.gun))) : ""}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* Cihaz dağılımı: tek yatay şerit + yüzdeli açıklama. Üç değerli bir pay için liste fazla. */
export function CihazSeridi({ cihazlar, adlar }: { cihazlar: { ad: string; adet: number }[]; adlar: Record<string, string> }) {
  const toplam = cihazlar.reduce((t, c) => t + c.adet, 0);
  if (!toplam) return null;
  return (
    <div className="an-cihaz">
      <div className="an-cihaz-serit" role="img" aria-label={cihazlar.map((c) => `${adlar[c.ad] ?? c.ad} %${Math.round((c.adet / toplam) * 100)}`).join(", ")}>
        {cihazlar.map((c) => <span key={c.ad} data-cihaz={c.ad} style={{ flexGrow: c.adet }} />)}
      </div>
      <ul className="an-cihaz-aciklama">
        {cihazlar.map((c) => (
          <li key={c.ad} data-cihaz={c.ad}><i aria-hidden="true" />{adlar[c.ad] ?? c.ad} <b>%{Math.round((c.adet / toplam) * 100)}</b> <small>{sayiYaz(c.adet)}</small></li>
        ))}
      </ul>
    </div>
  );
}
