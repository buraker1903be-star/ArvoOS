import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, SUBSCRIBER_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { getArvolabBridgeHealth } from "@/lib/arvolab";
import { getArcBridgeHealth } from "@/lib/arc-bridge";
import { getRandevuBridgeHealth } from "@/lib/randevu-bridge";
import { planlar, type PricedProduct } from "@/lib/site/pricing";
import { planTutari, planYillikTutari } from "@/lib/site/fiyat-kaynagi";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../../bicim";
import "../../../settings/settings.css";
import "../../platform.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";

/*
  TEK ÜRÜNÜN SAYFASI (14.10.2026, Kurucu Konsolu → Ürünler).

  Ürünler ekranı dört ürünü tek tabloda yan yana gösteriyor; "ArvoARC'ı
  kim kullanıyor, kimin dönemi bitiyor, köprü ayakta mı" sorusunun yanıtı
  için kiracı kiracı dolaşmak gerekiyordu. Bu sayfa bir ürünün:
    - kiracılarını (lisans durumu, paket, ücret, dönem),
    - yayımlanmış fiyat basamaklarını (Ücret ve Paketler'in okuduğu tablo),
    - köprüsünü (ayrı veritabanındaki kopyanın sağlığı),
    - bireysel abonelerini (ArvoLab, ArvoARC)
  tek yerde gösteriyor. Düzenleme burada değil: lisans kiracının dosyasında,
  fiyat Ücret ve Paketler'de, deneme süresi Bireysel abone planlarında.

  ArvoOS'un kiracısı çekirdek lisansı olan kurum (organization_licenses);
  ötekilerin organization_product_licenses satırı. Kendi kurumlarımız
  (kind = internal) listede yok.
*/

type Satir = {
  id: string; ad: string; durum: string; paket: string | null; ucret: number | null;
  donemSonu: string | null; denemeSonu: string | null; kullanici: number;
};

const ACIK = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

