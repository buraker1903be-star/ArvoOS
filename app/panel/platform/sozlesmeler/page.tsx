import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../konsol-oku";
import { createAdminClient } from "@/lib/supabase/admin";
import { productName } from "@/lib/products";
import { basHarfleri, para, tarih } from "../bicim";
import { IstekKarti, type BekleyenIstek, type Kurum } from "./istek-karti";
import { KKart } from "../konsol-ui";
import { MobilSatir } from "../../crm/table-cells";
// İstek kartlarının düzeni (.istek-listesi, .istek-karti) platform.css'te.
import "../platform.css";
// Panelin başlık ve özet şeridi kalıbı (talep-bas, kayit-serit).
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";

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

/** Türkçe duyarsız karşılaştırma: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();

type IstekSatiri = {
  id: string;
  contract_id: string | null;
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

  /*
    Bekleyenler AYRI ve sınırsız sorguda. Eskiden tek sorgu vardı ve en yeni
    100 isteği çekiyordu: yüzden çok istek biriktiğinde eski bir BEKLEYEN
    sözleşme kuyruktan sessizce düşerdi — imzalanmış, parası beklenen bir iş
    hiçbir ekranda görünmeden kaybolurdu. Sayılar da aynı 100'lükten
    hesaplanıyordu.
  */
  const SECIM = "id,contract_id,contract_no,customer_name,amount,currency,created_at,status,requested,target_organization_id,review_note,reviewed_at";
  const [bekleyenSonucu, gecmisSonucu, sayimSonucu, kurumSonucu] = await Promise.all([
    admin.from("platform_subscription_requests").select(SECIM).eq("status", "pending").order("created_at", { ascending: false }),
    admin.from("platform_subscription_requests").select(SECIM).neq("status", "pending").order("reviewed_at", { ascending: false }).limit(20),
    admin.from("platform_subscription_requests").select("status"),
    admin.from("organizations").select("id,name,display_name,kind").order("name"),
  ]);
  /*
    Sayfanın ASIL verisi: okunamazsa sayfa hata veriyor. Eskiden `?? []`
    ile boş diziye düşüyordu ve ekran "kayıt yok" diyordu — "iş yok" ile
    "okuyamadım" aynı şey değil (konsol-oku.ts).
  */
  const bekleyenSatirlar = zorunlu(bekleyenSonucu, "Onay bekleyen sözleşmeler");
  const gecmisSatirlar = zorunlu(gecmisSonucu, "Sonuçlanan sözleşmeler");
  const sayimlar = zorunlu(sayimSonucu, "Sözleşme sayımı");
  const kurumSatirlari = zorunlu(kurumSonucu, "Kurumlar");

  const kurumlar: Kurum[] = ((kurumSatirlari ?? []) as { id: string; name: string; display_name: string | null; kind: string | null }[])
    // Kendi kurumumuza abonelik açılmaz; kendimize satmıyoruz.
    .filter((kurum) => kurum.kind !== "internal")
    .map((kurum) => ({ id: kurum.id, ad: kurum.display_name || kurum.name }));

  const bekleyenler = (bekleyenSatirlar ?? []) as IstekSatiri[];
  const sonuclananlar = (gecmisSatirlar ?? []) as IstekSatiri[];
  // Sayımlar bütün kayıtlardan; liste kısa kalıyor, sayı kısalmıyor.
  const tumDurumlar = ((sayimlar ?? []) as { status: string }[]).map((satir) => satir.status);
  const onaylananSayisi = tumDurumlar.filter((durum) => durum === "approved").length;
  const reddedilenSayisi = tumDurumlar.filter((durum) => durum === "rejected").length;
  // Kuyrukta bekleyen para: kurucunun "bugün neyi tahsil etmem gerek"
  // sorusunun yanıtı. Sözleşme tutarı kuruş cinsinden tamsayı.
  const bekleyenTutar = bekleyenler.reduce((toplam, satir) => toplam + Number(satir.amount ?? 0), 0);
  const bekleyenBirim = bekleyenler.find((satir) => satir.currency)?.currency ?? "TRY";

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
      contractId: satir.contract_id,
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

  /*
    PANELİN DİLİ (29.10.2026, konsol yeniden kurulurken). Bekleyen
    istekler kendi kartlarında kalıyor (kiracı seçimi ve ret sebebi olan
    karar formu bir tablo satırına sığmıyor); sonuçlananlar iOS satırı
    yerine Finans'ın öteki ekranlarıyla aynı hizalı tablo.
  */
  return <main className="plt talep cari ekip finans-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/billing">FİNANS · ABONELİKLER</Link></small>
        <h1>Sözleşme onayları</h1>
        <p className="ek-alt">ArvoOS kurumunda imzalanan sözleşmeler; onay seçilen kiracıya modülleri açar ve aboneliği başlatır.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/payments">Ödeme onayları</Link>
      </div>
    </header>

    {/* Hepsi her zaman çiziliyor: sıfır da bir cevaptır. */}
    <nav className="kayit-serit talep-serit" aria-label="Kuyruk özeti">
      <dl>
        <div><dt>Onay bekliyor</dt><dd className={bekleyenler.length ? "talep-uyari" : undefined}>{bekleyenler.length}</dd><small>{bekleyenler.length ? "Tahsilatı doğrulayıp onaylayın" : "Kuyruk boş"}</small></div>
        <div><dt>Bekleyen tutar</dt><dd>{para(bekleyenTutar, bekleyenBirim)}</dd><small>{bekleyenTutar ? "Onaylanınca modüller açılır" : "Bekleyen tutar yok"}</small></div>
        <div><dt>Onaylandı</dt><dd className="cari-arti">{onaylananSayisi}</dd><small>Abonelik açıldı</small></div>
        <div><dt>Reddedildi</dt><dd>{reddedilenSayisi}</dd><small>{reddedilenSayisi ? "Sebebi kayıtta" : "Reddedilen istek yok"}</small></div>
      </dl>
    </nav>

    {bekleyenler.length ? (
      <div className="istek-listesi">
        {bekleyenler.map((satir) => <IstekKarti key={satir.id} istek={bekleyen(satir)} kurumlar={kurumlar} />)}
      </div>
    ) : (
      <KKart baslik="Onay kuyruğu">
        <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>Onay bekleyen sözleşme yok</h2><p>ArvoOS kurumunda bir sözleşme imzalandığında burada görünür.</p></div>
      </KKart>
    )}

    {sonuclananlar.length ? (
      <section className="panel-card talep-bilgi" id="gecmis" aria-label="Sonuçlanan istekler">
        <header className="phr-bas fn-alt-bas">
          <h2>Sonuçlanan istekler <span className="pu-sayi">{sonuclananlar.length}</span></h2>
          <small>Son 20 karar. Kararlar geri alınamaz: onay modülleri açar, ret imzalı bir sözleşmeyi reddeder.</small>
        </header>
        {/* Satırın gidecek bir sayfası yok: ok (chevron) çizilmiyor. */}
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="fn-sozlesme">
            <thead><tr><th>Müşteri</th><th>Sözleşme</th><th className="crm-col-date">Karar</th><th className="crm-col-amount">Tutar</th><th>Durum</th></tr></thead>
            <tbody>
              {sonuclananlar.map((satir) => {
                const onay = satir.status === "approved";
                const karar = { etiket: onay ? "Onaylandı" : "Reddedildi", ton: onay ? "success" : "danger" };
                const ad = satir.customer_name ?? "Müşteri";
                return (
                  <tr key={satir.id} className={onay ? undefined : "is-pasif"}>
                    <td data-label="Müşteri">
                      <span className="ek-kisi">
                        <span className="ek-avatar" aria-hidden="true">{basHarfleri(ad)}</span>
                        <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span>{satir.review_note ? <span className="crm-table-sub" title={satir.review_note}>{satir.review_note}</span> : null}</span>
                      </span>
                    </td>
                    <td data-label="Sözleşme"><span className="crm-table-title plt-mono">{satir.contract_no ?? "—"}</span></td>
                    <td className="crm-col-date" data-label="Karar">{tarih(satir.reviewed_at)}</td>
                    <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{satir.amount ? para(Number(satir.amount), satir.currency) : "—"}</span></td>
                    <td data-label="Durum"><span className="status-pill" data-tone={karar.ton}>{karar.etiket}</span></td>
                    <MobilSatir baslik={ad} durum={karar} alt={[satir.contract_no, satir.amount ? para(Number(satir.amount), satir.currency) : null, tarih(satir.reviewed_at), satir.review_note]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    ) : null}
  </main>;
}
