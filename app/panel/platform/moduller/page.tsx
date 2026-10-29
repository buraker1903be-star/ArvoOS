import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, productLicenseLabels } from "@/lib/products";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import { LISANS_TONU } from "../bicim";
import { Matris } from "./matris";
import { kurumTuru, musteriMi } from "@/lib/kurum-turu";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

/*
  Çapraz modül matrisi: hangi modül hangi kiracıda açık.

  Kiracı dosyasındaki matris tek kurumu anlatıyor. "ArvoLAB'ı kaç kurum
  kullanıyor", "kimlerin Randevu'su donmuş", "kaç kiracı bağımsız modda"
  sorularının yanıtı hiçbir ekranda yoktu; öğrenmenin yolu kiracıları tek
  tek açmaktı.

  Tablo okunur, düzenlenemez. İşlem kiracı dosyasında yapılıyor: aynı
  kuralı iki yerde uygulamak, birinin sapması demek — bunu bugün
  billing_invoices ve billing_subscriptions ile yaşadık.
*/

export const dynamic = "force-dynamic";

// Çekirdek lisansta "Donduruldu", ek üründe "Askıda" yazıyordu; aynı
// tabloda iki ad, aynı durumun iki ayrı şey olduğunu düşündürüyor.
const DURUM_ADI = productLicenseLabels;

// Modülü açık sayan durumlar: ödeme gecikse de kullanıcı hâlâ içeride.
const ACIK_DURUMLAR = new Set(["active", "trialing", "past_due"]);

/*
  Matris hücresinde KISA ad. Tam adlar ("Ödeme gecikmiş") dört sütunda
  tabloyu yatay kaydırma gerektiren bir şeride çeviriyordu; sorulan soru
  ise "hangi hücre yeşil değil". Karşılıkları tablonun altındaki şeritte.
*/
const KISA_ADI: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Gecikmiş",
  suspended: "Askıda", canceled: "İptal", inactive: "Kapalı",
};

/* grup_markasi ZORUNLU: kurumTuru onu isteğe bağlı alıyor ve seçilmediğinde
   grup markasını sessizce "müşteri" sayıyor — kart 14.10.2026'da tam bu
   yüzden "Grup markası 0" dedi (sorgu sütunu hiç istemiyordu). */
type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null };
type UrunLisansi = { organization_id: string; product: string; status: string; integrated: boolean | null };
type CekirdekLisans = { organization_id: string; license_status: string };

