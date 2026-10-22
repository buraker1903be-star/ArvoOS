import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { gunlukSeriDilimler } from "@/lib/gunluk-seri";
import { kaynakAdi } from "@/lib/analitik-olay";
import { GenelBakis, ListeIzgarasi, SeriKarti, simdi } from "../os/genel-bakis";
import { CIHAZ_ADI, sayiYaz, siteleriOku, ulkeAdi, yuzde } from "./veri";
import { DagilimKarti, KurulumUyarisi, SeciciSeridi } from "./parcalar";

/*
  ANALİTİK · GENEL BAKIŞ. Bütün sayılar analitik_ozet'ten
  (20261022092820); sayfa ham olay okumuyor.

  İKİ ÇAĞRI: biri seçili pencere (listeler), biri iki katı (grafiğin
  "önceki döneme göre" kıyası). Tek çağrıyla iki katı okuyup listeleri
  bellekte süzmek, listeleri önceki dönemle karıştırırdı.

  "ZİYARETÇİ" GÜNLÜK TEKİLLERİN TOPLAMI: karma her gün değişiyor (kişisel
  veri tutulmuyor), aynı kişinin iki gün gelmesi iki sayılır. Kart
  altında yazıyor.
*/
type Ozet = {
  ziyaretci: number; sayfa: number; form: number; formZiyaretci: number; tekSayfa: number;
  gunluk: { gun: string; ziyaretci: number; sayfa: number; form: number }[];
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
const gunEkle = (gun: string, n: number) => new Date(Date.parse(`${gun}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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
  const seri = gunlukSeriDilimler((cift.data as Ozet).gunluk.map((g) => ({ gun: g.gun, adet: g.ziyaretci })), simdi(), gun);

  return (
    <GenelBakis gizliBaslik="Analitik · Genel bakış">
      <SeciciSeridi siteler={siteler} secili={secili} yol="/panel/analitik" gun={gun} gunler={GUNLER} />
      {!secili.ilk_olay_at ? (
        <KurulumUyarisi baslik="Takip kodundan henüz veri gelmedi" yonetebilir={yonetebilir}
          metin={`${secili.alan_adi} için kod sitenize eklendiyse sitenizi bir kez açın; ilk ziyaret birkaç saniye içinde görünür. Eklenmediyse Kurulum sayfasındaki adımları izleyin.`} />
      ) : null}
      <SeriKarti
        baslik="Ziyaretçi"
        alt={`Son ${gun} gün · günlük tekil ziyaretçilerin toplamı`}
        seri={seri}
        adet="ziyaretçi"
        birim={sayiYaz}
        bos="Bu aralıkta ziyaret yok."
        ozet={[
          { ad: "Sayfa görüntüleme", deger: sayiYaz(ozet.sayfa) },
          { ad: "Form gönderimi", deger: sayiYaz(ozet.form), ton: ozet.form ? "success" : undefined },
          { ad: "Dönüşüm oranı", deger: yuzde(ozet.formZiyaretci, ozet.ziyaretci) },
          { ad: "Tek sayfada çıkan", deger: yuzde(ozet.tekSayfa, ozet.ziyaretci) },
        ]}
      />
      <ListeIzgarasi etiket="Ziyaretçiler nereden geliyor">
        <DagilimKarti baslik="Kaynaklar" alt="Ziyaretçi nereden geldi · formu dolduran" bos="Bu aralıkta ziyaret yok." toplam={ozet.ziyaretci} ekSutun="Form"
          satirlar={ozet.kaynaklar.map((k) => ({ anahtar: k.ad, ad: k.ad, adet: k.adet, ek: k.form ? sayiYaz(k.form) : undefined }))} />
        <DagilimKarti baslik="Kampanyalar" alt="utm_campaign ile işaretli bağlantılar" toplam={ozet.ziyaretci}
          bos="Kampanya bağlantısı ile gelen yok. Paylaşım bağlantınıza ?utm_source=instagram&utm_campaign=ad ekleyin."
          satirlar={ozet.kampanyalar.map((k) => ({ anahtar: `${k.ad}|${k.kaynak}`, ad: <>{k.ad} <small>{kaynakAdi(k.kaynak)}</small></>, adet: k.adet }))} />
        <DagilimKarti baslik="Ülkeler" alt="Ziyaretçinin bağlandığı ülke" bos="Konum bilgisi yok." toplam={ozet.ziyaretci}
          satirlar={ozet.ulkeler.map((u) => ({ anahtar: u.ad, ad: ulkeAdi(u.ad), adet: u.adet }))} />
        <DagilimKarti baslik="Şehirler" alt="Yaklaşık konum" bos="Konum bilgisi yok." toplam={ozet.ziyaretci}
          satirlar={ozet.sehirler.map((s) => ({ anahtar: `${s.ad}|${s.ulke}`, ad: <>{s.ad} <small>{ulkeAdi(s.ulke)}</small></>, adet: s.adet }))} />
      </ListeIzgarasi>
      <ListeIzgarasi etiket="Ne yaptılar">
        <DagilimKarti baslik="En çok bakılan sayfalar" alt="Sayfa görüntüleme" bos="Bu aralıkta ziyaret yok." toplam={ozet.sayfa}
          satirlar={ozet.sayfalar.map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.sayfa }))} />
        <DagilimKarti baslik="Giriş sayfaları" alt="Ziyaretçinin ilk açtığı sayfa" bos="Bu aralıkta ziyaret yok." toplam={ozet.ziyaretci}
          satirlar={ozet.girisSayfalari.map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.adet }))} />
        <DagilimKarti baslik="Form gönderilen sayfalar" alt="Dönüşüm" bos="Bu aralıkta form gönderilmedi." toplam={ozet.form}
          satirlar={ozet.formSayfalari.map((s) => ({ anahtar: s.ad, ad: <code>{s.ad}</code>, adet: s.adet }))} />
        <DagilimKarti baslik="Cihaz ve tarayıcı" alt="Ziyaretçinin kullandığı" bos="Bu aralıkta ziyaret yok." toplam={ozet.ziyaretci}
          satirlar={[
            ...ozet.cihazlar.map((c) => ({ anahtar: `c-${c.ad}`, ad: CIHAZ_ADI[c.ad] ?? c.ad, adet: c.adet })),
            ...ozet.tarayicilar.slice(0, 4).map((t) => ({ anahtar: `t-${t.ad}`, ad: <small>{t.ad}</small>, adet: t.adet })),
          ]} />
      </ListeIzgarasi>
    </GenelBakis>
  );
}