export default async function UrunPage({ params }: { params: Promise<{ urun: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { urun } = await params;
  const urunTanimi = PRODUCTS.find((p) => p.code === urun);
  if (!urunTanimi) notFound();
  const cekirdek = urun === "arvoos";
  const bireyselVar = SUBSCRIBER_PRODUCTS.some((p) => p.code === urun);

  const [{ data: kiraciSatirlari, error: kiraciHatasi }, { data: urunSatirlari, error: urunHatasi }, { data: aboneSatirlari }, fiyatlar, kopru] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at,aktif_uye"),
    cekirdek
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("organization_product_licenses")
          .select("organization_id,status,plan_code,monthly_fee,current_period_end,trial_ends_at").eq("product", urun),
    bireyselVar
      ? supabase.from("product_subscribers").select("status").eq("product", urun)
      : Promise.resolve({ data: [] }),
    yayimlananFiyatlar(),
    urun === "arc" ? getArcBridgeHealth().then((h) => ({ ok: h.ok, not: h.ok ? "Köprü sağlıklı" : h.missing.length ? `Eksik ayar: ${h.missing.join(", ")}` : "Köprü yanıt vermiyor" }))
      : urun === "randevu" ? getRandevuBridgeHealth().then((h) => ({ ok: h.ok, not: h.ok ? "Köprü sağlıklı" : h.missing.length ? `Eksik ayar: ${h.missing.join(", ")}` : "Köprü yanıt vermiyor" }))
      : urun === "arvolab" ? getArvolabBridgeHealth().then((h) => ({ ok: Boolean(h && !h.broken), not: !h ? "Köprü ayarı eksik" : h.broken ? "Köprü yanıt vermiyor" : "Köprü sağlıklı" }))
      : Promise.resolve({ ok: true, not: "Konsolun kendi veritabanı" }),
  ]);
  // Okunamayan liste "kiracı yok" demek değil (AGENTS.md: engelin sorgusu hata yutmaz).
  if (kiraciHatasi) throw new Error("Kiracılar okunamadı: " + kiraciHatasi.message);
  if (urunHatasi) throw new Error("Ürün lisansları okunamadı: " + urunHatasi.message);

  type Kiraci = {
    id: string; name: string; display_name: string | null; kind: string | null; license_status: string | null;
    plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null; aktif_uye: number;
  };
  const kiracilar = ((kiraciSatirlari ?? []) as unknown as Kiraci[]).filter((k) => k.kind !== "internal");
  const kiraciHaritasi = new Map(kiracilar.map((k) => [k.id, k]));

  const satirlar: Satir[] = cekirdek
    ? kiracilar.filter((k) => k.license_status).map((k) => ({
        id: k.id, ad: k.display_name || k.name, durum: k.license_status!, paket: k.plan_code, ucret: k.monthly_fee,
        donemSonu: k.current_period_end, denemeSonu: k.trial_ends_at, kullanici: Number(k.aktif_uye),
      }))
    : ((urunSatirlari ?? []) as { organization_id: string; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
        .flatMap((l) => {
          const k = kiraciHaritasi.get(l.organization_id);
          if (!k) return []; // kendi kurumumuz ya da silinmiş kurum
          return [{
            id: l.organization_id, ad: k.display_name || k.name, durum: l.status, paket: l.plan_code, ucret: l.monthly_fee,
            donemSonu: l.current_period_end, denemeSonu: l.trial_ends_at, kullanici: Number(k.aktif_uye),
          }];
        });
  satirlar.sort((a, b) => Number(ODEYEN.has(b.durum)) - Number(ODEYEN.has(a.durum)) || Number(b.ucret ?? 0) - Number(a.ucret ?? 0) || a.ad.localeCompare(b.ad, "tr"));

  const acik = satirlar.filter((s) => ACIK.has(s.durum));
  const odeyen = satirlar.filter((s) => ODEYEN.has(s.durum));
  const gelir = odeyen.reduce((t, s) => t + Number(s.ucret ?? 0), 0);
  const aboneler = (aboneSatirlari ?? []) as { status: string }[];
  const acikAbone = aboneler.filter((a) => ACIK.has(a.status)).length;
  const basamaklar = planlar(urun as PricedProduct);

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜRÜNLER</small>
        <h1>{urunTanimi.name}</h1>
        <p>{urunTanimi.description}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/urunler">← Dört ürün</Link>
        <Link className="panel-secondary" href="/panel/platform/fiyatlar">Fiyatları düzenle</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label={`${urunTanimi.name} özeti`}>
      <dl>
        <div><dt>Müşteri</dt><dd>{sayi(acik.length)}</dd><small>lisansı açık kurum (deneme dahil)</small></div>
        <div><dt>Ödeyen</dt><dd>{sayi(odeyen.length)}</dd><small>{satirlar.length - acik.length ? `${sayi(satirlar.length - acik.length)} askıda/iptal/kapalı` : "kapalı lisans yok"}</small></div>
        <div><dt>Beklenen aylık</dt><dd className="cari-arti">{para(gelir)}</dd><small>ödeyenlerin aylık ücreti</small></div>
        <div>
          <dt>Sistem</dt>
          <dd className={kopru.ok ? undefined : "talep-uyari"}>{kopru.ok ? "Ayakta" : "Sorunlu"}</dd>
          <small>{kopru.not}</small>
        </div>
      </dl>
    </nav>

    <section className="panel-card" aria-label="Kiracılar">
      <h2>Kiracılar <small className="plt-substatus">{sayi(satirlar.length)} lisans</small></h2>
      {satirlar.length ? (
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Kurum</th><th>Durum</th><th>Paket</th><th>Aylık ücret</th><th>Dönem / deneme</th><th>Kullanıcı</th><th /></tr></thead>
            <tbody>
              {satirlar.map((s) => (
                <tr key={s.id}>
                  <td>{s.ad}</td>
                  <td><span className="status-pill" data-tone={LISANS_TONU[s.durum] ?? "neutral"}>{productLicenseLabels[s.durum] ?? s.durum}</span></td>
                  <td>{s.paket ? PAKET_ADI[s.paket] ?? s.paket : "—"}</td>
                  {/* Ücreti girilmemiş lisans ₺0 yazmıyor: eksik kayıt, ücretsiz değil. */}
                  <td>{s.ucret ? para(Number(s.ucret)) : <span className="talep-uyari">girilmedi</span>}</td>
                  <td>{s.durum === "trialing" ? `deneme ${tarih(s.denemeSonu)}` : s.donemSonu ? tarih(s.donemSonu) : "—"}</td>
                  <td>{sayi(s.kullanici)}</td>
                  <td><Link className="kiraci-baglanti" href={`/panel/platform?organization=${s.id}`}>Kiracı →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="panel-muted">Bu ürünün lisanslı kiracısı yok.</p>}
    </section>

    <section className="panel-card" aria-label="Fiyat basamakları">
      <h2>Fiyat basamakları</h2>
      <p className="panel-muted">Sitede ve kurulumda geçerli (yayımlanmış) tutarlar. KDV hariç; yıllıkta 10 ay bedeliyle 12 ay.</p>
      <div className="plt-table-scroll">
        <table className="plt-table">
          <thead><tr><th>Basamak</th><th>Aylık</th><th>Yıllık</th></tr></thead>
          <tbody>
            {basamaklar.map((plan) => {
              const aylik = planTutari(plan, fiyatlar);
              const yillik = planYillikTutari(plan, fiyatlar);
              return (
                <tr key={plan.code}>
                  <td>{plan.ad.tr}<small className="plt-substatus">{plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"} · <span className="plt-mono">{plan.code}</span></small></td>
                  <td>{aylik === null ? "Teklif" : para(aylik)}</td>
                  <td>{yillik === null ? "Teklif" : para(yillik)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>

    {bireyselVar ? (
      <section className="panel-card" aria-label="Bireysel aboneler">
        <h2>Bireysel aboneler</h2>
        <p className="panel-muted">
          Kurumu olmadan ürünü kişisel olarak kullananlar: {sayi(acikAbone)} açık abonelik, toplam {sayi(aboneler.length)} kayıt.
          {" "}<Link href="/panel/platform/subscribers">Bireysel abone planları →</Link>
        </p>
      </section>
    ) : null}
  </main>;
}
