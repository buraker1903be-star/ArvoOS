import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { musteriMi } from "@/lib/kurum-turu";
import { productName } from "@/lib/products";
import { donemTutari } from "@/lib/abonelik-tutari";
import { bireyselAylikUcret } from "@/lib/bireysel-ucret";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { turkiyeGunu } from "@/lib/otomatik-proforma";
import { dikkatIster, takvimiKur, type ProformaHali, type TakvimAboneligi, type TakvimProformasi, type TakvimSatiri } from "@/lib/yenileme-takvimi";
import { zorunlu } from "../konsol-oku";
import { sayfaliSonuc } from "@/lib/rapor-okuma";
import { KNot } from "../konsol-ui";
import { basHarfleri, para, sayi, tarih, tarihSaat } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";
import "./yenilemeler.css";

export const metadata: Metadata = { title: "Yenileme takvimi", robots: { index: false, follow: false } };

/*
  YENİLEME TAKVİMİ (29.10.2026, konsol: "önümüzdeki 30 günde dönemi
  dolacak abonelikler gün gün; proforma kesildi mi, gönderildi mi").

  Kural lib/yenileme-takvimi.ts'te. Burada okuma ve çizim:
   - Abonelikler lisans tablolarından (Abonelikler sayfasıyla aynı kaynak)
     ve bireysel ArvoLab abonelerinden. Arvo'nun kendi kurumu ve grup
     markaları ödeme yapmadığı için yok (lib/kurum-turu).
   - Tutar, proforma kesilmişse proformanın toplamı (müşteriye giden
     rakam), değilse ödeme bağlantısının hesapladığı dönem tutarı
     (ArvoOS'ta ek kullanıcılar dâhil, lib/abonelik-tutari).
   - Proformalar sunucu anahtarıyla (tablo istemciye kapalı).

  Lisans okumaları bilerek SINIRSIZ: kurum başına birkaç satır ve bir
  aboneliği atlamak takvimde boş bir gün demek. Proformalar son 90 günle
  sınırlı: eşleştirme dönem sonundan en çok 30 gün öncesine bakıyor.
*/
const PENCERE = 30;
const GORUNUMLER = [
  { kod: "", ad: "Tümü" },
  { kod: "dikkat", ad: "Dikkat isteyen" },
] as const;

const HAL: Record<ProformaHali["tur"], { ad: string; ton: string }> = {
  deneme: { ad: "Deneme", ton: "neutral" },
  kesilecek: { ad: "Kesilecek", ton: "neutral" },
  kesilmedi: { ad: "Kesilmedi", ton: "danger" },
  kesildi: { ad: "Kesildi · gönderilmedi", ton: "warning" },
  gonderildi: { ad: "Gönderildi", ton: "info" },
  odendi: { ad: "Ödendi", ton: "success" },
  iptal: { ad: "İptal edildi", ton: "neutral" },
};

