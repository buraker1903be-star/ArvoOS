import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { KBaslik, KBos, KDurum, KKart, KNot, KSatirSonu, KTablo } from "../konsol-ui";
import { PAKET_ADI, para, tarihSaat } from "../bicim";
import { reviewBankTransferPayment } from "./actions";
import { KararFormu } from "./karar-formu";
import { havaleDenetimleri, type HavaleBildirimi } from "@/lib/beklenen-odeme";
// plt-quote, plt-receipt, plt-mono, kiraci-baglanti hâlâ buradan.
import "../platform.css";

const statusLabels: Record<string, string> = { pending: "İnceleme bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };
const statusTones: Record<string, string> = { pending: "warning", approved: "success", rejected: "danger" };

/*
  14.10.2026: konsol panelin diliyle (konsol-ui.tsx). Eskiden ayarlar
  ekranının kartları (StgSection: renkli simge kutusu, büyük harfli üst
  başlık) ve konsolun kendi tablosu (.plt-table) kullanılıyordu.

  Sayfa .liste-sayfa DEĞİL: o düzen yüksekliği ekrana sabitleyip yalnızca
  tablonun kaydığını varsayıyor; burada asıl içerik karar formlu kartlar
  ve onlar tablonun içine sığmıyor. Izgara aynı (sol içerik, sağda
  istatistik kartı), sayfa kendi boyunda kayıyor.
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
  const [{ data: bekleyenler, error }, { data: gecmis }, { data: onayliTutarlar }] = await Promise.all([
    supabase.from("organization_payment_requests").select(SECIM).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("organization_payment_requests").select(SECIM).neq("status", "pending").order("created_at", { ascending: false }).limit(30),
    supabase.from("organization_payment_requests").select("amount,currency,status"),
  ]);
  if (error) throw new Error(`Ödeme bildirimleri okunamadı: ${error.message}`);

  /*
    İmzalı dekont bağlantısı yalnızca BEKLEYENLER için üretiliyor. Eskiden
    yüz kaydın hepsi için üretiliyordu: sayfa her açılışında yüz depolama
    çağrısı, üstelik çoğu hiç tıklanmayan geçmiş kayıtlar için. Geçmişteki
    bir dekonta bakmak gerekirse kiracı dosyasından ulaşılıyor.
  */
  const incelenecekler = await Promise.all((bekleyenler ?? []).map(async (payment) => {
    // Kartla (PayTR) ödemede dekont yoktur.
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

  return <main className="plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · FATURALAMA VE TAHSİLAT</small>
        <h1>Ödeme Onayları</h1>
        <p>Havale/EFT dekontlarını inceleyin; onaylanan ödemede lisans ve abonelik otomatik etkinleşir.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/billing">Abonelikler</Link>
      </div>
    </header>

    {/*
      13.10.2026: dört StgWidget kutusu yerine panelin özet şeridi.
      Konsol kendi tasarım dilini kullanıyordu (stg-widgets); aynı
      kurucunun gün içinde gidip geldiği panel ekranları şerit
      kullanıyor ve iki dil arasında geçiş, sayıları her seferinde
      yeniden aramak demekti.

      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "karşılıksız
      bildirim yok" demek, satırın hiç olmamasından daha çok şey söyler.
      Sayılar bölümlere bağlanıyor; şerit bakılıp geçilen bir kutu
      değil, işin başladığı yer.
    */}
    <nav className="kayit-serit talep-serit" aria-label="Ödeme özeti">
      <dl>
        <div>
          <dt>İnceleme bekliyor</dt>
          <dd className={incelenecekler.length ? "talep-uyari" : undefined}>
            <a href="#bekleyen">{incelenecekler.length}</a>
          </dd>
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
          <dd className={incidents.length ? "talep-uyari" : undefined}>
            {incidents.length ? <a href="#karsiliksiz">{incidents.length}</a> : 0}
          </dd>
          <small>{incidents.length ? "PayTR ödedi, kayıt oluşmadı" : "İşlenemeyen bildirim yok"}</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      {/* Sol sütunun kartları alt alta; .talep yalnızca aralarındaki boşluğu veriyor. */}
      <div className="talep" style={{ minWidth: 0 }}>
        {incidents.length ? (
          <KKart
            id="karsiliksiz"
            baslik={`${incidents.length} ödeme bildirimi işlenemedi`}
            aciklama="PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; her birini PayTR panelinden doğrulayın."
            sag={<span className="status-pill" data-tone="danger">Müdahale bekliyor</span>}
          >
            <KTablo kolonlar={[{ ad: "Kurum" }, { ad: "Sebep" }, { ad: "Tutar", sinif: "crm-col-amount" }, { ad: "PayTR no" }, { ad: "Tarih", sinif: "crm-col-date" }, { ad: "" }]}>
              {incidents.map((incident) => {
                const href = incident.organizationId ? `/panel/platform?organization=${incident.organizationId}` : null;
                const sebep = incidentLabels[incident.result] ?? incident.result;
                return (
                  <tr key={incident.id}>
                    <KBaslik etiket="Kurum" href={href} baslik={incident.organizationName ?? "—"} alt={incidentNotes[incident.result] ?? undefined} />
                    <KDurum baslik="Sebep" etiket={sebep} ton="danger" />
                    <td data-label="Tutar" className="crm-col-amount">{incident.paymentAmount !== null ? para(incident.paymentAmount) : "—"}</td>
                    <td data-label="PayTR no" className="plt-mono">{incident.merchantOid}</td>
                    <td data-label="Tarih" className="crm-col-date">{tarihSaat(incident.createdAt)}</td>
                    <KSatirSonu mobil={{
                      href,
                      baslik: incident.organizationName ?? "Kurum bilinmiyor",
                      durum: { etiket: sebep, ton: "danger" },
                      alt: [incident.paymentAmount !== null ? para(incident.paymentAmount) : null, tarihSaat(incident.createdAt)],
                      isaretler: [{ metin: incident.merchantOid, ton: "sessiz" }],
                    }} />
                  </tr>
                );
              })}
            </KTablo>
          </KKart>
        ) : null}

        {/* Farklı para birimleri toplanamaz; toplamı doğru sanmaktansa
            güvenilmez olduğunu söylüyoruz. */}
        {birimKarisik ? (
          <KNot ton="uyari">Kayıtlarda birden çok para birimi var; toplamlar {currency} varsayımıyla yazıldı ve güvenilir değil.</KNot>
        ) : null}

        {/*
          Bekleyenler kart, sonuçlananlar kısa liste. Eskiden yüz bildirimin
          hepsi tam kart olarak çiziliyordu; bugün yapılacak işi (dört bekleyen
          dekont) bulmak için doksan altı sonuçlanmış kartı geçmek gerekiyordu.

          Her bekleyen ödeme kendi panel kartı: karar formu tablo satırına
          sığmıyor, dekontu incelerken de bütün bilgiler bir arada olmalı.
        */}
        <div id="bekleyen">
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
                  <span className="status-pill" data-tone="warning">{statusLabels.pending}</span>
                  {/* Dekontu incelerken kiracının tamamına bakmak gerekebilir:
                      lisansı ne durumda, kaç kullanıcısı var. */}
                  <Link className="kiraci-baglanti" href={`/panel/platform?organization=${payment.organization_id}`}>Kiracı →</Link>
                </>}
              >
                <dl className="talep-liste talep-liste--iki">
                  {alanlar.map(([etiket, deger, mono]) => (
                    <div key={etiket}>
                      <dt>{etiket}</dt>
                      <dd className={deger && mono ? "plt-mono" : undefined}>{deger ? deger : <em>Belirtilmedi</em>}</dd>
                    </div>
                  ))}
                  {/* Dekont incelemenin asıl belgesi; ayrı bir düğme yerine
                      bilgi listesinin son satırı. */}
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
                  <KararFormu paymentId={payment.id} kurumAdi={kurumAdi} tutar={tutar} farklar={denetimler.get(payment.id)?.farklar ?? []} kaydet={reviewBankTransferPayment} />
                </div>
              </KKart>
            );
          }) : (
            <KKart baslik="Bekleyen dekont yok">
              <KBos baslik="İncelenecek dekont yok" aciklama="Kurumlar panelden havale bildirdiğinde burada görünür." />
            </KKart>
          )}
        </div>

        {sonuclananlar.length ? (
          <KKart
            id="gecmis" baslik="Sonuçlanan bildirimler"
            aciklama="Son 30 karar. Dekontun kendisine kiracı dosyasından ulaşılır."
            sag={<span className="status-pill">{sonuclananlar.length} kayıt</span>}
          >
            <KTablo kolonlar={[{ ad: "Kurum" }, { ad: "Durum" }, { ad: "Karar", sinif: "crm-col-date" }, { ad: "Tutar", sinif: "crm-col-amount" }, { ad: "Not" }, { ad: "" }]}>
              {sonuclananlar.map((payment) => {
                const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
                const tone = statusTones[payment.status] ?? "neutral";
                const etiket = statusLabels[payment.status] ?? payment.status;
                const href = `/panel/platform?organization=${payment.organization_id}`;
                const yol = payment.payment_method === "paytr" ? "Kartla" : "Havale";
                const tutar = para(Number(payment.amount), payment.currency);
                const kararTarihi = tarihSaat(payment.reviewed_at ?? payment.created_at);
                return (
                  <tr key={payment.id}>
                    <KBaslik etiket="Kurum" href={href} baslik={organization?.name ?? "Kurum"} alt={`${productName(payment.product ?? "arvoos")} · ${yol}`} />
                    <KDurum etiket={etiket} ton={tone} />
                    <td data-label="Karar" className="crm-col-date">{kararTarihi}</td>
                    <td data-label="Tutar" className="crm-col-amount">{tutar}</td>
                    <td data-label="Not" className="k-sessiz">{payment.review_note ?? "—"}</td>
                    <KSatirSonu mobil={{
                      href,
                      baslik: organization?.name ?? "Kurum",
                      durum: { etiket, ton: tone },
                      alt: [tutar, yol, kararTarihi],
                      isaretler: [payment.review_note ? { metin: payment.review_note, ton: "sessiz" } : null],
                    }} />
                  </tr>
                );
              })}
            </KTablo>
          </KKart>
        ) : null}
      </div>

      <IstatistikKarti
        kapsam="tutarlar ve sayılar bütün bildirimlerden; ödeme yolu son 30 karardan"
        kutular={[
          { ad: "İnceleme bekliyor", deger: String(incelenecekler.length), alt: incelenecekler.length ? para(pendingTotal, currency) : "dekont yok", ton: incelenecekler.length ? "uyari" : undefined },
          { ad: "Onaylanan", deger: para(approvedTotal, currency), alt: `${onaylilar.length} bildirim`, ton: "arti" },
          { ad: "Reddedilen", deger: String(rejected), alt: "tüm zamanlar" },
          { ad: "Karşılıksız", deger: String(incidents.length), alt: incidents.length ? "PayTR ödedi, kayıt yok" : "yok", ton: incidents.length ? "uyari" : undefined },
        ]}
        gruplar={[
          {
            baslik: "Bildirim durumu",
            satirlar: [
              { ad: "Onaylandı", adet: onaylilar.length },
              { ad: "Reddedildi", adet: rejected },
              { ad: "İnceleme bekliyor", adet: incelenecekler.length },
            ],
          },
          {
            baslik: "Ödeme yolu (son 30 karar)",
            satirlar: [
              { ad: "Havale / EFT", adet: sonuclananlar.length - gecmisKartla },
              { ad: "Kartla (PayTR)", adet: gecmisKartla },
            ],
          },
        ]}
      />
    </div>
  </main>;
}
