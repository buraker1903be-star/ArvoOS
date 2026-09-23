import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, productLicenseLabels } from "@/lib/products";
import { StgIcon, StgSection, StgWidget } from "../../settings/settings-ui";
import { LISANS_TONU } from "../bicim";
import { Matris } from "./matris";
import "../../settings/settings.css";
import "../platform.css";

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

type Kurum = { id: string; name: string; display_name: string | null; kind: string | null };
type UrunLisansi = { organization_id: string; product: string; status: string; integrated: boolean | null };
type CekirdekLisans = { organization_id: string; license_status: string };

export default async function ModulMatrisiSayfasi() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [{ data: kurumlar, error }, { data: urunLisanslari }, { data: cekirdek }] = await Promise.all([
    supabase.from("organizations").select("id,name,display_name,kind").order("name"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,integrated"),
    supabase.from("organization_licenses").select("organization_id,license_status"),
  ]);
  if (error) throw new Error("Kurum listesi okunamadı.");

  // Kendi markalarımız listede kalıyor ama sayımdan düşüyor: kaç MÜŞTERİ
  // kurumun o modülü kullandığı sorusunun yanıtı kendimizle şişmemeli.
  const satirlar = (kurumlar ?? []) as Kurum[];
  const musteriMi = (kurum: Kurum) => kurum.kind !== "internal";
  const musteriler = satirlar.filter(musteriMi);

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
    acik: musteriler.filter((kurum) => acikMi(durumAl(kurum, urun.code))).length,
    bagimsiz: urun.code === "arvoos"
      ? 0
      : musteriler.filter((kurum) => urunById.get(`${kurum.id}:${urun.code}`)?.integrated === false).length,
  }));

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">ÜRÜN VE ERİŞİM</small>
        <h1>Modül matrisi</h1>
        <p>Hangi modül hangi kiracıda açık. Değişiklik kiracı dosyasında yapılır; bu ekran okunur.</p>
      </div>
    </div>

    {/*
      Ürün başına bir widget. Sayı, MÜŞTERİ kurumları sayıyor: kendi
      markalarımızı da katmak "ArvoLab'ı kaç kurum kullanıyor" sorusunun
      yanıtını kendimizle şişirirdi.
    */}
    <div className="stg-widgets" aria-label="Modül özeti">
      {sayim.map((urun) => (
        <StgWidget
          key={urun.code}
          tone={urun.acik ? "success" : "neutral"}
          icon={urun.code === "arvoos" ? "grid" : "box"}
          label={urun.name}
          value={`${urun.acik} / ${musteriler.length}`}
          note={urun.bagimsiz
            ? `${urun.bagimsiz} kiracı bağımsız modda`
            : urun.acik ? "Tümü köprü üzerinden" : "Kullanan kiracı yok"}
        />
      ))}
    </div>

    <StgSection
      id="matris" wide icon="grid" tone="info" kicker="ÇAPRAZ GÖRÜNÜM" title="Kiracı × modül"
      description="Sayımda kendi markalarımız yok; tabloda görünüyorlar. Bağımsız mod yalnızca açık modüllerde yazılır — kapalı bir modülün köprü modu bir şey anlatmaz. Hücreye tıklayınca o kiracının lisans ekranı açılır."
      aside={<span className="status-pill">{satirlar.length} kurum</span>}
    >
      {satirlar.length ? (
        <>
          <Matris
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
      ) : <div className="stg-empty"><StgIcon name="grid" size={22} /><p>Henüz kurum yok. İlk müşteri kurulduğunda matris burada dolar.</p></div>}
    </StgSection>
  </div>;
}
