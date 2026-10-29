import { TarihSecici } from "@/app/panel/components/tarih-secici";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getPaymentIncidents } from "@/lib/payment-incidents";
import { musteriMi } from "@/lib/kurum-turu";
import { KNot } from "../konsol-ui";
import { basHarfleri, para, sayi, tarih } from "../bicim";
import { createAdminClient } from "@/lib/supabase/admin";
import { PanelModal } from "../../components/panel-modal";
import { bankaHesabiDurumu, bankaHesabiKaydet, faturaYukle, proformaEsle, proformaIptal, proformaOlustur } from "./actions";
import { ibanYazisi } from "@/lib/iban";
import { eslesmeSirasi, kalemleriCoz, PROFORMA_DURUM_ADI, proformaGorunumu, VARSAYILAN_KDV_ORANI, type ProformaAlici } from "@/lib/proforma";
import { productName } from "@/lib/products";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { ProformaFormu, type ProformaFiyatKisayolu, type ProformaMusterisi } from "./proforma-formu";
import { arvolabAdlari, fiyatKisayollari, kurumAlicilari } from "./proforma-verisi";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { AylikGrafik, type AylikSatir } from "./aylik-grafik";
import "../platform.css";
import "../../components/kayit-formu.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

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

/*
  İKİ KAT SÜZGEÇ (29.10.2026, konsol yeniden kurulurken). Sekiz çip tek
  rayda duruyordu ve ikisi başka şeydi: Havale, Kart, Bireysel listeyi
  SÜZÜYOR; Faturalar, Proformalar, Banka hesapları, Kartla ve otomatik
  başka bir EKRAN açıyor. Ekranlar artık dock'un Finans bölümlerinde
  (konsol-apps.ts) ve sayfanın başlığı hangisinin açık olduğunu
  söylüyor; listenin içinde yalnızca tahsilat süzgeçleri kaldı.
*/
const KANALLAR = [
  { kod: "", ad: "Tümü" },
  { kod: "havale", ad: "Havale" },
  { kod: "kart", ad: "Kart" },
  { kod: "bireysel", ad: "Bireysel" },
  { kod: "fatura", ad: "Faturalar" },
  { kod: "proforma", ad: "Proformalar" },
  { kod: "otomatik", ad: "Kartla ve otomatik" },
  // Proformada ve müşterinin Havale / EFT sekmesinde görünen hesaplar (29.10.2026'ya kadar düzenlenemiyordu).
  { kod: "banka", ad: "Banka hesapları" },
] as const;
const SUZGEC_KANALLARI = new Set(["", "havale", "kart", "bireysel"]);
const EKRAN_ADI: Record<string, { baslik: string; alt: string }> = {
  "": { baslik: "Tahsilatlar", alt: "Onaylanan kurum ödemeleri ve bireysel abone ödemeleri; son elli kayıt" },
  havale: { baslik: "Tahsilatlar", alt: "Havale / EFT ile gelenler" },
  kart: { baslik: "Tahsilatlar", alt: "Kartla (PayTR) gelenler" },
  bireysel: { baslik: "Tahsilatlar", alt: "Bireysel abone ödemeleri" },
  fatura: { baslik: "Faturalar", alt: "Tahsilatlara yüklenen platform faturaları; son elli" },
  proforma: { baslik: "Proformalar", alt: "Ödemeden önce müşteriye giden belgeler; son elli" },
  otomatik: { baslik: "Kartla ve otomatik", alt: "Kayıtlı kartla ödeme denemeleri ve açık otomatik yenilemeler" },
  banka: { baslik: "Banka hesapları", alt: "Proformada ve müşterinin Havale / EFT sekmesinde görünen hesaplar" },
};

