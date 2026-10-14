import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ucretSapmasi } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { PanelDrawer } from "../../components/panel-drawer";
import { NewOrganizationWizard } from "../new-organization-wizard";
import { createCustomerOrganization } from "../actions";
import { KURULUM_ADI, KURULUM_TONU, para, sayi, tarih, tarihSaat } from "../bicim";
import { denemeyiAyarla, listeFiyatiniUygula } from "./actions";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { KBaslik, KBos, KDurum, KNot, KSatirSonu, KTablo } from "../konsol-ui";
// Sihirbaz (.plw), deneme formu (.plt-deneme) ve sözleşme no (.plt-mono) burada.
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

const BEKLEYEN = new Set(["creating", "inviting_owner", "waiting_owner"]);

type Kiraci = {
  id: string; name: string; slug: string; display_name: string | null; kind: string | null;
  provisioning_state: string; contact_phone: string | null;
  license_status: string | null; plan_code: string | null;
  monthly_fee: number | null; trial_ends_at: string | null;
  current_period_end: string | null; aktif_uye: number;
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

  const [{ data: kiraciSatirlari }, { data: planSatirlari }, fiyatlar] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,slug,display_name,kind,provisioning_state,contact_phone,license_status,plan_code,monthly_fee,trial_ends_at,current_period_end,aktif_uye")
      .order("name"),
    supabase.from("plans").select("code,name").eq("is_active", true).order("code"),
    // Liste fiyatı konsolda yayımlanan tablodan (sitedekiyle aynı).
    yayimlananFiyatlar(),
  ]);

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
  const kiracilar = tumKiracilar.filter((k) => k.kind !== "internal");
  const planList = ((planSatirlari ?? []) as { code: string; name: string }[]).map((p) => ({ code: String(p.code), name: String(p.name) }));

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
        <small className="panel-kicker">PLATFORM · KURULUMLAR</small>
        <h1>Kurulumlar</h1>
        <p>Müşteri kurulumunun üç aşaması: yeni kayıt, süren kurulum, tamamlanan ve ücretlendirilen kiracı.</p>
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
          {ASAMALAR.map((a) => (
            <Link key={a.kod} href={adres(a.kod)} className={secili === a.kod ? "is-active" : undefined} aria-current={secili === a.kod ? "page" : undefined}>
              {a.ad} <small>{sayi(sayim[a.kod])}</small>
            </Link>
          ))}
        </div>

        {secili === "yeni" ? (
          <>
            <KNot>
              Kurulum iki yoldan başlar: kiracı panelinde imzalanıp onaylanan bir sözleşme, ya da yukarıdaki
              &quot;Yeni müşteri&quot; akışıyla elle giriş. Aşağıdakiler imzalanmış ama kurumu henüz açılmamış isteklerdir: önce kurumu açın, sonra sözleşmeyi o kuruma onaylayın.
            </KNot>
            {admin ? (
              bekleyenIstekler.length ? (
                <KTablo kolonlar={[{ ad: "Müşteri" }, { ad: "Tutar", sinif: "crm-col-amount" }, { ad: "Geliş", sinif: "crm-col-date" }, { ad: "" }]}>
                  {bekleyenIstekler.map((istek) => (
                    <tr key={istek.id}>
                      {/* Satır sözleşme kuyruğuna gider (eskiden ayrı bir "Sözleşmeyi aç" düğmesiydi). */}
                      <KBaslik etiket="Müşteri" href="/panel/platform/sozlesmeler" baslik={istek.customer_name ?? "—"} alt={<span className="plt-mono">{istek.contract_no ?? "—"}</span>} />
                      <td data-label="Tutar" className="crm-col-amount">{istek.amount !== null ? para(Number(istek.amount), istek.currency ?? "TRY") : "—"}</td>
                      <td data-label="Geliş" className="crm-col-date">{tarihSaat(istek.created_at)}</td>
                      <KSatirSonu mobil={{
                        href: "/panel/platform/sozlesmeler",
                        baslik: istek.customer_name ?? "—",
                        durum: istek.amount !== null ? { etiket: para(Number(istek.amount), istek.currency ?? "TRY"), ton: "neutral" } : null,
                        alt: [istek.contract_no, tarihSaat(istek.created_at)],
                      }} />
                    </tr>
                  ))}
                </KTablo>
              ) : <KBos baslik="Kurumu açılmayı bekleyen istek yok" aciklama="Yeni bir müşteriyi yukarıdaki akışla ekleyebilirsiniz." />
            ) : <KNot ton="uyari">Sunucu anahtarı tanımlı olmadığı için istekler okunamıyor — &quot;istek yok&quot; demek değil.</KNot>}
          </>
        ) : null}

        {secili === "devam" ? (
          <>
            <KNot>Kurulumu başlamış, henüz bitmemiş kiracılar. Hatalı kalanlar da burada: sebebi kiracı dosyasında yazıyor.</KNot>
            {bekleyenler.length ? (
              <KTablo kolonlar={[{ ad: "Kiracı" }, { ad: "Aşama" }, { ad: "Paket" }, { ad: "Telefon" }, { ad: "" }]}>
                {bekleyenler.map((kiraci) => {
                  const ad = kiraci.display_name || kiraci.name;
                  const asamaAdi = KURULUM_ADI[kiraci.provisioning_state] ?? kiraci.provisioning_state;
                  const ton = KURULUM_TONU[kiraci.provisioning_state] ?? "neutral";
                  return (
                    <tr key={kiraci.id}>
                      <KBaslik etiket="Kiracı" href={`/panel/platform?organization=${kiraci.id}`} baslik={ad} alt={kiraci.slug} />
                      <KDurum baslik="Aşama" etiket={asamaAdi} ton={ton} />
                      <td data-label="Paket">{kiraci.plan_code ?? "—"}</td>
                      <td data-label="Telefon">{kiraci.contact_phone ?? "—"}</td>
                      <KSatirSonu mobil={{
                        href: `/panel/platform?organization=${kiraci.id}`,
                        baslik: ad,
                        durum: { etiket: asamaAdi, ton },
                        alt: [kiraci.plan_code, kiraci.contact_phone],
                      }} />
                    </tr>
                  );
                })}
              </KTablo>
            ) : <KBos baslik="Süren kurulum yok" aciklama="Açılan her kurum çalışır durumda." />}
          </>
        ) : null}

        {secili === "tamam" ? (
          <>
            <KNot>
              Çalışır durumdaki kiracılar. Deneme süresi ve aylık ücret burada tanımlanır; ücret, paketin
              <Link href="/panel/platform/moduller"> Ürünler</Link> tarafında yayımlanmış liste fiyatından gelir.
            </KNot>
            {tamamlananlar.length ? (
              /* Bu tabloda telefon satırı (MobilSatir) YOK: ücret ve deneme
                 formları hücrelerin içinde ve tek kompakt satır öteki
                 hücreleri gizliyor — telefonda formlar kaybolurdu. Hücreler
                 panelin genel kuralıyla "etiket değer" olarak diziliyor. */
              <KTablo kolonlar={[{ ad: "Kiracı" }, { ad: "Paket" }, { ad: "Aylık ücret" }, { ad: "Deneme" }, { ad: "Dönem sonu", sinif: "crm-col-date" }]}>
                {tamamlananlar.map((kiraci) => {
                  const sapma = ucretSapmasi(kiraci.plan_code, kiraci.monthly_fee, fiyatlar);
                  return (
                    <tr key={kiraci.id}>
                      <KBaslik etiket="Kiracı" href={`/panel/platform?organization=${kiraci.id}`} baslik={kiraci.display_name || kiraci.name} alt={`${sayi(Number(kiraci.aktif_uye))} kullanıcı`} />
                      <td data-label="Paket">{kiraci.plan_code ?? "—"}</td>
                      <td data-label="Aylık ücret">
                        {sapma.durum === "girilmedi" ? (
                          <form action={listeFiyatiniUygula} className="plt-deneme">
                            <input type="hidden" name="organization_id" value={kiraci.id} />
                            <span className="status-pill" data-tone="warning">girilmedi</span>
                            {sapma.liste !== null
                              ? <button className="panel-secondary" type="submit">Liste fiyatını uygula · {para(sapma.liste)}</button>
                              : <span className="crm-table-sub">Teklif usulü paket; tutarı lisans ekranından girin.</span>}
                          </form>
                        ) : (
                          <>
                            {para(sapma.mevcut ?? 0)}
                            {/* Sapma hata değil: çoğu kiracının pazarlıkla
                                değişmiş tutarı var. Yalnızca yazıyoruz. */}
                            {sapma.durum === "farkli" ? <span className="crm-table-sub">liste {para(sapma.liste ?? 0)}</span> : null}
                            {sapma.durum === "teklif" ? <span className="crm-table-sub">teklif usulü</span> : null}
                          </>
                        )}
                      </td>
                      <td data-label="Deneme">
                        <form action={denemeyiAyarla} className="plt-deneme">
                          <input type="hidden" name="organization_id" value={kiraci.id} />
                          {kiraci.license_status === "trialing"
                            ? <span className="status-pill" data-tone="warning">{tarih(kiraci.trial_ends_at)}&apos;e kadar</span>
                            : <span className="status-pill" data-tone="neutral">yok</span>}
                          <input type="number" name="gun" min={0} max={365} defaultValue={kiraci.license_status === "trialing" ? 0 : 14} aria-label="Deneme günü" />
                          <button className="panel-secondary" type="submit">Uygula</button>
                        </form>
                      </td>
                      <td data-label="Dönem sonu" className="crm-col-date">{tarih(kiraci.current_period_end)}</td>
                    </tr>
                  );
                })}
              </KTablo>
            ) : <KBos baslik="Tamamlanmış kurulum yok" />}
          </>
        ) : null}
      </section>

      {/* Sayılar yukarıda zaten hesaplananlar; yalnızca "yeni" istekler en
          yeni yirmiyle sınırlı okunuyor ve kart bunu söylüyor. */}
      <IstatistikKarti
        kapsam="kendi markalarımız hariç; yeni istekler en yeni 20 kayıttan"
        kutular={[
          { ad: "Yeni kurulum", deger: admin ? sayi(sayim.yeni) : "—", alt: admin ? "kurumu açılmayı bekleyen" : "okunamadı", ton: sayim.yeni ? "uyari" : undefined },
          { ad: "Süren kurulum", deger: sayi(sayim.devam), alt: "başladı, bitmedi", ton: sayim.devam ? "uyari" : undefined },
          { ad: "Tamamlanan", deger: sayi(sayim.tamam), alt: "çalışıyor", ton: "arti" },
          { ad: "Ücreti girilmemiş", deger: sayi(ucretsiz), alt: denemede ? `${sayi(denemede)} kiracı denemede` : "denemede kiracı yok", ton: ucretsiz ? "uyari" : undefined },
        ]}
        gruplar={[
          { baslik: "Süren kurulumun aşaması", satirlar: asamaDagilimi },
          {
            baslik: "Tamamlananlar",
            satirlar: [
              { ad: "Denemede", adet: denemede },
              { ad: "Ücreti girilmemiş", adet: ucretsiz },
            ],
          },
        ]}
      />
    </div>
  </main>;
}
