import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../konsol-oku";
import { PRODUCTS, SUBSCRIBER_PRODUCTS, urunSimgesi } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { ADD_ONS, PLANS } from "@/lib/site/pricing";
import { KKart, KListe, KOge } from "../konsol-ui";
import { para, sayi } from "../bicim";
import "../platform.css";

/*
  ÜRÜNLER (14.10.2026, kurum sahibinin tarifi).

  "Ürün yaşıyor mu" sorusu: hangi ürünün kaç müşterisi, kaç kullanıcısı
  var, köprüsü ayakta mı. Ürün adından ürünün kendi sayfasına
  (urunler/[urun]) gidiliyor.

  Fiyatlandırma 14.10.2026'ya kadar burada ikinci sekmeydi; konsol sekiz
  ana menüye geçince "Ücret ve Paketler" kendi sayfası oldu
  (/panel/platform/fiyatlar). Eski ?bolum=fiyat bağlantıları oraya gidiyor.

  Ürün başına sayılar bugüne kadar hiçbir ekranda YAN YANA değildi:
  modül matrisi hangi modülün hangi kiracıda açık olduğunu gösteriyordu
  ama "ArvoLab kaç kişiye satıldı" sorusunun yanıtı yoktu.

  ArvoOS'un kiracısı = çekirdek lisansı açık kurum; ötekilerinki
  organization_product_licenses satırı. İkisini aynı sütunda saymak
  için kural tek: lisansı AÇIK olan kurum o ürünün kiracısıdır.

  SÜTUNUN ADI "KİRACI", "MÜŞTERİ" DEĞİL (14.10.2026). Grup markaları
  ürünü gerçekten kullanıyor, dolayısıyla bu sayıya girmeleri doğru —
  ama "müşteri" sözcüğü konsolun geri kalanında onları DIŞARIDA bırakan
  bir küme anlatıyor (lib/kurum-turu). Aynı kelimenin iki ekranda iki
  kümeyi göstermesi, ana ekranda 2 yazarken burada 3 yazmasıydı. Sayı
  değişmedi, kelime kümesine uyduruldu.
*/

const ACIK_LISANS = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

type Kiraci = {
  id: string; kind: string | null; license_status: string | null; plan_code: string | null;
  monthly_fee: number | null; aktif_uye: number; grup_markasi?: boolean | null;
};

