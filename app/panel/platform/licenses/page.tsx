import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { URUN_KOTALARI, urunKotalari } from "@/lib/urun-kotasi";
import { KREDI_KARAKTERI, urunKullanimi } from "@/lib/urun-kullanimi";
import { StgIcon, StgSection, StgWidget } from "../../settings/settings-ui";
import { LISANS_TONU, PAKET_ADI, depolama, kullanimTonu, para, sayi, tarih, tarihDegeri, yuzde } from "../bicim";
import { updateOrganizationLicense, updateProductLicense } from "./actions";
import { KiraciSecici } from "./kiraci-secici";
import { UrunKartlari } from "./urun-kartlari";
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

  /*
    AI kredisi artık ÖLÇÜLÜYOR: ArvoLab'ın tükettiği karakter kuruma göre
    toplanıp krediye çevriliyor (1 kredi = 1.000 karakter). Eskiden bu kutu
    her kiracıda "0 kredi · %0 dolu" diyordu çünkü hiçbir kod
    ai_credits_used sütununu artırmıyordu.

    Ölçüm ALINAMAZSA null kalıyor ve ekran yine "Ölçülmüyor" diyor —
    köprü koptuğunda "0 kredi" yazmak, hiç kullanmamış kiracıyla ölçümü
    kopmuş kiracıyı aynı gösterirdi.
  */
  const aiKredi = kullanim.arvolab?.aylik_kredi ?? null;
  const aiOlculdu = aiKredi !== null;
  const aiPercent = aiOlculdu ? yuzde(aiKredi, license.ai_credit_limit) : 0;

  const users = activeUsers ?? 0;
  const userPercent = yuzde(users, license.user_limit);
  const storagePercent = yuzde(depolamaMb, license.storage_limit_mb);
  const label = selected.display_name || selected.name;
  const durumTonu = LISANS_TONU[license.license_status] ?? "neutral";
  const durumAdi = productLicenseLabels[license.license_status] ?? license.license_status;
  // Açık abonelik = ücret tahsil edilen ya da denemede olan ürün.
  const cekirdekAcik = ["active", "trialing", "past_due"].includes(license.license_status);
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
      <StgWidget
        tone={aiOlculdu ? kullanimTonu(aiPercent) : "neutral"} icon="chart" label="AI kredisi"
        value={aiOlculdu ? `${sayi(aiKredi)} / ${sayi(license.ai_credit_limit)}` : "Ölçülemedi"}
        note={aiOlculdu
          ? `Bu ay · %${aiPercent} dolu`
          : "ArvoLab'a ulaşılamadı; tanımlı hak " + sayi(license.ai_credit_limit)}
      />
    </div>

    <div className="stg-grid">
      <StgSection
        id="kullanim" wide icon="chart" tone="info" kicker="KOTA" title="Şu anki kullanım"
        description="Ölçümler canlı: kullanıcı sayısı üyeliklerden, depolama dosya deposundan, AI kredisi ArvoLab'ın bu ayki tüketiminden geliyor."
        aside={<span className="status-pill" data-tone={kullanimTonu(Math.max(userPercent, storagePercent, aiPercent))}>En dolu kota %{Math.max(userPercent, storagePercent, aiPercent)}</span>}
      >
        <div className="plt-olcumler">
          <Olcum etiket="Kullanıcı" kullanilan={sayi(users)} limit={sayi(license.user_limit)} oran={userPercent} />
          <Olcum etiket="Depolama" kullanilan={depolama(depolamaMb)} limit={depolama(license.storage_limit_mb)} oran={storagePercent} />
          {/* Ölçüm alınamadıysa çubuk hiç çizilmiyor: %0'lık bir çubuk
              "kullanmamış" der, oysa söyleyebileceğimiz tek şey
              "bilmiyoruz". */}
          {aiOlculdu ? (
            <Olcum etiket="AI kredisi (bu ay)" kullanilan={sayi(aiKredi)} limit={sayi(license.ai_credit_limit)} oran={aiPercent} />
          ) : null}
        </div>
        <p className="stg-muted">
          <StgIcon name="chart" size={16} />
          {aiOlculdu
            ? `1 kredi = ${sayi(KREDI_KARAKTERI)} karakter (istem + yanıt). Reddedilen yanıtlar sayılmaz — kullanıcıya gösterilmeyen bir şeyin parası alınmıyor. Sayaç her ay başında sıfırlanır.`
            : "AI tüketimi okunamadı: ArvoLab veritabanına ulaşılamıyor. Sayı bilinmiyor, sıfır değil."}
          {kullanim.arvolab?.aylik_calisma != null ? ` Bu ay ${sayi(kullanim.arvolab.aylik_calisma)} asistan çalışması.` : ""}
        </p>
        {license.suspension_reason ? <p className="stg-muted"><StgIcon name="lock" size={16} />{license.suspension_reason}</p> : null}
      </StgSection>

      {/*
        Dört ürün, tek satırda dört kart. Eskiden ArvoOS çekirdek lisansı
        tam genişlikte dev bir form, diğer üçü altında ayrı bir bölümdü —
        oysa dördü de ayrı ürün. "Bu kiracı hangi ürünleri alıyor" sorusu
        iki ayrı yere bakmayı gerektiriyordu.

        Kartlar özet; düzenleme tıklayınca açılan pencerede. Dört formu
        aynı anda dar sütunlarda tutmak hepsini okunmaz yapardı.
      */}
      <StgSection
        id="urunler" wide icon="grid" tone="gold" kicker="ÜRÜNLER" title={`${label} abonelikleri`}
        description="Dördü ayrı ürün: her birinin kendi durumu, ücreti ve kotası var. Düzenlemek için karta tıklayın."
        aside={<span className="status-pill" data-tone={acikUrunler.length ? "success" : "neutral"}>
          {acikUrunler.length + (cekirdekAcik ? 1 : 0)} / {ADDON_PRODUCTS.length + 1} açık
        </span>}
      >
        <UrunKartlari
          organizationId={selected.id}
          kurumAdi={label}
          cekirdegiKaydet={updateOrganizationLicense}
          urunuKaydet={updateProductLicense}
          kartlar={[
            {
              tur: "cekirdek" as const,
              kod: "arvoos",
              ad: "ArvoOS",
              aciklama: "Çekirdek panel: CRM, operasyon, finans, İK",
              durumAdi,
              tone: durumTonu,
              acik: cekirdekAcik,
              ozet: [
                { etiket: "Paket", deger: PAKET_ADI[license.plan_code] ?? license.plan_code },
                { etiket: "Aylık ücret", deger: license.monthly_fee ? `${para(Number(license.monthly_fee))} / ay` : "girilmedi" },
                { etiket: "Dönem sonu", deger: tarih(license.current_period_end) },
                { etiket: "Kapasite", deger: `${sayi(license.user_limit)} kullanıcı · ${depolama(license.storage_limit_mb)}` },
              ],
              aktifUye: users,
              kullanilanMb: depolamaMb,
              aiKullanilan: aiKredi,
              baslangic: {
                planCode: license.plan_code,
                licenseStatus: license.license_status,
                trialEndsAt: tarihDegeri(license.trial_ends_at),
                currentPeriodEnd: tarihDegeri(license.current_period_end),
                userLimit: String(license.user_limit),
                storageLimitMb: String(license.storage_limit_mb),
                aiCreditLimit: String(license.ai_credit_limit),
                monthlyFee: license.monthly_fee ? String(Number(license.monthly_fee) / 100) : "",
                suspensionReason: license.suspension_reason ?? "",
              },
            },
            ...ADDON_PRODUCTS.map((product) => {
              const row = productLicenses.get(product.code);
              const status = row?.status ?? "inactive";
              const kotalar = (URUN_KOTALARI[product.code] ?? []).map((alan) => {
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
              });
              /* Kota özeti yalnızca limiti GİRİLMİŞ alanlardan; "boşsa
                 sınırsız" olan bir alanı kartta yazmak, kota varmış gibi
                 okunurdu. */
              const kotaOzeti = kotalar.filter((alan) => alan.limit)
                .map((alan) => `${sayi(Number(alan.limit))} ${alan.birim}`).join(" · ");
              return {
                tur: "ek" as const,
                kod: product.code,
                ad: product.name,
                aciklama: product.description,
                durumAdi: productLicenseLabels[status] ?? status,
                tone: LISANS_TONU[status] ?? "neutral",
                acik: ["active", "trialing", "past_due"].includes(status),
                ozet: [
                  { etiket: "Paket", deger: row?.plan_code ? (PAKET_ADI[row.plan_code] ?? row.plan_code) : "belirtilmedi" },
                  { etiket: "Aylık ücret", deger: row?.monthly_fee ? `${para(Number(row.monthly_fee))} / ay` : "girilmedi" },
                  { etiket: "Dönem sonu", deger: tarih(row?.current_period_end ?? null) },
                  { etiket: "Kota", deger: kotaOzeti || (kotalar.length ? "sınırsız" : "kota yok") },
                ],
                kotalar,
                baslangic: {
                  status,
                  planCode: row?.plan_code ?? "",
                  monthlyFee: row?.monthly_fee ? String(Number(row.monthly_fee) / 100) : "",
                  currentPeriodEnd: tarihDegeri(row?.current_period_end ?? null),
                  suspensionReason: row?.suspension_reason ?? "",
                },
              };
            }),
          ]}
        />
      </StgSection>
    </div>
  </div>;
}