/* Kartla ödeme denemeleri (PayTR Direkt API, 28.10.2026). */
const KART_TURU: Record<string, string> = { ilk: "Kartla ödeme", kayitli: "Kayıtlı kart", otomatik: "Otomatik yenileme" };
const KART_DURUMU: Record<string, { etiket: string; ton: string }> = {
  bekliyor: { etiket: "Bildirim bekleniyor", ton: "info" },
  basarili: { etiket: "Ödendi", ton: "success" },
  basarisiz: { etiket: "Başarısız", ton: "danger" },
};

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
  type BankaHesabi = { id: string; bank_name: string; account_holder: string | null; iban: string; currency: string; is_active: boolean; sort_order: number };
  let bankaHesaplari: BankaHesabi[] = [];
  if (secili === "banka") {
    // Kurucu pasifleri de görür (RLS: authenticated_read_active_bank_accounts).
    /* sınırsız-tamam: Arvo'nun kendi banka hesapları, elle girilen birkaç satır. */
    const { data, error } = await supabase.from("platform_bank_accounts").select("id,bank_name,account_holder,iban,currency,is_active,sort_order").order("sort_order").order("created_at");
    if (error) throw new Error("Banka hesapları okunamadı: " + error.message);
    bankaHesaplari = (data ?? []) as BankaHesabi[];
  }
  const bankaFormu = (h?: BankaHesabi) => (
    <form className="panel-form kayit-formu" action={bankaHesabiKaydet}>
      {h ? <input type="hidden" name="id" value={h.id} /> : null}
      <label><span>Banka<b className="req" aria-hidden="true">*</b></span><input name="bank_name" required minLength={2} maxLength={120} defaultValue={h?.bank_name ?? ""} placeholder="Örn. T. Garanti Bankası" /></label>
      <label><span>Hesap sahibi<b className="req" aria-hidden="true">*</b></span><input name="account_holder" required minLength={2} maxLength={160} defaultValue={h?.account_holder ?? ""} placeholder="Ticari unvan, örn. Arvo Yazılım A.Ş." /></label>
      <label className="wide"><span>IBAN<b className="req" aria-hidden="true">*</b></span><input name="iban" required maxLength={42} defaultValue={h ? ibanYazisi(h.iban) : ""} placeholder="TR00 0000 0000 0000 0000 0000 00" autoComplete="off" spellCheck={false} /></label>
      <label>Para birimi<select name="currency" defaultValue={h?.currency ?? "TRY"}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
      <label>Sıra<input name="sort_order" type="number" min="0" max="999" step="1" defaultValue={h?.sort_order ?? 10} /></label>
      <p className="wide kayit-formu-not">IBAN denetim hanesinden geçer; tek hanesi yanlış yazılmış IBAN kaydedilmez. Hesap proformada ve müşterinin Havale / EFT sekmesinde bu sırayla görünür.</p>
      <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">{h ? "Değişiklikleri kaydet" : "Hesabı ekle"}</button></div>
    </form>
  );

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
  /*
    KARTLA ÖDEME VE OTOMATİK YENİLEME (28.10.2026): yalnızca kendi
    sekmesinde, son elli deneme ve açık otomatik yenilemeler. Tablolar
    istemciye kapalı; kurucu servis rolüyle okur. Başarısız denemeler
    başta değil zaman sırasında: kurucu bir kurumun üç denemesini art
    arda görsün.
  */
  type KartIslemi = { merchant_oid: string; tur: string; durum: string; tutar: number; hata_mesaji: string | null; created_at: string; payment_links: { payer_organization_id: string | null; product: string } | null };
  type AcikYenileme = { organization_id: string; product: string; deneme_sayisi: number; son_hata: string | null; onay_at: string; paytr_kayitli_kartlar: { son4: string } | null };
  let kartIslemleri: KartIslemi[] = [];
  let acikYenilemeler: AcikYenileme[] = [];
  if (admin && secili === "otomatik") {
    const [iYaniti, yYaniti] = await Promise.all([
      admin.from("paytr_kart_islemleri").select("merchant_oid,tur,durum,tutar,hata_mesaji,created_at,payment_links(payer_organization_id,product)")
        .order("created_at", { ascending: false }).limit(LISTE),
      admin.from("paytr_otomatik_yenileme").select("organization_id,product,deneme_sayisi,son_hata,onay_at,paytr_kayitli_kartlar(son4)")
        .eq("aktif", true).not("organization_id", "is", null).order("onay_at", { ascending: false }),
    ]);
    if (iYaniti.error) throw new Error("Kartla ödemeler okunamadı: " + iYaniti.error.message);
    if (yYaniti.error) throw new Error("Otomatik yenilemeler okunamadı: " + yYaniti.error.message);
    kartIslemleri = (iYaniti.data ?? []) as unknown as KartIslemi[];
    acikYenilemeler = (yYaniti.data ?? []) as unknown as AcikYenileme[];
  }
  const kurumAdi = (id: string | null | undefined) => {
    const k = id ? kurumBilgisi.get(id) : null;
    return k ? (k.display_name || k.name) : "Kurum";
  };

  const bugun = todayInIstanbul();

  const bekleyenSatirlar = (bekleyenler ?? []) as { amount: number; currency: string }[];
  // tuzak-tamam: sınırsız sorgu (bekleyen havalelerin hepsi), toplam doğru.
  const bekleyenTutar = bekleyenSatirlar.reduce((t, b) => t + Number(b.amount), 0);

  /*
    Aylık grafik yalnızca ana Tahsilatlar ekranında (süzgeçsiz): kanal
    süzgeci listeyi süzüyor, grafik bütün kanalların toplamı ve süzgeç
    değişince değişmeyen bir çizim "süzüldü" diye okunurdu. Okunamazsa
    sayfa düşmüyor, grafiğin yerinde nedeni yazıyor — liste ve şerit yine
    doğru.
  */
  let aylik: { satirlar: AylikSatir[]; hata: string | null } | null = null;
  if (secili === "") {
    if (!admin) aylik = { satirlar: [], hata: "Sunucu anahtarı tanımlı değil." };
    else {
      const { data, error } = await admin.rpc("platform_tahsilat_aylik", { p_ay: 12 });
      if (error) console.error("[konsol] aylık tahsilat okunamadı", error.message);
      aylik = { satirlar: (data ?? []) as AylikSatir[], hata: error ? error.message : null };
    }
  }

  const ekran = EKRAN_ADI[secili] ?? EKRAN_ADI[""];
  const kanalAdeti = (kod: string) =>
    kod === "havale" ? kanalSayisi("Havale/EFT") : kod === "kart" ? kanalSayisi("Kart (PayTR)") : kod === "bireysel" ? tahsilatlar.filter((t) => !t.organizationId).length : tahsilatlar.length;
  const kisi = (ad: string, alt: string, href: string | null, tur?: string) => (
    href ? (
      <Link className="crm-row-link ek-kisi" href={href}>
        <span className="ek-avatar" data-tur={tur} aria-hidden="true">{basHarfleri(ad)}</span>
        <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span><span className="crm-table-sub">{alt}</span></span>
      </Link>
    ) : (
      <span className="ek-kisi">
        <span className="ek-avatar" data-tur={tur} aria-hidden="true">{basHarfleri(ad)}</span>
        <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span><span className="crm-table-sub">{alt}</span></span>
      </span>
    )
  );
  const bosKutu = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );
  const faturaFormu = (t: Tahsilat) => (
    <PanelModal triggerLabel="Fatura yükle" kicker="Platform faturası" title={`${t.kim} · ${para(t.amount, t.currency)}`}
      description="Kestiğiniz faturanın PDF'ini yükleyin; müşteri ArvoLab'daki Faturalar ve ödemeler bölümünde görür." basaridaKapan>
      <form className="panel-form kayit-formu" action={faturaYukle}>
        <input type="hidden" name="tur" value={t.tur} />
        <input type="hidden" name="odeme_id" value={t.id} />
        <label><span>Fatura numarası<b className="req" aria-hidden="true">*</b></span><input name="fatura_no" maxLength={60} required autoComplete="off" /></label>
        <label><span>Fatura tarihi<b className="req" aria-hidden="true">*</b></span><TarihSecici name="fatura_tarihi" required /></label>
        <label className="wide"><span>Fatura PDF<b className="req" aria-hidden="true">*</b></span><input name="dosya" type="file" accept="application/pdf" required /></label>
        <div className="wide panel-form-actions kayit-formu-eylem"><p>Yeniden yüklemek bu ödemenin faturasını değiştirir.</p><button className="panel-primary" type="submit">Faturayı yükle</button></div>
      </form>
    </PanelModal>
  );

  /*
    PANELİN LİSTE DİLİ (29.10.2026). Beş görünümün hepsi iOS satırıydı
    (KListe): tarih, kanal ve tutar tek satırın altına sıkışıyordu, tutar
    sütunu hizalanmadığı için "bu hafta ne geldi" satır satır okunuyordu.
    Müşteriler ve Ekip listesiyle aynı tablo: hizalı sütunlar, telefonda
    tek satırlık özet (MobilSatir), satır sonunda kendi düğmesi.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa finans-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">FİNANS</small>
        <h1>{ekran.baslik}</h1>
        <p className="ek-alt">{ekran.alt}</p>
      </div>
      <div className="talep-bas-eylem">
        {secili === "proforma" ? (
          <PanelModal triggerLabel="Yeni proforma" triggerClassName="panel-primary" kicker="Proforma" title="Yeni proforma" boy="genis"
            description="Müşteriyi seçin; alıcı bilgileri kayıttan dolar. Kurum ArvoOS ve ArvoCal proformasını ArvoOS panelinde, ArvoLab proformasını ArvoLab'da görür ve yazdırır." basaridaKapan>
            <ProformaFormu musteriler={proformaMusterileri} kisayollar={kisayollar} bugun={bugun} gecerlilik={onBesGunSonra(bugun)}
              kdvOrani={VARSAYILAN_KDV_ORANI} action={proformaOlustur} />
          </PanelModal>
        ) : secili === "banka" ? (
          <PanelModal triggerLabel="Yeni banka hesabı" triggerClassName="panel-primary" kicker="Banka hesapları" title="Yeni banka hesabı" basaridaKapan
            description="Proformada ve müşterinin Havale / EFT sekmesinde görünür.">{bankaFormu()}</PanelModal>
        ) : null}
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer ekranlar">⋯</summary>
          <div className="os-menu-list" role="menu">
            {KANALLAR.filter((k) => !SUZGEC_KANALLARI.has(k.kod)).map((k) => (
              <Link key={k.kod} className="os-menu-item" role="menuitem" href={`/panel/platform/tahsilat?kanal=${k.kod}`}>{k.ad}</Link>
            ))}
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/payments">Ödeme onayları</Link>
            <Link className="os-menu-item" role="menuitem" href="/panel/platform/billing">Abonelikler</Link>
          </div>
        </details>
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

    {aylik ? (
      aylik.hata
        ? <KNot ton="uyari"><b>Aylık tahsilat grafiği okunamadı.</b> {aylik.hata}</KNot>
        : <AylikGrafik satirlar={aylik.satirlar} />
    ) : null}

    <section className="panel-card talep-bilgi" aria-label={ekran.baslik}>
      {SUZGEC_KANALLARI.has(secili) ? (
        <div className="ekip-suzgec talep-suzgec ek-arac">
          <nav className="ek-segment" aria-label="Kanal">
            {KANALLAR.filter((k) => SUZGEC_KANALLARI.has(k.kod)).map((k) => (
              <Link key={k.kod} href={k.kod ? `/panel/platform/tahsilat?kanal=${k.kod}` : "/panel/platform/tahsilat"}
                className={secili === k.kod ? "is-active" : undefined} aria-current={secili === k.kod ? "page" : undefined}>
                {k.ad} <small>{kanalAdeti(k.kod)}</small>
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      {birimKarisik ? <KNot ton="uyari">Kayıtlarda birden çok para birimi var; toplamlar TRY varsayımıyla yazıldı ve güvenilir değil.</KNot> : null}

      {secili === "banka" ? (
        <>
          {bankaHesaplari.some((h) => h.is_active && !h.account_holder) ? <KNot ton="uyari">Hesap sahibi adı boş olan etkin hesap var: müşteri havalede alıcı adını yazamıyor ve proformada yalnızca banka adı görünüyor. Düzenle ile ekleyin.</KNot> : null}
          {bankaHesaplari.length ? (
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="fn-banka">
                <thead><tr><th>Banka</th><th>IBAN</th><th>Hesap sahibi</th><th>Sıra</th><th>Durum</th><th></th></tr></thead>
                <tbody>
                  {bankaHesaplari.map((h) => {
                    const durum = h.is_active ? (h.account_holder ? { etiket: "Etkin", ton: "success" } : { etiket: "Hesap sahibi eksik", ton: "warning" }) : { etiket: "Pasif", ton: "neutral" };
                    return (
                      <tr key={h.id} className={h.is_active ? undefined : "is-pasif"}>
                        <td data-label="Banka">{kisi(h.bank_name, h.currency, null, "kurum")}</td>
                        <td data-label="IBAN"><code className="fn-iban">{ibanYazisi(h.iban)}</code></td>
                        <td data-label="Hesap sahibi">{h.account_holder ? <span className="crm-table-title">{h.account_holder}</span> : <span className="k-ios-eksik">Yazılmamış</span>}</td>
                        <td data-label="Sıra"><span className="crm-table-sub">{h.sort_order}</span></td>
                        <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <td className="crm-table-actions">
                          <span className="k-proforma-eylem">
                            <PanelModal triggerLabel="Düzenle" kicker="Banka hesapları" title={`${h.bank_name} hesabını düzenle`} basaridaKapan
                              description="Değişiklik bundan sonra açılan proformalarda ve Havale / EFT sekmesinde görünür.">{bankaFormu(h)}</PanelModal>
                            <form action={bankaHesabiDurumu}>
                              <input type="hidden" name="id" value={h.id} />
                              <input type="hidden" name="aktif" value={h.is_active ? "0" : "1"} />
                              <button className="panel-secondary" type="submit">{h.is_active ? "Pasife al" : "Etkinleştir"}</button>
                            </form>
                          </span>
                        </td>
                        <MobilSatir baslik={`${h.bank_name} · ${h.currency}`} durum={durum} alt={[ibanYazisi(h.iban), h.account_holder || "hesap sahibi yazılmamış"]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : bosKutu("Banka hesabı yok", "Havaleyle ödeyecek müşteriler için en az bir hesap ekleyin; proformada ödeme bilgileri bölümü buradan dolar.")}
        </>
      ) : secili === "proforma" ? (
        proformalar.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="fn-proforma">
              <thead><tr><th>Proforma</th><th>Müşteri</th><th className="crm-col-date">Geçerlilik</th><th className="crm-col-amount">Tutar</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {proformalar.map((p) => {
                  const gorunum = proformaGorunumu(p.durum, p.gecerlilik_tarihi, bugun);
                  const kalemler = kalemleriCoz(p.kalemler);
                  const secenekler = adaylar.get(p.id) ?? [];
                  const belge = `/panel/platform/tahsilat/proforma/${p.id}`;
                  const durum = { etiket: PROFORMA_DURUM_ADI[gorunum], ton: DURUM_TONU[gorunum] };
                  return (
                    <tr key={p.id} className={gorunum === "iptal" ? "is-pasif" : undefined}>
                      <td data-label="Proforma">
                        <Link className="crm-row-link" href={belge}>
                          <span className="crm-table-title plt-mono">{p.proforma_no}</span>
                          <span className="crm-table-sub">{[productName(p.product), kalemler.map((k) => k.aciklama).join(", ")].filter(Boolean).join(" · ")}</span>
                        </Link>
                      </td>
                      <td data-label="Müşteri">
                        <span className="crm-table-title" title={p.musteri_adi}>{p.musteri_adi}</span>
                        {/* Kurumda unvanın yanında yetkili, abonede adın yanında e-posta. */}
                        <span className="crm-table-sub">{[p.alici?.unvan && p.alici.adSoyad ? p.alici.adSoyad : null, p.alici?.eposta].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <td className="crm-col-date" data-label="Geçerlilik">{tarih(p.gecerlilik_tarihi)}<small>düzenleme {tarih(p.duzenleme_tarihi)}</small></td>
                      <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{para(Number(p.toplam), p.para_birimi)}</span><small>KDV %{Number(p.kdv_orani)} dahil</small></td>
                      <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                      <td className="crm-table-actions">
                        {p.durum === "bekliyor" ? (
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
                        ) : <span className="crm-row-chevron" aria-hidden="true">›</span>}
                      </td>
                      <MobilSatir href={belge} baslik={`${p.proforma_no} · ${p.musteri_adi}`} durum={durum}
                        alt={[productName(p.product), para(Number(p.toplam), p.para_birimi), `son gün ${tarih(p.gecerlilik_tarihi)}`]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        ) : bosKutu("Henüz proforma yok", "Ödeme almadan önce müşteriye proforma düzenleyin; müşteri ödedikten sonra burada ödemeyle eşleştirin, faturayı da tahsilatın yanından yükleyin.")
      ) : secili === "otomatik" ? (
        <>
          <header className="phr-bas fn-alt-bas"><h2>Açık otomatik yenilemeler <span className="pu-sayi">{sayi(acikYenilemeler.length)}</span></h2><small>Kayıtlı karttan her dönem sonunda çekilir; 3 gün önce hatırlatma gider.</small></header>
          {acikYenilemeler.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="fn-yenileme">
                <thead><tr><th>Kurum</th><th>Kart</th><th className="crm-col-date">Onay</th><th>Durum</th></tr></thead>
                <tbody>
                  {acikYenilemeler.map((y) => {
                    const durum = y.deneme_sayisi > 0 ? { etiket: `${y.deneme_sayisi}. deneme başarısız`, ton: "warning" } : { etiket: "Açık", ton: "success" };
                    return (
                      <tr key={`${y.organization_id}-${y.product}`}>
                        <td data-label="Kurum">{kisi(kurumAdi(y.organization_id), productName(y.product), `/panel/platform/musteriler/${y.organization_id}`, "kurum")}</td>
                        <td data-label="Kart"><span className="crm-table-title plt-mono">•••• {y.paytr_kayitli_kartlar?.son4 ?? "????"}</span>{y.son_hata ? <span className="crm-table-sub" title={y.son_hata}>{y.son_hata}</span> : null}</td>
                        <td className="crm-col-date" data-label="Onay">{tarih(y.onay_at)}</td>
                        <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <MobilSatir href={`/panel/platform/musteriler/${y.organization_id}`} baslik={kurumAdi(y.organization_id)} durum={durum}
                          alt={[productName(y.product), `•••• ${y.paytr_kayitli_kartlar?.son4 ?? "????"}`, y.son_hata]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bosKutu("Açık otomatik yenileme yok", "Kurum kartla öderken “Kartımı kaydet, aboneliğim otomatik yenilensin” seçeneğini işaretlerse burada görünür.")}

          <header className="phr-bas fn-alt-bas"><h2>Son kartla ödeme denemeleri</h2><small>Kartla ödeme, kayıtlı kart ve otomatik yenileme; son elli deneme.</small></header>
          {kartIslemleri.length ? (
            <div className="talep-tablo fn-ic-tablo">
              <table className="crm-data-table" data-cols="fn-kart">
                <thead><tr><th>Kurum</th><th>Tür</th><th className="crm-col-date">Tarih</th><th className="crm-col-amount">Tutar</th><th>Durum</th></tr></thead>
                <tbody>
                  {kartIslemleri.map((i) => {
                    const kurum = i.payment_links?.payer_organization_id;
                    const durum = KART_DURUMU[i.durum] ?? { etiket: i.durum, ton: "neutral" };
                    return (
                      <tr key={i.merchant_oid}>
                        <td data-label="Kurum">{kisi(kurumAdi(kurum), productName(i.payment_links?.product ?? "arvoos"), kurum ? `/panel/platform/musteriler/${kurum}` : null, "kurum")}</td>
                        <td data-label="Tür"><span className="crm-table-title">{KART_TURU[i.tur] ?? i.tur}</span><span className="crm-table-sub plt-mono" title={i.hata_mesaji ?? undefined}>{i.hata_mesaji ?? i.merchant_oid}</span></td>
                        <td className="crm-col-date" data-label="Tarih">{tarih(i.created_at)}</td>
                        <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{para(Number(i.tutar), "TRY")}</span></td>
                        <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <MobilSatir href={kurum ? `/panel/platform/musteriler/${kurum}` : null} baslik={kurumAdi(kurum)} durum={durum}
                          alt={[KART_TURU[i.tur] ?? i.tur, para(Number(i.tutar), "TRY"), tarih(i.created_at), i.hata_mesaji]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bosKutu("Henüz kartla ödeme denemesi yok", "PayTR kart saklama açıldığında kurumların kartla ödemeleri ve otomatik çekimler burada listelenir.")}
        </>
      ) : secili === "fatura" ? (
        /* Yüklenen platform faturaları (son elli). Fatura elle kesilip her
           tahsilatın yanından yükleniyor; müşteri ArvoLab'da görüyor. */
        faturaListesi.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="fn-fatura">
              <thead><tr><th>Fatura</th><th>Müşteri</th><th className="crm-col-date">Tarih</th><th></th></tr></thead>
              <tbody>
                {faturaListesi.map((f) => (
                  <tr key={`${f.no}-${f.tarih}`}>
                    <td data-label="Fatura"><span className="crm-table-title plt-mono">{f.no}</span></td>
                    <td data-label="Müşteri"><span className="crm-table-title">{f.kim}</span></td>
                    <td className="crm-col-date" data-label="Tarih">{tarih(f.tarih)}</td>
                    <td className="crm-table-actions">{f.url ? <a className="panel-secondary" href={f.url} target="_blank" rel="noreferrer noopener">PDF</a> : <span className="crm-table-sub">dosya açılamadı</span>}</td>
                    <MobilSatir baslik={`Fatura ${f.no}`} alt={[f.kim, tarih(f.tarih)]} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : bosKutu("Henüz fatura yüklenmedi", "Faturalar elle kesiliyor. Tahsilat listesinde ödemenin yanındaki “Fatura yükle” ile PDF'i ekleyin; müşteri ArvoLab'daki Faturalar ve ödemeler bölümünde görür.")
      ) : gorunen.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table" data-cols="fn-tahsilat">
            <thead><tr><th>Müşteri</th><th>Kanal</th><th className="crm-col-date">Tarih</th><th className="crm-col-amount">Tutar</th><th className="fn-eylem-bas">Fatura</th></tr></thead>
            <tbody>
              {gorunen.map((t) => {
                const href = t.organizationId ? `/panel/platform/musteriler/${t.organizationId}` : "/panel/platform/subscribers";
                const fatura = faturaHaritasi.get(t.anahtar);
                return (
                  <tr key={t.anahtar}>
                    <td data-label="Müşteri">{kisi(t.kim, t.tur === "abone" ? "Bireysel" : "Kurumsal", href, t.tur === "abone" ? "bireysel" : "kurum")}</td>
                    <td data-label="Kanal"><span className="crm-table-title">{t.kanal}</span></td>
                    <td className="crm-col-date" data-label="Tarih">{tarih(t.tarih)}</td>
                    <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title cari-arti">{para(t.amount, t.currency)}</span></td>
                    <td className="crm-table-actions">
                      {fatura ? (
                        <a className="panel-secondary" href={fatura.url ?? undefined} target="_blank" rel="noreferrer noopener">Fatura {fatura.no}</a>
                      ) : faturaFormu(t)}
                    </td>
                    <MobilSatir href={href} baslik={t.kim} alt={[t.kanal, tarih(t.tarih)]}
                      isaretler={[{ metin: para(t.amount, t.currency), ton: "basari" }]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
      ) : bosKutu(secili ? "Bu kanalda tahsilat yok" : "Henüz tahsilat yok", "Havale onayları, kart ödemeleri ve bireysel abonelikler burada toplanır.")}
    </section>
  </main>;
}
