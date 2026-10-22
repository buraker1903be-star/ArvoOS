import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { kaynakAdi } from "@/lib/analitik-olay";
import { analitikSerisi, degisim, gunEkle, type GunSatiri } from "@/lib/analitik-seri";
import { GenelBakis } from "../os/genel-bakis";
import { CIHAZ_ADI, sayiYaz, siteleriOku, ulkeAdi, yuzde } from "./veri";
import { DagilimKarti, KurulumUyarisi, SeciciSeridi, SeritKutusu } from "./parcalar";
import { CihazSeridi, TrendGrafigi } from "./trend";

/*
  ANALİTİK · GENEL BAKIŞ. Bütün sayılar analitik_ozet'ten
  (20261022092820); sayfa ham olay okumuyor.

  DÜZEN (22.10.2026, canlı ekranla aynı dil — kurum sahibinin isteği):
  beş sayılık şerit → trend → nereden geldiler (kaynak, ülke, şehir) →
  ne yaptılar (sayfalar, giriş, kampanya) → nasıl geldiler (cihaz,
  tarayıcı, form sayfaları). Eskiden genel bakış şablonunun 14 çubukluk
  grafiği kullanılıyordu; 30 gün seçilince çubuklar iki satıra taşıp
  kartların üstüne biniyordu.

  İKİ ÇAĞRI: biri seçili pencere (listeler), biri iki katı (trend ve
  "önceki döneme göre"). Tek çağrıyla iki katı okuyup listeleri bellekte
  süzmek, listeleri önceki dönemle karıştırırdı.

  "ZİYARETÇİ" GÜNLÜK TEKİLLERİN TOPLAMI: karma her gün değişiyor (kişisel
  veri tutulmuyor), aynı kişinin iki gün gelmesi iki sayılır.
*/
type Ozet = {
  ziyaretci: number; sayfa: number; form: number; formZiyaretci: number; tekSayfa: number;
  gunluk: GunSatiri[];
  sayfalar: { ad: string; sayfa: number; ziyaretci: number }[];
  girisSayfalari: { ad: string; adet: number }[];
  kaynaklar: { ad: string; adet: number; form: number }[];
  kampanyalar: { ad: string; kaynak: string; adet: number }[];
  ulkeler: { ad: string; adet: number }[];
  sehirler: { ad: string; ulke: string | null; adet: number }[];
  cihazlar: { ad: string; adet: number }[];
  tarayicilar: { ad: string; adet: number }[];
  formSayfalari: { ad: string; adet: number }[];
};

const GUNLER = [7, 14, 30];

