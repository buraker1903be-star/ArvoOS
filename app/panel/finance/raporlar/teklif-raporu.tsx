import Link from "next/link";
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";
import { gunYazisi } from "@/lib/rapor-donemi";
import { kimliklerle, tumSatirlar } from "@/lib/rapor-okuma";
import { teklifModeli, type TeklifModeli, type TeklifSatiri, type TeklifSozlesmesi } from "@/lib/rapor-teklif";
import { Icon, WidgetCard, cssVar, money, percent, type Tone, type Widget } from "./rapor-parcalari";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  TEKLİF VE SÖZLEŞME (RPR-07) — sorgular.

  Karar `lib/rapor-teklif.ts`'te ve testli.

  ZİNCİRİN TAMAMI OKUNUYOR, PENCERENİN İÇİ DEĞİL. Teklif süreci
  revizyonlardan oluşuyor ve dönemde gönderilen bir revizyonun
  önceki halkaları pencereden ESKİ olabilir. Yalnızca pencereyi
  okumak süreci yarım görmek demekti: revizyon sayısı eksik çıkar,
  "yanıtı alan revizyon" bulunamaz ve kabul edilmiş bir süreç
  "yanıt bekliyor" görünebilirdi. O yüzden iki adım: pencere →
  kökler → zincirin kalanı.
*/

type TeklifHam = TeklifSatiri;
type SozlesmeHam = TeklifSozlesmesi;

const TEKLIF_ALANLARI =
  "id,proposal_no,title,root_proposal_id,revision_no,amount,status,archive_reason,sent_at,responded_at,customer_responded_at,opportunity_id";
const SOZLESME_ALANLARI =
  "id,contract_no,title,amount,status,sent_at,signed_at,created_at,first_viewed_at,view_count,opportunity_id";

export async function teklifVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<TeklifModeli> {
  const bugun = todayInIstanbul();
  const donemBasi = istanbulMidnight(donem.startKey).toISOString();

  const [pencereTeklifleri, donemSozlesmeleri, acikSozlesmeler] = await Promise.all([
    tumSatirlar<TeklifHam>("teklifler", (bas, son) =>
      supabase.from("crm_proposals")
        .select(TEKLIF_ALANLARI)
        .eq("organization_id", organizationId)
        /* Gönderim ya da oluşturulma pencerede; ikisi de eski olan bir
           teklif dönem akışına giremez. */
        .or(`sent_at.gte.${donemBasi},created_at.gte.${donemBasi}`)
        .order("id")
        .range(bas, son)),
    tumSatirlar<SozlesmeHam>("sözleşmeler", (bas, son) =>
      supabase.from("crm_contracts")
        .select(SOZLESME_ALANLARI)
        .eq("organization_id", organizationId)
        .or(`sent_at.gte.${donemBasi},created_at.gte.${donemBasi}`)
        .order("id")
        .range(bas, son)),
    /*
      AÇIK SÖZLEŞMELER DÖNEMSİZ ve ayrı bir sorgu: "imza bekleyen" ile
      "devam eden" ŞU ANKİ durum. İki ay önce gönderilip hâlâ
      imzalanmamış bir sözleşme bu ayın raporunda da görünmeli.
      Durumu `or` içine gömmek yerine ikinci bir okuma: zincirin
      içindeki `in` yazımı kolay bozuluyor ve bozulduğunda hata
      vermiyor, sessizce satır eksiltiyor.
    */
    tumSatirlar<SozlesmeHam>("açık sözleşmeler", (bas, son) =>
      supabase.from("crm_contracts")
        .select(SOZLESME_ALANLARI)
        .eq("organization_id", organizationId)
        .in("status", ["sent", "signed"])
        .order("id")
        .range(bas, son)),
  ]);

  /*
    ZİNCİRİN KALANI: pencerede görülen tekliflerin kökleri üzerinden.
    Hem `root_proposal_id` eşleşenler (sonraki revizyonlar) hem de
    kökün KENDİSİ (ilk revizyonun `root_proposal_id`'si boş).
  */
  const kokler = [...new Set(pencereTeklifleri.map((t) => t.root_proposal_id ?? t.id))];
  const [zincirRevizyonlari, kokSatirlari] = await Promise.all([
    kimliklerle<TeklifHam>("teklif revizyonları", kokler, (parca) =>
      supabase.from("crm_proposals").select(TEKLIF_ALANLARI)
        .eq("organization_id", organizationId).in("root_proposal_id", parca)),
    kimliklerle<TeklifHam>("kök teklifler", kokler, (parca) =>
      supabase.from("crm_proposals").select(TEKLIF_ALANLARI)
        .eq("organization_id", organizationId).in("id", parca)),
  ]);

  // Aynı satır üç okumadan da gelebilir; kimlikle tekilleştiriliyor.
  const teklifler = [...new Map(
    [...pencereTeklifleri, ...zincirRevizyonlari, ...kokSatirlari].map((t) => [t.id, t]),
  ).values()];
  const sozlesmeler = [...new Map(
    [...donemSozlesmeleri, ...acikSozlesmeler].map((c) => [c.id, c]),
  ).values()];

  const musteriSatirlari = await kimliklerle<{ id: string; customer_name: string }>(
    "müşteriler",
    sozlesmeler.map((c) => c.opportunity_id).filter((id): id is string => Boolean(id)),
    (parca) => supabase.from("crm_opportunities")
      .select("id,customer_name").eq("organization_id", organizationId).in("id", parca),
  );
  const musteriAdi = new Map(musteriSatirlari.map((o) => [o.id, o.customer_name]));

  return teklifModeli({ donem, bugun, teklifler, sozlesmeler, musteriAdi });
}

