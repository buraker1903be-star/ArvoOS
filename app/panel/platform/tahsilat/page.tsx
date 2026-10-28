import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getPaymentIncidents } from "@/lib/payment-incidents";
import { musteriMi } from "@/lib/kurum-turu";
import { KBos, KListe, KNot, KOge } from "../konsol-ui";
import { para, sayi, tarih } from "../bicim";
import { createAdminClient } from "@/lib/supabase/admin";
import { PanelModal } from "../../components/panel-modal";
import { faturaYukle, proformaEsle, proformaIptal, proformaOlustur } from "./actions";
import { eslesmeSirasi, kalemleriCoz, PROFORMA_DURUM_ADI, proformaGorunumu, VARSAYILAN_KDV_ORANI, type ProformaAlici } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { ProformaFormu, type ProformaFiyatKisayolu, type ProformaMusterisi } from "./proforma-formu";
import { arvolabAdlari, fiyatKisayollari, kurumAlicilari } from "./proforma-verisi";
import { todayInIstanbul } from "@/lib/istanbul-date";
import "../platform.css";
import "../../components/kayit-formu.css";

/*
  FATURALAMA VE TAHSİLAT (14.10.2026, Kurucu Konsolu'nun ana menüsü).

  Tahsilat listesi bir gün önce Abonelikler sayfasının altındaydı.
  Abonelik "kim ödemeli" sorusu, tahsilat "ne geldi" sorusu; konsol sekiz
  ana menüye geçince ayrıldılar.

  KAYNAK: onaylı kurum ödeme istekleri (havale VE PayTR — kanalı
  payment_method söylüyor) ve bireysel abone ödemeleri. billing_subscriptions
  OKUNMUYOR: her kurum ödemesinin aktivasyon ikizi, toplanınca her ödeme
  iki kez sayılıyordu (20261014062145). Toplamlar platform_tahsilat_ozeti
  işlevinden; liste yalnızca gösterilen son elli satır.

  FATURA (26.10.2026): fatura elle kesiliyor ve PDF'i her tahsilatın
  yanından yükleniyor (platform_faturalari, migration 20261026191235);
  müşteri ArvoLab'da görüyor. Aşağıdaki not, yükleme gelmeden önceki
  durumu anlatıyor:

  ESKİ: platformun kiracıya kestiği fatura bugün YOK. Aktivasyon,
  kiracının kendi fatura tablosuna (billing_invoices) "ödendi" satırı
  yazıyor — o kiracının kendi müşterilerine kestiği faturaların tablosu,
  Arvo'nun faturası değil. Bölüm bunu açıkça söylüyor; Paraşüt
  entegrasyonu (e-fatura / e-arşiv) bağlandığında burası fatura listesi
  olacak. Çalışmayan özellik çalışıyormuş gibi gösterilmiyor.
*/

const LISTE = 50;

type Tahsilat = { anahtar: string; id: string; tur: "kurum" | "abone"; organizationId: string | null; kim: string; kanal: string; amount: number; currency: string; tarih: string | null };
type Fatura = { no: string; tarih: string; url: string | null };

const KANALLAR = [
  { kod: "", ad: "Tümü" },
  { kod: "havale", ad: "Havale" },
  { kod: "kart", ad: "Kart" },
  { kod: "bireysel", ad: "Bireysel" },
  { kod: "fatura", ad: "Faturalar" },
  { kod: "proforma", ad: "Proformalar" },
] as const;

type Proforma = {
  id: string; proforma_no: string; product: string; organization_id: string | null; subscriber_id: string | null; musteri_adi: string;
  alici: ProformaAlici | null; kalemler: unknown; ara_toplam: number; kdv_orani: number; kdv: number; toplam: number; para_birimi: string;
  duzenleme_tarihi: string; gecerlilik_tarihi: string; durum: string;
};
type Aday = { id: string; tutar: number; tarih: string | null };

const DURUM_TONU = { bekliyor: "info", odendi: "success", iptal: "neutral", suresi_doldu: "warning" } as const;

