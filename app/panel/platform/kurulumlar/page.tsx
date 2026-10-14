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
import { LISANS_TONU, PAKET_ADI, KURULUM_ADI, KURULUM_TONU, para, sayi, tarih, tarihSaat } from "../bicim";
import { productLicenseLabels } from "@/lib/products";
import { listeFiyatiniUygula } from "./actions";
import { kurumTuru } from "@/lib/kurum-turu";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
// Sihirbaz (.plw) ve sözleşme no (.plt-mono) burada.
import "../platform.css";

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
  const { data: istekSatirlari } = admin
    ? await admin.from("platform_subscription_requests")
        .select("id,contract_no,customer_name,amount,currency,status,created_at,target_organization_id")
        .eq("status", "pending").is("target_organization_id", null)
        .order("created_at", { ascending: false }).limit(20)
    : { data: null };

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
  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · KURULUM</small>
        <h1>Kurulum</h1>
      </div>
      <div className="talep-bas-eylem">
        <PanelDrawer triggerLabel="+ Yeni müşteri" kicker="YENİ MÜŞTERİ" title="Yeni müşteri kurulumu" description="Dört adımda kurum, paket ve sahip hesabı hazırlanır; davet otomatik gönderilir.">
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
        <div className="ekip-suzgec talep-suzgec">
          {/* Çipler rayda (konsol-ui.css): telefonda tek sıra kaydırılır,
              masaüstünde sarmalayıcı display:contents ile görünmez. */}
          <div className="suzgec-ray">
            {ASAMALAR.map((a) => (
              <Link key={a.kod} href={adres(a.kod)} className={secili === a.kod ? "is-active" : undefined} aria-current={secili === a.kod ? "page" : undefined}>
                {a.ad} <small>{sayi(sayim[a.kod])}</small>
              </Link>
            ))}
          </div>
        </div>

        {/*
          ÜÇ SEKME AYNI DİL (14.10.2026, "diğerlerini de yap"). Yeni ve
          devam eden sekmelerinin üstünde uzun birer açıklama kutusu vardı
          (biri artık olmayan "kiracı dosyası"na yönlendiriyordu) ve satırlar
          az şey söylüyordu. Açıklama boş listenin kısa cümlesine indi;
          satır asıl soruyu yanıtlıyor: yeni istekte "kim, hangi sözleşme,
          ne tutar"; süren kurulumda "davet kime, ne zaman gitti, nerede
          takıldı".
        */}
        {secili === "yeni" ? (
          admin ? (
            bekleyenIstekler.length ? (
              <KListe>
                {bekleyenIstekler.map((istek) => (
                  /* Satır sözleşme kuyruğuna gider: önce kurum açılır
                     (başlıktaki "Yeni müşteri"), sonra istek o kuruma onaylanır. */
                  <KOge
                    key={istek.id}
                    href="/panel/platform/sozlesmeler"
                    simge={istek.customer_name ?? "—"}
                    baslik={istek.customer_name ?? "Adsız müşteri"}
                    alt={<>Sözleşme <span className="plt-mono">{istek.contract_no ?? "—"}</span> · imza {tarihSaat(istek.created_at)}</>}
                    durum={{ etiket: "Kurum açılmadı", ton: "warning" }}
                    deger={istek.amount !== null ? para(Number(istek.amount), istek.currency ?? "TRY") : <span className="k-ios-eksik">Tutar yok</span>}
                    degerAlt={istek.amount !== null ? "sözleşme tutarı" : undefined}
                  />
                ))}
              </KListe>
            ) : (
              <KBos
                baslik="Bekleyen yeni kurulum yok"
                aciklama="İmzalanan sözleşmeler kurumu açılana kadar burada bekler. Elle eklemek için başlıktaki Yeni müşteri."
              />
            )
          ) : <KNot ton="uyari">Sunucu anahtarı tanımlı olmadığı için istekler okunamıyor — &quot;istek yok&quot; demek değil.</KNot>
        ) : null}

        {secili === "devam" ? (
          bekleyenler.length ? (
            <KListe>
              {bekleyenler.map((kiraci) => {
                const ad = kiraci.display_name || kiraci.name;
                const asamaAdi = KURULUM_ADI[kiraci.provisioning_state] ?? kiraci.provisioning_state;
                const ton = KURULUM_TONU[kiraci.provisioning_state] ?? "neutral";
                /* Takıldığı yer: hata varsa hatanın kendisi, yoksa davetin kime ve ne zaman gittiği. */
                const davet = kiraci.davet_hatasi
                  ? `davet gönderilemedi: ${kiraci.davet_hatasi}`
                  : kiraci.davet_eposta
                    ? `davet ${kiraci.davet_eposta}${kiraci.davet_gonderildi ? ` · ${tarihSaat(kiraci.davet_gonderildi)}` : " · gönderilmedi"}`
                    : "sahip daveti yok";
                return (
                  <KOge
                    key={kiraci.id}
                    /* Kurulum adımları ve sahibe giriş bağlantısı müşteri detayının Kurum Ayarları penceresinde. */
                    href={`/panel/platform/musteriler/${kiraci.id}?pencere=ayarlar`}
                    simge={ad}
                    baslik={ad}
                    alt={[kiraci.plan_code ? `${PAKET_ADI[kiraci.plan_code] ?? kiraci.plan_code} paket` : null, davet].filter(Boolean).join(" · ")}
                    durum={{ etiket: asamaAdi, ton }}
                    deger={sayi(Number(kiraci.aktif_uye))}
                    degerAlt="kullanıcı"
                  />
                );
              })}
            </KListe>
          ) : (
            <KBos
              baslik="Süren kurulum yok"
              aciklama="Açılan her kurum çalışır durumda. Davet bekleyen ya da hata veren kurulum olursa burada görünür."
            />
          )
        ) : null}

        {secili === "tamam" ? (
          tamamlananlar.length ? (
            /*
              iOS LİSTESİ (14.10.2026, "panel kalitesinde değil"). Burası
              beş sütunlu bir tabloydu ve her satırda deneme günü kutusuyla
              "Uygula" düğmesi duruyordu: dört satırda dört form, ekranın
              yarısı. Deneme süresi müşteri detayının Lisanslar penceresinde
              (lisans formundaki deneme bitişi) — aynı işi iki yerde tutmak,
              birinin kuralı atlaması demekti. Satır artık o pencereye gidiyor.

              Tek kısayol kalıyor: ücreti GİRİLMEMİŞ kiracıda "liste fiyatını
              uygula" (yayımlanmış liste, lib/paket-ucreti). O satır form
              taşıdığı için bağlantı değil; öteki satırlar bağlantı.
            */
            <KListe>
              {tamamlananlar.map((kiraci) => {
                const ad = kiraci.display_name || kiraci.name;
                const sapma = ucretSapmasi(kiraci.plan_code, kiraci.monthly_fee, fiyatlar);
                const denemede = kiraci.license_status === "trialing";
                const lisans = kiraci.license_status ?? "inactive";
                return (
                  <KOge
                    key={kiraci.id}
                    href={`/panel/platform/musteriler/${kiraci.id}?pencere=lisanslar`}
                    simge={ad}
                    baslik={ad}
                    alt={[
                      kiraci.plan_code ? `${PAKET_ADI[kiraci.plan_code] ?? kiraci.plan_code} paket` : null,
                      `${sayi(Number(kiraci.aktif_uye))} kullanıcı`,
                      denemede
                        ? `deneme ${tarih(kiraci.trial_ends_at)}'e kadar`
                        : kiraci.current_period_end ? `dönem sonu ${tarih(kiraci.current_period_end)}` : null,
                    ].filter(Boolean).join(" · ")}
                    durum={{ etiket: productLicenseLabels[lisans] ?? lisans, ton: LISANS_TONU[lisans] ?? "neutral" }}
                    /* Kapalı (iptal / askıda) lisansta ücret beklenmiyor: "₺0,00" yerine —. */
                    deger={!ACIK_LISANS.has(lisans) && !sapma.mevcut ? "—" : sapma.durum === "girilmedi" ? <span className="k-ios-eksik">Ücret yok</span> : para(sapma.mevcut ?? 0)}
                    /* Sapma hata değil: çoğu kiracının pazarlıkla değişmiş tutarı var. */
                    degerAlt={sapma.durum === "teklif" ? "teklif usulü" : sapma.durum === "farkli" ? `liste ${para(sapma.liste ?? 0)}` : sapma.durum === "liste" ? "liste fiyatı" : undefined}
                    sonu={sapma.durum === "girilmedi" && sapma.liste !== null ? (
                      <form action={listeFiyatiniUygula}>
                        <input type="hidden" name="organization_id" value={kiraci.id} />
                        <button className="panel-secondary" type="submit">Liste fiyatı · {para(sapma.liste)}</button>
                      </form>
                    ) : undefined}
                  />
                );
              })}
            </KListe>
          ) : <KBos baslik="Tamamlanmış kurulum yok" />
        ) : null}
      </section>

      {/* Sayılar yukarıda zaten hesaplananlar; yalnızca "yeni" istekler en
          yeni yirmiyle sınırlı okunuyor ve kart bunu söylüyor.

          SAĞ SÜTUN SADE (14.10.2026, "iOS gibi"): İstatistik kartının
          dört kutusu (yeni, süren, tamamlanan, ücreti girilmemiş) ve
          "Tamamlananlar" grubu şeritteki sayıların AYNISIYDI. Kalan tek
          yeni bilgi süren kurulumların aşama dağılımı; o da iOS listesi. */}
      <div className="liste-sag">
        {/* Açıklama 14.10.2026'ya kadar "Kendi markalarımız hariç" diyordu ve
            YANLIŞTI: süzgeç yalnızca Arvo'nun kendi kurumunu eliyor, grup
            markaları (ArvoCulture, AkademikMerkez) listede — oysa kurum
            sahibinin tanımında "kendi markamız" tam olarak onlar. */}
        <KKart baslik="Süren kurulumun aşaması" aciklama="Arvo'nun kendi kurumu hariç; yeni istekler en yeni 20 kayıttan">
          {asamaDagilimi.length ? (
            <KListe>
              {asamaDagilimi.map((d) => (
                <KOge key={d.ad} baslik={d.ad} deger={sayi(d.adet)} />
              ))}
            </KListe>
          ) : <KNot>Süren kurulum yok.</KNot>}
        </KKart>
      </div>
    </div>
  </main>;
}
