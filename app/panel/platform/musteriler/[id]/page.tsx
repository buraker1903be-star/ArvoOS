import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { kurumTuru } from "@/lib/kurum-turu";
import { zorunlu } from "../../konsol-oku";
import { ADDON_PRODUCTS, productLicenseLabels, urunSimgesi } from "@/lib/products";
import { KBos, KKart, KListe, KNot, KOge } from "../../konsol-ui";
import { KURULUM_ADI, LISANS_TONU, PAKET_ADI, para, sayi, tarih } from "../../bicim";
import { ETKINLIK_ADI, VARLIK_ADI } from "../../kiraci-dosyasi";
import { KiraciUyeleri } from "../../kiraci-uyeleri";
import { kiraciUyeleriniOku } from "../../kiraci-uyeleri-oku";
import { LisansBolumu } from "../../licenses/lisans-bolumu";
import { KiraciDosyasi } from "../../kiraci-dosyasi";
import { kiraciDosyasiVerisi } from "../../kiraci-dosyasi-verisi";
import { OdemeBolumu, type Odeme, type UrunSatiri } from "./bolumler";
import { BelgeBolumu } from "./belgeler";
import { HareketBolumu } from "./hareketler";
import "../../platform.css";
import "../../../hr/hr.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../../crm/crm.css";
import "../../finans.css";
import "./musteri-karti.css";

/*
  MÜŞTERİ DETAYI (14.10.2026, kurum sahibinin isteği).

  Müşteriler listesinde bir satıra basınca kiracı dosyası açılıyordu:
  kurulum adımları, modül anahtarları, kurum ayarları formu — kiracının
  TEKNİK dosyası. Kurucunun müşteriye bakarken sorduğu soru başka:
  "bu müşteri ne kullanıyor, ne ödüyor, ne zaman yenileniyor, kime
  ulaşırım".

  Bölümler YENİ bir düzenleme yolu değil: Ürünler ve lisans konsolun
  lisans bileşenini (LisansBolumu), Kullanıcılar kiracı dosyasının üye
  listesini, ödeme kararı Ödemeler sayfasının formunu ve işlemini
  kullanıyor. Aynı işin iki ayrı kodu olsaydı biri ötekinin kuralını
  atlardı. (14.10.2026'dan 29.10.2026'ya kadar bunlar açılır
  pencerelerdi; aşağıdaki SEKMELER notu.)

  Ödeme, üyelik ve etkinlik kayıtları yalnızca kurum üyelerine açık
  (RLS); kurucu bunları sunucu anahtarıyla okuyor — sayfanın başında
  kurucu doğrulanıyor.
*/

const ACIK = new Set(["active", "trialing", "past_due"]);
const ODEYEN = new Set(["active", "past_due"]);

