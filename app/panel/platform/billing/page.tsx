import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { StgIcon, StgSection, StgWidget, type StgTone } from "../../settings/settings-ui";
import { PAKET_ADI, para, tarih } from "../bicim";
import { productName } from "@/lib/products";
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";
import "../../settings/settings.css";
import "../platform.css";
import { abonelikHatirlatmasiGonder } from "../actions";
import { renewalReminders, REMINDER_WINDOW_DAYS, type RenewalLicense, type RenewalOrganization } from "@/lib/renewal-reminders";

/*
  Abonelikler LİSANSLARDAN okunuyor, billing_subscriptions'tan değil.

  O tablo bir abonelik kütüğü değil, ÖDEME GÜNLÜĞÜ: arvo_record_paytr_payment
  her başarılı kart ödemesinde oraya düz bir insert atıyor (on conflict yok)
  ve status'ü her zaman 'active' yazıyor. Sonuçları üç ayrı yanlış sayıydı:

    - "Aktif abonelik", abonelik sayısı değil ÖDEME sayısıydı; altı ay ödeyen
      bir kiracı altı kez sayılıyordu.
    - "Ödemesi gecikmiş" hep 0 çıkıyordu, çünkü o tabloya past_due hiç
      yazılmıyor.
    - "Kurum abonelikleri" listesi aynı kiracıyı her ödemesi için tekrar
      tekrar gösteriyordu.

  Aynı hata sınıfı daha önce billing_invoices'ta da yaşandı (kiracının kendi
  müşterilerine kestiği faturalar Arvo'nun geliri sanılıyordu). Gelir zaten
  lisanslardan hesaplanıyordu; artık abonelik listesi de aynı kaynaktan.
*/

type AbonelikSatiri = {
  organizationId: string;
  organizationName: string;
  urun: string;
  urunAdi: string;
  durum: string;
  planCode: string | null;
  monthlyFee: number | null;
  donemSonu: string | null;
  denemeSonu: string | null;
};

type Tahsilat = {
  anahtar: string;
  organizationId: string | null;
  kim: string;
  kanal: string;
  amount: number;
  currency: string;
  tarih: string | null;
};

