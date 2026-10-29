import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { getPaytrStatus, getPlatformOrganizationId } from "@/lib/paytr-status";
import { paketAdi } from "@/lib/paket-adlari";
import { KARTLA_ODENEBILEN, PRODUCTS, productLicenseLabels, productName } from "@/lib/products";
import { ekKullaniciSayisi, ekKullaniciUcretiKurus } from "@/lib/kota-durumu";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { submitBankTransferPayment } from "./actions";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { kurumBelgeleri } from "@/lib/faturalama-koprusu";
import { kartSaklamaAcik, otomatikYenilemeAcik } from "@/lib/paytr-kart-akisi";
import { kartlaOdemeyeBasla, kayitliKartiKaldir, otomatikYenilemeyiKapat } from "./kart-actions";
import { proformaGorunumu, PROFORMA_DURUM_ADI } from "@/lib/proforma";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { gunFarki } from "@/lib/is-adimlari";
import { turkiyeGunu } from "@/lib/otomatik-yenileme";
import { TalepAkis } from "../crm/kayit-detay/kayit-akis";
import "../crm/kayit-detay/kayit-detay.css";
import "../hr/hr.css";

/* Ödeme bildiriminin durumu kurumun dilinde (eskiden ham kod: "pending"). */
const ODEME_DURUMU: Record<string, string> = { pending: "İnceleniyor", approved: "Onaylandı", rejected: "Reddedildi", canceled: "İptal" };
const ODEME_TONU: Record<string, string> = { pending: "warning", approved: "success", rejected: "danger", canceled: "neutral" };
import { payLicenseWithCard } from "./paytr-actions";
import "../team.css";
import "./abonelik.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";

function formatTry(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
}

const sayi = (value: number) => new Intl.NumberFormat("tr-TR").format(value);