/*
  SEKMELİ MÜŞTERİ KARTI (29.10.2026, konsol yeniden kurulurken: "panel
  kalitesinde"). Dört bölüm başlıktaki düğmelerle açılan PENCERELERDİ;
  sayfanın kendisi yalnızca bir özetti ve kurucu her iş için pencere
  açıp kapatıyordu. Personel kartında olduğu gibi artık tek bir sekmeli
  kart: Bilgiler · Ürünler ve lisans · Kullanıcılar · Ödemeler ve
  proformalar · Kurulum.

  Sekmeler BAĞLANTI, istemci sekmesi değil: Ürünler ve lisans sekmesi
  ArvoLab, ArvoARC ve ArvoCal'a gidiyor ve beş sekmenin hepsini her
  açılışta sunucuda çizmek sayfayı en yavaş köprü kadar yavaşlatırdı.
  Seçili sekme adreste (?pencere=), yalnızca o okunuyor; formu kaydeden
  sekme yeniden çizimde açık kalıyor. Parametrenin adı bilerek
  değişmedi: konsolun on beş yerinde ?pencere=lisanslar / ayarlar /
  odemeler bağlantısı var, ESKI_SEKME onları yeni sekmelerine açıyor.
*/
const SEKMELER = [
  { kod: "bilgiler", ad: "Bilgiler" },
  { kod: "urunler", ad: "Ürünler ve lisans" },
  { kod: "kullanicilar", ad: "Kullanıcılar" },
  { kod: "odemeler", ad: "Ödemeler ve proformalar" },
  /* Bütün kayıtlar tek zaman çizelgesinde (lib/musteri-hareketleri). */
  { kod: "hareketler", ad: "Hareketler" },
  /* Kiracı dosyası: kurum ayarları formu, modüller, kurulum adımları ve
     sahibe giriş bağlantısı. */
  { kod: "kurulum", ad: "Kurulum" },
] as const;
type SekmeKodu = (typeof SEKMELER)[number]["kod"];
const ESKI_SEKME: Record<string, SekmeKodu> = {
  lisanslar: "urunler", fiyat: "urunler", ayarlar: "kurulum", cari: "odemeler", faturalar: "odemeler",
};

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
  searchParams: Promise<{ pencere?: string; provisioned?: string; tur?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const [{ id }, { pencere: pencereParametresi, provisioned, tur: hareketTuru }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sekme: SekmeKodu = SEKMELER.find((x) => x.kod === pencereParametresi)?.kod ?? ESKI_SEKME[pencereParametresi ?? ""] ?? "bilgiler";

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

  async function sekmeyiKur(kod: Exclude<SekmeKodu, "bilgiler">) {
    if (kod === "urunler") return <LisansBolumu supabase={supabase} organizationId={id} label={ad} />;
    if (kod === "odemeler") return <>
      <OdemeBolumu supabase={supabase} odemeler={odemeler} kurumAdi={ad} urunler={urunler} grup={grup} />
      <BelgeBolumu organizationId={id} />
    </>;
    if (kod === "hareketler") return <HareketBolumu admin={admin} organizationId={id} odemeler={odemeler} kayitAcildi={olusma} tur={hareketTuru} adres={adres} />;
    if (kod === "kurulum") {
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

  const olusma = (kayit as { created_at?: string } | null)?.created_at ?? null;
  const sekmeAdresi = (kod: SekmeKodu) => (kod === "bilgiler" ? adres : `${adres}?pencere=${kod}`);
  const sekmeEki = (kod: SekmeKodu) =>
    kod === "odemeler" && bekleyen.length ? <span className="pu-sayi" data-tone="warning">{bekleyen.length}</span>
      : kod === "kullanicilar" ? <span className="pu-sayi">{sayi(Number(kurum.aktif_uye))}</span>
      : kod === "urunler" && kullandigi.length ? <span className="pu-sayi">{kullandigi.length}</span>
      : null;

  return <main className="plt talep cari ekip musteri-karti">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link> · {tur === "grup" ? "GRUP MARKASI" : tur === "arvo" ? "ARVO" : "KURUMSAL"}</small>
        <h1>{ad}</h1>
        <p className="ek-alt">{[ad !== kurum.name ? kurum.name : null, kurum.custom_domain || `${kurum.slug}.arvo-os.com`, olusma ? `${tarih(olusma)} tarihinden beri` : null].filter(Boolean).join(" · ")}</p>
      </div>
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
          <dd><Link href={sekmeAdresi("kullanicilar")} scroll={false}>{sayi(Number(kurum.aktif_uye))}{kurum.user_limit ? ` / ${sayi(Number(kurum.user_limit))}` : ""}</Link></dd>
          <small>{kurum.plan_code ? `${PAKET_ADI[kurum.plan_code] ?? kurum.plan_code} paket` : "Paket yok"}</small>
        </div>
        <div>
          <dt>Toplam tahsilat</dt>
          <dd className={toplamTahsilat ? undefined : "talep-bos"}><Link href={sekmeAdresi("odemeler")} scroll={false}>{toplamTahsilat ? para(toplamTahsilat) : "Yok"}</Link></dd>
          <small>{onaylanan[0] ? `son ${tarih(onaylanan[0].reviewed_at ?? onaylanan[0].created_at)}` : "henüz ödeme yok"}</small>
        </div>
      </dl>
    </nav>

    {provisioned === "1" ? (
      <KNot ton="basari"><b>{ad} kuruldu.</b> Davet {kurum.davet_eposta ?? "sahibin e-posta adresine"} gönderildi. E-posta gelmezse Kurulum sekmesinden giriş bağlantısı oluşturup WhatsApp&apos;tan gönderin.</KNot>
    ) : null}
    {grup ? <KNot>{tur === "arvo" ? "Arvo'nun kendi kaydı" : "Grup markası"}: ücretleri müşteri gelirine ve tahsilata girmez, konsolda &quot;grup içi değer&quot; olarak toplanır.</KNot> : null}
    {bekleyen.length && sekme !== "odemeler" ? (
      <KNot ton="uyari">{bekleyen.length} ödeme bildirimi onay bekliyor. <Link href={sekmeAdresi("odemeler")} scroll={false}>Ödemeler sekmesinde incele →</Link></KNot>
    ) : null}

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="talep-akis panel-card" aria-label="Müşteri kartı">
        <nav className="talep-akis-sekmeler" aria-label="Müşteri bölümleri">
          {SEKMELER.map((x) => (
            <Link key={x.kod} href={sekmeAdresi(x.kod)} scroll={false} replace
              className={sekme === x.kod ? "is-active" : undefined} aria-current={sekme === x.kod ? "page" : undefined}>
              {x.ad}{sekmeEki(x.kod)}
            </Link>
          ))}
        </nav>
        <div className="mu-govde">
          {sekme === "bilgiler" ? <>
            <header className="phr-bas"><h2>Ürünler</h2><Link className="pu-tumu" href={sekmeAdresi("urunler")} scroll={false}>Lisansı düzenle</Link></header>
            <ul className="pu-liste">
              {urunler.map((u) => {
                const acik = ACIK.has(u.status);
                const tarihi = u.status === "trialing" ? u.deneme : u.donem;
                return (
                  <li key={u.kod} className={u.status === "inactive" ? "is-pasif" : undefined}>
                    <Link href={sekmeAdresi("urunler")} scroll={false}>
                      <span className="mu-simge" aria-hidden="true">{urunSimgesi(u.kod) ?? u.ad.slice(0, 2)}</span>
                      <span className="pu-govde">
                        <b>{u.ad}</b>
                        <small>{u.status === "inactive" ? "Kullanmıyor" : [u.planCode ? `${PAKET_ADI[u.planCode] ?? u.planCode} paket` : null, tarihi ? `${u.status === "trialing" ? "deneme bitişi" : "dönem sonu"} ${tarih(tarihi)}` : "dönem girilmedi"].filter(Boolean).join(" · ")}</small>
                      </span>
                      {u.status === "inactive" ? null : (
                        <span className="mu-tutar">{u.ucret ? <>{para(Number(u.ucret))}<small>{grup ? "grup içi" : "aylık"}</small></> : <span className="k-ios-eksik">Ücret yok</span>}</span>
                      )}
                      <span className="status-pill" data-tone={acik ? LISANS_TONU[u.status] ?? "neutral" : "neutral"}>{productLicenseLabels[u.status] ?? u.status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <header className="phr-bas"><h2>Kurum</h2><Link className="pu-tumu" href={sekmeAdresi("kurulum")} scroll={false}>Kurum ayarları</Link></header>
            <dl className="talep-liste talep-liste--iki mu-bilgi">
              <div><dt>Yasal unvan</dt><dd>{kurum.name}</dd></div>
              <div><dt>Görünen ad</dt><dd>{kurum.display_name || <em>Unvanla aynı</em>}</dd></div>
              <div><dt>Çalışma alanı</dt><dd className="plt-mono">{kurum.slug}</dd></div>
              <div><dt>Alan adı</dt><dd>{kurum.custom_domain || <em>Yok</em>}</dd></div>
              <div><dt>Paket</dt><dd>{kurum.plan_code ? PAKET_ADI[kurum.plan_code] ?? kurum.plan_code : <em>Yok</em>}</dd></div>
              <div><dt>Kullanıcı limiti</dt><dd>{kurum.user_limit ? sayi(Number(kurum.user_limit)) : <em>Sınırsız</em>}</dd></div>
              <div><dt>Kurulum</dt><dd><span className="status-pill" data-tone={kurum.provisioning_state === "failed" ? "danger" : kurum.provisioning_state === "active" ? "success" : "info"}>{KURULUM_ADI[kurum.provisioning_state] ?? kurum.provisioning_state}</span></dd></div>
              <div><dt>Müşteri olduğu tarih</dt><dd>{tarih(olusma)}</dd></div>
            </dl>
          </> : (
            /* İçerik akarak geliyor (Suspense): sekme hemen değişiyor,
               köprüye giden Ürünler ve lisans sekmesi bir saniye "boş
               düğme" gibi beklemiyor. */
            <Suspense key={sekme} fallback={<p className="pu-bos">Yükleniyor…</p>}>
              {sekmeyiKur(sekme)}
            </Suspense>
          )}
        </div>
      </section>

      <div className="liste-sag">
        <KKart baslik="İletişim" sag={<Link className="pu-tumu" href={sekmeAdresi("kurulum")} scroll={false}>Düzenle</Link>}>
          <KListe>
            <KOge baslik="Yetkili e-posta" deger={kurum.davet_eposta ? <a href={`mailto:${kurum.davet_eposta}`}>{kurum.davet_eposta}</a> : <span className="k-ios-eksik">Yok</span>} />
            <KOge baslik="Telefon" deger={kurum.contact_phone ? <a href={`tel:${kurum.contact_phone.replace(/\s/g, "")}`}>{kurum.contact_phone}</a> : <span className="k-ios-eksik">Girilmedi</span>} />
          </KListe>
        </KKart>

        <KKart baslik="Son etkinlik" aciklama="Kurumun panelinde yapılan son işlemler">
          {etkinlikler.length ? (
            <KListe>
              {etkinlikler.map((e, i) => (
                <KOge key={`${e.created_at}-${i}`} baslik={ETKINLIK_ADI[e.action] ?? e.action} alt={VARLIK_ADI[e.entity_type] ?? e.entity_type} deger={tarih(e.created_at)} />
              ))}
            </KListe>
          ) : <KBos baslik="Etkinlik yok" aciklama="Kurumun panelinde bir işlem yapıldığında son hareketler burada görünür." />}
        </KKart>
      </div>
    </div>
  </main>;
}
