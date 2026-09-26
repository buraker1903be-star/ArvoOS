import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, productLicenseLabels } from "@/lib/products";
import "./uygulamalar.css";

/*
  UYGULAMALAR EKRANI — Arvo ekosisteminin panel içindeki karşılığı.

  Menüdeki "Diğer uygulamalar" yalnızca LİSANSI AÇIK ürünleri bir bağlantı
  listesi olarak gösteriyordu ve tıklayınca panelden çıkılıyordu. İki eksik
  vardı: kurum neye sahip OLMADIĞINI hiç görmüyordu ("bize ArvoLab
  verilmemiş" sanan kurumun tam tersi — Arc ve Randevu'nun varlığından
  haberi olmuyordu), ve ürünler arası geçiş panelde bir yere ait değildi.

  Burada bütün ürünler duruyor: açık olanlar açılabiliyor, kapalı olanlar
  ne işe yaradığını ve nasıl açılacağını söylüyor.

  LİSANSI BURADAN AÇILAMAZ, bilerek: organization_product_licenses'a
  yalnızca platform yönetimi yazıyor. Kuruma "Etkinleştir" düğmesi koymak,
  basınca hiçbir şey olmayan bir düğme koymak olurdu; bunun yerine kime
  başvurulacağı yazılı.
*/

// Lisans durumu bu kümedeyse ürün kullanılabilir (panel layout'u ile aynı kural).
const ACIK = new Set(["active", "trialing", "past_due"]);

type UygulamaBilgisi = {
  /** Ürünü açan adres. ArvoOS'un yok: zaten buradayız. */
  adres?: string;
  /** Tanıtım sayfası; yoksa bağlantı gösterilmiyor (uydurma adres yazmaktansa). */
  tanitim?: string;
  /** Kartta bir satırlık "ne işe yarar". products.ts'teki description'ın açılımı. */
  ayrinti: string;
};

const BILGI: Record<string, UygulamaBilgisi> = {
  arvoos: {
    tanitim: "https://arvo-os.com/urunler/arvoos",
    ayrinti: "Şu an kullandığınız panel: CRM, teklif ve sözleşme, operasyon, finans, İK ve raporlar.",
  },
  arvolab: {
    /* ArvoLab kendi yolundan: tek kullanımlık oturum bağlantısıyla, ikinci
       bir giriş ekranı görmeden (app/panel/uygulama/arvolab/route.ts). */
    adres: "/panel/uygulama/arvolab",
    tanitim: "https://arvo-os.com/urunler/arvolab",
    ayrinti: "Akademik çalışma yazımı, kaynakça ve editöryal kontrol; kurumunuzun kılavuzuna göre biçim denetimi.",
  },
  arc: {
    adres: "https://arc.arvo-os.com",
    tanitim: "https://arvo-os.com/urunler/arc",
    ayrinti: "Mağaza, ürün ve sipariş yönetimi; çevrim içi ödeme ve kargo takibi.",
  },
  randevu: {
    adres: "https://randevu.arvo-os.com",
    ayrinti: "Kuaför ve güzellik salonları için randevu, personel takvimi ve müşteri hatırlatmaları.",
  },
};

export default async function UygulamalarPage() {
  const { supabase, membership, organization } = await getPanelContext();

  const { data: lisanslar } = await supabase
    .from("organization_product_licenses")
    .select("product,status")
    .eq("organization_id", membership.organization_id);
  const durumlar = new Map(((lisanslar ?? []) as { product: string; status: string }[]).map((satir) => [satir.product, satir.status]));

  const yonetici = ["owner", "admin"].includes(membership.role);
  const kartlar = PRODUCTS.map((urun) => {
    const bilgi = BILGI[urun.code];
    // ArvoOS'un lisansı ayrı tabloda; panel açıksa zaten geçerli.
    const durum = urun.code === "arvoos" ? "active" : durumlar.get(urun.code);
    return {
      ...urun,
      ...bilgi,
      burasi: urun.code === "arvoos",
      acik: durum ? ACIK.has(durum) : false,
      // Lisans satırı hiç yoksa "Kapalı": ürün kuruma hiç tanımlanmamış.
      durumAdi: durum ? productLicenseLabels[durum] ?? durum : "Kapalı",
      durumTonu: durum === "active" ? "success" : durum === "trialing" ? "info" : durum && ACIK.has(durum) ? "warning" : "neutral",
    };
  });
  const acikSayisi = kartlar.filter((kart) => kart.acik).length;

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">UYGULAMALAR</small>
          <h1>Arvo uygulamaları</h1>
          <p>
            {organization.name} için açık olan {acikSayisi} uygulama aşağıda. Kapalı olanlar kurumunuza tanımlı değil;
            ne işe yaradıkları ve nasıl açılacakları kartlarında yazıyor.
          </p>
        </div>
      </div>

      <section className="uyg-izgara" aria-label="Uygulamalar">
        {kartlar.map((kart) => (
          <article className="uyg-kart" key={kart.code} data-acik={kart.acik ? "1" : undefined} data-burasi={kart.burasi ? "1" : undefined}>
            <header>
              <span className="uyg-simge" aria-hidden="true">{kart.name.slice(0, 1)}</span>
              <div>
                <b>{kart.name}</b>
                <small>{kart.description}</small>
              </div>
              <span className="status-pill" data-tone={kart.durumTonu}>{kart.burasi ? "Buradasınız" : kart.durumAdi}</span>
            </header>
            <p>{kart.ayrinti}</p>
            <footer>
              {/*
                Açık ürün yeni sekmede: kişi ArvoOS'taki işini kaybetmesin.
                Kendi panelimiz için düğme yok — zaten buradayız.
              */}
              {kart.burasi ? (
                <span className="uyg-not">Şu an bu uygulamadasınız.</span>
              ) : kart.acik && kart.adres ? (
                <a className="panel-primary" href={kart.adres} target="_blank" rel="noreferrer">{kart.name} uygulamasını aç ↗</a>
              ) : (
                <span className="uyg-not">
                  {yonetici
                    ? "Kurumunuza tanımlı değil. Açtırmak için Arvo ile iletişime geçin."
                    : "Kurumunuza tanımlı değil. Kurum yöneticinize başvurun."}
                </span>
              )}
              {kart.tanitim ? (
                <a className="uyg-tanitim" href={kart.tanitim} target="_blank" rel="noreferrer">Ne yapar? ↗</a>
              ) : null}
            </footer>
          </article>
        ))}
      </section>

      {/* Lisans buradan açılamıyor; kime başvurulacağı yazılı olmalı. */}
      <p className="uyg-alt">
        Kapalı bir uygulamayı açtırmak ya da deneme başlatmak için{" "}
        <a href="https://arvo-os.com/iletisim" target="_blank" rel="noreferrer">Arvo ile iletişime geçin</a>. Uygulama
        lisansları kurum panelinden değil, Arvo tarafından tanımlanıyor.
      </p>
    </div>
  );
}