export default async function AnalitikGenelBakis({ searchParams }: { searchParams: Promise<{ site?: string; gun?: string }> }) {
  const sorgu = await searchParams;
  const { izin } = await getPanelContext();
  const { supabase, siteler, secili } = await siteleriOku(sorgu.site);
  const yonetebilir = izin("analitik.yonet");

  if (!secili) {
    return (
      <GenelBakis gizliBaslik="Analitik">
        <KurulumUyarisi baslik="Henüz takip edilen site yok" yonetebilir={yonetebilir}
          metin="Sitenizi ekleyin, size verilen tek satırlık kodu sitenize yapıştırın; ziyaretçiler birkaç dakika içinde burada görünmeye başlar." />
      </GenelBakis>
    );
  }

  const gun = GUNLER.includes(Number(sorgu.gun)) ? Number(sorgu.gun) : 14;
  const bugun = todayInIstanbul();
  const [pencere, cift] = await Promise.all([
    supabase.rpc("analitik_ozet", { p_site: secili.id, p_bas: gunEkle(bugun, -(gun - 1)), p_bit: bugun }),
    supabase.rpc("analitik_ozet", { p_site: secili.id, p_bas: gunEkle(bugun, -(2 * gun - 1)), p_bit: bugun }),
  ]);
  if (pencere.error) throw new Error("Analitik özeti okunamadı: " + pencere.error.message);
  if (cift.error) throw new Error("Analitik grafiği okunamadı: " + cift.error.message);
  const ozet = pencere.data as Ozet;
  const { gunler, onceki, enCok } = analitikSerisi((cift.data as Ozet).gunluk, bugun, gun);
  const sayfaBasina = ozet.ziyaretci ? (ozet.sayfa / ozet.ziyaretci).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—";

  return (
    <GenelBakis gizliBaslik="Analitik · Genel bakış">
      <SeciciSeridi siteler={siteler} secili={secili} yol="/panel/analitik" gun={gun} gunler={GUNLER} />
      {!secili.ilk_olay_at ? (
        <KurulumUyarisi baslik="Takip kodundan henüz veri gelmedi" yonetebilir={yonetebilir}
          metin={`${secili.alan_adi} için kod sitenize eklendiyse sitenizi bir kez açın; ilk ziyaret birkaç saniye içinde görünür. Eklenmediyse Kurulum sayfasındaki adımları izleyin.`} />
      ) : null}

      <section className="an-serit an-serit--bes" aria-label={`Son ${gun} gün`}>
        <SeritKutusu etiket="Ziyaretçi" deger={sayiYaz(ozet.ziyaretci)} degisimYuzde={degisim(ozet.ziyaretci, onceki.ziyaretci)} />
        <SeritKutusu etiket="Sayfa görüntüleme" deger={sayiYaz(ozet.sayfa)} degisimYuzde={degisim(ozet.sayfa, onceki.sayfa)} />
        <SeritKutusu etiket="Form gönderimi" deger={sayiYaz(ozet.form)} degisimYuzde={degisim(ozet.form, onceki.form)} ton={ozet.form ? "success" : undefined} />
        <SeritKutusu etiket="Dönüşüm oranı" deger={yuzde(ozet.formZiyaretci, ozet.ziyaretci)} alt="formu dolduran ziyaretçi" />
        <SeritKutusu etiket="Ziyaret başına sayfa" deger={sayfaBasina} alt={`tek sayfada çıkan ${yuzde(ozet.tekSayfa, ozet.ziyaretci)}`} />
      </section>

      <article className="dash-card an-trend-kart">
        <header className="dash-card-head">
          <div><h2>Günlük ziyaretçi</h2><p>Son {gun} gün · günlük tekil ziyaretçi · yeşil nokta: form gönderilen gün</p></div>
        </header>
        <TrendGrafigi gunler={gunler} enCok={enCok} />
      </article>

      <section className="an-izgara an-izgara--genis-ilk" aria-label="Ziyaretçiler nereden geldi">
        <DagilimKarti baslik="Kaynaklar" alt="Ziyaretçi nereden geldi · formu dolduran" bos="Bu aralıkta ziyaret yok." toplam={ozet.ziyaretci} ekSutun="Form"
          satirlar={ozet.kaynaklar.map((k) => ({ anahtar: k.ad, ad: k.ad, adet: k.adet, ek: k.form ? `${sayiYaz(k.form)} · ${yuzde(k.form, k.adet)}` : undefined }))} />
        <DagilimKarti baslik="Ülkeler" alt="Ziyaretçinin bağlandığı ülke" bos="Konum bilgisi yok." toplam={ozet.ziyaretci}
          satirlar={ozet.ulkeler.map((u) => ({ anahtar: u.ad, ad: ulkeAdi(u.ad), adet: u.adet }))} />
        <DagilimKarti baslik="Şehirler" alt="Yaklaşık konum" bos="Konum bilgisi yok." toplam={ozet.ziyaretci}
          satirlar={ozet.sehirler.map((s) => ({ anahtar: `${s.ad}|${s.ulke}`, ad: <>{s.ad} <small>{ulkeAdi(s.ulke)}</small></>, adet: s.adet }))} />
      </section>

      <section className="an-izgara" aria-label="Ne yaptılar">
        <DagilimKarti baslik="En çok bakılan sayfalar" alt="Sayfa görüntüleme" bos="Bu aralıkta ziyaret yok." toplam={ozet.sayfa}
          satirlar={ozet.sayfalar.map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.sayfa }))} />
        <DagilimKarti baslik="Giriş sayfaları" alt="Ziyaretçinin ilk açtığı sayfa" bos="Bu aralıkta ziyaret yok." toplam={ozet.ziyaretci}
          satirlar={ozet.girisSayfalari.map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.adet }))} />
        <DagilimKarti baslik="Kampanyalar" alt="utm_campaign ile işaretli bağlantılar" toplam={ozet.ziyaretci}
          bos="Kampanya bağlantısıyla gelen yok. Paylaştığınız bağlantının sonuna ?utm_source=instagram&utm_campaign=kampanya-adi ekleyin."
          satirlar={ozet.kampanyalar.map((k) => ({ anahtar: `${k.ad}|${k.kaynak}`, ad: <>{k.ad} <small>{kaynakAdi(k.kaynak)}</small></>, adet: k.adet }))} />
      </section>

      <section className="an-izgara" aria-label="Nasıl geldiler">
        <article className="dash-card dash-col an-dagilim">
          <header className="dash-card-head"><div><h2>Cihazlar</h2><p>Ziyaretçinin kullandığı</p></div></header>
          {ozet.cihazlar.length ? <CihazSeridi cihazlar={ozet.cihazlar} adlar={CIHAZ_ADI} /> : <p className="dash-empty">Bu aralıkta ziyaret yok.</p>}
        </article>
        <DagilimKarti baslik="Tarayıcılar" alt="Uygulama içi tarayıcılar ayrı" bos="Bu aralıkta ziyaret yok." toplam={ozet.ziyaretci}
          satirlar={ozet.tarayicilar.map((t) => ({ anahtar: t.ad, ad: t.ad, adet: t.adet }))} />
        <DagilimKarti baslik="Form gönderilen sayfalar" alt="Dönüşüm" bos="Bu aralıkta form gönderilmedi." toplam={ozet.form}
          satirlar={ozet.formSayfalari.map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.adet }))} />
      </section>
    </GenelBakis>
  );
}
