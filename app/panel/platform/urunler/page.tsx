import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, SUBSCRIBER_PRODUCTS } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { ADD_ONS, PLANS } from "@/lib/site/pricing";
import { para, sayi } from "../bicim";
import "../../settings/settings.css";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

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

  ArvoOS'un müşterisi = çekirdek lisansı ödeyen kurum; ötekilerinki
  organization_product_licenses satırı. İkisini aynı sütunda saymak
  için kural tek: lisansı AÇIK olan kurum müşteridir.
*/

const ACIK_LISANS = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

type Kiraci = {
  id: string; kind: string | null; license_status: string | null; plan_code: string | null;
  monthly_fee: number | null; aktif_uye: number;
};

export default async function UrunlerPage({ searchParams }: {
  searchParams: Promise<{ bolum?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { bolum } = await searchParams;
  // Fiyatlandırma kendi sayfasına taşındı; eski bağlantılar kırılmasın.
  if (bolum === "fiyat") redirect("/panel/platform/fiyatlar");

  const [{ data: kiraciSatirlari }, { data: urunLisanslari }, { data: aboneSatirlari }, arvolab, arc, randevu] = await Promise.all([
    supabase.from("platform_kiraci_liste").select("id,kind,license_status,plan_code,monthly_fee,aktif_uye"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee"),
    supabase.from("product_subscribers").select("product,status"),
    getArvolabBridgeHealth(),
    getArcBridgeHealth(),
    getRandevuBridgeHealth(),
  ]);

  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");
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
    const gelir = cekirdek
      ? odeyen.reduce((t, k) => t + Number((k as Kiraci).monthly_fee ?? 0), 0)
      : odeyen.reduce((t, s) => t + Number((s as { monthly_fee: number | null }).monthly_fee ?? 0), 0);
    /* Kullanıcı sayısı KURUMUN aktif üyesi: ürün başına ayrı bir üyelik
       kaydı yok, kurumun ekibi ürünü birlikte kullanıyor. */
    const kullanici = cekirdek
      ? kurumSatirlari.reduce((t, k) => t + (uyeSayisi.get((k as Kiraci).id) ?? 0), 0)
      : kurumSatirlari.reduce((t, s) => t + (uyeSayisi.get((s as { organization_id: string }).organization_id) ?? 0), 0);
    const bireysel = aboneler.filter((a) => a.product === urun.code && ACIK_LISANS.has(a.status)).length;
    return { ...urun, kurum: kurumSatirlari.length, odeyen: odeyen.length, gelir, kullanici, bireysel, saglik: kopru[urun.code] };
  });

  const toplamGelir = satirlar.reduce((t, s) => t + s.gelir, 0);
  const toplamKurum = kiracilar.filter((k) => ACIK_LISANS.has(k.license_status ?? "")).length;
  const kopukKopru = satirlar.filter((s) => !s.saglik.ok).length;

  const adres = (kod: string) => `/panel/platform/urunler?bolum=${kod}`;

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜRÜNLER</small>
        <h1>Ürünler</h1>
        <p>Dört ürünün müşteri sayısı, kullanıcısı, geliri ve köprü durumu. Ürün adından ürünün kendi sayfasına geçilir.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/fiyatlar">Ücret ve Paketler</Link>
        <Link className="panel-secondary" href="/panel/platform/moduller">Modül matrisi</Link>
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
          <small>Ücret ve Paketler&apos;de</small>
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

    <section className="panel-card" aria-label="Ürün performansı">
        <h2>Ürün performansı</h2>
        <p className="panel-muted">
          Müşteri = lisansı açık kurum (deneme dahil). Kullanıcı sayısı kurumun aktif üyesidir: ürün başına ayrı bir
          üyelik kaydı yok, kurumun ekibi ürünü birlikte kullanıyor. Kendi markalarımız sayımda yok.
        </p>
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Ürün</th><th>Müşteri</th><th>Ödeyen</th><th>Kullanıcı</th><th>Bireysel abone</th><th>Aylık gelir</th><th>Sistem</th></tr></thead>
            <tbody>
              {satirlar.map((urun) => (
                <tr key={urun.code}>
                  <td>
                    <Link href={`/panel/platform/urunler/${urun.code}`}>{urun.name}</Link>
                    <small className="plt-substatus">{urun.description}</small>
                  </td>
                  <td>{sayi(urun.kurum)}</td>
                  <td>{sayi(urun.odeyen)}</td>
                  <td>{sayi(urun.kullanici)}</td>
                  {/* Randevu'nun bireysel aboneliği yok: salon kurumdur. */}
                  <td>{SUBSCRIBER_PRODUCTS.some((p) => p.code === urun.code) ? sayi(urun.bireysel) : "—"}</td>
                  <td>{urun.gelir ? para(urun.gelir) : "—"}</td>
                  <td>
                    <span className="status-pill" data-tone={urun.saglik.ok ? "success" : "danger"}>{urun.saglik.ok ? "Ayakta" : "Sorunlu"}</span>
                    <small className="plt-substatus">{urun.saglik.not}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
  </main>;
}
