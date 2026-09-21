import { getPanelContext } from "@/lib/panel-context";
import { ORGANIZATION_LEGAL_COLUMNS } from "@/app/_components/legal/organization";
import { updateDocumentBranding, updateCustomDomain, checkCustomDomainStatus } from "./actions";
import { LegalDetailsForm } from "./legal-details-form";
import { legalDetailsFrom, validateLegalDetails } from "./legal-details";
import { StgIcon, StgLinkRow, StgReadOnly, StgSection, StgValueRow, StgWidget, type StgTone } from "./settings-ui";
import { getPaytrStatus } from "@/lib/paytr-status";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { removePaytrSettings, savePaytrSettings } from "../finance/paytr-actions";
import { removeWhatsappAccount, saveWhatsappAccount, verifyWhatsappAccount } from "./whatsapp-actions";
import "./settings-legal.css";
import "./settings.css";

const roleNames: Record<string, string> = {owner:"Kurum Sahibi",admin:"Yönetici",manager:"Yönetici",member:"Satış Personeli",operasyoncu:"Operasyon Personeli"};
const integrationCodes = new Set(["banking","payments","e_invoice","billing","integrations","domains"]);
const domainStatusLabels: Record<string, string> = { pending: "Doğrulama bekleniyor", verified: "Doğrulandı", failed: "Doğrulanamadı" };
const domainStatusTones: Record<string, StgTone> = { pending: "warning", verified: "success", failed: "danger" };
// Kayıtlı renk yoksa panelin kendi vurgusu (şampanya) gösterilir. Eskiden
// varsayılan yeşildi (#183f31); rengi hiç seçilmemiş bir kurum formu
// kaydedince kuruma o yeşil yazılıyordu.
const DEFAULT_BRAND_COLOR = "#8e6d33";

const sections = [
  { id: "kurum", icon: "building", label: "Kurum" },
  { id: "ekip", icon: "users", label: "Ekip ve erişim" },
  { id: "resmi-bilgiler", icon: "doc", label: "Resmi bilgiler" },
  { id: "kurumsal-kimlik", icon: "palette", label: "Kurumsal kimlik" },
  { id: "alan-adi", icon: "globe", label: "Alan adı" },
  { id: "entegrasyonlar", icon: "plug", label: "Entegrasyonlar" },
  { id: "paket", icon: "box", label: "Paket" },
];

