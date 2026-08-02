import { getPanelContext } from "@/lib/panel-context";
import { createDocument, updateDocumentStatus } from "./actions";

const categoryNames: Record<string,string> = { general:"Genel", contract:"Sözleşme", invoice:"Fatura", proposal:"Teklif", hr:"İnsan Kaynakları", operation:"Operasyon", finance:"Finans" };
const statusNames: Record<string,string> = { draft:"Taslak", active:"Aktif", archived:"Arşiv" };

export default async function DocumentsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "documents")) throw new Error("Dokümanlar modülüne erişiminiz yok.");
  const canManage = ["owner","admin"].includes(membership.role);
  const { data: documents, error } = await supabase.from("organization_documents")
    .select("id,title,category,status,external_url,notes,created_at")
    .eq("organization_id",membership.organization_id)
    .order("created_at",{ascending:false});
  if (error) throw new Error("Dokümanlar okunamadı.");

  const active = (documents ?? []).filter((item) => item.status === "active");
  const archived = (documents ?? []).filter((item) => item.status === "archived");
  const contracts = (documents ?? []).filter((item) => item.category === "contract");

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">DOKÜMANLAR</small><h1>Belge merkezi</h1><p>Kurum belgelerini tek yerde kaydedin, sınıflandırın ve arşivleyin.</p></div></div>

    <section className="finance-metrics">
      <article><small>TOPLAM BELGE</small><strong>{documents?.length ?? 0}</strong><span>Tüm kayıtlar</span></article>
      <article><small>AKTİF</small><strong>{active.length}</strong><span>Kullanımdaki belgeler</span></article>
      <article><small>SÖZLEŞME</small><strong>{contracts.length}</strong><span>Sözleşme kayıtları</span></article>
      <article><small>ARŞİV</small><strong>{archived.length}</strong><span>Tamamlanan kayıtlar</span></article>
    </section>

    {canManage ? <section className="panel-action-row"><details className="panel-card panel-action-details"><summary>+ Yeni belge</summary><form className="panel-form" action={createDocument}><label className="wide">Belge adı<input name="title" required minLength={2}/></label><label>Kategori<select name="category"><option value="general">Genel</option><option value="contract">Sözleşme</option><option value="invoice">Fatura</option><option value="proposal">Teklif</option><option value="hr">İnsan Kaynakları</option><option value="operation">Operasyon</option><option value="finance">Finans</option></select></label><label>Belge bağlantısı<input name="external_url" type="url" placeholder="https://"/></label><label className="wide">Not<textarea name="notes" maxLength={1500}/></label><div className="wide form-actions"><button className="panel-primary" type="submit">Belgeyi kaydet</button></div></form></details></section> : null}

    <section className="panel-card"><div className="management-heading"><div><small>BELGE LİSTESİ</small><h2>Kayıtlar</h2></div><span className="status-pill">{documents?.length ?? 0}</span></div>{documents?.length ? <table className="panel-table"><thead><tr><th>BELGE</th><th>KATEGORİ</th><th>DURUM</th><th>TARİH</th><th>İŞLEM</th></tr></thead><tbody>{documents.map((item) => <tr key={item.id}><td><b>{item.external_url ? <a href={item.external_url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</b>{item.notes ? <><br/><small>{item.notes}</small></> : null}</td><td>{categoryNames[item.category] ?? item.category}</td><td><span className="status-pill">{statusNames[item.status] ?? item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString("tr-TR")}</td><td>{canManage ? <form action={updateDocumentStatus}><input type="hidden" name="id" value={item.id}/><select name="status" defaultValue={item.status}><option value="draft">Taslak</option><option value="active">Aktif</option><option value="archived">Arşiv</option></select><button className="panel-secondary" type="submit">Güncelle</button></form> : "—"}</td></tr>)}</tbody></table> : <div className="panel-empty">Henüz belge kaydı yok.</div>}</section>
  </>;
}
