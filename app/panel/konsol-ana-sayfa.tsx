import type { ReactNode } from "react";
import { sureOlcer } from "@/lib/sure-olcumu";
import { kopruSagliklari } from "@/lib/kopru-sagliklari";
import MIGRATION_IZLERI from "@/lib/migration-izleri.json";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabKopyalari } from "@/lib/arvolab";
import { arcKopyalari } from "@/lib/arc-bridge";
import { randevuKopyalari } from "@/lib/randevu-bridge";
import { musteriMi } from "@/lib/kurum-turu";
import { renewalReminders, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";
import { productName } from "@/lib/products";
import { donem as donemiCoz, type DonemKodu } from "@/lib/konsol/donem";
import { urunPerformansi, type Okuma, type OlcutKodu, type UrunSagligi } from "@/lib/konsol/urun-performansi";
import { UrunPerformansiKarti } from "./konsol-urun-performansi";
import { KararBekleyenlerKarti, OtomasyonlarKarti, type KararKalemi } from "./konsol-ana-kartlar";
import { cronDurumlari, type CronKaydi } from "@/lib/cron-isleri";
import { otomasyonlar, sonOtomatikKontrol, type KopruDurumu } from "@/lib/konsol/otomasyonlar";
import { AZAMI_DENEME } from "@/lib/otomatik-yenileme";
import { DonemSecici, OlcutSecici } from "./konsol-donem-secici";
import { getPaymentIncidents } from "@/lib/payment-incidents";
import { bekleyenKrediler } from "@/lib/ai-kredi-yukleme";
import { istanbulDateTime, todayInIstanbul } from "@/lib/istanbul-date";
import { sayfaliSonuc, tumSatirlar } from "@/lib/rapor-okuma";
import { musteriEtkinlikleri } from "@/lib/musteri-etkinligi-oku";
import { YANIT_BEKLEYEN_DURUMLAR, kuyrukSirala } from "@/lib/destek-kuyrugu";
import Link from "next/link";
import { KONSOL_ALANLARI, uygulamalariSuz, type KonsolKapsami } from "@/lib/konsol-alanlari";
import { konsolUygulamalari } from "./os/konsol-apps";
import { GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, seriBaslangici } from "./os/genel-bakis";
import { para, sayi } from "./platform/bicim";
import "./dashboard.css";
import "./hr/hr.css";
import "./crm/kayit-detay/kayit-detay.css";
import "./konsol-ana-sayfa.css";

/*
  Kurucu konsolunun ana sayfası (yalnızca yonetim.arvo-os.com).

  Konsolun bir "eve dönüş" noktası yoktu: menü doğrudan kiracı listesiyle
  başlıyordu ve kurucunun ilk sorusu ("bugün neye bakmam gerek") hiçbir
  ekranda yanıtlanmıyordu — yanıtı yedi sayfayı tek tek gezerek
  topluyordu.

  Kiracı panelinin ana ekranıyla AYNI BİLEŞENLER (os/genel-bakis):
  selamlama, tam genişlikte 14 günlük grafik, altında dört liste kartı.
  Kurucu gün içinde iki kabuk arasında gidip geliyor; ikisinin ana
  sayfası farklı görünürse hangi alan adında olduğu her seferinde
  yeniden okunuyordu.

  13.10.2026'ya kadar konsol kendi düzenini çiziyordu (dash-widget
  kutuları, dash-row listeleri) — panelin diline benziyordu ama ayrı
  bir koddu ve panel genel bakış şablonuna geçtiğinde geride kaldı.
  Artık aynı bileşenler: düzen tek yerde değişiyor.

  Grafik 14 günlük TAHSİLAT. Konsolun ilk ekranında hiç eğilim yoktu;
  kurucu "bu hafta geçen haftadan iyi mi" sorusunu hiçbir ekranda
  göremiyordu. Sayı kartları grafiğin başlığına taşındı (panelde de
  böyle: ayrı bir satır ekranı aşağı itiyordu).

  BUGÜNÜN İŞLERİ (29.10.2026, konsol yeniden kurulurken). "Bugün neye
  bakmalı?" kartı beş SAYI sıralıyordu ("İncelenecek ödeme bildirimi
  3"); hangi kurumun, ne kadarlık bir ödemesi olduğunu görmek için
  kurucu yine o ekrana gidiyordu — kart yalnızca bir yönlendirmeydi.
  Artık sayfanın ortası sekmeli bir iş kuyruğu: ödeme onayları,
  sözleşmeler, kurulumlar, dönemi dolanlar ve sorunlar, her biri KAYIT
  KAYIT. Sayılar en üstte tek şeritte; grafik ve son hareketler altta.
  Elle yazılmış "Bölümler" kartı kalktı: dock beş uygulamaya indi ve
  aynı listeyi zaten gösteriyor.

  SAYFA ARTIK BİR ŞEY YAZIYOR, AMA TEK BİR ŞEY (29.10.2026, kurum
  sahibinin isteği): beklenenle UYUŞAN ödeme bildirimi kuyruktan tek
  tıkla onaylanabiliyor. Kurucunun günde defalarca yaptığı iş "dekont
  geldi, tutar doğru, onayla" idi ve bunun için ekran değiştirmek
  gerekiyordu.

  Eski kural ("buradan hiçbir şey yazılmıyor") şunun için konmuştu:
  aynı işi iki yerde uygulamak, birinin sapması demek. Kural
  korunuyor — ikinci bir uygulama YOK: düğme payments/actions.ts'teki
  AYNI sunucu işlemini çağırıyor, yetki, tutar denetimi, lisans uzatma
  ve ürün köprüsüne yansıtma orada.

  Farkı olan bildirim burada onaylanmıyor; satır "incelenmeli" deyip
  ekrana götürüyor, çünkü farkı görerek teyit etmek orada. Ret de
  orada: ret notu müşteriye gösteriliyor ve zorunlu.
*/

const TZ = "Europe/Istanbul";


function KisitliKonsol({ kapsam }: { kapsam: KonsolKapsami }) {
  const uygulamalar = uygulamalariSuz(konsolUygulamalari(), kapsam).filter((u) => u.key !== "home");
  return (
    <GenelBakis baslik={selamlama().selam} sinif="konsol-ana">
      <ListeIzgarasi etiket="Konsol alanlarınız">
        <ListeKarti baslik="Konsol alanlarınız" alt="Size açık olan bölümler; yetkiyi tam yetkili bir kurucu Sistem → Ayarlar'dan değiştirir." bos="Size açık bir konsol alanı yok." sayi={uygulamalar.length}>
          {uygulamalar.map((u) => (
            <ListeSatiri key={u.key} href={u.href} baslik={u.label}
              alt={KONSOL_ALANLARI.find((a) => a.kod === u.key)?.aciklama} />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}

function selamlama() {
  const now = new Date();
  const saat = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  const selam = saat < 5 ? "İyi geceler" : saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : saat < 23 ? "İyi akşamlar" : "İyi geceler";
  return { selam };
}

/*
  BAŞLIĞIN ÜSTÜNDEKİ TARİH VE ALTINDAKİ ÖZET CÜMLESİ KALDIRILDI
  (14.10.2026, kurum sahibinin isteği).

  Tarih üst çubukta zaten yazıyor (os-status saati), yani masaüstünde
  aynı bilgi iki yerdeydi. Özet cümlesi de ("Bugün 2 kurulum bekliyor…")
  hemen altındaki "Bugün neye bakmalı?" kartının söylediğini tekrar
  ediyordu; kart sayıları satır satır veriyor, cümle onları virgülle
  birleştiriyordu.

  NOT: üst çubuğun saati 900px altında gizleniyor (.os-clock), yani
  telefonda tarih artık hiçbir yerde yazmıyor. Bilerek böyle; geri
  istenirse etiketi yalnızca dar ekranda göstermek yeterli.
*/
// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const hatirlatmalariHesapla = (lisanslar: RenewalLicense[], kurumlar: RenewalOrganization[]) =>
  renewalReminders(lisanslar, kurumlar, Date.now());

type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; provisioning_state: string; contact_phone: string | null; grup_markasi: boolean | null };
type UrunLisansi = { organization_id: string; product: string; status: string; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };
type BekleyenOdeme = { id: string; organization_id: string; product: string | null; plan_code: string | null; amount: number | null; currency: string | null; payment_method: string | null; created_at: string };
type BekleyenSozlesme = { id: string; contract_no: string | null; customer_name: string | null; amount: number | null; currency: string | null; created_at: string };

/*
  ÜRÜN PERFORMANSI VE ÖNCELİKLİ İŞLER (26.11.2026, onaylı mockup).

  Dönem ADRESTE (?donem=30g): sorgu sunucuda, geri tuşu çalışıyor ve
  seçim paylaşılan bağlantıda korunuyor. İstemci durumu yok.
*/
export async function KonsolAnaSayfa({ donem: donemParam, olcut: olcutParam }: { donem?: DonemKodu; olcut?: OlcutKodu } = {}) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  /* Kabuk da eliyor (layout.tsx) ama yetki üç yerde birden duruyor
     (AGENTS.md): kabuğun bir gün değişmesi bu sayfayı açmamalı. */
  if (!isPlatformOwner) notFound();
  /*
    KISITLI KURUCU (02.11.2026, lib/konsol-alanlari). Bu ekran bütün
    alanların sayılarını taşıyor (gelir, ödeme kuyruğu, destek, kurulum);
    her bölümü ayrı ayrı süzmek yerine kısıtlı kurucuya yalnızca kendi
    alanlarının girişleri gösteriliyor.
  */
  if (konsolKapsami !== null) return <KisitliKonsol kapsam={konsolKapsami} />;
  const admin = createAdminClient();
  /* Uygulanmamış migration (02.11.2026, ayrıntı Sistem sağlığı → Veritabanı).
     Şimdi başlatılıyor, Sorunlar kuyruğunu kurarken bekleniyor: öteki
     okumalarla paralel koşsun. Denetim kurulmamışsa ya da okunamazsa burada
     satır çıkmıyor; sağlık ekranı onu ayrıca söylüyor. */
  /* Okuma başına süre (lib/sure-olcumu): paralelleştirmeden sonra da p75
     ~0,9 sn kaldı; süre tek bir okumada. Eşiği aşan açılış günlüğe
     "[süre] konsol-ana …" satırı yazıyor, en yavaş okuma başta. */
  const sure = sureOlcer("konsol-ana");
  const semaIstegi = admin
    ? Promise.resolve(admin.rpc("platform_sema_eksikleri", { p_izler: MIGRATION_IZLERI })).catch(() => null)
    : Promise.resolve(null);

  /*
    TEK TUR (02.11.2026, hızlandırma). Ana sayfa on ayrı turda bekliyordu:
    kiracılar, sonra sözleşme/kurulum/proforma, sonra ödeme sorunları,
    sonra yeni müşteri sayımı, sonra takipler, sonra destek, sonra grafik,
    sonra köprüler — hiçbiri öncekinin SONUCUNA bakmıyordu (canlıda p75
    ~230 ms, köprüler yavaşken çok daha fazla). Bağımsız okumaların hepsi
    burada aynı anda BAŞLIYOR ve kullanıldıkları yerde bekleniyor; sayfa
    en yavaş tek okuma kadar sürüyor. Supabase sorgusu tembel: then
    çağrılmadan istek gitmiyor, o yüzden Promise.resolve/Promise.all ile
    sarmalanıyor. Kiracılara ya da ödemelere bağlı olanlar (havale
    denetimi, sorunlar) yerinde kalıyor.
  */
  const ayBasi = `${todayInIstanbul().slice(0, 7)}-01T00:00:00+03:00`;
  const seriBasi = seriBaslangici();
  /* Seçili dönem: ürün performansı tablosu ve "seçili dönemde tahsilat"
     bunu kullanıyor. Grafiğin 14 günlük penceresi DEĞİŞMİYOR — şeritteki
     "Son 14 gün tahsilat" ile tablo farklı soruların yanıtı. */
  const secilenDonem = donemiCoz(donemParam ?? "30g");
  /* Dar ekranda tabloda tek ölçüt gösteriliyor; hangisi olduğu adreste.
     Yatay tablo kaydırması yok (onaylı mockup kuralı). */
  const secilenOlcut = olcutParam ?? "musteri";
  /*
    KÜÇÜK OKUMALAR TEK ÇAĞRIDA (03.11.2026, migration 20261103065144).
    Tek tura indirmek yetmedi: otuz beşe yakın istek aynı anda gidince
    veritabanı havuzunda sıra bekliyordu — tek isteğin olağan süresi
    ~85 ms iken buradaki en basit sayım 300–490 ms sürüyordu. On dört
    küçük okuma (iş listeleri, sayımlar, grafik penceresi, ad) artık
    platform_konsol_ana_ozeti'nde.

    Çağrı düşerse (migration henüz uygulanmamış, ya da başka bir hata)
    aşağıdaki her okuma ESKİ sorgusuna dönüyor: ekran yavaş açılır ama
    yanlış açılmaz. Eski sorgu yalnızca o durumda başlıyor (`yedek`).
  */
  type Ozet = Record<string, unknown> & { yeni_kurum: number; yeni_abone: number; ad: string | null };
  const ozetIstegi: Promise<Ozet | null> = Promise.resolve(supabase.rpc("platform_konsol_ana_ozeti", {
    p_ay_basi: ayBasi, p_seri_basi: seriBasi, p_bugun: todayInIstanbul(), p_destek_durumlari: [...YANIT_BEKLEYEN_DURUMLAR],
  })).then(({ data, error }) => {
    if (error) {
      console.error("[konsol] ana sayfa özeti okunamadı, eski okumalara dönülüyor", error.code, error.message);
      return null;
    }
    return data as Ozet;
  }, (hata: unknown) => {
    console.error("[konsol] ana sayfa özeti okunamadı, eski okumalara dönülüyor", hata);
    return null;
  });
  /* Özetin bir parçası, PostgREST yanıtının biçiminde; özet yoksa eski sorgu. */
  const yedek = <A, B>(al: (o: Ozet) => A, eski: () => PromiseLike<B>): Promise<A | B> =>
    ozetIstegi.then<A | B>((o) => (o ? al(o) : eski()));
  const liste = (o: Ozet, anahtar: string) => ({ data: o[anahtar] as Record<string, unknown>[], error: null });
  const sozlesmeIstegi = Promise.all([
    yedek((o) => liste(o, "sozlesmeler"), async () => admin
      ? admin.from("platform_subscription_requests").select("id,contract_no,customer_name,amount,currency,created_at")
          .eq("status", "pending").order("created_at", { ascending: false })
      : Promise.resolve({ data: null, error: null })),
    yedek((o) => liste(o, "kurulum"), async () => admin
      ? admin.from("provisioning_audit_logs").select("id,organization_id,action,result,state,created_at").order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [], error: null })),
    /*
      BEKLEYEN PROFORMALAR (29.10.2026): gönderilmiş, ödemesi gelmemiş
      belgeler. Hepsi, sınırsız: bekleyen proforma bir iş kalemi ve
      sayısı küçük. Geçerliliği en yakın olan başta — kurucunun
      aradığı "hangisinin süresi dolmak üzere".
    */
    yedek((o) => liste(o, "proformalar"), async () => admin
      /* sınırsız-tamam: bekleyen proforma kuyruğu — kurucunun temizlediği iş listesi, sayısı küçük. */
      ? admin.from("platform_proformalari").select("id,proforma_no,musteri_adi,product,toplam,para_birimi,gecerlilik_tarihi,gonderildi_at,bildirildi_at,gonderim_hatasi")
          .eq("durum", "bekliyor").order("gecerlilik_tarihi", { ascending: true })
      : Promise.resolve({ data: null, error: null })),
  ]);
  /* Grup içi de ayrı ölçülüyor: ilk ölçümde bu grup ~470 ms ile en yavaştı
     ve beş okumadan hangisi olduğu görünmüyordu. */
  const odemeIstegi = Promise.all([
    sure.olc("odeme_olaylari", getPaymentIncidents()),
    admin
      ? sure.olc("bekleyen_krediler", bekleyenKrediler(admin)).then((veri) => ({ veri, hata: null as string | null }))
          .catch((hata: unknown) => ({ veri: [], hata: hata instanceof Error ? hata.message : String(hata) }))
      : Promise.resolve({ veri: [], hata: null as string | null }),
    /* Panel etkinliği (lib/musteri-etkinligi-oku): okunamazsa harita null, risk sekmesi "okunamadı". */
    sure.olc("musteri_etkinligi", musteriEtkinlikleri()),
    /* Askıdaki lisanslar (02.11.2026, lib/askidakiler): kuyruk "açalım mı, kapatalım mı".
       sınırsız-tamam: askıdaki lisans sayısı küçük ve kurucunun temizlediği bir iş listesi. */
    yedek((o) => liste(o, "aski_cekirdek"), () => (admin ?? supabase).from("organization_licenses").select("organization_id,suspended_at,suspension_reason").eq("license_status", "suspended")),
    /* sınırsız-tamam: aynı kuyruk, ek ürünler. */
    yedek((o) => liste(o, "aski_urun"), () => (admin ?? supabase).from("organization_product_licenses").select("organization_id,product,suspended_at,suspension_reason").eq("status", "suspended")),
  ]);
  const yeniSayimIstegi = yedek(
    (o) => ({ count: o.yeni_kurum as number | null, error: null as { message: string } | null }),
    () => (admin ?? supabase).from("organizations").select("id", { count: "exact", head: true })
      .gte("created_at", ayBasi).neq("kind", "internal").eq("grup_markasi", false));
  const yeniAboneIstegi = yedek(
    (o) => ({ count: o.yeni_abone as number | null, error: null as { message: string } | null }),
    async () => admin
      ? admin.from("product_subscribers").select("id", { count: "exact", head: true }).is("kurum_id", null).gte("created_at", ayBasi)
      : Promise.resolve({ count: null, error: { message: "sunucu anahtarı yok" } }));
  /* sınırsız-tamam: zamanı gelen takipler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const takipIstegi = yedek(
    (o) => ({ ...liste(o, "takipler"), error: null as { code?: string; message: string } | null }),
    () => supabase.from("platform_musteri_notlari")
      .select("id,organization_id,metin,takip_tarihi")
      .lte("takip_tarihi", todayInIstanbul())
      .is("tamamlandi_at", null)
      .order("takip_tarihi", { ascending: true }));
  /* sınırsız-tamam: yanıt bekleyen talepler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const destekIstegi = yedek((o) => liste(o, "destek"), () => supabase.from("support_tickets")
    .select("id,subject,priority,status,last_message_at,organization_id")
    .in("status", YANIT_BEKLEYEN_DURUMLAR)
    .order("last_message_at", { ascending: true }));
  /*
    OTOMASYONLARIN KOŞMA KAYDI (26.11.2026). Sistem sağlığının okuduğu
    tablonun aynısı (platform_cron_kayitlari); ana sayfa üç satıra
    indirip gösteriyor (lib/konsol/otomasyonlar). İki okuma: her işin
    SON kaydı ve kayıt tutmanın başlangıcı — "hiç koşmamış" ile "henüz
    kayıt yok" ancak bu ikisiyle ayrılıyor.

    hata-tamam: okunamazsa kart "kayıt yok" der ve ana sayfa açılmaya
    devam eder; zamanlanmış iş durumu sayfanın açılmasını engellememeli.
  */
  const cronIstegi = Promise.all([
    supabase.from("platform_cron_durumu").select("is_adi,son_calisma,son_basarili,sonuc,sure_ms,ayrinti")
      .then(({ data, error }) => (error ? [] : ((data ?? []) as unknown as CronKaydi[])), () => []),
    supabase.from("platform_cron_kayitlari").select("basladi_at").order("basladi_at", { ascending: true }).limit(1)
      .then(({ data, error }) => (error || !data?.length ? null : new Date((data[0] as { basladi_at: string }).basladi_at)), () => null),
    /*
      DENEME KUYRUĞU: "Yeniden deneniyor" etiketinin TEK kaynağı
      (26.11.2026, inceleme kararı). Çekimi düşen abonelik günde bir,
      en çok AZAMI_DENEME kez yeniden deneniyor (lib/otomatik-yenileme);
      deneme hakkı tükenmişse artık denenmiyor, o yüzden üst sınır da
      süzgeçte.

      head sayımı: satırlar değil SAYI isteniyor, yani okuma
      .limit() ile kesilen bir listeden türetilmiyor.

      hata-tamam: okunamazsa kuyruk yok sayılır ve satır kendi cron
      kaydına göre yazılır; var olmayan bir denemeyi yazmaktansa
      yazmamak doğru.
    */
    supabase.from("paytr_otomatik_yenileme").select("id", { count: "exact", head: true })
      .eq("aktif", true).gte("deneme_sayisi", 1).lt("deneme_sayisi", AZAMI_DENEME)
      .then(({ count, error }) => (error ? null : count ?? 0), () => null),
  ]);

  const grafikIstegi = Promise.all([
    /* sınırsız-tamam: 14 günlük grafik penceresi; okuma tarihle sınırlı. */
    yedek((o) => liste(o, "havaleler"), () => supabase.from("organization_payment_requests").select("id,organization_id,product,amount,payment_method,reviewed_at")
      .eq("status", "approved").gte("reviewed_at", seriBasi)),
    yedek((o) => liste(o, "bireysel"), () => supabase.from("subscriber_payments").select("id,amount,paid_at").gte("paid_at", seriBasi)),
  ]);
  /*
    ÜRÜN PERFORMANSININ KENDİ OKUMALARI (26.11.2026).

    Grafiğin penceresi 14 gün, tablonunki seçili dönem (30/90/365).
    Özet çağrısının p_seri_basi'sını genişletip ikisini aynı satırlardan
    beslemek grafiği de değiştirirdi; tablo ayrı okuyor.

    ÜÇÜ DE SAYFALI: bir yılın ödemeleri PostgREST'in satır tavanını aşar
    ve toplam sessizce eksilir (AGENTS.md, rakam denetimi). Tarih sınırı
    hem başta hem sonda: üst sınır yazılmazsa "son 30 gün" ileri tarihli
    bir kaydı da toplar.
  */
  const performansIstegi = Promise.all([
    sayfaliSonuc<{ organization_id: string; product: string | null; amount: number | null; reviewed_at: string | null }>(
      "dönem kurum ödemeleri",
      (bas, son) => supabase.from("organization_payment_requests").select("organization_id,product,amount,reviewed_at")
        .eq("status", "approved").gte("reviewed_at", secilenDonem.baslangic).lt("reviewed_at", secilenDonem.bitis)
        .order("reviewed_at").range(bas, son)),
    sayfaliSonuc<{ subscriber_id: string; amount: number | null; paid_at: string | null }>(
      "dönem abone ödemeleri",
      (bas, son) => supabase.from("subscriber_payments").select("subscriber_id,amount,paid_at")
        .gte("paid_at", secilenDonem.baslangic).lt("paid_at", secilenDonem.bitis)
        .order("paid_at").range(bas, son)),
    /* Aboneler dönemle sınırlanamaz: "aktif müşteri" bugünkü durumdur,
       dönüşüm grubu ise created_at'e göre bellekte süzülüyor. */
    sayfaliSonuc<{ id: string; product: string; status: string; trial_ends_at: string | null; created_at: string }>(
      "bireysel aboneler",
      (bas, son) => supabase.from("product_subscribers").select("id,product,status,trial_ends_at,created_at")
        .order("id").range(bas, son)),
  ]);
  /* Köprü sağlığı 60 sn önbellekte (lib/kopru-sagliklari); Sistem sağlığı canlı okuyor. */
  const kopruSagligi = kopruSagliklari();
  const kopruIstegi = Promise.all([
    kopruSagligi.then((k) => k.arvolab),
    kopruSagligi.then((k) => k.arc),
    kopruSagligi.then((k) => k.randevu),
    /*
      Kopyaların KENDİSİ okunuyor, ürün başına TEK sorguyla. Köprü sağlığı
      (yukarıdaki üçü) "çağrı gidiyor mu" diyor; kopyanın bayat olup
      olmadığını söylemiyor. AkademikMerkez'de köprü sağlıklıyken kopya
      altı gün eski kaldı ve bunu hiçbir ekran göstermiyordu.
    */
    arvolabKopyalari(),
    arcKopyalari(),
    randevuKopyalari(),
  ]);
  /* Ölçüm başlangıç anında bağlanıyor: süre okumanın kendisi, bekleme yeri değil. */
  for (const [ad, is] of Object.entries({
    ozet: ozetIstegi, sema: semaIstegi, sozlesme_kurulum_proforma: sozlesmeIstegi, odeme_kredi_etkinlik_aski: odemeIstegi,
    yeni_kurum: yeniSayimIstegi, yeni_abone: yeniAboneIstegi, takip: takipIstegi, destek: destekIstegi,
    grafik: grafikIstegi, kopru_kopya: kopruIstegi,
  } as Record<string, PromiseLike<unknown>>)) void sure.olc(ad, is).catch(() => {});

  const [
    { data: kiraciSatirlari, error: kiraciHatasi },
    { data: urunSatirlari, error: urunHatasi },
    bekleyenOdeme,
    /*
      Kurucunun adı, personel kaydı ve depolama toplamı 26.11.2026'da
      kaldırıldı: Genel Bakış artık selamlama ve kota rozeti çizmiyor
      (onaylı mockup), okunmayan veri de okunmuyor — üç sorgu eksildi.
    */
  ] = await sure.olc("kiraci_urun", Promise.all([
    /*
      KURUM, LİSANS VE AKTİF ÜYE SAYISI TEK GÖRÜNÜMDEN (12.10.2026).

      Üçü ayrı okunuyordu ve ortadaki en pahalısıydı: bütün
      kiracıların BÜTÜN üyelikleri, yalnızca kurum başına "kaç aktif
      üye" sayısı için. O tablo personel giriş çıkışıyla büyüyor;
      satır tavanına çarpıldığı gün kota rozetleri sessizce "limit
      aşılmadı" derdi. platform_kiraci_liste kiracı başına tek satır
      veriyor, sayım yan sorguda.
    */
    /* Kiracı başına tek satır, yine de sayfalı: 1.000 müşteride tavan
       sessizce vurur ve konsolun bütün sayıları o gün eksilirdi. */
    tumSatirlar<Kurum & { license_status: string; monthly_fee: number | null; user_limit: number; storage_limit_mb: number; aktif_uye: number; current_period_end: string | null; trial_ends_at: string | null }>(
      "kiracılar",
      (bas, son) => supabase.from("platform_kiraci_liste")
        .select("id,name,display_name,kind,provisioning_state,contact_phone,license_status,monthly_fee,user_limit,storage_limit_mb,aktif_uye,grup_markasi,current_period_end,trial_ends_at")
        .order("name")
        .range(bas, son))
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((hata: unknown) => ({ data: null, error: { message: hata instanceof Error ? hata.message : String(hata) } })),
    /*
      ÜRÜN LİSANSLARI SAYFA SAYFA. Bu tablo kiracı × ürün büyüyor
      (bugün dört ürün) ve PostgREST yanıtı 1.000 satırda kesip bunu
      SÖYLEMİYOR (lib/rapor-okuma). Tavana çarpıldığı gün konsolun
      aylık geliri, lisans sayıları ve yenileme hatırlatmaları
      sessizce EKSİLİRDİ — hem de kurucunun "bugün neye bakmalı"
      dediği ekranda. Yaklaşık 250 müşteride çarpılıyor.

      `tumSatirlar` sınıra ulaşınca fırlatıyor: eksik bir toplam
      göstermektense ekranı hatayla açmak doğrusu.
    */
    tumSatirlar<UrunLisansi>("ürün lisansları", (bas, son) =>
      supabase.from("organization_product_licenses")
        .select("organization_id,product,status,monthly_fee,current_period_end,trial_ends_at")
        .order("organization_id")
        .range(bas, son))
      /*
        Hata YUTULMUYOR, ÇEVRİLİYOR: `tumSatirlar` sınıra ulaşınca ya
        da sorgu düşünce fırlatıyor; bu sayfa ise okunamayan bölümü
        "okunamadı" diye gösterip gerisini çiziyor. Fırlatmayı olduğu
        gibi bırakmak, tek bir okuma yüzünden kurucunun bütün ana
        sayfasını hata ekranına çevirirdi.
      */
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((hata: unknown) => ({ data: null, error: { message: hata instanceof Error ? hata.message : String(hata) } })),
    /* Bekleyen ödeme bildirimlerinin TAMAMI: kurucunun bugünkü işi.
       sınırsız-tamam: satır satır gösteriliyor ve sayısı küçük (Ödeme
       onayları ekranındaki kuralın aynısı). */
    yedek((o) => liste(o, "bekleyen_odemeler"), () => supabase.from("organization_payment_requests").select("id,organization_id,product,plan_code,amount,currency,payment_method,created_at")
      .eq("status", "pending").order("created_at", { ascending: false })),
  ]));

  /* Sözleşme kuyruğu ve kurulum günlüğü yalnızca sunucu anahtarıyla
     okunuyor (sozlesmeler sayfasındaki kuralın aynısı). Anahtar yoksa
     satır hiç çizilmiyor: "0 sözleşme bekliyor" yazmak, okunamayan bir
     kuyruğu boş göstermek olurdu. */
  const [{ data: sozlesmeSatirlari, error: sozlesmeHatasi }, { error: kurulumHatasi }, { error: proformaHatasi }] = await sozlesmeIstegi;
  /*
    ÖDEME VE KREDİ SORUNLARI da kuyrukta (29.10.2026): PayTR'nin ödeyip
    kaydı oluşmayan bildirimleri ve ödenip ArvoLab'a yüklenemeyen AI
    kredisi. İkisi de yalnızca Sistem sağlığında yazıyordu; ana ekran
    "Her kiracı yolunda" derken müşteri ödediği krediyi kullanamıyordu.
    getPaymentIncidents okunamazsa kendi içinde boş döner (günlüğe yazar);
    kredi okuması düşerse satırı "okunamadı" olarak işaretliyoruz.
  */

  /*
    YANIT BEKLEYEN DESTEK TALEPLERİ (02.11.2026): kurumların açtığı
    talepler konsolun hiçbir yerinde görünmüyordu (lib/destek-kuyrugu).
    Kurucunun oturumuyla; RLS kurucuya bütün kurumların talebini açıyor.
  */
  /*
    TAKİP EDİLECEKLER (02.11.2026): müşteri notlarından takip tarihi
    gelmiş ya da geçmiş, tamamlanmamış olanlar (migration 20261102131114).
    Tablo henüz kurulmadıysa (PGRST205 / 42P01) sekme hiç çizilmiyor:
    migration uygulanmadan ana ekranın en üstünde "okunamadı" uyarısı
    çıkması yanlış alarm olurdu. Başka her hata "okunamadı".
  */
  /*
    BU AYIN YENİ MÜŞTERİSİ (02.11.2026): şeritte, aylık rapora bağlantı.
    Türkiye ayının başından (UTC'de ayın ilk gecesi 00:00–03:00 arası
    önceki aya düşmesin). Arvo'nun kendisi ve grup markaları müşteri değil
    (lib/kurum-turu kuralının sorgu karşılığı). Sayım head sorgusuyla.
  */
  const yeniSayimi = await yeniSayimIstegi;
  if (yeniSayimi.error) console.error("[konsol] bu ayın yeni müşteri sayısı okunamadı", yeniSayimi.error.message);
  /* Bireysel aboneler de: aylık rapor "yeni müşteri"ye ikisini birden sayıyor; şeritte
     yalnızca kurum sayılınca bir tık ötedeki rapor başka sayı yazıyordu. */
  const yeniAboneSayimi = await yeniAboneIstegi;
  if (yeniAboneSayimi.error) console.error("[konsol] bu ayın yeni abone sayısı okunamadı", yeniAboneSayimi.error.message);

  /* sınırsız-tamam: zamanı gelen takipler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const takipSonucu = await takipIstegi;
  const takipKurulu = !(takipSonucu.error && (takipSonucu.error.code === "PGRST205" || takipSonucu.error.code === "42P01"));
  const takipHatasi = takipKurulu ? takipSonucu.error : null;

  /* sınırsız-tamam: yanıt bekleyen talepler — kurucunun temizlediği iş listesi, sayısı küçük. */
  const { data: destekSatirlari, error: destekHatasi } = await destekIstegi;

  /*
    GRAFİĞİN TAHSİLATLARI: üç kanal, PENCEREYLE sınırlı.

    Sınır `.limit()` DEĞİL tarih: son 28 gün (14 gün + kıyas için önceki
    14 gün). Satır sayısıyla sınırlamak, yoğun bir haftada grafiği
    sessizce eksiltirdi — konsolun "Tahsil edildi" rakamı 22.09.2026'da
    tam olarak böyle yanlış çıkmıştı. Zaman penceresi hem sınırlı hem
    eksiksiz: pencerenin içindeki her kayıt geliyor.

    İki kaynak, Finans sayfasındakiyle aynı: onaylı kurum ödeme istekleri
    (havale VE PayTR) ve bireysel abone ödemeleri. billing_subscriptions
    eskiden "kart kanalı" diye üçüncü kaynak olarak ekleniyordu; oysa her
    kurum ödemesinin aktivasyon ikizi — grafik her ödemeyi iki kez
    çiziyordu (14.10.2026, 20261014062145).
  */

  const [arvolab, arc, randevu] = await kopruIstegi;

  /* Görünümün satırı hem kurumu hem lisansı taşıyor; ikisi burada
     ayrılıyor. Lisans alanı boş olan kurum (tetikleyici lisansı
     açmamışsa) kota ve ödeyen hesabına girmiyor — eski davranış da
     böyleydi, çünkü o kurumun lisans SATIRI yoktu. */
  /*
    OKUNAMAYAN SORGU "SIFIR" DEĞİLDİR (15.10.2026).

    Supabase istemcisi hata fırlatmıyor, `error` alanına yazıyor; bu dört
    okumanın hatası alınmıyordu. Kiracı listesi düşerse kurucunun ANA
    EKRANI "Müşteri kurum 0 / 0", "Beklenen aylık ₺0,00" ve "Grup markası
    0" diyor; tahsilat serisi düşerse grafik "Son 14 günde tahsilat yok"
    diyor. Hepsi emin emin yanlış. Kiracı panelinin ana ekranı bu kuralı
    zaten uyguluyordu (app/panel/page.tsx, failedQueries → GenelBakis
    uyarısı); konsolun ana ekranı dışarıda kalmıştı.
  */
  /* Dönem okumaları banner'ı da besliyor: düşen bir ödeme okuması
     "okunamadı" olarak yazılmalı, tabloda sessizce kalmamalı. */
  const [donemKurumOdemeleri, donemAboneOdemeleri, aboneKayitlari] = await performansIstegi;
  const okunamayan = ([
    ["Kiracı listesi", kiraciHatasi],
    ["Ürün lisansları", urunHatasi],
    ["Ödeme bildirimleri", bekleyenOdeme.error],
    ["Sözleşme onayları", sozlesmeHatasi],
    ["Kurum ödemeleri", donemKurumOdemeleri.error],
    ["Bireysel abone ödemeleri", donemAboneOdemeleri.error],
    ["Kurulum günlüğü", kurulumHatasi],
    ["Bekleyen proformalar", proformaHatasi],
    ["Destek talepleri", destekHatasi],
    ["Takip notları", takipHatasi],
  ] as [string, { message: string } | null][])
    .filter((satir): satir is [string, { message: string }] => Boolean(satir[1]));
  if (okunamayan.length)
    console.error("[konsol] ana ekran sorguları okunamadı", okunamayan.map(([ad, h]) => `${ad}: ${h.message}`));

  const kiracilar = (kiraciSatirlari ?? []) as unknown as (Kurum & {
    current_period_end: string | null; trial_ends_at: string | null;
    license_status: string | null; monthly_fee: number | null;
    user_limit: number | null; storage_limit_mb: number | null; aktif_uye: number;
  })[];
  const kurumlar = kiracilar as Kurum[];
  /*
    KİRACI (Arvo'nun kendisi hariç) ile MÜŞTERİ (grup markaları da hariç)
    ayrı: ortak kural lib/kurum-turu'nda. Ana ekranın "Müşteri kurum"
    sayısı 14.10.2026'ya kadar kiracıları sayıyordu ve grup markaları da
    müşteri görünüyordu — aynı soruya Müşteriler ekranı 2, ana ekran 4
    diyordu. Gelir hesabı zaten doğru kuralı kullanıyordu, yalnızca
    başlıktaki sayı ayrışmıştı.
  */
  const kiracilarListesi = kurumlar.filter((kurum) => kurum.kind !== "internal");
  const musteriler = kurumlar.filter(musteriMi);
  const kurumAdi = new Map(kurumlar.map((kurum) => [kurum.id, kurum.display_name || kurum.name]));


  /*
    Beklenen aylık gelir LİSANSLARDAN hesaplanıyor, abonelik kaydından
    değil: o tabloya satır ancak bir ödeme onaylandığında düşüyor, yani
    elle lisans verilmiş kurumlar hiç sayılmıyordu. Denemedekiler dışarıda:
    henüz ödemiyorlar, beklenen gelire katmak raporu şişirir.
  */
  /* Gelire yalnızca gerçek müşteri girer: grup markalarının (AkademikMerkez,
     ArvoCulture) ücreti grup içi değer, müşteri geliri değil (lib/kurum-turu). */
  const urunler = (urunSatirlari ?? []) as UrunLisansi[];

  /*
    ÜRÜN PERFORMANSI (26.11.2026). Sayma işi saf çekirdekte
    (lib/konsol/urun-performansi); burada yalnızca okunanlar veriliyor.
    Okuması düşen kaynak "hata" olarak geçiyor ki tabloda sıfır değil
    "Veri okunamadı" yazsın.
  */
  const okumaOlarak = <T,>(sonuc: { data: T[] | null; error: { message: string } | null }): Okuma<T[]> =>
    sonuc.error || !sonuc.data ? { hata: true } : { veri: sonuc.data };
  /* Tahsilata yalnızca MÜŞTERİ kurumlar girer: iç ekip ve grup markası
     ödemesi gelir değil (platform_tahsilat_ozeti ile aynı küme). */
  const musteriKurumKumesi = new Set(musteriler.map((kurum) => kurum.id));
  const performans = urunPerformansi({
    donem: secilenDonem,
    cekirdek: kiraciHatasi
      ? { hata: true }
      : { veri: kiracilarListesi.map((kurum) => ({ organization_id: kurum.id, license_status: (kurum as { license_status?: string | null }).license_status ?? null })) },
    urunLisanslari: urunHatasi ? { hata: true } : { veri: urunler.map((u) => ({ organization_id: u.organization_id, product: u.product, status: u.status })) },
    aboneler: okumaOlarak(aboneKayitlari),
    aboneOdemeleri: okumaOlarak(donemAboneOdemeleri),
    kurumOdemeleri: okumaOlarak(donemKurumOdemeleri),
    musteriKurumlar: kiraciHatasi ? { hata: true } : { veri: musteriKurumKumesi },
  });


  const hatirlatmalar = hatirlatmalariHesapla(urunler as RenewalLicense[], kurumlar as RenewalOrganization[]);
  const odemeler = (bekleyenOdeme.data ?? []) as BekleyenOdeme[];
  /*
    TUTAR DENETİMİ KUYRUKTA DA ÇALIŞIYOR (lib/beklenen-odeme). Tek
    tıkla onay yalnızca beklenenle UYUŞAN bildirimde var; farkı olan
    satır "İncele" diyerek ekrana götürüyor, çünkü farkı görerek teyit
    etmek orada (payments/karar-formu). Okuma bekleyen kuyruk kadar
    küçük ve kurum kimlikleriyle sınırlı.
  /** Sunucu anahtarı yoksa null: okunamadı, boş değil. */
  const sozlesmeler = admin ? ((sozlesmeSatirlari ?? []) as BekleyenSozlesme[]) : null;

  /*
    Grafiğin dilimleri: tarih listesi + AĞIRLIK olarak tutar. gunlukSeri
    ağırlıksız çağrılsaydı grafik "kaç ödeme" gösterirdi; kurucunun
    sorduğu "ne kadar tahsil edildi".
  */


  /*
    Kopyası konsoldan farklı erişim veren kiracılar. Yalnızca MÜŞTERİ
    kurumları: Arvo'nun kendi kurumu ürünlerin kopyasında bulunmaz ve her
    açılışta listeye düşerdi.

  const kopruler = [
    arvolab?.broken
      ? {
          ad: "ArvoLab köprüsü",
          not: arvolab.permanent
            ? "Anahtar eksik ya da iki tarafta farklı; bireysel abonelikler denetlenemiyor."
            : "ArvoLab, ArvoOS'a ulaşamıyor; kullanıcılar engellenmiyor ama abonelik denetimi durdu.",
        }
      : null,
    !arc.ok ? { ad: "ArvoARC köprüsü", not: arc.error ? `Bağlanılamadı: ${arc.error}` : `Tanımlı olmayan değişkenler: ${arc.missing.join(", ")}` } : null,
    !randevu.ok ? { ad: "ArvoCal köprüsü", not: randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımlı olmayan değişkenler: ${randevu.missing.join(", ")}` } : null,
  ].filter(Boolean) as { ad: string; not: string }[];


  /* Dikkat isteyen kiracılar: kurulumu hatada kalan ya da kotasını aşan.
     BÜTÜN kiracılar üzerinden: bozuk kurulan ya da kotasını aşan bir grup
     markası da kurucunun işidir, müşteri olmaması onu ilgisiz yapmıyor. */

  /*
    SORUNLAR TEK SEKMEDE: kurulum hatası, kota aşımı ve bayat ürün
    kopyası. Bayat kopya eskiden köprü uyarılarının arasında, sayfanın en
    üstünde kırmızı bir PARAGRAFTI ve üç kurumdan sonrası "(ve 2 tane
    daha)" diye kesiliyordu; şimdi her kiracı kendi satırında ve o
    kiracının dosyasına gidiyor. Köprü kopması yerinde kaldı: o tek bir
    kiracının değil bütün ürünün sorunu.
  /* Denetim okunamadıysa (işlevin olmaması dahil) kuyruk bunu söylüyor: sessizce
     boş kalması "eksik migration yok" diye okunuyordu (inceleme bulgusu, 02.11.2026). */

  /*
    Sekmeler. Kuyruk okunamadıysa sekme "okunamadı" der, boş değil:
    sıfır bir cevaptır, okunamayan sorgu cevap değildir (yukarıdaki
    `okunamayan` da aynı adı en üstte yazıyor).
  /* Müşteriye ULAŞMAYAN önce (02.11.2026, lib/proforma-gonderim): bu kuyruk
     "gönderilmiş, ödemesi gelmemiş" diyordu ama gönderime hiç bakmıyordu;
     29.10–02.11 arasında kesilenler müşteriye gitmediği hâlde öyle görünüyordu. */
  /*
    YENİLEME RİSKİ (02.11.2026): ArvoOS lisansı açık, yenilemesi 30 gün
    içinde ve son 7 günde panele kimse girmemiş müşteriler
    (lib/musteri-etkinligi). Müşteriler listesinin "Dikkat" sekmesindeki
    kuralın aynısı; ana ekranda da çünkü "kimi arayayım" sorusu bugünün işi.
    Grup markaları ve Arvo'nun kendisi dışarıda: ödemeyi yenileyecek
    bir müşteri değiller.
  /*
    KURULUP KULLANILMAYANLAR (02.11.2026, lib/musteri-etkinligi
    kullanilmayanMi): denemesi boşa giden ya da ödediği hâlde panele hiç
    girilmemiş müşteriler. Yeni müşteriyi ilk haftalarda kaybetmenin en
    sık yolu bu; yenileme riskinde olanlar orada, burada tekrar edilmiyor.
  const destekTalepleri = kuyrukSirala((destekSatirlari ?? []) as { id: string; subject: string; priority: string; status: string; last_message_at: string; organization_id: string }[]);

  /* Hangi kiracının kurulumu HÂLÂ hatada: rozetin tonu buna bakıyor. */
  const hatadaKalanlar = new Set(kurumlar.filter((k) => k.provisioning_state === "failed").map((k) => k.id));

  /*
    Sayılar TEK ŞERİTTE (29.10.2026). Eskiden grafiğin başlığına
    sıkıştırılmıştı ve telefonda grafiğin altına kayıyordu; "kaç iş
    bekliyor" sorusu da grafiğin değil kuyruğun sorusu.
  */

  /*
    ÖNCELİKLİ İŞLER (26.11.2026, onaylı mockup). Kuyruğun ZATEN okuduğu
    kalemlerden türüyor — yeni sorgu yok, yetki aynı. Her satır işin
    yapıldığı ekrana açılıyor: ödeme bildirimi onay ekranına, yenileme
    müşteri kaydına, talep kendi kaydına. Onay düğmeleri kuyrukta kaldı,
    bu kart onların yerine geçmiyor.

    Sıra aciliyete göre: para bekleyen iş önce. Liste kısa tutuluyor,
    tamamı "Bugünün işleri" kartında.
  */
  const ONCELIKLI_TAVAN = 6;
  /* Köprü sağlığı uyarı satırını besliyor: hangi ürünün köprüsü sessiz. */
  const kopruler = [
    arvolab?.broken
      ? {
          ad: "ArvoLab köprüsü",
          not: arvolab.permanent
            ? "Anahtar eksik ya da iki tarafta farklı; bireysel abonelikler denetlenemiyor."
            : "ArvoLab, ArvoOS'a ulaşamıyor; kullanıcılar engellenmiyor ama abonelik denetimi durdu.",
        }
      : null,
    !arc.ok ? { ad: "ArvoARC köprüsü", not: arc.error ? `Bağlanılamadı: ${arc.error}` : `Tanımlı olmayan değişkenler: ${arc.missing.join(", ")}` } : null,
    !randevu.ok ? { ad: "ArvoCal köprüsü", not: randevu.error ? `Bağlanılamadı: ${randevu.error}` : `Tanımlı olmayan değişkenler: ${randevu.missing.join(", ")}` } : null,
  ].filter(Boolean) as { ad: string; not: string }[];

  /* Öncelikli işler listesinin destek ayağı. */
  const destekTalepleri = kuyrukSirala((destekSatirlari ?? []) as { id: string; subject: string; priority: string; status: string; last_message_at: string; organization_id: string }[]);

  /*
    KARAR BEKLEYENLER (26.11.2026, onaylı mockup). Kuyruğun kendisi,
    sırası ve yetkisi DEĞİŞMEDİ; satıra kaydın ZAMANI eklendi ("Bugün,
    09:15") ve eylem adı kayda göre yazılıyor. Yenilemede zaman yok:
    orada kayıt anı değil, kalan gün anlamlı.
  */
  const kararlar: KararKalemi[] = [
    ...odemeler.map((o) => ({
      anahtar: `odeme-${o.id}`,
      urun: o.product ? productName(o.product) : undefined,
      baslik: "Ödeme bildirimi",
      alt: [kurumAdi.get(o.organization_id) ?? "Kurum", para(Number(o.amount ?? 0), o.currency ?? "TRY")].join(" · "),
      zaman: o.created_at,
      href: "/panel/platform/payments",
    })),
    ...(sozlesmeler ?? []).map((i) => ({
      anahtar: `sozlesme-${i.id}`,
      baslik: "Sözleşme onayı",
      alt: [i.customer_name || "Müşteri", i.contract_no].filter(Boolean).join(" · "),
      zaman: i.created_at,
      href: "/panel/platform/sozlesmeler",
    })),
    ...hatirlatmalar.map((h) => ({
      anahtar: `yenileme-${h.organizationId}-${h.product}`,
      urun: h.productName,
      baslik: h.daysLeft < 0 ? "Dönemi doldu" : "Yaklaşan yenileme",
      alt: [h.organizationName, h.daysLeft < 0 ? `${-h.daysLeft} gün geçti` : `${h.daysLeft} gün kaldı`].join(" · "),
      href: `/panel/platform/musteriler/${h.organizationId}`,
    })),
    ...destekTalepleri.map((t) => ({
      anahtar: `destek-${t.id}`,
      baslik: "Yanıt bekleyen talep",
      alt: [kurumAdi.get(t.organization_id) ?? "Kurum", t.subject].filter(Boolean).join(" · "),
      zaman: t.last_message_at,
      href: `/panel/platform/destek/${t.id}`,
      eylem: "Görüntüle",
    })),
  ].slice(0, ONCELIKLI_TAVAN);
  /*
    OTOMASYONLAR (26.11.2026). Sekiz zamanlanmış işin kaydı üç satıra
    iniyor (lib/konsol/otomasyonlar); köprü durumu yalnızca
    "Veri senkronizasyonu" satırını etkiliyor.
  */
  const [cronSatirlari, cronBaslangici, denemeKuyrugu] = await cronIstegi;
  const cronDurumu = cronDurumlari(cronSatirlari, new Date(), cronBaslangici);
  const kopruDurumlari: KopruDurumu[] = [
    { yapilandirilmamis: Boolean(arvolab?.broken && arvolab.permanent), kopuk: Boolean(arvolab?.broken) },
    { yapilandirilmamis: !arc.ok && arc.missing.length > 0, kopuk: !arc.ok },
    { yapilandirilmamis: !randevu.ok && randevu.missing.length > 0, kopuk: !randevu.ok },
  ];
  const otomasyonSatirlari = otomasyonlar(cronDurumu, kopruDurumlari,
    denemeKuyrugu === null ? [] : [{ grup: "tahsilat", bekleyen: denemeKuyrugu }]);
  const sonKontrol = sonOtomatikKontrol(cronDurumu);

  /*
    ÜRÜNÜN DURUM SÜTUNU köprü yoklamasından. ArvoOS'un köprüsü yok —
    konsolun kendisi; onu "Bağlı değil" göstermek yanlış olurdu.
  */
  const urunSagligi = (kod: string): UrunSagligi => {
    if (kod === "arvoos") return { durum: "saglikli", etiket: "Sağlıklı", ton: "success" };
    const kopru = kod === "arvolab"
      ? { kopuk: Boolean(arvolab?.broken), eksik: Boolean(arvolab?.permanent), not: arvolab?.broken ? "ArvoOS'a ulaşamıyor" : undefined }
      : kod === "arc"
      ? { kopuk: !arc.ok, eksik: arc.missing.length > 0, not: arc.error ?? undefined }
      : { kopuk: !randevu.ok, eksik: randevu.missing.length > 0, not: randevu.error ?? undefined };
    if (kopru.kopuk && kopru.eksik) return { durum: "bagli_degil", etiket: "Bağlı değil", ton: "neutral", not: "Köprü anahtarı tanımlı değil." };
    if (kopru.kopuk) return { durum: "sorunlu", etiket: "Sorunlu", ton: "danger", not: kopru.not ?? "Köprü yanıt vermiyor." };
    return { durum: "saglikli", etiket: "Sağlıklı", ton: "success" };
  };

  /* Okunamayan kuyruk "iş yok" diye gösterilmez: hangi kalemin sayısının
     bilinmediği yazılır. */
  const kararOkunamayan = [
    bekleyenOdeme.error ? "Ödeme bildirimleri" : null,
    sozlesmeHatasi ? "Sözleşme onayları" : null,
    urunHatasi ? "Yenilemeler" : null,
    destekHatasi ? "Destek talepleri" : null,
  ].filter((x): x is string => Boolean(x));


  sure.bitir();
  /*
    BUGÜNÜN İŞLERİ artık görünüm panelinin içeriği (25.11.2026). Kuyruğun
    kendisi, sekmeleri ve tek tıkla onay satırı DEĞİŞMEDİ: aynı
    TalepAkis, aynı sunucu işlemi, aynı yetki davranışı. Değişen tek şey
    nerede durduğu — sayfa boyunca yığılmak yerine kendi kartında.
  */

  /*
    NABIZ: tahsilat, sistem sağlığı ve son hareketler.

    Üçü de ZATEN OKUNAN veriden kuruluyor; tek yeni sorgu yok. Abonelik
    kademelerine ait bir blok BİLEREK yok: ArvoOS'ta kademe kavramı
    henüz yok (product_plans ürün başına tek ücret), ve olmayan veriyi
    örnekle doldurmak kurucuya satılmayan bir şeyi satılıyormuş gibi
    gösterirdi. Kademe verisi geldiği gün buraya kendi paneli eklenir.
  */
  const saglikSatirlari: ReactNode[] = [];
  /* Köprüler: hangi ürün yanıt vermiyor ve neden. Eskiden sayfanın
     başında her köprü için bir uyarı bloğu vardı; üçü birden düşerse
     şeridi ve kuyruğu ekranın dışına itiyordu. Sayı başta, gerekçe
     burada. */
  if (kopruler.length) {
    for (const kopru of kopruler) {
      saglikSatirlari.push(
        <li key={`kopru-${kopru.ad}`}>
          <span className="status-pill" data-tone="danger">yanıt yok</span>
          <span><b>{kopru.ad}</b><small>{kopru.not}</small></span>
        </li>,
      );
    }
  }
  if (hatadaKalanlar.size) {
    saglikSatirlari.push(
      <li key="kurulum-hata">
        <span className="status-pill" data-tone="danger">{hatadaKalanlar.size}</span>
        <span>
          <b>Kurulumda hatada kalan kurum</b>
          <small><Link href="/panel/platform/kurulumlar">Kurulumlar</Link> ekranından sürdürülebilir.</small>
        </span>
      </li>,
    );
  }
  /* Okunamayan kaynak bir SORUN DEĞİL, bir bilinmezlik: "yolunda" demek
     onu sessizce yeşile boyardı. */
  if (okunamayan.length) {
    saglikSatirlari.push(
      <li key="okunamayan">
        <span className="status-pill" data-tone="neutral">{okunamayan.length}</span>
        <span>
          <b>Okunamayan veri kaynağı</b>
          <small>{okunamayan.map(([ad2]) => ad2).join(", ")} — bu alanlar ölçülemedi.</small>
        </span>
      </li>,
    );
  }


  /*
    TEK EKRAN (25.11.2026). sinif="dash-sabit": sayfa hiçbir boyutta
    kaymaz, uzun içerik yalnızca kendi kartında kayar
    (dashboard.css · .dash-sabit, os/gorunum-secici.tsx). Kiracı
    genel bakışlarının 10.11.2026'da geçtiği sözleşme bu; konsol onu
    hiç benimsememişti ve beş bloğu dikey diziyordu.

    Dock, navigasyon hedefleri ve rozetler değişmedi: düzen kabuğun
    İÇİNDE kuruluyor, kabuğa dokunulmuyor.
  */
  /*
    ANA SAYFA = BAŞLIK + DURUM + ÜÇ KART (26.11.2026, onaylı mockup).

    Ekranın adı "Genel Bakış" değil ANA SAYFA: kurucunun günü buradan
    başlıyor ve ekran üç soruya sırayla cevap veriyor —
      1. hangi iş benim kararımı bekliyor (Karar bekleyenler),
      2. sistem arka planda neyi bitirdi (Otomasyonlar),
      3. ürünler ve tahsilat nasıl (Ürün performansı).

    Başlığın altındaki satır "her şey yolunda mı"yı tek bakışta
    söylüyor: son BAŞARILI otomatik kontrolün saati ve dikkat isteyen
    bağlantı sayısı. Kayıt yoksa uydurulmuyor, "Otomatik kontrol kaydı
    yok" yazıyor.

    İşlem, onay ve yetki akışlarının hiçbiri değişmedi — bu ekran
    yalnızca neyi GÖSTERDİĞİNİ değiştirdi, ne yaptığını değil.
  */
  const dikkatSayisi = kopruler.length;
  return (
    <GenelBakis
      baslik="Ana Sayfa"
      sinif="dash-sabit konsol-ana"
      eylem={<DonemSecici secili={secilenDonem.kod} taban="/panel" ek={`olcut=${secilenOlcut}`} />}
      durum={
        <p className="kak-durum">
          <span>
            <i aria-hidden="true" data-tone={sonKontrol ? "success" : undefined} />
            {sonKontrol
              ? `Son otomatik kontrol ${istanbulDateTime(sonKontrol.toISOString(), { hour: "2-digit", minute: "2-digit" })}`
              : "Otomatik kontrol kaydı yok"}
          </span>
          {dikkatSayisi ? (
            <span>
              <i aria-hidden="true" data-tone="warning" />
              <Link href="/panel/platform/saglik?sekme=kopru">
                {dikkatSayisi === 1 ? "1 bağlantı dikkat gerektiriyor" : `${dikkatSayisi} bağlantı dikkat gerektiriyor`}
              </Link>
            </span>
          ) : null}
          {okunamayan.length ? (
            <span>
              <i aria-hidden="true" data-tone="danger" />
              <Link href="/panel/platform/saglik">{okunamayan.length} veri kaynağı okunamadı</Link>
            </span>
          ) : null}
        </p>
      }
    >
      <div className="kak-ust">
        <KararBekleyenlerKarti kalemler={kararlar} okunamayan={kararOkunamayan} />
        <OtomasyonlarKarti isler={otomasyonSatirlari} href="/panel/platform/saglik?sekme=isler" />
      </div>

      <UrunPerformansiKarti
        satirlar={performans.map((p) => ({ ...p, saglik: urunSagligi(p.kod) }))}
        donem={secilenDonem} olcut={secilenOlcut} para={para} sayi={sayi}
        olcutSecici={<OlcutSecici secili={secilenOlcut} taban="/panel" ek={`donem=${secilenDonem.kod}`} />}
      />
    </GenelBakis>
  );
}