export default async function SettingsPage() {
  const { organization, membership, modules, supabase } = await getPanelContext();
  const enabledCodes = new Set(modules.map((module) => module.code));
  const integrations = modules.filter((module) => integrationCodes.has(module.code));
  const canManage = ["owner", "admin"].includes(membership.role);
  // PayTR mağaza bilgileri yalnızca sahip/yöneticiye (anahtarlar hiç okunmaz)
  const paytr = canManage ? await getPaytrStatus(membership.organization_id) : null;
  // WhatsApp da mağaza anahtarları gibi: yalnızca sahip/yönetici, anahtar hiç okunmaz.
  const whatsapp = canManage ? await getWhatsappStatus(membership.organization_id) : null;
  const paytrDate = (value: string | null) => (value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Henüz yok");
  const {data:orgRow}=await supabase.from("organizations").select("logo_url,primary_color,document_footer,contact_email,contact_phone,website_url,signature_stamp_url,custom_domain,custom_domain_status,custom_domain_verification").eq("id",membership.organization_id).single();
  // Resmi/banka alanları ayrı okunur: migration uygulanmadıysa sayfanın geri kalanı çalışmaya devam eder.
  const {data:legalRow,error:legalError}=await supabase.from("organizations").select(ORGANIZATION_LEGAL_COLUMNS).eq("id",membership.organization_id).maybeSingle();
  const legalAvailable=!legalError;
  const legal=legalDetailsFrom(legalAvailable?(legalRow as Record<string,unknown>|null):null);
  const legalFilled=[legal.legal_address,legal.legal_city,legal.tax_office,legal.tax_number,legal.iban].filter(Boolean).length;
  const legalComplete=legalFilled===5&&!Object.keys(validateLegalDetails(legal)).length;
  const branding=orgRow;
  const domainInfo=orgRow;
  const domainStatus=domainInfo?.custom_domain_status ?? "pending";
  const dnsRecords = (domainInfo?.custom_domain_verification ?? []) as { type: string; name: string; value: string }[];
  const isActive = organization.status === "active";

  const teamLinks = [
    enabledCodes.has("hr") ? { href: "/panel/hr", icon: "users", tone: "info" as const, title: "İnsan Kaynakları", note: "Personel, davetler ve roller" } : null,
    canManage ? { href: "/panel/settings/permissions", icon: "shield", tone: "success" as const, title: "Yetkilendirme", note: "Rollerin hangi modülleri göreceği" } : null,
    enabledCodes.has("support") ? { href: "/panel/support", icon: "support", tone: "gold" as const, title: "Destek Merkezi", note: "Destek talepleri ve yanıtlar" } : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);

  return <div className="stg">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">YÖNETİM</small><h1>Ayarlar</h1><p>Kurum kimliği, belge görünümü, erişim ve bağlantılar tek yerde.</p></div>
      <div className="panel-page-actions"><span className="status-pill" data-tone="gold">{roleNames[membership.role] ?? membership.role}</span>{canManage ? null : <StgReadOnly />}</div>
    </div>

    <section className="stg-widgets" aria-label="Kurum özeti">
      <StgWidget tone="gold" icon="box" label="Paket" value={organization.plan_code.toUpperCase()} note="Aktif kurum paketi" />
      <StgWidget tone="info" icon="grid" label="Modüller" value={modules.length} note={integrations.length ? `${integrations.length} entegrasyon alanı` : "Etkin çalışma alanı"} />
      <StgWidget tone={legalComplete ? "success" : "warning"} icon="doc" label="Belge kimliği" value={legalComplete ? "Hazır" : `${legalFilled}/5`} note={legalComplete ? "Teklif ve sözleşmeler için tamam" : "Resmi bilgiler eksik"} />
      <StgWidget tone={isActive ? "success" : "danger"} icon="shield" label="Kurum durumu" value={isActive ? "Aktif" : organization.status} note="Kurum erişimi" />
    </section>

    <nav className="stg-nav" aria-label="Ayar bölümleri">
      {sections.map((section) => <a key={section.id} href={`#${section.id}`}><StgIcon name={section.icon} size={16} />{section.label}</a>)}
    </nav>

    <div className="stg-grid">
      <StgSection id="kurum" icon="building" tone="info" kicker="KURUM" title="Kurum bilgileri" description="Çalışma alanınızın temel kimliği.">
        <dl className="stg-list">
          <StgValueRow label="Kurum" value={organization.name} />
          <StgValueRow label="Sektör" value={organization.sector} />
          <StgValueRow label="Çalışma alanı" value={organization.slug} mono />
          <StgValueRow label="Ticari unvan" value={legal.legal_name} />
          <StgValueRow label="Vergi no" value={legal.tax_number} mono />
        </dl>
      </StgSection>

      <StgSection id="ekip" icon="users" tone="gold" kicker="EKİP VE ERİŞİM" title="Kullanıcılar ve roller" description="Personel, davetler ve rollerin modül erişimi.">
        {teamLinks.length
          ? <div className="stg-list">{teamLinks.map((link) => <StgLinkRow key={link.href} {...link} />)}</div>
          : <p className="stg-muted"><StgIcon name="lock" size={16} />Bu alanlara erişiminiz yok.</p>}
      </StgSection>

      <StgSection
        id="resmi-bilgiler" wide icon="doc" tone={legalComplete ? "success" : "warning"}
        kicker="RESMİ BİLGİLER VE BANKA" title="Teklif ve sözleşmedeki kurum kimliği"
        description="Ticari unvan, adres, vergi kimliği ve banka hesabı; teklif ve sözleşmelerde taraf bilgisi, havale/EFT ödeme maddesi, tebligat adresi ve yetkili mahkeme olarak kullanılır."
        aside={<span className={legalComplete ? "slg-status is-complete" : "slg-status"}><i />{legalComplete ? "Belgeler için tamam" : `${legalFilled}/5 zorunlu alan dolu`}</span>}
      >
        <LegalDetailsForm initial={legal} canManage={canManage} available={legalAvailable} organizationName={organization.name} contactEmail={branding?.contact_email ?? null} contactPhone={branding?.contact_phone ?? null} />
      </StgSection>

      <StgSection
        id="kurumsal-kimlik" wide icon="palette" tone="gold"
        kicker="KURUMSAL KİMLİK" title="Belge ve teklif görünümü"
        description="Logo, renk, iletişim bilgileri ve kaşe-imza görseli A4 belgelerde otomatik kullanılır."
        aside={canManage ? null : <StgReadOnly />}
      >
        <form className="panel-form" action={updateDocumentBranding}>
          <div className="wide stg-signature">
            <label>Logo
              <input name="logo_file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canManage} />
              <small>PNG, JPG veya WEBP, en fazla 5 MB. Şeffaf arka planlı yatay logo önerilir. Teklif ve sözleşmelerin üst bilgisinde görünür.</small>
            </label>
            <div className="stg-signature-preview">
              {branding?.logo_url ? <img src={branding.logo_url} alt="Kurum logosu" /> : <span>Henüz logo yüklenmedi.</span>}
            </div>
          </div>
          <label className="wide">Logo adresi (URL) <small className="stg-optional">dosya yüklemek yerine</small><input name="logo_url" type="url" defaultValue={branding?.logo_url ?? ""} placeholder="https://.../logo.png" disabled={!canManage} /></label>
          <label>Kurumsal renk<span className="stg-color"><input name="primary_color" type="color" defaultValue={branding?.primary_color ?? DEFAULT_BRAND_COLOR} disabled={!canManage} /><small>Belge başlıkları ve vurgular</small></span></label>
          <label>E-posta<input name="contact_email" type="email" defaultValue={branding?.contact_email ?? ""} disabled={!canManage} /></label>
          <label>Telefon<input name="contact_phone" defaultValue={branding?.contact_phone ?? ""} disabled={!canManage} /></label>
          <label>Web sitesi<input name="website_url" type="url" defaultValue={branding?.website_url ?? ""} disabled={!canManage} /></label>

          <div className="wide stg-signature">
            <label>Kaşe ve imza görseli
              <input name="signature_file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canManage} />
              <small>Şeffaf arka planlı PNG önerilir. En fazla 5 MB.</small>
            </label>
            <div className="stg-signature-preview">
              {branding?.signature_stamp_url ? <img src={branding.signature_stamp_url} alt="Kaşe ve imza önizlemesi" /> : <span>Henüz kaşe-imza görseli yüklenmedi.</span>}
            </div>
            {branding?.signature_stamp_url ? <label className="stg-check"><input name="remove_signature" type="checkbox" disabled={!canManage} />Mevcut kaşe-imza görselini kaldır</label> : null}
          </div>

          <label className="wide">Belge alt bilgisi<textarea name="document_footer" defaultValue={branding?.document_footer ?? ""} placeholder="Kısa kurumsal açıklama veya yasal not. Adres ve vergi bilgileri “Resmi bilgiler ve banka” bölümünden gelir; o bölüm boşsa bu metin adres yerine kullanılır." disabled={!canManage} /></label>
          {canManage ? <div className="wide panel-form-actions"><button className="panel-primary">Kurumsal Kimliği Kaydet</button></div> : null}
        </form>
      </StgSection>

      <StgSection
        id="alan-adi" icon="globe" tone="info"
        kicker="ÖZEL ALAN ADI" title="Kendi alan adınızla çalışın"
        description="Panelinize kendi alan adınızdan (örn. panel.firmaniz.com) erişin."
        aside={domainInfo?.custom_domain ? <span className="status-pill" data-tone={domainStatusTones[domainStatus] ?? "neutral"}>{domainStatusLabels[domainStatus] ?? "Bilinmiyor"}</span> : null}
      >
        {canManage ? (
          <form className="panel-form" action={updateCustomDomain}>
            <label className="wide">Alan adı<input name="custom_domain" defaultValue={domainInfo?.custom_domain ?? ""} placeholder="panel.firmaniz.com" /></label>
            <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Kaydet ve Bağla</button></div>
          </form>
        ) : <p className="stg-muted"><StgIcon name="lock" size={16} />Bu ayarı yalnızca kurum sahibi veya yönetici değiştirebilir.</p>}
        {domainInfo?.custom_domain && domainStatus !== "verified" && dnsRecords.length ? (
          <div className="domain-dns-block">
            <small>DNS SAĞLAYICINIZA EKLEYİN · {domainInfo.custom_domain}</small>
            <table className="domain-dns-table"><thead><tr><th>Tür</th><th>Ad</th><th>Değer</th></tr></thead><tbody>
              {dnsRecords.map((record, index) => <tr key={index}><td>{record.type}</td><td>{record.name}</td><td>{record.value}</td></tr>)}
            </tbody></table>
            <p>DNS değişikliklerinin yayılması birkaç dakika ile birkaç saat sürebilir.</p>
            {canManage ? <form action={checkCustomDomainStatus}><button className="panel-secondary" type="submit">Doğrulamayı Kontrol Et</button></form> : null}
          </div>
        ) : null}
      </StgSection>

      <StgSection id="entegrasyonlar" icon="plug" tone="neutral" kicker="ENTEGRASYONLAR" title="Bağlantılar" description="Ödeme, banka, e-fatura ve alan adı bileşenleri.">
        {paytr ? (
          <div className="stg-paytr">
            <div className="stg-paytr-head">
              <div><b>PayTR ile tahsilat</b><small>Taksit için tek kullanımlık ödeme bağlantısı; ödeme gelince tahsilat cariye kendiliğinden işlenir.</small></div>
              <span className="status-pill" data-tone={paytr.connected ? (paytr.enabled ? "success" : "warning") : "neutral"}>{paytr.connected ? (paytr.enabled ? `Bağlı · ${paytr.merchantHint}` : "Kapalı") : "Bağlı değil"}</span>
            </div>
            {paytr.available ? (
              <form className="panel-form" action={savePaytrSettings}>
                <label>Mağaza numarası (merchant_id)<input name="merchant_id" inputMode="numeric" pattern="[0-9]{3,20}" required defaultValue={paytr.merchantId ?? ""} autoComplete="off" /></label>
                <label>Mağaza parolası (merchant_key)<input name="merchant_key" type="password" autoComplete="new-password" required={!paytr.connected} placeholder={paytr.connected ? "Değiştirmek için yeni değeri girin" : ""} /></label>
                <label>Gizli anahtar (merchant_salt)<input name="merchant_salt" type="password" autoComplete="new-password" required={!paytr.connected} placeholder={paytr.connected ? "Değiştirmek için yeni değeri girin" : ""} /></label>
                <label className="wide stg-check"><input name="is_enabled" type="checkbox" defaultChecked={!paytr.connected || paytr.enabled} />Taksitler için PayTR ödeme bağlantısı oluşturulabilsin</label>
                <p className="wide stg-paytr-note">Bu bilgiler PayTR Mağaza Paneli → Destek &amp; Kurulum → Entegrasyon Bilgileri&apos;nde yer alır. Mağazanızda &quot;Link ile Ödeme&quot; özelliğinin açık olması gerekir. Parola ve gizli anahtar şifreli saklanır, ekranda bir daha gösterilmez.</p>
                <div className="wide panel-form-actions"><button className="panel-primary" type="submit">{paytr.connected ? "Güncelle" : "PayTR'yi bağla"}</button></div>
              </form>
            ) : (
              <p className="stg-muted"><StgIcon name="lock" size={16} />PayTR için sunucu şifreleme anahtarı henüz tanımlanmadı. Platform yöneticisi PAYMENT_CREDENTIALS_KEY değerini ekleyince bu alan açılır.</p>
            )}
            {paytr.connected ? (
              <div className="stg-paytr-foot">
                <span>Son test ödemesi: <b>{paytrDate(paytr.lastTestPaymentAt)}</b></span>
                <span>Son tahsilat: <b>{paytrDate(paytr.lastPaymentAt)}</b></span>
                <form action={removePaytrSettings}><button className="panel-secondary" type="submit">Bağlantıyı kaldır</button></form>
              </div>
            ) : null}
          </div>
        ) : null}
        {whatsapp ? (
          <div className="stg-paytr">
            <div className="stg-paytr-head">
              <div>
                <b>WhatsApp ile mesaj</b>
                <small>Kendi WhatsApp Business numaranızı bağlayın; teklif, sözleşme, sipariş ve randevu mesajları müşterinize sizin numaranızdan gitsin.</small>
              </div>
              <span className="status-pill" data-tone={whatsapp.connected ? (whatsapp.status === "connected" ? "success" : "warning") : "neutral"}>
                {whatsapp.connected ? (whatsapp.status === "connected" ? `Bağlı · ${whatsapp.displayPhone ?? whatsapp.phoneNumberId}` : "Doğrulanamadı") : "Bağlı değil"}
              </span>
            </div>
            {whatsapp.available ? (
              <form className="panel-form" action={saveWhatsappAccount}>
                <label>WhatsApp Business hesap kimliği (WABA ID)<input name="waba_id" inputMode="numeric" required defaultValue={whatsapp.wabaId ?? ""} autoComplete="off" /></label>
                <label>Numara kimliği (phone number ID)<input name="phone_number_id" inputMode="numeric" required defaultValue={whatsapp.phoneNumberId ?? ""} autoComplete="off" /></label>
                <label className="wide">Kalıcı erişim anahtarı<input name="access_token" type="password" autoComplete="new-password" required placeholder={whatsapp.connected ? "Değiştirmek için yeni anahtarı girin" : ""} /></label>
                <p className="wide stg-paytr-note">
                  Bu değerler Meta Business → WhatsApp Manager → API Kurulumu ekranında yer alır. Anahtar şifreli saklanır, ekranda bir daha gösterilmez.
                  Bağlarken numara Meta&apos;ya sorulur; anahtar yanlışsa kayıt hiç yazılmaz. Numara bağlamayan kurumların mesajları Arvo&apos;nun ortak numarasından gider.
                </p>
                <div className="wide panel-form-actions"><button className="panel-primary" type="submit">{whatsapp.connected ? "Güncelle" : "Numarayı bağla"}</button></div>
              </form>
            ) : (
              <p className="stg-muted"><StgIcon name="lock" size={16} />WhatsApp için sunucu şifreleme anahtarı henüz tanımlanmadı. Platform yöneticisi PAYMENT_CREDENTIALS_KEY değerini ekleyince bu alan açılır.</p>
            )}
            {whatsapp.connected ? (
              <div className="stg-paytr-foot">
                <span>İşletme adı: <b>{whatsapp.verifiedName ?? "—"}</b></span>
                <span>Son doğrulama: <b>{paytrDate(whatsapp.lastVerifiedAt)}</b></span>
                <form action={verifyWhatsappAccount}><button className="panel-secondary" type="submit">Yeniden doğrula</button></form>
                <form action={removeWhatsappAccount}><button className="panel-secondary" type="submit">Bağlantıyı kaldır</button></form>
              </div>
            ) : null}
            {whatsapp.lastError ? <p className="stg-muted"><StgIcon name="lock" size={16} />Son hata: {whatsapp.lastError}</p> : null}
          </div>
        ) : null}
        {integrations.length
          ? <div className="stg-list">{integrations.map((module) => <StgLinkRow key={module.code} href={`/panel/${module.code}`} icon="plug" tone="info" title={module.name} note="Etkin" />)}</div>
          : <div className="stg-empty"><StgIcon name="plug" size={22} /><p>Etkin entegrasyon bulunmuyor.</p></div>}
      </StgSection>

      <StgSection id="paket" wide icon="box" tone="gold" kicker="PAKET VE KAPSAM" title="Aktif modüller" description={`${organization.plan_code.toUpperCase()} paketinde erişime açık ${modules.length} modül.`}>
        <div className="stg-tags">{modules.map((module) => <span key={module.code}><StgIcon name="check" size={14} />{module.name}</span>)}</div>
      </StgSection>
    </div>
  </div>;
}
