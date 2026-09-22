import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { URUN_KOTALARI, urunKotalari } from "@/lib/urun-kotasi";
import { urunKullanimi } from "@/lib/urun-kullanimi";
import { StgIcon, StgSection, StgWidget } from "../../settings/settings-ui";
import { LISANS_TONU, depolama, kullanimTonu, sayi, tarih, tarihDegeri, yuzde } from "../bicim";
import { resetOrganizationAiCredits, updateOrganizationLicense, updateProductLicense } from "./actions";
import "../../settings/settings.css";
import "../platform.css";

type OrganizationRow = { id: string; name: string; display_name: string | null; slug: string; plan_code: string; status: string };
type LicenseRow = {
  organization_id: string;
  plan_code: string;
  license_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  user_limit: number;
  storage_limit_mb: number;
  ai_credit_limit: number;
  ai_credits_used: number;
  monthly_fee: number | null;
  suspended_at: string | null;
  suspension_reason: string | null;
};

type ProductLicenseRow = {
  limits?: Record<string, unknown> | null;
  product: string;
  status: string;
  plan_code: string | null;
  monthly_fee: number | null;
  current_period_end: string | null;
  suspension_reason: string | null;
};

/**
 * Tek bir kotanın ölçeri: etiket, oran ve çubuk.
 *
 * Üç limit daha önce tek satırlık bir şeritte yalnızca sayı olarak
 * duruyordu ("180 / 200") ve doluluğu gözün hesaplaması gerekiyordu.
 */
function Olcum({ etiket, kullanilan, limit, oran }: { etiket: string; kullanilan: string; limit: string; oran: number }) {
  return (
    <div className="plt-olcum">
      <div className="plt-olcum-bas">
        <b>{etiket}</b>
        <span>{kullanilan} / {limit} · %{oran}</span>
      </div>
      {/* Sıfır kullanımda bile ince bir iz kalıyor: bomboş bir çubuk,
          ölçerin çizilmediği izlenimi veriyordu. */}
      <span className="plt-meter is-wide" data-tone={kullanimTonu(oran)}><i style={{ width: `${Math.max(oran, 2)}%` }} /></span>
    </div>
  );
}

