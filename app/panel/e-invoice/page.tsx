import { getPanelContext } from "@/lib/panel-context";
import { createSalesInvoice, updateSalesInvoiceStatus } from "./actions";

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
const statusLabel: Record<string,string> = { draft:"Taslak", ready:"Gönderime hazır", queued:"Kuyrukta", sent:"Gönderildi", accepted:"Kabul edildi", rejected:"Reddedildi", canceled:"İptal" };

export default async function EInvoicePage() {
  const { supabase, organization, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "e_invoice")) throw new Error("E-Fatura modülüne erişiminiz yok.");

  const [{ data: invoices, error }, { data: series }] = await Promise.all([
    supabase.from("sales_invoices").select("id,document_type,status,invoice_no,issue_date,customer_name,tax_number,subtotal,tax_total,grand_total,error_message,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("invoice_series").select("document_type,prefix,current_year,last_number,is_active").eq("organization_id", organization.id).order("document_type"),
  ]);
  if (error) throw new Error("Faturalar okunamadı: " + error.message);
  const canManage = ["owner","admin"].includes(membership.role);
  const rows = invoices ?? [];
  const total = rows.reduce((sum,row) => sum + Number(row.grand_total ?? 0),0);
  const ready = rows.filter((row) => row.status === "ready").length;
  const sent = rows.filter((row) => ["sent","accepted"].includes(row.status)).length;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">E-BELGE MERKEZİ</small><h1>E-Fatura ve E-Arşiv</h1><p>Satış faturalarını oluşturun, belge serilerini yönetin ve entegratör gönderim durumunu takip edin.</p></div><span className="status-pill">{rows.length} belge</span></div>

    <section className="finance-metrics">
      <article><small>TOPLAM BELGE</small><strong>{rows.length}</strong><span>Oluşturulan satış faturaları</span></article>
      <article><small>TOPLAM TUTAR</small><strong>{money(total)}</strong><span>KDV dahil belge toplamı</span></article>
      <article><small>GÖNDERİME HAZIR</small><strong>{ready}</strong><span>Entegratör kuyruğunu bekleyen</span></article>
      <article><small>GÖNDERİLEN</small><strong>{sent}</strong><span>Gönderilmiş veya kabul edilmiş</span></article>
    </section>

    {canManage ? <section className="panel-card finance-create">
      <div><small>YENİ SATIŞ FATURASI</small><h3>Sağlayıcıdan bağımsız taslak oluştur</h3></div>
      <form className="panel-form finance-form" action={createSalesInvoice}>
        <label>Belge türü<select name="document_type" defaultValue="e_archive"><option value="e_invoice">E-Fatura</option><option value="e_archive">E-Arşiv</option></select></label>
        <label>Seri kodu<input name="prefix" defaultValue="ARV" required minLength={3} maxLength={3} pattern="[A-Za-z0-9]{3}" /></label>
        <label>Müşteri / unvan<input name="customer_name" required minLength={2} maxLength={180} /></label>
        <label>VKN / TCKN<input name="tax_number" inputMode="numeric" maxLength={11} /></label>
        <label>Vergi dairesi<input name="tax_office" maxLength={120} /></label>
        <label>E-posta<input name="email" type="email" maxLength={180} /></label>
        <label className="wide">Adres<textarea name="address" maxLength={1000} rows={2} /></label>
        <label className="wide">Hizmet / ürün açıklaması<input name="description" required minLength={2} maxLength={500} /></label>
        <label>Miktar<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label>
        <label>Birim fiyat (TL)<input name="unit_price" type="number" min="0" step="0.01" required /></label>
        <label>KDV oranı<select name="vat_rate" defaultValue="20"><option value="0">%0</option><option value="1">%1</option><option value="10">%10</option><option value="20">%20</option></select></label>
        <button className="panel-primary" type="submit">Taslak faturayı oluştur</button>
      </form>
    </section> : null}

    <section className="finance-grid">
      <div className="panel-card finance-list"><header><div><small>SATIŞ FATURALARI</small><h3>Belge kayıtları</h3></div></header>
        {rows.map((invoice) => <article key={invoice.id}>
          <div><span className="status-pill">{invoice.document_type === "e_invoice" ? "E-Fatura" : "E-Arşiv"}</span><h4>{invoice.invoice_no ?? "Numarasız taslak"}</h4><p>{invoice.customer_name}{invoice.tax_number ? ` · ${invoice.tax_number}` : ""}</p></div>
          <div className="finance-amount"><strong>{money(Number(invoice.grand_total))}</strong><small>KDV {money(Number(invoice.tax_total))}</small></div>
          {canManage && ["draft","ready"].includes(invoice.status) ? <form action={updateSalesInvoiceStatus}><input type="hidden" name="invoice_id" value={invoice.id}/><select name="status" defaultValue={invoice.status}><option value="draft">Taslak</option><option value="ready">Gönderime hazır</option><option value="canceled">İptal</option></select><button type="submit">Güncelle</button></form> : <span className="status-pill">{statusLabel[invoice.status] ?? invoice.status}</span>}
        </article>)}
        {!rows.length ? <p className="finance-empty">Henüz satış faturası oluşturulmadı.</p> : null}
      </div>
      <aside className="panel-card finance-side"><small>BELGE SERİLERİ</small><h3>Aktif numaralandırma</h3>
        {(series ?? []).map((item) => <div className="bank-card" key={`${item.document_type}-${item.prefix}`}><b>{item.document_type === "e_invoice" ? "E-Fatura" : "E-Arşiv"}</b><span>{item.prefix} · {item.current_year}</span><code>Son sıra: {item.last_number}</code></div>)}
        {!series?.length ? <p className="panel-muted">İlk fatura oluşturulduğunda seri otomatik açılır.</p> : null}
        <hr/><small>ENTEGRATÖR DURUMU</small><strong>Hazırlık</strong><p>Logo, Mikro, Paraşüt veya özel entegratör bağlantısı daha sonra bu çekirdeğe bağlanabilir.</p>
      </aside>
    </section>
  </>;
}
