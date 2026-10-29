import type { CSSProperties } from "react";
import { para } from "../bicim";
import "./aylik-grafik.css";

/*
  AYLIK TAHSİLAT GRAFİĞİ (29.10.2026). Tahsilat ekranında yalnızca
  "bu ay" ve "tüm zamanlar" vardı: kurucu gelirin aydan aya nasıl
  gittiğini ve kapıda ne kadar para beklediğini göremiyordu.

  Sayılar platform_tahsilat_aylik işlevinden (migration 20261029152535);
  ekranın son elli satırlık listesinden toplanmıyor — o "son elli kaydın
  içindeki ay" olurdu. Bekleyen = onay bekleyen havale + ödenmemiş,
  süresi geçmemiş proforma; tahsil edilenin ÜSTÜNE yığılıyor, çünkü
  kurucunun sorusu "bu ay ne geldi ve ne gelebilir".

  Tek eksen, iki seri: lejant her zaman var, renk tek başına anlam
  taşımıyor (ipucu ve tablo görünümü sayıyı yazıyor). Değer etiketi her
  çubukta değil, yalnızca bu ayda ve en yüksek ayda.
*/
export type AylikSatir = {
  ay: string; tahsilat: number; tahsilat_adet: number; bekleyen: number; bekleyen_adet: number; proforma: number; proforma_adet: number;
};

const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const ayAdi = (ay: string, yilli = false) => {
  const [yil, a] = ay.split("-");
  return `${AY[Number(a) - 1] ?? a}${yilli ? ` ${yil}` : ""}`;
};
// Eksen için yuvarlak bir üst sınır: 1, 2, 2,5, 5 × 10ⁿ.
function yuvarlakTavan(deger: number) {
  if (deger <= 0) return 1;
  const kuvvet = 10 ** Math.floor(Math.log10(deger));
  return ([1, 2, 2.5, 5, 10].find((c) => c * kuvvet >= deger) ?? 10) * kuvvet;
}
const kisaPara = (kurus: number) => {
  const tl = kurus / 100;
  if (tl >= 1_000_000) return `₺${(tl / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn`;
  if (tl >= 1_000) return `₺${(tl / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} bin`;
  return `₺${tl.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
};

export function AylikGrafik({ satirlar }: { satirlar: AylikSatir[] }) {
  const seri = satirlar.map((s) => ({ ...s, tahsilat: Number(s.tahsilat), bekleyenToplam: Number(s.bekleyen) + Number(s.proforma) }));
  const tavan = yuvarlakTavan(Math.max(0, ...seri.map((s) => s.tahsilat + s.bekleyenToplam)));
  const toplam = seri.reduce((t, s) => t + s.tahsilat, 0);
  const bekleyen = seri.reduce((t, s) => t + s.bekleyenToplam, 0);
  const enYuksek = seri.reduce((e, s, i) => (s.tahsilat > (seri[e]?.tahsilat ?? 0) ? i : e), 0);
  const son = seri.length - 1;
  const ilkAy = seri[0]?.ay;
  /*
    Hiç kayıt yoksa çubuk ızgarası çizilmiyor (29.10.2026, canlıda ilk
    açılış). On iki boş çubuk 170 piksel yer kaplayıp "sıfır" demekten
    başka bir şey söylemiyordu; genel bakış kartlarındaki kuralın aynısı
    (os/genel-bakis → SeriKarti "bos"). Başlık ve toplamlar duruyor.
  */
  const bos = seri.every((s) => !s.tahsilat && !s.bekleyenToplam);

  return (
    <section className="panel-card ag-kart" aria-label="Aylık tahsilat">
      <header className="ag-bas">
        <div>
          <h2>Aylık tahsilat</h2>
          <p>Son {seri.length} ay · Türkiye takvimiyle{ilkAy ? ` · ${ayAdi(ilkAy, true)}'dan beri` : ""}</p>
        </div>
        {bos ? null : (
          <ul className="ag-lejant" aria-label="Lejant">
            <li data-seri="tahsilat">Tahsil edilen</li>
            <li data-seri="bekleyen">Bekleyen (havale + proforma)</li>
          </ul>
        )}
        <dl className="ag-toplam">
          <div><dt>{seri.length} ayda tahsil edilen</dt><dd>{para(toplam)}</dd></div>
          <div><dt>Bekleyen</dt><dd>{bekleyen ? para(bekleyen) : "Yok"}</dd></div>
        </dl>
      </header>

      {bos ? <p className="ag-bos">Son {seri.length} ayda tahsilat, bekleyen havale ya da açık proforma yok. İlk ödeme onaylandığında ya da ilk proforma kesildiğinde grafik burada çizilir.</p> : <>
      <div className="ag-cizim">
        <div className="ag-eksen" aria-hidden="true">
          <span>{kisaPara(tavan)}</span><span>{kisaPara(tavan / 2)}</span><span>0</span>
        </div>
        <ol className="ag-cubuklar">
          {seri.map((s, i) => {
            const etiket = i === son || (i === enYuksek && s.tahsilat > 0);
            const ipucu = [
              `${ayAdi(s.ay, true)}`,
              `Tahsil edilen: ${para(s.tahsilat)} (${s.tahsilat_adet} ödeme)`,
              s.bekleyen_adet ? `Bekleyen havale: ${para(Number(s.bekleyen))} (${s.bekleyen_adet})` : null,
              s.proforma_adet ? `Açık proforma: ${para(Number(s.proforma))} (${s.proforma_adet})` : null,
            ].filter(Boolean) as string[];
            return (
              <li key={s.ay} className={i === son ? "is-bu-ay" : undefined} tabIndex={0} aria-label={ipucu.join(", ")}
                style={{ "--t": `${(s.tahsilat / tavan) * 100}%`, "--b": `${(s.bekleyenToplam / tavan) * 100}%` } as CSSProperties}>
                <span className="ag-yigin">
                  {etiket ? <em className="ag-deger">{kisaPara(s.tahsilat)}</em> : null}
                  {s.bekleyenToplam ? <span className="ag-dilim" data-seri="bekleyen" /> : null}
                  {s.tahsilat ? <span className="ag-dilim" data-seri="tahsilat" /> : <span className="ag-dilim is-bos" />}
                </span>
                <small>{ayAdi(s.ay)}</small>
                <span className="ag-ipucu" role="tooltip">{ipucu.map((satir, j) => (j ? <span key={j}>{satir}</span> : <b key={j}>{satir}</b>))}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <details className="ag-tablo">
        <summary>Tablo olarak göster</summary>
        <div className="talep-tablo fn-ic-tablo">
          <table className="crm-data-table" data-cols="ag-ay">
            <thead><tr><th>Ay</th><th className="crm-col-amount">Tahsil edilen</th><th className="crm-col-amount">Ödeme</th><th className="crm-col-amount">Bekleyen havale</th><th className="crm-col-amount">Açık proforma</th></tr></thead>
            <tbody>
              {[...seri].reverse().map((s) => (
                <tr key={s.ay}>
                  <td data-label="Ay"><span className="crm-table-title">{ayAdi(s.ay, true)}</span></td>
                  <td className="crm-col-amount" data-label="Tahsil edilen">{para(s.tahsilat)}</td>
                  <td className="crm-col-amount" data-label="Ödeme">{s.tahsilat_adet}</td>
                  <td className="crm-col-amount" data-label="Bekleyen havale">{s.bekleyen_adet ? para(Number(s.bekleyen)) : "—"}</td>
                  <td className="crm-col-amount" data-label="Açık proforma">{s.proforma_adet ? para(Number(s.proforma)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      </>}
    </section>
  );
}