const HAFTA = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
// Gün anahtarı UTC öğlene sabitlenip okunuyor: bir AN değil bir GÜN taşıyor.
const gunBasligi = (gun: string) => {
  const d = new Date(`${gun}T12:00:00Z`);
  return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${HAFTA[d.getUTCDay()]}`;
};
const kalanYazisi = (k: number) => (k < 0 ? `${-k} gün geçti` : k === 0 ? "bugün" : k === 1 ? "yarın" : `${k} gün sonra`);

export default async function YenilemelerPage({ searchParams }: { searchParams: Promise<{ gorunum?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; takvim okunamadı.");
  const { gorunum } = await searchParams;
  const secili = GORUNUMLER.find((g) => g.kod === gorunum)?.kod ?? "";
  const bugun = todayInIstanbul();
  const doksanGunOnce = new Date(Date.parse(`${bugun}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);

  const [kurumSonucu, cekirdekSonucu, urunSonucu, aboneSonucu, uyeSonucu, proformaSonucu, bireysel] = await Promise.all([
    /*
      ALTI OKUMA DA SAYFALI (29.10.2026). Takvimin bir aboneliği
      atlaması, o gün hiç yenileme yokmuş gibi görünmesi demek.
      PostgREST yanıtı 1.000 satırda kesiyor ve SÖYLEMİYOR; üye
      tablosu (kiracı × personel) ve proformalar en hızlı büyüyenler.

      `.limit(2000)` YANLIŞ GÜVEN veriyordu: tavanın üstünde bir sınır
      yazmak onu yükseltmiyor, yanıt yine 1.000'de kesiliyordu
      (lib/rapor-okuma başlığı).
    */
    sayfaliSonuc<{ id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null }>("kurumlar", (bas, son) =>
      supabase.from("organizations").select("id,name,display_name,kind,grup_markasi").order("id").range(bas, son)),
    sayfaliSonuc<{ organization_id: string; license_status: string; monthly_fee: number | null; user_limit: number | null; extra_user_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }>("çekirdek lisanslar", (bas, son) =>
      supabase.from("organization_licenses").select("organization_id,license_status,monthly_fee,user_limit,extra_user_fee,current_period_end,trial_ends_at")
        .in("license_status", ["active", "trialing", "past_due"]).order("organization_id").range(bas, son)),
    sayfaliSonuc<{ organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }>("ürün lisansları", (bas, son) =>
      supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at")
        .in("status", ["active", "trialing", "past_due"]).order("organization_id").range(bas, son)),
    sayfaliSonuc<{ id: string; product: string; email: string | null; full_name: string | null; status: string; current_period_end: string | null; trial_ends_at: string | null }>("bireysel aboneler", (bas, son) =>
      admin.from("product_subscribers").select("id,product,email,full_name,status,current_period_end,trial_ends_at").is("kurum_id", null)
        .in("status", ["active", "trialing", "past_due"]).order("id").range(bas, son)),
    // ArvoOS ek kullanıcı bedeli için etkin üye sayısı (kurum başına sayılıyor; tutar buna bağlı).
    sayfaliSonuc<{ organization_id: string }>("kurum üyeleri", (bas, son) =>
      admin.from("organization_memberships").select("organization_id").eq("is_active", true)
        .order("organization_id").range(bas, son)),
    sayfaliSonuc<TakvimProformasi>("proformalar", (bas, son) =>
      admin.from("platform_proformalari")
        .select("id,proforma_no,organization_id,subscriber_id,product,durum,otomatik,donem_sonu,duzenleme_tarihi,toplam,gonderildi_at,bildirildi_at,gonderim_hatasi")
        .gte("duzenleme_tarihi", doksanGunOnce).order("id").range(bas, son)),
    bireyselAylikUcret(admin, "arvolab"),
  ]);
  const kurumlar = zorunlu(kurumSonucu, "Kurumlar") ?? [];
  const cekirdek = zorunlu(cekirdekSonucu, "Çekirdek lisanslar") ?? [];
  const urunler = zorunlu(urunSonucu, "Ürün lisansları") ?? [];
  const aboneler = zorunlu(aboneSonucu, "Bireysel aboneler") ?? [];
  const uyeler = zorunlu(uyeSonucu, "Kurum üyeleri") ?? [];
  /*
    Otomatik proforma sütunları (20261029160309) yoksa takvim düşmüyor:
    proformalar o sütunlar olmadan okunuyor ve hepsi "elle kesilmiş"
    sayılıyor — eşleştirme yine çalışır, yalnızca gönderim bilgisi boş.
  */
  let proformaSatirlari = proformaSonucu;
  if (proformaSonucu.error?.code === "42703") {
    proformaSatirlari = await admin.from("platform_proformalari").select("id,proforma_no,organization_id,subscriber_id,product,durum,duzenleme_tarihi,toplam")
      .gte("duzenleme_tarihi", doksanGunOnce).limit(2000) as typeof proformaSonucu;
  }
  const proformalar = ((zorunlu(proformaSatirlari, "Proformalar") ?? []) as Partial<TakvimProformasi>[])
    .map((p) => ({ otomatik: false, donem_sonu: null, gonderildi_at: null, bildirildi_at: null, gonderim_hatasi: null, ...p }) as TakvimProformasi);

  type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null };
  const kurum = new Map((kurumlar as Kurum[]).map((k) => [k.id, k]));
  const uyeSayisi = new Map<string, number>();
  for (const u of uyeler as { organization_id: string }[]) uyeSayisi.set(u.organization_id, (uyeSayisi.get(u.organization_id) ?? 0) + 1);

  const bitisi = (durum: string, donem: string | null, deneme: string | null) => {
    const damga = durum === "trialing" ? deneme : donem;
    return damga ? turkiyeGunu(damga) : null;
  };
  const abonelikler: TakvimAboneligi[] = [
    ...(cekirdek as { organization_id: string; license_status: string; monthly_fee: number | null; user_limit: number | null; extra_user_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
      .flatMap((l) => {
        const k = kurum.get(l.organization_id);
        const bitis = bitisi(l.license_status, l.current_period_end, l.trial_ends_at);
        if (!k || !musteriMi(k) || !bitis) return [];
        const tutar = l.monthly_fee ? donemTutari({ urun: "arvoos", aylikUcret: l.monthly_fee, aktifKullanici: uyeSayisi.get(l.organization_id) ?? 0, kullaniciLimiti: l.user_limit, ekKullaniciUcreti: l.extra_user_fee ?? 0 }).tutar : null;
        return [{ anahtar: `arvoos:${l.organization_id}`, tur: "kurum" as const, musteriId: l.organization_id, musteriAdi: k.display_name || k.name, urun: "arvoos", durum: l.license_status, bitis, tutar }];
      }),
    ...(urunler as { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[])
      .flatMap((l) => {
        const k = kurum.get(l.organization_id);
        const bitis = bitisi(l.status, l.current_period_end, l.trial_ends_at);
        if (!k || !musteriMi(k) || !bitis) return [];
        return [{ anahtar: `${l.product}:${l.organization_id}`, tur: "kurum" as const, musteriId: l.organization_id, musteriAdi: k.display_name || k.name, urun: l.product, durum: l.status, bitis, tutar: l.monthly_fee ? Number(l.monthly_fee) : null }];
      }),
    ...(aboneler as { id: string; product: string; email: string; full_name: string | null; status: string; current_period_end: string | null; trial_ends_at: string | null }[])
      .flatMap((a) => {
        const bitis = bitisi(a.status, a.current_period_end, a.trial_ends_at);
        return bitis ? [{ anahtar: `abone:${a.id}`, tur: "abone" as const, musteriId: a.id, musteriAdi: a.full_name || a.email, urun: a.product, durum: a.status, bitis, tutar: bireysel.aylik }] : [];
      }),
  ];

  const takvim = takvimiKur(abonelikler, proformalar, bugun, PENCERE);
  const sadeceDikkat = secili === "dikkat";
  const gecikmis = sadeceDikkat ? takvim.gecikmis.filter(dikkatIster) : takvim.gecikmis;
  const gunler = takvim.gunler
    .map((g) => ({ ...g, satirlar: sadeceDikkat ? g.satirlar.filter(dikkatIster) : g.satirlar }))
    .filter((g) => g.satirlar.length);
  const gosterilen = gecikmis.length + gunler.reduce((t, g) => t + g.satirlar.length, 0);

  const satir = (s: TakvimSatiri) => {
    const href = s.tur === "kurum" ? `/panel/platform/musteriler/${s.musteriId}?pencere=odemeler` : "/panel/platform/subscribers";
    const hal = HAL[s.proforma.tur];
    const p = "proforma" in s.proforma ? s.proforma.proforma : null;
    const tutar = p ? Number(p.toplam) : s.tutar;
    const durum = { etiket: s.kalan < 0 ? kalanYazisi(s.kalan) : s.durum === "trialing" ? "Deneme bitiyor" : kalanYazisi(s.kalan), ton: s.kalan < 0 ? "danger" : s.kalan <= 3 ? "warning" : "info" };
    const proformaAlt = s.proforma.tur === "kesilecek" ? `otomatik ${tarih(`${s.proforma.gun}T12:00:00Z`)} sabahı`
      : p?.gonderildi_at ? `gönderildi ${tarihSaat(p.gonderildi_at)}`
      : p?.gonderim_hatasi ? p.gonderim_hatasi
      : s.proforma.tur === "kesilmedi" ? "otomatik iş kesmedi; ücret ya da alıcı eksik olabilir"
      : null;
    return (
      <tr key={s.anahtar} className={dikkatIster(s) ? "yt-dikkat" : undefined}>
        <td data-label="Müşteri">
          <Link className="crm-row-link ek-kisi" href={href}>
            <span className="ek-avatar" data-tur={s.tur === "abone" ? "bireysel" : undefined} aria-hidden="true">{basHarfleri(s.musteriAdi)}</span>
            <span className="ek-kisi-metin"><span className="crm-table-title" title={s.musteriAdi}>{s.musteriAdi}</span><span className="crm-table-sub">{productName(s.urun as Parameters<typeof productName>[0])}{s.tur === "abone" ? " · bireysel" : ""}</span></span>
          </Link>
        </td>
        <td data-label="Kalan"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
        <td className="crm-col-amount" data-label="Tutar">{tutar ? <span className="crm-table-title">{para(tutar)}</span> : <span className="k-ios-eksik">Ücret yok</span>}</td>
        <td data-label="Proforma">
          {p ? <Link className="status-pill" data-tone={hal.ton} href={`/panel/platform/tahsilat/proforma/${p.id}`} title={p.proforma_no}>{hal.ad}</Link>
            : <span className="status-pill" data-tone={hal.ton}>{hal.ad}</span>}
          {proformaAlt ? <span className="crm-table-sub yt-alt" title={proformaAlt}>{proformaAlt}</span> : null}
        </td>
        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
        <MobilSatir href={href} baslik={s.musteriAdi} durum={{ etiket: hal.ad, ton: hal.ton }}
          alt={[productName(s.urun as Parameters<typeof productName>[0]), durum.etiket, tutar ? para(tutar) : "ücret yok"]} />
      </tr>
    );
  };
  const grupSatiri = (anahtar: string, baslik: string, alt: string, adet: number, tutar: number) => (
    <tr key={`g-${anahtar}`} className="yt-gun">
      <th colSpan={5} scope="rowgroup"><b>{baslik}</b><small>{alt} · {adet} abonelik{tutar ? ` · ${para(tutar)}` : ""}</small></th>
    </tr>
  );

  return <main className="plt talep cari ekip talepler teklifler liste-sayfa finans-sayfa yenileme-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">FİNANS</small>
        <h1>Yenileme takvimi</h1>
        <p className="ek-alt">Önümüzdeki {PENCERE} günde dönemi dolan abonelikler gün gün; proforma dönem sonuna 3 gün kala otomatik kesilir.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/billing">Abonelikler</Link>
        <Link className="panel-secondary" href="/panel/platform/tahsilat?kanal=proforma">Proformalar</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Takvim özeti">
      <dl>
        <div><dt>{PENCERE} günde yenilenecek</dt><dd>{sayi(takvim.ozet.adet)}</dd><small>deneme dâhil</small></div>
        <div><dt>Beklenen tutar</dt><dd className={takvim.ozet.tutar ? "cari-arti" : "talep-bos"}>{takvim.ozet.tutar ? para(takvim.ozet.tutar) : "—"}</dd><small>KDV dahil, denemesiz</small></div>
        <div><dt>Proforması kesilen</dt><dd>{sayi(takvim.ozet.kesilen)}</dd><small>{sayi(takvim.ozet.gonderilen)} gönderildi · {sayi(takvim.ozet.odenen)} ödendi</small></div>
        <div><dt>Dikkat isteyen</dt><dd className={takvim.ozet.dikkat ? "talep-uyari" : undefined}><Link href="/panel/platform/yenilemeler?gorunum=dikkat">{sayi(takvim.ozet.dikkat)}</Link></dd><small>geciken, kesilmeyen ya da gönderilemeyen</small></div>
        <div><dt>Dönemi geçen</dt><dd className={takvim.gecikmis.length ? "talep-uyari" : undefined}>{sayi(takvim.gecikmis.length)}</dd><small>son 30 gün</small></div>
      </dl>
    </nav>

    <section className="panel-card talep-bilgi" aria-label="Yenileme takvimi">
      <div className="ekip-suzgec talep-suzgec ek-arac">
        <nav className="ek-segment" aria-label="Görünüm">
          {GORUNUMLER.map((g) => (
            <Link key={g.kod} href={g.kod ? `/panel/platform/yenilemeler?gorunum=${g.kod}` : "/panel/platform/yenilemeler"}
              className={secili === g.kod ? "is-active" : undefined} aria-current={secili === g.kod ? "page" : undefined}>
              {g.ad} <small>{sayi(g.kod === "dikkat" ? takvim.ozet.dikkat : takvim.ozet.adet + takvim.gecikmis.length)}</small>
            </Link>
          ))}
        </nav>
      </div>
      {takvim.gecikmis.some((s) => s.proforma.tur === "kesilmedi") || takvim.gunler.some((g) => g.satirlar.some((s) => s.proforma.tur === "kesilmedi"))
        ? <KNot ton="uyari">Dönem sonuna 3 günden az kalmış ve proforması kesilmemiş abonelik var. Otomatik iş ücreti girilmemiş lisansları ve otomatik yenilemesi açık olanları atlıyor; müşteri kartından elle proforma kesebilirsiniz.</KNot>
        : null}
      {gosterilen ? (
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="yt-takvim">
            <thead><tr><th>Müşteri</th><th>Kalan</th><th className="crm-col-amount">Tutar</th><th>Proforma</th><th></th></tr></thead>
            <tbody>
              {gecikmis.length ? <>
                {grupSatiri("gecikmis", "Dönemi geçenler", "ödemesi gelmedi", gecikmis.length, gecikmis.reduce((t, s) => t + (s.tutar ?? 0), 0))}
                {gecikmis.map(satir)}
              </> : null}
              {gunler.map((g) => <Fragment key={g.gun}>
                {grupSatiri(g.gun, gunBasligi(g.gun), kalanYazisi(g.satirlar[0].kalan), g.satirlar.length, g.satirlar.filter((s) => s.durum !== "trialing").reduce((t, s) => t + (s.tutar ?? 0), 0))}
                {g.satirlar.map(satir)}
              </Fragment>)}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
      ) : (
        <div className="crm-empty-state talep-bos-kutu ek-bos">
          <h2>{sadeceDikkat ? "Dikkat isteyen yenileme yok" : `Önümüzdeki ${PENCERE} günde yenileme yok`}</h2>
          <p>{sadeceDikkat ? "Bütün yaklaşan dönemlerin proforması zamanında kesilecek ya da kesildi." : "Dönemi dolacak bir abonelik olduğunda gün gün burada listelenir."}</p>
        </div>
      )}
    </section>
  </main>;
}
