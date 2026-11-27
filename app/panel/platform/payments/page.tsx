import { konsolAlaniniAc } from "../konsol-alani";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { sayfaliSonuc } from "@/lib/rapor-okuma";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { KNot } from "../konsol-ui";
import { basHarfleri, ODEME_DURUMU, PAKET_ADI, para, tarih, tarihSaat } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
import { KonsolPanelAlanlar, KonsolPanelBas, KonsolPanelBos } from "../konsol-liste";
import { kaydirmaAnahtari, listeAdresi } from "@/lib/konsol/liste-secimi";
import { KonsolListeKaydirma } from "../konsol-liste-kaydirma";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import { enCok } from "@/lib/liste-istatistik";
import { reviewBankTransferPayment } from "./actions";
import { KararFormu } from "./karar-formu";
import { havaleDenetimleri, type HavaleBildirimi } from "@/lib/beklenen-odeme";
// plt-quote, plt-receipt, plt-mono, kiraci-baglanti hâlâ buradan.
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

/* Durum etiketleri ORTAK (bicim.ts ODEME_DURUMU): burada ayrı bir harita
   vardı ve kısıtın izin verdiği dördüncü değeri ('canceled') tanımıyordu,
   müşteri detayındaki ikizi tanıyordu. Aynı kavramın iki kopyası, biri
   eksik. */

/*
  14.10.2026: konsol panelin diliyle (konsol-ui.tsx). Eskiden ayarlar
  ekranının kartları (StgSection: renkli simge kutusu, büyük harfli üst
  başlık) ve konsolun kendi tablosu (.plt-table) kullanılıyordu.

  Sayfa .liste-sayfa DEĞİL: o düzen yüksekliği ekrana sabitleyip yalnızca
  tablonun kaydığını varsayıyor; burada asıl içerik karar formlu kartlar
  ve onlar tablonun içine sığmıyor. Izgara aynı (sol içerik, sağda
  küçük dağılım kartı), sayfa kendi boyunda kayıyor.
*/

