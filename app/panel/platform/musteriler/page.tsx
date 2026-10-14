import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { bireyselListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../bicim";
import "../platform.css";
// Panelin liste sayfası kalıbı (talep-bas, kayit-serit, talep-izgara) ve
// tablosunun CSS'i konsol-ui.tsx'in import ettiği dosyalardan geliyor.

/*
  MÜŞTERİLER (14.10.2026).

  Konsolda müşteri iki ayrı ekrandaydı: "Kiracılar" (kurumlar) ve
  "Bireysel aboneler". İkisi de aynı soruyu yanıtlıyordu — "bize kim
  ödüyor, kimin erişimi açık" — ama kurucunun iki ayrı yere bakması,
  iki ayrı sayım görmesi ve toplamı kafasında birleştirmesi gerekiyordu.
  Tek liste, iki süzgeç: Kurumsal ve Bireysel (panelin işler listesindeki
  kalıbın aynısı).

  Düzen de panelin liste sayfalarıyla aynı: SOLDA liste, SAĞDA
  özet kartları (eskiden istatistik kartı; şeridi tekrar ediyordu).

  Sayfa OKUNUR. Kurumsal satır kiracı dosyasına, bireysel satır abonelik
  ekranına götürür; düzenleme oralarda yapılır. Aynı işi iki yerde
  yapılabilir kılmak, birinin kuralı atlaması demek.

  KAPSAMLI SATIR (14.10.2026, kurum sahibinin isteği). Satır eskiden
  yalnızca tür, kullanıcı sayısı ve durum yazıyordu; ücret sütunu çoğu
  kurumda "—" idi çünkü yalnızca ArvoOS çekirdek ücretine bakıyordu.
  Artık bir müşterinin bütün ilişkisi tek satırda: kullandığı her ürün
  durum renginde bir rozet, aylık tutar BÜTÜN ödeyen ürünlerin toplamı,
  altında en yakın yenileme; özet satırında paket, kullanıcı, telefon,
  kayıt tarihi. Liste ürüne göre süzülüyor ve ada / gelire / kayıt
  tarihine göre sıralanıyor.
*/

type Kurum = {
  id: string;
  name: string;
  display_name: string | null;
  kind: string | null;
  provisioning_state: string;
  license_status: string | null;
  plan_code: string | null;
  monthly_fee: number | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  user_limit: number | null;
  aktif_uye: number;
  contact_phone: string | null;
};
type UrunLisansi = { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };

type Abone = {
  id: string;
  product: string;
  email: string;
  full_name: string | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
};

type Satir = {
  anahtar: string;
  tur: "kurumsal" | "bireysel";
  ad: string;
  alt: string;
  href: string;
  durum: string;
  ton: "success" | "warning" | "danger" | "neutral";
  ucret: number;
  olusma: string | null;
  /** Kullandığı ürünler, durum renginde (kurumsal: çekirdek + ek ürünler). */
  urunler: { kod: string; etiket: string; ton: string }[];
  /** En yakın yenileme ya da deneme bitişi (gösterim için). */
  yenileme: string | null;
  ucretGirilmedi: boolean;
};

const ACIK = new Set(["active", "trialing", "past_due"]);
const kisaUrun = (kod: string) => PRODUCTS.find((p) => p.code === kod)?.name.replace("Arvo ", "") ?? kod;

const KURUM_DURUMU: Record<string, { ad: string; ton: Satir["ton"] }> = {
  active: { ad: "Kullanımda", ton: "success" },
  trialing: { ad: "Denemede", ton: "warning" },
  past_due: { ad: "Ödeme gecikti", ton: "danger" },
  suspended: { ad: "Askıda", ton: "danger" },
  canceled: { ad: "İptal", ton: "neutral" },
};

const ODEYEN = new Set(["active", "past_due"]);

/* Deneme ya da aktif dönem sürüyorsa erişim açık (köprüdeki kuralın
   aynısı; abonelik ekranındaki hasAccess ile birebir). */
function bireyselErisim(abone: Abone, simdi: number) {
  if (abone.status === "trialing") return Boolean(abone.trial_ends_at && Date.parse(abone.trial_ends_at) > simdi);
  if (abone.status === "active") return !abone.current_period_end || Date.parse(abone.current_period_end) > simdi;
  return false;
}

/* Şimdiki zaman bileşen DIŞINDA okunuyor (react-hooks/purity): sunucu
   bileşeninin gövdesinde Date.now() çağırmak saf olmayan bir çağrı. */
function bireyselSatirlariKur(aboneler: Abone[], liste: (urun: string) => number | null): Satir[] {
  const simdi = Date.now();
  return aboneler.map((abone) => {
    const acik = bireyselErisim(abone, simdi);
    const durumTonu = !acik ? "danger" : abone.status === "trialing" ? "warning" : "success";
    /* Tutar ürünün yayımlanmış bireysel fiyatı (köprünün tahsil ettiği,
       lib/paket-ucreti); yalnızca ödeyen abonede yazılıyor. */
    const fiyat = acik && abone.status === "active" ? liste(abone.product) : null;
    return {
      urunler: [{ kod: abone.product, etiket: kisaUrun(abone.product), ton: durumTonu }],
      yenileme: abone.status === "trialing" ? abone.trial_ends_at : abone.current_period_end,
      ucretGirilmedi: false,
      anahtar: `b-${abone.id}`,
      tur: "bireysel" as const,
      ad: abone.full_name?.trim() || abone.email,
      /* Adı girilmemiş abonede ad zaten e-posta: alt satıra ikinci kez
         yazmak aynı adresi alt alta göstermek olurdu. */
      alt: abone.full_name?.trim()
        ? `${productName(abone.product as Parameters<typeof productName>[0])} · ${abone.email}`
        : productName(abone.product as Parameters<typeof productName>[0]),
      href: "/panel/platform/subscribers",
      durum: !acik ? "Erişim kapalı" : abone.status === "trialing" ? "Denemede" : "Ödüyor",
      ton: (!acik ? "danger" : abone.status === "trialing" ? "warning" : "success") as Satir["ton"],
      ucret: fiyat ?? 0,
      olusma: abone.created_at,
    };
  });
}

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (deger: string) =>
  deger.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

const SIRALAR = [
  { kod: "ad", ad: "Ada göre" },
  { kod: "gelir", ad: "Gelire göre" },
  { kod: "yeni", ad: "En yeni" },
] as const;

export default async function MusterilerPage({ searchParams }: {
  searchParams: Promise<{ tur?: string; ara?: string; urun?: string; sira?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { tur, ara, urun, sira } = await searchParams;
  const secilenUrun = PRODUCTS.some((p) => p.code === urun) ? urun! : null;
  const secilenSira = SIRALAR.some((x) => x.kod === sira) ? sira! : "ad";
  const secilenTur = tur === "kurumsal" || tur === "bireysel" ? tur : null;
  const aranan = (ara ?? "").trim().slice(0, 80);

  /*
    İki kaynak, iki sorgu. Bireysel abone sınırı 1000: tamamını
    kapsamadığında ekranda yazıyor (eksikKapsam), sessiz bir eksilme yok.
  */
  const LISTE_SINIRI = 1000;
  const [{ data: kurumSatirlari }, { data: aboneSatirlari, count: aboneSayisi, error }, { data: urunSatirlari, error: urunHatasi }, { data: kayitTarihleri }, { data: planSatirlari }, fiyatlar] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,provisioning_state,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at,user_limit,aktif_uye,contact_phone")
      .order("name"),
    supabase.from("product_subscribers")
      .select("id,product,email,full_name,status,trial_ends_at,current_period_end,created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(LISTE_SINIRI),
    // Ek ürün lisansları: kiracı başına birkaç satır, bilerek sınırsız (rozet ve aylık toplam).
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at"),
    // Kayıt tarihi görünümde yok; kiracı sayısı kadar küçük bir okuma.
    supabase.from("organizations").select("id,created_at"),
    // ArvoARC'ın bireysel fiyatı listede değil, ürün planında.
    supabase.from("product_plans").select("product,individual_monthly_fee"),
    yayimlananFiyatlar(),
  ]);
  if (error) throw new Error(`Bireysel aboneler okunamadı: ${error.message}`);
  // Rozet ve toplam bu okumaya dayanıyor: okunamaması "ürünü yok" demek değil.
  if (urunHatasi) throw new Error(`Ürün lisansları okunamadı: ${urunHatasi.message}`);
  const urunLisanslari = (urunSatirlari ?? []) as UrunLisansi[];
  const kayitTarihi = new Map(((kayitTarihleri ?? []) as { id: string; created_at: string }[]).map((k) => [k.id, k.created_at]));
  const planUcreti = new Map(((planSatirlari ?? []) as { product: string; individual_monthly_fee: number | null }[]).map((p) => [p.product, p.individual_monthly_fee === null ? null : Number(p.individual_monthly_fee)]));
  const bireyselFiyat = (urunKodu: string) => {
    const liste = bireyselListeFiyatiKurus(urunKodu, fiyatlar);
    return liste !== undefined ? liste : planUcreti.get(urunKodu) ?? null;
  };

  /* Kendi markalarımız müşteri değil: aynı tüzel kişiliğin kendi kendine
     ödemesi geliri şişirir. Listede de sayımda da yoklar. */
  const kurumlar = ((kurumSatirlari ?? []) as unknown as Kurum[]).filter((kurum) => kurum.kind !== "internal");
  const aboneler = (aboneSatirlari ?? []) as Abone[];
  const toplamAbone = aboneSayisi ?? aboneler.length;
  const eksikKapsam = toplamAbone > aboneler.length;

  const urunleriKurumun = new Map<string, UrunLisansi[]>();
  for (const l of urunLisanslari) urunleriKurumun.set(l.organization_id, [...(urunleriKurumun.get(l.organization_id) ?? []), l]);

  const kurumsalSatirlar: Satir[] = kurumlar.map((kurum) => {
    const durum = kurum.provisioning_state === "failed"
      ? { ad: "Kurulum hatası", ton: "danger" as const }
      : KURUM_DURUMU[kurum.license_status ?? ""] ?? { ad: "Kurulum sürüyor", ton: "warning" as const };
    const ekler = (urunleriKurumun.get(kurum.id) ?? []).filter((l) => l.status !== "inactive");
    /* Kullandığı ürünler: çekirdek lisans (ArvoOS) + ek ürün lisansları,
       her biri kendi durum renginde; kapalı olanlar da görünür (soluk). */
    const urunler = [
      ...(kurum.license_status ? [{ kod: "arvoos", etiket: "ArvoOS", ton: ACIK.has(kurum.license_status) ? LISANS_TONU[kurum.license_status] ?? "neutral" : "neutral" }] : []),
      ...ekler.map((l) => ({ kod: l.product, etiket: kisaUrun(l.product), ton: ACIK.has(l.status) ? LISANS_TONU[l.status] ?? "neutral" : "neutral" })),
    ];
    // Aylık tutar: ödeyen (aktif / gecikmiş) bütün lisansların toplamı.
    const ucret = (ODEYEN.has(kurum.license_status ?? "") ? Number(kurum.monthly_fee ?? 0) : 0)
      + ekler.filter((l) => ODEYEN.has(l.status)).reduce((t, l) => t + Number(l.monthly_fee ?? 0), 0);
    const odeyenSayisi = (ODEYEN.has(kurum.license_status ?? "") ? 1 : 0) + ekler.filter((l) => ODEYEN.has(l.status)).length;
    const ucretsizOdeyen = (ODEYEN.has(kurum.license_status ?? "") && !kurum.monthly_fee ? 1 : 0)
      + ekler.filter((l) => ODEYEN.has(l.status) && !l.monthly_fee).length;
    // En yakın yenileme: açık lisansların dönem sonu ya da deneme bitişi.
    const tarihler = [
      kurum.license_status === "trialing" ? kurum.trial_ends_at : ACIK.has(kurum.license_status ?? "") ? kurum.current_period_end : null,
      ...ekler.filter((l) => ACIK.has(l.status)).map((l) => (l.status === "trialing" ? l.trial_ends_at : l.current_period_end)),
    ].filter((t): t is string => Boolean(t)).sort();
    return {
      anahtar: `k-${kurum.id}`,
      tur: "kurumsal",
      ad: kurum.display_name || kurum.name,
      alt: [
        kurum.plan_code ? `${PAKET_ADI[kurum.plan_code] ?? kurum.plan_code} paket` : null,
        `${sayi(Number(kurum.aktif_uye))}${kurum.user_limit ? `/${sayi(Number(kurum.user_limit))}` : ""} kullanıcı`,
        kurum.contact_phone,
        kayitTarihi.get(kurum.id) ? `kayıt ${tarih(kayitTarihi.get(kurum.id) ?? null)}` : null,
      ].filter(Boolean).join(" · "),
      href: `/panel/platform?organization=${kurum.id}`,
      durum: durum.ad,
      ton: durum.ton,
      ucret,
      olusma: kayitTarihi.get(kurum.id) ?? null,
      urunler,
      yenileme: tarihler[0] ?? null,
      ucretGirilmedi: odeyenSayisi > 0 && ucretsizOdeyen === odeyenSayisi,
    };
  });

  const bireyselSatirlar = bireyselSatirlariKur(aboneler, bireyselFiyat);

  const tumSatirlar = [...kurumsalSatirlar, ...bireyselSatirlar];
  const desen = aranan ? sadelestir(aranan) : "";
  const liste = tumSatirlar
    .filter((satir) => (secilenTur ? satir.tur === secilenTur : true))
    .filter((satir) => (secilenUrun ? satir.urunler.some((u) => u.kod === secilenUrun) : true))
    .filter((satir) => (desen ? sadelestir(`${satir.ad} ${satir.alt} ${satir.urunler.map((u) => u.etiket).join(" ")}`).includes(desen) : true))
    .sort((a, b) => secilenSira === "gelir" ? b.ucret - a.ucret || a.ad.localeCompare(b.ad, "tr")
      : secilenSira === "yeni" ? (b.olusma ?? "").localeCompare(a.olusma ?? "")
      : a.ad.localeCompare(b.ad, "tr"));
  const urunSayisi = (kod: string) => tumSatirlar.filter((satir) => (secilenTur ? satir.tur === secilenTur : true) && satir.urunler.some((u) => u.kod === kod)).length;

  /* Sağ karttaki istatistikler: süzgeçten BAĞIMSIZ, her zaman bütün
     müşterileri anlatır. Süzgeçle birlikte değişseydi "kaç müşterim var"
     sorusunun yanıtı seçili sekmeye göre değişirdi. */
  const kurumsalKullanimda = kurumsalSatirlar.filter((satir) => satir.durum === "Kullanımda").length;
  const kurumsalSorunlu = kurumsalSatirlar.filter((satir) => satir.ton === "danger").length;
  const bireyselOdeyen = bireyselSatirlar.filter((satir) => satir.durum === "Ödüyor").length;
  const bireyselDeneme = bireyselSatirlar.filter((satir) => satir.durum === "Denemede").length;
  const bireyselKapali = bireyselSatirlar.filter((satir) => satir.durum === "Erişim kapalı").length;
  const kurumsalGelir = kurumsalSatirlar.reduce((toplam, satir) => toplam + satir.ucret, 0);

  const adres = (yeni: { tur?: string | null; ara?: string | null; urun?: string | null; sira?: string | null }) => {
    const p = new URLSearchParams();
    const t = yeni.tur === undefined ? secilenTur : yeni.tur;
    const a = yeni.ara === undefined ? aranan : yeni.ara;
    const u = yeni.urun === undefined ? secilenUrun : yeni.urun;
    const r = yeni.sira === undefined ? secilenSira : yeni.sira;
    if (t) p.set("tur", t);
    if (u) p.set("urun", u);
    if (r && r !== "ad") p.set("sira", r);
    if (a) p.set("ara", a);
    const q = p.toString();
    return q ? `/panel/platform/musteriler?${q}` : "/panel/platform/musteriler";
  };

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · MÜŞTERİLER</small>
        <h1>Müşteriler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform">Kiracı kurulumu</Link>
        <Link className="panel-primary" href="/panel/platform/billing">Abonelikler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Müşteri özeti">
      <dl>
        <div className={!secilenTur ? "is-active" : undefined}>
          <dt>Tüm müşteri</dt>
          <dd><Link href={adres({ tur: null })} aria-current={!secilenTur ? "page" : undefined}>{sayi(tumSatirlar.length)}</Link></dd>
        </div>
        <div className={secilenTur === "kurumsal" ? "is-active" : undefined}>
          <dt>Kurumsal</dt>
          <dd><Link href={adres({ tur: "kurumsal" })} aria-current={secilenTur === "kurumsal" ? "page" : undefined}>{sayi(kurumsalSatirlar.length)}</Link></dd>
          <small>{sayi(kurumsalKullanimda)} kullanımda</small>
        </div>
        <div className={secilenTur === "bireysel" ? "is-active" : undefined}>
          <dt>Bireysel</dt>
          <dd><Link href={adres({ tur: "bireysel" })} aria-current={secilenTur === "bireysel" ? "page" : undefined}>{sayi(bireyselSatirlar.length)}</Link></dd>
          <small>{sayi(bireyselOdeyen)} ödüyor</small>
        </div>
        <div>
          <dt>Dikkat gerektiren</dt>
          <dd className={kurumsalSorunlu + bireyselKapali ? "talep-uyari" : undefined}>{sayi(kurumsalSorunlu + bireyselKapali)}</dd>
          <small>Kurulum hatası ya da kapalı erişim</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Müşteri listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ tur: null })} className={!secilenTur ? "is-active" : undefined}>Tümü <small>{sayi(tumSatirlar.length)}</small></Link>
          <Link href={adres({ tur: "kurumsal" })} className={secilenTur === "kurumsal" ? "is-active" : undefined}>Kurumsal <small>{sayi(kurumsalSatirlar.length)}</small></Link>
          <Link href={adres({ tur: "bireysel" })} className={secilenTur === "bireysel" ? "is-active" : undefined}>Bireysel <small>{sayi(bireyselSatirlar.length)}</small></Link>
          <form action="/panel/platform/musteriler" className="talep-ara" role="search">
            {secilenTur ? <input type="hidden" name="tur" value={secilenTur} /> : null}
            {secilenUrun ? <input type="hidden" name="urun" value={secilenUrun} /> : null}
            {secilenSira !== "ad" ? <input type="hidden" name="sira" value={secilenSira} /> : null}
            <input type="search" name="ara" defaultValue={aranan} placeholder="Ad, e-posta, telefon ya da ürün" aria-label="Müşteri ara" />
          </form>
        </div>
        {/* İkinci satır: ürüne göre süz ve sırala (seçimler adreste). */}
        <div className="ekip-suzgec talep-suzgec k-ikinci-suzgec">
          <Link href={adres({ urun: null })} className={!secilenUrun ? "is-active" : undefined}>Bütün ürünler</Link>
          {PRODUCTS.map((p) => (
            <Link key={p.code} href={adres({ urun: p.code })} className={secilenUrun === p.code ? "is-active" : undefined}>
              {p.name} <small>{sayi(urunSayisi(p.code))}</small>
            </Link>
          ))}
          <span className="k-suzgec-ayrac" aria-hidden="true" />
          {SIRALAR.map((x) => (
            <Link key={x.kod} href={adres({ sira: x.kod })} className={secilenSira === x.kod ? "is-active" : undefined} aria-current={secilenSira === x.kod ? "true" : undefined}>{x.ad}</Link>
          ))}
        </div>

        {eksikKapsam ? (
          <KNot ton="uyari">
            Bireysel abonelerin en yeni {sayi(aboneler.length)} kaydı listeleniyor (toplam {sayi(toplamAbone)}). Aradığınızı bulamazsanız arama kutusunu kullanın.
          </KNot>
        ) : null}

        {/*
          iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"): sütun başlığı yok;
          solda simge, ad ve altında tür · özet, sağda durum ve aylık
          ücret. Eskiden beş sütunlu tabloydu (Müşteri, Tür, Durum, Aylık).
        */}
        {liste.length ? (
          <KListe>
            {liste.map((satir) => (
              <KOge
                key={satir.anahtar}
                href={satir.href}
                simge={satir.ad}
                baslik={satir.ad}
                alt={[satir.tur === "kurumsal" ? "Kurumsal" : "Bireysel", satir.alt].join(" · ")}
                etiketler={satir.urunler.map((u) => ({ etiket: u.etiket, ton: u.ton }))}
                durum={{ etiket: satir.durum, ton: satir.ton }}
                /* Aylık tutar bütün ödeyen ürünlerin toplamı; ödeyen ürünü
                   olup hiçbirinin ücreti girilmemişse "Ücret yok". */
                deger={satir.ucret ? para(satir.ucret) : satir.ucretGirilmedi ? <span className="k-ios-eksik">Ücret yok</span> : "—"}
                degerAlt={satir.yenileme ? `yenileme ${tarih(satir.yenileme)}` : satir.ucret ? "aylık" : undefined}
              />
            ))}
          </KListe>
        ) : (
          <KBos baslik={aranan ? `“${aranan}” ile eşleşen müşteri yok` : "Bu süzgeçte müşteri yok"} />
        )}
      </section>

      {/* Sağ kart süzgeçten bağımsız: her zaman bütün müşterileri anlatır.
          Bireysel gelir burada YOK: tutar ürün planında duruyor ve
          abonelik ekranında ürün ürün hesaplanıyor. İki yerde ayrı
          hesaplamak, birinin sapması demek. Eskiden kartın altında
          "Abonelik ayarları" bağlantısı vardı; o ekran başlıktaki
          Abonelikler düğmesinden açılıyor.

          14.10.2026: İstatistik kartının dört kutusundan üçü (kurumsal,
          bireysel, dikkat) şeritteki sayıların AYNISIYDI. Yerine yalnızca
          şeritte olmayanlar, iOS listesiyle: beklenen aylık gelir ve
          kurumsal/bireysel durum dağılımı. */}
      <div className="liste-sag">
        <KKart baslik="Kurumsal" aciklama="Süzgeçten bağımsız, bütün kiracılar">
          <KListe>
            <KOge baslik="Beklenen aylık" deger={para(kurumsalGelir)} degerAlt="ödeyenler" />
            <KOge baslik="Kullanımda" deger={sayi(kurumsalKullanimda)} />
            <KOge baslik="Kurulum hatası ya da askıda" deger={sayi(kurumsalSorunlu)} />
          </KListe>
        </KKart>

        <KKart
          baslik="Bireysel"
          aciklama={`${eksikKapsam ? `En yeni ${sayi(aboneler.length)} kayıt · ` : ""}son kayıt ${tarih(bireyselSatirlar[0]?.olusma ?? null)}`}
        >
          <KListe>
            <KOge baslik="Ödüyor" deger={sayi(bireyselOdeyen)} />
            <KOge baslik="Denemede" deger={sayi(bireyselDeneme)} />
            <KOge baslik="Erişimi kapalı" deger={sayi(bireyselKapali)} />
          </KListe>
        </KKart>
      </div>
    </div>
  </main>;
}
