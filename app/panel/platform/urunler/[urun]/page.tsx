import { konsolAlaniniAc } from "../../konsol-alani";
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
import { KNot } from "../../konsol-ui";
import { ARC_APP, PRODUCT_APPS } from "@/lib/site/routes";
import { YAYIN_KODU } from "@/lib/paket-ucreti";
import { MobilSatir } from "../../../crm/table-cells";
import { SatirTiklama } from "../../../crm/satir-tiklama";
import { TalepAkis } from "../../../crm/kayit-detay/kayit-akis";
import { sayfaliSonuc } from "@/lib/rapor-okuma";
import { donem as donemiCoz, donemKodu } from "@/lib/konsol/donem";
import { bolumAdresi, bolumSirasi, urunBolumu } from "@/lib/konsol/urun-bolumleri";
import { urunPerformansi, type Okuma } from "@/lib/konsol/urun-performansi";
import { urunBekleyenleri } from "@/lib/konsol/urun-bekleyenler";
import { UrunGenelBakis, type IslemBekleyen } from "./urun-genel-bakis";
import "./urun-detay.css";
import { DonemSecici } from "../../../konsol-donem-secici";
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

export default async function UrunPage({ params, searchParams }: {
  params: Promise<{ urun: string }>;
  searchParams?: Promise<{ donem?: string; bolum?: string; ara?: string; durum?: string }>;
}) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "urunler");
  const { urun } = await params;
  const urunTanimi = PRODUCTS.find((p) => p.code === urun);
  if (!urunTanimi) notFound();
  const cekirdek = urun === "arvoos";
  const bireyselVar = SUBSCRIBER_PRODUCTS.some((p) => p.code === urun);
  /* Dönem ve bölüm adreste: derin bağlantı, yenileme ve geri/ileri. */
  const sorgu = await searchParams;
  const secilenDonem = donemiCoz(donemKodu(sorgu?.donem));
  const secilenBolum = urunBolumu(sorgu?.bolum);
  /* Müşteriler bölümünün arama ve durum süzgeci de ADRESTE: süzgeçli bir
     liste paylaşılabilsin ve yenileme süzgeci kaybetmesin. Süzgeç ÜRÜNE
     bağlı — bölüm değişince adreste kalıyor ama başka ürünün sayfasına
     taşınmıyor, çünkü taban adres ürünün kendisi. */
  const arananHam = (sorgu?.ara ?? "").trim();
  const seciliDurum = (sorgu?.durum ?? "").trim();

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

  /*
    DÖNEM ÖLÇÜMLERİ (26.11.2026). Sayılar Genel Bakış'taki tabloyla AYNI
    çekirdekten geliyor (lib/konsol/urun-performansi): iki ekranda iki
    farklı sayı çıkmasın. Okumalar SAYFALI — bir yılın ödemeleri
    PostgREST'in satır tavanını aşar ve toplam sessizce eksilir.
  */
  const [donemKurumOdemeleri, donemAboneOdemeleri, tumAboneler, bekleyenOdemeSayisi] = await Promise.all([
    sayfaliSonuc<{ organization_id: string; product: string | null; amount: number | null; reviewed_at: string | null }>(
      "dönem kurum ödemeleri",
      (bas, son) => supabase.from("organization_payment_requests").select("organization_id,product,amount,reviewed_at")
        .eq("status", "approved").eq("product", urun)
        .gte("reviewed_at", secilenDonem.baslangic).lt("reviewed_at", secilenDonem.bitis)
        .order("reviewed_at").range(bas, son)),
    bireyselVar
      ? sayfaliSonuc<{ subscriber_id: string; amount: number | null; paid_at: string | null }>(
          "dönem abone ödemeleri",
          (bas, son) => supabase.from("subscriber_payments").select("subscriber_id,amount,paid_at")
            .gte("paid_at", secilenDonem.baslangic).lt("paid_at", secilenDonem.bitis)
            .order("paid_at").range(bas, son))
      : Promise.resolve({ data: [], error: null }),
    bireyselVar
      ? sayfaliSonuc<{ id: string; product: string; status: string; trial_ends_at: string | null; created_at: string; full_name: string | null; email: string }>(
          "bireysel aboneler",
          (bas, son) => supabase.from("product_subscribers").select("id,product,status,trial_ends_at,created_at,full_name,email")
            .eq("product", urun).order("id").range(bas, son))
      : Promise.resolve({ data: [], error: null }),
    /*
      ÜRÜN KAPSAMINDA BEKLEYEN ÖDEME (27.11.2026). "İşlem bekleyenler"
      kartı sayı yazacaksa o sayı ürünün kendi kaydından gelmeli:
      organization_payment_requests kaynağında ürüne bağlı (product).
      head count — sınırlı bir listeden türetilmiyor.

      hata-tamam: okunamazsa satır sayısız çiziliyor; uydurma bir sayı
      yazmaktansa yazmamak doğru.
    */
    supabase.from("organization_payment_requests").select("id", { count: "exact", head: true })
      .eq("product", urun).eq("status", "pending")
      .then(({ count, error }) => (error ? null : count ?? 0), () => null),
  ]);
  const okumaOlarak = <T,>(sonuc: { data: T[] | null; error: { message: string } | null }): Okuma<T[]> =>
    sonuc.error || !sonuc.data ? { hata: true } : { veri: sonuc.data };
  /* Tahsilata yalnızca müşteri kurumlar girer (iç ekip ve grup markası hariç). */
  const musteriKurumKumesi = new Set(kiracilar.filter((k) => !k.grup_markasi).map((k) => k.id));
  const performansSatiri = urunPerformansi({
    donem: secilenDonem,
    cekirdek: { veri: kiracilar.map((k) => ({ organization_id: k.id, license_status: k.license_status })) },
    urunLisanslari: { veri: (urunSatirlari ?? []).map((u) => ({ organization_id: (u as { organization_id: string }).organization_id, product: urun, status: (u as { status: string }).status })) },
    aboneler: okumaOlarak(tumAboneler),
    aboneOdemeleri: okumaOlarak(donemAboneOdemeleri),
    kurumOdemeleri: okumaOlarak(donemKurumOdemeleri),
    musteriKurumlar: { veri: musteriKurumKumesi },
    urunler: [{ code: urun, name: urunTanimi.name }],
    aboneliUrunler: bireyselVar ? [urun] : [],
  })[0];

  /* İşlem bekleyenler: bu ürünün ekranlarına açılan kısayollar. Sayı
     üretilmiyor — kuyruğun kendisi konsolun ana ekranında.

     Bağlantı ÜRÜN SÜZGECİNİ taşır (yalnızca müşteri listesinde var:
     ?urun=<kod>). Ödeme ve destek kuyrukları ürün süzgeci almıyor;
     oraya süzgeç uydurmak yerine alt satır nereye gidildiğini yazıyor.
     Ürünün kodu adından ayrıdır (ArvoCal → randevu), bu yüzden
     bağlantıda `urun` değişkeni kullanılıyor, etiket değil. */
  /*
    İŞLEM BEKLEYENLER ÜRÜN KAPSAMINDA VE SAYILI (27.11.2026, onaylı
    mockup). Kural saf ve testli: lib/konsol/urun-bekleyenler. Sayısı
    sıfır olan satır çizilmiyor, okunamayan satır sayısız çiziliyor ve
    kaynağı olmayan iş (destek: talepler kuruma bağlı) hiç eklenmiyor.
  */
  const bekleyenler: IslemBekleyen[] = urunBekleyenleri({
    urunKodu: urun,
    lisanslar: satirlar.map((satir) => ({ durum: satir.durum, donemSonu: satir.donemSonu, denemeSonu: satir.denemeSonu })),
    aboneler: ((tumAboneler.data ?? []) as { status: string; trial_ends_at: string | null }[]),
    bekleyenOdeme: bekleyenOdemeSayisi,
    simdi: new Date(),
    sayi,
  });
  const basamaklar = planlar(urun as PricedProduct);
  /* Liste düşerse sekme "abone yok" demesin: hata kendi satırında yazılıyor. */
  const aboneListesiHatasi = (sonAboneSonucu as { error: { message: string } | null }).error?.message ?? null;
  const sonAboneler = ((sonAboneSonucu as { data: unknown[] | null }).data ?? []) as {
    id: string; full_name: string | null; email: string; status: string; trial_ends_at: string | null; current_period_end: string | null; created_at: string;
  }[];

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
  /*
    SEKME SEÇİMİ ADRESTE (26.11.2026, ürün kararı). Liste koşullu:
    bireysel aboneliği olmayan üründe "Abonelikler" hiç çizilmiyor, o
    yüzden anahtar ve etiket birlikte taşınıyor — sıra ikisinden
    türetiliyor (lib/konsol/urun-bolumleri.ts).
  */
  const taban = `/panel/platform/urunler/${urun}`;
  /*
    SEKME ADLARI SADE (27.11.2026, onaylı mockup): "Müşteriler · 12"
    yerine "Müşteriler". Sayı sekmede dururken şerit altı sekmede üç
    satıra sarıyor ve seçili sekmenin alt çizgisi kayıyordu; sayılar
    bölümün kendi içinde, başlığında yazılı.
  */
  const bolumler = [
    { anahtar: "genel-bakis", etiket: "Genel Bakış" },
    { anahtar: "musteriler", etiket: "Müşteriler" },
    { anahtar: "fiyat", etiket: "Fiyat basamakları" },
    ...(bireyselVar ? [{ anahtar: "abonelikler", etiket: "Abonelikler" }] : []),
    { anahtar: "tahsilat", etiket: "Tahsilat" },
    { anahtar: "destek", etiket: "Destek" },
  ];
  const sekmeler = bolumler.map((b) => b.etiket);
  const bolumAdresleri = bolumler.map((b) => bolumAdresi(taban, b.anahtar, secilenDonem.kod === "30g" ? null : secilenDonem.kod));
  const seciliSira = bolumSirasi(bolumler.map((b) => b.anahtar), secilenBolum);
  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );

  /*
    MÜŞTERİLER BÖLÜMÜNÜN SÜZGECİ (27.11.2026). Arama ad üzerinde,
    durum lisans durumunda; ikisi de SUNUCUDA uygulanıyor ve adreste
    duruyor. Süzülmüş sonuç boşsa "müşteri yok" DENMİYOR: süzgecin
    sonuç vermemesi ile ürünün hiç müşterisi olmaması ayrı durumlar.
  */
  const aranan = arananHam.toLocaleLowerCase("tr");
  const suzulmus = satirlar.filter((satir) =>
    (!aranan || satir.ad.toLocaleLowerCase("tr").includes(aranan))
    && (!seciliDurum || satir.durum === seciliDurum));
  const suzgecVar = Boolean(aranan || seciliDurum);
  const durumSecenekleri = [...new Set(satirlar.map((satir) => satir.durum))]
    .map((d) => ({ kod: d, ad: productLicenseLabels[d] ?? d }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));

  /*
    TAHSİLAT TABLOSU (27.11.2026, brief §5). Dönemin ürün kapsamındaki
    ödemeleri: kurum ödemeleri kaynağında ürüne bağlı (product sütunu),
    abone ödemeleri ise aboneden ürüne eşleşiyor. İADE SÜTUNU YOK —
    kaynakta iade kaydı tutulmuyor; olmayan bir durumu "0 iade" diye
    yazmak ölçülmemiş bir şeyi ölçülmüş göstermek olurdu.
  */
  const aboneAdlari = new Map(
    ((tumAboneler.data ?? []) as { id: string; full_name: string | null; email: string }[])
      .map((a) => [a.id, a.full_name || a.email]));
  const tahsilatOkunamadi = Boolean(donemKurumOdemeleri.error || (bireyselVar && donemAboneOdemeleri.error));
  const tahsilatSatirlari = [
    ...((donemKurumOdemeleri.data ?? []) as { organization_id: string; amount: number | null; reviewed_at: string | null }[])
      .map((o) => ({
        anahtar: `k-${o.organization_id}-${o.reviewed_at ?? ""}`,
        tarih: o.reviewed_at,
        kayit: kiraciHaritasi.get(o.organization_id)?.display_name || kiraciHaritasi.get(o.organization_id)?.name || "Kurum",
        tur: "Kurum ödemesi",
        tutar: Number(o.amount ?? 0),
        durum: { etiket: "Onaylandı", ton: "success" as const },
        href: "/panel/platform/payments",
      })),
    ...((donemAboneOdemeleri.data ?? []) as { subscriber_id: string; amount: number | null; paid_at: string | null }[])
      /* Abone ödemeleri kaynağında ürüne bağlı değil: bu ürünün
         abonelerine eşleşenler alınıyor (urun-performansi ile aynı kural). */
      .filter((o) => aboneAdlari.has(o.subscriber_id))
      .map((o) => ({
        anahtar: `a-${o.subscriber_id}-${o.paid_at ?? ""}`,
        tarih: o.paid_at,
        kayit: aboneAdlari.get(o.subscriber_id) ?? "Abone",
        tur: "Bireysel abone",
        tutar: Number(o.amount ?? 0),
        durum: { etiket: "Tahsil edildi", ton: "success" as const },
        href: "/panel/platform/tahsilat",
      })),
  ].sort((a, b) => (b.tarih ?? "").localeCompare(a.tarih ?? ""));

  return <main className="plt urun-detay-sayfa">
    <header className="urd-bas">
      <div className="urd-bas-metin">
        {/*
          Ürün listesine dönüş İÇERİKTEKİ yoldan (brief §2): sol
          menüdeki "Ana menüye dön" yalnızca menü katını değiştiriyor,
          bu bağlantı ise sayfayı değiştiriyor. İkisinin işi ayrı.
        */}
        <nav className="urd-yol" aria-label="Sayfa yolu">
          <Link href="/panel/platform/urunler">Ürünler</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{urunTanimi.name}</span>
        </nav>
        <div className="urd-ad">
          <h1>{urunTanimi.name}</h1>
          {/* Sağlık rozeti ürün listesindekiyle AYNI sözlükten. */}
          <span className="urun-saglik" data-tone={kopru.ok ? "success" : "danger"} title={kopru.not}>
            {kopru.ok ? "Sağlıklı" : "Dikkat gerektiriyor"}
          </span>
        </div>
        <p className="urd-alt">{[urunTanimi.description, uygulama?.host].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="urd-bas-eylem">
        {/* Dönem seçici BÖLÜMÜ korur: iki parametre birbirini silmiyor. */}
        <DonemSecici secili={secilenDonem.kod} taban={taban}
          ek={secilenBolum === "genel-bakis" ? undefined : `bolum=${secilenBolum}`} />
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            {uygulama ? <a className="os-menu-item" role="menuitem" href={uygulama.url} target="_blank" rel="noreferrer">Ürünü aç ↗</a> : null}
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/urunler?gorunum=moduller">Modül matrisi</Link>
            {bireyselVar ? <Link className="os-menu-item" role="menuitem" href="/panel/platform/subscribers">Bireysel abone planları</Link> : null}
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/saglik">Sistem sağlığı</Link>
          </div>
        </details>
      </div>
    </header>

    {/*
      SEKMELER İNCE AYIRICI ÜZERİNDE (27.11.2026, onaylı mockup).
      Bileşen değişmedi (crm/kayit-detay/kayit-akis · TalepAkis):
      adresli sekmeler, ok tuşları, dar ekranda seçici. Değişen yalnızca
      görünüm — kart kabuğu kalktı, seçili sekme kalın yazı ve alt
      çizgiyle ayrışıyor (urun-detay.css).
    */}
    <TalepAkis kimlik="urun-kart" sinif="urd-serit" darSecici etiket={`${urunTanimi.name} bölümleri`}
      sekmeler={sekmeler} adresler={bolumAdresleri} baslangic={seciliSira}>
      <section>
        <UrunGenelBakis satir={performansSatiri} donem={secilenDonem} para={para} sayi={sayi} bekleyenler={bekleyenler} />
      </section>

      <section className="urd-bolum">
        <header className="urd-bolum-bas">
          {/* Şerit kalktı (27.11.2026, onaylı mockup): ekranda tek bir
              sayı yüzeyi var, o da Genel Bakış'ın üç metriği. Şeridin
              taşıdığı iki bilgi — beklenen aylık ve grup içi değer —
              ait oldukları bölümün başlığına geçti; kaybolmadı. */}
          <div><h2>Müşteriler</h2><small>{sayi(satirlar.length)} lisans · {sayi(acik.length)} açık · beklenen aylık {para(gelir)}{grupDegeri ? ` (+ ${para(grupDegeri)} grup içi)` : ""}</small></div>
        </header>
        {/* Süzgeç GET formu: sonuç adreste, paylaşılabilir ve yenilemeye
            dayanıklı. Bölüm ve dönem gizli alanlarla korunuyor. */}
        <form className="urd-suzgec" method="get" action={taban}>
          <input type="hidden" name="bolum" value="musteriler" />
          {secilenDonem.kod === "30g" ? null : <input type="hidden" name="donem" value={secilenDonem.kod} />}
          <input className="urd-ara" type="search" name="ara" defaultValue={arananHam}
            placeholder="Müşteri adı" aria-label="Müşteri adında ara" />
          <select name="durum" defaultValue={seciliDurum} aria-label="Lisans durumu">
            <option value="">Bütün durumlar</option>
            {durumSecenekleri.map((d) => <option key={d.kod} value={d.kod}>{d.ad}</option>)}
          </select>
          <button className="panel-secondary" type="submit">Süz</button>
          {suzgecVar ? <Link className="urd-suzgec-sifirla" href={bolumAdresi(taban, "musteriler", secilenDonem.kod === "30g" ? null : secilenDonem.kod)}>Temizle</Link> : null}
        </form>
        {suzulmus.length ? (
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="ur-kiraci">
              <thead><tr><th>Müşteri</th><th>Paket</th><th>Kullanıcı</th><th className="crm-col-date">Dönem sonu</th><th className="crm-col-amount">Aylık</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {suzulmus.map((s) => {
                  const donem = s.durum === "trialing" ? s.denemeSonu : s.donemSonu;
                  const durum = { etiket: productLicenseLabels[s.durum] ?? s.durum, ton: LISANS_TONU[s.durum] ?? "neutral" };
                  const href = kiraciAdresi(s.id);
                  return (
                    <tr key={s.id} className={ACIK.has(s.durum) ? undefined : "is-pasif"}>
                      <td data-label="Müşteri">
                        <Link className="crm-row-link ek-kisi" href={href}>
                          <span className="ek-avatar" aria-hidden="true">{basHarfleri(s.ad)}</span>
                          <span className="ek-kisi-metin"><span className="crm-table-title" title={s.ad}>{s.ad}</span><span className="crm-table-sub">{grupKurumu.has(s.id) ? "Grup markası" : "Kurumsal"}</span></span>
                        </Link>
                      </td>
                      <td data-label="Paket">{s.paket ? <span className="crm-table-title">{PAKET_ADI[s.paket] ?? s.paket}</span> : <span className="crm-table-sub">—</span>}</td>
                      <td data-label="Kullanıcı"><span className="crm-table-title">{sayi(s.kullanici)}</span></td>
                      <td className="crm-col-date" data-label="Dönem sonu">{donem ? tarih(donem) : "—"}{donem ? <small>{s.durum === "trialing" ? "deneme bitişi" : "dönem sonu"}</small> : null}</td>
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
        ) : suzgecVar
          ? bos("Süzgece uyan müşteri yok", "Arama ya da durum süzgecini değiştirin. Ürünün lisanslı müşterisi var; bu süzgeçle eşleşen yok.")
          : bos("Lisanslı müşteri yok", "Bu ürünün lisanslı müşterisi yok. Bir müşteriye ürün açmak için müşteri kartının Ürünler ve lisans sekmesi.")}
      </section>

      <section className="urd-bolum">
        {/* Fiyat düzenleme eylemi kendi bölümünde: başlıkta dururken
            hangi bölümü etkilediği belli değildi. Yetki değişmedi. */}
        <header className="urd-bolum-bas">
          <div><h2>Fiyat basamakları</h2><small>Yalnızca {urunTanimi.name}; KDV dahil, yıllıkta 10 ay bedeli.</small></div>
          <Link className="panel-primary" href={`/panel/platform/fiyatlar?urun=${urun}`}>Fiyatları düzenle</Link>
        </header>
        {basamaklar.length ? (
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="ur-basamak">
              <thead><tr><th>Basamak</th><th>Birim</th><th className="crm-col-amount">Aylık</th><th className="crm-col-amount">Yıllık</th>{cekirdek ? <th>Müşteri</th> : null}</tr></thead>
              <tbody>
                {basamaklar.map((plan) => {
                  const aylik = planTutari(plan, fiyatlar);
                  const yillik = planYillikTutari(plan, fiyatlar);
                  const birim = plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına";
                  /* Paket kodu yalnızca ArvoOS'ta lisansa yazılıyor (YAYIN_KODU); öteki ürünlerde basamak başına müşteri sayılamıyor. */
                  const paketKodu = cekirdek ? Object.entries(YAYIN_KODU).find(([, kod]) => kod === plan.code)?.[0] : undefined;
                  return (
                    <tr key={plan.code}>
                      <td data-label="Basamak"><span className="crm-table-title">{plan.ad.tr}</span><span className="crm-table-sub plt-mono">{plan.code}</span></td>
                      <td data-label="Birim"><span className="crm-table-sub">{birim}</span></td>
                      <td className="crm-col-amount" data-label="Aylık"><span className="crm-table-title">{aylik === null ? "Teklif" : para(aylik)}</span></td>
                      <td className="crm-col-amount" data-label="Yıllık"><span className="crm-table-sub">{yillik === null ? "—" : para(yillik)}</span></td>
                      {cekirdek ? <td data-label="Müşteri"><span className="crm-table-title">{paketKodu ? sayi(satirlar.filter((s) => s.paket === paketKodu && ACIK.has(s.durum)).length) : "—"}</span></td> : null}
                      <MobilSatir baslik={plan.ad.tr} alt={[aylik === null ? "Teklif" : `${para(aylik)} / ay`, birim]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : bos("Yayımlanmış basamak yok", `${urunTanimi.name} için fiyat basamağı tanımlı değil. Fiyat listesinde tanımlandığında burada görünür.`)}
      </section>

      {bireyselVar ? (
        <section className="urd-bolum">
          <header className="urd-bolum-bas">
            <div><h2>Abonelikler</h2><small>{sayi(acikAbone)} açık abonelik · en yeni {sayi(SON_ABONE)} kayıt. Düzenleme Bireysel abone planlarında.</small></div>
          </header>
          {aboneListesiHatasi ? (
            <KNot ton="tehlike">Abone listesi okunamadı ({aboneListesiHatasi}) — &quot;abone yok&quot; demek değil.</KNot>
          ) : sonAboneler.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="ur-abone">
                <thead><tr><th>Abone</th><th>Paket</th><th className="crm-col-date">Dönem</th><th className="crm-col-amount">Ücret</th><th>Durum</th></tr></thead>
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
                        {/* Paket ve ücret bireysel abonelikte kaynakta tutulmuyor:
                            plan Bireysel abone planları ekranında tek, abone
                            satırında kopyası yok. Uydurmak yerine yazılıyor. */}
                        <td data-label="Paket"><span className="crm-table-sub">{urunTanimi.name} aboneliği</span></td>
                        <td className="crm-col-date" data-label="Dönem">{bitis ? tarih(bitis) : "—"}{bitis ? <small>{deneme ? "deneme bitişi" : "dönem sonu"}</small> : null}</td>
                        <td className="crm-col-amount" data-label="Ücret"><span className="k-ios-eksik">Kayıtta yok</span></td>
                        <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <MobilSatir href="/panel/platform/subscribers" baslik={ad} durum={durum}
                          alt={[`${urunTanimi.name} aboneliği`, bitis ? (deneme ? `deneme bitişi ${tarih(bitis)}` : `dönem sonu ${tarih(bitis)}`) : null, "Ücret kayıtta yok"]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Abonelik yok", `Bir kişi ${urunTanimi.name}'a kendi adına abone olduğunda burada listelenir.`)}
        </section>
      ) : null}

      <section className="urd-bolum">
        <header className="urd-bolum-bas">
          <div><h2>Tahsilat</h2><small>{secilenDonem.etiket} · onaylı kurum ödemeleri ve bireysel abone ödemeleri</small></div>
          <Link className="panel-secondary" href="/panel/platform/tahsilat">Tahsilat ekranı</Link>
        </header>
        <p className="urd-ozet">
          {performansSatiri.tahsilat.durum === "var"
            ? <>Bu dönemde <b>{para(performansSatiri.tahsilat.deger)}</b> tahsil edildi · {sayi(tahsilatSatirlari.length)} kayıt</>
            : performansSatiri.tahsilat.durum === "okunamadi"
              ? <><b>Veri okunamadı.</b> Ödeme kayıtları bu açılışta okunamadı.</>
              : <><b>Veri bağlı değil.</b></>}
        </p>
        {tahsilatOkunamadi ? (
          <KNot ton="tehlike">Ödeme kayıtları okunamadı — &quot;tahsilat yok&quot; demek değil.</KNot>
        ) : tahsilatSatirlari.length ? (
          <div className="talep-tablo fn-ic-tablo">
            <table className="crm-data-table" data-cols="ur-tahsilat">
              <thead><tr><th className="crm-col-date">Tarih</th><th>Kayıt</th><th className="crm-col-amount">Tutar</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {tahsilatSatirlari.map((t) => (
                  <tr key={t.anahtar}>
                    <td className="crm-col-date" data-label="Tarih">{t.tarih ? tarih(t.tarih) : "—"}</td>
                    <td data-label="Kayıt">
                      <Link className="crm-row-link" href={t.href}>
                        <span className="crm-table-title" title={t.kayit}>{t.kayit}</span>
                        <span className="crm-table-sub">{t.tur}</span>
                      </Link>
                    </td>
                    <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{para(t.tutar)}</span></td>
                    <td data-label="Durum"><span className="status-pill" data-tone={t.durum.ton}>{t.durum.etiket}</span></td>
                    <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    <MobilSatir href={t.href} baslik={t.kayit} durum={t.durum}
                      alt={[t.tur, t.tarih ? tarih(t.tarih) : null, para(t.tutar)]} />
                  </tr>
                ))}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        ) : bos("Bu dönemde tahsilat yok", `${secilenDonem.etiket} içinde ${urunTanimi.name} için onaylanmış ödeme kaydı yok. Dönemi değiştirip bakabilirsiniz.`)}
        {/* İade kaynakta tutulmuyor: olmayan bir durumu sütun yapmak
            ölçülmemiş bir şeyi ölçülmüş göstermek olurdu. */}
        <p className="urd-not">İade kaydı tutulmuyor; tabloda yalnızca tahsil edilen ödemeler var.</p>
      </section>

      <section className="urd-bolum">
        <header className="urd-bolum-bas">
          <div><h2>Destek</h2><small>Ürün kırılımı yok</small></div>
          <Link className="panel-secondary" href="/panel/platform/destek">Destek ekranı</Link>
        </header>
        {/*
          Destek talepleri KURUMA bağlı, ürüne değil (support_tickets'ta
          product sütunu yok). Ürün başına sayı üretmek, ölçülmemiş bir
          şeyi ölçülmüş göstermek olurdu.
        */}
        <p className="urd-ozet"><b>Veri bağlı değil.</b> Destek talepleri kuruma bağlı; ürün kırılımı tutulmadığı için {urunTanimi.name} kapsamında talep listesi üretilemiyor.</p>
      </section>
    </TalepAkis>
  </main>;
}
