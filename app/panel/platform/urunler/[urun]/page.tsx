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
import { KBos, KKart, KListe, KOge } from "../../konsol-ui";
import { LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../../bicim";
import "../../platform.css";

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
      .select("id,name,display_name,kind,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at,aktif_uye,grup_markasi"),
    cekirdek
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("organization_product_licenses")
          .select("organization_id,status,plan_code,monthly_fee,current_period_end,trial_ends_at").eq("product", urun),
    bireyselVar
      ? supabase.from("product_subscribers").select("status").eq("product", urun).is("kurum_id", null)
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
    grup_markasi?: boolean | null;
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
  /* Grup markasının ücreti müşteri geliri değil, grup içi değer (lib/kurum-turu). */
  const grupKurumu = new Set(kiracilar.filter((k) => k.grup_markasi).map((k) => k.id));
  const gelir = odeyen.filter((s) => !grupKurumu.has(s.id)).reduce((t, s) => t + Number(s.ucret ?? 0), 0);
  const grupDegeri = odeyen.filter((s) => grupKurumu.has(s.id)).reduce((t, s) => t + Number(s.ucret ?? 0), 0);
  const aboneler = (aboneSatirlari ?? []) as { status: string }[];
  const acikAbone = aboneler.filter((a) => ACIK.has(a.status)).length;
  const basamaklar = planlar(urun as PricedProduct);

  /* Sağdaki kartın dağılımı tablodaki satırlardan (sınırsız sorgu, eksilmez). */
  const durumSayilari = [...new Set(satirlar.map((s) => s.durum))]
    .map((d) => ({ ad: productLicenseLabels[d] ?? d, adet: satirlar.filter((s) => s.durum === d).length }))
    .sort((a, b) => b.adet - a.adet);
  // Ticari bağlam: satır müşteri detayına (14.10.2026); teknik ayarlar oradan.
  const kiraciAdresi = (id: string) => `/panel/platform/musteriler/${id}`;

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÜRÜNLER</small>
        <h1>{urunTanimi.name}</h1>
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
        <div><dt>Beklenen aylık</dt><dd className="cari-arti">{para(gelir)}</dd><small>{grupDegeri ? `+ ${para(grupDegeri)} grup içi değer` : "ödeyen müşterilerin ücreti"}</small></div>
        <div>
          <dt>Sistem</dt>
          <dd className={kopru.ok ? undefined : "talep-uyari"}>{kopru.ok ? "Ayakta" : "Sorunlu"}</dd>
          <small>{kopru.not}</small>
        </div>
      </dl>
    </nav>

    {/*
      iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): kiracılar sütun
      başlıksız tek satırlarda — simge, ad, altında paket · kullanıcı ·
      dönem; sağda durum ve aylık ücret. Eskiden yedi sütunlu tabloydu,
      kurum adları ikiye kırılıyordu. Sağ sütundaki dört sayı şeritteki
      sayıların AYNISIYDI; yerine yalnızca şeritte olmayanlar: lisans
      dağılımı, fiyat basamakları, bireysel aboneler.
    */}
    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Kiracılar">
        <header className="k-kart-bas">
          <div>
            <h2>Kiracılar</h2>
            <p>{sayi(satirlar.length)} lisans · ödeyenler önce</p>
          </div>
        </header>
        {satirlar.length ? (
          <KListe>
            {satirlar.map((s) => {
              const donem = s.durum === "trialing" ? `deneme ${tarih(s.denemeSonu)}` : s.donemSonu ? `dönem ${tarih(s.donemSonu)}` : null;
              return (
                <KOge
                  key={s.id}
                  href={kiraciAdresi(s.id)}
                  simge={s.ad}
                  baslik={s.ad}
                  alt={[grupKurumu.has(s.id) ? "Grup markası" : null, s.paket ? PAKET_ADI[s.paket] ?? s.paket : null, `${sayi(s.kullanici)} kullanıcı`, donem].filter(Boolean).join(" · ")}
                  durum={{ etiket: productLicenseLabels[s.durum] ?? s.durum, ton: LISANS_TONU[s.durum] ?? "neutral" }}
                  /* Ücreti girilmemiş lisans ₺0 yazmıyor: eksik kayıt, ücretsiz değil. */
                  deger={s.ucret ? para(Number(s.ucret)) : <span className="k-ios-eksik">Ücret yok</span>}
                  degerAlt={s.ucret ? "aylık" : "girilmedi"}
                />
              );
            })}
          </KListe>
        ) : <KBos baslik="Lisanslı kiracı yok" aciklama="Bu ürünün lisanslı kiracısı yok." />}
      </section>

      <div className="liste-sag">
        <KKart baslik="Lisans durumu">
          <KListe>
            {durumSayilari.map((d) => (
              <KOge key={d.ad} baslik={d.ad} deger={sayi(d.adet)} />
            ))}
          </KListe>
        </KKart>

        <KKart baslik="Fiyat basamakları" aciklama="Yayımlanmış tutarlar, KDV hariç"
          sag={<Link className="panel-secondary" href="/panel/platform/fiyatlar">Düzenle</Link>}>
          <KListe>
            {basamaklar.map((plan) => {
              const aylik = planTutari(plan, fiyatlar);
              const yillik = planYillikTutari(plan, fiyatlar);
              return (
                <KOge
                  key={plan.code}
                  baslik={plan.ad.tr}
                  alt={plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}
                  deger={aylik === null ? "Teklif" : para(aylik)}
                  degerAlt={yillik === null ? undefined : `${para(yillik)} / yıl`}
                />
              );
            })}
          </KListe>
        </KKart>

        {bireyselVar ? (
          <KKart baslik="Bireysel aboneler" sag={<Link className="panel-secondary" href="/panel/platform/subscribers">Planlar</Link>}>
            <KListe>
              <KOge baslik="Açık abonelik" deger={sayi(acikAbone)} />
              <KOge baslik="Kapalı" deger={sayi(aboneler.length - acikAbone)} />
            </KListe>
          </KKart>
        ) : null}
      </div>
    </div>
  </main>;
}
