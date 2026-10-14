import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { getPaymentIncidents } from "@/lib/payment-incidents";
import { StgIcon, StgSection } from "../../settings/settings-ui";
import { para, sayi, tarih } from "../bicim";
import "../../settings/settings.css";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

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

  FATURA: platformun kiracıya kestiği fatura bugün YOK. Aktivasyon,
  kiracının kendi fatura tablosuna (billing_invoices) "ödendi" satırı
  yazıyor — o kiracının kendi müşterilerine kestiği faturaların tablosu,
  Arvo'nun faturası değil. Bölüm bunu açıkça söylüyor; Paraşüt
  entegrasyonu (e-fatura / e-arşiv) bağlandığında burası fatura listesi
  olacak. Çalışmayan özellik çalışıyormuş gibi gösterilmiyor.
*/

const LISTE = 50;

type Tahsilat = { anahtar: string; organizationId: string | null; kim: string; kanal: string; amount: number; currency: string; tarih: string | null };

export default async function TahsilatPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [
    { data: ozetVerisi, error: ozetHatasi },
    { data: kurumOdemeleri, error: kurumHatasi },
    { data: aboneOdemeleri, error: aboneHatasi },
    { data: bekleyenler, error: bekleyenHatasi },
    { data: kurumlar },
    olaylar,
  ] = await Promise.all([
    supabase.rpc("platform_tahsilat_ozeti"),
    supabase.from("organization_payment_requests").select("id,organization_id,amount,currency,payment_method,reviewed_at")
      .eq("status", "approved").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(LISTE),
    supabase.from("subscriber_payments").select("id,amount,currency,paid_at").order("paid_at", { ascending: false, nullsFirst: false }).limit(LISTE),
    // Onay bekleyen havaleler: hepsi (bugünün iş kuyruğu, küçük).
    supabase.from("organization_payment_requests").select("id,amount,currency").eq("status", "pending"),
    supabase.from("organizations").select("id,name,display_name,kind"),
    getPaymentIncidents(),
  ]);
  const hata = ozetHatasi ?? kurumHatasi ?? aboneHatasi ?? bekleyenHatasi;
  if (hata) throw new Error("Tahsilat okunamadı: " + hata.message);

  const ozet = (ozetVerisi ?? {}) as { adet?: number; toplam?: number; bu_ay?: number; birimler?: string[] };
  const kurumBilgisi = new Map(((kurumlar ?? []) as { id: string; name: string; display_name: string | null; kind: string | null }[]).map((k) => [k.id, k]));
  const birimKarisik = (ozet.birimler ?? []).length > 1;

  /* Kendi kurumlarımızın ödemesi gelir değil (özet işleviyle aynı kural). */
  const tahsilatlar: Tahsilat[] = [
    ...((kurumOdemeleri ?? []) as { id: string; organization_id: string; amount: number; currency: string; payment_method: string | null; reviewed_at: string | null }[])
      .filter((o) => kurumBilgisi.get(o.organization_id)?.kind !== "internal")
      .map((o) => {
        const k = kurumBilgisi.get(o.organization_id);
        return {
          anahtar: `kurum-${o.id}`, organizationId: o.organization_id, kim: k?.display_name || k?.name || "Kurum",
          kanal: o.payment_method === "paytr" ? "Kart (PayTR)" : "Havale/EFT", amount: Number(o.amount), currency: o.currency, tarih: o.reviewed_at,
        };
      }),
    ...((aboneOdemeleri ?? []) as { id: string; amount: number; currency: string; paid_at: string | null }[])
      .map((o) => ({ anahtar: `abone-${o.id}`, organizationId: null, kim: "Bireysel abone", kanal: "Kart", amount: Number(o.amount), currency: o.currency, tarih: o.paid_at })),
  ].sort((a, b) => (b.tarih ?? "").localeCompare(a.tarih ?? "")).slice(0, LISTE);

  const bekleyenSatirlar = (bekleyenler ?? []) as { amount: number; currency: string }[];
  // tuzak-tamam: sınırsız sorgu (bekleyen havalelerin hepsi), toplam doğru.
  const bekleyenTutar = bekleyenSatirlar.reduce((t, b) => t + Number(b.amount), 0);

  return <main className="stg plt talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · FATURALAMA VE TAHSİLAT</small>
        <h1>Faturalama ve Tahsilat</h1>
        <p>Platformun aldığı ödemeler, onay bekleyen havaleler, işlenemeyen kart ödemeleri ve faturalar.</p>
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

    {birimKarisik ? (
      <p className="stg-muted"><StgIcon name="shield" size={16} />Kayıtlarda birden çok para birimi var; toplamlar TRY varsayımıyla yazıldı ve güvenilir değil.</p>
    ) : null}

    <StgSection
      id="tahsilatlar" wide icon="wallet" tone="success" kicker="TAHSİLAT" title="Platformun aldığı ödemeler"
      description={`Onaylı havale ve kart ödemeleri ile bireysel abone ödemeleri. Liste son ${LISTE} kayıt; üstteki toplamlar bütün kayıtlardan.`}
      aside={<span className="status-pill">{sayi(Number(ozet.adet ?? 0))} kayıt</span>}
    >
      {tahsilatlar.length ? (
        <div className="plt-table-scroll">
          <table className="plt-table">
            <thead><tr><th>Tarih</th><th>Kim</th><th>Kanal</th><th>Tutar</th><th /></tr></thead>
            <tbody>
              {tahsilatlar.map((t) => (
                <tr key={t.anahtar}>
                  <td>{tarih(t.tarih)}</td>
                  <td>{t.kim}</td>
                  <td>{t.kanal}</td>
                  <td>{para(t.amount, t.currency)}</td>
                  <td>{t.organizationId ? <Link className="kiraci-baglanti" href={`/panel/platform?organization=${t.organizationId}`}>Kiracı →</Link> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="stg-empty"><StgIcon name="wallet" size={22} /><p>Henüz tahsilat kaydı yok. Havale onayları, kart ödemeleri ve bireysel abonelikler burada toplanır.</p></div>}
    </StgSection>

    <StgSection
      id="faturalar" wide icon="doc" tone="warning" kicker="FATURALAR" title="Platform faturası henüz kesilmiyor"
      description="Arvo'nun kiracılara kestiği fatura bugün sistemde yok; e-fatura / e-arşiv entegrasyonu bağlı değil."
    >
      <div className="plt-banner" data-tone="warning">
        <span className="plt-banner-icon">!</span>
        <span>
          <b>Faturalar elle kesiliyor</b>
          <p>
            Onaylanan her ödeme lisansı açıyor ama Arvo adına fatura oluşturmuyor. Paraşüt entegrasyonu planlandı:
            onaylı ödemeden fatura kaydı, vergi numarasına göre e-fatura ya da e-arşiv, sonucu bu listede. Bağlanana kadar
            bu bölüm bir fatura listesi değil; tahsilat kayıtları yukarıda.
          </p>
        </span>
      </div>
    </StgSection>
  </main>;
}
