import Link from "next/link";
import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import { gunYazisi } from "@/lib/rapor-donemi";
import { kimliklerle, tumSatirlar } from "@/lib/rapor-okuma";
import {
  operasyonModeli,
  type DagilimSatiri, type OperasyonAdimi, type OperasyonIsi, type OperasyonModeli,
} from "@/lib/rapor-operasyon";
import { cssVar, Icon, percent, TutarlilikUyarisi, WidgetCard, type Tone, type Widget } from "./rapor-parcalari";
import { operasyonTutarliligi } from "@/lib/rapor-tutarlilik";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  OPERASYON VE İŞ AKIŞI (RPR-06) — sorgular.

  Karar `lib/rapor-operasyon.ts`'te ve testli.

  BU RAPORDA TUTAR YOK. Operasyon departmanı üyeleri sözleşme/teklif
  tutarını ve müşteri bakiyesini hiçbir şekilde göremiyor (migration
  20261023183540 + 20261023184948); rapor da tutar okumuyor, bir
  birim testi sayfalarda para sütunu olmadığını sabitliyor. Buraya
  "iş değeri" eklemek üç katmanlı yetki kuralını rapor üzerinden
  atlatmak olurdu.

  AÇIK İŞLER TÜM ZAMANLAR okunuyor: "devam eden" ve "termini geçmiş"
  ŞU ANKİ durum ve iki ay önce açılmış bir iş hâlâ açık olabilir.
  Kapanmış işler pencereyle sınırlı — dönem akışı ve altı aylık seri
  için yeterli.