/* Varsayılan geçerlilik: on beş gün (Türkiye günüyle). */
function onBesGunSonra(bugun: string) {
  const d = new Date(`${bugun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 15);
  return d.toISOString().slice(0, 10);
}

export default async function TahsilatPage({ searchParams }: { searchParams: Promise<{ kanal?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { kanal } = await searchParams;
  const secili = KANALLAR.some((k) => k.kod === kanal) ? kanal! : "";

  const [
    { data: ozetVerisi, error: ozetHatasi },
    { data: kurumOdemeleri, error: kurumHatasi },
    { data: aboneOdemeleri, error: aboneHatasi },
    { data: bekleyenler, error: bekleyenHatasi },
    { data: kurumlar, error: kurumlarHatasi },
    olaylar,
  ] = await Promise.all([
    supabase.rpc("platform_tahsilat_ozeti"),
    supabase.from("organization_payment_requests").select("id,organization_id,amount,currency,payment_method,reviewed_at")
      .eq("status", "approved").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(LISTE),
    supabase.from("subscriber_payments").select("id,amount,currency,paid_at").order("paid_at", { ascending: false, nullsFirst: false }).limit(LISTE),
    // Onay bekleyen havaleler: hepsi (bugünün iş kuyruğu, küçük).
    supabase.from("organization_payment_requests").select("id,amount,currency").eq("status", "pending"),
    supabase.from("organizations").select("id,name,display_name,kind,grup_markasi"),
    getPaymentIncidents(),
  ]);
  /*
    KURUM LİSTESİ DE ZORUNLU (15.10.2026). Hatası alınmıyordu, oysa
    ödemenin GELİR SAYILIP SAYILMAYACAĞINA o karar veriyor: liste
    düşünce kurumBilgisi boş kalıyor, musteriMi(undefined) "müşteri"
    döndürüyor (lib/kurum-turu: iki alan da yoksa varsayılan müşteri) ve
    Arvo'nun kendi ödemeleriyle grup markalarının ödemeleri müşteri
    gelirine karışıyor — sessizce ŞİŞMİŞ bir tahsilat. Eksik sütunun
    aynı tuzağı kurum-turu.ts'te yazılı; bu onun okuma hatasıyla gelen
    ikizi.
  */
  const hata = ozetHatasi ?? kurumHatasi ?? aboneHatasi ?? bekleyenHatasi ?? kurumlarHatasi;
  if (hata) throw new Error("Tahsilat okunamadı: " + hata.message);

  const ozet = (ozetVerisi ?? {}) as { adet?: number; toplam?: number; bu_ay?: number; birimler?: string[] };
  const kurumBilgisi = new Map(((kurumlar ?? []) as { id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null }[]).map((k) => [k.id, k]));
  const birimKarisik = (ozet.birimler ?? []).length > 1;

  /* Kendi kurumlarımızın ödemesi gelir değil (özet işleviyle aynı kural). */
  const tahsilatlar: Tahsilat[] = [
    ...((kurumOdemeleri ?? []) as { id: string; organization_id: string; amount: number; currency: string; payment_method: string | null; reviewed_at: string | null }[])
      // Arvo'nun kendisi ve grup markaları gelir değil (özet işleviyle aynı kural).
      .filter((o) => musteriMi(kurumBilgisi.get(o.organization_id)))
      .map((o) => {
        const k = kurumBilgisi.get(o.organization_id);
        return {
          anahtar: `kurum-${o.id}`, id: o.id, tur: "kurum" as const, organizationId: o.organization_id, kim: k?.display_name || k?.name || "Kurum",
          kanal: o.payment_method === "paytr" ? "Kart (PayTR)" : "Havale/EFT", amount: Number(o.amount), currency: o.currency, tarih: o.reviewed_at,
        };
      }),
    ...((aboneOdemeleri ?? []) as { id: string; amount: number; currency: string; paid_at: string | null }[])
      .map((o) => ({ anahtar: `abone-${o.id}`, id: o.id, tur: "abone" as const, organizationId: null, kim: "Bireysel abone", kanal: "Kart", amount: Number(o.amount), currency: o.currency, tarih: o.paid_at })),
  ].sort((a, b) => (b.tarih ?? "").localeCompare(a.tarih ?? "")).slice(0, LISTE);
  /* Kanal süzgeci gösterilen listede (son elli). Toplamlar süzgeçten
     bağımsız, bütün kayıtlardan (özet işlevi). */
  const kanalinda = (t: Tahsilat) =>
    secili === "havale" ? t.kanal === "Havale/EFT" : secili === "kart" ? t.kanal === "Kart (PayTR)" : secili === "bireysel" ? t.organizationId === null : true;
  const gorunen = tahsilatlar.filter(kanalinda);
  const kanalSayisi = (ad: string) => tahsilatlar.filter((t) => t.kanal === ad).length;

  /*
    Gösterilen tahsilatların faturaları ve kısa süreli bağlantıları. Tablo
    ve depo istemciye kapalı; kurucu denetimi yukarıda yapıldı, okuma
    service_role ile.
  */
  const admin = createAdminClient();
  const faturaHaritasi = new Map<string, Fatura>();
  let faturaListesi: (Fatura & { kim: string })[] = [];
  if (admin) {
    type FSatir = {
      fatura_no: string; fatura_tarihi: string; dosya_yolu: string;
      subscriber_payment_id?: string | null; payment_request_id?: string | null;
      organization_payment_requests?: { organization_id: string } | { organization_id: string }[] | null;
    };
    const aboneIdleri = gorunen.filter((t) => t.tur === "abone").map((t) => t.id);
    const kurumIdleri = gorunen.filter((t) => t.tur === "kurum").map((t) => t.id);
    const bos = { data: [] as FSatir[], error: null };
    const [aboneYaniti, kurumYaniti, sonYaniti] = await Promise.all([
      aboneIdleri.length
        ? admin.from("platform_faturalari").select("fatura_no,fatura_tarihi,dosya_yolu,subscriber_payment_id").in("subscriber_payment_id", aboneIdleri)
        : bos,
      kurumIdleri.length
        ? admin.from("platform_faturalari").select("fatura_no,fatura_tarihi,dosya_yolu,payment_request_id").in("payment_request_id", kurumIdleri)
        : bos,
      secili === "fatura"
        ? admin.from("platform_faturalari")
            .select("fatura_no,fatura_tarihi,dosya_yolu,subscriber_payment_id,payment_request_id,organization_payment_requests(organization_id)")
            .order("fatura_tarihi", { ascending: false }).limit(LISTE)
        : bos,
    ]);
    const fHata = aboneYaniti.error ?? kurumYaniti.error ?? sonYaniti.error;
    if (fHata) throw new Error("Faturalar okunamadı: " + fHata.message);
    const tahsilatFaturalari = [...((aboneYaniti.data ?? []) as FSatir[]), ...((kurumYaniti.data ?? []) as FSatir[])];
    const sonFaturalar = (sonYaniti.data ?? []) as FSatir[];
    const yollar = [...new Set([...tahsilatFaturalari, ...sonFaturalar].map((f) => f.dosya_yolu))];
    const { data: imzali, error: imzaHatasi } = yollar.length
      ? await admin.storage.from("platform-faturalari").createSignedUrls(yollar, 900)
      : { data: [] as { path: string | null; signedUrl: string }[], error: null };
    // Bağlantı üretilemezse fatura numarası yine görünür, yalnızca dosya açılmaz; sayfa düşmesin.
    if (imzaHatasi) console.error("[tahsilat] fatura bağlantısı üretilemedi", imzaHatasi.message);
    const url = new Map((imzali ?? []).flatMap((i) => (i.path && i.signedUrl ? [[i.path, i.signedUrl] as const] : [])));
    for (const f of tahsilatFaturalari) {
      const anahtar = f.subscriber_payment_id ? `abone-${f.subscriber_payment_id}` : `kurum-${f.payment_request_id}`;
      faturaHaritasi.set(anahtar, { no: f.fatura_no, tarih: f.fatura_tarihi, url: url.get(f.dosya_yolu) ?? null });
    }
    faturaListesi = sonFaturalar.map((f) => {
      const istek = Array.isArray(f.organization_payment_requests) ? f.organization_payment_requests[0] : f.organization_payment_requests;
      const kurum = istek ? kurumBilgisi.get(istek.organization_id) : null;
      return { no: f.fatura_no, tarih: f.fatura_tarihi, url: url.get(f.dosya_yolu) ?? null, kim: kurum ? kurum.display_name || kurum.name : "Bireysel abone" };
    });
  }

  /*
    PROFORMALAR (27.10.2026): yalnızca kendi sekmesinde okunuyor. Son
    elli proforma; bekleyenlerin her biri için AYNI müşterinin henüz bir
    proformaya bağlanmamış ödemeleri eşleştirme seçeneği olarak geliyor.
  */
  let proformalar: Proforma[] = [];
  let proformaMusterileri: ProformaMusterisi[] = [];
  let kisayollar: ProformaFiyatKisayolu[] = [];
  const adaylar = new Map<string, (Aday & { tutarTutuyor: boolean })[]>();
  if (admin && secili === "proforma") {
    const [pYaniti, aYaniti] = await Promise.all([
      admin.from("platform_proformalari")
        .select("id,proforma_no,product,organization_id,subscriber_id,musteri_adi,alici,kalemler,ara_toplam,kdv_orani,kdv,toplam,para_birimi,duzenleme_tarihi,gecerlilik_tarihi,durum")
        .order("created_at", { ascending: false }).limit(LISTE),
      // Seçim kutusu için; kuruma geçmiş abone de kendi adına proforma alabilir (eski dönem borcu).
      admin.from("product_subscribers").select("id,full_name,email,external_user_id").eq("product", "arvolab").is("closed_at", null)
        .order("created_at", { ascending: false }).limit(500),
    ]);
    if (pYaniti.error) throw new Error("Proformalar okunamadı: " + pYaniti.error.message);
    if (aYaniti.error) throw new Error("Aboneler okunamadı: " + aYaniti.error.message);
    proformalar = (pYaniti.data ?? []) as Proforma[];
    const aboneSatirlari = (aYaniti.data ?? []) as { id: string; full_name: string | null; email: string; external_user_id: string }[];
    const [kurumAlici, aboneAdlari, fiyatlar] = await Promise.all([
      kurumAlicilari(admin),
      arvolabAdlari(aboneSatirlari.filter((a) => !a.full_name).map((a) => a.external_user_id)),
      yayimlananFiyatlar(),
    ]);
    proformaMusterileri = [
      ...kurumAlici.filter((k) => musteriMi(k)).map((k): ProformaMusterisi => ({
        deger: `kurum:${k.id}`, tur: "kurum", ad: k.ad, arama: [k.alici.unvan, k.alici.adSoyad, k.alici.eposta, k.alici.vergiNo].filter(Boolean).join(" "), alici: k.alici,
      })),
      ...aboneSatirlari.map((a): ProformaMusterisi => {
        const adSoyad = a.full_name || aboneAdlari.get(a.external_user_id) || null;
        return {
          deger: `abone:${a.id}`, tur: "abone", ad: adSoyad ? `${adSoyad} (${a.email})` : a.email, arama: a.email,
          alici: { adSoyad, unvan: null, vergiDairesi: null, vergiNo: null, adres: null, eposta: a.email },
        };
      }),
    ];
    kisayollar = fiyatKisayollari(fiyatlar);

    const bekleyen = proformalar.filter((p) => p.durum === "bekliyor");
    const kurumIdleri = [...new Set(bekleyen.flatMap((p) => (p.organization_id ? [p.organization_id] : [])))];
    const aboneIdleri = [...new Set(bekleyen.flatMap((p) => (p.subscriber_id ? [p.subscriber_id] : [])))];
    const bos = { data: [] as Record<string, unknown>[], error: null };
    const [kYaniti, sYaniti, eYaniti] = await Promise.all([
      kurumIdleri.length
        ? admin.from("organization_payment_requests").select("id,organization_id,product,amount,reviewed_at")
            // Ürün süzgeci proforma başına aşağıda: proforma artık ArvoOS ve ArvoCal için de kesiliyor.
            .in("organization_id", kurumIdleri).eq("status", "approved")
            .order("reviewed_at", { ascending: false }).limit(200)
        : bos,
      aboneIdleri.length
        ? admin.from("subscriber_payments").select("id,subscriber_id,amount,paid_at")
            .in("subscriber_id", aboneIdleri).order("paid_at", { ascending: false }).limit(200)
        : bos,
      // Zaten bir proformaya bağlanmış ödemeler seçenekten düşer (bir ödeme bir proforma).
      admin.from("platform_proformalari").select("payment_request_id,subscriber_payment_id").eq("durum", "odendi"),
    ]);
    const eHata = kYaniti.error ?? sYaniti.error ?? eYaniti.error;
    if (eHata) throw new Error("Eşleştirme seçenekleri okunamadı: " + eHata.message);
    const bagli = new Set(((eYaniti.data ?? []) as { payment_request_id: string | null; subscriber_payment_id: string | null }[])
      .flatMap((e) => [e.payment_request_id, e.subscriber_payment_id].filter((x): x is string => !!x)));
    const kurumOdeme = ((kYaniti.data ?? []) as { id: string; organization_id: string; product: string | null; amount: number; reviewed_at: string | null }[]).filter((o) => !bagli.has(o.id));
    const aboneOdeme = ((sYaniti.data ?? []) as { id: string; subscriber_id: string; amount: number; paid_at: string | null }[]).filter((o) => !bagli.has(o.id));
    for (const p of bekleyen) {
      const liste: Aday[] = p.organization_id
        ? kurumOdeme.filter((o) => o.organization_id === p.organization_id && (o.product ?? "arvoos") === p.product).map((o) => ({ id: o.id, tutar: Number(o.amount), tarih: o.reviewed_at }))
        : aboneOdeme.filter((o) => o.subscriber_id === p.subscriber_id).map((o) => ({ id: o.id, tutar: Number(o.amount), tarih: o.paid_at }));
      adaylar.set(p.id, eslesmeSirasi(Number(p.toplam), liste));
    }
  }
  const bugun = todayInIstanbul();

  const bekleyenSatirlar = (bekleyenler ?? []) as { amount: number; currency: string }[];
  // tuzak-tamam: sınırsız sorgu (bekleyen havalelerin hepsi), toplam doğru.
  const bekleyenTutar = bekleyenSatirlar.reduce((t, b) => t + Number(b.amount), 0);

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · FATURALAMA VE TAHSİLAT</small>
        <h1>Faturalama ve Tahsilat</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/payments">Ödeme onayları</Link>
        <Link className="panel-secondary" href="/panel/platform/billing">Abonelikler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Tahsilat özeti">
      <dl>
        <div><dt>Bu ay tahsil edilen</dt><dd className="cari-arti">{para(Number(ozet.bu_ay ?? 0))}</dd><small>Türkiye takvimiyle bu ay</small></div>
        <div><dt>Tüm zamanlar</dt><dd>{para(Number(ozet.toplam ?? 0))}</dd><small>{sayi(Number(ozet.adet ?? 0))} ödeme</small></div>
        <div>
          <dt>Onay bekleyen havale</dt>
          <dd className={bekleyenSatirlar.length ? "talep-uyari" : undefined}><Link href="/panel/platform/payments">{sayi(bekleyenSatirlar.length)}</Link></dd>
          <small>{bekleyenSatirlar.length ? `${para(bekleyenTutar)} tutarında` : "Bekleyen dekont yok"}</small>
        </div>
        <div>
          <dt>İşlenemeyen kart ödemesi</dt>
          <dd className={olaylar.length ? "talep-uyari" : undefined}>{olaylar.length ? <Link href="/panel/platform/payments#karsiliksiz">{sayi(olaylar.length)}</Link> : 0}</dd>
          <small>{olaylar.length ? "PayTR ödedi, kayıt oluşmadı" : "Yok"}</small>
        </div>
      </dl>
    </nav>

    {/*
      Sağdaki istatistik kartı kalktı (14.10.2026, iOS listesi): dört
      kutusu şeritteki sayıların aynısıydı, kanal dağılımı çiplerin
      yanında yazıyor, "platform faturası yok" da Faturalar sekmesinde.
      Liste kartı tek başına, liste sayfası düzeninde.
    */}
    <section className="panel-card talep-bilgi" aria-label="Tahsilat listesi">
      <div className="ekip-suzgec talep-suzgec">
        {/* Çipler rayda (konsol-ui.css): telefonda tek sıra kaydırılır,
            masaüstünde sarmalayıcı display:contents ile görünmez. */}
        <div className="suzgec-ray">
          {KANALLAR.map((k) => (
            <Link key={k.kod} href={k.kod ? `/panel/platform/tahsilat?kanal=${k.kod}` : "/panel/platform/tahsilat"}
              className={secili === k.kod ? "is-active" : undefined} aria-current={secili === k.kod ? "page" : undefined}>
              {k.ad}
              {k.kod === "havale" ? <small>{kanalSayisi("Havale/EFT")}</small> : k.kod === "kart" ? <small>{kanalSayisi("Kart (PayTR)")}</small> : k.kod === "bireysel" ? <small>{tahsilatlar.filter((t) => !t.organizationId).length}</small> : null}
            </Link>
          ))}
        </div>
      </div>

      {birimKarisik ? <KNot ton="uyari">Kayıtlarda birden çok para birimi var; toplamlar TRY varsayımıyla yazıldı ve güvenilir değil.</KNot> : null}

      {secili === "proforma" ? (
        <>
          <div className="talep-bas-eylem">
            <PanelModal triggerLabel="Yeni proforma" triggerClassName="panel-primary" kicker="Proforma" title="Yeni proforma" boy="genis"
              description="Müşteriyi seçin; alıcı bilgileri kayıttan dolar. Kurum ArvoOS ve ArvoCal proformasını ArvoOS panelinde, ArvoLab proformasını ArvoLab'da görür ve yazdırır." basaridaKapan>
              <ProformaFormu musteriler={proformaMusterileri} kisayollar={kisayollar} bugun={bugun} gecerlilik={onBesGunSonra(bugun)}
                kdvOrani={VARSAYILAN_KDV_ORANI} action={proformaOlustur} />
            </PanelModal>
          </div>
          {proformalar.length ? (
            <KListe>
              {proformalar.map((p) => {
                const gorunum = proformaGorunumu(p.durum, p.gecerlilik_tarihi, bugun);
                const kalemler = kalemleriCoz(p.kalemler);
                const secenekler = adaylar.get(p.id) ?? [];
                return (
                  <KOge
                    key={p.id}
                    simge={p.musteri_adi}
                    baslik={`${p.proforma_no} · ${productName(p.product)} · ${p.musteri_adi}`}
                    /* Kurumda unvanın yanında yetkili, abonede adın yanında e-posta: eskiden yalnızca musteri_adi vardı. */
                    alt={[p.alici?.unvan && p.alici.adSoyad ? p.alici.adSoyad : null, p.alici?.eposta, kalemler.map((k) => k.aciklama).join(", "), `${tarih(p.duzenleme_tarihi)} – ${tarih(p.gecerlilik_tarihi)}`].filter(Boolean).join(" · ")}
                    durum={{ etiket: PROFORMA_DURUM_ADI[gorunum], ton: DURUM_TONU[gorunum] }}
                    deger={para(Number(p.toplam), p.para_birimi)}
                    degerAlt={`KDV %${Number(p.kdv_orani)} dahil`}
                    sonu={p.durum === "bekliyor" ? (
                      <PanelModal triggerLabel="Ödemeyle eşleştir" kicker={p.proforma_no} title={`${p.musteri_adi} · ${para(Number(p.toplam), p.para_birimi)}`}
                        description="Müşterinin bu proforma için yaptığı ödemeyi seçin. Tutarı tutan ödemeler başta; ödeme makbuzunda proforma numarası görünür." basaridaKapan>
                        {secenekler.length ? (
                          <form className="panel-form kayit-formu" action={proformaEsle}>
                            <input type="hidden" name="id" value={p.id} />
                            <label className="wide"><span>Ödeme<b className="req" aria-hidden="true">*</b></span>
                              <select name="odeme_id" required defaultValue={secenekler[0]?.tutarTutuyor ? secenekler[0].id : ""}>
                                <option value="" disabled>Seçin</option>
                                {secenekler.map((o) => (
                                  <option key={o.id} value={o.id}>{tarih(o.tarih)} · {para(o.tutar, p.para_birimi)}{o.tutarTutuyor ? " · tutar tutuyor" : ""}</option>
                                ))}
                              </select>
                            </label>
                            <div className="wide panel-form-actions kayit-formu-eylem"><p>Bir ödeme yalnızca bir proformayı kapatır.</p><button className="panel-primary" type="submit">Eşleştir</button></div>
                          </form>
                        ) : (
                          <KNot>Bu müşterinin henüz eşlenmemiş bir ödemesi yok. Kurumun havalesi önce Ödeme onaylarından onaylanmalı.</KNot>
                        )}
                        <form className="panel-form kayit-formu" action={proformaIptal}>
                          <input type="hidden" name="id" value={p.id} />
                          <div className="wide panel-form-actions kayit-formu-eylem"><p>Müşteri ödemeyecekse proformayı iptal edin; numara korunur.</p><button className="panel-secondary" type="submit">Proformayı iptal et</button></div>
                        </form>
                      </PanelModal>
                    ) : null}
                  />
                );
              })}
            </KListe>
          ) : (
            <KBos baslik="Henüz proforma yok" aciklama="Ödeme almadan önce müşteriye proforma düzenleyin; müşteri ödedikten sonra burada ödemeyle eşleştirin, faturayı da tahsilatın yanından yükleyin." />
          )}
        </>
      ) : secili === "fatura" ? (
        /* Yüklenen platform faturaları (son elli). Fatura elle kesilip her
           tahsilatın yanından yükleniyor; müşteri ArvoLab'da görüyor. */
        faturaListesi.length ? (
          <KListe>
            {faturaListesi.map((f) => (
              <KOge
                key={`${f.no}-${f.tarih}`}
                simge={f.kim}
                baslik={`Fatura ${f.no}`}
                alt={`${f.kim} · ${tarih(f.tarih)}`}
                sonu={f.url ? <a className="panel-secondary" href={f.url} target="_blank" rel="noreferrer noopener">PDF</a> : null}
              />
            ))}
          </KListe>
        ) : (
          <KBos
            baslik="Henüz fatura yüklenmedi"
            aciklama="Faturalar elle kesiliyor. Tahsilat listesinde ödemenin yanındaki “Fatura yükle” ile PDF'i ekleyin; müşteri ArvoLab'daki Faturalar ve ödemeler bölümünde görür."
          />
        )
      ) : gorunen.length ? (
        /* iOS listesi (14.10.2026): kim, kanal ve tarih tek satırda;
           sağda tutar. Eskiden dört sütunlu tabloydu. */
        <KListe>
          {gorunen.map((t) => (
            <KOge
              key={t.anahtar}
              href={t.organizationId ? `/panel/platform/musteriler/${t.organizationId}` : "/panel/platform/subscribers"}
              simge={t.kim}
              baslik={t.kim}
              alt={`${t.kanal} · ${tarih(t.tarih)}`}
              deger={para(t.amount, t.currency)}
              sonu={
                faturaHaritasi.get(t.anahtar) ? (
                  <a className="panel-secondary" href={faturaHaritasi.get(t.anahtar)!.url ?? undefined} target="_blank" rel="noreferrer noopener">
                    Fatura {faturaHaritasi.get(t.anahtar)!.no}
                  </a>
                ) : (
                  <PanelModal triggerLabel="Fatura yükle" kicker="Platform faturası" title={`${t.kim} · ${para(t.amount, t.currency)}`}
                    description="Kestiğiniz faturanın PDF'ini yükleyin; müşteri ArvoLab'daki Faturalar ve ödemeler bölümünde görür." basaridaKapan>
                    <form className="panel-form kayit-formu" action={faturaYukle}>
                      <input type="hidden" name="tur" value={t.tur} />
                      <input type="hidden" name="odeme_id" value={t.id} />
                      <label><span>Fatura numarası<b className="req" aria-hidden="true">*</b></span><input name="fatura_no" maxLength={60} required autoComplete="off" /></label>
                      <label><span>Fatura tarihi<b className="req" aria-hidden="true">*</b></span><input name="fatura_tarihi" type="date" required /></label>
                      <label className="wide"><span>Fatura PDF<b className="req" aria-hidden="true">*</b></span><input name="dosya" type="file" accept="application/pdf" required /></label>
                      <div className="wide panel-form-actions kayit-formu-eylem"><p>Yeniden yüklemek bu ödemenin faturasını değiştirir.</p><button className="panel-primary" type="submit">Faturayı yükle</button></div>
                    </form>
                  </PanelModal>
                )
              }
            />

          ))}
        </KListe>
      ) : (
        <KBos baslik={secili ? "Bu kanalda tahsilat yok" : "Henüz tahsilat yok"} aciklama="Havale onayları, kart ödemeleri ve bireysel abonelikler burada toplanır." />
      )}
    </section>
  </main>;
}