const statusLabels: Record<string, string> = { active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", canceled: "İptal", incomplete: "Tamamlanmadı", paid: "Ödendi", open: "Açık", draft: "Taslak", void: "Geçersiz" };
const statusTones: Record<string, StgTone> = { active: "success", trialing: "info", past_due: "warning", canceled: "danger", incomplete: "warning", paid: "success", open: "warning", draft: "neutral", void: "neutral" };

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const remindersNow = (licenses: RenewalLicense[], organizations: RenewalOrganization[]) => renewalReminders(licenses, organizations, Date.now());

export default async function BillingPage() {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [
    { data: internalOrganizations },
    { data: productLicenses },
    { data: organizationRows },
    { data: coreLicenses },
    { data: havaleler },
    { data: kartOdemeleri },
    { data: aboneOdemeleri },
  ] = await Promise.all([
    supabase.from("organizations").select("id").eq("kind", "internal"),
    supabase.from("organization_product_licenses").select("organization_id,product,status,plan_code,monthly_fee,current_period_end,trial_ends_at").in("status", ["active", "trialing", "past_due"]),
    supabase.from("organizations").select("id,name,display_name,contact_phone,kind"),
    // ArvoOS çekirdek lisansının aylık ücreti; ek ürünler ayrı tabloda.
    supabase.from("organization_licenses").select("organization_id,license_status,plan_code,monthly_fee,current_period_end,trial_ends_at"),
    /*
      Platformun TAHSİL ETTİĞİ para. Eskiden burada billing_invoices
      okunuyordu — o tablo KİRACININ KENDİ MÜŞTERİLERİNE kestiği faturalar
      (Finans modülü oraya yazıyor). Konsol, AkademikMerkez'in
      müşterilerinden tahsil ettiğini Arvo'nun geliri gibi topluyordu.

      Üç kanal var ve üçü de sayılıyor. Kart ödemeleri eskiden hiç
      sayılmıyordu: "Tahsil edildi" yalnızca havale ve bireysel aboneyi
      topluyor, PayTR'den gelen kurum ödemelerini atlıyordu.
    */
    supabase.from("organization_payment_requests").select("id,amount,currency,reviewed_at,organization_id,product").eq("status", "approved"),
    supabase.from("billing_subscriptions").select("id,organization_id,product,unit_amount,currency,created_at,provider"),
    supabase.from("subscriber_payments").select("id,amount,currency,paid_at"),
  ]);
  // Otomatik çekim yok: dönem sonu yaklaşanlar burada, kurucu WhatsApp'tan hatırlatır.
  const reminders = remindersNow((productLicenses ?? []) as RenewalLicense[], (organizationRows ?? []) as RenewalOrganization[]);

  /*
    Kendi markalarımız gelir toplamına girmez: aynı tüzel kişiliğin kendi
    kendine ödemesi gelir değil, yalnızca raporu şişirir. Kayıtlar listede
    görünmeye devam eder, yalnızca sayımdan düşer.
  */
  const internal = new Set((internalOrganizations ?? []).map((row) => row.id as string));
  const isCustomer = (row: { organization_id: string }) => !internal.has(row.organization_id);

  const kurumlar = (organizationRows ?? []) as { id: string; name: string; display_name: string | null }[];
  const orgAdi = new Map(kurumlar.map((row) => [row.id, row.display_name || row.name]));

  const cekirdek = (coreLicenses ?? []) as { organization_id: string; license_status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[];
  const ekUrunler = (productLicenses ?? []) as unknown as { organization_id: string; product: string; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null }[];

  const ABONE_DURUMLARI = new Set(["active", "trialing", "past_due"]);
  const abonelikler: AbonelikSatiri[] = [
    ...cekirdek
      .filter((satir) => isCustomer(satir) && ABONE_DURUMLARI.has(satir.license_status))
      .map((satir) => ({
        organizationId: satir.organization_id,
        organizationName: orgAdi.get(satir.organization_id) ?? "Kurum",
        urun: "arvoos",
        urunAdi: productName("arvoos"),
        durum: satir.license_status,
        planCode: satir.plan_code,
        monthlyFee: satir.monthly_fee,
        donemSonu: satir.current_period_end,
        denemeSonu: satir.trial_ends_at,
      })),
    ...ekUrunler
      .filter(isCustomer)
      .map((satir) => ({
        organizationId: satir.organization_id,
        organizationName: orgAdi.get(satir.organization_id) ?? "Kurum",
        urun: satir.product,
        urunAdi: productName(satir.product),
        durum: satir.status,
        planCode: satir.plan_code,
        monthlyFee: satir.monthly_fee,
        donemSonu: satir.current_period_end,
        denemeSonu: satir.trial_ends_at,
      })),
  ].sort((a, b) => a.organizationName.localeCompare(b.organizationName, "tr") || a.urunAdi.localeCompare(b.urunAdi, "tr"));

  /*
    Beklenen aylık gelir LİSANSLARDAN hesaplanıyor: billing_subscriptions'a
    satır ancak bir ödeme onaylandığında düşüyor, yani denemedeki ya da elle
    lisans verilmiş kurumlar hiç sayılmıyordu ve gerçek gelir varken ekranda
    ₺0 yazabiliyordu.

    Denemedekiler ayrı tutuluyor: henüz ödemiyorlar, beklenen gelire katmak
    raporu şişirir. Potansiyel olarak ayrıca gösteriliyor.
  */
  const topla = (satirlar: AbonelikSatiri[]) => satirlar.reduce((sum, satir) => sum + Number(satir.monthlyFee ?? 0), 0);
  const odeyenler = abonelikler.filter((satir) => satir.durum === "active" || satir.durum === "past_due");
  const denemedekiler = abonelikler.filter((satir) => satir.durum === "trialing");
  const mrr = topla(odeyenler);
  const denemeGeliri = topla(denemedekiler);
  const pastDue = abonelikler.filter((satir) => satir.durum === "past_due").length;
  const ucretsiz = abonelikler.filter((satir) => !satir.monthlyFee).length;

  /* Üç kanal tek listede. Kart ödemeleri billing_subscriptions'tan geliyor:
     o tablo bir abonelik kütüğü değil, yalnızca bu RPC'nin yazdığı ödeme
     günlüğü — tahsilat olarak doğru, abonelik olarak değil. */
  const tahsilatlar: Tahsilat[] = [
    ...((havaleler ?? []) as { id: string; amount: number; currency: string; reviewed_at: string | null; organization_id: string }[])
      .filter(isCustomer)
      .map((row) => ({
        anahtar: `havale-${row.id}`,
        organizationId: row.organization_id,
        kim: orgAdi.get(row.organization_id) ?? "Kurum",
        kanal: "Havale/EFT",
        amount: Number(row.amount),
        currency: row.currency,
        tarih: row.reviewed_at,
      })),
    ...((kartOdemeleri ?? []) as { id: string; organization_id: string; unit_amount: number; currency: string; created_at: string; provider: string }[])
      .filter(isCustomer)
      .map((row) => ({
        anahtar: `kart-${row.id}`,
        organizationId: row.organization_id,
        kim: orgAdi.get(row.organization_id) ?? "Kurum",
        kanal: row.provider === "paytr" ? "Kart (PayTR)" : `Kart (${row.provider})`,
        amount: Number(row.unit_amount),
        currency: row.currency,
        tarih: row.created_at,
      })),
    ...((aboneOdemeleri ?? []) as { id: string; amount: number; currency: string; paid_at: string | null }[])
      .map((row) => ({
        anahtar: `abone-${row.id}`,
        organizationId: null,
        kim: "Bireysel abone",
        kanal: "Kart",
        amount: Number(row.amount),
        currency: row.currency,
        tarih: row.paid_at,
      })),
  ].sort((a, b) => (b.tarih ?? "").localeCompare(a.tarih ?? ""));

  /*
    Toplam artık BÜTÜN kayıtlardan. Eskiden her sorguda .limit(50) vardı ve
    "Tahsil edildi" son 50 kaydın toplamıydı; 51. ödemeden sonra rakam
    sessizce eksilmeye başlıyordu. Liste kısa kalıyor, toplam kısalmıyor.
  */
  const toplamTahsilat = tahsilatlar.reduce((sum, satir) => sum + satir.amount, 0);
  /*
    Ay sınırı Türkiye saatiyle ve ZAMAN DAMGASI olarak karşılaştırılıyor.
    Metin karşılaştırması (`satir.tarih >= ayBasi`) burada çalışıyor gibi
    görünürdü ama PostgREST "…+00:00", toISOString() ise "…Z" yazıyor;
    aynı saniyeye denk gelen iki kayıtta sonuç sessizce sapardı.
  */
  const ayBasiMs = istanbulMidnight(`${todayInIstanbul().slice(0, 7)}-01`).getTime();
  const buAyTahsilat = tahsilatlar
    .filter((satir) => satir.tarih && new Date(satir.tarih).getTime() >= ayBasiMs)
    .reduce((sum, satir) => sum + satir.amount, 0);

  /*
    Para birimi karışırsa toplam anlamsız olur: 100 ₺ ile 100 $ toplanıp tek
    simgeyle yazılırdı. Lisans ücretlerinin birim sütunu yok, onlar tanımı
    gereği TRY (AGENTS.md "Para kuruş cinsinden tamsayı"); karışma ancak
    tahsilat kayıtlarından gelebilir.
  */
  const birimler = new Set(tahsilatlar.map((satir) => satir.currency || "TRY"));
  if (abonelikler.length) birimler.add("TRY");
  const currency = birimler.size === 1 ? [...birimler][0] : "TRY";
  const birimKarisik = birimler.size > 1;

  const sonTahsilatlar = tahsilatlar.slice(0, 20);

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">PLATFORM · FİNANS</small><h1>Abonelikler</h1><p>Kurum aboneliklerini, ödeme durumlarını ve tahsilatları tek yerden izleyin.</p></div>
    </div>

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "ödemesi
      gecikmiş kurum yok" demek, satırın hiç olmamasından daha çok şey
      söyler.
    */}
    <div className="stg-widgets" aria-label="Abonelik özeti">
      <StgWidget
        tone="gold" icon="wallet" label="Beklenen aylık" value={para(mrr, currency)}
        note={denemeGeliri ? `${para(denemeGeliri, currency)} denemede` : ucretsiz ? `${ucretsiz} abonelikte ücret girilmedi` : "Denemede gelir yok"}
      />
      {/* Toplam BÜTÜN kayıtlardan; başlıkta bu ay, notta tüm zaman. Eskiden
          son 50 kaydın toplamı "tahsil edildi" diye yazılıyordu. */}
      <StgWidget
        tone="success" icon="check" label="Bu ay tahsil edilen" value={para(buAyTahsilat, currency)}
        note={`Tüm zamanlar ${para(toplamTahsilat, currency)} · ${tahsilatlar.length} ödeme`}
      />
      <StgWidget
        tone="info" icon="box" label="Aktif abonelik" value={odeyenler.length}
        note={denemedekiler.length ? `${denemedekiler.length} deneme sürüyor` : `${abonelikler.length} abonelik kaydı`}
      />
      <StgWidget
        tone={pastDue ? "warning" : "neutral"} icon="shield" label="Ödemesi gecikmiş" value={pastDue}
        note={pastDue ? "Hatırlatma gönderin" : "Gecikmiş abonelik yok"}
      />
    </div>

    {/* Farklı para birimleri toplanamaz; toplamı doğru sanmaktansa
        güvenilmez olduğunu söylüyoruz. */}
    {birimKarisik ? (
      <p className="stg-muted"><StgIcon name="shield" size={16} />Kayıtlarda birden çok para birimi var; toplamlar {currency} varsayımıyla yazıldı ve güvenilir değil.</p>
    ) : null}

    <div className="stg-grid">
      <StgSection
        id="hatirlatmalar" wide icon="wallet" tone={reminders.some((r) => r.daysLeft < 0) ? "danger" : reminders.length ? "warning" : "neutral"}
        kicker="ÖDEME HATIRLATMALARI" title="Dönem sonu yaklaşanlar"
        description={`Arc, ArvoLab ve Randevu aboneliklerinden ${REMINDER_WINDOW_DAYS} gün içinde bitenler ve süresi geçenler. WhatsApp düğmesi kurumun iletişim numarasına ödeme bağlantılı hazır mesajı açar.`}
        aside={<span className="status-pill" data-tone={reminders.length ? "warning" : "neutral"}>{reminders.length} kurum</span>}
      >
        {reminders.length ? (
          <div className="stg-list">
            {reminders.map((r) => (
              <div key={`${r.organizationId}-${r.product}`} className="plt-row">
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone={r.daysLeft < 0 ? "danger" : r.daysLeft <= 1 ? "warning" : "gold"}><StgIcon name="wallet" size={16} /></span>
                  <span>
                    <b>{r.organizationName} · {r.productName}</b>
                    <small>{r.daysLeft < 0 ? `${-r.daysLeft} gün önce bitti` : r.daysLeft === 0 ? "Bugün bitiyor" : `${r.daysLeft} gün kaldı`} · {tarih(r.endsAt)}{r.fee ? ` · ${para(r.fee, "TRY")} / ay` : " · aylık ücret girilmedi"}</small>
                  </span>
                </span>
                {/*
                  Eskiden bu bir wa.me bağlantısıydı: kurucu WhatsApp Web'e
                  düşüyor, mesajı elle gönderiyordu ve gönderilip
                  gönderilmediğinin kaydı kalmıyordu — "bu kuruma hatırlattık
                  mı" sorusunun yanıtı kimsede yoktu. Artık kapıdan gidiyor
                  ve kurumun sohbetine yazılıyor.
                */}
                {r.phone ? (
                  <form action={abonelikHatirlatmasiGonder}>
                    <input type="hidden" name="organization_id" value={r.organizationId} />
                    <input type="hidden" name="product" value={r.product} />
                    <input type="hidden" name="tur" value={r.trial ? "trial" : "renewal"} />
                    <input type="hidden" name="phone" value={r.phone} />
                    <input type="hidden" name="message" value={r.message} />
                    <input type="hidden" name="abone" value={r.organizationName} />
                    <input type="hidden" name="urun" value={r.productName} />
                    <input type="hidden" name="tarih" value={r.endsAtLabel} />
                    <input type="hidden" name="ucret" value={r.feeLabel ?? ""} />
                    <button className="panel-secondary" type="submit" title={r.message}>WhatsApp ile hatırlat</button>
                  </form>
                ) : (
                  <Link className="panel-secondary" href={`/panel/platform?organization=${r.organizationId}#ayarlar`} title="Kurum ayarlarında iletişim telefonu yok ya da cep numarası değil">Telefon ekle</Link>
                )}
              </div>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="check" size={22} /><p>Önümüzdeki {REMINDER_WINDOW_DAYS} gün içinde biten ya da süresi geçmiş ek ürün aboneliği yok.</p></div>}
      </StgSection>

      <StgSection
        id="abonelikler" wide icon="box" tone="gold" kicker="ABONELİKLER" title="Kurum abonelikleri"
        description="Kiracı × ürün. Kaynak lisans kayıtları: ödemesi henüz gelmemiş ya da elle açılmış abonelikler de burada."
        aside={<span className="status-pill">{abonelikler.length} abonelik</span>}
      >
        {abonelikler.length ? (
          <div className="stg-list">
            {abonelikler.map((satir) => (
              <div key={`${satir.organizationId}-${satir.urun}`} className="plt-row">
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone={statusTones[satir.durum] ?? "neutral"}><StgIcon name="building" size={16} /></span>
                  <span>
                    <b>{satir.organizationName} · {satir.urunAdi}</b>
                    <small>
                      {satir.planCode ? `${PAKET_ADI[satir.planCode] ?? satir.planCode} · ` : ""}
                      {/* Ücreti girilmemiş abonelik ₺0 yazmıyor: sıfır ücret
                          bir fiyat, eksik ücret ise eksik bir kayıt. */}
                      {satir.monthlyFee ? `${para(Number(satir.monthlyFee), currency)} / ay` : "aylık ücret girilmedi"}
                      {satir.durum === "trialing"
                        ? ` · deneme bitişi ${tarih(satir.denemeSonu)}`
                        : satir.donemSonu ? ` · dönem sonu ${tarih(satir.donemSonu)}` : " · dönem sonu girilmedi"}
                    </small>
                  </span>
                </span>
                <span className="plt-row-uc">
                  <span className="status-pill" data-tone={statusTones[satir.durum] ?? "neutral"}>{statusLabels[satir.durum] ?? satir.durum}</span>
                  {/* Çapraz listeden kiracı dosyasına: kurucu bir satırda
                      sorun görünce o kiracının tamamına bakmak istiyor. */}
                  <Link className="kiraci-baglanti" href={`/panel/platform/licenses?organization=${satir.organizationId}`}>Lisans →</Link>
                </span>
              </div>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="box" size={22} /><p>Aktif, denemede ya da ödemesi gecikmiş abonelik yok.</p></div>}
      </StgSection>

      {/*
        Burada "Son faturalar" diye KİRACININ KENDİ MÜŞTERİLERİNE kestiği
        faturalar listeleniyordu (billing_invoices; Finans modülü oraya
        yazıyor). Konsol, AkademikMerkez'in müşterilerinden tahsil ettiğini
        Arvo'nun geliri gibi gösteriyordu — hem yanlış hem de kiracının işi.

        Yerine platformun kendi tahsilatı: havale onayları, kart ödemeleri
        ve bireysel abone ödemeleri. Kart kanalı eskiden hiç görünmüyordu.
      */}
      <StgSection
        id="tahsilat" wide icon="wallet" tone="success" kicker="TAHSİLAT" title="Platformun aldığı ödemeler"
        description="Havale/EFT onayları, kart ödemeleri ve bireysel abone ödemeleri. Liste son 20 kayıt; yukarıdaki toplamlar tüm kayıtlardan."
        aside={<span className="status-pill">{tahsilatlar.length} kayıt</span>}
      >
        {sonTahsilatlar.length ? (
          <div className="stg-list">
            {sonTahsilatlar.map((row) => (
              <div key={row.anahtar} className="plt-row">
                <span className="stg-row-main">
                  <span className="stg-row-icon" data-tone="success"><StgIcon name="wallet" size={16} /></span>
                  <span>
                    <b>{para(row.amount, row.currency)}</b>
                    <small>{row.kim} · {row.kanal} · {tarih(row.tarih)}</small>
                  </span>
                </span>
                {row.organizationId ? (
                  <Link className="kiraci-baglanti" href={`/panel/platform?organization=${row.organizationId}`}>Kiracı →</Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : <div className="stg-empty"><StgIcon name="wallet" size={22} /><p>Henüz tahsilat kaydı yok. Havale onayları, kart ödemeleri ve bireysel abonelikler burada toplanır.</p></div>}
      </StgSection>
    </div>
  </div>;
}
