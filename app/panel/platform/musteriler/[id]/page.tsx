import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { kurumTuru } from "@/lib/kurum-turu";
import { zorunlu } from "../../konsol-oku";
import { ADDON_PRODUCTS, productLicenseLabels, urunSimgesi } from "@/lib/products";
import { KBos, KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../../bicim";
import { ETKINLIK_ADI, VARLIK_ADI } from "../../kiraci-dosyasi";
import { KiraciUyeleri } from "../../kiraci-uyeleri";
import { kiraciUyeleriniOku } from "../../kiraci-uyeleri-oku";
import { LisansBolumu } from "../../licenses/lisans-bolumu";
import { KiraciDosyasi } from "../../kiraci-dosyasi";
import { kiraciDosyasiVerisi } from "../../kiraci-dosyasi-verisi";
import { OdemeBolumu, type Odeme, type UrunSatiri } from "./bolumler";
import { MusteriPenceresi } from "./pencere";
import "../../platform.css";

/*
  MÜŞTERİ DETAYI (14.10.2026, kurum sahibinin isteği).

  Müşteriler listesinde bir satıra basınca kiracı dosyası açılıyordu:
  kurulum adımları, modül anahtarları, kurum ayarları formu — kiracının
  TEKNİK dosyası. Kurucunun müşteriye bakarken sorduğu soru başka:
  "bu müşteri ne kullanıyor, ne ödüyor, ne zaman yenileniyor, kime
  ulaşırım".

  SADE SAYFA, ALTI PENCERE (aynı gün, ikinci istek: "çok fazla buton çok
  fazla sayfa var … butonların sayfası müşteri detay sayfasında açılan
  popup olsun"). Sayfanın kendisi yalnızca özet: şerit, ürünler,
  iletişim, son etkinlik. Lisanslar, Güncel Fiyat, Cari Hesap, Ödemeler,
  Faturalar ve Kullanıcılar üstteki düğmelerle bu sayfanın içinde
  pencerede açılıyor; kurucu müşteriden ayrılmadan lisansı düzenliyor,
  dekontu onaylıyor, kullanıcının erişimini kapatıyor.

  Pencereler YENİ bir düzenleme yolu değil: Lisanslar konsolun lisans
  bileşenini (LisansBolumu), Kullanıcılar kiracı dosyasının üye listesini,
  ödeme kararı Ödemeler sayfasının formunu ve işlemini kullanıyor. Aynı
  işin iki ayrı kodu olsaydı biri ötekinin kuralını atlardı.

  Ödeme, üyelik ve etkinlik kayıtları yalnızca kurum üyelerine açık
  (RLS); kurucu bunları sunucu anahtarıyla okuyor — sayfanın başında
  kurucu doğrulanıyor.
*/

const ACIK = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

/*
  DÖRT PENCERE (14.10.2026, "pencereleri birleştir, daha hızlı olsun").
  Yediydi: Güncel Fiyat Lisanslar'a katıldı (liste fiyatı ürün satırında),
  Cari Hesap ve Faturalar Ödemeler'e (aynı ödemeleri iki pencere ayrı
  listeliyordu). Eski adresler (?pencere=fiyat / cari / faturalar)
  ESKI_PENCERE ile yeni karşılığına açılıyor.
*/
const PENCERELER = [
  { kod: "lisanslar", ad: "Lisanslar" },
  { kod: "odemeler", ad: "Ödemeler" },
  { kod: "kullanicilar", ad: "Kullanıcılar" },
  /* Kiracı dosyası (14.10.2026): ayrı sayfası kaldırıldı; kurum ayarları
     formu, modüller, kurulum adımları ve sahibe giriş bağlantısı burada. */
  { kod: "ayarlar", ad: "Kurum Ayarları" },
] as const;
type PencereKodu = (typeof PENCERELER)[number]["kod"];
const ESKI_PENCERE: Record<string, PencereKodu> = { fiyat: "lisanslar", cari: "odemeler", faturalar: "odemeler" };

type Kurum = {
  id: string; name: string; display_name: string | null; slug: string; kind: string | null; plan_code: string | null;
  provisioning_state: string; license_status: string | null; monthly_fee: number | null; current_period_end: string | null;
  trial_ends_at: string | null; user_limit: number | null; aktif_uye: number; contact_phone: string | null;
  custom_domain: string | null; davet_eposta: string | null; grup_markasi: boolean | null;
};
type UrunLisansi = { product: string; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null; trial_ends_at: string | null };

const ODEME_SECIMI = "id,organization_id,amount,currency,status,product,plan_code,created_at,reviewed_at,payment_method,receipt_path,reference_no,customer_note,review_note";

export default async function MusteriDetayi({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pencere?: string; provisioned?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const [{ id }, { pencere: pencereParametresi, provisioned }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const pencere = PENCERELER.find((p) => p.kod === pencereParametresi)?.kod ?? ESKI_PENCERE[pencereParametresi ?? ""] ?? null;

  const admin = createAdminClient();
  /*
    Ödemeler bu kurumla SINIRLI ve bilerek sınırsız okunuyor: şeritteki
    "toplam tahsilat" ve Cari Hesap'ın yürüyen toplamı bunların toplamı;
    bir sınır koymak toplamı sessizce eksiltirdi (check:rakamlar). Kurum
    başına ayda bir-iki satır.
  */
  const [{ data: kurumSatiri, error: kurumHatasi }, { data: kayit }, { data: urunSatirlari, error: urunHatasi }, { data: odemeSatirlari, error: odemeHatasi }, { data: etkinlikSatirlari }] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,slug,kind,plan_code,provisioning_state,license_status,monthly_fee,current_period_end,trial_ends_at,user_limit,aktif_uye,contact_phone,custom_domain,davet_eposta,grup_markasi")
      .eq("id", id).maybeSingle(),
    supabase.from("organizations").select("created_at").eq("id", id).maybeSingle(),
    supabase.from("organization_product_licenses").select("product,status,plan_code,monthly_fee,current_period_end,trial_ends_at").eq("organization_id", id),
    supabase.from("organization_payment_requests").select(ODEME_SECIMI).eq("organization_id", id).order("created_at", { ascending: false }),
    admin
      ? admin.from("activity_logs").select("action,entity_type,created_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
  ]);
  if (kurumHatasi) throw new Error(`Müşteri okunamadı: ${kurumHatasi.message}`);
  if (!kurumSatiri) notFound();
  // Ürünler ve ödemeler sayfanın asıl konusu: okunamamaları "yok" demek değil.
  if (urunHatasi) throw new Error(`Ürün lisansları okunamadı: ${urunHatasi.message}`);
  if (odemeHatasi) throw new Error(`Ödemeler okunamadı: ${odemeHatasi.message}`);
  const kurum = kurumSatiri as unknown as Kurum;
  const odemeler = (odemeSatirlari ?? []) as Odeme[];
  const etkinlikler = (etkinlikSatirlari ?? []) as { action: string; entity_type: string; created_at: string }[];

  // ---- Ürünler: çekirdek (ArvoOS) + ek ürünler, tek liste.
  const urunById = new Map(((urunSatirlari ?? []) as UrunLisansi[]).map((u) => [u.product, u]));
  const urunler: UrunSatiri[] = [
    { kod: "arvoos", ad: "ArvoOS", status: kurum.license_status ?? "inactive", planCode: kurum.plan_code, ucret: kurum.monthly_fee, donem: kurum.current_period_end, deneme: kurum.trial_ends_at },
    ...ADDON_PRODUCTS.map((p) => {
      const l = urunById.get(p.code);
      return { kod: p.code, ad: p.name, status: l?.status ?? "inactive", planCode: l?.plan_code ?? null, ucret: l?.monthly_fee ?? null, donem: l?.current_period_end ?? null, deneme: l?.trial_ends_at ?? null };
    }),
  ];
  const kullandigi = urunler.filter((u) => u.status !== "inactive");
  const aylik = urunler.filter((u) => ODEYEN.has(u.status)).reduce((t, u) => t + Number(u.ucret ?? 0), 0);
  const yenileme = urunler
    .filter((u) => ACIK.has(u.status))
    .map((u) => (u.status === "trialing" ? u.deneme : u.donem))
    .filter((t): t is string => Boolean(t)).sort()[0] ?? null;

  const onaylanan = odemeler.filter((o) => o.status === "approved");
  const toplamTahsilat = onaylanan.reduce((t, o) => t + Number(o.amount ?? 0), 0);
  const bekleyen = odemeler.filter((o) => o.status === "pending");

  const ad = kurum.display_name || kurum.name;
  /*
    ÜCRET ÇERÇEVESİ ÜÇ TÜRE GÖRE (14.10.2026). `grup` yalnızca
    grup_markasi'na bakıyordu: Arvo'nun kendi kaydında ekran "Aylık
    tutar" yazıyor, oysa Müşteriler listesi aynı tutarı "grup içi
    değer"e yazıyordu. Müşteri olmayan her kurumda (grup + arvo) tutar
    grup içi değerdir (lib/kurum-turu).
  */
  const tur = kurumTuru(kurum);
  const grup = tur !== "musteri";
  const acikUrun = kullandigi.find((u) => ACIK.has(u.status));
  const genelDurum = kurum.provisioning_state === "failed"
    ? { ad: "Kurulum hatası", ton: "danger" }
    : acikUrun ? { ad: productLicenseLabels[acikUrun.status] ?? acikUrun.status, ton: LISANS_TONU[acikUrun.status] ?? "neutral" }
      : { ad: "Erişim kapalı", ton: "danger" };

  const adres = `/panel/platform/musteriler/${id}`;

  async function pencereyiKur(kod: PencereKodu) {
    if (kod === "lisanslar") return <LisansBolumu supabase={supabase} organizationId={id} label={ad} />;
    if (kod === "odemeler") return <OdemeBolumu supabase={supabase} odemeler={odemeler} kurumAdi={ad} urunler={urunler} grup={grup} />;
    if (kod === "ayarlar") {
      const veri = await kiraciDosyasiVerisi(supabase, id);
      return veri ? <KiraciDosyasi supabase={supabase} {...veri} pencerede /> : <KBos baslik="Kurum bulunamadı" />;
    }
    /*
      HATA YUTULMUYOR (konsol-oku). Okuma düştüğünde `?? []` listeyi
      boşaltıyordu ve pencere "bu kurumun kullanıcısı yok" diyordu —
      hem de erişimin açılıp kapatıldığı ekranda. Kurucu için "üye yok"
      ile "üyeleri okuyamadım" aynı şey değil: birincisine bakıp geçer.
    */
    const uyelikSonucu = await (admin ?? supabase).from("organization_memberships")
      .select("organization_id,user_id,role,is_active").eq("organization_id", id);
    const uyelikler = zorunlu(uyelikSonucu, "Kurumun üyelikleri");
    const uyeler = await kiraciUyeleriniOku(supabase, admin, id, (uyelikler ?? []) as { organization_id: string; user_id: string; role: string; is_active: boolean }[]);
    return (
      <KKart baslik="Kullanıcılar" aciklama="Kurumun panel hesapları; erişim buradan açılıp kapatılır." sag={<span className="status-pill">{sayi(Number(kurum.aktif_uye))}{kurum.user_limit ? ` / ${sayi(Number(kurum.user_limit))}` : ""}</span>}>
        <KiraciUyeleri organizationId={id} kurumAdi={ad} uyeler={uyeler} />
      </KKart>
    );
  }

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link> · {tur === "grup" ? "GRUP MARKASI" : tur === "arvo" ? "ARVO" : "KURUMSAL"}</small>
        <h1>{ad}</h1>
      </div>
      <nav className="talep-bas-eylem musteri-pencereleri" aria-label="Müşteri bölümleri">
        {PENCERELER.map((p) => (
          <Link key={p.kod} className="panel-secondary" href={`${adres}?pencere=${p.kod}`} scroll={false}
            aria-current={pencere === p.kod ? "page" : undefined}>
            {p.ad}
            {p.kod === "odemeler" && bekleyen.length ? <span className="musteri-rozet">{bekleyen.length}</span> : null}
          </Link>
        ))}
      </nav>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Müşteri özeti">
      <dl>
        <div><dt>Durum</dt><dd><span className="status-pill" data-tone={genelDurum.ton}>{genelDurum.ad}</span></dd></div>
        <div>
          <dt>{grup ? "Grup içi değer" : "Aylık tutar"}</dt>
          <dd className={aylik ? "cari-arti" : "talep-bos"}>{aylik ? para(aylik) : "Ücret yok"}</dd>
          <small>{kullandigi.filter((u) => ODEYEN.has(u.status)).length} ödeyen ürün</small>
        </div>
        <div><dt>En yakın yenileme</dt><dd className={yenileme ? undefined : "talep-bos"}>{yenileme ? tarih(yenileme) : "—"}</dd></div>
        <div>
          <dt>Kullanıcı</dt>
          <dd>{sayi(Number(kurum.aktif_uye))}{kurum.user_limit ? ` / ${sayi(Number(kurum.user_limit))}` : ""}</dd>
          <small>{kurum.plan_code ? `${PAKET_ADI[kurum.plan_code] ?? kurum.plan_code} paket` : "Paket yok"}</small>
        </div>
        <div>
          <dt>Toplam tahsilat</dt>
          <dd className={toplamTahsilat ? undefined : "talep-bos"}>{toplamTahsilat ? para(toplamTahsilat) : "Yok"}</dd>
          <small>{onaylanan[0] ? `son ${tarih(onaylanan[0].reviewed_at ?? onaylanan[0].created_at)}` : "henüz ödeme yok"}</small>
        </div>
        <div><dt>Müşteri olduğu tarih</dt><dd>{tarih((kayit as { created_at?: string } | null)?.created_at ?? null)}</dd></div>
      </dl>
    </nav>

    {provisioned === "1" ? (
      <KNot ton="basari"><b>{ad} kuruldu.</b> Davet {kurum.davet_eposta ?? "sahibin e-posta adresine"} gönderildi. E-posta gelmezse Kurum Ayarları&apos;ndan giriş bağlantısı oluşturup WhatsApp&apos;tan gönderin.</KNot>
    ) : null}
    {grup ? <KNot>{tur === "arvo" ? "Arvo&apos;nun kendi kaydı" : "Grup markası"}: ücretleri müşteri gelirine ve tahsilata girmez, konsolda &quot;grup içi değer&quot; olarak toplanır.</KNot> : null}
    {bekleyen.length ? (
      <KNot ton="uyari">{bekleyen.length} ödeme bildirimi onay bekliyor. <Link href={`${adres}?pencere=odemeler`} scroll={false}>Ödemeler&apos;de incele →</Link></KNot>
    ) : null}

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Ürünler">
        <KListe>
          {urunler.map((u) => {
            const acik = ACIK.has(u.status);
            const tarihi = u.status === "trialing" ? u.deneme : u.donem;
            return (
              <KOge
                key={u.kod}
                href={`${adres}?pencere=lisanslar`}
                simge={urunSimgesi(u.kod) ?? u.ad}
                baslik={u.ad}
                alt={u.status === "inactive" ? "Kullanmıyor" : tarihi ? `${u.status === "trialing" ? "deneme bitişi" : "dönem sonu"} ${tarih(tarihi)}` : "dönem girilmedi"}
                durum={{ etiket: productLicenseLabels[u.status] ?? u.status, ton: acik ? LISANS_TONU[u.status] ?? "neutral" : "neutral" }}
                deger={u.ucret ? para(Number(u.ucret)) : u.status === "inactive" ? "—" : <span className="k-ios-eksik">Ücret yok</span>}
                degerAlt={u.ucret ? (grup ? "grup içi" : "aylık") : undefined}
              />
            );
          })}
        </KListe>
      </section>

      <div className="liste-sag">
        <KKart baslik="İletişim" sag={<Link className="panel-secondary" href={`${adres}?pencere=ayarlar`} scroll={false}>Düzenle</Link>}>
          <KListe>
            <KOge baslik="Yasal unvan" deger={kurum.name} />
            <KOge baslik="Yetkili e-posta" deger={kurum.davet_eposta ? <a href={`mailto:${kurum.davet_eposta}`}>{kurum.davet_eposta}</a> : <span className="k-ios-eksik">Yok</span>} />
            <KOge baslik="Telefon" deger={kurum.contact_phone ? <a href={`tel:${kurum.contact_phone.replace(/\s/g, "")}`}>{kurum.contact_phone}</a> : <span className="k-ios-eksik">Girilmedi</span>} />
            {kurum.custom_domain ? <KOge baslik="Alan adı" deger={kurum.custom_domain} /> : null}
          </KListe>
        </KKart>

        <KKart baslik="Son etkinlik">
          {etkinlikler.length ? (
            <KListe>
              {etkinlikler.map((e, i) => (
                <KOge key={`${e.created_at}-${i}`} baslik={ETKINLIK_ADI[e.action] ?? e.action} alt={VARLIK_ADI[e.entity_type] ?? e.entity_type} deger={tarih(e.created_at)} />
              ))}
            </KListe>
          ) : <KBos baslik="Etkinlik yok" />}
        </KKart>
      </div>
    </div>

    {/*
      Pencere HEMEN açılıyor, içeriği akarak geliyor (Suspense). Eskiden
      sayfa pencerenin verisini bekleyip öyle çiziliyordu: Lisanslar
      ArvoLab, ARC ve Randevu'ya gittiği için düğmeye basınca bir saniye
      hiçbir şey olmuyordu — "çalışmıyor mu" dedirten bekleyiş.
    */}
    {pencere ? (
      <MusteriPenceresi key={pencere} ust={ad} baslik={PENCERELER.find((p) => p.kod === pencere)!.ad} kapatAdresi={adres}>
        <Suspense fallback={<p className="panel-muted musteri-yukleniyor">Yükleniyor…</p>}>
          {pencereyiKur(pencere)}
        </Suspense>
      </MusteriPenceresi>
    ) : null}
  </main>;
}