export default async function UrunlerPage({ searchParams }: {
  searchParams: Promise<{ bolum?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { bolum } = await searchParams;
  // Fiyatlandırma kendi sayfasına taşındı; eski bağlantılar kırılmasın.
  if (bolum === "fiyat") redirect("/panel/platform/fiyatlar");

  const [kiraciSonucu, urunLisansSonucu, aboneSonucu, arvolab, arc, randevu] = await Promise.all([
    supabase.from("platform_kiraci_liste").select("id,kind,license_status,plan_code,monthly_fee,aktif_uye,grup_markasi"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee"),
    // Kuruma geçmiş abone (kurum_id) bireysel değil: kurum lisansını kullanıyor.
    supabase.from("product_subscribers").select("product,status").is("kurum_id", null),
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
  ]);
  /*
    Sayfanın ASIL verisi: okunamazsa sayfa hata veriyor. Eskiden `?? []`
    ile boş diziye düşüyordu ve ekran "kayıt yok" diyordu — "iş yok" ile
    "okuyamadım" aynı şey değil (konsol-oku.ts).
  */
  const kiraciSatirlari = zorunlu(kiraciSonucu, "Kiracılar");
  const urunLisanslari = zorunlu(urunLisansSonucu, "Ürün lisansları");
  const aboneSatirlari = zorunlu(aboneSonucu, "Bireysel aboneler");

  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");
  /* Grup markaları ürünü kullanıyor (müşteri ve kullanıcı sayısında var)
     ama ücretleri müşteri geliri değil, grup içi değer (lib/kurum-turu). */
  const grupMarkasi = new Set(kiracilar.filter((k) => k.grup_markasi).map((k) => k.id));
  const musteriMi = new Set(kiracilar.map((k) => k.id));
  const uyeSayisi = new Map(kiracilar.map((k) => [k.id, Number(k.aktif_uye)]));
  const urunler = ((urunLisanslari ?? []) as { organization_id: string; product: string; status: string; monthly_fee: number | null }[])
    .filter((satir) => musteriMi.has(satir.organization_id));
  const aboneler = ((aboneSatirlari ?? []) as { product: string; status: string }[]);

  const kopru: Record<string, { ok: boolean; not: string }> = {
    arvoos: { ok: true, not: "Konsolun kendi veritabanı" },
    arvolab: { ok: !arvolab?.broken, not: arvolab?.broken ? "Köprü yanıt vermiyor" : "Köprü sağlıklı" },
    arc: { ok: arc.ok, not: arc.ok ? "Köprü sağlıklı" : "Köprü yanıt vermiyor" },
    randevu: { ok: randevu.ok, not: randevu.ok ? "Köprü sağlıklı" : "Köprü yanıt vermiyor" },
  };

  const satirlar = PRODUCTS.map((urun) => {
    const cekirdek = urun.code === "arvoos";
    const kurumSatirlari = cekirdek
      ? kiracilar.filter((k) => ACIK_LISANS.has(k.license_status ?? ""))
      : urunler.filter((s) => s.product === urun.code && ACIK_LISANS.has(s.status));
    const odeyen = cekirdek
      ? kiracilar.filter((k) => ODEYEN.has(k.license_status ?? ""))
      : urunler.filter((s) => s.product === urun.code && ODEYEN.has(s.status));
    const kurumu = (satir: Kiraci | { organization_id: string }) => ("organization_id" in satir ? satir.organization_id : satir.id);
    const ucreti = (satir: Kiraci | { monthly_fee: number | null }) => Number(satir.monthly_fee ?? 0);
    const gelir = (odeyen as (Kiraci | { organization_id: string; monthly_fee: number | null })[])
      .filter((s) => !grupMarkasi.has(kurumu(s))).reduce((t, s) => t + ucreti(s), 0);
    const grupDegeri = (odeyen as (Kiraci | { organization_id: string; monthly_fee: number | null })[])
      .filter((s) => grupMarkasi.has(kurumu(s))).reduce((t, s) => t + ucreti(s), 0);
    /* Kullanıcı sayısı KURUMUN aktif üyesi: ürün başına ayrı bir üyelik
       kaydı yok, kurumun ekibi ürünü birlikte kullanıyor. */
    const kullanici = cekirdek
      ? kurumSatirlari.reduce((t, k) => t + (uyeSayisi.get((k as Kiraci).id) ?? 0), 0)
      : kurumSatirlari.reduce((t, s) => t + (uyeSayisi.get((s as { organization_id: string }).organization_id) ?? 0), 0);
    const bireysel = aboneler.filter((a) => a.product === urun.code && ACIK_LISANS.has(a.status)).length;
    return { ...urun, kurum: kurumSatirlari.length, odeyen: odeyen.length, gelir, grupDegeri, kullanici, bireysel, saglik: kopru[urun.code] };
  });

  const toplamGelir = satirlar.reduce((t, s) => t + s.gelir, 0);
  const toplamKurum = kiracilar.filter((k) => ACIK_LISANS.has(k.license_status ?? "")).length;
  const kopukKopru = satirlar.filter((s) => !s.saglik.ok).length;


  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜRÜNLER</small>
        <h1>Ürünler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/fiyatlar">Fiyat listesi</Link>
        <Link className="panel-secondary" href="/panel/platform/moduller">Modül matrisi</Link>
        <Link className="panel-secondary" href="/panel/platform/subscribers">Bireysel abone planları</Link>
        <Link className="panel-secondary" href="/panel/platform/saglik">Sistem sağlığı</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Ürün özeti">
      <dl>
        <div>
          <dt>Ürün</dt>
          <dd>{sayi(PRODUCTS.length)}</dd>
          <small>{kopukKopru ? `${sayi(kopukKopru)} köprü yanıt vermiyor` : "Hepsi ayakta"}</small>
        </div>
        <div>
          <dt>Fiyat listesi</dt>
          <dd><Link href="/panel/platform/fiyatlar">{sayi(PLANS.length + ADD_ONS.length)}</Link></dd>
          <small>Fiyat listesinde</small>
        </div>
        <div>
          <dt>Lisanslı kurum</dt>
          <dd>{sayi(toplamKurum)}</dd>
          <small>Çekirdek lisansı açık</small>
        </div>
        <div>
          <dt>Beklenen aylık</dt>
          <dd className="cari-arti">{para(toplamGelir)}</dd>
          <small>Dört ürünün toplamı</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Ürün performansı">
        <header className="k-kart-bas">
          <div>
            <h2>Ürün performansı</h2>
            <p>
              Kiracı = lisansı açık kurum (deneme dahil), grup markaları dahil — onlar da ürünü kullanıyor.
              Gelire ise yalnızca gerçek müşteriler giriyor, grup markalarının ücreti ayrıca &quot;grup içi değer&quot;
              olarak yazılıyor. Kullanıcı sayısı kurumun aktif üyesidir: ürün başına ayrı bir
              üyelik kaydı yok, kurumun ekibi ürünü birlikte kullanıyor. Arvo&apos;nun kendi kaydı sayımda yok.
            </p>
          </div>
        </header>
        {/*
          iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"; urunler/[urun] ile
          aynı dil): ürün başına tek satır — simge, ad, altında müşteri ·
          ödeyen · kullanıcı · bireysel abone; sağda köprü durumu ve aylık
          gelir. Eskiden sekiz sütunlu tabloydu (KTablo); sütun başlıkları
          sayılardan uzundu ve satır ikiye kırılıyordu.
        */}
        <KListe>
          {satirlar.map((urun) => {
            // Randevu'nun bireysel aboneliği yok: salon kurumdur.
            const bireyselVar = SUBSCRIBER_PRODUCTS.some((p) => p.code === urun.code);
            const href = `/panel/platform/urunler/${urun.code}`;
            const durum = { etiket: urun.saglik.ok ? "Ayakta" : "Sorunlu", ton: urun.saglik.ok ? "success" : "danger" };
            return (
              <KOge
                key={urun.code}
                href={href}
                simge={urunSimgesi(urun.code) ?? urun.name}
                baslik={urun.name}
                alt={[
                  `${sayi(urun.kurum)} kiracı`,
                  `${sayi(urun.odeyen)} ödeyen`,
                  `${sayi(urun.kullanici)} kullanıcı`,
                  bireyselVar ? `${sayi(urun.bireysel)} bireysel abone` : null,
                ].filter(Boolean).join(" · ")}
                durum={durum}
                deger={urun.gelir ? para(urun.gelir) : "—"}
                degerAlt={urun.grupDegeri ? `aylık · grup içi ${para(urun.grupDegeri)}` : "aylık"}
              />
            );
          })}
        </KListe>
      </section>

      {/*
        Sağ sütun (14.10.2026): eskiden İstatistikler kartıydı; dört kutusu
        şeritteki sayıların AYNISI, iki dağılımı (müşteri, aylık gelir)
        listedeki satırların aynısıydı. Yerine yalnızca başka yerde
        yazmayan bilgi: her ürünün köprüsünün ne dediği. Yine listede
        zaten hesaplanan değerlerden: yeni sorgu yok.
      */}
      <div className="liste-sag">
        <KKart baslik="Köprüler" sag={<Link className="panel-secondary" href="/panel/platform/saglik">Sağlık</Link>}>
          <KListe>
            {satirlar.map((urun) => (
              <KOge
                key={urun.code}
                baslik={urun.name}
                alt={urun.saglik.not}
                durum={{ etiket: urun.saglik.ok ? "Ayakta" : "Sorunlu", ton: urun.saglik.ok ? "success" : "danger" }}
              />
            ))}
          </KListe>
        </KKart>
      </div>
    </div>
  </main>;
}