/** Durum rengi: kabul yeşil, ret/süre kırmızı, bekleyen altın. */
const DURUM_TONU: Record<string, Tone> = {
  accepted: "success", rejected: "danger", expired: "warning",
  sent: "gold", draft: "info", archived: "info",
};

export async function TeklifRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await teklifVerisi({ supabase, organizationId, donem });
  const enUzunBekleme = Math.max(1, ...m.bekleyenler.map((b) => b.beklemeGun ?? 0));

  const kutular: Widget[] = [
    {
      label: "Gönderilen teklif", value: String(m.surecAdet),
      note: `${money(m.surecTutar)} · revizyonlar tek süreç`,
      icon: "inbox", tone: "brand",
      grafik: { tur: "cubuk", seri: m.dagilim.map((d) => ({ ad: d.ad, deger: d.adet, etiket: String(d.adet) })) },
    },
    {
      label: "Kabul edilen", value: String(m.kabul), note: `${money(m.kabulTutar)} kabul tutarı`,
      icon: "seal", tone: "success",
      grafik: { tur: "halka", oran: m.donusum, altyazi: "kabul oranı" },
    },
    {
      label: "Teklif → kabul", value: m.donusum === null ? "—" : percent(m.donusum),
      note: m.donusum === null ? "Dönemde teklif gönderilmedi" : `${m.red} ret · ${m.sureGecti} süresi geçti · ${m.yanitBekleyen} bekliyor`,
      icon: "spark", tone: "gold", toned: true,
      grafik: { tur: "gosterge", oran: m.donusum ?? 0 },
    },
    {
      label: "Ortalama yanıt", value: m.ortYanitGun === null ? "—" : `${m.ortYanitGun} gün`,
      note: m.ortYanitGun === null ? "Yanıtlanan teklif yok" : `${m.musteriKarari} kararı müşteri verdi`,
      icon: "chat", tone: "info",
      grafik: { tur: "yigin", bicim: "sayi", parcalar: [
        { ad: "Yanıtlanan", deger: m.kabul + m.red, ton: "success" },
        { ad: "Bekleyen", deger: m.yanitBekleyen, ton: "warning" },
      ] },
    },
    {
      label: "İmza bekleyen", value: money(m.bekleyenTutar),
      note: m.bekleyenler.length ? `${m.bekleyenler.length} sözleşme · şu anki durum` : "Bekleyen imza yok",
      icon: "doc", tone: m.bekleyenTutar ? "warning" : "success", toned: true,
      grafik: { tur: "cubuk", seri: m.bekleyenler.slice(0, 6).map((b) => ({ ad: b.no, deger: b.tutar, etiket: money(b.tutar) })) },
    },
  ];

  return <>
    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Teklif <b>süreç</b> olarak sayılır: aynı işin revizyonları tek teklif.
        Durum <b>archive_reason</b>’dan okunur — kabul edilen teklifin <code>status</code>’ü
        {" "}<code>archived</code> oluyor. <b>İmza bekleyen</b> satırı dönemden bağımsızdır:
        iki ay önce gönderilmiş bir sözleşme de buraya girer.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <div className="rapor-ikili">
      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Teklif durumları</h3><span>Dönemde gönderilen süreçlerin sonu</span></div>
        {m.dagilim.length ? (
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead><tr><th>Durum</th><th className="rpt-money">Süreç</th><th className="rpt-money">Tutar</th><th>Pay</th></tr></thead>
              <tbody>
                {m.dagilim.map((d) => <tr key={d.durum} data-tone={DURUM_TONU[d.durum]}>
                  <th scope="row"><b>{d.ad}</b></th>
                  <td className="rpt-money">{d.adet}</td>
                  <td className="rpt-money">{money(d.tutar)}</td>
                  <td className="rapor-pay">
                    <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, d.pay ?? 0)}%`)} /></div>
                    <span>{d.pay === null ? "—" : percent(d.pay)}</span>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="rpt-empty-note">Bu dönemde müşteriye gönderilmiş teklif yok.</p>}
      </section>

      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Sözleşme akışı</h3><span>Dönem hareketi ve şu anki durum</span></div>
        <ul className="rpt-insights">
          <li data-tone="brand">
            <span className="rpt-insight-icon"><Icon name="doc" size={17} /></span>
            <div><b>Dönemde</b><p>{`${m.gonderilenSozlesme} sözleşme gönderildi, ${m.imzalananSozlesme} tanesi imzalandı (${money(m.imzalananTutar)}).`}</p></div>
          </li>
          <li data-tone={m.ortImzaGun === null ? "info" : "gold"}>
            <span className="rpt-insight-icon"><Icon name="chart" size={17} /></span>
            <div><b>İmza süresi</b><p>{m.ortImzaGun === null
              ? "Gönderim ve imza tarihi birlikte bulunan sözleşme yok; süre ölçülemiyor."
              : `Gönderimden imzaya ortalama ${m.ortImzaGun} gün.`}</p></div>
          </li>
          <li data-tone={m.bekleyenTutar ? "warning" : "success"}>
            <span className="rpt-insight-icon"><Icon name="alert" size={17} /></span>
            <div><b>İmza bekleyen</b><p>{m.bekleyenler.length
              ? `${m.bekleyenler.length} sözleşmede ${money(m.bekleyenTutar)} imza bekliyor; en uzun bekleyen ${m.bekleyenler[0].beklemeGun} gün.`
              : "İmza bekleyen sözleşme yok."}</p></div>
          </li>
          <li data-tone="success">
            <span className="rpt-insight-icon"><Icon name="briefcase" size={17} /></span>
            <div><b>Devam eden iş</b><p>{m.aktifAdet
              ? `${m.aktifAdet} imzalı sözleşme (${money(m.aktifTutar)}) henüz tamamlanmadı.`
              : "Tamamlanmayı bekleyen imzalı sözleşme yok."}</p></div>
          </li>
          {m.revizeSurec ? (
            <li data-tone="info">
              <span className="rpt-insight-icon"><Icon name="flow" size={17} /></span>
              <div><b>Revizyon</b><p>{`${m.revizeSurec} süreç revize edildi; süreç başına ortalama ${m.ortRevizyon} teklif satırı.`}</p></div>
            </li>
          ) : null}
        </ul>
      </section>
    </div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>İmza bekleyen sözleşmeler</h3>
        <span>Şu anki durum · en uzun bekleyen üstte</span>
      </div>
      {m.bekleyenler.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <caption>
              “Müşteri açtı mı” sözleşme bağlantısının açılıp açılmadığını gösterir ve kararı değiştirir:
              açılmamış bir sözleşme için hatırlatma, açılıp imzalanmamış için telefon gerekir.
            </caption>
            <thead><tr><th>Sözleşme</th><th>Müşteri</th><th>Gönderim</th><th className="rpt-money">Bekleme</th><th className="rpt-money">Tutar</th></tr></thead>
            <tbody>
              {m.bekleyenler.map((b) => <tr key={b.id} data-tone={(b.beklemeGun ?? 0) > 14 ? "danger" : undefined}>
                <th scope="row">
                  <Link href={`/panel/crm/contracts/${b.id}`} className="rapor-kayit-link"><b>{b.no}</b></Link>
                  <small>{b.goruldu ? `Müşteri açtı · ${b.goruntuleme} görüntüleme` : "Müşteri henüz açmadı"}</small>
                </th>
                <td>{b.musteri}</td>
                <td>{b.gonderimGun ? gunYazisi(b.gonderimGun) : "—"}</td>
                <td className="rpt-money">
                  <div className="rapor-bekleme">
                    <span>{b.beklemeGun === null ? "—" : `${b.beklemeGun} gün`}</span>
                    <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(4, ((b.beklemeGun ?? 0) / enUzunBekleme) * 100)}%`)} /></div>
                  </div>
                </td>
                <td className="rpt-money">{money(b.tutar)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <div className="rpt-empty" data-tone="success">
        <span className="rpt-insight-icon"><Icon name="heart" size={20} /></span>
        <b>İmza bekleyen sözleşme yok</b>
        <p>Gönderilmiş her sözleşme yanıtlanmış durumda.</p>
      </div>}
    </section>
  </>;
}
