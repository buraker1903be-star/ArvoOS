import { getPanelContext } from "@/lib/panel-context";
import { getPaytrStatus, getPlatformOrganizationId } from "@/lib/paytr-status";
import { PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { KREDI_PAKETLERI, binKrediFiyati } from "@/lib/ai-kredi-paketleri";
import { arvolabKrediDurumu } from "@/lib/arvolab";
import { submitBankTransferPayment } from "./actions";
import { buyAiCredit, payLicenseWithCard } from "./paytr-actions";

function formatTry(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
}

const sayi = (value: number) => new Intl.NumberFormat("tr-TR").format(value);

function formatIban(iban: string) {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { supabase, organization, membership } = await getPanelContext();
  const params = await searchParams;

  const [{ data: bankAccounts }, { data: payments }, { data: license }, { data: productLicenses }] = await Promise.all([
    supabase.from("platform_bank_accounts").select("id,bank_name,account_holder,iban,currency").eq("is_active", true).order("sort_order"),
    supabase.from("organization_payment_requests").select("id,plan_code,product,amount,currency,status,reference_no,review_note,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("organization_licenses").select("plan_code,license_status,current_period_end,monthly_fee").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("organization_product_licenses").select("product,status,monthly_fee,current_period_end").eq("organization_id", organization.id),
  ]);

  const canSubmit = membership && ["owner", "admin"].includes(membership.role);
  // Kartla ödeme: ürünün aylık ücreti girilmiş + ArvoOS'un PayTR mağazası bağlı olmalı
  const platformId = canSubmit ? await getPlatformOrganizationId() : null;
  const platformPaytr = platformId && platformId !== organization.id ? await getPaytrStatus(platformId) : null;
  const storeReady = Boolean(platformPaytr?.available && platformPaytr.connected && platformPaytr.enabled);

  const productRows = new Map(((productLicenses ?? []) as { product: string; status: string; monthly_fee: number | null; current_period_end: string | null }[]).map((row) => [row.product, row]));
  const subscriptions = PRODUCTS.map((product) => {
    const row = product.code === "arvoos" ? null : productRows.get(product.code);
    const fee = Number((product.code === "arvoos" ? license?.monthly_fee : row?.monthly_fee) ?? 0);
    return {
      ...product,
      fee,
      status: product.code === "arvoos" ? (license?.license_status ?? "trialing") : (row?.status ?? "inactive"),
      periodEnd: product.code === "arvoos" ? (license?.current_period_end ?? null) : (row?.current_period_end ?? null),
      // Ücreti girilmemiş ek ürün kuruma hiç gösterilmez: satın almadığı ürün için kart çıkmasın.
      visible: product.code === "arvoos" || fee > 0 || Boolean(row),
    };
  }).filter((product) => product.visible);

  /*
    AI kredisi yalnızca ArvoLab aboneliği AÇIK kuruma satılıyor: kapalıyken
    yüklenen kredi kullanılamaz, yani müşteriden kullanamayacağı bir şeyin
    parası alınmış olur. Aynı kural satın alma tarafında da var
    (lib/ai-kredi-checkout.ts) — ekran kuralı hatırlatır, sunucu uygular.
  */
  const arvolabAcik = ["active", "trialing", "past_due"].includes(productRows.get("arvolab")?.status ?? "inactive");
  // Bakiye ArvoLab'ın veritabanında; ulaşılamazsa null döner ve "0" yazılmaz.
  const kredi = canSubmit && arvolabAcik ? await arvolabKrediDurumu(organization.id) : null;

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">FİNANS VE ABONELİK</small><h1>Ödeme ve Lisans</h1><p>Havale/EFT bilgilerini görüntüleyin, dekont gönderin ve ödeme durumunu takip edin.</p></div>
      <span className="status-pill">{license?.license_status ?? "trialing"}</span>
    </div>

    {params.submitted === "1" ? <div className="team-notice">Dekontunuz alındı. Kurucu onayından sonra lisansınız otomatik etkinleştirilecek.</div> : null}

    <section className="management-grid">
      <article className="panel-card management-card">
        <div className="management-heading"><div><small>BANKA HESABI</small><h2>Havale / EFT</h2></div><span className="status-pill">TRY</span></div>
        {(bankAccounts ?? []).map((account) => <div className="platform-note" key={account.id}><span>₺</span><p><b>{account.bank_name}</b>{account.account_holder ? ` · ${account.account_holder}` : ""}<br />IBAN: <strong>{formatIban(account.iban)}</strong></p></div>)}
        <p className="panel-muted">Açıklama alanına kurum adınızı ve seçtiğiniz paket adını yazın. Ödeme sonrasında dekontu aşağıdaki formdan gönderin.</p>
      </article>

      <article className="panel-card management-card">
        <div className="management-heading"><div><small>MEVCUT LİSANS</small><h2>{organization.name}</h2></div><span className="status-pill">{license?.plan_code ?? organization.plan_code}</span></div>
        <dl className="billing-summary">
          <div><dt>Durum</dt><dd>{license?.license_status ?? "trialing"}</dd></div>
          <div><dt>Paket</dt><dd>{license?.plan_code ?? organization.plan_code}</dd></div>
          <div><dt>Dönem sonu</dt><dd>{license?.current_period_end ? new Date(license.current_period_end).toLocaleDateString("tr-TR") : "—"}</dd></div>
        </dl>
      </article>
    </section>

    {canSubmit && platformId !== organization.id ? <section className="management-grid">
      {subscriptions.map((product) => <article className="panel-card management-card" key={product.code}>
        <div className="management-heading">
          <div><small>KARTLA ÖDEME</small><h2>{product.name}</h2></div>
          <span className="status-pill">{product.fee > 0 ? `${formatTry(product.fee)} / ay` : "Ücret belirlenmedi"}</span>
        </div>
        <dl className="billing-summary">
          <div><dt>Durum</dt><dd>{productLicenseLabels[product.status] ?? product.status}</dd></div>
          <div><dt>Dönem sonu</dt><dd>{product.periodEnd ? new Date(product.periodEnd).toLocaleDateString("tr-TR") : "—"}</dd></div>
        </dl>
        {storeReady && product.fee > 0 ? (
          <form action={payLicenseWithCard} className="management-submit">
            <input type="hidden" name="product" value={product.code} />
            <small>Güvenli PayTR ödeme sayfasına yönlendirilirsiniz. Ödeme onaylanınca {product.name} lisansınız 1 ay uzar; süresi dolmadıysa mevcut dönem sonuna eklenir. Dekont gerekmez.</small>
            <button className="panel-primary" type="submit">Kartla öde · {formatTry(product.fee)}</button>
          </form>
        ) : (
          <p className="panel-muted">{product.fee > 0 ? "Kartla ödeme şu an kullanılamıyor; aşağıdan havale/EFT ile ödeyip dekont gönderebilirsiniz." : `${product.name} için aylık ücret henüz belirlenmedi. ArvoOS ile iletişime geçin ya da havale/EFT ile ödeyin.`}</p>
        )}
      </article>)}
    </section> : null}

    {canSubmit && arvolabAcik && platformId !== organization.id ? <section className="panel-card management-card">
      <div className="management-heading">
        <div><small>ARVOLAB ASİSTANI</small><h2>AI kredisi</h2></div>
        <span className="status-pill">1 kredi = 1.000 karakter</span>
      </div>

      <dl className="billing-summary">
        {/*
          Bakiye okunamadığında "0" YAZILMIYOR: hiç kullanmamış kurumla
          köprüsü kopmuş kurumu aynı göstermek, ikincisine ihtiyacı yokken
          kredi aldırırdı.
        */}
        <div><dt>Bu ayki hak</dt><dd>{kredi ? `${sayi(kredi.aylikKalan)} / ${sayi(kredi.aylikLimit)} kredi` : "okunamadı"}</dd></div>
        <div><dt>Satın alınan bakiye</dt><dd>{kredi ? `${sayi(kredi.ekBakiye)} kredi` : "okunamadı"}</dd></div>
        <div><dt>Kullanılabilir</dt><dd>{kredi ? `${sayi(kredi.aylikKalan + kredi.ekBakiye)} kredi` : "okunamadı"}</dd></div>
      </dl>

      <p className="panel-muted">
        Aylık hak her ayın başında yenilenir ve kullanılmayan kısmı devretmez.
        Satın alınan bakiye yanmaz; önce aylık hak, o bitince bakiye harcanır.
      </p>

      {storeReady ? <div className="management-grid">
        {KREDI_PAKETLERI.map((paket) => <article className="panel-card management-card" key={paket.kod}>
          <div className="management-heading">
            <div><small>{sayi(binKrediFiyati(paket) / 100)} ₺ / 1.000 kredi</small><h2>{paket.ad}</h2></div>
            <span className="status-pill">{formatTry(paket.fiyat)}</span>
          </div>
          <form action={buyAiCredit} className="management-submit">
            <input type="hidden" name="paket" value={paket.kod} />
            <small>Güvenli PayTR ödeme sayfasına yönlendirilirsiniz. Ödeme onaylanınca {sayi(paket.kredi)} kredi bakiyenize eklenir.</small>
            <button className="panel-primary" type="submit">Satın al · {formatTry(paket.fiyat)}</button>
          </form>
        </article>)}
      </div> : <p className="panel-muted">Kredi satın alma şu an kullanılamıyor. ArvoOS ile iletişime geçin.</p>}
    </section> : null}

    {canSubmit ? <section className="panel-card management-card">
      <div className="management-heading"><div><small>ÖDEME BİLDİRİMİ</small><h2>Dekont gönder</h2></div><span className="status-pill">Manuel onay</span></div>
      <form className="panel-form" action={submitBankTransferPayment}>
        {/* Önceden ürün gönderilmiyordu (varsayılan ArvoOS); Arc/Randevu için
            havaleyle ödeyen kurumun o ürünün lisansı uzamıyordu. */}
        <label>Ürün<select name="product" defaultValue="arvoos">{subscriptions.map((product) => <option key={product.code} value={product.code}>{product.name}</option>)}</select></label>
        <label>Banka hesabı<select name="bank_account_id" required>{(bankAccounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.bank_name} · {formatIban(account.iban)}</option>)}</select></label>
        <label>Paket<select name="plan_code" defaultValue={license?.plan_code ?? organization.plan_code}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></label>
        <label>Tutar (TL)<input name="amount" inputMode="decimal" min="1" step="0.01" required placeholder="0,00" /></label>
        <label>İşlem / referans no<input name="reference_no" maxLength={120} placeholder="Opsiyonel" /></label>
        <label className="wide">Dekont<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
        <label className="wide">Not<textarea name="customer_note" maxLength={1000} rows={3} placeholder="Ödemeyle ilgili açıklama" /></label>
        <div className="wide management-submit"><small>PDF, JPG, PNG veya WEBP · en fazla 10 MB</small><button className="panel-primary" type="submit">Dekontu gönder</button></div>
      </form>
    </section> : <div className="platform-note"><span>i</span><p>Dekont gönderimi yalnızca kurum sahibi veya yöneticisi tarafından yapılabilir.</p></div>}

    <section className="panel-card management-card">
      <div className="management-heading"><div><small>ÖDEME GEÇMİŞİ</small><h2>Bildirimler</h2></div><span className="status-pill">{payments?.length ?? 0} kayıt</span></div>
      <div className="module-control-list">
        {(payments ?? []).map((payment) => <div className="module-control" key={payment.id}><div><b>{productName(payment.product ?? "arvoos")} · {payment.plan_code} · {formatTry(payment.amount)}</b><small>{new Date(payment.created_at).toLocaleString("tr-TR")}{payment.reference_no ? ` · ${payment.reference_no}` : ""}{payment.review_note ? ` · ${payment.review_note}` : ""}</small></div><span className="status-pill">{payment.status}</span></div>)}
        {!payments?.length ? <p className="panel-muted">Henüz ödeme bildirimi bulunmuyor.</p> : null}
      </div>
    </section>
  </>;
}
