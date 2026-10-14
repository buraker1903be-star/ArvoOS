import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { ucretSapmasi } from "@/lib/paket-ucreti";
import { PanelDrawer } from "../../components/panel-drawer";
import { NewOrganizationWizard } from "../new-organization-wizard";
import { createCustomerOrganization } from "../actions";
import { KURULUM_ADI, KURULUM_TONU, para, sayi, tarih, tarihSaat } from "../bicim";
import { denemeyiAyarla, listeFiyatiniUygula } from "./actions";
import "../../settings/settings.css";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

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
  (lib/paket-ucreti, kaynağı lib/site/pricing) yazılı duruyor ve tek
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

  const [{ data: kiraciSatirlari }, { data: planSatirlari }] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,slug,display_name,kind,provisioning_state,contact_phone,license_status,plan_code,monthly_fee,trial_ends_at,current_period_end,aktif_uye")
      .order("name"),
    supabase.from("plans").select("code,name").eq("is_active", true).order("code"),
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
  const ucretsiz = tamamlananlar.filter((k) => ucretSapmasi(k.plan_code, k.monthly_fee).durum === "girilmedi").length;
  const denemede = tamamlananlar.filter((k) => k.license_status === "trialing").length;

  const adres = (kod: string) => `/panel/platform/kurulumlar?asama=${kod}`;
  const sayim: Record<string, number> = { yeni: bekleyenIstekler.length, devam: bekleyenler.length, tamam: tamamlananlar.length };

  return <main className="stg plt talep cari">
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

    {secili === "yeni" ? (
      <section className="panel-card" aria-label="Yeni kurulum">
        <h2>Yeni kurulum</h2>
        <p className="panel-muted">
          Kurulum iki yoldan başlar: kiracı panelinde imzalanıp onaylanan bir sözleşme, ya da yukarıdaki
          &quot;Yeni müşteri&quot; akışıyla elle giriş. Aşağıdakiler imzalanmış ama kurumu henüz açılmamış isteklerdir: önce kurumu açın, sonra sözleşmeyi o kuruma onaylayın.
        </p>
        {admin ? (
          bekleyenIstekler.length ? (
            <table className="plt-table">
              <thead><tr><th>Müşteri</th><th>Sözleşme</th><th>Tutar</th><th>Geliş</th><th /></tr></thead>
              <tbody>
                {bekleyenIstekler.map((istek) => (
                  <tr key={istek.id}>
                    <td>{istek.customer_name ?? "—"}</td>
                    <td className="plt-mono">{istek.contract_no ?? "—"}</td>
                    <td>{istek.amount !== null ? para(Number(istek.amount), istek.currency ?? "TRY") : "—"}</td>
                    <td>{tarihSaat(istek.created_at)}</td>
                    <td><Link className="panel-secondary" href="/panel/platform/sozlesmeler">Sözleşmeyi aç</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="panel-muted">Kurumu açılmayı bekleyen istek yok. Yeni bir müşteriyi yukarıdaki akışla ekleyebilirsiniz.</p>
        ) : <p className="panel-muted">Sunucu anahtarı tanımlı olmadığı için istekler okunamıyor — &quot;istek yok&quot; demek değil.</p>}
      </section>
    ) : null}

    {secili === "devam" ? (
      <section className="panel-card" aria-label="Kurulumu devam edenler">
        <h2>Kurulumu devam edenler</h2>
        <p className="panel-muted">Kurulumu başlamış, henüz bitmemiş kiracılar. Hatalı kalanlar da burada: sebebi kiracı dosyasında yazıyor.</p>
        {bekleyenler.length ? (
          <table className="plt-table">
            <thead><tr><th>Kiracı</th><th>Aşama</th><th>Paket</th><th>Telefon</th><th /></tr></thead>
            <tbody>
              {bekleyenler.map((kiraci) => (
                <tr key={kiraci.id}>
                  <td><Link href={`/panel/platform?organization=${kiraci.id}`}>{kiraci.display_name || kiraci.name}</Link></td>
                  <td>
                    <span className="status-pill" data-tone={KURULUM_TONU[kiraci.provisioning_state] ?? "neutral"}>
                      {KURULUM_ADI[kiraci.provisioning_state] ?? kiraci.provisioning_state}
                    </span>
                  </td>
                  <td>{kiraci.plan_code ?? "—"}</td>
                  <td>{kiraci.contact_phone ?? "—"}</td>
                  <td><Link className="panel-secondary" href={`/panel/platform?organization=${kiraci.id}`}>Dosyayı aç</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="panel-muted">Süren kurulum yok; açılan her kurum çalışır durumda.</p>}
      </section>
    ) : null}

    {secili === "tamam" ? (
      <section className="panel-card" aria-label="Tamamlanan kurulumlar">
        <h2>Tamamlanan kurulumlar</h2>
        <p className="panel-muted">
          Çalışır durumdaki kiracılar. Deneme süresi ve aylık ücret burada tanımlanır; ücret, paketin
          <Link href="/panel/platform/moduller"> Ürünler</Link> tarafında yayımlanmış liste fiyatından gelir.
        </p>
        {tamamlananlar.length ? (
          <div className="plt-table-scroll">
            <table className="plt-table">
              <thead><tr><th>Kiracı</th><th>Paket</th><th>Aylık ücret</th><th>Deneme</th><th>Dönem sonu</th></tr></thead>
              <tbody>
                {tamamlananlar.map((kiraci) => {
                  const sapma = ucretSapmasi(kiraci.plan_code, kiraci.monthly_fee);
                  return (
                    <tr key={kiraci.id}>
                      <td>
                        <Link href={`/panel/platform?organization=${kiraci.id}`}>{kiraci.display_name || kiraci.name}</Link>
                        <small className="plt-substatus">{sayi(Number(kiraci.aktif_uye))} kullanıcı</small>
                      </td>
                      <td>{kiraci.plan_code ?? "—"}</td>
                      <td>
                        {sapma.durum === "girilmedi" ? (
                          <form action={listeFiyatiniUygula}>
                            <input type="hidden" name="organization_id" value={kiraci.id} />
                            <span className="status-pill" data-tone="warning">girilmedi</span>
                            {sapma.liste !== null
                              ? <button className="panel-secondary" type="submit">Liste fiyatını uygula · {para(sapma.liste)}</button>
                              : <small className="plt-substatus">Teklif usulü paket; tutarı lisans ekranından girin.</small>}
                          </form>
                        ) : (
                          <>
                            {para(sapma.mevcut ?? 0)}
                            {/* Sapma hata değil: çoğu kiracının pazarlıkla
                                değişmiş tutarı var. Yalnızca yazıyoruz. */}
                            {sapma.durum === "farkli" ? <small className="plt-substatus">liste {para(sapma.liste ?? 0)}</small> : null}
                            {sapma.durum === "teklif" ? <small className="plt-substatus">teklif usulü</small> : null}
                          </>
                        )}
                      </td>
                      <td>
                        <form action={denemeyiAyarla} className="plt-deneme">
                          <input type="hidden" name="organization_id" value={kiraci.id} />
                          {kiraci.license_status === "trialing"
                            ? <span className="status-pill" data-tone="warning">{tarih(kiraci.trial_ends_at)}&apos;e kadar</span>
                            : <span className="status-pill" data-tone="neutral">yok</span>}
                          <input type="number" name="gun" min={0} max={365} defaultValue={kiraci.license_status === "trialing" ? 0 : 14} aria-label="Deneme günü" />
                          <button className="panel-secondary" type="submit">Uygula</button>
                        </form>
                      </td>
                      <td>{tarih(kiraci.current_period_end)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="panel-muted">Tamamlanmış kurulum yok.</p>}
      </section>
    ) : null}
  </main>;
}
