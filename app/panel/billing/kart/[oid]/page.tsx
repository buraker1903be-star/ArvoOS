import { notFound } from "next/navigation";
import Link from "next/link";
import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { kartSaklamaAcik, kurumKartFormu, OTOMATIK_YENILEME_ONAY_METNI, otomatikYenilemeAcik } from "@/lib/paytr-kart-akisi";
import { PAYTR_ODEME_ADRESI, paytrEpostasiUygunMu } from "@/lib/paytr-direkt";
import { KartFormu } from "./kart-formu";
import "../../../team.css";
import "../../../components/kayit-formu.css";
import "./kart-formu.css";

/*
  KARTLA ÖDEME SAYFASI (28.10.2026). Kayıt bir sunucu işlemiyle açılıyor
  (kart-actions.ts, kartlaOdemeyeBasla); bu sayfa yalnızca okuyor ve
  imzalı formu çiziyor. Kart alanlarını taşıyan form tarayıcıdan
  DOĞRUDAN PayTR'ye gider (lib/paytr-direkt.ts).
*/
export default async function KartOdemesiPage({ params }: { params: Promise<{ oid: string }> }) {
  if (!kartSaklamaAcik()) notFound();
  const { oid } = await params;
  const { supabase, organization, membership, izin, userId } = await getPanelContext();
  if (!membership || !izin("finance.lisans.yonet")) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; kartla ödeme açılamadı.");

  const [{ data: kullanici }, { data: profil }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("full_name,phone").eq("id", userId).maybeSingle(),
  ]);
  const eposta = kullanici.user?.email ?? "";
  if (!paytrEpostasiUygunMu(eposta)) {
    return <section className="panel-card management-card">
      <h1>Kartla ödeme</h1>
      <p className="panel-muted">Ödeme altyapısı Türkçe karakter içeren e-posta adreslerini kabul etmiyor. Hesabınızın e-posta adresini değiştirin ya da havale/EFT ile ödeyin.</p>
      <Link className="panel-secondary" href="/panel/billing">Ödeme ve Lisans&apos;a dön</Link>
    </section>;
  }
  const form = await kurumKartFormu(admin, { merchantOid: oid, organizationId: organization.id, actorEmail: eposta, actorName: profil?.full_name ?? null });
  if (!form) notFound();

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">KARTLA ÖDEME</small><h1>{form.baslik}</h1>
        <p>Kart bilgileriniz doğrudan PayTR&apos;nin güvenli ödeme altyapısına gönderilir; ArvoOS kart numaranızı görmez ve saklamaz.</p></div>
      <Link className="panel-secondary" href="/panel/billing">Vazgeç</Link>
    </div>
    <KartFormu
      odemeAdresi={PAYTR_ODEME_ADRESI}
      merchantOid={form.merchantOid}
      tutar={form.tutar}
      alanlar={form.alanlar}
      utoken={form.utoken}
      varsayilanAdres={form.varsayilan.adres}
      varsayilanTelefon={form.varsayilan.telefon || (profil?.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20)}
      onayMetni={otomatikYenilemeAcik() ? OTOMATIK_YENILEME_ONAY_METNI.replace(/^v\d+ · /, "") : ""}
    />
  </>;
}
