import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { StgIcon, StgSection } from "../settings/settings-ui";
import { completeOnboarding } from "./actions";
import "../settings/settings.css";
import "../platform/platform.css";

// Kayıtlı renk yoksa panelin kendi vurgusu (Ayarlar'daki varsayılanla aynı)
const DEFAULT_BRAND_COLOR = "#8e6d33";

export default async function OnboardingPage() {
  const { supabase, organization, membership } = await getPanelContext();
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/panel");

  const { data: onboarding } = await supabase
    .from("organization_onboarding")
    .select("legal_name,phone,website,logo_url,primary_color,completed_at")
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (onboarding?.completed_at) redirect("/panel");

  const brandName = organization.display_name || organization.name;

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">İLK KURULUM</small>
        <h1>{brandName} çalışma alanına hoş geldiniz</h1>
        <p>Birkaç temel bilgiyle panelinizi hazırlayın. Hepsi sonradan Ayarlar’dan değiştirilebilir.</p>
      </div>
    </div>

    <div className="plt-onboard">
      <StgSection id="kurum" wide icon="building" tone="gold" kicker="1 · KURUM VE MARKA" title="Temel bilgiler" description="Teklif ve sözleşmelerinizde, müşteri takip ekranında bu bilgiler kullanılır.">
        <form className="panel-form" action={completeOnboarding}>
          <label className="wide">Resmi kurum adı
            <input name="legal_name" defaultValue={onboarding?.legal_name ?? organization.name} minLength={2} maxLength={180} required autoComplete="organization" />
          </label>
          <label>Telefon
            <input name="phone" defaultValue={onboarding?.phone ?? ""} placeholder="+90 212 000 00 00" autoComplete="tel" />
          </label>
          <label>Web sitesi
            <input name="website" defaultValue={onboarding?.website ?? ""} placeholder="https://firma.com" inputMode="url" />
          </label>
          <label className="wide">Logo adresi <small className="plt-optional">isteğe bağlı</small>
            <input name="logo_url" defaultValue={onboarding?.logo_url ?? ""} placeholder="https://.../logo.png" inputMode="url" />
          </label>
          <label>Marka rengi
            <span className="stg-color"><input name="primary_color" type="color" defaultValue={onboarding?.primary_color && onboarding.primary_color !== "#111827" ? onboarding.primary_color : DEFAULT_BRAND_COLOR} /><small>Belge başlıkları ve vurgular</small></span>
          </label>
          <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Kurulumu tamamla ve panele geç</button></div>
        </form>
      </StgSection>

      <StgSection id="sonra" wide icon="check" tone="info" kicker="2 · SONRAKİ ADIMLAR" title="Panele girdikten sonra" description="Bu adımları istediğiniz zaman tamamlayabilirsiniz.">
        <ol className="plt-checks">
          <li className="is-todo"><span className="plt-check-dot" aria-hidden="true" /><span><b>Resmi bilgiler ve banka hesabı</b><small>Ayarlar → Resmi bilgiler: adres, vergi bilgileri ve IBAN teklif ve sözleşmelere otomatik yazılır.</small></span></li>
          <li className="is-todo"><span className="plt-check-dot" aria-hidden="true" /><span><b>Kaşe ve imza görseli</b><small>Ayarlar → Kurumsal kimlik: sözleşmelerde hizmet sağlayıcı imzası olarak görünür.</small></span></li>
          <li className="is-todo"><span className="plt-check-dot" aria-hidden="true" /><span><b>Ekibinizi davet edin</b><small>İnsan Kaynakları: satış ve operasyon personelini ekleyin, rollerini seçin.</small></span></li>
          <li className="is-todo"><span className="plt-check-dot" aria-hidden="true" /><span><b>İlk talebinizi girin</b><small>CRM’de talep oluşturun; teklif, sözleşme ve takip süreci oradan başlar.</small></span></li>
        </ol>
        <p className="stg-muted"><StgIcon name="support" size={16} />Takıldığınız bir yer olursa Destek Merkezi’nden bize yazabilirsiniz.</p>
      </StgSection>
    </div>
  </div>;
}
