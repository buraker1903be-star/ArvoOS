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
import { basHarfleri, LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../../bicim";
import { KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { ARC_APP, PRODUCT_APPS } from "@/lib/site/routes";
import { YAYIN_KODU } from "@/lib/paket-ucreti";
import { MobilSatir } from "../../../crm/table-cells";
import { SatirTiklama } from "../../../crm/satir-tiklama";
import { TalepAkis } from "../../../crm/kayit-detay/kayit-akis";
import { IstatistikKarti } from "../../../crm/istatistik-karti";
import "../../platform.css";
import "../../konsol-ui.css";
import "../../../hr/hr.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../finans.css";

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
/* Bireysel aboneler sekmesinde gösterilen en yeni kayıt sayısı. Sayılar
   (açık / kapalı) bundan bağımsız, sınırsız durum okumasından. */
const SON_ABONE = 50;
const ODEYEN = new Set(["active", "past_due"]);

export default async function UrunPage({ params }: { params: Promise<{ urun: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { urun } = await params;
  const urunTanimi = PRODUCTS.find((p) => p.code === urun);
  if (!urunTanimi) notFound();
  const cekirdek = urun === "arvoos";
  const bireyselVar = SUBSCRIBER_PRODUCTS.some((p) => p.code === urun);

  const [{ data: kiraciSatirlari, error: kiraciHatasi }, { data: urunSatirlari, error: urunHatasi }, { data: aboneSatirlari }, fiyatlar, sonAboneSonucu, kopru] = await Promise.all([
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
    bireyselVar
      ? supabase.from("product_subscribers").select("id,full_name,email,status,trial_ends_at,current_period_end,created_at")
          .eq("product", urun).is("kurum_id", null).order("created_at", { ascending: false }).limit(SON_ABONE)
      : Promise.resolve({ data: [], error: null }),
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
  /* Liste düşerse sekme "abone yok" demesin: hata kendi satırında yazılıyor. */
  const aboneListesiHatasi = (sonAboneSonucu as { error: { message: string } | null }).error?.message ?? null;
  const sonAboneler = ((sonAboneSonucu as { data: unknown[] | null }).data ?? []) as {
    id: string; full_name: string | null; email: string; status: string; trial_ends_at: string | null; current_period_end: string | null; created_at: string;
  }[];

  /* Sağdaki kartın dağılımı tablodaki satırlardan (sınırsız sorgu, eksilmez). */
  const durumSayilari = [...new Set(satirlar.map((s) => s.durum))]
    .map((d) => ({ ad: productLicenseLabels[d] ?? d, adet: satirlar.filter((s) => s.durum === d).length }))
    .sort((a, b) => b.adet - a.adet);
  // Ticari bağlam: satır müşteri detayına (14.10.2026); teknik ayarlar oradan.
  const kiraciAdresi = (id: string) => `/panel/platform/musteriler/${id}`;

  /*
    ÜRÜN KARTI (29.10.2026, kurum sahibi: "ürün sayfalarını da aynı
    kalitede"). Müşteri kartıyla aynı kalıp: başlık, sayı şeridi, solda
    sekmeli kart (Kiracılar · Fiyat basamakları · Bireysel aboneler),
    sağda ürünün kendisi (adres, köprü, lisans dağılımı). Bir gün önce
    kiracı tablosu tek başınaydı ve fiyatlar ile aboneler dar yan
    sütundaki sekmelere sıkışmıştı; bireysel aboneler yalnızca iki
    sayıydı, kim oldukları bu sayfada hiç görünmüyordu.

    Sekmeler istemci tarafında (TalepAkis): üç sekmenin verisi zaten
    okunuyor ve hepsi küçük; adreste sekme tutmak gerekmiyor.
  */
  const uygulama = urun === "arc" ? ARC_APP : (PRODUCT_APPS as Record<string, { url: string; host: string } | undefined>)[urun];
  const sekmeler = [
    `Kiracılar · ${sayi(satirlar.length)}`,
    "Fiyat basamakları",
    ...(bireyselVar ? [`Bireysel aboneler · ${sayi(acikAbone)}`] : []),
  ];
  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );

  return <main className="plt talep cari ekip urun-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/urunler">ÜRÜNLER</Link> · {urunTanimi.badge}</small>
        <h1>{urunTanimi.name}</h1>
        <p className="ek-alt">{[urunTanimi.description, uygulama?.host].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-primary" href={`/panel/platform/fiyatlar?urun=${urun}`}>Fiyatları düzenle</Link>
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            {uygulama ? <a className="os-menu-item" role="menuitem" href={uygulama.url} target="_blank" rel="noreferrer">Ürünü aç ↗</a> : null}
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/moduller">Modül matrisi</Link>
            {bireyselVar ? <Link className="os-menu-item" role="menuitem" href="/panel/platform/subscribers">Bireysel abone planları</Link> : null}
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/saglik">Sistem sağlığı</Link>
          </div>
        </details>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label={`${urunTanimi.name} özeti`}>
      <dl>
        {/* "Kiracı", "müşteri" değil: grup markaları da bu sayıda (ürünü
            kullanıyorlar), oysa konsolun geri kalanında "müşteri" onları
            dışarıda bırakıyor (lib/kurum-turu). */}
        <div><dt>Kiracı</dt><dd>{sayi(acik.length)}</dd><small>lisansı açık kurum (deneme dahil)</small></div>
        <div><dt>Ödeyen</dt><dd>{sayi(odeyen.length)}</dd><small>{satirlar.length - acik.length ? `${sayi(satirlar.length - acik.length)} askıda/iptal/kapalı` : "kapalı lisans yok"}</small></div>
        <div><dt>Beklenen aylık</dt><dd className="cari-arti">{para(gelir)}</dd><small>{grupDegeri ? `+ ${para(grupDegeri)} grup içi değer` : "ödeyen müşterilerin ücreti"}</small></div>
        {bireyselVar ? <div><dt>Bireysel abone</dt><dd>{sayi(acikAbone)}</dd><small>{sayi(aboneler.length - acikAbone)} kapalı</small></div> : null}
        <div>
          <dt>Köprü</dt>
          <dd className={kopru.ok ? "cari-arti" : "talep-uyari"}>{kopru.ok ? "Ayakta" : "Sorunlu"}</dd>
          <small>{kopru.not}</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <TalepAkis kimlik="urun-kart" sinif="sy-kart" etiket={`${urunTanimi.name} kartı`} sekmeler={sekmeler}>
        <section>
          {satirlar.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="ur-kiraci">
                <thead><tr><th>Kiracı</th><th>Paket</th><th>Kullanıcı</th><th className="crm-col-date">Dönem</th><th className="crm-col-amount">Aylık</th><th>Durum</th><th></th></tr></thead>
                <tbody>
                  {satirlar.map((s) => {
                    const donem = s.durum === "trialing" ? s.denemeSonu : s.donemSonu;
                    const durum = { etiket: productLicenseLabels[s.durum] ?? s.durum, ton: LISANS_TONU[s.durum] ?? "neutral" };
                    const href = kiraciAdresi(s.id);
                    return (
                      <tr key={s.id} className={ACIK.has(s.durum) ? undefined : "is-pasif"}>
                        <td data-label="Kiracı">
                          <Link className="crm-row-link ek-kisi" href={href}>
                            <span className="ek-avatar" aria-hidden="true">{basHarfleri(s.ad)}</span>
                            <span className="ek-kisi-metin"><span className="crm-table-title" title={s.ad}>{s.ad}</span><span className="crm-table-sub">{grupKurumu.has(s.id) ? "Grup markası" : "Kurumsal"}</span></span>
                          </Link>
                        </td>
                        <td data-label="Paket">{s.paket ? <span className="crm-table-title">{PAKET_ADI[s.paket] ?? s.paket}</span> : <span className="crm-table-sub">—</span>}</td>
                        <td data-label="Kullanıcı"><span className="crm-table-title">{sayi(s.kullanici)}</span></td>
                        <td className="crm-col-date" data-label="Dönem">{donem ? tarih(donem) : "—"}{donem ? <small>{s.durum === "trialing" ? "deneme bitişi" : "dönem sonu"}</small> : null}</td>
                        {/* Ücreti girilmemiş lisans ₺0 yazmıyor: eksik kayıt, ücretsiz değil. */}
                        <td className="crm-col-amount" data-label="Aylık">{s.ucret ? <span className="crm-table-title">{para(Number(s.ucret))}</span> : <span className="k-ios-eksik">Ücret yok</span>}</td>
                        <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                        <MobilSatir href={href} baslik={s.ad} durum={durum}
                          alt={[s.paket ? PAKET_ADI[s.paket] ?? s.paket : null, `${sayi(s.kullanici)} kullanıcı`, donem ? tarih(donem) : null, s.ucret ? `${para(Number(s.ucret))} / ay` : null]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Lisanslı kiracı yok", "Bu ürünün lisanslı kiracısı yok. Bir müşteriye ürün açmak için müşteri kartının Ürünler ve lisans sekmesi.")}
        </section>

        <section>
          <header className="phr-bas fn-alt-bas"><h2>Yayımlanmış fiyatlar</h2><small>KDV dahil; yıllıkta 10 ay bedeli. Değiştirmek için Fiyatları düzenle.</small></header>
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="ur-basamak">
              <thead><tr><th>Basamak</th><th>Birim</th><th className="crm-col-amount">Aylık</th><th className="crm-col-amount">Yıllık</th>{cekirdek ? <th>Kiracı</th> : null}</tr></thead>
              <tbody>
                {basamaklar.map((plan) => {
                  const aylik = planTutari(plan, fiyatlar);
                  const yillik = planYillikTutari(plan, fiyatlar);
                  const birim = plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına";
                  /* Paket kodu yalnızca ArvoOS'ta lisansa yazılıyor (YAYIN_KODU); öteki ürünlerde basamak başına kiracı sayılamıyor. */
                  const paketKodu = cekirdek ? Object.entries(YAYIN_KODU).find(([, kod]) => kod === plan.code)?.[0] : undefined;
                  return (
                    <tr key={plan.code}>
                      <td data-label="Basamak"><span className="crm-table-title">{plan.ad.tr}</span><span className="crm-table-sub plt-mono">{plan.code}</span></td>
                      <td data-label="Birim"><span className="crm-table-sub">{birim}</span></td>
                      <td className="crm-col-amount" data-label="Aylık"><span className="crm-table-title">{aylik === null ? "Teklif" : para(aylik)}</span></td>
                      <td className="crm-col-amount" data-label="Yıllık"><span className="crm-table-sub">{yillik === null ? "—" : para(yillik)}</span></td>
                      {cekirdek ? <td data-label="Kiracı"><span className="crm-table-title">{paketKodu ? sayi(satirlar.filter((s) => s.paket === paketKodu && ACIK.has(s.durum)).length) : "—"}</span></td> : null}
                      <MobilSatir baslik={plan.ad.tr} alt={[aylik === null ? "Teklif" : `${para(aylik)} / ay`, birim]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {bireyselVar ? (
          <section>
            <header className="phr-bas fn-alt-bas"><h2>Bireysel aboneler</h2><small>Kendi adına abone olanlar; en yeni {sayi(SON_ABONE)} kayıt. Düzenleme Bireysel aboneler ekranında.</small></header>
            {aboneListesiHatasi ? (
              <KNot ton="tehlike">Abone listesi okunamadı ({aboneListesiHatasi}) — &quot;abone yok&quot; demek değil.</KNot>
            ) : sonAboneler.length ? (
              <div className="talep-tablo fn-ic-tablo">
                <table className="crm-data-table" data-cols="ur-abone">
                  <thead><tr><th>Abone</th><th className="crm-col-date">Kayıt</th><th className="crm-col-date">Bitiş</th><th>Durum</th></tr></thead>
                  <tbody>
                    {sonAboneler.map((a) => {
                      const ad = a.full_name || a.email;
                      const deneme = a.status === "trialing";
                      const bitis = deneme ? a.trial_ends_at : a.current_period_end;
                      const durum = { etiket: productLicenseLabels[a.status] ?? a.status, ton: LISANS_TONU[a.status] ?? "neutral" };
                      return (
                        <tr key={a.id} className={ACIK.has(a.status) ? undefined : "is-pasif"}>
                          <td data-label="Abone">
                            <Link className="crm-row-link ek-kisi" href="/panel/platform/subscribers">
                              <span className="ek-avatar" data-tur="bireysel" aria-hidden="true">{basHarfleri(ad)}</span>
                              <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span>{a.full_name ? <span className="crm-table-sub" title={a.email}>{a.email}</span> : null}</span>
                            </Link>
                          </td>
                          <td className="crm-col-date" data-label="Kayıt">{tarih(a.created_at)}</td>
                          <td className="crm-col-date" data-label="Bitiş">{bitis ? tarih(bitis) : "—"}{bitis ? <small>{deneme ? "deneme bitişi" : "dönem sonu"}</small> : null}</td>
                          <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                          <MobilSatir href="/panel/platform/subscribers" baslik={ad} durum={durum} alt={[a.full_name ? a.email : null, bitis ? tarih(bitis) : null]} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <SatirTiklama />
              </div>
            ) : bos("Bireysel abone yok", `Bir kişi ${urunTanimi.name}'a kendi adına abone olduğunda burada listelenir.`)}
          </section>
        ) : null}
      </TalepAkis>

      <div className="liste-sag">
        <KKart baslik="Ürün">
          <KListe>
            <KOge baslik="Kod" deger={<span className="plt-mono">{urun}</span>} />
            {uygulama ? <KOge baslik="Adres" deger={<a href={uygulama.url} target="_blank" rel="noreferrer">{uygulama.host}</a>} /> : null}
            <KOge baslik="Veritabanı" alt={kopru.not} deger={cekirdek ? "Konsolla ortak" : "Ayrı (köprüyle)"} />
            <KOge baslik="Köprü" durum={{ etiket: kopru.ok ? "Ayakta" : "Sorunlu", ton: kopru.ok ? "success" : "danger" }} />
          </KListe>
        </KKart>
        <TalepAkis kimlik="urun-sag" sinif="ek-sag" etiket={`${urunTanimi.name} istatistikleri`} sekmeler={["İstatistikler"]}>
          <IstatistikKarti
            kapsam="bütün lisanslar"
            kutular={[
              { ad: "Lisans", deger: sayi(satirlar.length), alt: `${sayi(acik.length)} açık` },
              { ad: "Ödeyen", deger: sayi(odeyen.length), alt: "aktif ya da gecikmiş" },
              { ad: "Kullanıcı", deger: sayi(acik.reduce((t, s) => t + s.kullanici, 0)), alt: "açık kiracıların üyeleri" },
              { ad: "Ücreti girilmemiş", deger: sayi(odeyen.filter((s) => !s.ucret).length), alt: "ödeyen lisans", ton: odeyen.some((s) => !s.ucret) ? "uyari" : undefined },
            ]}
            gruplar={[{ baslik: "Lisans durumuna göre", satirlar: durumSayilari }]}
          />
        </TalepAkis>
      </div>
    </div>
  </main>;
}
