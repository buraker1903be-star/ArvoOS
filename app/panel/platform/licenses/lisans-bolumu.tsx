import type { SupabaseClient } from "@supabase/supabase-js";
import { ADDON_PRODUCTS, productLicenseLabels } from "@/lib/products";
import { URUN_KOTALARI, urunKotalari } from "@/lib/urun-kotasi";
import { depolamaKullanimi, lisansOlcumleri } from "@/lib/lisans-olcumleri";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { PLANS } from "@/lib/site/pricing";
import { planTutari } from "@/lib/site/fiyat-kaynagi";
import { paketListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yansimaDurumu, yansimaGunu, type YansimaKopyasi } from "@/lib/yansima-durumu";
import { limitSapmalari } from "@/lib/paket-limitleri";
import { KKart, KNot } from "../konsol-ui";
import { LISANS_TONU, PAKET_ADI, depolama, para, sayi, tarih, tarihDegeri, yuzde } from "../bicim";
import { modulErisimiDegistir } from "../modul-actions";
import { cekirdekErisimi, updateOrganizationLicense, updateProductLicense, urunuYenidenYansit } from "./actions";
import { UrunKartlari } from "./urun-kartlari";
// Ölçer, ürün kartları ve düzenleme penceresi (plt-*) hâlâ buradan; başlık,
// şerit ve kart düzeninin CSS'ini konsol-ui kendisi import ediyor.
import "../platform.css";
import { liraYazisi } from "@/lib/turkish-amount";

/*
  Paketin varsayılanından sapan kapasite, değerin yanına kısa not.
  Kural lib/paket-limitleri'nde (Sistem Sağlığı ekranıyla ortak); burada
  yalnızca cümleye çevriliyor. Sapma yoksa boş metin döner.

  Sistem Sağlığı "paketiyle uyuşmayan limitler" diye işaretlediğinde
  kurucu buraya geliyor; sapmanın ne kadar olduğu burada da yazmazsa iki
  ekran arasında gidip gelmek gerekiyor (14.10.2026).
*/
function kapasiteSapmasi(planCode: string | null, userLimit: number, storageLimitMb: number): string {
  const sapmalar = limitSapmalari(planCode, { userLimit, storageLimitMb, aiCreditLimit: null });
  if (!sapmalar.length) return "";
  return ` · paket ${sapmalar.map((x) => `${x.alan} ${sayi(x.paket)}`).join(", ")}`;
}

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
  /** Ek koltuğun aylık bedeli (kuruş) ve dahil limitin üstüne açılabilen koltuk sayısı. */
  extra_user_fee: number | null;
  extra_user_cap: number | null;
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


