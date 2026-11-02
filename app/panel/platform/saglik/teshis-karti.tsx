import { VERCEL_GUNLUGU, type Teshis } from "@/lib/hata-teshisi";

/*
  ARIZA KARTI (02.11.2026, lib/hata-teshisi). Bir arızanın "hemen
  anlaşılması" için gereken dört şey tek kutuda: ne zamandır sürüyor,
  ham hata metni (TAM hâliyle — tabloda tek satıra kırpılıyordu),
  muhtemel sebep ve yapılacaklar, ve günlükte nereye bakılacağı.
  Teşhis yoksa yalnızca ham metin: uydurma bir sebep yazılmıyor.
*/
export function TeshisKarti({ baslik, neZamandir, hata, teshis, gunlukYolu }: {
  baslik: string;
  neZamandir: string | null;
  hata: string | null;
  teshis: Teshis | null;
  /** Vercel günlüğünde aranacak yol (ör. /api/cron/posta-esitleme). */
  gunlukYolu?: string | null;
}) {
  return (
    <article className="sy-teshis" data-tur={teshis?.tur ?? "bilinmiyor"}>
      <header>
        <b>{baslik}</b>
        {neZamandir ? <small>{neZamandir}</small> : null}
      </header>
      {hata ? <pre className="sy-teshis-hata">{hata}</pre> : null}
      {teshis ? (
        <>
          <p><b>Muhtemel sebep:</b> {teshis.sebep}</p>
          <ol>{teshis.yapilacak.map((adim) => <li key={adim}>{adim}</li>)}</ol>
        </>
      ) : hata ? <p className="sy-teshis-not">Bu hata tanınan bir türe uymuyor; ayrıntı günlükte.</p> : null}
      {gunlukYolu ? (
        <p className="sy-teshis-not">
          Ayrıntı ve yığın izi: <a href={VERCEL_GUNLUGU} target="_blank" rel="noreferrer">Vercel günlüğü</a> → aramaya <code>{gunlukYolu}</code> yazın.
        </p>
      ) : null}
    </article>
  );
}