export default async function PaymentApprovalsPage({ searchParams }: {
  searchParams: Promise<{ secili?: string; suzgec?: string }>;
}) {
  const { secili: seciliParam, suzgec: suzgecParam } = await searchParams;
  const seciliAnahtar = seciliParam?.trim() || null;
  const suzgec = ["bekleyen", "karsiliksiz", "sonuclanan"].includes(suzgecParam ?? "") ? suzgecParam! : null;
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "finans");

  /* PayTR olayları asıl sorgularla AYNI ANDA (02.11.2026): eskiden önce o
     bekleniyor, sonra bildirimler okunuyordu — bağımsız iki tur. */
  const olayIstegi = getPaymentIncidents();

  /*
    Üç ayrı sorgu, üç ayrı iş:

      - bekleyenler: hepsi, sınırsız. Kurucunun bugün yapacağı iş bu.
      - geçmiş: son 30 karar. Yüz karttan oluşan bir sayfa okunmuyordu.
      - toplam: BÜTÜN onaylı bildirimlerin tutarı.

    Eskiden tek sorgu vardı ve .limit(100) ile sınırlıydı; "Onaylanan ₺X"
    o yüzden son 100 kaydın toplamıydı ve 101. bildirimden sonra rakam
    sessizce eksilmeye başlayacaktı. Liste kısa kalıyor, toplam kısalmıyor.
  */
  const SECIM = "id,organization_id,plan_code,product,amount,currency,status,payment_method,receipt_path,reference_no,customer_note,review_note,created_at,reviewed_at,organizations(name,slug),platform_bank_accounts(bank_name,iban)";
  const [{ data: bekleyenler, error }, { data: gecmis, error: gecmisHatasi }, { data: onayliTutarlar, error: tutarHatasi }, incidents] = await Promise.all([
    supabase.from("organization_payment_requests").select(SECIM).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("organization_payment_requests").select(SECIM).neq("status", "pending").order("created_at", { ascending: false }).limit(30),
    /*
      SAYFALI (02.11.2026). Toplam BÜTÜN bildirimlerden; eskiden tek sorguydu
      ve PostgREST 1.000 satırda kesip söylemiyor: bin birinci bildirimden
      sonra "Onaylanan ₺X" sessizce eksilecekti (lib/rapor-okuma).
    */
    sayfaliSonuc<{ amount: number; currency: string; status: string }>("onaylı tutarlar", (bas, son) =>
      supabase.from("organization_payment_requests").select("amount,currency,status").order("id").range(bas, son)),
    olayIstegi,
  ]);
  if (error) throw new Error(`Ödeme bildirimleri okunamadı: ${error.message}`);
  /* Geçmiş ve onaylı tutarlar da para: düşerlerse ekran "hiç ödeme
     yok" der ve kurucu aynı ödemeyi ikinci kez isteyebilir. */
  if (gecmisHatasi) throw new Error(`Ödeme geçmişi okunamadı: ${gecmisHatasi.message}`);
  if (tutarHatasi) throw new Error(`Onaylı tutarlar okunamadı: ${tutarHatasi.message}`);

  /*
    İmzalı dekont bağlantısı yalnızca BEKLEYENLER için üretiliyor. Eskiden
    yüz kaydın hepsi için üretiliyordu: sayfa her açılışında yüz depolama
    çağrısı, üstelik çoğu hiç tıklanmayan geçmiş kayıtlar için. Geçmişteki
    bir dekonta bakmak gerekirse kiracı dosyasından ulaşılıyor.
  */
  /*
    TEK İSTEK (02.11.2026): bekleyen her dekont için ayrı imza çağrısı
    yapılıyordu (on bekleyen = on depolama isteği); createSignedUrls hepsini
    tek istekte imzalıyor. Havale denetimi de onunla aynı anda — ikisi de
    yalnızca bekleyenlere bakıyor, birbirine değil.
  */
  const bekleyenListesi = bekleyenler ?? [];
  const dekontYollari = bekleyenListesi.flatMap((p) => (p.receipt_path ? [p.receipt_path as string] : []));
  const [imzaSonucu, denetimler] = await Promise.all([
    // hata-tamam: dekont bağlantıları; düşerse bağlantı çıkmaz, karar ekranı yerinde kalır
    dekontYollari.length
      ? supabase.storage.from("payment-receipts").createSignedUrls(dekontYollari, 900)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[], error: null }),
    /* Beklenen tutar ve paket farkı (14.10.2026): onay işlemiyle aynı hesap. */
    havaleDenetimleri(supabase, bekleyenListesi as unknown as HavaleBildirimi[]),
  ]);
  if (imzaSonucu.error) console.error("[ödeme onayları] dekont bağlantıları imzalanamadı", imzaSonucu.error.message);
  const imzali = new Map((imzaSonucu.data ?? []).flatMap((x) => (x.path && x.signedUrl ? [[x.path, x.signedUrl] as const] : [])));
  // Kartla (PayTR) ödemede dekont yoktur.
  const incelenecekler = bekleyenListesi.map((payment) => ({ ...payment, receiptUrl: payment.receipt_path ? imzali.get(payment.receipt_path) ?? null : null }));

  const sonuclananlar = (gecmis ?? []) as typeof incelenecekler;
  const tumBildirimler = (onayliTutarlar ?? []) as { amount: number; currency: string; status: string }[];

  const pendingTotal = incelenecekler.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const onaylilar = tumBildirimler.filter((satir) => satir.status === "approved");
  const approvedTotal = onaylilar.reduce((sum, satir) => sum + Number(satir.amount), 0);
  const rejected = tumBildirimler.filter((satir) => satir.status === "rejected").length;

  /*
    Para birimi karışırsa toplam anlamsız olur: 100 ₺ ile 100 $ toplanıp
    tek simgeyle yazılırdı. Eskiden para() birimsiz çağrılıyor, yani her
    kayıt TRY varsayılıyordu.
  */
  const birimler = new Set(tumBildirimler.map((satir) => satir.currency || "TRY"));
  const currency = birimler.size === 1 ? [...birimler][0] : "TRY";
  const birimKarisik = birimler.size > 1;

  // tuzak-tamam: ödeme yolu dağılımı bilerek yalnızca gösterilen son 30 karardan; kart başlığı da "son 30 karar" diyor.
  const gecmisKartla = sonuclananlar.filter((payment) => payment.payment_method === "paytr").length;

  /* tuzak-tamam: ürün dağılımı bilerek yalnızca gösterilen son 30 karardan; kartın kapsamı da "son 30 karar" diyor. */
  const urunDagilimi = enCok(sonuclananlar.map((payment) => productName(payment.product ?? "arvoos")), 5);

  /*
    PANELİN DİLİ (29.10.2026, konsol yeniden kurulurken). Karşılıksız
    bildirimler ve sonuçlananlar iOS satırıydı; tutar, tarih ve not tek
    satırın altına sıkışıyordu. Artık hizalı tablo. Bekleyen dekontlar
    KART kalıyor: karar formu bir tablo satırına sığmıyor ve dekontu
    incelerken bütün bilgiler bir arada durmalı.
  */
  /*
    TEK LİSTE, ÜÇ KAYNAK (27.11.2026). Bekleyen bildirimler, PayTR'nin
    işlenemeyen olayları ve sonuçlanan kararlar aynı listede; ayrımı
    durum rozeti ve süzgeç yapıyor. Eskiden üç ayrı bölümdü ve
    bugün yapılacak işi bulmak için ikisini geçmek gerekiyordu.

    Anahtarlar ön ekli: olay ve bildirim id'leri çakışabilir.
  */
  const kurumAdiniAl = (p: (typeof incelenecekler)[number]) => {
    const o = Array.isArray(p.organizations) ? p.organizations[0] : p.organizations;
    return o?.name ?? "Kurum";
  };
  const bildirimKalemi = (payment: (typeof incelenecekler)[number], bekleyen: boolean) => {
    const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
    const account = Array.isArray(payment.platform_bank_accounts) ? payment.platform_bank_accounts[0] : payment.platform_bank_accounts;
    const ad = kurumAdiniAl(payment);
    const tutar = para(Number(payment.amount), payment.currency);
    const beklenen = denetimler.get(payment.id)?.beklenen;
    const farklar = denetimler.get(payment.id)?.farklar ?? [];
    const d = bekleyen ? ODEME_DURUMU.pending : (ODEME_DURUMU[payment.status] ?? { ad: payment.status, ton: "neutral" as const });
    return {
      anahtar: `odeme:${payment.id}`,
      ad,
      alt: [organization?.slug ?? null, payment.payment_method === "paytr" ? "Kartla (PayTR)" : "Havale / EFT"].filter(Boolean).join(" · "),
      tutar,
      durum: d.ad,
      ton: d.ton,
      kurumId: payment.organization_id as string | null,
      farklar,
      not: payment.customer_note as string | null,
      /* ONAYDAN ÖNCE GÖRÜNEN ALANLAR. Tutar ve para birimi birlikte:
         kayıtlarda birden çok birim olabiliyor. */
      alanlar: [
        { ad: "Tutar", deger: tutar },
        { ad: "Referans", deger: payment.reference_no ? <span className="plt-mono">{payment.reference_no}</span> : <em>Belirtilmedi</em> },
        { ad: "Ürün", deger: productName(payment.product ?? "arvoos") },
        { ad: "Paket", deger: PAKET_ADI[payment.plan_code] ?? payment.plan_code },
        { ad: "Beklenen", deger: beklenen ? para(beklenen, payment.currency) : <em>ücret girilmemiş</em> },
        { ad: "Ödeme yolu", deger: payment.payment_method === "paytr" ? "Kartla (PayTR)" : "Havale / EFT" },
        ...(account?.bank_name ? [{ ad: "Banka", deger: account.bank_name }] : []),
        { ad: "Bildirim", deger: tarihSaat(payment.created_at) },
        ...(bekleyen ? [] : [{ ad: "Karar", deger: tarih(payment.reviewed_at ?? payment.created_at) }]),
        ...(!bekleyen && payment.review_note ? [{ ad: "Karar notu", deger: payment.review_note }] : []),
      ],
      dekont: (
        <p className="ek-alt">
          <b>Dekont:</b>{" "}
          {payment.payment_method === "paytr"
            ? "Kartla (PayTR) ödendi; otomatik onaylandı"
            : payment.receiptUrl
            ? <a className="plt-receipt" href={payment.receiptUrl} target="_blank" rel="noreferrer">Dekontu görüntüle ↗</a>
            : <em>Eklenmemiş: müşteri bildirimi dekontsuz gönderdi</em>}
        </p>
      ),
      /* KARAR FORMU DEĞİŞMEDİ: aynı bileşen, aynı sunucu işlemi,
         aynı yetki. Yalnızca bulunduğu yer değişti. */
      karar: bekleyen ? (
        <div className="talep-not">
          <KararFormu paymentId={payment.id} kurumAdi={ad} tutar={tutar} farklar={farklar} kaydet={reviewBankTransferPayment} />
        </div>
      ) : null,
    };
  };
  const olayKalemi = (incident: (typeof incidents)[number]) => ({
    anahtar: `olay:${incident.id}`,
    ad: incident.organizationName ?? "Kurum bilinmiyor",
    alt: incident.merchantOid,
    tutar: incident.paymentAmount !== null ? para(incident.paymentAmount) : "—",
    durum: incidentLabels[incident.result] ?? incident.result,
    ton: "danger" as const,
    kurumId: incident.organizationId ?? null,
    farklar: [] as string[],
    not: null as string | null,
    alanlar: [
      { ad: "Tutar", deger: incident.paymentAmount !== null ? para(incident.paymentAmount) : <em>bilinmiyor</em> },
      { ad: "Referans", deger: <span className="plt-mono">{incident.merchantOid}</span> },
      { ad: "Sebep", deger: incidentNotes[incident.result] ?? incidentLabels[incident.result] ?? incident.result },
      { ad: "Olay", deger: tarihSaat(incident.createdAt) },
    ],
    dekont: <KNot ton="tehlike">PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; PayTR panelinden doğrulayın.</KNot>,
    karar: null as React.ReactNode,
  });

  const bekleyenKalemler = incelenecekler.map((x) => bildirimKalemi(x, true));
  const olayKalemler = incidents.map(olayKalemi);
  const sonucKalemler = sonuclananlar.map((x) => bildirimKalemi(x, false));
  /* Sıra ekranın sırası: bugün yapılacak iş önce. */
  const tumKayitlar = [...bekleyenKalemler, ...olayKalemler, ...sonucKalemler];
  const listelenen = suzgec === "bekleyen" ? bekleyenKalemler
    : suzgec === "karsiliksiz" ? olayKalemler
    : suzgec === "sonuclanan" ? sonucKalemler
    : tumKayitlar;
  const secili = seciliAnahtar ? tumKayitlar.find((k) => k.anahtar === seciliAnahtar) ?? null : null;
  const seciliListede = Boolean(secili && listelenen.some((k) => k.anahtar === secili.anahtar));
  const odemeAdresi = (yeni: { secili?: string | null; suzgec?: string | null }) =>
    listeAdresi("/panel/platform/payments",
      { secili: seciliAnahtar, suzgec },
      yeni);

  return <main className="plt talep cari ekip finans-sayfa liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">FİNANS</small>
        <h1>Ödeme onayları</h1>
        <p className="ek-alt">Kurumların havale bildirimleri ve PayTR&apos;nin işlenemeyen ödemeleri; onay lisansı açar ve dönemi uzatır.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/tahsilat">Tahsilatlar</Link>
      </div>
    </header>

    {/* Dördü de her zaman çiziliyor: "karşılıksız bildirim yok" demek,
        satırın hiç olmamasından daha çok şey söyler. */}
    <nav className="kayit-serit talep-serit" aria-label="Ödeme özeti">
      <dl>
        <div>
          <dt>İnceleme bekliyor</dt>
          <dd className={incelenecekler.length ? "talep-uyari" : undefined}><a href="#bekleyen">{incelenecekler.length}</a></dd>
          <small>{incelenecekler.length ? `${para(pendingTotal, currency)} tutarında` : "Bekleyen dekont yok"}</small>
        </div>
        <div>
          <dt>Onaylanan</dt>
          <dd className="cari-arti">{para(approvedTotal, currency)}</dd>
          <small>{onaylilar.length} bildirim · tüm zamanlar</small>
        </div>
        <div>
          <dt>Reddedilen</dt>
          <dd>{rejected}</dd>
          <small>{rejected ? "Müşteriye not yazıldı" : "Reddedilen bildirim yok"}</small>
        </div>
        <div>
          <dt>Karşılıksız</dt>
          <dd className={incidents.length ? "talep-uyari" : undefined}>{incidents.length ? <a href="#karsiliksiz">{incidents.length}</a> : 0}</dd>
          <small>{incidents.length ? "PayTR ödedi, kayıt oluşmadı" : "İşlenemeyen bildirim yok"}</small>
        </div>
      </dl>
    </nav>

    {/* Farklı para birimleri toplanamaz; toplamı doğru sanmaktansa
        güvenilmez olduğunu söylüyoruz. */}
    {birimKarisik ? (
      <KNot ton="uyari">Kayıtlarda birden çok para birimi var; toplamlar {currency} varsayımıyla yazıldı ve güvenilir değil.</KNot>
    ) : null}

    {/*
      LİSTE – SEÇİLİ ÖDEME (27.11.2026, onaylı tasarım). Müşteriler'le
      aynı iskelet (konsol-liste.css): ortada bildirim listesi, sağda
      seçili bildirimin paneli.

      Eskiden bekleyen her bildirim TAM KART olarak alt alta
      çiziliyordu; yüz bildirimin içinden bugün yapılacak işi bulmak
      için doksan altı sonuçlanmış kartı geçmek gerekiyordu. Artık
      hepsi tek listede, karar formu seçili kaydın panelinde.

      ONAY ÖNCESİ GÖRÜNEN BİLGİ panelde ve karar formunun ÜSTÜNDE:
      müşteri, tutar, para birimi ve referans. Karar formu, sunucu
      işlemi ve yetki DEĞİŞMEDİ (KararFormu · reviewBankTransferPayment).
    */}
    <div className="kl-duzen" data-secim={secili ? "var" : "yok"}>
      <section className="kl-liste" aria-label="Ödeme bildirimleri">
        <div className="ek-arac">
          <nav className="ek-segment" aria-label="Durum">
            <Link href={odemeAdresi({ suzgec: null })} className={!suzgec ? "is-active" : undefined}>Tümü <small>{tumKayitlar.length}</small></Link>
            <Link href={odemeAdresi({ suzgec: "bekleyen" })} className={suzgec === "bekleyen" ? "is-active" : undefined}>Bekleyen <small>{incelenecekler.length}</small></Link>
            <Link href={odemeAdresi({ suzgec: "karsiliksiz" })} className={suzgec === "karsiliksiz" ? "is-active" : undefined}>Karşılıksız <small>{incidents.length}</small></Link>
            <Link href={odemeAdresi({ suzgec: "sonuclanan" })} className={suzgec === "sonuclanan" ? "is-active" : undefined}>Sonuçlanan <small>{sonuclananlar.length}</small></Link>
          </nav>
        </div>
        <KonsolListeKaydirma anahtar={kaydirmaAnahtari("/panel/platform/payments", { suzgec: suzgecParam })} adres={odemeAdresi({})} />
        <div className="kl-liste-govde">
          {listelenen.length ? (
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="fn-odeme">
                <thead><tr><th>Kurum</th><th className="crm-col-amount">Tutar</th><th>Durum</th><th></th></tr></thead>
                <tbody>
                  {listelenen.map((k) => (
                    <tr key={k.anahtar} className={[k.ton === "neutral" ? "is-pasif" : null, k.anahtar === seciliAnahtar ? "is-secili" : null].filter(Boolean).join(" ") || undefined}>
                      <td data-label="Kurum">
                        <Link className="crm-row-link ek-kisi" href={odemeAdresi({ secili: k.anahtar })}
                          aria-current={k.anahtar === seciliAnahtar ? "true" : undefined} aria-label={`${k.ad} bildirimini seç`}>
                          <span className="ek-avatar" aria-hidden="true">{basHarfleri(k.ad)}</span>
                          <span className="ek-kisi-metin">
                            <span className="crm-table-title" title={k.ad}>{k.ad}</span>
                            <span className="crm-table-sub">{k.alt}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{k.tutar}</span></td>
                      <td data-label="Durum"><span className="status-pill" data-tone={k.ton}>{k.durum}</span></td>
                      <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                      <MobilSatir href={odemeAdresi({ secili: k.anahtar })} baslik={k.ad} durum={{ etiket: k.durum, ton: k.ton }} alt={[k.alt, k.tutar]} />
                    </tr>
                  ))}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : (
            <div className="crm-empty-state talep-bos-kutu ek-bos">
              <h2>{suzgec ? "Bu süzgeçte bildirim yok" : "Ödeme bildirimi yok"}</h2>
              <p>Kurumlar panelden havale bildirdiğinde burada görünür.</p>
              {suzgec ? <div className="crm-empty-actions"><Link className="panel-secondary" href={odemeAdresi({ suzgec: null })}>Süzgeci temizle</Link></div> : null}
            </div>
          )}
        </div>
      </section>

      <aside className="kl-panel" aria-label={secili ? `${secili.ad} bildirimi` : "Ödeme istatistikleri"}>
        {secili ? (
          <>
            <Link className="kl-geri" href={odemeAdresi({ secili: null })}><span aria-hidden="true">‹</span> Listeye dön</Link>
            {!seciliListede ? (
              <p className="kl-suzgec-disi">
                Bu bildirim geçerli süzgeçte görünmüyor.{" "}
                <Link href={odemeAdresi({ suzgec: null })}>Süzgeci temizle →</Link>
              </p>
            ) : null}
            <KonsolPanelBas baslik={secili.ad} durum={{ etiket: secili.durum, ton: secili.ton }}
              kapatAdresi={odemeAdresi({ secili: null })} />
            {/*
              ONAYDAN ÖNCE GÖRÜNEN BİLGİ. Tutar ve para birimi
              birlikte yazılıyor: kayıtlarda birden çok para birimi
              olabiliyor ve "28.900" tek başına hangi birim olduğunu
              söylemiyor.
            */}
            <KonsolPanelAlanlar alanlar={secili.alanlar} />
            {secili.dekont}
            {secili.not ? <div className="talep-not"><p className="plt-quote">&ldquo;{secili.not}&rdquo;</p></div> : null}
            {secili.farklar.length ? (
              <KNot ton="tehlike"><b>Beklenenle uyuşmuyor.</b>{secili.farklar.map((f) => <span key={f}><br />{f}</span>)}</KNot>
            ) : null}
            {secili.karar}
            <div className="kl-panel-eylem">
              {secili.kurumId ? <Link className="panel-secondary" href={`/panel/platform/musteriler/${secili.kurumId}`}>Müşteri kartı</Link> : null}
            </div>
          </>
        ) : seciliAnahtar ? (
          <>
            <Link className="kl-geri" href={odemeAdresi({ secili: null })}><span aria-hidden="true">‹</span> Listeye dön</Link>
            <KonsolPanelBos ton="uyari" baslik="Bildirim bulunamadı"
              aciklama="Bu bildirim listede yok: karar verilmiş ve geçmişten düşmüş olabilir. Listeden başka bir kayıt seçin."
              eylem={<Link className="panel-secondary" href={odemeAdresi({ secili: null })}>Listeye dön</Link>} />
          </>
        ) : (
          <TalepAkis kimlik="odeme-sag" sinif="ek-sag" etiket="Ödeme istatistikleri" sekmeler={["İstatistikler"]}>
            <IstatistikKarti
              kapsam="son 30 karar"
              kutular={[
                { ad: "Havale / EFT", deger: String(sonuclananlar.length - gecmisKartla), alt: "son 30 karar" },
                { ad: "Kartla (PayTR)", deger: String(gecmisKartla), alt: "son 30 karar" },
                { ad: "Onaylanan", deger: String(onaylilar.length), alt: "tüm zamanlar" },
                { ad: "Reddedilen", deger: String(rejected), alt: "tüm zamanlar", ton: rejected ? "uyari" : undefined },
              ]}
              gruplar={[{ baslik: "Ürüne göre", satirlar: urunDagilimi.map(([ad, adet]) => ({ ad, adet })) }]}
            />
          </TalepAkis>
        )}
      </aside>
    </div>
  </main>;
}