function formatIban(iban: string) {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ submitted?: string; kart?: string }> }) {
  const { supabase, organization, membership, izin } = await getPanelContext();
  const params = await searchParams;

  const [
    { data: bankAccounts, error: bankaHatasi },
    { data: payments, error: odemeHatasi },
    { data: license, error: lisansHatasi },
    { data: productLicenses, error: urunHatasi },
    { count: aktifKullanici },
  ] = await Promise.all([
    supabase.from("platform_bank_accounts").select("id,bank_name,account_holder,iban,currency").eq("is_active", true).order("sort_order"),
    supabase.from("organization_payment_requests").select("id,plan_code,product,amount,currency,status,reference_no,review_note,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("organization_licenses").select("plan_code,license_status,current_period_end,monthly_fee,user_limit,extra_user_fee,extra_user_cap").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("organization_product_licenses").select("product,status,monthly_fee,current_period_end").eq("organization_id", organization.id),
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("is_active", true),
  ]);

  /*
    MÜŞTERİ BU EKRANDAN ÖDÜYOR; SESSİZ BOŞLUK BURADA PAHALI (15.10.2026).
    Dördünün de hatası alınmıyordu. Lisans okunamazsa paket ve ek koltuk
    ücreti kaybolur (ekKullaniciSayisi limit null gelince 0 döner), banka
    hesapları okunamazsa müşteri parayı nereye yollayacağını göremez,
    ödeme geçmişi okunamazsa "hiç ödeme yapmamışsınız" gibi görünür.
    Hiçbiri sessizce boş kalmamalı.
  */
  const okumaHatasi = bankaHatasi ?? odemeHatasi ?? lisansHatasi ?? urunHatasi;
  if (okumaHatasi) throw new Error("Abonelik bilgileri okunamadı: " + okumaHatasi.message);

  /*
    EK KULLANICI (13.10.2026). Dahil kullanıcı sayısını aşan her koltuk
    aylık ücretli; sayı türetilmiş (aktif üye − dahil limit), ayrı sayaç
    yok (lib/kota-durumu). Ekranda göstermek şart: tutar ödeme
    bağlantısına da giriyor (lib/license-checkout) ve müşterinin paket
    fiyatından fazlasını ilk kez ödeme sayfasında görmesi doğru olmazdı.
  */
  const uyeSayisi = aktifKullanici ?? 0;
  const dahilLimit = license?.user_limit ?? null;
  const ekKoltuk = ekKullaniciSayisi(uyeSayisi, dahilLimit);
  const ekUcret = ekKullaniciUcretiKurus(uyeSayisi, dahilLimit, license?.extra_user_fee ?? 0);

  const canSubmit = membership && izin("finance.lisans.yonet");
  // Kartla ödeme: ürünün aylık ücreti girilmiş + ArvoOS'un PayTR mağazası bağlı olmalı
  const platformId = canSubmit ? await getPlatformOrganizationId() : null;
  const platformPaytr = platformId && platformId !== organization.id ? await getPaytrStatus(platformId) : null;
  const storeReady = Boolean(platformPaytr?.available && platformPaytr.connected && platformPaytr.enabled);

  const productRows = new Map(((productLicenses ?? []) as { product: string; status: string; monthly_fee: number | null; current_period_end: string | null }[]).map((row) => [row.product, row]));
  const subscriptions = PRODUCTS.map((product) => {
    const row = product.code === "arvoos" ? null : productRows.get(product.code);
    /* ArvoOS'un tutarına ek koltuklar DAHİL: düğmede yazan rakam ile
       PayTR'ye giden rakam aynı olmalı (lib/license-checkout aynı hesabı
       bağlantıyı açarken yeniden yapıyor). */
    const fee = Number((product.code === "arvoos" ? license?.monthly_fee : row?.monthly_fee) ?? 0)
      + (product.code === "arvoos" ? ekUcret : 0);
    return {
      ...product,
      fee,
      status: product.code === "arvoos" ? (license?.license_status ?? "trialing") : (row?.status ?? "inactive"),
      periodEnd: product.code === "arvoos" ? (license?.current_period_end ?? null) : (row?.current_period_end ?? null),
      // Ücreti girilmemiş ek ürün kuruma hiç gösterilmez: satın almadığı ürün için kart çıkmasın.
      visible: product.code === "arvoos" || fee > 0 || Boolean(row),
    };
  }).filter((product) => product.visible);

  /*
    ArvoLab asistan kredisi bu sayfada YOK (28.10.2026, kurum sahibinin
    kararı): ArvoOS'ta yalnızca abonelik ve faturalama. Kurumun kredisini
    ArvoLab'daki kurum yöneticisi ArvoLab'ın "Abonelik ve kredi" ekranından
    alıyor (köprü: org_credit_checkout). Kredi ödemeleri yine buradaki
    ödeme geçmişinde ve faturalarda görünür — para ArvoOS'un mağazasından geçiyor.
  */

  /*
    PROFORMA VE FATURALAR (28.10.2026). Tablolar istemciye kapalı (RLS
    yalnızca kurucuya açık): belge resmî ve kurumlar arası sızmamalı.
    Okuma servis rolüyle, kurumun KENDİ kimliğiyle ve yalnızca lisans
    yönetme yetkisi olana — dekont gönderebilen kişi, ödeyecek kişi.
  */
  const admin = canSubmit ? createAdminClient() : null;
  const belgeler = admin ? await kurumBelgeleri(admin, organization.id) : null;

  /*
    KAYITLI KART VE OTOMATİK YENİLEME (28.10.2026). Özellik bayrağı açık
    değilse hiç okunmuyor (lib/paytr-kart-akisi). Son kartla ödeme
    denemesi de okunuyor: müşteri PayTR'den döndüğünde sonucu ve
    başarısızlığın nedenini görsün — neden adrese yazılmıyor, kayıttan.
  */
  const kartAcik = kartSaklamaAcik() && Boolean(admin) && platformId !== organization.id;
  type KayitliKart = { id: string; son4: string; banka: string | null; sema: string | null; son_kullanma_ay: string | null; son_kullanma_yil: string | null };
  type Yenileme = { product: string; aktif: boolean; kart_id: string; son_hata: string | null; onay_at: string };
  let kartlar: KayitliKart[] = [];
  let yenilemeler: Yenileme[] = [];
  let sonDeneme: { durum: string; hata_mesaji: string | null } | null = null;
  if (kartAcik && admin) {
    const [k, y, d] = await Promise.all([
      admin.from("paytr_kayitli_kartlar").select("id,son4,banka,sema,son_kullanma_ay,son_kullanma_yil").eq("organization_id", organization.id).order("created_at", { ascending: false }),
      admin.from("paytr_otomatik_yenileme").select("product,aktif,kart_id,son_hata,onay_at").eq("organization_id", organization.id),
      params.kart
        ? admin.from("paytr_kart_islemleri").select("durum,hata_mesaji,payment_links!inner(payer_organization_id)").eq("payment_links.payer_organization_id", organization.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const kartHatasi = k.error ?? y.error ?? d.error;
    if (kartHatasi) throw new Error("Kayıtlı kart bilgileri okunamadı: " + kartHatasi.message);
    kartlar = (k.data ?? []) as KayitliKart[];
    yenilemeler = (y.data ?? []) as Yenileme[];
    sonDeneme = d.data as { durum: string; hata_mesaji: string | null } | null;
  }
  const bugun = todayInIstanbul();

  /*
    ABONELİK VE FATURALAMA DÜZENİ. 28.10.2026'da ArvoLab'ın "Abonelik ve
    kredi" iskeletine geçti; 29.10.2026'da (kurum sahibinin isteği)
    personel sayfasının diliyle yenilendi: üstte özet şeridi, solda ürün
    kartları (aylık tutar büyük, dönem sonuna kalan gün renkli), sağda
    sekmeli kart — Faturalar, Ödemeler, Kart, Havale/EFT. Eskiden havale
    ve dekont formu sayfanın en altında ayrı iki kutuydu ve kartla
    ödemeyen müşteri onları kaydırarak arıyordu; sağ sütunun kendisi de
    üç başlığı alt alta dizip uzuyordu.
  */
  /* Otomatik yenileme kapalıyken (29.10.2026) eski bir "aktif" satır
     çekim yapılacakmış gibi gösterilmez; iş hiçbir karttan çekmiyor. */
  const yenilemeAcik = otomatikYenilemeAcik();
  const aktifYenilemeler = yenilemeAcik ? yenilemeler.filter((y) => y.aktif) : [];
  const disari = platformId === organization.id;
  const kalanGun = (bitis: string | null) => (bitis ? gunFarki(bugun, turkiyeGunu(bitis)) : null);
  const kalanYazisi = (gun: number | null) => gun === null ? null : gun < 0 ? `${-gun} gün gecikti` : gun === 0 ? "bugün bitiyor" : `${gun} gün kaldı`;
  const kalanTonu = (gun: number | null) => gun === null ? "neutral" : gun < 0 ? "danger" : gun <= 7 ? "warning" : "success";
  const acikAbonelikler = subscriptions.filter((p) => ["active", "trialing", "past_due"].includes(p.status));
  // Tutar ve tarihler bellekteki ürün listesinden (en çok dört ürün); sınırlı bir sorgudan değil.
  const aylikToplam = acikAbonelikler.reduce((t, p) => t + p.fee, 0);
  const enYakin = subscriptions.filter((p) => p.periodEnd).sort((x, y) => String(x.periodEnd).localeCompare(String(y.periodEnd)))[0] ?? null;
  const bekleyenProforma = belgeler ? belgeler.proformalar.filter((pr) => proformaGorunumu(pr.durum, pr.gecerlilikTarihi, bugun) === "bekliyor").length : 0;
  const kartSekmesi = kartAcik && Boolean(canSubmit);
  const sekmeler = [
    ...(belgeler ? [bekleyenProforma ? `Faturalar · ${bekleyenProforma}` : "Faturalar"] : []),
    "Ödemeler",
    ...(kartSekmesi ? ["Kart ve yenileme"] : []),
    "Havale / EFT",
  ];
  const baslangicSekmesi = params.submitted === "1" ? sekmeler.length - 1 : 0;

  return <main className="talep cari liste-sayfa abk">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">FİNANS · ABONELİK</small>
        <h1>Abonelik ve faturalama</h1>
        <p className="ek-alt">{organization.display_name || organization.name} · {acikAbonelikler.length} abonelik{aylikToplam ? ` · aylık ${formatTry(aylikToplam)}` : ""}</p>
      </div>
      <div className="talep-bas-eylem">
        <span className="status-pill" data-tone={["active", "trialing"].includes(license?.license_status ?? "trialing") ? "success" : "warning"}>{productLicenseLabels[license?.license_status ?? "trialing"] ?? license?.license_status}</span>
      </div>
    </header>

    {params.kart === "tamam" ? <div className="team-notice">{sonDeneme?.durum === "basarili" ? "Ödemeniz alındı; lisansınız uzatıldı." : "Ödemeniz işleniyor. Banka onayı geldiğinde lisansınız otomatik olarak uzar; bu sayfayı birkaç saniye sonra yenileyebilirsiniz."}</div> : null}
    {params.kart === "hata" ? <div className="team-notice" data-tone="danger">Ödeme tamamlanamadı{sonDeneme?.hata_mesaji ? `: ${sonDeneme.hata_mesaji}` : ". Kart bilgilerinizi kontrol edip yeniden deneyin ya da havale/EFT ile ödeyin."}</div> : null}
    {params.submitted === "1" ? <div className="team-notice">Dekontunuz alındı. Kurucu onayından sonra lisansınız otomatik etkinleştirilecek.</div> : null}

    <nav className="kayit-serit talep-serit" aria-label="Abonelik özeti">
      <dl>
        <div><dt>Aylık toplam</dt><dd>{aylikToplam ? formatTry(aylikToplam) : "—"}</dd></div>
        <div><dt>En yakın dönem sonu</dt><dd className={kalanTonu(kalanGun(enYakin?.periodEnd ?? null)) === "danger" ? "cari-eksi" : kalanTonu(kalanGun(enYakin?.periodEnd ?? null)) === "warning" ? "talep-uyari" : undefined}>{enYakin?.periodEnd ? istanbulDateTime(enYakin.periodEnd, { dateStyle: "medium" }) : "—"}</dd></div>
        <div><dt>Kullanıcı</dt><dd>{dahilLimit ? `${sayi(uyeSayisi)} / ${sayi(dahilLimit)}` : sayi(uyeSayisi)}</dd></div>
        {kartSekmesi && yenilemeAcik ? <div><dt>Otomatik yenileme</dt><dd className={aktifYenilemeler.length ? "cari-arti" : undefined}>{aktifYenilemeler.length ? `${aktifYenilemeler.length} açık` : "Kapalı"}</dd></div> : null}
        {belgeler ? <div><dt>Bekleyen proforma</dt><dd className={bekleyenProforma ? "talep-uyari" : undefined}>{bekleyenProforma}</dd></div> : null}
      </dl>
    </nav>

    <div className="talep-izgara personel-iki abk-izgara">
      <section className="panel-card abk-kart" aria-label="Aboneliklerim">
        <header className="phr-bas abk-bas">
          <h2>Aboneliklerim <small className="pu-sayi">{subscriptions.length}</small></h2>
          <small>{kartAcik && yenilemeAcik ? "kartla ya da havaleyle · otomatik yenileme isteğe bağlı" : "kartla ya da havaleyle"}</small>
        </header>
        <ul className="abk-urunler">
          {subscriptions.map((product) => {
            const yenileme = aktifYenilemeler.find((y) => y.product === product.code);
            const yenilemeKarti = yenileme ? kartlar.find((k) => k.id === yenileme.kart_id) : null;
            const acik = ["active", "trialing"].includes(product.status);
            const gun = kalanGun(product.periodEnd);
            return <li key={product.code} className="abk-urun" data-urun={product.code}>
              <div className="abk-urun-bas">
                <span className="abk-rozet" aria-hidden="true">{product.badge}</span>
                <div><b>{product.name}</b><small>{product.code === "arvoos" ? `${paketAdi(license?.plan_code ?? organization.plan_code)} paketi` : product.description}</small></div>
                <span className="status-pill" data-tone={acik ? "success" : product.status === "past_due" ? "warning" : "neutral"}>{productLicenseLabels[product.status] ?? product.status}</span>
              </div>
              <div className="abk-fiyat">
                <span><b>{product.fee > 0 ? formatTry(product.fee) : "—"}</b><small>{product.fee > 0 ? "aylık" : "ücret belirlenmedi"}</small></span>
                {product.periodEnd ? (
                  <span className="abk-donem">
                    <small>Dönem sonu {istanbulDateTime(product.periodEnd, { dateStyle: "medium" })}</small>
                    <em data-tone={kalanTonu(gun)}>{kalanYazisi(gun)}</em>
                  </span>
                ) : null}
              </div>
              {product.code === "arvoos" ? (
                <p className="abk-satir-not">
                  {dahilLimit ? `${sayi(uyeSayisi)} / ${sayi(dahilLimit)} kullanıcı dahil` : `${sayi(uyeSayisi)} kullanıcı`}
                  {ekKoltuk > 0 ? ` · ${sayi(ekKoltuk)} ek kullanıcı × ${formatTry(Number(license?.extra_user_fee ?? 0))} tutara dahil` : ""}
                </p>
              ) : null}
              {yenileme ? <p className="abk-not" data-tone={yenileme.son_hata ? "warning" : "success"}>
                Otomatik yenileme açık · {yenilemeKarti ? `•••• ${yenilemeKarti.son4}` : "kayıtlı kart"}{yenileme.son_hata ? ` · son deneme başarısız: ${yenileme.son_hata}` : " · her çekimden 3 gün önce bildirim gelir"}
              </p> : null}
              {canSubmit && !disari ? (
                /* Hangi ürünün kartla ödenebildiği tek yerde
                   (lib/products · KARTLA_ODENEBILEN); burada ayrıca
                   `!== "arc"` yazmak, iki listenin sessizce sapmasıydı. */
                kartAcik && storeReady && product.fee > 0 && KARTLA_ODENEBILEN.includes(product.code) ? (
                  <form action={kartlaOdemeyeBasla} className="abk-eylem">
                    <input type="hidden" name="product" value={product.code} />
                    <button className="panel-primary" type="submit">Kartla öde · {formatTry(product.fee)}</button>
                    <small>{yenileme ? "Şimdi öderseniz dönem uzar; otomatik yenileme sonraki dönemde devam eder." : yenilemeAcik ? "Dilerseniz kartınızı kaydedip otomatik yenilemeyi seçebilirsiniz." : "Ödemeyi bankanızın 3D Secure ekranında onaylarsınız; kartınızdan otomatik çekim yapılmaz."}</small>
                  </form>
                ) : storeReady && product.fee > 0 ? (
                  <form action={payLicenseWithCard} className="abk-eylem">
                    <input type="hidden" name="product" value={product.code} />
                    <button className="panel-primary" type="submit">Kartla öde · {formatTry(product.fee)}</button>
                    <small>Güvenli PayTR ödeme sayfasına yönlendirilirsiniz; ödeme onaylanınca lisans 1 ay uzar.</small>
                  </form>
                ) : <p className="abk-satir-not">{product.fee > 0 ? "Kartla ödeme şu an kullanılamıyor; Havale / EFT sekmesinden ödeyebilirsiniz." : "Aylık ücret henüz belirlenmedi. ArvoOS ile iletişime geçin."}</p>
              ) : null}
            </li>;
          })}
        </ul>
        {dahilLimit && ekKoltuk === 0 && uyeSayisi >= dahilLimit ? (
          <p className="ek-not">Dahil kullanıcı hakkınız dolu. Yeni kullanıcı davet edebilirsiniz; her biri aylık {formatTry(Number(license?.extra_user_fee ?? 0))} olarak faturanıza eklenir (en çok {sayi(Number(license?.extra_user_cap ?? 0))} ek kullanıcı).</p>
        ) : null}
        {subscriptions.some((p) => p.code === "arvolab") ? <p className="ek-not">ArvoLab asistan kredisi ArvoLab&apos;daki Abonelik ve kredi ekranından alınır; kredi ödemeleri burada, Ödemeler sekmesinde görünür.</p> : null}
      </section>

      <TalepAkis kimlik="abonelik" sinif="abk-sekmeler" etiket="Faturalama" sekmeler={sekmeler} baslangic={baslangicSekmesi}>
        {belgeler ? (
          <div className="abk-panel">
            {belgeler.proformalar.length || belgeler.faturalar.length ? <ul className="pu-liste abk-belgeler">
              {belgeler.proformalar.map((p) => {
                const durum = proformaGorunumu(p.durum, p.gecerlilikTarihi, bugun);
                return <li key={p.id}>
                  <Link href={`/panel/billing/proforma/${p.id}`}>
                    <span className="abk-belge-tur" data-tur="proforma" aria-hidden="true">PF</span>
                    <span className="pu-govde"><b>Proforma {p.no} · {productName(p.urun)}</b><small>Geçerlilik {istanbulDateTime(`${p.gecerlilikTarihi}T12:00:00Z`, { dateStyle: "medium" })}</small></span>
                    <span className="abk-tutar"><strong>{formatTry(p.toplam)}</strong><span className="status-pill" data-tone={durum === "odendi" ? "success" : durum === "bekliyor" ? "warning" : "neutral"}>{PROFORMA_DURUM_ADI[durum]}</span></span>
                  </Link>
                </li>;
              })}
              {belgeler.faturalar.map((f) => <li key={`${f.no}-${f.tarih}`}>
                {f.url ? <a href={f.url} target="_blank" rel="noreferrer">
                  <span className="abk-belge-tur" data-tur="fatura" aria-hidden="true">FT</span>
                  <span className="pu-govde"><b>Fatura {f.no} · {productName(f.urun)}</b><small>{istanbulDateTime(`${f.tarih}T12:00:00Z`, { dateStyle: "medium" })} · PDF</small></span>
                  <span className="abk-tutar"><strong>{formatTry(f.tutar)}</strong></span>
                </a> : <span className="abk-satir-ici">
                  <span className="abk-belge-tur" data-tur="fatura" aria-hidden="true">FT</span>
                  <span className="pu-govde"><b>Fatura {f.no} · {productName(f.urun)}</b><small>{istanbulDateTime(`${f.tarih}T12:00:00Z`, { dateStyle: "medium" })} · bağlantı üretilemedi</small></span>
                  <span className="abk-tutar"><strong>{formatTry(f.tutar)}</strong></span>
                </span>}
              </li>)}
            </ul> : <p className="pu-bos">Henüz proforma ya da fatura yok. Kesilen belgeler burada görünür.</p>}
          </div>
        ) : null}

        <div className="abk-panel">
          {payments?.length ? <ul className="pu-liste">
            {payments.map((payment) => <li key={payment.id}>
              <span className="abk-satir-ici">
                <span className="abk-belge-tur" data-tur="odeme" aria-hidden="true">₺</span>
                <span className="pu-govde"><b>{productName(payment.product ?? "arvoos")}</b><small>{istanbulDateTime(payment.created_at)}{payment.reference_no ? ` · ${payment.reference_no}` : ""}{payment.review_note ? ` · ${payment.review_note}` : ""}</small></span>
                <span className="abk-tutar"><strong>{formatTry(payment.amount)}</strong><span className="status-pill" data-tone={ODEME_TONU[payment.status] ?? "neutral"}>{ODEME_DURUMU[payment.status] ?? payment.status}</span></span>
              </span>
            </li>)}
          </ul> : <p className="pu-bos">Henüz ödeme bulunmuyor.</p>}
          {payments && payments.length >= 20 ? <p className="ek-not">Son 20 ödeme gösteriliyor.</p> : null}
        </div>

        {kartSekmesi ? (
          <div className="abk-panel">
            {aktifYenilemeler.length || kartlar.length ? <ul className="pu-liste">
              {aktifYenilemeler.map((y) => {
                const kart = kartlar.find((k) => k.id === y.kart_id);
                return <li key={y.product}>
                  <span className="abk-satir-ici">
                    <span className="abk-belge-tur" data-tur="yenileme" aria-hidden="true">↻</span>
                    <span className="pu-govde"><b>{productName(y.product)} · {kart ? `•••• ${kart.son4}` : "kart"} ile otomatik yenileniyor</b>
                      <small>Onay {istanbulDateTime(y.onay_at, { dateStyle: "short", timeStyle: "short" })}{y.son_hata ? ` · Son deneme başarısız: ${y.son_hata}` : ""}</small></span>
                    <form action={otomatikYenilemeyiKapat}><input type="hidden" name="product" value={y.product} /><button className="panel-secondary" type="submit">Kapat</button></form>
                  </span>
                </li>;
              })}
              {kartlar.map((k) => <li key={k.id}>
                <span className="abk-satir-ici">
                  <span className="abk-belge-tur" data-tur="kart" aria-hidden="true">••</span>
                  <span className="pu-govde"><b>{k.sema ?? "Kart"} •••• {k.son4}</b><small>{[k.banka, k.son_kullanma_ay && k.son_kullanma_yil ? `son kullanma ${k.son_kullanma_ay.padStart(2, "0")}/${k.son_kullanma_yil}` : null].filter(Boolean).join(" · ")}</small></span>
                  <form action={kayitliKartiKaldir}><input type="hidden" name="kart_id" value={k.id} /><button className="panel-secondary" type="submit">Kartı sil</button></form>
                </span>
              </li>)}
            </ul> : yenilemeAcik
              ? <p className="pu-bos">Kayıtlı kartınız yok. Kartla öderken &quot;Kartımı kaydet&quot; seçeneğini işaretlerseniz aboneliğiniz her dönem otomatik yenilenir; istediğiniz zaman buradan kapatabilirsiniz.</p>
              : <p className="pu-bos">Kayıtlı kartınız yok. Her dönemin ödemesi ayrı ayrı, bankanızın 3D Secure onayıyla alınır; kartınızdan otomatik çekim yapılmaz.</p>}
            <p className="ek-not">{yenilemeAcik
              ? "Kart bilgileriniz bizde tutulmaz; PayTR'nin güvenli kasasında saklanır. Onayınız olmadan çekim yapılmaz ve her çekimden 3 gün önce bildirim gelir."
              : "Kart bilgileriniz bizde tutulmaz; ödeme PayTR'nin güvenli sayfasında, bankanızın onayıyla yapılır."}</p>
          </div>
        ) : null}

        <div className="abk-panel">
          <h3 className="abk-alt">Banka hesapları</h3>
          {(bankAccounts ?? []).length ? <ul className="pu-liste">
            {(bankAccounts ?? []).map((account) => <li key={account.id}>
              <span className="abk-satir-ici">
                <span className="abk-belge-tur" data-tur="banka" aria-hidden="true">₺</span>
                <span className="pu-govde"><b>{account.bank_name}</b><small>{account.account_holder ?? "Hesap sahibi"} · {account.currency ?? "TRY"}</small></span>
                <code className="abk-iban">{formatIban(account.iban)}</code>
              </span>
            </li>)}
          </ul> : <p className="pu-bos">Tanımlı banka hesabı yok; kartla ödeyin ya da ArvoOS ile iletişime geçin.</p>}
          <p className="ek-not">Açıklama alanına kurum adınızı ve ürün adını (ya da proforma numarasını) yazın. Ödemeden sonra dekontu aşağıdan gönderin.</p>
          <h3 className="abk-alt">Dekont gönder</h3>
          {canSubmit ? (
            <form className="panel-form kayit-formu" action={submitBankTransferPayment}>
              {/* Önceden ürün gönderilmiyordu (varsayılan ArvoOS); ArvoARC/Randevu için
                  havaleyle ödeyen kurumun o ürünün lisansı uzamıyordu. */}
              <label>Ürün<select name="product" defaultValue="arvoos">{subscriptions.map((product) => <option key={product.code} value={product.code}>{product.name}</option>)}</select></label>
              <label><span>Banka hesabı<b className="req" aria-hidden="true">*</b></span><select name="bank_account_id" required>{(bankAccounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.bank_name} · {formatIban(account.iban)}</option>)}</select></label>
              <label>Paket<select name="plan_code" defaultValue={license?.plan_code ?? organization.plan_code}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></label>
              <label><span>Tutar (TL)<b className="req" aria-hidden="true">*</b></span><input name="amount" inputMode="decimal" required placeholder="0,00" /></label>
              <label className="wide">İşlem / referans no<input name="reference_no" maxLength={120} placeholder="İsteğe bağlı" /></label>
              <label className="wide"><span>Dekont<b className="req" aria-hidden="true">*</b></span><input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
              <label className="wide">Not<textarea name="customer_note" maxLength={1000} rows={3} placeholder="Ödemeyle ilgili açıklama" /></label>
              <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> zorunlu · dekont PDF, JPG, PNG veya WEBP, en fazla 10 MB</p><button className="panel-primary" type="submit">Dekontu gönder</button></div>
            </form>
          ) : <p className="ek-not">Dekont gönderimi yalnızca ödeme yetkisi olan kişi (kurum sahibi ya da yetkilendirilen yönetici) tarafından yapılabilir.</p>}
        </div>
      </TalepAkis>
    </div>
  </main>;
}