export default async function LicenseManagementPage({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const { supabase, organization: founderOrganization, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const params = await searchParams;
  const adminClient = createAdminClient();
  /* Kurum listesi yalnızca seçili kiracıyı bulmak için; liste görünümü
     kiracı dosyasında. */
  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations").select("id,name,display_name,slug,plan_code,status").order("name");
  if (organizationError) throw new Error("Kurum listesi okunamadı.");

  const organizations = (organizationData ?? []) as OrganizationRow[];

  const selected = organizations.find((item) => item.id === params.organization)
    ?? organizations.find((item) => item.id === founderOrganization.id)
    ?? organizations[0];
  if (!selected) throw new Error("Yönetilecek kurum bulunamadı.");

  const [{ data: licenseData, error: licenseError }, { count: activeUsers }, { data: productLicenseData }] = await Promise.all([
    supabase.from("organization_licenses").select("*").eq("organization_id", selected.id).maybeSingle(),
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", selected.id).eq("is_active", true),
    supabase.from("organization_product_licenses").select("product,status,plan_code,monthly_fee,current_period_end,suspension_reason,limits").eq("organization_id", selected.id),
  ]);
  if (licenseError) throw new Error(`Lisans okunamadı: ${licenseError.message}`);
  const license = licenseData as LicenseRow | null;
  if (!license) throw new Error("Kurum lisansı bulunamadı. Migration ve lisans backfill işlemini kontrol edin.");

  const productLicenses = new Map(((productLicenseData ?? []) as ProductLicenseRow[]).map((row) => [row.product, row]));
  /*
    Depolama kullanımı: limit tek başına bir şey anlatmıyor. Bu sayfada
    "512000 MB" yazıyordu ve karşılığı yoktu; artık kullanımıyla birlikte.
  */
  const { data: depolamalar } = adminClient ? await adminClient.rpc("arvo_storage_usage") : { data: [] };
  const depolamaMb = Math.ceil(
    Number(((depolamalar ?? []) as { organization_id: string; bytes: number }[])
      .find((row) => row.organization_id === selected.id)?.bytes ?? 0) / (1024 * 1024),
  );

  /*
    Ürün kullanımı: kota alanlarının yanında "şu an ne kadar" yazabilmek
    için. Limit tek başına bir şey anlatmıyor.
  */
  const kullanim = await urunKullanimi(selected.id);
  const kotaSatirlari: Record<string, ReturnType<typeof urunKotalari>> = Object.fromEntries(
    ADDON_PRODUCTS.map((urun) => [
      urun.code,
      urunKotalari(urun.code, productLicenses.get(urun.code)?.limits, ({ arvolab: kullanim.arvolab, randevu: kullanim.randevu } as Record<string, Record<string, number | null> | null>)[urun.code]),
    ]),
  );

  const users = activeUsers ?? 0;
  const userPercent = yuzde(users, license.user_limit);
  const storagePercent = yuzde(depolamaMb, license.storage_limit_mb);
  const aiPercent = yuzde(license.ai_credits_used, license.ai_credit_limit);
  const label = selected.display_name || selected.name;
  const durumTonu = LISANS_TONU[license.license_status] ?? "neutral";
  const durumAdi = productLicenseLabels[license.license_status] ?? license.license_status;
  // Açık abonelik = ücret tahsil edilen ya da denemede olan ek ürün.
  const acikUrunler = ADDON_PRODUCTS.filter((urun) => ["active", "trialing", "past_due"].includes(productLicenses.get(urun.code)?.status ?? "inactive"));

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">KİRACI · {label}</small><h1>Lisans ve kota</h1><p>Paket, kullanım limitleri, deneme süresi ve erişim durumu.</p></div>
      <div className="panel-page-actions"><Link className="panel-secondary" href={`/panel/platform?organization=${selected.id}`}>Kiracı dosyasına dön</Link></div>
    </div>

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "kota aşımı yok"
      demek, satırın hiç olmamasından daha çok şey söyler.

      Çapraz kota listesi burada değil: aynı uyarı kiracı listesinin
      rozetinde duruyor (limiti aşan kırmızı, yaklaşan sarı). Aynı bilgiyi
      iki yerde göstermek, birini güncelleyip diğerini unutmak demek.
    */}
    <div className="stg-widgets" aria-label={`${label} lisans özeti`}>
      <StgWidget
        tone={durumTonu} icon="box" label="Lisans" value={durumAdi}
        note={license.license_status === "trialing"
          ? `Deneme bitişi ${tarih(license.trial_ends_at)}`
          : license.current_period_end ? `Dönem sonu ${tarih(license.current_period_end)}` : "Dönem sonu girilmedi"}
      />
      <StgWidget
        tone={kullanimTonu(userPercent)} icon="users" label="Kullanıcı"
        value={`${users} / ${sayi(license.user_limit)}`} note={`%${userPercent} dolu`}
      />
      <StgWidget
        tone={kullanimTonu(storagePercent)} icon="folder" label="Depolama"
        value={depolama(depolamaMb)} note={`Limit ${depolama(license.storage_limit_mb)} · %${storagePercent} dolu`}
      />
      <StgWidget
        tone={kullanimTonu(aiPercent)} icon="chart" label="AI kredisi"
        value={sayi(license.ai_credits_used)} note={`Limit ${sayi(license.ai_credit_limit)} · %${aiPercent} dolu`}
      />
    </div>

    <div className="stg-grid">
      <StgSection
        id="kullanim" wide icon="chart" tone="info" kicker="KOTA" title="Şu anki kullanım"
        description="Ölçümler canlı: kullanıcı sayısı üyeliklerden, depolama dosya deposundan, AI kredisi lisans kaydından geliyor."
        aside={<span className="status-pill" data-tone={kullanimTonu(Math.max(userPercent, storagePercent, aiPercent))}>En dolu kota %{Math.max(userPercent, storagePercent, aiPercent)}</span>}
      >
        <div className="plt-olcumler">
          <Olcum etiket="Kullanıcı" kullanilan={sayi(users)} limit={sayi(license.user_limit)} oran={userPercent} />
          <Olcum etiket="Depolama" kullanilan={depolama(depolamaMb)} limit={depolama(license.storage_limit_mb)} oran={storagePercent} />
          <Olcum etiket="AI kredisi" kullanilan={sayi(license.ai_credits_used)} limit={sayi(license.ai_credit_limit)} oran={aiPercent} />
        </div>
        {license.suspension_reason ? <p className="stg-muted"><StgIcon name="lock" size={16} />{license.suspension_reason}</p> : null}
        {/* Sıfırlama, ölçerlerin altında: kurucu önce ne kadar tüketildiğini
            görüp sonra karar veriyor. Kart köşesindeki bir düğme, okumadan
            basılan bir düğme olurdu. */}
        <form action={resetOrganizationAiCredits}>
          <input type="hidden" name="organization_id" value={selected.id} />
          <div className="plt-islem-notlu">
            <small className="plt-field-note">Yeni fatura ya da kullanım dönemi başlarken tüketilen AI kredilerini sıfırlayın.</small>
            <button className="panel-secondary" type="submit">AI kullanımını sıfırla</button>
          </div>
        </form>
      </StgSection>

      <StgSection
        id="lisans" wide icon="box" tone={durumTonu}
        kicker={selected.slug} title={`${label} · lisans politikası`}
        description="Askıya alınan ya da iptal edilen kurumun panel erişimi kurum durumuyla birlikte kapatılır."
        aside={<span className="status-pill" data-tone={durumTonu}>{durumAdi}</span>}
      >
        <form className="panel-form" action={updateOrganizationLicense}>
          <input type="hidden" name="organization_id" value={selected.id} />
          <label>Paket<select name="plan_code" defaultValue={license.plan_code}><option value="starter">Başlangıç</option><option value="professional">Profesyonel</option><option value="enterprise">Kurumsal</option></select></label>
          <label>Lisans durumu<select name="license_status" defaultValue={license.license_status}><option value="trialing">Deneme</option><option value="active">Aktif</option><option value="past_due">Ödeme gecikmiş</option><option value="suspended">Askıda</option><option value="canceled">İptal</option></select></label>
          <label>Deneme bitişi<input name="trial_ends_at" type="date" defaultValue={tarihDegeri(license.trial_ends_at)} /></label>
          <label>Dönem bitişi<input name="current_period_end" type="date" defaultValue={tarihDegeri(license.current_period_end)} /></label>
          <label>Kullanıcı limiti<input name="user_limit" type="number" min={1} defaultValue={license.user_limit} required /><small className="plt-field-note">şu an {sayi(users)} aktif üye</small></label>
          <label>Depolama limiti (MB)<input name="storage_limit_mb" type="number" min={1} defaultValue={license.storage_limit_mb} required /><small className="plt-field-note">şu an {depolama(depolamaMb)} · limit {depolama(license.storage_limit_mb)}</small></label>
          <label>AI kredi limiti<input name="ai_credit_limit" type="number" min={0} defaultValue={license.ai_credit_limit} required /><small className="plt-field-note">şu an {sayi(license.ai_credits_used)} kredi kullanıldı</small></label>
          <label>Aylık ücret (TL)<input name="monthly_fee" type="number" min={1} step="0.01" defaultValue={license.monthly_fee ? Number(license.monthly_fee) / 100 : ""} placeholder="Kartla ödeme tutarı · boşsa kapalı" /></label>
          <label className="wide">Askıya alma nedeni<input name="suspension_reason" defaultValue={license.suspension_reason ?? ""} placeholder="Yalnızca askıya alındığında kullanılır" /></label>
          <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Lisansı kaydet</button></div>
        </form>
      </StgSection>

      {/*
        Ek ürün abonelikleri yan yana. Her biri beş alanlık kısa bir form
        ama tam genişlikte duruyordu: üç ürünü görmek için ekran boyu
        kaydırmak gerekiyordu ve ürün sayısı arttıkça sayfa uzayacaktı.
        ArvoOS çekirdek lisansı geniş kalıyor — dokuz alanı var ve iki
        sütunlu formu dar kartta okunmaz oluyor.
      */}
      <section className="stg-card is-wide" aria-labelledby="ek-urunler-title">
        <header className="stg-card-head">
          <span className="stg-card-icon" data-tone="gold"><StgIcon name="grid" size={20} /></span>
          <div className="stg-card-title">
            <small>EK ÜRÜNLER</small>
            <h2 id="ek-urunler-title">{label} abonelikleri</h2>
            <p>Her ürünün kendi durumu, ücreti ve kotası var. Aylık ücret girilmezse kurum o ürünü kartla ödeyemez.</p>
          </div>
          <div className="stg-card-aside">
            <span className="status-pill" data-tone={acikUrunler.length ? "success" : "neutral"}>
              {acikUrunler.length} / {ADDON_PRODUCTS.length} açık
            </span>
          </div>
        </header>
        <div className="plan-izgara">
          {ADDON_PRODUCTS.map((product) => {
            const row = productLicenses.get(product.code);
            const status = row?.status ?? "inactive";
            return (
              <StgSection
                key={product.code} id={`urun-${product.code}`} icon="box" tone={LISANS_TONU[status] ?? "neutral"}
                kicker={product.name.toLocaleUpperCase("tr-TR")} title={`${product.name} aboneliği`}
                description={product.description}
                aside={<span className="status-pill" data-tone={LISANS_TONU[status] ?? "neutral"}>{productLicenseLabels[status] ?? status}</span>}
              >
                <form className="panel-form" action={updateProductLicense}>
                  <input type="hidden" name="organization_id" value={selected.id} />
                  <input type="hidden" name="product" value={product.code} />
                  <label>Durum<select name="status" defaultValue={status}><option value="inactive">Kapalı</option><option value="trialing">Deneme</option><option value="active">Aktif</option><option value="past_due">Ödeme gecikmiş</option><option value="suspended">Askıda</option><option value="canceled">İptal</option></select></label>
                  <label>Paket<select name="plan_code" defaultValue={row?.plan_code ?? ""}><option value="">Belirtilmedi</option><option value="starter">Başlangıç</option><option value="professional">Profesyonel</option><option value="enterprise">Kurumsal</option></select></label>
                  <label>Aylık ücret (TL)<input name="monthly_fee" type="number" min={1} step="0.01" defaultValue={row?.monthly_fee ? Number(row.monthly_fee) / 100 : ""} placeholder="Kartla ödeme tutarı · boşsa kapalı" /></label>
                  <label>Dönem bitişi<input name="current_period_end" type="date" defaultValue={tarihDegeri(row?.current_period_end ?? null)} /></label>
                  {/* Kota alanları yalnızca ÖLÇÜMÜ YAZILMIŞ ürünlerde
                      çiziliyor. Ölçümsüz limit, kurucunun koruma sandığı
                      boş bir sayı olurdu — storage_limit_mb dersi. */}
                  {(URUN_KOTALARI[product.code] ?? []).map((alan) => {
                    const olcum = kotaSatirlari[product.code]?.find((satir) => satir.alan.anahtar === alan.anahtar);
                    return (
                      <label key={alan.anahtar}>
                        {alan.etiket} limiti ({alan.birim})
                        <input
                          name={`kota_${alan.anahtar}`}
                          type="number"
                          min={1}
                          defaultValue={olcum?.limit ?? ""}
                          placeholder="Boşsa sınırsız"
                        />
                        <small className="kota-olcum" data-tone={olcum?.asildi ? "danger" : undefined}>
                          {olcum?.kullanilan === null || olcum?.kullanilan === undefined
                            ? "kullanım ölçülemedi"
                            : `şu an ${sayi(olcum.kullanilan)} ${alan.birim}${alan.donemsel ? " (bu ay)" : ""}`}
                        </small>
                      </label>
                    );
                  })}
                  <label className="wide">Askıya alma nedeni<input name="suspension_reason" defaultValue={row?.suspension_reason ?? ""} placeholder="Yalnızca askıya alındığında kullanılır" /></label>
                  <div className="wide panel-form-actions"><button className="panel-primary" type="submit">{product.name} lisansını kaydet</button></div>
                </form>
              </StgSection>
            );
          })}
        </div>
      </section>
    </div>
  </div>;
}
