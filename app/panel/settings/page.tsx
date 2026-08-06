import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { updateDocumentBranding, updateCustomDomain, checkCustomDomainStatus } from "./actions";

const roleNames: Record<string, string> = {owner:"Kurum Sahibi",admin:"Yönetici",manager:"Yönetici",member:"Satış Personeli",operasyoncu:"Operasyon Personeli"};
const integrationCodes = new Set(["banking","payments","e_invoice","billing","integrations","domains"]);
const domainStatusLabels: Record<string, string> = { pending: "Doğrulama bekleniyor", verified: "Doğrulandı", failed: "Doğrulanamadı" };

export default async function SettingsPage() {
  const { organization, membership, modules, supabase } = await getPanelContext();
  const enabledCodes = new Set(modules.map((module) => module.code));
  const integrations = modules.filter((module) => integrationCodes.has(module.code));
  const canManage = ["owner", "admin"].includes(membership.role);
  const {data:orgRow}=await supabase.from("organizations").select("logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url,custom_domain,custom_domain_status,custom_domain_verification").eq("id",membership.organization_id).single();
  const branding=orgRow;
  const domainInfo=orgRow;
  const dnsRecords = (domainInfo?.custom_domain_verification ?? []) as { type: string; name: string; value: string }[];

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">YÖNETİM</small><h1>Ayarlar</h1><p>Kurum, ekip, entegrasyon ve belge kimliğini tek yerden yönetin.</p></div><div className="panel-page-actions"><span className="status-pill">{roleNames[membership.role] ?? membership.role}</span></div></div>
    <section className="metric-strip"><article><div><small>PAKET</small><strong>{organization.plan_code.toUpperCase()}</strong><p>Aktif kurum paketi</p></div></article><article><div><small>MODÜL</small><strong>{modules.length}</strong><p>Etkin çalışma alanı</p></div></article><article><div><small>ENTEGRASYON</small><strong>{integrations.length}</strong><p>Etkin bağlantı alanı</p></div></article><article><div><small>DURUM</small><strong>{organization.status === "active" ? "Aktif" : organization.status}</strong><p>Kurum erişimi</p></div></article></section>

    <section className="settings-grid">
      <article className="panel-card settings-card"><div><small>KURUM</small><h3>Kurum bilgileri</h3><p>Temel çalışma alanı ve alan adı bilgileri.</p></div><dl className="settings-list"><div><dt>Kurum</dt><dd>{organization.name}</dd></div><div><dt>Sektör</dt><dd>{organization.sector || "Belirtilmedi"}</dd></div><div><dt>Çalışma alanı</dt><dd>{organization.slug}</dd></div></dl></article>

      <article className="panel-card settings-card">
        <div><small>ÖZEL ALAN ADI</small><h3>Kendi domain&apos;inizle çalışın</h3><p>Panelinize kendi alan adınızdan (örn. panel.firmaniz.com) erişilebilir hale getirin.</p></div>
        {canManage ? (
          <form className="panel-form" action={updateCustomDomain}>
            <label className="wide">Alan adı<input name="custom_domain" defaultValue={domainInfo?.custom_domain ?? ""} placeholder="panel.firmaniz.com" /></label>
            <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Kaydet ve Bağla</button></div>
          </form>
        ) : <p className="panel-empty">Bu ayarı değiştirme yetkiniz yok.</p>}
        {domainInfo?.custom_domain ? (
          <div className="domain-status-block">
            <div className="domain-status-row">
              <span>{domainInfo.custom_domain}</span>
              <span className={`status-pill domain-status-${domainInfo.custom_domain_status ?? "pending"}`}>{domainStatusLabels[domainInfo.custom_domain_status ?? "pending"] ?? "Bilinmiyor"}</span>
            </div>
            {domainInfo.custom_domain_status !== "verified" && dnsRecords.length ? (
              <div className="domain-dns-block">
                <small>DNS SAĞLAYICINIZA EKLEYİN</small>
                <table className="domain-dns-table"><thead><tr><th>Tür</th><th>Ad</th><th>Değer</th></tr></thead><tbody>
                  {dnsRecords.map((record, index) => <tr key={index}><td>{record.type}</td><td>{record.name}</td><td>{record.value}</td></tr>)}
                </tbody></table>
                <p>DNS değişikliklerinin yayılması birkaç dakika ile birkaç saat sürebilir.</p>
                {canManage ? <form action={checkCustomDomainStatus}><button className="panel-secondary" type="submit">Doğrulamayı Kontrol Et</button></form> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>

      <article className="panel-card settings-card" style={{gridColumn:"1 / -1"}}>
        <div><small>KURUMSAL KİMLİK</small><h3>Belge ve teklif görünümü</h3><p>Logo, renk, iletişim bilgileri ve kaşe-imza görseli A4 belgelerde otomatik kullanılır.</p></div>
        <form className="panel-form" action={updateDocumentBranding} encType="multipart/form-data">
          <label className="wide">Logo URL<input name="logo_url" type="url" defaultValue={branding?.logo_url??""} placeholder="https://.../logo.png" disabled={!canManage}/></label>
          {branding?.logo_url?<div className="wide" style={{padding:"16px",border:"1px solid var(--line)",borderRadius:12,background:"var(--surface)"}}><small style={{display:"block",marginBottom:10}}>LOGO ÖNİZLEME</small><img src={branding.logo_url} alt="Kurum logosu" style={{maxWidth:220,maxHeight:80,objectFit:"contain"}}/></div>:null}
          <label>Kurumsal renk<input name="primary_color" type="color" defaultValue={branding?.primary_color??"#183f31"} disabled={!canManage}/></label>
          <label>E-posta<input name="contact_email" type="email" defaultValue={branding?.contact_email??""} disabled={!canManage}/></label>
          <label>Telefon<input name="contact_phone" defaultValue={branding?.contact_phone??""} disabled={!canManage}/></label>
          <label>Web sitesi<input name="website_url" type="url" defaultValue={branding?.website_url??""} disabled={!canManage}/></label>

          <div className="wide" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(260px,.65fr)",gap:18,padding:"18px",border:"1px solid var(--line)",borderRadius:14,background:"var(--surface-2)"}}>
            <label style={{margin:0}}>Kaşe ve imza görseli
              <input name="signature_file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canManage}/>
              <small style={{display:"block",marginTop:8,color:"var(--muted)"}}>Şeffaf arka planlı PNG önerilir. En fazla 5 MB.</small>
            </label>
            <div style={{minHeight:150,border:"1px dashed var(--line)",borderRadius:12,background:"var(--surface)",display:"grid",placeItems:"center",padding:16,textAlign:"center"}}>
              {branding?.signature_stamp_url?<img src={branding.signature_stamp_url} alt="Kaşe ve imza önizlemesi" style={{maxWidth:"100%",maxHeight:135,objectFit:"contain"}}/>:<span style={{color:"var(--muted)",fontSize:13}}>Henüz kaşe-imza görseli yüklenmedi.</span>}
            </div>
            {branding?.signature_stamp_url?<label style={{gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:8,margin:0,fontWeight:600}}><input name="remove_signature" type="checkbox" disabled={!canManage} style={{width:18,height:18}}/>Mevcut kaşe-imza görselini kaldır</label>:null}
          </div>

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