/*
  LİSANS VE KOTA BÖLÜMÜ (14.10.2026). Sayfanın gövdesi buraya taşındı ki
  müşteri detayının "Lisanslar" penceresi AYNI bileşeni kullansın: kota
  şeridi, ürün listesi ve düzenleme pencereleri iki yerde ayrı ayrı
  yazılsaydı biri düzeltilip öteki unutulurdu. Kurucu doğrulamasını
  çağıran sayfa yapar.
*/
export async function LisansBolumu({ supabase, organizationId, label }: { supabase: SupabaseClient; organizationId: string; label: string }) {
  const selected = { id: organizationId };
  /*
    HEPSİ TEK TURDA (14.10.2026). Okumalar sırayla bekleniyordu: önce
    lisans, sonra bütün kurumların depolaması, sonra iki ayrı veritabanından
    ürün kullanımı, sonra üç ürünün kopyası. Birbirine bağlı değiller;
    pencere açılırken bir saniyenin büyük kısmı sıra beklemekti.

    Depolama, kullanım ve kopyalar ArvoLab/ARC/Randevu'ya gidiyor; ölçüm
    yardımcıları ulaşamayınca null döndürüyor, fırlatmıyor — biri yavaşsa
    ötekileri bekletmiyor ama sayfa yine de en yavaşını bekliyor.
  */
  const [
    [{ data: licenseData, error: licenseError }, { count: activeUsers }, { data: productLicenseData }],
    depolamalar,
    { kullanim, arvolabKopyasi, arcKopyasi, randevuKopyasi },
    fiyatlar,
  ] = await Promise.all([
    Promise.all([
      supabase.from("organization_licenses").select("*").eq("organization_id", selected.id).maybeSingle(),
      supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", selected.id).eq("is_active", true),
      supabase.from("organization_product_licenses").select("product,status,plan_code,monthly_fee,current_period_end,suspension_reason,limits").eq("organization_id", selected.id),
    ]),
    /* Depolama kullanımı: limit tek başına bir şey anlatmıyor ("512000 MB").
       5 dk önbellekte (lib/lisans-olcumleri). */
    depolamaKullanimi(),
    /* Ürün kullanımı ve ArvoLab/ARC/Randevu'daki kopyanın KENDİSİ — köprünün
       sağlığı değil: bridge_health "son çağrı başarılı" derken kopya
       günlerce eski kalabiliyor (AkademikMerkez, 22.09.2026). 60 sn
       önbellekte; lisans kaydı kurumun etiketini düşürüyor. */
    lisansOlcumleri(selected.id),
    /* Liste fiyatı satırda (14.10.2026: "Güncel Fiyat" penceresi buraya katıldı). */
    yayimlananFiyatlar(),
  ]);
  if (licenseError) throw new Error(`Lisans okunamadı: ${licenseError.message}`);
  const license = licenseData as LicenseRow | null;
  if (!license) throw new Error("Kurum lisansı bulunamadı. Migration ve lisans backfill işlemini kontrol edin.");

  const productLicenses = new Map(((productLicenseData ?? []) as ProductLicenseRow[]).map((row) => [row.product, row]));
  const depolamaMb = Math.ceil(
    Number(depolamalar.find((row) => row.organization_id === selected.id)?.bytes ?? 0) / (1024 * 1024),
  );



  /*
    Üç ürünün kopyası üç ayrı biçimde duruyor, o yüzden karşılaştırılacak
    alanlar burada kuruluyor; kural tek yerde (lib/yansima-durumu.ts).

    ArvoLab kendi organizations satırında durum + AI hakkı tutuyor.
    ArvoARC ve Randevu ise ArvoOS'un lisans satırının aynen kopyasını; orada
    durum ve dönem sonu karşılaştırılıyor. updated_at KARŞILAŞTIRILMIYOR:
    hedef veritabanında onu now() yapan bir tetikleyici varsa uyarı
    sürekli yanardı ve sürekli yanan uyarı, olmayan uyarıdır.
  */
  const cekirdekHak = license.ai_credit_limit ?? null;
  const krediMetni = (deger: number | null) =>
    deger === null ? "bildirilmemiş" : `${sayi(deger)} kredi`;

  function urunYansimasi(kod: string): YansimaKopyasi | null {
    const konsolDurum = productLicenses.get(kod)?.status ?? "inactive";
    if (kod === "arvolab") {
      if (!arvolabKopyasi) return null;
      return {
        damga: arvolabKopyasi.syncedAt,
        alanlar: [
          { etiket: "durum", kopya: arvolabKopyasi.status, konsol: konsolDurum },
          {
            etiket: "AI hakkı",
            kopya: krediMetni(arvolabKopyasi.aiCreditLimit),
            konsol: krediMetni(cekirdekHak),
          },
        ],
      };
    }
    const kopya = kod === "arc" ? arcKopyasi : kod === "randevu" ? randevuKopyasi : null;
    if (!kopya) return null;
    const konsolDonem = productLicenses.get(kod)?.current_period_end ?? null;
    return {
      damga: kopya.updatedAt,
      alanlar: [
        { etiket: "durum", kopya: kopya.status, konsol: konsolDurum },
        { etiket: "dönem sonu", kopya: yansimaGunu(kopya.periodEnd), konsol: yansimaGunu(konsolDonem) },
      ],
    };
  }
  /* Liste fiyatının metni: teklif usulü basamağa rakam uydurulmaz. */
  const listeMetni = (kurus: number | null) => (kurus === null ? "teklif" : para(kurus));
  /* Ek ürünün basamağı listede yalnızca yayımlanmış koduyla (arc-buyume
     gibi) bulunuyor; eski paket kodlu satırda (enterprise) liste yok. */
  const listedeki = (kod: string | null | undefined) => PLANS.find((plan) => plan.code === kod);
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
  const durumTonu = LISANS_TONU[license.license_status] ?? "neutral";
  const durumAdi = productLicenseLabels[license.license_status] ?? license.license_status;
  // Açık abonelik = ücret tahsil edilen ya da denemede olan ürün.
  const cekirdekAcik = ["active", "trialing", "past_due"].includes(license.license_status);
  const acikUrunler = ADDON_PRODUCTS.filter((urun) => ["active", "trialing", "past_due"].includes(productLicenses.get(urun.code)?.status ?? "inactive"));


  return <>

    {/*
      Dördü de her zaman çiziliyor. Sıfır da bir cevaptır: "kota aşımı yok"
      demek, satırın hiç olmamasından daha çok şey söyler.

      Çapraz kota listesi burada değil: aynı uyarı kiracı listesinin
      rozetinde duruyor (limiti aşan kırmızı, yaklaşan sarı). Aynı bilgiyi
      iki yerde göstermek, birini güncelleyip diğerini unutmak demek.
    */}
    {/*
      13.10.2026: StgWidget kutuları yerine panelin özet şeridi. Konsol
      kendi tasarım dilini kullanıyordu; aynı kurucunun gün içinde gidip
      geldiği panel ekranları şerit kullanıyor ve iki dil arasında geçiş
      sayıları her seferinde yeniden aramak demekti.
    */}
    <nav className="kayit-serit talep-serit" aria-label={`${label} lisans özeti`}>
      <dl>
        <div>
          <dt>Lisans</dt>
          <dd>{durumAdi}</dd>
          <small>{license.license_status === "trialing"
            ? `Deneme bitişi ${tarih(license.trial_ends_at)}`
            : license.current_period_end ? `Dönem sonu ${tarih(license.current_period_end)}` : "Dönem sonu girilmedi"}</small>
        </div>
        <div>
          <dt>Kullanıcı</dt>
          <dd className={userPercent > 100 ? "talep-uyari" : undefined}>{users} / {sayi(license.user_limit)}</dd>
          <small>%{userPercent} dolu</small>
        </div>
        <div>
          <dt>Depolama</dt>
          <dd className={storagePercent > 100 ? "talep-uyari" : undefined}>{depolama(depolamaMb)}</dd>
          <small>Limit {depolama(license.storage_limit_mb)} · %{storagePercent} dolu</small>
        </div>
        <div>
          <dt>AI kredisi</dt>
          <dd>{aiOlculdu ? `${sayi(aiKredi)} / ${sayi(license.ai_credit_limit)}` : "Ölçülemedi"}</dd>
          <small>{aiOlculdu
            ? `Bu ay · %${aiPercent} dolu`
            : "ArvoLab'a ulaşılamadı; tanımlı hak " + sayi(license.ai_credit_limit)}</small>
        </div>
      </dl>
    </nav>

    {/*
      14.10.2026: panelin sade kartı (KKart). Eskiden ayarlar ekranının
      kartlarıydı (StgSection: renkli simge kutusu, büyük harfli üst başlık);
      konsol panelden ayrı bir ürün gibi görünüyordu. Sayfa bir liste değil,
      iki kart alt alta; sarmalayıcı düz blok, kartlar arası boşluğu
      .k-kart+.k-kart veriyor.
    */}
    <div>
      {/*
        KOMPAKT (14.10.2026, "Lisanslar daha kompakt olsun"). Burada bir
        "Şu anki kullanım" kartı vardı: üç ölçer çubuğu ve uzun bir
        açıklama — ama kullanıcı, depolama ve AI kredisi sayılarını ve
        doluluk yüzdelerini üstteki şerit ZATEN yazıyor. Aynı üç sayı ekranda
        iki kez duruyordu. Kalan yalnızca uyarılar: ölçülemeyen AI tüketimi
        ve askı nedeni.
      */}
      {!aiOlculdu ? <KNot ton="uyari">AI tüketimi okunamadı: ArvoLab veritabanına ulaşılamıyor. Sayı bilinmiyor, sıfır değil.</KNot> : null}
      {license.suspension_reason ? <KNot ton="tehlike">{license.suspension_reason}</KNot> : null}

      {/*
        Dört ürün, tek satırda dört kart. Eskiden ArvoOS çekirdek lisansı
        tam genişlikte dev bir form, diğer üçü altında ayrı bir bölümdü —
        oysa dördü de ayrı ürün. "Bu kiracı hangi ürünleri alıyor" sorusu
        iki ayrı yere bakmayı gerektiriyordu.

        Kartlar özet; düzenleme tıklayınca açılan pencerede. Dört formu
        aynı anda dar sütunlarda tutmak hepsini okunmaz yapardı.
      */}
      <KKart
        id="urunler" baslik="Ürünler"
        sag={<span className="status-pill" data-tone={acikUrunler.length ? "success" : "neutral"}>
          {acikUrunler.length + (cekirdekAcik ? 1 : 0)} / {ADDON_PRODUCTS.length + 1} açık
        </span>}
      >
        <UrunKartlari
          organizationId={selected.id}
          kurumAdi={label}
          cekirdegiKaydet={updateOrganizationLicense}
          urunuKaydet={updateProductLicense}
          urunuYansit={urunuYenidenYansit}
          erisimiDegistir={cekirdekErisimi}
          urunErisiminiDegistir={modulErisimiDegistir}
          kartlar={[
            {
              tur: "cekirdek" as const,
              erisimAcik: license.license_status !== "suspended",
              kod: "arvoos",
              ad: "ArvoOS",
              aciklama: "Çekirdek panel: CRM, operasyon, finans, İK",
              durumAdi,
              tone: durumTonu,
              acik: cekirdekAcik,
              ozet: [
                { etiket: "Paket", deger: PAKET_ADI[license.plan_code] ?? license.plan_code },
                { etiket: "Aylık ücret", deger: license.monthly_fee ? `${para(Number(license.monthly_fee))} / ay` : "girilmedi" },
                /* Ödediğinin yanında yayımlanmış liste fiyatı: sapma hata değil
                   (pazarlık), ama görünür olmalı (lib/paket-ucreti ucretSapmasi). */
                { etiket: "Liste", deger: listeMetni(paketListeFiyatiKurus(license.plan_code, fiyatlar)) },
                { etiket: "Dönem sonu", deger: tarih(license.current_period_end) },
                /*
                  Kapasitenin yanında PAKETİN varsayılanı: Sistem Sağlığı
                  "paketiyle uyuşmayan limitler" diye işaretlediğinde kurucu
                  buraya geliyor ve sapmanın ne kadar olduğunu burada da
                  görmeli, yoksa iki ekran arasında gidip gelmek gerekiyor
                  (14.10.2026). Sapma hata değil — pazarlıkla genişletilmiş
                  limitler var — yalnızca yazılıyor.
                */
                {
                  etiket: "Kapasite",
                  deger: `${sayi(license.user_limit)} kullanıcı · ${depolama(license.storage_limit_mb)}${kapasiteSapmasi(license.plan_code, license.user_limit, license.storage_limit_mb)}`,
                },
                /* Ek koltuk kurucunun en çok merak ettiği satır: kurum dahil
                   limiti aşmışsa faturaya eklenen tutar budur. */
                {
                  etiket: "Ek kullanıcı",
                  deger: Math.max(0, users - license.user_limit) > 0
                    ? `${sayi(Math.max(0, users - license.user_limit))} × ${para(Number(license.extra_user_fee ?? 0))} / ay`
                    : `yok · tavan ${sayi(Number(license.extra_user_cap ?? 0))}`,
                },
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
                monthlyFee: license.monthly_fee ? liraYazisi(Number(license.monthly_fee)) : "",
                extraUserFee: license.extra_user_fee ? liraYazisi(Number(license.extra_user_fee)) : "",
                extraUserCap: String(Number(license.extra_user_cap ?? 0)),
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
                /* İptal edilmiş ürün de ürün tarafında kapalı (ArvoLab yalnızca açık
                   durumları içeri alıyor); anahtar onu açık göstermesin. */
                erisimAcik: status === "inactive" ? null : ["active", "trialing", "past_due"].includes(status),
                kod: product.code,
                /*
                  Karşılaştırma yalnızca ArvoLab için yapılabiliyor: ArvoARC ve
                  Randevu ayrı köprüler ve kopyalarını okuyan bir yol henüz
                  yok. Onlarda yansima null geçiyor, metin de eskisi gibi
                  genel kalıyor — uydurma bir "güncel" yazmaktansa.
                */
                yansima: yansimaDurumu(urunYansimasi(product.code), product.name),
                ad: product.name,
                aciklama: product.description,
                durumAdi: productLicenseLabels[status] ?? status,
                tone: LISANS_TONU[status] ?? "neutral",
                acik: ["active", "trialing", "past_due"].includes(status),
                ozet: [
                  { etiket: "Paket", deger: row?.plan_code ? (PAKET_ADI[row.plan_code] ?? row.plan_code) : "belirtilmedi" },
                  { etiket: "Aylık ücret", deger: row?.monthly_fee ? `${para(Number(row.monthly_fee))} / ay` : "girilmedi" },
                  ...(listedeki(row?.plan_code) ? [{ etiket: "Liste", deger: listeMetni(planTutari(listedeki(row?.plan_code)!, fiyatlar)) }] : []),
                  { etiket: "Dönem sonu", deger: tarih(row?.current_period_end ?? null) },
                  { etiket: "Kota", deger: kotaOzeti || (kotalar.length ? "sınırsız" : "yok") },
                ],
                kotalar,
                baslangic: {
                  status,
                  planCode: row?.plan_code ?? "",
                  monthlyFee: row?.monthly_fee ? liraYazisi(Number(row.monthly_fee)) : "",
                  currentPeriodEnd: tarihDegeri(row?.current_period_end ?? null),
                  suspensionReason: row?.suspension_reason ?? "",
                },
              };
            }),
          ]}
        />
      </KKart>
    </div>
  </>;
}
