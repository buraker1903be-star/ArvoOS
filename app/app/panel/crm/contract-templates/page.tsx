import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { akademikMerkezTemplate, arvoOSGeneralTemplate } from "@/lib/contract-templates";
import "../crm.css";

type ContractRow = {
  id: string;
  status: string;
  contract_template_key: string | null;
  contract_template_version: string | null;
  created_at: string;
};

export default async function ContractTemplatesPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) {
    throw new Error("CRM modülüne erişiminiz yok.");
  }

  const { data, error } = await supabase
    .from("crm_contracts")
    .select("id,status,contract_template_key,contract_template_version,created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Sözleşme şablon bilgileri okunamadı: ${error.message}`);
  const rows = (data ?? []) as ContractRow[];
  const templates = [arvoOSGeneralTemplate, akademikMerkezTemplate];

  const usage = (key: string) => rows.filter((row) => row.contract_template_key === key).length;
  const signed = (key: string) => rows.filter((row) => row.contract_template_key === key && row.status === "signed").length;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">CRM / SÖZLEŞME YÖNETİMİ</small>
        <h1>Sözleşme Şablonları</h1>
        <p>Kurum bazlı sözleşme metinlerini, sürümlerini ve kullanım durumlarını yönetin.</p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill">{templates.length} sistem şablonu</span>
        <Link className="panel-secondary" href="/panel/crm/contracts">Sözleşmelere dön</Link>
      </div>
    </div>

    <section className="crm-metrics">
      <article><small>ŞABLON</small><strong>{templates.length}</strong><span>Aktif sistem şablonu</span></article>
      <article><small>KULLANIM</small><strong>{rows.filter((row) => row.contract_template_key).length}</strong><span>Şablon kaydı bulunan sözleşme</span></article>
      <article><small>İMZALI</small><strong>{rows.filter((row) => row.status === "signed").length}</strong><span>Elektronik onayı tamamlanan</span></article>
      <article><small>SÜRÜM</small><strong>1.0</strong><span>Yayındaki sözleşme sürümü</span></article>
    </section>

    <section className="crm-record-list">
      {templates.map((template) => {
        const isAcademic = template.key === "akademikmerkez_academic";
        return <article className="panel-card crm-record" key={template.key}>
          <div className="crm-record-main">
            <div className="crm-record-heading">
              <span className="crm-record-number">{template.key}</span>
              <span className="status-pill">Aktif · v{template.version}</span>
            </div>
            <h2>{template.name}</h2>
            <p>{isAcademic
              ? "AkademikMerkez çalışma alanında akademik danışmanlık, etik, veri, yayın ve revizyon hükümleriyle otomatik kullanılır."
              : "ArvoOS üzerindeki diğer kurumlarda genel hizmet, yazılım, danışmanlık, teslim ve fikri hak hükümleriyle kullanılır."}</p>
            <div className="crm-record-meta">
              <span>{template.clauses.length} ana madde</span>
              <span>{usage(template.key)} sözleşmede kullanıldı</span>
              <span>{signed(template.key)} imzalı kayıt</span>
            </div>
            <div className="panel-page-actions">
              <Link className="panel-secondary" href="/panel/crm/contracts">Kullanılan sözleşmeleri gör</Link>
            </div>
          </div>
          <aside className="crm-record-side">
            <small>ŞABLON TÜRÜ</small>
            <strong>{isAcademic ? "Akademik" : "Genel Hizmet"}</strong>
            <span>{isAcademic ? "AkademikMerkez'e özel" : "ArvoOS kurumları"}</span>
          </aside>
        </article>;
      })}
    </section>

    <section className="panel-card">
      <small className="panel-kicker">SÜRÜM POLİTİKASI</small>
      <h2>İmzalanan sözleşmeler değişmez</h2>
      <p>Yeni metin değişiklikleri yeni bir sürüm olarak yayımlanmalıdır. İmzalanmış sözleşmeler, onaylandıkları şablon anahtarı ve sürüm numarasıyla korunur.</p>
    </section>
  </div>;
}