*/
export async function operasyonVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<OperasyonModeli> {
  const bugun = todayInIstanbul();
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const seriBasi = monthStartKey(sonYil, sonAy - 5);
  const pencereGunu = donem.startKey < seriBasi ? donem.startKey : seriBasi;
  const pencereBasi = istanbulMidnight(pencereGunu).toISOString();

  const IS_ALANLARI =
    "id,title,customer_name,status,priority,waiting_party,start_date,due_date,delivered_at,assigned_employee_id,created_at,updated_at";
  const ACIK = ["planned", "in_progress", "blocked"];

  const [acikIsler, donemIsleri] = await Promise.all([
    tumSatirlar<OperasyonIsi>("açık işler", (bas, son) =>
      supabase.from("operation_workflows")
        .select(IS_ALANLARI)
        .eq("organization_id", organizationId)
        .in("status", ACIK)
        .order("id")
        .range(bas, son)),
    tumSatirlar<OperasyonIsi>("işler", (bas, son) =>
      supabase.from("operation_workflows")
        .select(IS_ALANLARI)
        .eq("organization_id", organizationId)
        /* Açılış, son hareket ya da teslim pencerede; üçü de eski
           olan kapanmış bir iş hiçbir hesaba giremez. */
        .or(`created_at.gte.${pencereBasi},updated_at.gte.${pencereBasi},delivered_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
  ]);

  // Aynı iş iki okumadan da gelebilir; kimlikle tekilleştiriliyor.
  const isler = [...new Map([...acikIsler, ...donemIsleri].map((i) => [i.id, i])).values()];

  /*
    GÖREVLER YALNIZCA AÇIK İŞLERİN: adım tablosu iş tablosunun katı
    ve kapanmış işin görevleri bir karar gerektirmiyor. Kimlikle
    okunuyor, pencereyle değil — açık iş pencereden eski olabilir.
  */
  const adimlar = await kimliklerle<OperasyonAdimi>(
    "görevler",
    acikIsler.map((i) => i.id),
    (parca) => supabase.from("operation_steps")
      .select("workflow_id,status,is_completed,due_date,completed_at")
      .eq("organization_id", organizationId)
      .in("workflow_id", parca),
  );

  const personel = await kimliklerle<{ id: string; full_name: string }>(
    "personel",
    isler.map((i) => i.assigned_employee_id).filter((id): id is string => Boolean(id)),
    (parca) => supabase.from("hr_employees")
      .select("id,full_name").eq("organization_id", organizationId).in("id", parca),
  );

  return operasyonModeli({
    donem, bugun, isler, adimlar,
    personelAdi: new Map(personel.map((p) => [p.id, p.full_name])),
  });
}

/** Bekleyen taraf tonu: bizde olan iş bizim sorumluluğumuz. */
const TARAF_TONU: Record<string, Tone> = { us: "brand", customer: "warning", third_party: "info" };
const ONCELIK_TONU: Record<string, Tone> = { urgent: "danger", high: "warning", normal: "brand", low: "info" };

export async function OperasyonRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await operasyonVerisi({ supabase, organizationId, donem });
  /* Raporun kendi toplamları birbirini tutuyor mu (lib/rapor-tutarlilik).
     Normal şartlarda boş; dolduğu gün ekran bunu söylüyor. */
  const bulgular = operasyonTutarliligi(m);
  const gorevOrani = m.adimToplam ? (m.adimTamamlanan / m.adimToplam) * 100 : null;
  const enYuksekAy = Math.max(1, ...m.aylik.map((a) => Math.max(a.acilan, a.tamamlanan)));
  const enUzunGecikme = Math.max(1, ...m.gecikenler.map((g) => g.gecikmeGun));
  const enYuksekYuk = Math.max(1, ...m.kisiYuku.map((k) => k.aktif));

  const kutular: Widget[] = [
    {
      label: "Devam eden iş", value: String(m.devamEden), note: "Şu anki durum — dönemden bağımsız",
      icon: "briefcase", tone: "brand",
      grafik: { tur: "cubuk", bicim: "sayi", seri: m.aylik.map((a) => ({ ad: a.etiket, eksen: a.etiket, deger: a.acilan, etiket: String(a.acilan) })) },
    },
    {
      label: "Dönemde tamamlanan", value: String(m.tamamlanan),
      note: m.ortSureGun === null ? "Süre ölçülebilir iş yok" : `Ortalama ${m.ortSureGun} günde tamamlandı`,
      icon: "seal", tone: "success",
      grafik: { tur: "cubuk", bicim: "sayi", seri: m.aylik.map((a) => ({ ad: a.etiket, eksen: a.etiket, deger: a.tamamlanan, etiket: String(a.tamamlanan) })) },
    },
    {
      label: "Termini geçmiş", value: String(m.geciken),
      note: m.geciken ? `Devam eden ${m.devamEden} işin ${m.geciken} tanesi` : "Gecikmiş iş yok",
      icon: "alert", tone: m.geciken ? "danger" : "success", toned: true,
      grafik: { tur: "halka", oran: m.devamEden ? (m.geciken / m.devamEden) * 100 : null, altyazi: "açık işin payı" },
    },
    {
      label: "Görev tamamlanma", value: gorevOrani === null ? "—" : percent(gorevOrani),
      note: m.adimToplam ? `${m.adimTamamlanan}/${m.adimToplam} görev · ${m.adimGeciken} görevin termini geçmiş` : "Açık işlerde görev yok",
      icon: "chart", tone: "gold",
      grafik: { tur: "gosterge", oran: gorevOrani ?? 0 },
    },
    {
      label: "Bizde olmayan iş", value: String(m.bizdeOlmayan),
      note: "Müşteri ya da üçüncü taraf bekleniyor",
      icon: "chat", tone: m.bizdeOlmayan ? "warning" : "info",
      grafik: { tur: "yigin", bicim: "sayi", parcalar: m.bekleyenTarafDagilimi.map((d) => ({
        ad: d.ad, deger: d.adet, ton: TARAF_TONU[d.anahtar] ?? "info",
      })) },
    },
  ];

  return <>
    <TutarlilikUyarisi bulgular={bulgular} />

    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        <b>Devam eden</b> ve <b>termini geçmiş</b> satırları şu anki durumu gösterir, dönemden bağımsızdır.
        Gecikme <b>termine</b> göre belirlenir, duruma göre değil: “devam ediyor” olan bir işin termini geçmiş olabilir.
        Ekip yükü işin <b>asıl sorumlusuna</b> yazılır; ek sorumlular işi görür ama yük iki kişiye sayılmaz.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <div className="rapor-ikili">
      <DagilimBloku
        baslik="İş durumları" altyazi="Bütün işler (kapanmışlar dahil)"
        satirlar={m.durumDagilimi} bos="Henüz iş kaydı yok."
      />
      <DagilimBloku
        baslik="Açık işlerin önceliği" altyazi="Kapanmış iş sayılmıyor"
        satirlar={m.oncelikDagilimi} bos="Açık iş yok." tonlar={ONCELIK_TONU}
      />
    </div>

    <div className="rapor-ikili">
      <DagilimBloku
        baslik="Kim bekleniyor?" altyazi="Açık işlerde top kimde"
        satirlar={m.bekleyenTarafDagilimi} bos="Açık iş yok." tonlar={TARAF_TONU}
      />

      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Aylara göre iş</h3><span>Açılan ve tamamlanan</span></div>
        {m.aylik.some((a) => a.acilan || a.tamamlanan) ? <>
          <div className="rapor-aylik" role="img" aria-label={`Aylık: ${m.aylik.map((a) => `${a.etiket} ${a.acilan} açılan, ${a.tamamlanan} tamamlanan`).join("; ")}`}>
            {m.aylik.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === m.aylik.length - 1 ? " is-current" : ""}`}>
              <div className="rapor-aylik-cubuk is-ikili">
                <i className="is-gelir" style={cssVar("--h", `${Math.max(3, (a.acilan / enYuksekAy) * 100)}%`)} title={`${a.acilan} açılan`} />
                <i className="is-cikis" style={cssVar("--h", `${Math.max(3, (a.tamamlanan / enYuksekAy) * 100)}%`)} title={`${a.tamamlanan} tamamlanan`} />
              </div>
              <b>{a.etiket}</b>
              <span>{a.acilan} · {a.tamamlanan}</span>
            </div>)}
          </div>
          <div className="rpt-legend"><span><i className="is-lead" />Açılan</span><span><i className="is-sale" />Tamamlanan</span></div>
        </> : <p className="rpt-empty-note">Son altı ayda açılan ya da tamamlanan iş yok.</p>}
      </section>
    </div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>Ekip yükü</h3>
        <span>İşin asıl sorumlusuna göre · en çok geciken üstte</span>
      </div>
      {m.kisiYuku.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead><tr><th>Sorumlu</th><th className="rpt-money">Devam eden</th><th className="rpt-money">Termini geçmiş</th><th className="rpt-money">Dönemde tamamlanan</th><th>Yük</th></tr></thead>
            <tbody>
              {m.kisiYuku.map((k) => <tr key={k.id ?? "atanmamis"} data-tone={k.geciken ? "danger" : undefined}>
                <th scope="row"><b>{k.ad}</b>{k.id ? null : <small>Sorumlusu girilmemiş işler</small>}</th>
                <td className="rpt-money">{k.aktif}</td>
                <td className="rpt-money">{k.geciken || "—"}</td>
                <td className="rpt-money">{k.tamamlanan || "—"}</td>
                <td className="rapor-pay">
                  <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, (k.aktif / enYuksekYuk) * 100)}%`)} /></div>
                  <span>{k.aktif}</span>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">Açık iş ve dönemde tamamlanan iş yok.</p>}
    </section>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>Termini geçmiş işler</h3>
        <span>Şu anki durum · en çok geciken üstte, ilk 25</span>
      </div>
      {m.gecikenler.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <caption>
              “Kim bekleniyor” sütunu kararı değiştirir: bizde bekleyen iş için plan,
              müşteride bekleyen iş için hatırlatma gerekir.
            </caption>
            <thead><tr><th>İş</th><th>Sorumlu</th><th>Kim bekleniyor</th><th>Termin</th><th className="rpt-money">Gecikme</th></tr></thead>
            <tbody>
              {m.gecikenler.map((g) => <tr key={g.id} data-tone={g.gecikmeGun > 14 ? "danger" : "warning"}>
                <th scope="row">
                  {/* Rapordan işin kendisine geçiş. */}
                  <Link href={`/panel/operations/${g.id}`} className="rapor-kayit-link"><b>{g.baslik}</b></Link>
                  <small>{g.musteri} · {g.durum} · {g.oncelik}</small>
                </th>
                <td>{g.sorumlu}</td>
                <td>{g.bekleyenTaraf}</td>
                <td>{gunYazisi(g.termin)}</td>
                <td className="rpt-money">
                  <div className="rapor-bekleme">
                    <span>{g.gecikmeGun} gün</span>
                    <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(4, (g.gecikmeGun / enUzunGecikme) * 100)}%`)} /></div>
                  </div>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <div className="rpt-empty" data-tone="success">
        <span className="rpt-insight-icon"><Icon name="heart" size={20} /></span>
        <b>Termini geçmiş iş yok</b>
        <p>Açık işlerin hepsi termini içinde.</p>
      </div>}
    </section>
  </>;
}

/** Dağılım tablosu; üç blok da aynı biçimde. */
function DagilimBloku({
  baslik, altyazi, satirlar, bos, tonlar,
}: {
  baslik: string;
  altyazi: string;
  satirlar: DagilimSatiri[];
  bos: string;
  tonlar?: Record<string, Tone>;
}) {
  const enYuksek = Math.max(1, ...satirlar.map((s) => s.adet));
  return (
    <section className="rapor-blok">
      <div className="rapor-blok-bas"><h3>{baslik}</h3><span>{altyazi}</span></div>
      {satirlar.length ? (
        <ul className="rpt-lost">
          {satirlar.map((s) => <li key={s.anahtar} data-tone={tonlar?.[s.anahtar]}>
            <div className="rpt-lost-top"><b>{s.ad}</b><span>{s.adet} iş{s.pay === null ? "" : ` · ${percent(s.pay)}`}</span></div>
            <div className="rpt-lost-track"><i style={cssVar("--w", `${(s.adet / enYuksek) * 100}%`)} /></div>
          </li>)}
        </ul>
      ) : <p className="rpt-empty-note">{bos}</p>}
    </section>
  );
}
