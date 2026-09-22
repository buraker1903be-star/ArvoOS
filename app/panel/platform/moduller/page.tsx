import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ADDON_PRODUCTS, PRODUCTS } from "@/lib/products";
import { StgIcon } from "../../settings/settings-ui";
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

const DURUM_ADI: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Gecikmiş",
  suspended: "Donduruldu", inactive: "Kapalı", canceled: "İptal",
};
const DURUM_TONU: Record<string, string> = {
  active: "success", trialing: "info", past_due: "warning",
  suspended: "danger", inactive: "neutral", canceled: "danger",
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

  const acikMi = (durum: string) => ["active", "trialing", "past_due"].includes(durum);

  const sayim = PRODUCTS.map((urun) => ({
    ...urun,
    acik: satirlar.filter((kurum) => musteriMi(kurum) && acikMi(durumAl(kurum, urun.code))).length,
    bagimsiz: urun.code === "arvoos"
      ? 0
      : satirlar.filter((kurum) => musteriMi(kurum) && urunById.get(`${kurum.id}:${urun.code}`)?.integrated === false).length,
  }));

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">ÜRÜN VE ERİŞİM</small>
        <h1>Modül matrisi</h1>
        <p>Hangi modül hangi kiracıda açık. Değişiklik kiracı dosyasında yapılır; bu ekran okunur.</p>
      </div>
    </div>

    <section className="platform-serit" aria-label="Modül özeti">
      {sayim.map((urun) => (
        <span key={urun.code}>
          <b>{urun.acik}</b> {urun.name}
          {urun.bagimsiz ? <span className="modul-bagimsiz-sayi">{urun.bagimsiz} bağımsız</span> : null}
        </span>
      ))}
    </section>

    <section className="panel-card management-card" aria-label="Modül matrisi">
      <div className="plt-table-scroll">
        <table className="plt-table modul-capraz">
          <thead>
            <tr>
              <th>Kiracı</th>
              {PRODUCTS.map((urun) => <th key={urun.code}>{urun.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {satirlar.map((kurum) => (
              <tr key={kurum.id}>
                <td>
                  <Link className="modul-baglanti" href={`/panel/platform?organization=${kurum.id}`}>
                    {kurum.display_name || kurum.name}
                  </Link>
                  {musteriMi(kurum) ? null : <small className="plt-substatus">kendi markamız</small>}
                </td>
                {PRODUCTS.map((urun) => {
                  const durum = durumAl(kurum, urun.code);
                  const lisans = urun.code === "arvoos" ? null : urunById.get(`${kurum.id}:${urun.code}`);
                  return (
                    <td key={urun.code}>
                      <span className="status-pill" data-tone={DURUM_TONU[durum] ?? "neutral"}>
                        {DURUM_ADI[durum] ?? durum}
                      </span>
                      {/* Bağımsız mod yalnızca açık modülde yazılıyor;
                          kapalı bir modülün köprü modu bir şey anlatmıyor. */}
                      {lisans && acikMi(durum) && lisans.integrated === false
                        ? <small className="plt-substatus">bağımsız</small>
                        : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!satirlar.length ? <div className="stg-empty"><StgIcon name="grid" size={22} /><p>Henüz kurum yok.</p></div> : null}
    </section>

    <p className="plt-substatus">
      Sayımda kendi markalarımız yok; tabloda görünüyorlar. {ADDON_PRODUCTS.length} ek ürün ve ArvoOS çekirdeği listeleniyor.
    </p>
  </div>;
}
