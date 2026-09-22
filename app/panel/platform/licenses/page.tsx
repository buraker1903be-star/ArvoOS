import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { URUN_KOTALARI, urunKotalari } from "@/lib/urun-kotasi";
import { urunKullanimi } from "@/lib/urun-kullanimi";
import { StgIcon, StgSection, StgWidget } from "../../settings/settings-ui";
import { LISANS_TONU, depolama, kullanimTonu, sayi, tarih, tarihDegeri, yuzde } from "../bicim";
import { updateOrganizationLicense, updateProductLicense } from "./actions";
import { KiraciSecici } from "./kiraci-secici";
import { LisansFormu } from "./lisans-formu";
import { UrunFormu } from "./urun-formu";
import "../../settings/settings.css";
import "../platform.css";

type OrganizationRow = { id: string; name: string; display_name: string | null; slug: string; plan_code: string; status: string; kind: string | null };
type LicenseRow = {
  organization_id: string;
  plan_code: string;
  license_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  user_limit: number;
  storage_limit_mb: number;
  ai_credit_limit: number;
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
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const params = await searchParams;
  const adminClient = createAdminClient();
  /* Kurum listesi hem seçili kiracıyı bulmak hem de sayfanın kendi
     seçicisini doldurmak için. */
  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations").select("id,name,display_name,slug,plan_code,status,kind").order("name");
  if (organizationError) throw new Error("Kurum listesi okunamadı.");

  const organizations = (organizationData ?? []) as OrganizationRow[];
  if (!organizations.length) throw new Error("Yönetilecek kurum bulunamadı.");

  /*
    Adreste bir kurum yazıyorsa ONU açıyoruz, yoksa 404. Eskiden bilinmeyen
    kimlik sessizce kendi kurumumuza düşüyordu: kurucu silinmiş ya da yanlış
    bir bağlantıyla geldiğinde başka bir kiracının lisansını düzenlediğini
    fark etmeden kaydedebilirdi — formlar seçili kurumun kimliğini yazıyor.

    Adres boşken (menüden gelindiğinde) ilk MÜŞTERİ kurum açılıyor. Kendi
    kurumumuza düşmek, "kimin lisansına bakıyorum" sorusunu her seferinde
    yanlış yanıtlıyordu.
  */
  const selected = params.organization
    ? organizations.find((item) => item.id === params.organization)
    : organizations.find((item) => item.kind !== "internal") ?? organizations[0];
  if (!selected) notFound();

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
  const label = selected.display_name || selected.name;
  const durumTonu = LISANS_TONU[license.license_status] ?? "neutral";
  const durumAdi = productLicenseLabels[license.license_status] ?? license.license_status;
  // Açık abonelik = ücret tahsil edilen ya da denemede olan ek ürün.
  const acikUrunler = ADDON_PRODUCTS.filter((urun) => ["active", "trialing", "past_due"].includes(productLicenses.get(urun.code)?.status ?? "inactive"));

  return <div className="stg plt">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">KİRACI · {label}</small><h1>Lisans ve kota</h1><p>Paket, kullanım limitleri, deneme süresi ve erişim durumu.</p></div>
      <div className="panel-page-actions">
        <KiraciSecici
          secili={selected.id}
          kurumlar={organizations.map((kurum) => ({
            id: kurum.id,
            ad: kurum.display_name || kurum.name,
            kendi: kurum.kind === "internal",
          }))}
        />
        <Link className="panel-secondary" href={`/panel/platform?organization=${selected.id}`}>Kiracı dosyasına dön</Link>
      </div>
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
      {/* AI kredisi ÖLÇÜLMÜYOR. Burada "0 · %0 dolu" yazıyordu ve bu, hiç
          AI kullanmamış bir kiracıyla günde bin istek atan kiracıyı aynı
          gösteriyordu — tüketimi ArvoLab kendi veritabanında tutuyor,
          ArvoOS'un lisans kaydına hiçbir zaman yazılmıyor. */}
      <StgWidget
        tone="neutral" icon="chart" label="AI kredisi"
        value="Ölçülmüyor" note={`Tanımlı hak ${sayi(license.ai_credit_limit)} kredi`}
      />
    </div>

    <div className="stg-grid">
      <StgSection
        id="kullanim" wide icon="chart" tone="info" kicker="KOTA" title="Şu anki kullanım"
        description="Ölçümler canlı: kullanıcı sayısı üyeliklerden, depolama dosya deposundan geliyor. AI kredisi ölçülmüyor — tüketimi ArvoLab kendi veritabanında tutuyor."
        aside={<span className="status-pill" data-tone={kullanimTonu(Math.max(userPercent, storagePercent))}>En dolu kota %{Math.max(userPercent, storagePercent)}</span>}
      >
        <div className="plt-olcumler">
          <Olcum etiket="Kullanıcı" kullanilan={sayi(users)} limit={sayi(license.user_limit)} oran={userPercent} />
          <Olcum etiket="Depolama" kullanilan={depolama(depolamaMb)} limit={depolama(license.storage_limit_mb)} oran={storagePercent} />
        </div>
        {/*
          AI kredisi ölçeri kaldırıldı ve "AI kullanımını sıfırla" düğmesi de
          onunla birlikte. Çubuk her kiracıda %0 gösteriyordu, düğme de hep
          0 olan bir sayacı 0'a çekiyordu: ikisi de çalışan bir kota kurgusu
          izlenimi veriyordu. ArvoLab tüketimi ArvoOS'un lisans kaydına
          yazmaya başladığında ölçer de sıfırlama da geri gelir.
        */}
        <p className="stg-muted"><StgIcon name="chart" size={16} />AI kredisi ölçülmüyor: ArvoLab asistanının tüketimi henüz ArvoOS lisansına işlenmiyor. Aşağıdaki limit tanımlı hakkı yazar, bir kullanımı kısıtlamaz.</p>
        {license.suspension_reason ? <p className="stg-muted"><StgIcon name="lock" size={16} />{license.suspension_reason}</p> : null}
      </StgSection>

      <StgSection
        id="lisans" wide icon="box" tone={durumTonu}
        kicker={selected.slug} title={`${label} · lisans politikası`}
        description="Askıya alınan ya da iptal edilen kurumun panel erişimi kurum durumuyla birlikte kapatılır."
        aside={<span className="status-pill" data-tone={durumTonu}>{durumAdi}</span>}
      >
        <LisansFormu
          organizationId={selected.id}
          aktifUye={users}
          kullanilanMb={depolamaMb}
          kaydet={updateOrganizationLicense}
          baslangic={{
            planCode: license.plan_code,
            licenseStatus: license.license_status,
            trialEndsAt: tarihDegeri(license.trial_ends_at),
            currentPeriodEnd: tarihDegeri(license.current_period_end),
            userLimit: String(license.user_limit),
            storageLimitMb: String(license.storage_limit_mb),
            aiCreditLimit: String(license.ai_credit_limit),
            monthlyFee: license.monthly_fee ? String(Number(license.monthly_fee) / 100) : "",
            suspensionReason: license.suspension_reason ?? "",
          }}
        />
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
                <UrunFormu
                  organizationId={selected.id}
                  product={product.code}
                  productName={product.name}
                  kaydet={updateProductLicense}
                  baslangic={{
                    status,
                    planCode: row?.plan_code ?? "",
                    monthlyFee: row?.monthly_fee ? String(Number(row.monthly_fee) / 100) : "",
                    currentPeriodEnd: tarihDegeri(row?.current_period_end ?? null),
                    suspensionReason: row?.suspension_reason ?? "",
                  }}
                  /* Kota alanları yalnızca ÖLÇÜMÜ YAZILMIŞ ürünlerde
                     çiziliyor. Ölçümsüz limit, kurucunun koruma sandığı
                     boş bir sayı olurdu — storage_limit_mb dersi. */
                  kotalar={(URUN_KOTALARI[product.code] ?? []).map((alan) => {
                    const olcum = kotaSatirlari[product.code]?.find((satir) => satir.alan.anahtar === alan.anahtar);
                    return {
                      anahtar: alan.anahtar,
                      etiket: alan.etiket,
                      birim: alan.birim,
                      donemsel: Boolean(alan.donemsel),
                      limit: olcum?.limit != null ? String(olcum.limit) : "",
                      kullanilan: olcum?.kullanilan ?? null,
                      asildi: Boolean(olcum?.asildi),
                    };
                  })}
                />
              </StgSection>
            );
          })}
        </div>
      </section>
    </div>
  </div>;
}
