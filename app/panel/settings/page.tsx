import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";

const roleNames: Record<string, string> = {
  owner: "Kurum Sahibi",
  admin: "Kurum Yöneticisi",
  manager: "Birim Yöneticisi",
  member: "Ekip Üyesi",
};

const integrationCodes = new Set(["banking", "payments", "e_invoice", "billing", "integrations", "domains"]);

export default async function SettingsPage() {
  const { organization, membership, modules } = await getPanelContext();
  const enabledCodes = new Set(modules.map((module) => module.code));
  const integrations = modules.filter((module) => integrationCodes.has(module.code));
  const canManage = ["owner", "admin"].includes(membership.role);

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM</small><h1>Ayarlar</h1><p>Kurum, ekip, entegrasyon ve paket bilgilerini tek yerden yönetin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{roleNames[membership.role] ?? membership.role}</span></div>
    </div>

    <section className="metric-strip">
      <article><div><small>PAKET</small><strong>{organization.plan_code.toUpperCase()}</strong><p>Aktif kurum paketi</p></div></article>
      <article><div><small>MODÜL</small><strong>{modules.length}</strong><p>Etkin çalışma alanı</p></div></article>
      <article><div><small>ENTEGRASYON</small><strong>{integrations.length}</strong><p>Etkin bağlantı alanı</p></div></article>
      <article><div><small>DURUM</small><strong>{organization.status === "active" ? "Aktif" : organization.status}</strong><p>Kurum erişimi</p></div></article>
    </section>

    <section className="settings-grid">
      <article className="panel-card settings-card">
        <div><small>KURUM</small><h3>Kurum bilgileri</h3><p>Temel çalışma alanı ve alan adı bilgileri.</p></div>
        <dl className="settings-list">
          <div><dt>Kurum</dt><dd>{organization.name}</dd></div>
          <div><dt>Sektör</dt><dd>{organization.sector || "Belirtilmedi"}</dd></div>
          <div><dt>Çalışma alanı</dt><dd>{organization.slug}</dd></div>
          <div><dt>Özel alan adı</dt><dd>{organization.custom_domain || "Tanımlı değil"}</dd></div>
        </dl>
      </article>

      <article className="panel-card settings-card">
        <div><small>EKİP VE ERİŞİM</small><h3>Kullanıcılar ve roller</h3><p>Personel, üyelik ve yetki kapsamını yönetin.</p></div>
        <div className="settings-actions">
          {enabledCodes.has("hr") ? <Link className="panel-secondary" href="/panel/hr">İnsan Kaynakları</Link> : null}
          {enabledCodes.has("support") ? <Link className="panel-secondary" href="/panel/support">Destek Merkezi</Link> : null}
          {!canManage ? <small>Değişiklikler owner veya admin yetkisi gerektirir.</small> : null}
        </div>
      </article>

      <article className="panel-card settings-card">
        <div><small>ENTEGRASYONLAR</small><h3>Bağlantılar</h3><p>Ödeme, banka, e-fatura ve alan adı bileşenleri.</p></div>
        <div className="settings-module-list">
          {integrations.map((module) => <Link href={`/panel/${module.code}`} key={module.code}><span>{module.name}</span><b>›</b></Link>)}
          {!integrations.length ? <div className="panel-empty">Etkin entegrasyon bulunmuyor.</div> : null}
        </div>
      </article>

      <article className="panel-card settings-card">
        <div><small>PAKET VE KAPSAM</small><h3>Aktif özellikler</h3><p>Kurumunuzda erişime açık modüller.</p></div>
        <div className="settings-tags">{modules.map((module) => <span key={module.code}>{module.name}</span>)}</div>
      </article>
    </section>
  </>;
}
