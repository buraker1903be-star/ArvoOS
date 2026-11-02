import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { sayfaliSonuc, tumSatirlar, type SayfaliSonuc } from "@/lib/rapor-okuma";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ayEtiketi, aySecenekleri } from "@/lib/personel-hedefi";
import { productName } from "@/lib/products";
import { aylikRapor, degisimYuzdesi, type RaporAbonesi, type RaporKurumu, type RaporLisansi } from "@/lib/aylik-musteri-raporu";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { CsvIndir } from "../../components/csv-indir";
import { csvTutar } from "@/lib/csv";
import { turkiyeGunu } from "@/lib/otomatik-proforma";
import { para, sayi, tarih } from "../bicim";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";
import "./rapor.css";

export const metadata: Metadata = { title: "Aylık müşteri raporu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/*
  AYLIK MÜŞTERİ RAPORU (02.11.2026). Kural lib/aylik-musteri-raporu.ts
  (yeni / kaybedilen / ek ürün ve "kayıp" tanımı orada); gelir
  platform_tahsilat_aylik işlevinden, Tahsilat ekranının aylık
  grafiğiyle aynı sayılar.

  Bütün kayıtlar sayfalı okunuyor (satır tavanı sessizce keserdi).
  Kurumlar ve lisanslar sunucu anahtarıyla: kurum ayrıntısı ve abone
  kayıtları istemciye kapalı; kurucu sayfanın başında doğrulanıyor.
*/
/*
  closed_at migration 20261102101259 ile geldi. Migration canlıya
  uygulanmadan önce sütun yok ve sorgu 42703 ("sütun yok") veriyor;
  rapor o durumda sütunsuz okuyup dönem sonuna düşüyor — eksik sütun
  ekranı kapatmasın (AGENTS.md: eksik yapılandırma özelliği kısar,
  uygulamayı düşürmez). Başka her hata fırlatılıyor.
*/
/* Seçim metni çalışma anında kuruluyor; tipli istemcinin sütun ayrıştırıcısı şablon metni okuyamıyor. */
const alanlar = (temel: string, ek: string): string => temel + ek;
type Sayfala<T> = (bas: number, son: number) => PromiseLike<SayfaliSonuc<T>>;
async function kapanisliOku<T>(ad: string, kur: (secim: string) => (bas: number, son: number) => PromiseLike<unknown>): Promise<T[]> {
  const ilk = await sayfaliSonuc<T>(ad, kur(",closed_at") as Sayfala<T>);
  const sonuc = ilk.error?.code === "42703" ? await sayfaliSonuc<T>(ad, kur("") as Sayfala<T>) : ilk;
  if (sonuc.error) throw new Error(`${ad} okunamadı: ${sonuc.error.message}`);
  return sonuc.data ?? [];
}

const URUN = (kod: string) => productName(kod as Parameters<typeof productName>[0]);

export default async function AylikRaporSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı değil; rapor okunamıyor.");

  const bugun = todayInIstanbul();
  /* Son 12 ay; içinde bulunulan ay da var (ay sürüyor diye yazıyor). */
  const secenekler = aySecenekleri(bugun, 11, 0);
  const buAy = secenekler.at(-1)!;
  const { ay: istenen } = await searchParams;
  const ay = istenen && secenekler.includes(istenen) ? istenen : secenekler.at(-2) ?? buAy;
  const oncekiAy = secenekler[Math.max(0, secenekler.indexOf(ay) - 1)];

  const [kurumSatirlari, cekirdek, lisanslar, aboneler, gelirSonucu] = await Promise.all([
    tumSatirlar<{ id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null; created_at: string }>("kurumlar", (bas, son) =>
      admin.from("organizations").select("id,name,display_name,kind,grup_markasi,created_at").order("id").range(bas, son)),
    kapanisliOku<{ organization_id: string; license_status: string | null; current_period_end: string | null; trial_ends_at: string | null; closed_at?: string | null }>("çekirdek lisanslar",
      (secim) => (bas, son) => admin.from("organization_licenses").select(alanlar("organization_id,license_status,current_period_end,trial_ends_at", secim)).order("organization_id").range(bas, son)),
    kapanisliOku<RaporLisansi>("ürün lisansları",
      (secim) => (bas, son) => admin.from("organization_product_licenses").select(alanlar("organization_id,product,status,current_period_end,trial_ends_at,created_at", secim)).order("organization_id").order("product").range(bas, son)),
    tumSatirlar<{ id: string; email: string; full_name: string | null; product: string; status: string; created_at: string; closed_at: string | null; current_period_end: string | null; trial_ends_at: string | null }>("bireysel aboneler", (bas, son) =>
      admin.from("product_subscribers").select("id,email,full_name,product,status,created_at,closed_at,current_period_end,trial_ends_at").is("kurum_id", null).order("id").range(bas, son)),
    admin.rpc("platform_tahsilat_aylik", { p_ay: 13 }),
  ]);
  if (gelirSonucu.error) throw new Error("Aylık tahsilat okunamadı: " + gelirSonucu.error.message);

  const lisans = new Map(cekirdek.map((c) => [c.organization_id, c]));
  const kurumlar: RaporKurumu[] = kurumSatirlari.map((k) => {
    const c = lisans.get(k.id);
    return { id: k.id, ad: k.display_name || k.name, kind: k.kind, grup_markasi: k.grup_markasi, created_at: k.created_at,
      license_status: c?.license_status ?? null, current_period_end: c?.current_period_end ?? null, trial_ends_at: c?.trial_ends_at ?? null, closed_at: c?.closed_at ?? null };
  });
  const aboneListesi: RaporAbonesi[] = aboneler.map((a) => ({ ...a, ad: a.full_name?.trim() || a.email }));
  const r = aylikRapor(ay, kurumlar, lisanslar, aboneListesi);

  const gelir = new Map(((gelirSonucu.data ?? []) as { ay: string; tahsilat: number; tahsilat_adet: number }[]).map((g) => [String(g.ay).slice(0, 10), g]));
  const buGelir = Number(gelir.get(ay)?.tahsilat ?? 0);
  const oncekiGelir = Number(gelir.get(oncekiAy)?.tahsilat ?? 0);
  const degisim = degisimYuzdesi(buGelir, oncekiGelir);
  const yeni = r.yeniKurumlar.length + r.yeniAboneler.length;
  const kayip = r.kaybedilenKurumlar.length + r.kaybedilenAboneler.length;

  /* Rapor dosyası: her hareket bir satır, tür sütunuyla; en sonda ayın özeti. */
  const gun = (d: string) => turkiyeGunu(d);
  const csvSatirlari: (string | number | null)[][] = [
    ...r.yeniKurumlar.map((k) => ["Yeni müşteri", "Kurumsal", k.ad, null, gun(k.created_at)]),
    ...r.yeniAboneler.map((a) => ["Yeni müşteri", "Bireysel", a.ad, URUN(a.product), gun(a.created_at)]),
    ...r.kaybedilenKurumlar.map((k) => ["Kaybedilen", "Kurumsal", k.ad, null, k.bitis]),
    ...r.kaybedilenAboneler.map((a) => ["Kaybedilen", "Bireysel", a.ad, URUN(a.product), a.bitis]),
    ...r.ekUrunler.map((l) => ["Ek ürün", "Kurumsal", l.kurumAdi, URUN(l.product), gun(l.created_at)]),
    ["Özet", null, `Tahsilat ${ayEtiketi(ay)}`, csvTutar(buGelir), null],
    ["Özet", null, `Tahsilat ${ayEtiketi(oncekiAy)}`, csvTutar(oncekiGelir), null],
  ];

  return <main className="plt talep cari ekip finans-sayfa konsol-rapor">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link></small>
        <h1>Aylık müşteri raporu</h1>
        <p className="ek-alt">{ayEtiketi(ay)}{ay === buAy ? " · ay sürüyor, sayılar kesin değil" : ""} · yeni ve kaybedilen müşteriler, ek ürünler ve tahsilat.</p>
      </div>
      <div className="talep-bas-eylem">
        <CsvIndir basliklar={["Tür", "Müşteri türü", "Müşteri", "Ürün / tutar", "Tarih"]} satirlar={csvSatirlari}
          dosyaAdi={`musteri-raporu-${ay.slice(0, 7)}.csv`} etiket="Raporu indir (CSV)" aciklama="Ayın bütün hareketleri ve tahsilat özeti, Excel'de açılır" />
      </div>
    </header>

    <div className="ek-arac">
      <nav className="ek-segment rapor-aylar" aria-label="Rapor ayı">
        {[...secenekler].reverse().map((s) => (
          <Link key={s} href={`/panel/platform/rapor?ay=${s}`} className={s === ay ? "is-active" : undefined} aria-current={s === ay ? "page" : undefined}>{ayEtiketi(s)}</Link>
        ))}
      </nav>
    </div>

    <nav className="kayit-serit talep-serit" aria-label="Ayın özeti">
      <dl>
        <div><dt>Yeni müşteri</dt><dd className={yeni ? "cari-arti" : "talep-bos"}>{sayi(yeni)}</dd><small>{sayi(r.yeniKurumlar.length)} kurum · {sayi(r.yeniAboneler.length)} bireysel</small></div>
        <div><dt>Kaybedilen</dt><dd className={kayip ? "talep-uyari" : "talep-bos"}>{sayi(kayip)}</dd><small>{sayi(r.kaybedilenKurumlar.length)} kurum · {sayi(r.kaybedilenAboneler.length)} bireysel</small></div>
        <div><dt>Net değişim</dt><dd className={yeni - kayip > 0 ? "cari-arti" : yeni - kayip < 0 ? "talep-uyari" : undefined}>{yeni - kayip > 0 ? "+" : ""}{sayi(yeni - kayip)}</dd><small>müşteri</small></div>
        <div><dt>Ek ürün</dt><dd>{sayi(r.ekUrunler.length)}</dd><small>mevcut müşteriden</small></div>
        <div>
          <dt>Tahsilat</dt><dd>{para(buGelir)}</dd>
          <small>{degisim === null ? `${ayEtiketi(oncekiAy)}: tahsilat yok` : `${degisim >= 0 ? "+" : ""}${degisim}% · ${ayEtiketi(oncekiAy)} ${para(oncekiGelir)}`}</small>
        </div>
      </dl>
    </nav>

    <KNot>
      &quot;Kaybedilen&quot;: bugün açık hiçbir lisansı olmayan ve lisansları bu ay kapanan müşteri. Kapanış anı 2 Kasım 2026&apos;dan beri
      kaydediliyor; daha önce kapanan lisanslarda dönem (ya da deneme) sonu esas alınıyor. Tahsilat, Tahsilat ekranının aylık grafiğiyle aynı sayı.
    </KNot>

    <div className="rapor-izgara">
      <KKart baslik="Yeni müşteriler" sag={<span className="status-pill">{sayi(yeni)}</span>}>
        {yeni ? <KListe>
          {r.yeniKurumlar.map((k) => <KOge key={k.id} href={`/panel/platform/musteriler/${k.id}`} simge={k.ad} baslik={k.ad} alt="Kurumsal" deger={tarih(k.created_at)} />)}
          {r.yeniAboneler.map((a) => <KOge key={a.id} href="/panel/platform/subscribers" simge={a.ad} baslik={a.ad} alt={`Bireysel · ${URUN(a.product)}`} deger={tarih(a.created_at)} />)}
        </KListe> : <KBos baslik="Bu ay yeni müşteri yok" />}
      </KKart>

      <KKart baslik="Kaybedilen müşteriler" sag={<span className="status-pill">{sayi(kayip)}</span>}>
        {kayip ? <KListe>
          {r.kaybedilenKurumlar.map((k) => <KOge key={k.id} href={`/panel/platform/musteriler/${k.id}`} simge={k.ad} baslik={k.ad} alt="Kurumsal · son dönem bitti" deger={tarih(k.bitis)} />)}
          {r.kaybedilenAboneler.map((a) => <KOge key={a.id} href="/panel/platform/subscribers" simge={a.ad} baslik={a.ad} alt={`Bireysel · ${URUN(a.product)}${a.closed_at ? " · hesabı kapandı" : ""}`} deger={tarih(a.bitis)} />)}
        </KListe> : <KBos baslik="Bu ay kaybedilen müşteri yok" />}
      </KKart>

      <KKart baslik="Ek ürün alan müşteriler" aciklama="Mevcut müşterinin bu ay açtığı yeni ürün (deneme dahil)." sag={<span className="status-pill">{sayi(r.ekUrunler.length)}</span>}>
        {r.ekUrunler.length ? <KListe>
          {r.ekUrunler.map((l) => <KOge key={`${l.organization_id}-${l.product}`} href={`/panel/platform/musteriler/${l.organization_id}?pencere=urunler`} simge={l.kurumAdi} baslik={l.kurumAdi} alt={`${URUN(l.product)}${l.status === "trialing" ? " · deneme" : ""}`} deger={tarih(l.created_at)} />)}
        </KListe> : <KBos baslik="Bu ay ek ürün alımı yok" />}
      </KKart>
    </div>
  </main>;
}
