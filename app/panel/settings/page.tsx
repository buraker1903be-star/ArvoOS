import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { updateDocumentBranding } from "./actions";

const roleNames: Record<string, string> = {owner:"Kurum Sahibi",admin:"Kurum Yöneticisi",manager:"Birim Yöneticisi",member:"Ekip Üyesi"};
const integrationCodes = new Set(["banking","payments","e_invoice","billing","integrations","domains"]);

export default async function SettingsPage() {
  const { organization, membership, modules, supabase } = await getPanelContext();
  const enabledCodes = new Set(modules.map((module) => module.code));
  const integrations = modules.filter((module) => integrationCodes.has(module.code));
  const canManage = ["owner", "admin"].includes(membership.role);
  const {data:branding}=await supabase.from("organizations").select("logo_url,primary_color,document_footer,contact_email,contact_phone,website_url").eq("id",membership.organization_id).single();

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">YÖNETİM</small><h1>Ayarlar</h1><p>Kurum, ekip, entegrasyon ve belge kimliğini tek yerden yönetin.</p></div><div className="panel-page-actions"><span className="status-pill">{roleNames[membership.role] ?? membership.role}</span></div></div>
    <section className="metric-strip"><article><div><small>PAKET</small><strong>{organization.plan_code.toUpperCase()}</strong><p>Aktif kurum paketi</p></div></article><article><div><small>MODÜL</small><strong>{modules.length}</strong><p>Etkin çalışma alanı</p></div></article><article><div><small>ENTEGRASYON</small><strong>{integrations.length}</strong><p>Etkin bağlantı alanı</p></div></article><article><div><small>DURUM</small><strong>{organization.status === "active" ? "Aktif" : organization.status}</strong><p>Kurum erişimi</p></div></article></section>

    <section className="settings-grid">
      <article className="panel-card settings-card"><div><small>KURUM</small><h3>Kurum bilgileri</h3><p>Temel çalışma alanı ve alan adı bilgileri.</p></div><dl className="settings-list"><div><dt>Kurum</dt><dd>{organization.name}</dd></div><div><dt>Sektör</dt><dd>{organization.sector || "Belirtilmedi"}</dd></div><div><dt>Çalışma alanı</dt><dd>{organization.slug}</dd></div><div><dt>Özel alan adı</dt><dd>{organization.custom_domain || "Tanımlı değil"}</dd></div></dl></article>

      <article className="panel-card settings-card" style={{gridColumn:"1 / -1"}}>
        <div><small>KURUMSAL KİMLİK</small><h3>Belge ve teklif görünümü</h3><p>Yüklenen logo ve kurumsal renk teklifler ile A4 PDF belgelerinde otomatik kullanılır.</p></div>
        <form className="panel-form" action={updateDocumentBranding}>
          <label className="wide">Logo URL<input name="logo_url" type="url" defaultValue={branding?.logo_url??""} placeholder="https://.../logo.png" disabled={!canManage}/></label>
          {branding?.logo_url?<div className="wide" style={{padding:"16px",border:"1px solid #e0e5e1",borderRadius:12}}><img src={branding.logo_url} alt="Kurum logosu" style={{maxWidth:220,maxHeight:80,objectFit:"contain"}}/></div>:null}
          <label>Kurumsal renk<input name="primary_color" type="color" defaultValue={branding?.primary_color??"#183f31"} disabled={!canManage}/></label>
          <label>E-posta<input name="contact_email" type="email" defaultValue={branding?.contact_email??""} disabled={!canManage}/></label>
          <label>Telefon<input name="contact_phone" defaultValue={branding?.contact_phone??""} disabled={!canManage}/></label>
          <label>Web sitesi<input name="website_url" type="url" defaultValue={branding?.website_url??""} disabled={!canManage}/></label>
          <label className="wide">Belge alt bilgisi<textarea name="document_footer" defaultValue={branding?.document_footer??""} placeholder="Kurum adresi, yasal bilgi veya kısa kurumsal açıklama" disabled={!canManage}/></label>
          {canManage?<div className="wide panel-form-actions"><button className="panel-primary">Kurumsal Kimliği Kaydet</button></div>:<small className="wide">Değişiklikler owner veya admin yetkisi gerektirir.</small>}
        </form>
      </article>

      <article className="panel-card settings-card"><div><small>EKİP VE ERİŞİM</small><h3>Kullanıcılar ve roller</h3><p>Personel, üyelik ve yetki kapsamını yönetin.</p></div><div className="settings-actions">{enabledCodes.has("hr") ? <Link className="panel-secondary" href="/panel/hr">İnsan Kaynakları</Link> : null}{enabledCodes.has("support") ? <Link className="panel-secondary" href="/panel/support">Destek Merkezi</Link> : null}</div></article>
      <article className="panel-card settings-card"><div><small>ENTEGRASYONLAR</small><h3>Bağlantılar</h3><p>Ödeme, banka, e-fatura ve alan adı bileşenleri.</p></div><div className="settings-module-list">{integrations.map((module) => <Link href={`/panel/${module.code}`} key={module.code}><span>{module.name}</span><b>›</b></Link>)}{!integrations.length ? <div className="panel-empty">Etkin entegrasyon bulunmuyor.</div> : null}</div></article>
      <article className="panel-card settings-card"><div><small>PAKET VE KAPSAM</small><h3>Aktif özellikler</h3><p>Kurumunuzda erişime açık modüller.</p></div><div className="settings-tags">{modules.map((module) => <span key={module.code}>{module.name}</span>)}</div></article>
    </section>
  </>;
}
