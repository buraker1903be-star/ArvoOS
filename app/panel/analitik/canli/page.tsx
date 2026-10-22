import { getPanelContext } from "@/lib/panel-context";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { GenelBakis, ListeIzgarasi } from "../../os/genel-bakis";
import { CIHAZ_ADI, sayiYaz, siteleriOku, ulkeAdi } from "../veri";
import { DagilimKarti, KurulumUyarisi, SeciciSeridi } from "../parcalar";
import { CanliYenile } from "./yenile";

/*
  ANALİTİK · CANLI. "Şu an" son beş dakikada olayı olan ayrı
  ziyaretçi; akış son 30 dakikanın en fazla 50 olayı (analitik_canli).
  Sayfa 15 saniyede bir kendini tazeler.
*/
type Canli = {
  suAn: number;
  sonSaat: number;
  akis: { zaman: string; tur: string; yol: string; kaynak: string; ulke: string | null; sehir: string | null; cihaz: string | null }[];
  noktalar: { enlem: number; boylam: number; sehir: string | null; adet: number }[];
};

export default async function AnalitikCanli({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const sorgu = await searchParams;
  const { izin } = await getPanelContext();
  const { supabase, siteler, secili } = await siteleriOku(sorgu.site);
  if (!secili) {
    return (
      <GenelBakis gizliBaslik="Analitik · Canlı">
        <KurulumUyarisi baslik="Henüz takip edilen site yok" yonetebilir={izin("analitik.yonet")}
          metin="Canlı ekran, sitenize takip kodu eklendikten sonra çalışır." />
      </GenelBakis>
    );
  }

  const { data, error } = await supabase.rpc("analitik_canli", { p_site: secili.id });
  if (error) throw new Error("Canlı veriler okunamadı: " + error.message);
  const canli = data as Canli;

  /* Şehir listesi noktalardan: harita yerine (ilk sürüm) son bir saatin yerleri. */
  const sehirler = [...canli.noktalar].sort((a, b) => b.adet - a.adet).slice(0, 10);
  const toplamNokta = sehirler.reduce((t, n) => t + n.adet, 0);

  return (
    <GenelBakis gizliBaslik="Analitik · Canlı">
      <CanliYenile />
      <SeciciSeridi siteler={siteler} secili={secili} yol="/panel/analitik/canli" />
      <section className="an-canli-sayilar" aria-label="Şu an">
        <div className="an-canli-kutu is-canli">
          <span className="an-nabiz" aria-hidden="true" />
          <strong>{sayiYaz(canli.suAn)}</strong>
          <small>şu an sitede (son 5 dakika)</small>
        </div>
        <div className="an-canli-kutu">
          <strong>{sayiYaz(canli.sonSaat)}</strong>
          <small>sayfa görüntüleme · son 1 saat</small>
        </div>
      </section>
      <ListeIzgarasi etiket="Canlı akış">
        <article className="dash-card dash-col an-akis">
          <header className="dash-card-head"><div><h2>Son hareketler</h2><p>Son 30 dakika · 15 saniyede bir yenilenir</p></div></header>
          {canli.akis.length ? (
            <ul className="an-akis-liste">
              {canli.akis.map((olay, sira) => (
                <li key={`${olay.zaman}-${sira}`} data-tur={olay.tur}>
                  <time dateTime={olay.zaman}>{istanbulDateTime(olay.zaman, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                  <span className="an-akis-ana">
                    <b>{olay.tur === "form" ? "Form gönderdi" : <code>{olay.yol}</code>}</b>
                    <small>{[olay.kaynak, olay.sehir ?? (olay.ulke ? ulkeAdi(olay.ulke) : null), olay.cihaz ? CIHAZ_ADI[olay.cihaz] : null].filter(Boolean).join(" · ")}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="dash-empty">Son 30 dakikada ziyaret yok.</p>}
        </article>
        <DagilimKarti baslik="Neredeler" alt="Son 1 saat · yaklaşık konum" bos="Son bir saatte konumlu ziyaret yok." toplam={toplamNokta}
          satirlar={sehirler.map((n) => ({ anahtar: `${n.enlem},${n.boylam}`, ad: n.sehir ?? "Bilinmeyen şehir", adet: n.adet }))} />
      </ListeIzgarasi>
    </GenelBakis>
  );
}
