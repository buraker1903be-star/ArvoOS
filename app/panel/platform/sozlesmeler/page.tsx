import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { productName } from "@/lib/products";
import { StgIcon } from "../../settings/settings-ui";
import { IstekKarti, type BekleyenIstek, type Kurum } from "./istek-karti";
import "../../settings/settings.css";
import "../platform.css";

/*
  Onay bekleyen sözleşmeler.

  app.arvo-os.com'da imzalanan sözleşme buraya düşüyor (tetikleyici:
  arvo_sozlesmeden_abonelik_istegi). İmza modülü AÇMIYOR — istek burada
  bekliyor, kurucu tahsilatı doğrulayıp onaylıyor.

  Kapsam veritabanında daraltılmış: yalnızca Arvo'nun kendi kurumunda
  imzalanan sözleşmeler kuyruğa giriyor. Kiracının kendi müşterisiyle
  imzaladığı sözleşme onun işi.
*/

export const dynamic = "force-dynamic";

const tarih = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

/** Türkçe duyarsız karşılaştırma: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

type IstekSatiri = {
  id: string;
  contract_no: string | null;
  customer_name: string | null;
  amount: number | null;
  currency: string;
  created_at: string;
  status: string;
  requested: { modules?: { product: string; monthly_fee?: number | null; integrated?: boolean }[] };
  target_organization_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
};

export default async function SozlesmelerPage() {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil.");

  const [{ data: istekler }, { data: kurumSatirlari }] = await Promise.all([
    admin.from("platform_subscription_requests")
      .select("id,contract_no,customer_name,amount,currency,created_at,status,requested,target_organization_id,review_note,reviewed_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("organizations").select("id,name,display_name,kind").order("name"),
  ]);

  const kurumlar: Kurum[] = ((kurumSatirlari ?? []) as { id: string; name: string; display_name: string | null; kind: string | null }[])
    // Kendi kurumumuza abonelik açılmaz; kendimize satmıyoruz.
    .filter((kurum) => kurum.kind !== "internal")
    .map((kurum) => ({ id: kurum.id, ad: kurum.display_name || kurum.name }));

  const satirlar = (istekler ?? []) as IstekSatiri[];
  const bekleyenler = satirlar.filter((satir) => satir.status === "pending");
  const sonuclananlar = satirlar.filter((satir) => satir.status !== "pending").slice(0, 20);

  const bekleyen = (satir: IstekSatiri): BekleyenIstek => {
    const ad = sadelestir(satir.customer_name ?? "");
    /*
      Kiracı önerisi: sözleşmedeki müşteri adıyla eşleşen kurum. Öneri
      yalnızca seçiciyi hazırlıyor, karar kurucunun — ad benzerliğiyle
      yanlış kiracıya abonelik açmak geri alınması zor bir hata.
    */
    const oneri = ad ? kurumlar.find((kurum) => sadelestir(kurum.ad) === ad) : undefined;
    return {
      id: satir.id,
      contractNo: satir.contract_no,
      customerName: satir.customer_name,
      amount: satir.amount,
      currency: satir.currency,
      createdAt: satir.created_at,
      moduller: (satir.requested?.modules ?? []).map((modul) => ({
        product: modul.product,
        name: productName(modul.product),
        monthlyFee: modul.monthly_fee ?? null,
        integrated: modul.integrated !== false,
      })),
      onerilenKurumId: oneri?.id ?? null,
    };
  };

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">TİCARİ</small>
        <h1>Onay bekleyen sözleşmeler</h1>
        <p>İmzalanan sözleşmeler buraya düşer. İmza modülleri açmaz; tahsilatı doğruladıktan sonra onaylayın.</p>
      </div>
    </div>

    <section className="platform-serit" aria-label="Kuyruk özeti">
      <span data-tone={bekleyenler.length ? "warning" : undefined}><b>{bekleyenler.length}</b> onay bekliyor</span>
      <span><b>{satirlar.filter((s) => s.status === "approved").length}</b> onaylandı</span>
      {satirlar.some((s) => s.status === "rejected")
        ? <span><b>{satirlar.filter((s) => s.status === "rejected").length}</b> reddedildi</span>
        : null}
    </section>

    {bekleyenler.length ? (
      <div className="istek-listesi">
        {bekleyenler.map((satir) => <IstekKarti key={satir.id} istek={bekleyen(satir)} kurumlar={kurumlar} />)}
      </div>
    ) : (
      <div className="stg-empty">
        <StgIcon name="check" size={22} />
        <p>Onay bekleyen sözleşme yok. ArvoOS kurumunda bir sözleşme imzalandığında burada görünür.</p>
      </div>
    )}

    {sonuclananlar.length ? (
      <section className="panel-card management-card" aria-label="Sonuçlananlar">
        <div className="management-heading">
          <div><small>GEÇMİŞ</small><h2>Sonuçlanan istekler</h2></div>
        </div>
        <div className="stg-list">
          {sonuclananlar.map((satir) => (
            <div key={satir.id} className="plt-row">
              <span className="stg-row-main">
                <span className="stg-row-icon" data-tone={satir.status === "approved" ? "success" : "danger"}>
                  <StgIcon name={satir.status === "approved" ? "check" : "lock"} size={16} />
                </span>
                <span>
                  <b>{satir.customer_name ?? "Müşteri"} · {satir.contract_no ?? "—"}</b>
                  <small>
                    {satir.status === "approved" ? "Onaylandı" : "Reddedildi"} · {tarih(satir.reviewed_at)}
                    {satir.review_note ? ` · ${satir.review_note}` : ""}
                  </small>
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    ) : null}
  </div>;
}
