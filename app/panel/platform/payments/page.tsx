import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { ODEME_DURUMU, PAKET_ADI, para, tarihSaat } from "../bicim";
import { reviewBankTransferPayment } from "./actions";
import { KararFormu } from "./karar-formu";
import { havaleDenetimleri, type HavaleBildirimi } from "@/lib/beklenen-odeme";
// plt-quote, plt-receipt, plt-mono, kiraci-baglanti hâlâ buradan.
import "../platform.css";

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

  return <main className="plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · ÖDEME ONAYLARI</small>
        <h1>Ödeme Onayları</h1>
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
            {/* iOS listesi (14.10.2026): sebep ve tutar sağda, açıklama,
                PayTR numarası ve tarih tek satırlık özette. */}
            <KListe>
              {incidents.map((incident) => {
                const href = incident.organizationId ? `/panel/platform/musteriler/${incident.organizationId}` : null;
                const sebep = incidentLabels[incident.result] ?? incident.result;
                return (
                  <KOge
                    key={incident.id}
                    href={href}
                    simge={incident.organizationName ?? "Kurum bilinmiyor"}
                    baslik={incident.organizationName ?? "Kurum bilinmiyor"}
                    alt={[incidentNotes[incident.result], incident.merchantOid, tarihSaat(incident.createdAt)].filter(Boolean).join(" · ")}
                    durum={{ etiket: sebep, ton: "danger" }}
                    deger={incident.paymentAmount !== null ? para(incident.paymentAmount) : "—"}
                  />
                );
              })}
            </KListe>
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
                  <span className="status-pill" data-tone={ODEME_DURUMU.pending.ton}>{ODEME_DURUMU.pending.ad}</span>
                  {/* Dekontu incelerken kiracının tamamına bakmak gerekebilir:
                      lisansı ne durumda, kaç kullanıcısı var. */}
                  <Link className="kiraci-baglanti" href={`/panel/platform/musteriler/${payment.organization_id}`}>Müşteri →</Link>
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
            /*
              KART BAŞLIĞI BÖLÜMÜN ADI, BOŞLUĞUN İLANI DEĞİL (15.10.2026).
              Başlık "Bekleyen dekont yok" diyor, hemen içindeki kutu da
              "İncelenecek dekont yok" — aynı cümle üst üste iki kez
              yazılıyordu. Boşluğu kutu söyler; kartın işi nereye
              baktığını söylemek.
            */
            <KKart baslik="Bekleyen dekontlar">
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
            {/* iOS listesi (14.10.2026): ürün, ödeme yolu, karar tarihi ve
                not özette; sağda durum ve tutar. */}
            <KListe>
              {sonuclananlar.map((payment) => {
                const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
                const { ad: etiket, ton: tone } = ODEME_DURUMU[payment.status] ?? { ad: payment.status, ton: "neutral" as const };
                const href = `/panel/platform/musteriler/${payment.organization_id}`;
                const yol = payment.payment_method === "paytr" ? "Kartla" : "Havale";
                const tutar = para(Number(payment.amount), payment.currency);
                const kararTarihi = tarihSaat(payment.reviewed_at ?? payment.created_at);
                return (
                  <KOge
                    key={payment.id}
                    href={href}
                    simge={organization?.name ?? "Kurum"}
                    baslik={organization?.name ?? "Kurum"}
                    alt={[productName(payment.product ?? "arvoos"), yol, kararTarihi, payment.review_note].filter(Boolean).join(" · ")}
                    durum={{ etiket, ton: tone }}
                    deger={tutar}
                  />
                );
              })}
            </KListe>
          </KKart>
        ) : null}
      </div>

      {/*
        Sağ sütun (14.10.2026, iOS listesi): dört kutu ve "Bildirim durumu"
        şeritteki sayıların aynısıydı; kalan yalnızca başka yerde olmayan
        ödeme yolu dağılımı.
      */}
      <div className="liste-sag">
        <KKart baslik="Ödeme yolu" aciklama="Son 30 karar">
          <KListe>
            <KOge baslik="Havale / EFT" deger={String(sonuclananlar.length - gecmisKartla)} />
            <KOge baslik="Kartla (PayTR)" deger={String(gecmisKartla)} />
          </KListe>
        </KKart>
      </div>
    </div>
  </main>;
}
