import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { productName } from "@/lib/products";
import { getPaymentIncidents, incidentLabels, incidentNotes } from "@/lib/payment-incidents";
import { StgIcon, StgSection, StgValueRow, StgWidget, type StgTone } from "../../settings/settings-ui";
import { PAKET_ADI, para, tarihSaat } from "../bicim";
import { reviewBankTransferPayment } from "./actions";
import { KararFormu } from "./karar-formu";
import "../../settings/settings.css";
import "../platform.css";

const statusLabels: Record<string, string> = { pending: "İnceleme bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };
const statusTones: Record<string, StgTone> = { pending: "warning", approved: "success", rejected: "danger" };

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

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · FİNANS</small><h1>Ödeme Onayları</h1><p>Havale/EFT dekontlarını inceleyin; onaylanan ödemede lisans ve abonelik otomatik etkinleşir.</p></div>
    </div>

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "karşılıksız
      bildirim yok" demek, satırın hiç olmamasından daha çok şey söyler.
    */}
    <div className="stg-widgets" aria-label="Ödeme özeti">
      <StgWidget tone={incelenecekler.length ? "warning" : "neutral"} icon="wallet" label="İnceleme bekliyor" value={incelenecekler.length} note={incelenecekler.length ? `${para(pendingTotal, currency)} tutarında` : "Bekleyen dekont yok"} />
      <StgWidget tone="success" icon="check" label="Onaylanan" value={para(approvedTotal, currency)} note={`${onaylilar.length} bildirim · tüm zamanlar`} />
      <StgWidget tone={rejected ? "info" : "neutral"} icon="doc" label="Reddedilen" value={rejected} note={rejected ? "Müşteriye not yazıldı" : "Reddedilen bildirim yok"} />
      <StgWidget tone={incidents.length ? "danger" : "neutral"} icon="shield" label="Karşılıksız" value={incidents.length} note={incidents.length ? "PayTR ödedi, kayıt oluşmadı" : "İşlenemeyen bildirim yok"} />
    </div>

    {incidents.length ? (
      <StgSection
        id="karsiliksiz" wide icon="shield" tone="danger"
        kicker="MÜDAHALE BEKLİYOR" title={`${incidents.length} ödeme bildirimi işlenemedi`}
        description="PayTR ödeme bildirdi ama kayıt oluşmadı: lisans açılmadı ya da tahsilat cariye yazılmadı. Para tahsil edilmiş olabilir; her birini PayTR panelinden doğrulayın."
      >
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Kurum</th><th>Sebep</th><th>Tutar</th><th>PayTR no</th><th>Tarih</th></tr></thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>{incident.organizationName ?? "—"}</td>
                  <td>
                    <span className="status-pill" data-tone="danger">{incidentLabels[incident.result] ?? incident.result}</span>
                    <small className="plt-substatus">{incidentNotes[incident.result] ?? ""}</small>
                  </td>
                  <td>{incident.paymentAmount !== null ? para(incident.paymentAmount) : "—"}</td>
                  <td className="plt-mono">{incident.merchantOid}</td>
                  <td>{tarihSaat(incident.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StgSection>
    ) : null}

    {/* Farklı para birimleri toplanamaz; toplamı doğru sanmaktansa
        güvenilmez olduğunu söylüyoruz. */}
    {birimKarisik ? (
      <p className="stg-muted"><StgIcon name="shield" size={16} />Kayıtlarda birden çok para birimi var; toplamlar {currency} varsayımıyla yazıldı ve güvenilir değil.</p>
    ) : null}

    {/*
      Bekleyenler kart, sonuçlananlar kısa liste. Eskiden yüz bildirimin
      hepsi tam kart olarak çiziliyordu; bugün yapılacak işi (dört bekleyen
      dekont) bulmak için doksan altı sonuçlanmış kartı geçmek gerekiyordu.
    */}
    <StgSection
      id="bekleyen" wide icon="wallet" tone={incelenecekler.length ? "warning" : "success"}
      kicker="İNCELEME BEKLİYOR" title={incelenecekler.length ? `${incelenecekler.length} dekont inceleme bekliyor` : "Bekleyen dekont yok"}
      description="Tutarın hesaba geçtiğini doğrulayın; onay lisansı açar ve dönemi uzatır."
      aside={incelenecekler.length ? <span className="status-pill" data-tone="warning">{para(pendingTotal, currency)}</span> : null}
    >
      {incelenecekler.length ? (
        <div className="stg-grid">
          {incelenecekler.map((payment) => {
            const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
            const account = Array.isArray(payment.platform_bank_accounts) ? payment.platform_bank_accounts[0] : payment.platform_bank_accounts;
            const kurumAdi = organization?.name ?? "Kurum";
            const tutar = para(Number(payment.amount), payment.currency);
            return (
              <StgSection
                key={payment.id} id={`odeme-${payment.id}`} icon="wallet" tone="warning"
                kicker={organization?.slug ?? "KURUM"} title={`${kurumAdi} · ${tutar}`}
                aside={
                  <span className="plt-row-uc">
                    <span className="status-pill" data-tone="warning">{statusLabels.pending}</span>
                    {/* Dekontu incelerken kiracının tamamına bakmak gerekebilir:
                        lisansı ne durumda, kaç kullanıcısı var. */}
                    <Link className="kiraci-baglanti" href={`/panel/platform?organization=${payment.organization_id}`}>Kiracı →</Link>
                  </span>
                }
              >
                <dl className="stg-list">
                  <StgValueRow label="Ürün" value={productName(payment.product ?? "arvoos")} />
                  <StgValueRow label="Paket" value={PAKET_ADI[payment.plan_code] ?? payment.plan_code} />
                  <StgValueRow label="Ödeme yolu" value={payment.payment_method === "paytr" ? "Kartla (PayTR)" : "Havale / EFT"} />
                  <StgValueRow label="Banka" value={account?.bank_name ?? null} />
                  <StgValueRow label="Referans" value={payment.reference_no ?? null} mono />
                  <StgValueRow label="Bildirim" value={tarihSaat(payment.created_at)} />
                </dl>
                {payment.customer_note ? <p className="plt-quote">“{payment.customer_note}”</p> : null}
                {payment.payment_method === "paytr"
                  ? <p className="stg-muted"><StgIcon name="check" size={16} />PayTR ile kartla ödendi; otomatik onaylandı.</p>
                  : payment.receiptUrl
                  ? <a className="panel-secondary plt-receipt" href={payment.receiptUrl} target="_blank" rel="noreferrer"><StgIcon name="doc" size={16} />Dekontu görüntüle</a>
                  : <p className="stg-muted"><StgIcon name="lock" size={16} />Dekont eklenmemiş: müşteri bildirimi dekontsuz gönderdi.</p>}
                <KararFormu paymentId={payment.id} kurumAdi={kurumAdi} tutar={tutar} kaydet={reviewBankTransferPayment} />
              </StgSection>
            );
          })}
        </div>
      ) : (
        <div className="stg-empty"><StgIcon name="check" size={22} /><p>İncelenecek dekont yok. Kurumlar panelden havale bildirdiğinde burada görünür.</p></div>
      )}
    </StgSection>

    {sonuclananlar.length ? (
      <StgSection
        id="gecmis" wide icon="folder" tone="neutral" kicker="GEÇMİŞ" title="Sonuçlanan bildirimler"
        description="Son 30 karar. Dekontun kendisine kiracı dosyasından ulaşılır."
        aside={<span className="status-pill">{sonuclananlar.length} kayıt</span>}
      >
        <div className="stg-list">
          {sonuclananlar.map((payment) => {
            const organization = Array.isArray(payment.organizations) ? payment.organizations[0] : payment.organizations;
            const tone = statusTones[payment.status] ?? "neutral";
            return (
              <div key={payment.id} className="plt-row">
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone={tone}><StgIcon name={payment.status === "approved" ? "check" : "lock"} size={16} /></span>
                  <span>
                    <b>{organization?.name ?? "Kurum"} · {para(Number(payment.amount), payment.currency)}</b>
                    <small>
                      {productName(payment.product ?? "arvoos")} · {payment.payment_method === "paytr" ? "Kartla" : "Havale"} · {tarihSaat(payment.reviewed_at ?? payment.created_at)}
                      {payment.review_note ? ` · ${payment.review_note}` : ""}
                    </small>
                  </span>
                </span>
                <span className="plt-row-uc">
                  <span className="status-pill" data-tone={tone}>{statusLabels[payment.status] ?? payment.status}</span>
                  <Link className="kiraci-baglanti" href={`/panel/platform?organization=${payment.organization_id}`}>Kiracı →</Link>
                </span>
              </div>
            );
          })}
        </div>
      </StgSection>
    ) : null}
  </div>;
}
