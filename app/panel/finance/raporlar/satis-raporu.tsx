import Link from "next/link";
import { istanbulMidnight, monthStartKey } from "@/lib/istanbul-date";
import { gunYazisi } from "@/lib/rapor-donemi";
import { kimliklerle, tumSatirlar } from "@/lib/rapor-okuma";
import { satisModeli, type SatisModeli, type SatisSozlesmesi, type SatisTalebi, type SatisTeklifi } from "@/lib/rapor-satis";
import { Icon, WidgetCard, cssVar, money, percent, type Widget } from "./rapor-parcalari";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  SATIŞ ANALİTİĞİ (RPR-01) — sorgular.

  Karar `lib/rapor-satis.ts`'te ve testli; burada yalnızca okuma var.
  Excel rotası AYNI `satisVerisi` işlevini çağırıyor, yani dosyadaki
  sayı ekrandakiyle aynı sorgudan geliyor.

  SATIŞ ≠ TAHSİLAT. Bu rapor imzalanan sözleşmenin tutarını sayıyor,
  kasaya gireni değil; ekranda da böyle yazıyor
  (docs/RAPORLAMA-ASAMA-1.md §3.2).
*/

/*
  PENCERE: dönem ya da altı aylık eğilim, hangisi eskiyse. Kurumun
  bütün sözleşmelerini çekmek, tablo büyüdükçe yavaşlamakla kalmaz;
  PostgREST'in satır tavanına çarpıldığı gün satış toplamı SESSİZCE
  eksilirdi (AGENTS.md "Rakam denetimi"). Okuma yine sayfalanıyor —
  pencere içinde bile bin satır aşılabilir.
*/
export async function satisVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<SatisModeli> {
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const egilimBasi = monthStartKey(sonYil, sonAy - 5);
  const pencereGunu = donem.startKey < egilimBasi ? donem.startKey : egilimBasi;
  const pencereBasi = istanbulMidnight(pencereGunu).toISOString();
  const donemBasi = istanbulMidnight(donem.startKey).toISOString();

  const [sozlesmeler, teklifler] = await Promise.all([
    tumSatirlar<SatisSozlesmesi>("sözleşmeler", (bas, son) =>
      supabase.from("crm_contracts")
        .select("id,contract_no,title,amount,status,signed_at,created_at,opportunity_id")
        .eq("organization_id", organizationId)
        /* İmza anı ya da oluşturulma anı pencerede: ikisi de
           pencereden eski olan bir sözleşme hiçbir hesaba giremez. */
        .or(`signed_at.gte.${pencereBasi},created_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    tumSatirlar<SatisTeklifi>("teklifler", (bas, son) =>
      supabase.from("crm_proposals")
        /* `archive_reason` ŞART: kabul edilen teklifin status'ü
           'archived' oluyor, gerçek durum burada (lib/teklif-durumu). */
        .select("id,root_proposal_id,amount,status,archive_reason,sent_at")
        .eq("organization_id", organizationId)
        /* Teklif yalnızca DÖNEM için sayılıyor (eğilim serisi satıştan
           çiziliyor), o yüzden pencere dönemin başı. */
        .gte("sent_at", donemBasi)
        .order("id")
        .range(bas, son)),
  ]);

  /*
    TALEPLER KİMLİKLE OKUNUYOR, pencereyle değil: sekiz ay önce gelen
    aday bu ay imzalanabiliyor. Pencereyle okumak o talebi
    getirmezdi ve satış hiçbir personele yazılmazdı — kırılım sessizce
    eksilirdi.
  */
  const talepKimlikleri = sozlesmeler.map((s) => s.opportunity_id).filter((id): id is string => Boolean(id));
  const talepSatirlari = await kimliklerle<{ id: string; assigned_employee_id: string | null; customer_name: string; request_details: { service_type?: unknown } | null }>(
    "talepler",
    talepKimlikleri,
    (parca) => supabase.from("crm_opportunities")
      .select("id,assigned_employee_id,customer_name,request_details")
      .eq("organization_id", organizationId)
      .in("id", parca),
  );

  const talepler = new Map<string, SatisTalebi>(talepSatirlari.map((t) => [t.id, {
    assigned_employee_id: t.assigned_employee_id,
    customer_name: t.customer_name,
    /* Hizmet türü JSON içinde serbest metin; sayı ya da nesne gelirse
       "belirtilmemiş" sayılıyor (docs/RAPORLAMA-ASAMA-1.md §2.2). */
    service_type: typeof t.request_details?.service_type === "string" ? t.request_details.service_type : null,
  }]));

  const personelSatirlari = await kimliklerle<{ id: string; full_name: string }>(
    "personel",
    [...talepler.values()].map((t) => t.assigned_employee_id).filter((id): id is string => Boolean(id)),
    (parca) => supabase.from("hr_employees")
      .select("id,full_name")
      .eq("organization_id", organizationId)
      .in("id", parca),
  );
  const personelAdi = new Map(personelSatirlari.map((p) => [p.id, p.full_name]));

  return satisModeli({ donem, sozlesmeler, teklifler, talepler, personelAdi });
}

export async function SatisRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await satisVerisi({ supabase, organizationId, donem });
  const enYuksekAy = Math.max(1, ...m.aylik.map((a) => a.tutar));

  const kutular: Widget[] = [
    {
      label: "Satış tutarı", value: money(m.toplam), note: "İmzalanan sözleşme tutarı · son 6 ay",
      icon: "seal", tone: "success",
      grafik: { tur: "cubuk", seri: m.aylik.map((a) => ({ ad: a.etiket, deger: a.tutar, etiket: money(a.tutar) })) },
    },
    {
      label: "Satış adedi", value: String(m.adet), note: "Dönemde imzalanan sözleşme",
      icon: "doc", tone: "brand",
      grafik: { tur: "cubuk", seri: m.aylik.map((a) => ({ ad: a.etiket, deger: a.adet, etiket: String(a.adet) })) },
    },
    {
      label: "Ortalama sözleşme", value: m.adet ? money(m.ortalama) : "—", note: "Satış tutarı ÷ satış adedi",
      icon: "chart", tone: "gold",
      grafik: { tur: "yigin", parcalar: [
        { ad: "Ortalama", deger: m.ortalama, ton: "gold" },
        { ad: "Kalan", deger: Math.max(0, m.toplam - m.ortalama), ton: "brand" },
      ] },
    },
    {
      label: "Verilen teklif", value: String(m.teklifAdet), note: `${money(m.teklifTutari)} · revizyonlar tek süreç`,
      icon: "inbox", tone: "info",
      grafik: { tur: "halka", oran: m.teklifAdet ? (m.kabulAdet / m.teklifAdet) * 100 : null, altyazi: "kabul oranı" },
    },
    {
      label: "Teklif → satış", value: m.donusum === null ? "—" : percent(m.donusum),
      note: m.donusum === null ? "Dönemde müşteriye teklif gönderilmedi" : `${m.teklifAdet} teklifin ${m.kabulAdet} tanesi kabul edildi`,
      icon: "spark", tone: "gold", toned: true,
      grafik: { tur: "gosterge", oran: m.donusum ?? 0 },
    },
  ];

  return <>
    {/* KPI tanımı EKRANDA: "satış" ile "tahsilat" aynı şey sanılırsa
        rapor doğru sayıyı yanlış soruya cevap olarak verir. */}
    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Bu rapor <b>satışı</b> sayar: sözleşmenin imzalandığı andaki tutar.
        Kasaya giren para <b>Tahsilat ve Alacak</b> raporunda; muhasebesel gelir <b>Finansal Performans</b>’ta.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas"><h3>Aylara göre satış</h3><span>Dönem bitişinden geriye altı ay</span></div>
      {m.aylik.some((a) => a.tutar > 0) ? (
        <div className="rapor-aylik" role="img" aria-label={`Aylık satış: ${m.aylik.map((a) => `${a.etiket} ${money(a.tutar)}, ${a.adet} satış`).join("; ")}`}>
          {m.aylik.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === m.aylik.length - 1 ? " is-current" : ""}`}>
            <div className="rapor-aylik-cubuk"><i style={cssVar("--h", `${Math.max(3, (a.tutar / enYuksekAy) * 100)}%`)} /></div>
            <b>{a.etiket}</b>
            <span>{money(a.tutar)}</span>
            <small>{a.adet} satış</small>
          </div>)}
        </div>
      ) : <p className="rpt-empty-note">Son altı ayda imzalanmış sözleşme yok.</p>}
    </section>

    <div className="rapor-ikili">
      <Kirilim
        baslik="Personele göre satış"
        altyazi={m.atanmamisAdet ? `${m.atanmamisAdet} satışın talebi bir personele atanmamış` : "Satış, talebin atandığı personele yazılır"}
        birimBasligi="Personel"
        satirlar={m.personel}
        bos="Dönemde satış yok."
      />
      <Kirilim
        baslik="Hizmet türüne göre satış"
        altyazi="Tür talep kaydındaki serbest metinden; yazım farkları birleştirilir"
        birimBasligi="Hizmet türü"
        satirlar={m.hizmet}
        bos="Dönemde satış yok."
      />
    </div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas"><h3>En büyük satışlar</h3><span>Dönemin ilk on sözleşmesi</span></div>
      {m.enBuyuk.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead><tr><th>Sözleşme</th><th>Müşteri</th><th>İmza</th><th className="rpt-money">Tutar</th></tr></thead>
            <tbody>
              {m.enBuyuk.map((s) => <tr key={s.id}>
                <th scope="row">
                  {/* Rapordan KAYDA geçiş: sözleşme detayına gidiyor.
                      Rakamı görüp "hangi sözleşmeydi" diye aramak
                      zorunda kalmak, raporu yarım bırakmaktı. */}
                  <Link href={`/panel/crm/contracts/${s.id}`} className="rapor-kayit-link"><b>{s.no}</b></Link>
                  <small>{s.baslik}</small>
                </th>
                <td>{s.musteri}</td>
                <td>{gunYazisi(s.gun)}</td>
                <td className="rpt-money">{money(s.tutar)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">Bu dönemde imzalanmış sözleşme yok.</p>}
    </section>
  </>;
}

/** Pay çubuklu kırılım tablosu; iki kırılım da aynı biçimde. */
function Kirilim({
  baslik, altyazi, birimBasligi, satirlar, bos,
}: {
  baslik: string;
  altyazi: string;
  birimBasligi: string;
  satirlar: { ad: string; adet: number; tutar: number; pay: number | null }[];
  bos: string;
}) {
  return (
    <section className="rapor-blok">
      <div className="rapor-blok-bas"><h3>{baslik}</h3><span>{altyazi}</span></div>
      {satirlar.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead><tr><th>{birimBasligi}</th><th className="rpt-money">Tutar</th><th className="rpt-money">Adet</th><th>Pay</th></tr></thead>
            <tbody>
              {satirlar.map((k) => <tr key={k.ad}>
                <th scope="row"><b>{k.ad}</b></th>
                <td className="rpt-money">{money(k.tutar)}</td>
                <td className="rpt-money">{k.adet}</td>
                <td className="rapor-pay">
                  <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, k.pay ?? 0)}%`)} /></div>
                  <span>{k.pay === null ? "—" : percent(k.pay)}</span>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">{bos}</p>}
    </section>
  );
}
