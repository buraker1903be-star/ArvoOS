import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { KKart, KNot } from "../konsol-ui";
import { basHarfleri, ODEME_DURUMU, PAKET_ADI, para, tarih, tarihSaat } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
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

export default async function PaymentApprovalsPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const incidents = await getPaymentIncidents();

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
  const [{ data: bekleyenler, error }, { data: gecmis, error: gecmisHatasi }, { data: onayliTutarlar, error: tutarHatasi }] = await Promise.all([
    supabase.from("organization_payment_requests").select(SECIM).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("organization_payment_requests").select(SECIM).neq("status", "pending").order("created_at", { ascending: false }).limit(30),
    supabase.from("organization_payment_requests").select("amount,currency,status"),
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
  const incelenecekler = await Promise.all((bekleyenler ?? []).map(async (payment) => {
    // Kartla (PayTR) ödemede dekont yoktur.
    // hata-tamam: dekont dosyasının imzalı bağlantısı; düşerse bağlantı çıkmaz, karar ekranı yerinde kalır
    const { data: signed } = payment.receipt_path
      ? await supabase.storage.from("payment-receipts").createSignedUrl(payment.receipt_path, 900)
      : { data: null };
    return { ...payment, receiptUrl: signed?.signedUrl ?? null };
  }));

  const sonuclananlar = (gecmis ?? []) as typeof incelenecekler;
  /* Beklenen tutar ve paket farkı (14.10.2026): onay işlemiyle aynı hesap. */
  const denetimler = await havaleDenetimleri(supabase, incelenecekler as unknown as HavaleBildirimi[]);
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

  const kisi = (ad: string, alt: string, href: string | null) => {
    const ic = <>
      <span className="ek-avatar" aria-hidden="true">{basHarfleri(ad)}</span>
      <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span><span className="crm-table-sub">{alt}</span></span>
    </>;
    return href ? <Link className="crm-row-link ek-kisi" href={href}>{ic}</Link> : <span className="ek-kisi">{ic}</span>;
  };
  /* tuzak-tamam: ürün dağılımı bilerek yalnızca gösterilen son 30 karardan; kartın kapsamı da "son 30 karar" diyor. */
  const urunDagilimi = enCok(sonuclananlar.map((payment) => productName(payment.product ?? "arvoos")), 5);

  /*
    PANELİN DİLİ (29.10.2026, konsol yeniden kurulurken). Karşılıksız
    bildirimler ve sonuçlananlar iOS satırıydı; tutar, tarih ve not tek
    satırın altına sıkışıyordu. Artık hizalı tablo. Bekleyen dekontlar
    KART kalıyor: karar formu bir tablo satırına sığmıyor ve dekontu
    incelerken bütün bilgiler bir arada durmalı.
  */
  return <main className="plt talep cari ekip finans-sayfa">
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

    <div className="talep-izgara personel-iki ekip-izgara">
      <div className="fn-kartlar">
        {incidents.length ? (
          <section className="panel-card talep-bilgi" id="karsiliksiz" aria-label="İşlenemeyen ödeme bildirimleri">
            <header className="phr-bas fn-alt-bas">
              <h2>{incidents.length} ödeme bildirimi işlenemedi <span className="status-pill" data-tone="danger">Müdahale bekliyor</span></h2>
              <small>PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; her birini PayTR panelinden doğrulayın.</small>
            </header>
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="fn-karsiliksiz">
                <thead><tr><th>Kurum</th><th>Sebep</th><th className="crm-col-date">Tarih</th><th className="crm-col-amount">Tutar</th></tr></thead>
                <tbody>
                  {incidents.map((incident) => {
                    const href = incident.organizationId ? `/panel/platform/musteriler/${incident.organizationId}` : null;
                    const ad = incident.organizationName ?? "Kurum bilinmiyor";
                    const sebep = incidentLabels[incident.result] ?? incident.result;
                    return (
                      <tr key={incident.id}>
                        <td data-label="Kurum">{kisi(ad, incident.merchantOid, href)}</td>
                        <td data-label="Sebep"><span className="status-pill" data-tone="danger">{sebep}</span><small title={incidentNotes[incident.result]}>{incidentNotes[incident.result]}</small></td>
                        <td className="crm-col-date" data-label="Tarih">{tarihSaat(incident.createdAt)}</td>
                        <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{incident.paymentAmount !== null ? para(incident.paymentAmount) : "—"}</span></td>
                        <MobilSatir href={href} baslik={ad} durum={{ etiket: sebep, ton: "danger" }}
                          alt={[incident.paymentAmount !== null ? para(incident.paymentAmount) : null, tarihSaat(incident.createdAt), incident.merchantOid]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          </section>
        ) : null}

        {/*
          Bekleyenler kart, sonuçlananlar tablo. Eskiden yüz bildirimin
          hepsi tam kart olarak çiziliyordu; bugün yapılacak işi bulmak
          için doksan altı sonuçlanmış kartı geçmek gerekiyordu.
        */}
        <div id="bekleyen" className="fn-kartlar">
          {incelenecekler.length ? incelenecekler.map((payment) => {
            const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
            const account = Array.isArray(payment.platform_bank_accounts) ? payment.platform_bank_accounts[0] : payment.platform_bank_accounts;
            const kurumAdi = organization?.name ?? "Kurum";
            const tutar = para(Number(payment.amount), payment.currency);
            const beklenen = denetimler.get(payment.id)?.beklenen;
            const farklar = denetimler.get(payment.id)?.farklar ?? [];
            const alanlar: [string, string | null, boolean?][] = [
              ["Ürün", productName(payment.product ?? "arvoos")],
              ["Paket", PAKET_ADI[payment.plan_code] ?? payment.plan_code],
              ["Beklenen", beklenen ? para(beklenen, payment.currency) : "ücret girilmemiş"],
              ["Ödeme yolu", payment.payment_method === "paytr" ? "Kartla (PayTR)" : "Havale / EFT"],
              ["Banka", account?.bank_name ?? null],
              ["Referans", payment.reference_no ?? null, true],
              ["Bildirim", tarihSaat(payment.created_at)],
            ];
            return (
              <KKart
                key={payment.id} id={`odeme-${payment.id}`}
                baslik={`${kurumAdi} · ${tutar}`}
                aciklama={`${organization?.slug ?? "kurum"} · tutarın hesaba geçtiğini doğrulayın; onay lisansı açar ve dönemi uzatır.`}
                sag={<>
                  <span className="status-pill" data-tone={ODEME_DURUMU.pending.ton}>{ODEME_DURUMU.pending.ad}</span>
                  {/* Dekontu incelerken kiracının tamamına bakmak gerekebilir. */}
                  <Link className="pu-tumu" href={`/panel/platform/musteriler/${payment.organization_id}`}>Müşteri kartı</Link>
                </>}
              >
                <dl className="talep-liste talep-liste--iki">
                  {alanlar.map(([etiket, deger, mono]) => (
                    <div key={etiket}>
                      <dt>{etiket}</dt>
                      <dd className={deger && mono ? "plt-mono" : undefined}>{deger ? deger : <em>Belirtilmedi</em>}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Dekont</dt>
                    <dd>{payment.payment_method === "paytr"
                      ? "Kartla (PayTR) ödendi; otomatik onaylandı"
                      : payment.receiptUrl
                      ? <a className="plt-receipt" href={payment.receiptUrl} target="_blank" rel="noreferrer">Dekontu görüntüle ↗</a>
                      : <em>Eklenmemiş: müşteri bildirimi dekontsuz gönderdi</em>}</dd>
                  </div>
                </dl>
                {payment.customer_note ? <div className="talep-not"><p className="plt-quote">“{payment.customer_note}”</p></div> : null}
                {farklar.length ? (
                  <KNot ton="tehlike"><b>Beklenenle uyuşmuyor.</b>{farklar.map((f) => <span key={f}><br />{f}</span>)}</KNot>
                ) : null}
                <div className="talep-not">
                  <KararFormu paymentId={payment.id} kurumAdi={kurumAdi} tutar={tutar} farklar={farklar} kaydet={reviewBankTransferPayment} />
                </div>
              </KKart>
            );
          }) : (
            /* Başlık bölümün adı, boşluğun ilanı değil (15.10.2026). */
            <section className="panel-card talep-bilgi" aria-label="Bekleyen dekontlar">
              <header className="phr-bas fn-alt-bas"><h2>Bekleyen dekontlar</h2></header>
              <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>İncelenecek dekont yok</h2><p>Kurumlar panelden havale bildirdiğinde burada görünür.</p></div>
            </section>
          )}
        </div>

        {sonuclananlar.length ? (
          <section className="panel-card talep-bilgi" id="gecmis" aria-label="Sonuçlanan bildirimler">
            <header className="phr-bas fn-alt-bas">
              <h2>Sonuçlanan bildirimler <span className="pu-sayi">{sonuclananlar.length}</span></h2>
              <small>Son 30 karar. Dekontun kendisine müşteri kartından ulaşılır.</small>
            </header>
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="fn-gecmis">
                <thead><tr><th>Kurum</th><th>Ürün</th><th className="crm-col-date">Karar</th><th className="crm-col-amount">Tutar</th><th>Durum</th></tr></thead>
                <tbody>
                  {sonuclananlar.map((payment) => {
                    const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
                    const { ad: etiket, ton } = ODEME_DURUMU[payment.status] ?? { ad: payment.status, ton: "neutral" as const };
                    const href = `/panel/platform/musteriler/${payment.organization_id}`;
                    const yol = payment.payment_method === "paytr" ? "Kartla" : "Havale";
                    const ad = organization?.name ?? "Kurum";
                    return (
                      <tr key={payment.id} className={payment.status === "approved" ? undefined : "is-pasif"}>
                        <td data-label="Kurum">{kisi(ad, yol, href)}</td>
                        <td data-label="Ürün"><span className="crm-table-title">{productName(payment.product ?? "arvoos")}</span>{payment.review_note ? <small title={payment.review_note}>{payment.review_note}</small> : null}</td>
                        <td className="crm-col-date" data-label="Karar">{tarih(payment.reviewed_at ?? payment.created_at)}</td>
                        <td className="crm-col-amount" data-label="Tutar"><span className="crm-table-title">{para(Number(payment.amount), payment.currency)}</span></td>
                        <td data-label="Durum"><span className="status-pill" data-tone={ton}>{etiket}</span></td>
                        <MobilSatir href={href} baslik={ad} durum={{ etiket, ton }}
                          alt={[productName(payment.product ?? "arvoos"), para(Number(payment.amount), payment.currency), tarih(payment.reviewed_at ?? payment.created_at), payment.review_note]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          </section>
        ) : null}
      </div>

      {/* Sağ sütun: Ekip ve Müşteriler listesindeki sekmeli istatistik kartı. */}
      <div className="liste-sag">
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
      </div>
    </div>
  </main>;
}