export default async function ModulMatrisiSayfasi({ searchParams }: { searchParams: Promise<{ suzgec?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { suzgec } = await searchParams;

  const [{ data: kurumlar, error }, { data: urunLisanslari, error: urunHatasi }, { data: cekirdek, error: cekirdekHatasi }] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,kind,grup_markasi").order("name"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,integrated"),
    supabase.from("organization_licenses").select("organization_id,license_status"),
  ]);
  if (error) throw new Error("Kurum listesi okunamadı.");
  /* Lisanslar okunamazsa matristeki her hücre "Kapalı" çıkar: kurucu
     bütün kiracıların bütün modüllerini kapalı sanır. */
  if (urunHatasi) throw new Error("Ürün lisansları okunamadı: " + urunHatasi.message);
  if (cekirdekHatasi) throw new Error("ArvoOS lisansları okunamadı: " + cekirdekHatasi.message);

  /*
    SAYIM KİRACI SAYIMI, MÜŞTERİ SAYIMI DEĞİL (14.10.2026).

    Buradaki yorum "kaç MÜŞTERİ kurumun o modülü kullandığı" diyordu ama
    süzgeç yalnızca Arvo'nun kendi kurumunu eliyordu: grup markaları
    (AkademikMerkez, ArvoCulture) müşteri sayılıyordu. Sağdaki kart bu
    yüzden "Müşteri kurum 4" derken konsol ana sayfası aynı anda
    "Müşteri kurum 2" diyordu — iki ekran aynı soruya farklı cevap
    veriyordu.

    Doğru olan SAYIM: modül matrisi operasyonel bir ekran ve grup
    markaları da ürünü kullanıyor, kapalı modülleri de bir anlam taşıyor.
    Yanlış olan ADLANDIRMAYDI. Payda artık "kiracı" (şeridin alt satırı
    zaten öyle diyordu) ve sağdaki kart üç türü ayrı gösteriyor
    (lib/kurum-turu).
  */
  const satirlar = (kurumlar ?? []) as Kurum[];
  const kiracilar = satirlar.filter((kurum) => kurumTuru(kurum) !== "arvo");

  const urunById = new Map(
    ((urunLisanslari ?? []) as UrunLisansi[]).map((row) => [`${row.organization_id}:${row.product}`, row]),
  );
  const cekirdekById = new Map(
    ((cekirdek ?? []) as CekirdekLisans[]).map((row) => [row.organization_id, row.license_status]),
  );

  const durumAl = (kurum: Kurum, urun: string) =>
    urun === "arvoos"
      ? cekirdekById.get(kurum.id) ?? "inactive"
      : urunById.get(`${kurum.id}:${urun}`)?.status ?? "inactive";

  const acikMi = (durum: string) => ACIK_DURUMLAR.has(durum);

  const sayim = PRODUCTS.map((urun) => ({
    ...urun,
    acik: kiracilar.filter((kurum) => acikMi(durumAl(kurum, urun.code))).length,
    bagimsiz: urun.code === "arvoos"
      ? 0
      : kiracilar.filter((kurum) => urunById.get(`${kurum.id}:${urun.code}`)?.integrated === false).length,
  }));

  return <main className="plt talep cari ekip liste-sayfa urun-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ÜRÜNLER VE FİYATLAR</small>
        <h1>Modüller</h1>
        {/* Kartın başlığındaki uzun açıklama buraya indi (29.10.2026): kart
            başlığı tablonun üstünde 90 piksel tutuyordu. Sayım kuralı sağdaki
            istatistik kartının kapsam satırında. */}
        <p className="ek-alt">Hangi ürün hangi kiracıda açık. Hücreye tıklayınca o kiracının lisans sekmesi açılır; bağımsız mod yalnızca açık modülde yazılır.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/musteriler">Müşteriler</Link>
      </div>
    </header>

    {/*
      Ürün başına bir widget. Sayı, MÜŞTERİ kurumları sayıyor: kendi
      markalarımızı da katmak "ArvoLab'ı kaç kurum kullanıyor" sorusunun
      yanıtını kendimizle şişirirdi.
    */}
    {/*
      13.10.2026: StgWidget kutuları yerine panelin özet şeridi. Konsol
      kendi tasarım dilini kullanıyordu; aynı kurucunun gün içinde gidip
      geldiği panel ekranları şerit kullanıyor ve iki dil arasında geçiş
      sayıları her seferinde yeniden aramak demekti.

      Hepsi her zaman çiziliyor: sıfır da bir cevaptır ve satırın hiç
      olmamasından daha çok şey söyler.
    */}
    <nav className="kayit-serit talep-serit" aria-label="Modül özeti">
      <dl>
        {sayim.map((urun) => (
          <div key={urun.code}>
            <dt>{urun.name}</dt>
            <dd className={urun.acik ? "cari-arti" : undefined}>{urun.acik} / {kiracilar.length}</dd>
            <small>{urun.bagimsiz
              ? `${urun.bagimsiz} kiracı bağımsız modda`
              : urun.acik ? "Tümü köprü üzerinden" : "Kullanan kiracı yok"}</small>
          </div>
        ))}
      </dl>
    </nav>

    {/*
      14.10.2026: panelin liste düzeni. Matris solda liste kartında, sağda
      istatistik. Eskiden tek bir StgSection kartıydı ("ÇAPRAZ GÖRÜNÜM").
    */}
    <div className="talep-izgara personel-iki ekip-izgara">
      <section id="matris" className="panel-card talep-bilgi" aria-label="Kiracı × modül">
        {satirlar.length ? (
          <>
            <Matris
              durum={suzgec}
              urunler={PRODUCTS.map((urun) => ({ code: urun.code, name: urun.name }))}
              satirlar={satirlar.map((kurum) => ({
                id: kurum.id,
                ad: kurum.display_name || kurum.name,
                kendiMarkamiz: !musteriMi(kurum),
                hucreler: Object.fromEntries(PRODUCTS.map((urun) => {
                  const durum = durumAl(kurum, urun.code);
                  const lisans = urun.code === "arvoos" ? null : urunById.get(`${kurum.id}:${urun.code}`);
                  return [urun.code, {
                    durum,
                    durumAdi: DURUM_ADI[durum] ?? durum,
                    kisaAd: KISA_ADI[durum] ?? DURUM_ADI[durum] ?? durum,
                    tone: LISANS_TONU[durum] ?? "neutral",
                    acik: acikMi(durum),
                    bagimsiz: Boolean(lisans && acikMi(durum) && lisans.integrated === false),
                  }];
                })),
              }))}
            />
            {/*
              Kısaltılmış etiketlerin karşılığı: hücrede "Gecikmiş" yazıyor,
              kurucunun bunun "Ödeme gecikmiş" olduğunu tahmin etmesi
              gerekmemeli. Tek satır, tablonun hemen altında.
            */}
            <p className="plt-matris-lejant">
              {Object.entries(KISA_ADI).map(([durum, kisa]) => (
                <span key={durum}>
                  <span className="status-pill" data-tone={LISANS_TONU[durum] ?? "neutral"}>{kisa}</span>
                  {DURUM_ADI[durum] ?? durum}
                </span>
              ))}
            </p>
          </>
        ) : <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>Henüz kurum yok</h2><p>İlk müşteri kurulduğunda matris burada dolar.</p></div>}
      </section>

      {/*
        Sağ sütun (14.10.2026, iOS listesi): eskiden İstatistikler kartıydı;
        "Modülü açık kurum" ve ürün başına "Bağımsız modda" dağılımları
        şeritteki sayıların AYNISIYDI, "Ürün" kutusu her zaman 4 yazıyordu.
        Yerine yalnızca şeritte olmayanlar: kurumların müşteri / kendi
        markamız ayrımı ve toplam bağımsız lisans. Yine sayim'dan, yeni
        sorgu yok.
      */}
      <div className="liste-sag">
        {/* Üç tür ayrı: "Müşteri kurum" rakamı konsolun her yerinde aynı
            şeyi saymalı (lib/kurum-turu). Burada grup markaları müşteriye
            katılıyordu ve ana sayfayla çelişiyordu. */}
        <TalepAkis kimlik="modul-sag" sinif="ek-sag" etiket="Modül istatistikleri" sekmeler={["İstatistikler"]}>
          <IstatistikKarti
            kapsam="Arvo'nun kendi kurumu dışındaki kiracılar"
            kutular={[
              { ad: "Müşteri kurum", deger: String(satirlar.filter(musteriMi).length), alt: "müşteri geliri" },
              { ad: "Grup markası", deger: String(satirlar.filter((k) => kurumTuru(k) === "grup").length), alt: "sayımda var" },
              { ad: "Arvo", deger: String(satirlar.filter((k) => kurumTuru(k) === "arvo").length), alt: "tabloda, sayımda yok" },
              { ad: "Bağımsız modda", deger: String(sayim.reduce((t, u) => t + u.bagimsiz, 0)), alt: "köprüsüz ürün lisansı" },
            ]}
            gruplar={[{ baslik: "Modülü açık kiracı", satirlar: sayim.map((u) => ({ ad: u.name, adet: u.acik })) }]}
          />
        </TalepAkis>
      </div>
    </div>
  </main>;
}
