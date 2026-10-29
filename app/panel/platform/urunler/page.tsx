import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../konsol-oku";
import { PRODUCTS, SUBSCRIBER_PRODUCTS, urunSimgesi } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { ADD_ONS, PLANS } from "@/lib/site/pricing";
import { para, sayi } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

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


  /*
    PANELİN TABLOSU (29.10.2026, konsol yeniden kurulurken). Ürün başına
    iOS satırıydı: kiracı, ödeyen, kullanıcı ve bireysel abone sayıları
    tek bir alt satıra virgülle diziliyordu ve dört ürün arasında
    karşılaştırma ("en çok kullanıcı hangisinde") satır satır okunarak
    yapılıyordu. Artık her sayı kendi sütununda.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa urun-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ÜRÜNLER VE FİYATLAR</small>
        <h1>Ürünler</h1>
        <p className="ek-alt">{sayi(PRODUCTS.length)} ürün · {sayi(toplamKurum)} lisanslı kurum · beklenen aylık {para(toplamGelir)}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-primary" href="/panel/platform/fiyatlar">Fiyat listesi</Link>
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer ekranlar">⋯</summary>
          <div className="os-menu-list" role="menu">
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/moduller">Modül matrisi</Link>
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/subscribers">Bireysel abone planları</Link>
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/saglik">Sistem sağlığı</Link>
          </div>
        </details>
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
          <small>basamak ve ek hizmet</small>
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
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="ur-urun">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Kiracı</th>
                <th>Ödeyen</th>
                <th>Kullanıcı</th>
                <th>Bireysel</th>
                <th className="crm-col-amount">Aylık</th>
                <th>Köprü</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((urun) => {
                // ArvoCal'ın bireysel aboneliği yok: salon kurumdur.
                const bireyselVar = SUBSCRIBER_PRODUCTS.some((p) => p.code === urun.code);
                const href = `/panel/platform/urunler/${urun.code}`;
                const durum = { etiket: urun.saglik.ok ? "Ayakta" : "Sorunlu", ton: urun.saglik.ok ? "success" : "danger" };
                return (
                  <tr key={urun.code}>
                    <td data-label="Ürün">
                      <Link className="crm-row-link ek-kisi" href={href}>
                        <span className="ek-avatar" aria-hidden="true">{urunSimgesi(urun.code) ?? urun.name.slice(0, 2)}</span>
                        <span className="ek-kisi-metin"><span className="crm-table-title">{urun.name}</span><span className="crm-table-sub">{urun.description}</span></span>
                      </Link>
                    </td>
                    <td data-label="Kiracı"><span className="crm-table-title">{sayi(urun.kurum)}</span></td>
                    <td data-label="Ödeyen"><span className="crm-table-title">{sayi(urun.odeyen)}</span></td>
                    <td data-label="Kullanıcı"><span className="crm-table-title">{sayi(urun.kullanici)}</span></td>
                    <td data-label="Bireysel">{bireyselVar ? <span className="crm-table-title">{sayi(urun.bireysel)}</span> : <span className="crm-table-sub">yok</span>}</td>
                    <td className="crm-col-amount" data-label="Aylık">
                      <span className="crm-table-title">{urun.gelir ? para(urun.gelir) : "—"}</span>
                      {urun.grupDegeri ? <small>grup içi {para(urun.grupDegeri)}</small> : null}
                    </td>
                    <td data-label="Köprü"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                    <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    <MobilSatir href={href} baslik={urun.name} durum={durum}
                      alt={[`${sayi(urun.kurum)} kiracı`, `${sayi(urun.kullanici)} kullanıcı`, urun.gelir ? `${para(urun.gelir)} / ay` : null]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
        <p className="ek-not ur-dipnot">
          Kiracı = lisansı açık kurum (deneme dahil), grup markaları dahil — onlar da ürünü kullanıyor. Gelire yalnızca
          gerçek müşteriler giriyor; grup markalarının ücreti &quot;grup içi&quot; olarak ayrı yazılıyor. Kullanıcı sayısı
          kurumun aktif üyesi: ürün başına ayrı üyelik yok. Arvo&apos;nun kendi kaydı sayımda yok.
        </p>
      </section>

      {/* Sağ sütun: yalnızca başka yerde yazmayan bilgi — her ürünün
          köprüsünün ne dediği. Tablodaki değerlerden, yeni sorgu yok. */}
      <div className="liste-sag">
        <TalepAkis kimlik="urun-sag" sinif="ek-sag" etiket="Köprüler" sekmeler={[kopukKopru ? `Köprüler · ${kopukKopru}` : "Köprüler"]}>
          <section className="ek-panel" aria-label="Köprüler">
            <ul className="pu-liste">
              {satirlar.map((urun) => (
                <li key={urun.code}>
                  <Link href="/panel/platform/saglik">
                    <span className="pu-govde"><b>{urun.name}</b><small>{urun.saglik.not}</small></span>
                    <span className="status-pill" data-tone={urun.saglik.ok ? "success" : "danger"}>{urun.saglik.ok ? "Ayakta" : "Sorunlu"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </TalepAkis>
      </div>
    </div>
  </main>;
}
