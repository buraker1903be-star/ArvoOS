import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { completeOnboarding } from "./actions";

export default async function OnboardingPage() {
  const { supabase, organization, membership } = await getPanelContext();
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/panel");

  const { data: onboarding } = await supabase
    .from("organization_onboarding")
    .select("legal_name,phone,website,logo_url,primary_color,completed_at")
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (onboarding?.completed_at) redirect("/panel");

  return <>
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">İLK KURULUM</small>
        <h1>Çalışma alanınızı hazırlayın</h1>
        <p>Kurum bilgilerini ve temel marka ayarlarını tamamlayarak ArvoOS çalışma alanını kullanıma açın.</p>
      </div>
      <span className="owner-badge">1 / 4 KURULUM</span>
    </div>

    <section className="panel-card management-card">
      <div className="management-heading">
        <div><small>KURUM VE MARKA</small><h2>Temel bilgiler</h2></div>
        <span className="status-pill">{organization.name}</span>
      </div>

      <form className="panel-form" action={completeOnboarding}>
        <label className="wide">Resmi kurum adı
          <input name="legal_name" defaultValue={onboarding?.legal_name ?? organization.name} minLength={2} maxLength={180} required />
        </label>
        <label>Telefon
          <input name="phone" defaultValue={onboarding?.phone ?? ""} placeholder="+90 212 000 00 00" />
        </label>
        <label>Web sitesi
          <input name="website" defaultValue={onboarding?.website ?? ""} placeholder="https://firma.com" />
        </label>
        <label className="wide">Logo adresi
          <input name="logo_url" defaultValue={onboarding?.logo_url ?? ""} placeholder="https://.../logo.svg" />
        </label>
        <label>Marka rengi
          <input name="primary_color" type="color" defaultValue={onboarding?.primary_color ?? "#111827"} />
        </label>
        <div className="wide management-submit">
          <small>Bu bilgiler daha sonra kurum ayarlarından değiştirilebilir.</small>
          <button className="panel-primary" type="submit">Kurulumu tamamla</button>
        </div>
      </form>
    </section>
  </>;
}
