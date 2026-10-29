import Link from "next/link";
import { notFound } from "next/navigation";
// Paket adı tek kaynaktan, sitedeki adla aynı (plans.name eski adı taşıyabilir).
import { paketAdi } from "@/lib/paket-adlari";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../konsol-oku";
import { aramaDeseni } from "@/lib/liste-arama";
import { PRODUCTS } from "@/lib/products";
import { bireyselListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { KNot } from "../konsol-ui";
import { basHarfleri, LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../bicim";
import { PanelDrawer } from "../../components/panel-drawer";
import { createCustomerOrganization } from "../actions";
import { NewOrganizationWizard } from "../new-organization-wizard";
import { kurumTuru } from "@/lib/kurum-turu";
import { MobilSatir } from "../../crm/table-cells";
import { OtomatikSecim } from "../../crm/otomatik-secim";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import { enCok } from "@/lib/liste-istatistik";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "./musteriler.css";
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

  Sayfa OKUNUR. Kurumsal satır müşteri detayına (musteriler/[id]), bireysel satır abonelik
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
  contact_phone: string | null;
  aktif_uye: number;
  grup_markasi: boolean | null;
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
  tur: "kurumsal" | "bireysel" | "grup" | "arvo";
  ad: string;
  alt: string;
  /*
    GÖSTERİLEN METİN İLE ARANAN METİN AYRI (15.10.2026). Süzgeç
    `satir.alt` üzerinde çalışıyor; özetten bir şey çıkarmak onu
    aranamaz da yapıyordu. Telefon özetten kalktı ama arama kutusu
    hâlâ "Ad, e-posta, telefon ya da ürün" diyor — ekranda
    görünmeyen ama aranabilir kalması gereken ne varsa burada.
  */
  arama?: string;
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
  /** Kurumsal: "Profesyonel paket"; bireyselde yok. */
  paket?: string | null;
  /** Kurumsal: "4 / 10"; bireyselde yok. */
  kullanici?: string | null;
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

/* Tür adı tek yerde: satırda, çipte ve şeritte aynı kelime geçsin. */
const TUR_ADI: Record<"kurumsal" | "bireysel" | "grup" | "arvo", string> = {
  kurumsal: "Kurumsal",
  bireysel: "Bireysel",
  grup: "Grup markası",
  arvo: "Arvo",
};

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
      /* Ürün rozette yazıyor (14.10.2026); özette yalnızca adı girilmiş
         abonenin e-postası kalıyor — ad zaten e-postaysa ikinci kez yazılmaz. */
      alt: abone.full_name?.trim() ? abone.email : "",
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
  const secilenTur = tur === "kurumsal" || tur === "bireysel" || tur === "grup" || tur === "arvo" ? tur : null;
  const aranan = (ara ?? "").trim().slice(0, 80);

  /*
    İki kaynak, iki sorgu. Bireysel abone sınırı 1000: tamamını
    kapsamadığında ekranda yazıyor (eksikKapsam), sessiz bir eksilme yok.
  */
  const LISTE_SINIRI = 1000;
  /*
    ARAMA SINIRIN ÖTESİNE DE BAKAR (15.10.2026).

    Liste en yeni 1000 kaydı okuyor ve süzgeç bellekte, o 1000 satırın
    üzerinde çalışıyordu: 1001. abone hiçbir şekilde bulunamıyordu ve
    ekrandaki uyarı "arama kutusunu kullanın" diyerek olmayan bir çözüm
    öneriyordu.

    Süzgeci olduğu gibi sunucuya taşımak GERİLEME olurdu: bellekteki
    eşleşme Türkçe duyarsız (sadelestir: "İş" ile "is") ve ürün ADIYLA
    da arıyor; ilike ikisini de yapmıyor. O yüzden ikisi birleşiyor —
    liste sorgusu aynı kalıyor, aramada İKİNCİ bir sorgu tabloyu
    tarayıp eşleşenleri ekliyor. Yüklenen satırlar için bugünkü zengin
    eşleşme aynen sürüyor, sınırın ötesindekiler artık erişilebilir:
    hiçbir durumda bugünkünden kötü değil.

    Kalan sınır: ikinci sorgu ilike kullandığı için sınırın ÖTESİNDEKİ
    bir kaydı Türkçe katlamayla (ör. "İsmail" yazıp "ismail") bulmak
    garanti değil. Bunu çözmek veritabanında normalleştirilmiş bir arama
    sütunu ister (migration); abone sayısı 1000'i geçmeden gereksiz.
  */
  /* Terim lib/liste-arama'dan geçiyor: PostgREST'in `or` dilbilgisini
     bozan karakterler (virgül, parantez, joker) orada ayıklanıyor ve
     iki harften kısa terim null dönüyor — "a" bütün tabloyu getirirdi.
     Aynı kural dört büyük listede de kullanılıyor; ikinci bir kopyası
     yazılmadı. */
  const sunucuDeseni = aranan ? aramaDeseni(aranan) : null;
  const [kurumSonucu, { data: aboneSatirlari, count: aboneSayisi, error }, { data: urunSatirlari, error: urunHatasi }, kayitSonucu, planSonucu, fiyatlar, paketSonucu, aramaSonucu] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,provisioning_state,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at,user_limit,aktif_uye,contact_phone,grup_markasi")
      .order("name"),
    // Kuruma geçmiş abone (kurum_id) bireysel değil: kurum lisansını kullanıyor.
    supabase.from("product_subscribers")
      .select("id,product,email,full_name,status,trial_ends_at,current_period_end,created_at", { count: "exact" })
      .is("kurum_id", null)
      .order("created_at", { ascending: false }).limit(LISTE_SINIRI),
    // Ek ürün lisansları: kiracı başına birkaç satır, bilerek sınırsız (rozet ve aylık toplam).
    supabase.from("organization_product_licenses").select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at"),
    // Kayıt tarihi görünümde yok; kiracı sayısı kadar küçük bir okuma.
    supabase.from("organizations").select("id,created_at,slug"),
    // ArvoARC'ın bireysel fiyatı listede değil, ürün planında.
    supabase.from("product_plans").select("product,individual_monthly_fee"),
    yayimlananFiyatlar(),
    // Yeni müşteri sihirbazının paket seçimi (eskiden kiracı sayfasındaydı).
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
    // Yalnızca arama yapılırken: sınırın ötesindeki eşleşmeler.
    sunucuDeseni
      ? supabase.from("product_subscribers")
          .select("id,product,email,full_name,status,trial_ends_at,current_period_end,created_at")
          .is("kurum_id", null)
          .or(`email.ilike.%${sunucuDeseni}%,full_name.ilike.%${sunucuDeseni}%,product.ilike.%${sunucuDeseni}%`)
          .limit(LISTE_SINIRI)
      : Promise.resolve({ data: [], error: null }),
  ]);
  /*
    Sayfanın ASIL verisi: okunamazsa sayfa hata veriyor. Eskiden `?? []`
    ile boş diziye düşüyordu ve ekran "kayıt yok" diyordu — "iş yok" ile
    "okuyamadım" aynı şey değil (konsol-oku.ts).
  */
  const kurumSatirlari = zorunlu(kurumSonucu, "Kiracılar");
  const kayitTarihleri = zorunlu(kayitSonucu, "Kayıt tarihleri");
  const planSatirlari = zorunlu(planSonucu, "Paketler");
  const paketler = zorunlu(paketSonucu, "Paket limitleri");
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
  /* ARVOOS DA LİSTEDE (14.10.2026, kurum sahibi: "ne kadar bizim markamız
     da olsa müşteri kaydı olarak olmalı"). Eskiden kendi kurumumuz listeden
     süzülüyordu. Artık grup markalarıyla aynı türde: kaydı, ürünleri ve
     ücreti görünür, ücreti müşteri gelirine değil "grup içi değer"e yazılır
     (lib/kurum-turu: "arvo" ve "grup" müşteri değil). */
  const kurumlar = (kurumSatirlari ?? []) as unknown as Kurum[];
  /*
    İki okumanın birleşimi, id'ye göre tekilleştirilmiş: liste sorgusu
    en yeni 1000 kaydı, arama sorgusu (varsa) eşleşenleri getiriyor.
  */
  /* Hata yutulmuyor: arama sorgusu düşerse kullanıcı eksik sonucu
     "abone yok" sanardı (AGENTS.md — engelin sorgusu hata yutmaz). */
  const aramaHatasi = (aramaSonucu as { error: { message?: string } | null }).error;
  if (aramaHatasi) throw new Error(`Abone araması okunamadı: ${aramaHatasi.message ?? "bilinmeyen hata"}`);
  const aramaSatirlari = ((aramaSonucu as { data: Abone[] | null }).data ?? []);
  const aboneHaritasi = new Map<string, Abone>();
  for (const satir of [...((aboneSatirlari ?? []) as Abone[]), ...aramaSatirlari]) aboneHaritasi.set(satir.id, satir);
  const aboneler = [...aboneHaritasi.values()];
  const toplamAbone = aboneSayisi ?? aboneler.length;
  /*
    Liste TAVANA DEĞDİYSE eksik. Eskiden ölçüt "toplam > yüklenen"di;
    arama ikinci sorguyu da getirdiğinden yüklenen sayı toplamdan küçük
    olsa bile liste artık eksik olmayabiliyor. Doğru soru, liste
    sorgusunun sınıra çarpıp çarpmadığı.
  */
  const eksikKapsam = ((aboneSatirlari ?? []) as Abone[]).length >= LISTE_SINIRI;

  const urunleriKurumun = new Map<string, UrunLisansi[]>();
  for (const l of urunLisanslari) urunleriKurumun.set(l.organization_id, [...(urunleriKurumun.get(l.organization_id) ?? []), l]);

  const kurumsalSatirlar: Satir[] = kurumlar.map((kurum) => {
    const ekler = (urunleriKurumun.get(kurum.id) ?? []).filter((l) => l.status !== "inactive");
    /* Durum ÇEKİRDEK lisanstan, ama çekirdek kapalıyken açık bir ek ürün
       varsa ondan: Deneme Salon'da ArvoOS iptal, Randevu ödeniyordu ve satır
       "İptal" yazıyordu (14.10.2026). */
    const acikEk = ekler.find((l) => ODEYEN.has(l.status)) ?? ekler.find((l) => ACIK.has(l.status));
    const durumKodu = ACIK.has(kurum.license_status ?? "") || !acikEk ? kurum.license_status : acikEk.status;
    const durum = kurum.provisioning_state === "failed"
      ? { ad: "Kurulum hatası", ton: "danger" as const }
      : KURUM_DURUMU[durumKodu ?? ""] ?? { ad: "Kurulum sürüyor", ton: "warning" as const };
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
      /* GRUP MARKASI (14.10.2026): AkademikMerkez ve ArvoCulture ArvoOS ile
         aynı şirketin markaları. Listede ayrı türde: ücretleri ArvoOS'un
         gruba yarattığı değeri gösteriyor, müşteri geliri değil. */
      /* ÜÇ TÜR AYRI (14.10.2026): lib/kurum-turu zaten arvo / grup /
         musteri diye ayırıyor; ekranın ikisini birleştirmesi kuralı
         suluyordu ve ana ekran "Grup markası 2" derken burası 3
         diyordu. Arvo'nun kendi kaydı listede kalıyor, yalnızca kendi
         kutusunda sayılıyor. */
      tur: kurumTuru(kurum) === "musteri" ? "kurumsal" : kurumTuru(kurum) === "grup" ? "grup" : "arvo",
      ad: kurum.display_name || kurum.name,
      /*
        ÖZETTE İKİ ŞEY: PAKET VE KULLANICI (15.10.2026, kurum sahibinin
        kararı). Telefon ve kayıt tarihi de buradaydı; dört bilgi tek
        satıra sığmıyor ve telefonda satırın kuyruğu kesiliyordu.
        İkisi de listede TARANAN bilgi değil: telefonu kesik hâliyle
        arayamıyorsun, kayıt tarihi de müşteri detayında duruyor.

        Veriden silinmediler ve ikisi de işlevini koruyor: telefon
        `arama` alanına taşındı (bu sayfanın süzgeci BELLEKTE çalışıyor
        ve metni satırın kendisinden okuyor, yani özetten çıkan şey
        aranamaz da olurdu — arama kutusu hâlâ "telefon" diyor), kayıt
        tarihi de "en yeni" sıralamasını besliyor (olusma).
      */
      alt: [
        kurum.plan_code ? `${PAKET_ADI[kurum.plan_code] ?? kurum.plan_code} paket` : null,
        `${sayi(Number(kurum.aktif_uye))}${kurum.user_limit ? `/${sayi(Number(kurum.user_limit))}` : ""} kullanıcı`,
      ].filter(Boolean).join(" · "),
      arama: kurum.contact_phone ?? undefined,
      paket: kurum.plan_code ? `${PAKET_ADI[kurum.plan_code] ?? kurum.plan_code} paket` : null,
      kullanici: `${sayi(Number(kurum.aktif_uye))}${kurum.user_limit ? ` / ${sayi(Number(kurum.user_limit))}` : ""}`,
      // Müşteri detayı (14.10.2026); teknik ayarlar oradan "Kurum ayarları" ile.
      href: `/panel/platform/musteriler/${kurum.id}`,
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

  const grupSatirlar = kurumsalSatirlar.filter((satir) => satir.tur === "grup");
  const arvoSatirlar = kurumsalSatirlar.filter((satir) => satir.tur === "arvo");
  const musteriKurumlari = kurumsalSatirlar.filter((satir) => satir.tur === "kurumsal");
  /* Grup içi değer Arvo'nun kendi kaydını da kapsıyor: ikisi de müşteri
     geliri değil (lib/kurum-turu), ikisi de grubun kendi içinde dönen
     tutar. */
  const grupDegeri = [...grupSatirlar, ...arvoSatirlar].reduce((toplam, satir) => toplam + satir.ucret, 0);
  const tumSatirlar = [...kurumsalSatirlar, ...bireyselSatirlar];
  const desen = aranan ? sadelestir(aranan) : "";
  const liste = tumSatirlar
    .filter((satir) => (secilenTur ? satir.tur === secilenTur : true))
    .filter((satir) => (secilenUrun ? satir.urunler.some((u) => u.kod === secilenUrun) : true))
    .filter((satir) => (desen ? sadelestir(`${satir.ad} ${satir.alt} ${satir.arama ?? ""} ${satir.urunler.map((u) => u.etiket).join(" ")}`).includes(desen) : true))
    .sort((a, b) => secilenSira === "gelir" ? b.ucret - a.ucret || a.ad.localeCompare(b.ad, "tr")
      : secilenSira === "yeni" ? (b.olusma ?? "").localeCompare(a.olusma ?? "")
      : a.ad.localeCompare(b.ad, "tr"));
  const urunSayisi = (kod: string) => tumSatirlar.filter((satir) => (secilenTur ? satir.tur === secilenTur : true) && satir.urunler.some((u) => u.kod === kod)).length;

  /* Sağ karttaki istatistikler: süzgeçten BAĞIMSIZ, her zaman bütün
     müşterileri anlatır. Süzgeçle birlikte değişseydi "kaç müşterim var"
     sorusunun yanıtı seçili sekmeye göre değişirdi. */
  const kurumsalKullanimda = musteriKurumlari.filter((satir) => satir.durum === "Kullanımda").length;
  const kurumsalSorunlu = kurumsalSatirlar.filter((satir) => satir.ton === "danger").length;
  const bireyselOdeyen = bireyselSatirlar.filter((satir) => satir.durum === "Ödüyor").length;
  const bireyselDeneme = bireyselSatirlar.filter((satir) => satir.durum === "Denemede").length;
  const bireyselKapali = bireyselSatirlar.filter((satir) => satir.durum === "Erişim kapalı").length;
  // Müşteri geliri yalnızca gerçek müşterilerden; grup markası ayrı (grupDegeri).
  const kurumsalGelir = musteriKurumlari.reduce((toplam, satir) => toplam + satir.ucret, 0);

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

  /* Telefonda satırın altına düşen kısa yazılar: dikkat isteyen durum
     önde, sonra ürünler. */
  const dikkatliler = tumSatirlar.filter((satir) => satir.ton === "danger");
  const urunDagilimi = enCok(tumSatirlar.flatMap((satir) => satir.urunler.map((u) => u.etiket)), 6);
  const durumDagilimi = enCok(tumSatirlar.map((satir) => satir.durum), 6);
  const TURLER: [string | null, string, number][] = [
    [null, "Tümü", tumSatirlar.length],
    ["kurumsal", "Kurumsal", musteriKurumlari.length],
    ["bireysel", "Bireysel", bireyselSatirlar.length],
    ...(grupSatirlar.length ? [["grup", "Grup markaları", grupSatirlar.length] as [string, string, number]] : []),
    /* Arvo'nun kendi kaydı ayrı süzgeçte: grup markası değil, kuralın
       üçüncü türü (lib/kurum-turu). */
    ...(arvoSatirlar.length ? [["arvo", "Arvo", arvoSatirlar.length] as [string, string, number]] : []),
  ];

  /*
    PANELİN LİSTE DİLİ (29.10.2026, konsol yeniden kurulurken). Liste
    iOS satırlarıydı (KListe): tür, paket, kullanıcı, yenileme ve tutar
    tek satırın altına sıkışıyor, sütunlar hizalanmadığı için "en çok
    ödeyen kim" ya da "kimin dönemi bu hafta doluyor" sorusu satır satır
    okunarak yanıtlanıyordu. Ekip ve personel listesiyle aynı tablo:
    hizalı sütunlar, telefonda tek satırlık özet (MobilSatir). Ürün ve
    sıralama iki çip rayıydı; şimdi arama kutusunun yanında iki seçim.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa konsol-musteriler">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">MÜŞTERİLER</small>
        <h1>Müşteriler</h1>
        <p className="ek-alt">{sayi(musteriKurumlari.length)} kurumsal · {sayi(bireyselSatirlar.length)} bireysel{kurumsalGelir ? ` · beklenen aylık ${para(kurumsalGelir)}` : ""}</p>
      </div>
      <div className="talep-bas-eylem">
        {/* Yeni müşteri kurulumu (14.10.2026): kiracı sayfası kaldırıldı,
            sihirbaz buraya taşındı. Çalışma alanı adı bütün kurumlar
            arasında benzersiz olmalı; Arvo'nun kendi kurumları dahil. */}
        <PanelDrawer triggerLabel="Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
          <NewOrganizationWizard
            action={createCustomerOrganization}
            plans={((paketler ?? []) as { code: string; name: string }[]).map((p) => ({ code: String(p.code), name: paketAdi(String(p.code)) || String(p.name) }))}
            existingSlugs={((kayitTarihleri ?? []) as { slug: string }[]).map((k) => k.slug)}
          />
        </PanelDrawer>
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            <Link className="os-menu-item" href="/panel/platform/kullanicilar" role="menuitem">Kullanıcılar</Link>
            <Link className="os-menu-item" href="/panel/platform/subscribers" role="menuitem">Bireysel aboneler</Link>
            <Link className="os-menu-item" href="/panel/platform/billing" role="menuitem">Abonelikler</Link>
          </div>
        </details>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Müşteri özeti">
      <dl>
        {/* "Tüm KAYIT", "tüm müşteri" değil: listede grup markaları ve
            Arvo'nun kendi kaydı da var, onlar müşteri değil (lib/kurum-turu). */}
        <div className={!secilenTur ? "is-active" : undefined}><dt>Tüm kayıt</dt><dd><Link href={adres({ tur: null })}>{sayi(tumSatirlar.length)}</Link></dd></div>
        <div className={secilenTur === "kurumsal" ? "is-active" : undefined}>
          <dt>Kurumsal</dt><dd><Link href={adres({ tur: "kurumsal" })}>{sayi(musteriKurumlari.length)}</Link></dd>
          <small>{sayi(kurumsalKullanimda)} kullanımda</small>
        </div>
        <div className={secilenTur === "bireysel" ? "is-active" : undefined}>
          <dt>Bireysel</dt><dd><Link href={adres({ tur: "bireysel" })}>{sayi(bireyselSatirlar.length)}</Link></dd>
          <small>{sayi(bireyselOdeyen)} ödüyor · {sayi(bireyselDeneme)} denemede</small>
        </div>
        <div><dt>Beklenen aylık</dt><dd className={kurumsalGelir ? "cari-arti" : undefined}>{para(kurumsalGelir)}</dd><small>ödeyen kurumlar</small></div>
        {grupSatirlar.length || arvoSatirlar.length ? <div><dt>Grup içi değer</dt><dd>{para(grupDegeri)}</dd><small>müşteri gelirine girmez</small></div> : null}
        <div><dt>Dikkat gerektiren</dt><dd className={dikkatliler.length ? "talep-uyari" : undefined}>{sayi(dikkatliler.length)}</dd><small>kurulum hatası ya da kapalı erişim</small></div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Müşteri listesi">
        <div className="ekip-suzgec talep-suzgec ek-arac">
          <nav className="ek-segment" aria-label="Tür">
            {TURLER.map(([kod, ad, adet]) => (
              <Link key={kod ?? "tumu"} href={adres({ tur: kod })} className={secilenTur === kod ? "is-active" : undefined} aria-current={secilenTur === kod ? "page" : undefined}>
                {ad} <small>{sayi(adet)}</small>
              </Link>
            ))}
          </nav>
          <form action="/panel/platform/musteriler" className="talep-ara talep-ara--secimli" role="search">
            {secilenTur ? <input type="hidden" name="tur" value={secilenTur} /> : null}
            <OtomatikSecim name="urun" defaultValue={secilenUrun ?? ""} className="talep-temsilci-sec" label="Ürün">
              <option value="">Bütün ürünler</option>
              {PRODUCTS.map((p) => <option key={p.code} value={p.code}>{p.name} ({sayi(urunSayisi(p.code))})</option>)}
            </OtomatikSecim>
            <OtomatikSecim name="sira" defaultValue={secilenSira} className="talep-temsilci-sec" label="Sıralama">
              {SIRALAR.map((x) => <option key={x.kod} value={x.kod}>{x.ad}</option>)}
            </OtomatikSecim>
            <input type="search" name="ara" defaultValue={aranan} placeholder="Ad, e-posta, telefon ya da ürün" aria-label="Müşteri ara" />
          </form>
        </div>

        {/* Arama yapıldığında ikinci bir sorgu bütün tabloyu tarıyor
            (sunucuDeseni): tavsiye doğru, arama listeyle sınırlı değil. */}
        {eksikKapsam ? (
          <KNot ton="uyari">
            Bireysel abonelerin en yeni {sayi(LISTE_SINIRI)} kaydı listeleniyor (toplam {sayi(toplamAbone)}). Daha eski bir aboneyi görmek için arama kutusunu kullanın: arama listeyle sınırlı değil, bütün kayıtlara bakar.
          </KNot>
        ) : null}

        {liste.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="konsol-musteri">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Ürünler</th>
                  <th>Kullanıcı</th>
                  <th className="crm-col-date">Yenileme</th>
                  <th className="crm-col-amount">Aylık</th>
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((satir) => (
                  <tr key={satir.anahtar} className={satir.ton === "neutral" ? "is-pasif" : undefined}>
                    <td data-label="Müşteri">
                      <Link className="crm-row-link ek-kisi" href={satir.href} aria-label={`${satir.ad} kartını aç`}>
                        <span className="ek-avatar" data-tur={satir.tur} aria-hidden="true">{basHarfleri(satir.ad)}</span>
                        <span className="ek-kisi-metin">
                          <span className="crm-table-title" title={satir.ad}>{satir.ad}</span>
                          <span className="crm-table-sub">{[TUR_ADI[satir.tur], satir.tur === "bireysel" ? satir.alt : satir.paket].filter(Boolean).join(" · ")}</span>
                        </span>
                      </Link>
                    </td>
                    <td data-label="Ürünler">
                      <span className="mu-urunler">
                        {satir.urunler.length ? satir.urunler.map((u) => <span key={u.kod} data-tone={u.ton}>{u.etiket}</span>) : <span className="crm-table-sub">Ürün yok</span>}
                      </span>
                    </td>
                    <td data-label="Kullanıcı">{satir.kullanici ? <span className="crm-table-title">{satir.kullanici}</span> : <span className="crm-table-sub">—</span>}</td>
                    <td className="crm-col-date" data-label="Yenileme">{satir.yenileme ? tarih(satir.yenileme) : "—"}</td>
                    <td className="crm-col-amount" data-label="Aylık">
                      {/* Bütün ödeyen ürünlerin toplamı; ödeyen ürünü olup hiçbirinin ücreti girilmemişse "Ücret yok". */}
                      {satir.ucret ? <span className="crm-table-title">{para(satir.ucret)}</span> : satir.ucretGirilmedi ? <span className="k-ios-eksik">Ücret yok</span> : <span className="crm-table-sub">—</span>}
                      {satir.ucret && (satir.tur === "grup" || satir.tur === "arvo") ? <small>grup içi</small> : null}
                    </td>
                    <td data-label="Durum"><span className="status-pill" data-tone={satir.ton}>{satir.durum}</span></td>
                    <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    <MobilSatir
                      href={satir.href}
                      baslik={satir.ad}
                      durum={{ etiket: satir.durum, ton: satir.ton }}
                      alt={[TUR_ADI[satir.tur], satir.urunler.map((u) => u.etiket).join(", ")]}
                      isaretler={[
                        satir.ucret ? { metin: `${para(satir.ucret)} / ay`, ton: "sessiz" } : null,
                        satir.yenileme ? { metin: `yenileme ${tarih(satir.yenileme)}`, ton: "sessiz" } : null,
                      ]}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu ek-bos">
            <h2>{aranan ? `“${aranan}” ile eşleşen müşteri yok` : "Bu süzgeçte müşteri yok"}</h2>
            <p>Aramayı ya da süzgeci değiştirip yeniden deneyin.</p>
            <div className="crm-empty-actions"><Link className="panel-secondary" href="/panel/platform/musteriler">Süzgeci temizle</Link></div>
          </div>
        )}
      </section>

      {/* Sağ sütun süzgeçten BAĞIMSIZ: her zaman bütün müşterileri
          anlatır; seçili sekmeye göre değişseydi "kaç müşterim var"
          sorusunun yanıtı da değişirdi. Ekip listesindeki sekmeli kart. */}
      <div className="liste-sag">
        <TalepAkis kimlik="musteri-sag" sinif="ek-sag" etiket="Müşteri istatistikleri"
          sekmeler={["İstatistikler", dikkatliler.length ? `Dikkat · ${dikkatliler.length}` : "Dikkat", ...(grupSatirlar.length ? ["Grup içi"] : [])]}>
          <IstatistikKarti
            kapsam="bütün kayıtlar"
            kutular={[
              { ad: "Beklenen aylık", deger: para(kurumsalGelir), alt: "ödeyen kurumlar" },
              { ad: "Kullanımda", deger: sayi(kurumsalKullanimda), alt: `${sayi(musteriKurumlari.length)} kurumdan` },
              { ad: "Bireysel ödüyor", deger: sayi(bireyselOdeyen), alt: `${sayi(bireyselDeneme)} denemede` },
              { ad: "Erişimi kapalı", deger: sayi(bireyselKapali + kurumsalSorunlu), alt: "kurumsal ve bireysel", ton: bireyselKapali + kurumsalSorunlu ? "uyari" : undefined },
            ]}
            gruplar={[
              { baslik: "Ürüne göre", satirlar: urunDagilimi.map(([ad, adet]) => ({ ad, adet })) },
              { baslik: "Duruma göre", satirlar: durumDagilimi.map(([ad, adet]) => ({ ad, adet })) },
            ]}
          />
          <section className="ek-panel" aria-label="Dikkat gerektirenler">
            {dikkatliler.length ? <>
              <p className="ek-not" data-tone="danger">Kurulumu hatada kalan, askıya alınan ya da erişimi kapanan kayıtlar.</p>
              <ul className="pu-liste">
                {dikkatliler.map((satir) => (
                  <li key={satir.anahtar}>
                    <Link href={satir.href}>
                      <span className="pu-govde"><b>{satir.ad}</b><small>{[TUR_ADI[satir.tur], satir.urunler.map((u) => u.etiket).join(", ")].filter(Boolean).join(" · ")}</small></span>
                      <span className="status-pill" data-tone="danger">{satir.durum}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </> : <p className="ek-bos-kucuk">Dikkat gerektiren kayıt yok.</p>}
          </section>
          {grupSatirlar.length ? (
            <section className="ek-panel" aria-label="Grup içi değer">
              <p className="ek-not">ArvoOS&apos;un grup markalarına sağladığı değer, liste fiyatıyla. Müşteri gelirine girmez.</p>
              <ul className="pu-liste">
                {[...grupSatirlar, ...arvoSatirlar].map((satir) => (
                  <li key={satir.anahtar}>
                    <Link href={satir.href}>
                      <span className="pu-govde"><b>{satir.ad}</b><small>{TUR_ADI[satir.tur]}</small></span>
                      <span className="mu-grup-tutar">{satir.ucret ? para(satir.ucret) : <span className="k-ios-eksik">Ücret yok</span>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="ek-alt mu-toplam">Toplam <b>{para(grupDegeri)}</b> / ay</p>
            </section>
          ) : null}
        </TalepAkis>
      </div>
    </div>
  </main>;
}
