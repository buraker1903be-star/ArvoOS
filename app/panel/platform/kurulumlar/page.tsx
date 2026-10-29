import Link from "next/link";
import { notFound } from "next/navigation";
// Paket adı tek kaynaktan, sitedeki adla aynı (plans.name eski adı taşıyabilir).
import { paketAdi } from "@/lib/paket-adlari";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../konsol-oku";
import { createAdminClient } from "@/lib/supabase/admin";
import { ucretSapmasi } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { PanelDrawer } from "../../components/panel-drawer";
import { NewOrganizationWizard } from "../new-organization-wizard";
import { createCustomerOrganization } from "../actions";
import { basHarfleri, LISANS_TONU, PAKET_ADI, KURULUM_ADI, KURULUM_TONU, para, sayi, tarih, tarihSaat } from "../bicim";
import { productLicenseLabels } from "@/lib/products";
import { listeFiyatiniUygula } from "./actions";
import { kurumTuru } from "@/lib/kurum-turu";
import { KNot } from "../konsol-ui";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
// Sihirbaz (.plw) ve sözleşme no (.plt-mono) burada.
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

/*
  KURULUMLAR (14.10.2026, kurum sahibinin tarifi).

  Kurulum üç aşamalı bir iştir ve üçü ayrı sorular sorar:

    1. Yeni kurulum        — panelden onaylanmış ya da elle girilen müşteri
    2. Kurulumu devam eden — başladı, bitmedi; kurucunun bekleyeni
    3. Tamamlanan          — çalışıyor; deneme ve ücret tanımı burada

  Eskiden üçü tek bir kiracı listesiydi ve aşama yalnızca bir rozetti:
  "bugün hangi kurulumu bitirmem gerek" sorusunun yanıtı listeyi gözle
  taramaktı.

  ÜCRET YAYIMLANMIŞ LİSTEDEN. Üçüncü aşamada paketin liste fiyatı
  (lib/paket-ucreti; konsolda yayımlanan tablo, yoksa lib/site/pricing) yazılı duruyor ve tek
  tıkla uygulanıyor; kurucu tutarı elle yazmıyordu diye değil, elle
  yazılan tutar listeden sapıyordu diye. Sapma hata sayılmıyor —
  çoğu kiracının pazarlıkla değişmiş tutarı var — yalnızca gösteriliyor.
*/

const ACIK_LISANS = new Set(["active", "trialing", "past_due"]);
const BEKLEYEN = new Set(["creating", "inviting_owner", "waiting_owner"]);

type Kiraci = {
  id: string; name: string; slug: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null;
  provisioning_state: string; contact_phone: string | null;
  license_status: string | null; plan_code: string | null;
  monthly_fee: number | null; trial_ends_at: string | null;
  current_period_end: string | null; aktif_uye: number;
  davet_eposta: string | null; davet_durumu: string | null; davet_gonderildi: string | null; davet_hatasi: string | null;
};

const ASAMALAR = [
  { kod: "yeni", ad: "Yeni kurulum" },
  { kod: "devam", ad: "Kurulumu devam eden" },
  { kod: "tamam", ad: "Tamamlanan" },
] as const;

