import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../konsol-oku";
import { createAdminClient } from "@/lib/supabase/admin";
import { productName } from "@/lib/products";
import { para, tarih } from "../bicim";
import { IstekKarti, type BekleyenIstek, type Kurum } from "./istek-karti";
import { KBos, KKart, KListe, KOge } from "../konsol-ui";
// İstek kartlarının düzeni (.istek-listesi, .istek-karti) platform.css'te.
import "../platform.css";
// Panelin başlık ve özet şeridi kalıbı (talep-bas, kayit-serit).
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

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

  return <main className="plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · SÖZLEŞME ONAYLARI</small>
        <h1>Onay bekleyen sözleşmeler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/payments">Ödeme onayları</Link>
      </div>
    </header>

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "onay bekleyen
      yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}
    {/*
      13.10.2026: StgWidget kutuları yerine panelin özet şeridi. Konsol
      kendi tasarım dilini kullanıyordu; aynı kurucunun gün içinde gidip
      geldiği panel ekranları şerit kullanıyor ve iki dil arasında geçiş
      sayıları her seferinde yeniden aramak demekti.

      Hepsi her zaman çiziliyor: sıfır da bir cevaptır ve satırın hiç
      olmamasından daha çok şey söyler.
    */}
    <nav className="kayit-serit talep-serit" aria-label="Kuyruk özeti">
      <dl>
        <div><dt>Onay bekliyor</dt><dd className={bekleyenler.length ? "talep-uyari" : undefined}>{bekleyenler.length}</dd><small>{bekleyenler.length ? "Tahsilatı doğrulayıp onaylayın" : "Kuyruk boş"}</small></div>
        <div><dt>Bekleyen tutar</dt><dd>{para(bekleyenTutar, bekleyenBirim)}</dd><small>{bekleyenTutar ? "Onaylanınca modüller açılır" : "Bekleyen tutar yok"}</small></div>
        <div><dt>Onaylandı</dt><dd className="cari-arti">{onaylananSayisi}</dd><small>Abonelik açıldı</small></div>
        <div><dt>Reddedildi</dt><dd>{reddedilenSayisi}</dd><small>{reddedilenSayisi ? "Sebebi kayıtta" : "Reddedilen istek yok"}</small></div>
      </dl>
    </nav>

    {/*
      GÖRÜNÜŞ (14.10.2026, "bizim ArvoOS panel gibi olmalı"): ayarlar
      ekranının kartı (StgSection) ve simgeli satır listesi yerine panelin
      kartı ve tablosu. Bekleyen istekler kendi kartlarında kalıyor:
      her birinde kiracı seçimi ve ret sebebi olan bir karar formu var,
      tablo satırına sığmıyor.
    */}
    {bekleyenler.length ? (
      <div className="istek-listesi">
        {bekleyenler.map((satir) => <IstekKarti key={satir.id} istek={bekleyen(satir)} kurumlar={kurumlar} />)}
      </div>
    ) : (
      <KKart baslik="Onay kuyruğu">
        <KBos baslik="Onay bekleyen sözleşme yok" aciklama="ArvoOS kurumunda bir sözleşme imzalandığında burada görünür." />
      </KKart>
    )}

    {sonuclananlar.length ? (
      <KKart
        id="gecmis" baslik="Sonuçlanan istekler"
        aciklama="Son 20 karar. Kararlar geri alınamaz: onay modülleri açar, ret imzalı bir sözleşmeyi reddeder."
        sag={<span className="status-pill">{sonuclananlar.length} kayıt</span>}
      >
        {/* Satırın gidecek bir sayfası yok: ok (chevron) çizilmiyor.
            iOS listesi (14.10.2026): beş sütunlu tablo yerine tek satır —
            sözleşme no, karar tarihi ve not özette; sağda karar ve tutar. */}
        <KListe>
          {sonuclananlar.map((satir) => {
            const onay = satir.status === "approved";
            const karar = onay ? "Onaylandı" : "Reddedildi";
            return (
              <KOge
                key={satir.id}
                simge={satir.customer_name ?? "Müşteri"}
                baslik={satir.customer_name ?? "Müşteri"}
                alt={[satir.contract_no ?? "—", tarih(satir.reviewed_at), satir.review_note].filter(Boolean).join(" · ")}
                durum={{ etiket: karar, ton: onay ? "success" : "danger" }}
                deger={satir.amount ? para(Number(satir.amount), satir.currency) : "—"}
              />
            );
          })}
        </KListe>
      </KKart>
    ) : null}
  </main>;
}
