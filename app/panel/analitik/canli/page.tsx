import { getPanelContext } from "@/lib/panel-context";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { GenelBakis } from "../../os/genel-bakis";
import { CIHAZ_ADI, sayiYaz, siteleriOku, ulkeAdi } from "../veri";
import { DagilimKarti, KurulumUyarisi, SeciciSeridi, SeritKutusu } from "../parcalar";
import { CanliHarita, type HaritaNoktasi } from "./canli-harita";
import { CanliYenile } from "./yenile";

/*
  ANALİTİK · CANLI (22.10.2026; harita ve düzen aynı gün, kurum
  sahibinin isteğiyle).

  Düzen soru sırasıyla: kaç kişi var (üst şerit) → nereden bağlanıyorlar
  (harita + şehirler) → ne yapıyorlar (akış, açık sayfalar, kaynaklar).
  Eskiden iki büyük sayı ve iki liste vardı; ekranın yarısı boştu ve
  "şu an ne okuyorlar" sorusunun yanıtı yoktu.

  Sayılar analitik_canli'den (20261022100458). Sayfa 15 saniyede bir
  kendini tazeler.
*/
type Canli = {
  suAn: number;
  sonSaat: number;
  sonSaatZiyaretci: number;
  sonSaatForm: number;
  akis: { zaman: string; tur: string; yol: string; kaynak: string; ulke: string | null; sehir: string | null; cihaz: string | null }[];
  aktifSayfalar: { ad: string; adet: number }[];
  kaynaklar: { ad: string; adet: number }[];
  noktalar: HaritaNoktasi[];
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
  const noktalar = canli.noktalar ?? [];

  /* Şehirler haritadaki noktalardan: aynı veri, iki görünüm. */
  const sehirler = [...noktalar].sort((a, b) => b.adet - a.adet).slice(0, 8);
  const sehirToplami = noktalar.reduce((toplam, n) => toplam + n.adet, 0);

  return (
    <GenelBakis gizliBaslik="Analitik · Canlı">
      <CanliYenile />
      <SeciciSeridi siteler={siteler} secili={secili} yol="/panel/analitik/canli" />

      <section className="an-serit" aria-label="Şu an">
        <SeritKutusu canli etiket="Şu an sitede" deger={sayiYaz(canli.suAn)} alt="son 5 dakikada hareket eden" />
        <SeritKutusu etiket="Ziyaretçi" deger={sayiYaz(canli.sonSaatZiyaretci)} alt="son 1 saat" />
        <SeritKutusu etiket="Sayfa görüntüleme" deger={sayiYaz(canli.sonSaat)} alt="son 1 saat" />
        <SeritKutusu etiket="Form gönderimi" deger={sayiYaz(canli.sonSaatForm)} alt="son 1 saat" ton={canli.sonSaatForm ? "success" : undefined} />
      </section>

      <section className="an-canli-ust">
        <article className="dash-card an-harita-kart">
          <header className="dash-card-head"><div><h2>Ziyaretçi haritası</h2><p>Son 1 saat · yeni ziyaret parlak, eskisi soluk</p></div></header>
          <CanliHarita noktalar={noktalar} />
        </article>
        <DagilimKarti baslik="Şehirler" alt="Son 1 saat · yaklaşık konum" bos="Son bir saatte konumlu ziyaret yok." toplam={sehirToplami}
          satirlar={sehirler.map((n) => ({ anahtar: `${n.enlem},${n.boylam}`, ad: <>{n.sehir ?? "Bilinmeyen şehir"} <small>{ulkeAdi(n.ulke)}</small></>, adet: n.adet }))} />
      </section>

      <section className="an-canli-alt">
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
        <DagilimKarti baslik="Şu an açık sayfalar" alt="Son 5 dakika · ziyaretçi" bos="Şu an sitede kimse yok." toplam={canli.suAn}
          satirlar={(canli.aktifSayfalar ?? []).map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.adet }))} />
        <DagilimKarti baslik="Nereden geldiler" alt="Son 1 saat · ziyaretçi" bos="Son bir saatte ziyaret yok." toplam={canli.sonSaatZiyaretci}
          satirlar={(canli.kaynaklar ?? []).map((k) => ({ anahtar: k.ad, ad: k.ad, adet: k.adet }))} />
      </section>
    </GenelBakis>
  );
}