export default async function KurulumlarPage({ searchParams }: {
  searchParams: Promise<{ asama?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const { asama } = await searchParams;
  const secili = ASAMALAR.some((a) => a.kod === asama) ? asama! : "devam";

  const [kiraciSonucu, planSonucu, fiyatlar] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,slug,display_name,kind,grup_markasi,provisioning_state,contact_phone,license_status,plan_code,monthly_fee,trial_ends_at,current_period_end,aktif_uye,davet_eposta,davet_durumu,davet_gonderildi,davet_hatasi")
      .order("name"),
    supabase.from("plans").select("code,name").eq("is_active", true).order("code"),
    // Liste fiyatı konsolda yayımlanan tablodan (sitedekiyle aynı).
    yayimlananFiyatlar(),
  ]);
  /*
    Sayfanın ASIL verisi: okunamazsa sayfa hata veriyor. Eskiden `?? []`
    ile boş diziye düşüyordu ve ekran "kayıt yok" diyordu — "iş yok" ile
    "okuyamadım" aynı şey değil (konsol-oku.ts).
  */
  const kiraciSatirlari = zorunlu(kiraciSonucu, "Kiracılar");
  const planSatirlari = zorunlu(planSonucu, "Paketler");

  /*
    YENİ KURULUM = KİRACISI OLMAYAN BEKLEYEN İSTEK (14.10.2026). Eskiden
    burada ONAYLANMIŞ ama kurumu açılmamış istekler aranıyordu; oysa
    onay (sozlesmeler/actions.ts) hedef kiracı seçilmeden yapılamıyor —
    sekme her zaman boştu. Yeni müşterinin isteği onaydan ÖNCE burada:
    önce kurum açılır, sonra sözleşme kuyruğunda o kuruma onaylanır.

    İstekler yalnızca sunucu anahtarıyla okunuyor (sözleşme kuyruğundaki
    kuralın aynısı). Anahtar yoksa bölüm "istek yok" demiyor, okunamadığını
    yazıyor.
  */
  const { data: istekSatirlari, error: istekHatasi } = admin
    ? await admin.from("platform_subscription_requests")
        .select("id,contract_no,customer_name,amount,currency,status,created_at,target_organization_id")
        .eq("status", "pending").is("target_organization_id", null)
        .order("created_at", { ascending: false }).limit(20)
    : { data: null, error: null };

  const tumKiracilar = (kiraciSatirlari ?? []) as unknown as Kiraci[];
  /*
    Yalnızca ARVO'NUN KENDİ KURUMU eleniyor; grup markaları listede
    kalıyor — onlar da kuruluyor ve kurulumları hata verebiliyor.
    Buradaki soru "ödüyor mu" değil "çalışıyor mu" (lib/kurum-turu);
    gelir kartlarında grup markası ayrılır, kurulumda ayrılmaz.
  */
  const kiracilar = tumKiracilar.filter((k) => kurumTuru(k) !== "arvo");
  const planList = ((planSatirlari ?? []) as { code: string; name: string }[]).map((p) => ({ code: String(p.code), name: paketAdi(String(p.code)) || String(p.name) }));

  const bekleyenler = kiracilar.filter((k) => BEKLEYEN.has(k.provisioning_state) || k.provisioning_state === "failed");
  const tamamlananlar = kiracilar.filter((k) => k.provisioning_state === "active");
  /* İstekler okunamazsa "yeni istek yok" denirdi: imzalı bir sözleşmenin
     modülleri açılmayı bekliyorken ekran temiz görünürdü. Anahtar yoksa
     (admin null) hata da yok — o durumda bölüm zaten çizilmiyor. */
  if (istekHatasi) throw new Error("Abonelik istekleri okunamadı: " + istekHatasi.message);
  const bekleyenIstekler = (istekSatirlari ?? []) as {
    id: string; contract_no: string | null; customer_name: string | null;
    amount: number | null; currency: string | null; created_at: string;
    target_organization_id: string | null;
  }[];

  /* Ücreti girilmemiş ya da listeden sapan tamamlanan kurulumlar: üçüncü
     aşamanın asıl işi bu. */
  const ucretsiz = tamamlananlar.filter((k) => ucretSapmasi(k.plan_code, k.monthly_fee, fiyatlar).durum === "girilmedi").length;
  const denemede = tamamlananlar.filter((k) => k.license_status === "trialing").length;

  const adres = (kod: string) => `/panel/platform/kurulumlar?asama=${kod}`;
  const sayim: Record<string, number> = { yeni: bekleyenIstekler.length, devam: bekleyenler.length, tamam: tamamlananlar.length };

  /* Süren kurulumların aşama dağılımı: yukarıdaki sınırsız kiracı
     listesinden (istatistik kartı için; yeni bir okuma yok). */
  const asamaDagilimi = [...new Set(bekleyenler.map((k) => k.provisioning_state))]
    .map((durum) => ({ ad: KURULUM_ADI[durum] ?? durum, adet: bekleyenler.filter((k) => k.provisioning_state === durum).length }));

  /*
    PANEL LİSTESİ GİBİ (14.10.2026). Üç aşama ayrı ayrı panel-card'lardı
    ve kendi .plt-table stilleri vardı; artık panelin liste düzeni: solda
    liste kartı (aşama çipleri + o aşamanın tablosu), sağda istatistik.
    Aşama hâlâ ?asama= ile seçiliyor; şerit ve çipler aynı adrese gidiyor.
  */
  const kisi = (ad: string, alt: string, href: string) => (
    <Link className="crm-row-link ek-kisi" href={href}>
      <span className="ek-avatar" aria-hidden="true">{basHarfleri(ad)}</span>
      <span className="ek-kisi-metin"><span className="crm-table-title" title={ad}>{ad}</span><span className="crm-table-sub">{alt}</span></span>
    </Link>
  );
  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );

  /*
    PANELİN TABLOSU (29.10.2026, konsol yeniden kurulurken). Üç aşamanın
    satırları iOS satırıydı: davetin kime ne zaman gittiği, paket,
    kullanıcı ve dönem tek alt satırda virgülle diziliyordu. Artık her
    biri kendi sütununda; aşama seçimi Ekip listesindeki segment.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa sistem-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">SİSTEM</small>
        <h1>Kurulumlar</h1>
        <p className="ek-alt">İmzalanan sözleşmeden kurumun açılmasına, sahibin davetinden ilk girişe kadar.</p>
      </div>
      <div className="talep-bas-eylem">
        <PanelDrawer triggerLabel="Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
          <NewOrganizationWizard action={createCustomerOrganization} plans={planList} existingSlugs={tumKiracilar.map((k) => k.slug)} />
        </PanelDrawer>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Kurulum aşamaları">
      <dl>
        {ASAMALAR.map((a) => (
          <div key={a.kod} className={secili === a.kod ? "is-active" : undefined}>
            <dt>{a.ad}</dt>
            <dd><Link href={adres(a.kod)} aria-current={secili === a.kod ? "page" : undefined}>{sayi(sayim[a.kod])}</Link></dd>
          </div>
        ))}
        <div>
          <dt>Ücreti girilmemiş</dt>
          <dd className={ucretsiz ? "talep-uyari" : undefined}>{sayi(ucretsiz)}</dd>
          <small>{denemede ? `${sayi(denemede)} kiracı denemede` : "Denemede kiracı yok"}</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label={ASAMALAR.find((a) => a.kod === secili)?.ad ?? "Kurulumlar"}>
        <div className="ekip-suzgec talep-suzgec ek-arac">
          <nav className="ek-segment" aria-label="Aşama">
            {ASAMALAR.map((a) => (
              <Link key={a.kod} href={adres(a.kod)} className={secili === a.kod ? "is-active" : undefined} aria-current={secili === a.kod ? "page" : undefined}>
                {a.ad} <small>{sayi(sayim[a.kod])}</small>
              </Link>
            ))}
          </nav>
        </div>

        {secili === "yeni" ? (
          admin ? (
            bekleyenIstekler.length ? (
              <div className="talep-tablo">
                <table className="crm-data-table" data-cols="sy-yeni">
                  <thead><tr><th>Müşteri</th><th>Sözleşme</th><th className="crm-col-date">İmza</th><th className="crm-col-amount">Tutar</th><th>Durum</th><th></th></tr></thead>
                  <tbody>
                    {bekleyenIstekler.map((istek) => {
                      const ad = istek.customer_name ?? "Adsız müşteri";
                      const tutar = istek.amount !== null ? para(Number(istek.amount), istek.currency ?? "TRY") : null;
                      /* Satır sözleşme kuyruğuna gider: önce kurum açılır
                         (başlıktaki "Yeni müşteri"), sonra istek o kuruma onaylanır. */
                      return (
                        <tr key={istek.id}>
                          <td data-label="Müşteri">{kisi(ad, "Kurum açılmadı", "/panel/platform/sozlesmeler")}</td>
                          <td data-label="Sözleşme"><span className="crm-table-title plt-mono">{istek.contract_no ?? "—"}</span></td>
                          <td className="crm-col-date" data-label="İmza">{tarihSaat(istek.created_at)}</td>
                          <td className="crm-col-amount" data-label="Tutar">{tutar ? <span className="crm-table-title">{tutar}</span> : <span className="k-ios-eksik">Tutar yok</span>}</td>
                          <td data-label="Durum"><span className="status-pill" data-tone="warning">Kurum açılmadı</span></td>
                          <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                          <MobilSatir href="/panel/platform/sozlesmeler" baslik={ad} durum={{ etiket: "Kurum açılmadı", ton: "warning" }}
                            alt={[istek.contract_no, tutar, tarihSaat(istek.created_at)]} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <SatirTiklama />
              </div>
            ) : bos("Bekleyen yeni kurulum yok", "İmzalanan sözleşmeler kurumu açılana kadar burada bekler. Elle eklemek için başlıktaki Yeni müşteri.")
          ) : <KNot ton="uyari">Sunucu anahtarı tanımlı olmadığı için istekler okunamıyor — &quot;istek yok&quot; demek değil.</KNot>
        ) : null}

        {secili === "devam" ? (
          bekleyenler.length ? (
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="sy-devam">
                <thead><tr><th>Kurum</th><th>Paket</th><th>Sahip daveti</th><th>Kullanıcı</th><th>Aşama</th><th></th></tr></thead>
                <tbody>
                  {bekleyenler.map((kiraci) => {
                    const ad = kiraci.display_name || kiraci.name;
                    const asama = { etiket: KURULUM_ADI[kiraci.provisioning_state] ?? kiraci.provisioning_state, ton: KURULUM_TONU[kiraci.provisioning_state] ?? "neutral" };
                    /* Kurulum adımları ve sahibe giriş bağlantısı müşteri kartının Kurulum sekmesinde. */
                    const href = `/panel/platform/musteriler/${kiraci.id}?pencere=ayarlar`;
                    return (
                      <tr key={kiraci.id}>
                        <td data-label="Kurum">{kisi(ad, kiraci.slug, href)}</td>
                        <td data-label="Paket">{kiraci.plan_code ? <span className="crm-table-title">{PAKET_ADI[kiraci.plan_code] ?? kiraci.plan_code}</span> : <span className="crm-table-sub">—</span>}</td>
                        <td data-label="Sahip daveti">
                          {/* Takıldığı yer: hata varsa hatanın kendisi, yoksa davetin kime ve ne zaman gittiği. */}
                          {kiraci.davet_hatasi ? (
                            <><span className="status-pill" data-tone="danger">Gönderilemedi</span><small title={kiraci.davet_hatasi}>{kiraci.davet_hatasi}</small></>
                          ) : kiraci.davet_eposta ? (
                            <><span className="crm-table-title" title={kiraci.davet_eposta}>{kiraci.davet_eposta}</span><small>{kiraci.davet_gonderildi ? tarihSaat(kiraci.davet_gonderildi) : "gönderilmedi"}</small></>
                          ) : <span className="crm-table-sub">sahip daveti yok</span>}
                        </td>
                        <td data-label="Kullanıcı"><span className="crm-table-title">{sayi(Number(kiraci.aktif_uye))}</span></td>
                        <td data-label="Aşama"><span className="status-pill" data-tone={asama.ton}>{asama.etiket}</span></td>
                        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                        <MobilSatir href={href} baslik={ad} durum={asama}
                          alt={[kiraci.plan_code ? PAKET_ADI[kiraci.plan_code] ?? kiraci.plan_code : null, kiraci.davet_hatasi ? `davet gönderilemedi: ${kiraci.davet_hatasi}` : kiraci.davet_eposta]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Süren kurulum yok", "Açılan her kurum çalışır durumda. Davet bekleyen ya da hata veren kurulum olursa burada görünür.")
        ) : null}

        {secili === "tamam" ? (
          tamamlananlar.length ? (
            /* Tek kısayol: ücreti GİRİLMEMİŞ kiracıda "liste fiyatını
               uygula" (yayımlanmış liste, lib/paket-ucreti); deneme süresi
               müşteri kartının Ürünler ve lisans sekmesinde. */
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="sy-tamam">
                <thead><tr><th>Kurum</th><th>Paket</th><th>Kullanıcı</th><th className="crm-col-date">Dönem</th><th className="crm-col-amount">Aylık</th><th>Lisans</th><th></th></tr></thead>
                <tbody>
                  {tamamlananlar.map((kiraci) => {
                    const ad = kiraci.display_name || kiraci.name;
                    const sapma = ucretSapmasi(kiraci.plan_code, kiraci.monthly_fee, fiyatlar);
                    const deneme = kiraci.license_status === "trialing";
                    const lisans = kiraci.license_status ?? "inactive";
                    const durum = { etiket: productLicenseLabels[lisans] ?? lisans, ton: LISANS_TONU[lisans] ?? "neutral" };
                    const donem = deneme ? kiraci.trial_ends_at : kiraci.current_period_end;
                    const href = `/panel/platform/musteriler/${kiraci.id}?pencere=lisanslar`;
                    return (
                      <tr key={kiraci.id} className={ACIK_LISANS.has(lisans) ? undefined : "is-pasif"}>
                        <td data-label="Kurum">{kisi(ad, kiraci.slug, href)}</td>
                        <td data-label="Paket">{kiraci.plan_code ? <span className="crm-table-title">{PAKET_ADI[kiraci.plan_code] ?? kiraci.plan_code}</span> : <span className="crm-table-sub">—</span>}</td>
                        <td data-label="Kullanıcı"><span className="crm-table-title">{sayi(Number(kiraci.aktif_uye))}</span></td>
                        <td className="crm-col-date" data-label="Dönem">{donem ? tarih(donem) : "—"}{donem ? <small>{deneme ? "deneme bitişi" : "dönem sonu"}</small> : null}</td>
                        <td className="crm-col-amount" data-label="Aylık">
                          {/* Kapalı (iptal / askıda) lisansta ücret beklenmiyor: "₺0,00" yerine —. */}
                          {!ACIK_LISANS.has(lisans) && !sapma.mevcut ? <span className="crm-table-sub">—</span>
                            : sapma.durum === "girilmedi" ? <span className="k-ios-eksik">Ücret yok</span>
                            : <span className="crm-table-title">{para(sapma.mevcut ?? 0)}</span>}
                          {/* Sapma hata değil: çoğu kiracının pazarlıkla değişmiş tutarı var. */}
                          {sapma.durum === "teklif" ? <small>teklif usulü</small> : sapma.durum === "farkli" ? <small>liste {para(sapma.liste ?? 0)}</small> : sapma.durum === "liste" ? <small>liste fiyatı</small> : null}
                        </td>
                        <td data-label="Lisans"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                        <td className="crm-table-actions">
                          {sapma.durum === "girilmedi" && sapma.liste !== null ? (
                            <form action={listeFiyatiniUygula}>
                              <input type="hidden" name="organization_id" value={kiraci.id} />
                              <button className="panel-secondary" type="submit">Liste fiyatı · {para(sapma.liste)}</button>
                            </form>
                          ) : <span className="crm-row-chevron" aria-hidden="true">›</span>}
                        </td>
                        <MobilSatir href={href} baslik={ad} durum={durum}
                          alt={[kiraci.plan_code ? PAKET_ADI[kiraci.plan_code] ?? kiraci.plan_code : null, `${sayi(Number(kiraci.aktif_uye))} kullanıcı`, donem ? tarih(donem) : null]} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
            </div>
          ) : bos("Tamamlanmış kurulum yok", "Kurulumu biten kurumlar burada listelenir.")
        ) : null}
      </section>

      {/* Sağ sütun: süren kurulumların aşama dağılımı. Yeni istekler en
          yeni yirmiyle sınırlı okunuyor ve kart bunu söylüyor. */}
      <div className="liste-sag">
        <TalepAkis kimlik="kurulum-sag" sinif="ek-sag" etiket="Kurulum istatistikleri" sekmeler={["İstatistikler"]}>
          <IstatistikKarti
            kapsam="Arvo'nun kendi kurumu hariç; yeni istekler en yeni 20 kayıttan"
            kutular={[
              ...ASAMALAR.map((a) => ({ ad: a.ad, deger: sayi(sayim[a.kod]), alt: a.kod === "yeni" ? "imzalı, kurum açılmadı" : a.kod === "devam" ? "davet ya da hata bekliyor" : "çalışıyor" })),
              { ad: "Ücreti girilmemiş", deger: sayi(ucretsiz), alt: denemede ? `${sayi(denemede)} denemede` : "açık lisans" },
            ]}
            gruplar={[{ baslik: "Süren kurulumun aşaması", satirlar: asamaDagilimi }]}
          />
        </TalepAkis>
      </div>
    </div>
  </main>;
}
