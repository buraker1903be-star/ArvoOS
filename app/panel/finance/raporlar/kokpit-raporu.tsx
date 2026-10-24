import Link from "next/link";
import { monthStartKey, istanbulMidnight } from "@/lib/istanbul-date";
import {
  Icon, Ledger, OzetKart, TutarlilikUyarisi, WidgetCard,
  clampPercent, cssVar, deduction, money, percent, shareOf,
  type LedgerRow, type Tone, type Widget,
} from "./rapor-parcalari";
import { kokpitImzaliSozlesmeler, kokpitModeli } from "@/lib/rapor-kokpit";
import { kokpitTutarliligi } from "@/lib/rapor-tutarlilik";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  YÖNETİCİ KOKPİTİ (RPR-00).

  Bu içerik 2026-10'a kadar Raporlar SAYFASININ kendisiydi. Sayfa artık
  sekiz raporun merkezi; kokpit onlardan biri ve kendi penceresinde
  açılıyor. Hesaplar bire bir taşındı — taşıma sırasında bir sayıyı
  "iyileştirmek", raporun daha önce doğrulanmış rakamını sessizce
  değiştirmek olurdu.
*/
type Opportunity = { id: string; stage: string; estimated_value: number; source: string | null; lost_reason: string | null; created_at: string; updated_at: string };
type Proposal = { id: string; opportunity_id: string; amount: number; status: string; superseded_by: string | null; created_at: string };
type Contract = { id: string; opportunity_id: string | null; amount: number; status: string; signed_at: string | null; created_at: string };
type Transaction = { transaction_type: "income" | "expense"; status: string; amount: number; category:string|null;paid_at: string | null; created_at: string };
type CostItem={contract_id:string;amount:number;status:string;cost_date:string};
type AccountEntry={entry_type:"debit"|"credit";source_type:string;amount:number;transaction_date:string};

export async function KokpitRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const { startKey, endKey } = donem;
  const [sonYil, sonAy] = endKey.split("-").map(Number);
  const trendStartKey = monthStartKey(sonYil, sonAy - 5);
  const queryStartKey = startKey < trendStartKey ? startKey : trendStartKey;

  /*
    OKUMALAR PENCEREYLE SINIRLI (12.10.2026).

    Talep, sözleşme ve maliyet kalemleri kurumun TAMAMI için, zaman
    sınırı olmadan çekiliyordu. Defter ve talep tablosu hiç küçülmüyor:
    PostgREST'in satır tavanına çarpıldığı gün raporun sayıları
    sessizce eksilirdi — hem de paranın raporlandığı yerde (AGENTS.md
    "Rakam denetimi").

    Pencere `queryStartKey` (Türkiye gece yarısı): istenen aralık ya da altı aylık trend, hangisi
    eskiyse. Daraltma SAYIYI DEĞİŞTİRMİYOR, her kullanım tek tek
    izlendi:

    - Talepler: `incoming` created_at'e, `wonOpportunities`/`lost`
      updated_at'e, trend dilimleri son altı aya bakıyor. İki tarihi de
      pencereden ESKİ olan bir kayıt hiçbirine giremez — `or` süzgeci
      tam olarak bunu söylüyor. "Satışa dönen" kümesi tüm zamanların
      kazanılmış taleplerinden kuruluyordu ama yalnızca aralık
      içindeki talepleri sınıflamak için kullanılıyor; onların kimliği
      zaten pencerede.
    - Sözleşmeler: aynı gerekçe (signed_at ya da created_at).
      Aralıktaki bir talebin sözleşmesi, talepten sonra açıldığı için
      pencerenin içinde kalır.
    - Maliyet kalemleri İKİ sorguya ayrıldı: tarihli kullanımlar
      (ödenen maliyet, maliyet serisi) pencereyle; "imzalı sözleşmenin
      maliyeti" ise KALEM TARİHİNE BAKMADAN sözleşme kimliğiyle —
      kalem sözleşmeden aylar sonra girilebiliyor, tarihle süzmek kârı
      yanlış hesaplardı.
  */
  const pencereBasi = istanbulMidnight(queryStartKey).toISOString();
  const [opportunityResult, proposalResult, contractResult, transactionResult,costResult,entryResult] = await Promise.all([
    supabase.from("crm_opportunities").select("id,stage,estimated_value,source,lost_reason,created_at,updated_at").eq("organization_id", organizationId)
      .or(`created_at.gte.${pencereBasi},updated_at.gte.${pencereBasi}`),
    supabase.from("crm_proposals").select("id,opportunity_id,amount,status,superseded_by,created_at").eq("organization_id", organizationId).gte("created_at", pencereBasi),
    supabase.from("crm_contracts").select("id,opportunity_id,amount,status,signed_at,created_at").eq("organization_id", organizationId)
      .or(`signed_at.gte.${pencereBasi},created_at.gte.${pencereBasi}`),
    supabase.from("finance_transactions").select("transaction_type,status,amount,category,paid_at,created_at").eq("organization_id", organizationId).gte("created_at", pencereBasi),
    supabase.from("contract_cost_items").select("contract_id,amount,status,cost_date").eq("organization_id",organizationId).gte("cost_date",queryStartKey),
    supabase.from("account_entries").select("entry_type,source_type,amount,transaction_date").eq("organization_id",organizationId).gte("transaction_date",queryStartKey),
  ]);
  if (opportunityResult.error) throw new Error(`CRM raporu okunamadı: ${opportunityResult.error.message}`);
  if(proposalResult.error||contractResult.error||transactionResult.error||costResult.error||entryResult.error)throw new Error("Finansal rapor verileri eksiksiz okunamadı.");
  const opportunities = (opportunityResult.data ?? []) as Opportunity[];
  const proposals = (proposalResult.data ?? []) as Proposal[];
  const contracts = (contractResult.data ?? []) as Contract[];
  const transactions = (transactionResult.data ?? []) as Transaction[];
  const costItems=(costResult.data??[]) as CostItem[];
  const accountEntries=(entryResult.data??[]) as AccountEntry[];
  /*
    HESAP MODELDE (lib/rapor-kokpit). Öteki yedi rapor saf bir modele
    taşınmışken kokpit tek istisnaydı ve bu yüzden tutarlılık
    denetimine de raporlar arası karşılaştırmaya da giremiyordu —
    satış tutarını RPR-01'den, tahsilatı RPR-03'ten bağımsız
    hesaplayıp onlarla ayrışabilirdi.

    Sözleşme maliyeti sorgusu imzalı sözleşme kimliklerine bağlı,
    yani hesabın ortasında bir okuma vardı: önce kimlikler
    çıkarılıyor, sonra okunuyor, sonra model çağrılıyor.
  */
  const imzaliKimlikler = [...new Set(kokpitImzaliSozlesmeler(contracts, donem).map((row) => row.id))];
  const { data: sozlesmeMaliyetleri, error: maliyetHatasi } = imzaliKimlikler.length
    ? await supabase.from("contract_cost_items").select("contract_id,amount")
        .eq("organization_id", organizationId).in("contract_id", imzaliKimlikler)
    : { data: [], error: null };
  if (maliyetHatasi) throw new Error("Sözleşme maliyetleri okunamadı: " + maliyetHatasi.message);

  const model = kokpitModeli({
    donem, opportunities, proposals, contracts, transactions, costItems, accountEntries,
    sozlesmeMaliyetleri: (sozlesmeMaliyetleri ?? []) as { contract_id: string; amount: number }[],
  });
  /* Raporun kendi toplamları birbirini tutuyor mu (lib/rapor-tutarlilik).
     Normal şartlarda boş; dolduğu gün ekran bunu söylüyor. */
  const bulgular = kokpitTutarliligi(model);
  const {
    incoming, reached, qualified,
    sales, salesValue, huniTeklif, huniSatis, conversion, averageSale,
    contractedCost, grossProfit, grossMargin,
    collections, paidJobCost, operatingExpense, realizedProfit, realizedMargin,
    lost, lostReasons, maxLostReason,
    funnel, maxFunnel, transitionRates, weakestStep,
    months, maxTrend, leadSerisi, satisSerisi, maliyetSerisi, tahsilatSerisi,
    referralLeads, referralSales,
  } = model;

  // --- Sunum: yukarıda hesaplanan değerlerden türetilir, yeni sorgu yok ---
  const oranOf = (pay: number, payda: number) => (payda ? (pay / payda) * 100 : null);
  const salesWidgets: Widget[] = [
    { label: "Gelen lead", value: String(incoming.length), note: "Dönemde gelen aday", icon: "inbox", tone: "brand", grafik: { tur: "cubuk", bicim: "sayi", seri: leadSerisi } },
    { label: "Ulaşılan", value: String(reached.length), note: "Gelen adayların görüşülen kısmı", icon: "chat", tone: "info", grafik: { tur: "halka", oran: oranOf(reached.length, incoming.length), altyazi: "erişim oranı" } },
    { label: "Nitelikli lead", value: String(qualified.length), note: "Görüşülenlerin gerçek aday kısmı", icon: "badge", tone: "info", grafik: { tur: "halka", oran: oranOf(qualified.length, reached.length), altyazi: "nitelikli oranı" } },
    { label: "Teklif", value: String(huniTeklif.length), note: "Bu dönemin adaylarından teklif verilen", icon: "doc", tone: "gold", grafik: { tur: "halka", oran: oranOf(huniTeklif.length, qualified.length), altyazi: "nitelikliye teklif" } },
    { label: "Satış", value: String(sales), note: `${money(salesValue)} imzalı sözleşme`, icon: "seal", tone: "success", grafik: { tur: "cubuk", bicim: "sayi", seri: satisSerisi } },
  ];
  const financeWidgets: Widget[] = [
    { label: "Dönüşüm", value: percent(conversion), note: `Görüşülen ${reached.length} adaydan ${huniSatis.length} satış`, icon: "spark", tone: "gold", grafik: { tur: "gosterge", oran: conversion } },
    { label: "İş maliyeti", value: money(contractedCost), note: "Bu dönem imzalanan işlerin maliyeti", icon: "briefcase", tone: "warning", grafik: { tur: "cubuk", bicim: "para", seri: maliyetSerisi } },
    { label: "Brüt iş kârı", value: money(grossProfit), note: `${percent(grossMargin)} sözleşme marjı`, icon: "chart", tone: grossProfit >= 0 ? "success" : "danger", toned: true, grafik: { tur: "yigin", bicim: "para", parcalar: [{ ad: "Maliyet", deger: contractedCost, ton: "warning" }, { ad: "Kâr", deger: grossProfit, ton: grossProfit >= 0 ? "success" : "danger" }] } },
    { label: "Tahsilat", value: money(collections), note: "Dönemde kasaya giren müşteri ödemesi", icon: "wallet", tone: "brand", grafik: { tur: "cubuk", bicim: "para", seri: tahsilatSerisi } },
    { label: "Net nakit hareketi", value: money(realizedProfit), note: `${percent(realizedMargin)} tahsilat sonrası fark`, icon: "flow", tone: realizedProfit >= 0 ? "success" : "danger", toned: true, grafik: { tur: "selale", adimlar: [{ ad: "Tahsilat", deger: collections, ton: "brand" }, { ad: "İş maliyeti", deger: -paidJobCost, ton: "warning" }, { ad: "Genel gider", deger: -operatingExpense, ton: "warning" }, { ad: "Kalan", deger: realizedProfit, ton: realizedProfit >= 0 ? "success" : "danger" }] } },
  ];
  const hasLeads = incoming.length > 0;
  const contractRows: LedgerRow[] = [
    { label: "İmzalı satış değeri", hint: `${sales} satış · ortalama ${money(averageSale)}`, amount: money(salesValue), share: salesValue ? 100 : null, tone: "brand" },
    { label: "İş maliyeti", hint: "İmzalı işlere bağlı maliyet kalemleri", amount: deduction(contractedCost), share: shareOf(contractedCost, salesValue), tone: "warning" },
  ];
  const contractTotal: LedgerRow = { label: "Brüt iş kârı", hint: "Satış değeri − iş maliyeti", amount: money(grossProfit), share: salesValue ? grossMargin : null, tone: grossProfit >= 0 ? "success" : "danger" };
  const cashRows: LedgerRow[] = [
    { label: "Tahsilat", hint: "Cari hesaplara giren ödemeler", amount: money(collections), share: collections ? 100 : null, tone: "brand" },
    { label: "Ödenmiş iş maliyeti", hint: "Dönem içinde ödenen maliyet kalemleri", amount: deduction(paidJobCost), share: shareOf(paidJobCost, collections), tone: "warning" },
    { label: "Genel gider", hint: "Hizmet maliyeti dışındaki ödenmiş giderler", amount: deduction(operatingExpense), share: shareOf(operatingExpense, collections), tone: "warning" },
  ];
  const cashTotal: LedgerRow = { label: "Net nakit hareketi", hint: "Tahsilat − ödemeler", amount: money(realizedProfit), share: collections ? realizedMargin : null, tone: realizedProfit >= 0 ? "success" : "danger" };
  const trendLeads = months.reduce((sum, month) => sum + month.leads, 0);
  const trendSales = months.reduce((sum, month) => sum + month.sales, 0);
  const trendEmpty = trendLeads === 0 && trendSales === 0;

  return <>
    <TutarlilikUyarisi bulgular={bulgular} />


    <section className="rpt-group" aria-labelledby="rpt-sales-title">
      <h2 className="rpt-group-title" id="rpt-sales-title">Satış hattı</h2>
      <div className="rpt-widgets">{salesWidgets.map((widget) => <WidgetCard key={widget.label} widget={widget} />)}</div>
    </section>
    <section className="rpt-group" aria-labelledby="rpt-finance-title">
      <h2 className="rpt-group-title" id="rpt-finance-title">Kârlılık ve nakit</h2>
      <div className="rpt-widgets">{financeWidgets.map((widget) => <WidgetCard key={widget.label} widget={widget} />)}</div>
    </section>

    {/*
      TEK SAYFA — AYRINTI PENCEREDE (2026-10-24, kurum sahibinin kuralı).

      Beş kart da içeriğini tam açıyordu ve sayfa ekranın birkaç katına
      uzuyordu: yönetici "bu dönem ne oldu" sorusunun cevabını görmek
      için kaydırmak zorundaydı, yani özet olmaktan çıkmıştı.

      Artık her kart ekranda yalnızca KARARA YETECEK KADARINI
      gösteriyor — başlık, bir cümle ve en çok iki rakam — ayrıntı
      `PanelDrawer` ile ortada açılıyor. Pencere kalıbı yeni değil;
      cari hesap ve iş maliyeti aynısını kullanıyor.

      YAZDIRMA BOZULMADI ve bu bilerek çözüldü: `PanelDrawer`
      çocuklarını kapalıyken de çiziyor (portalda, gizli), o yüzden
      içerik DOM'da duruyor. Yazdırma CSS'i pencereleri statik ve
      görünür yapıyor — rapor çıktısı eskisi gibi eksiksiz çıkıyor.
      İçeriği ikinci kez çizmek (ekran için bir, baskı için bir)
      gerekmedi; iki kopya kaçınılmaz olarak ayrışırdı.
    */}
    <div className="rpt-grid">
      <OzetKart
        baslik="Satış hunisi" altyazi="Lead’den satışa her aşamada kalan müşteri"
        kicker="SATIŞ HATTI" ton="brand" genis
        sayilar={[
          { deger: String(funnel[0]?.value ?? 0), etiket: "lead" },
          { deger: String(funnel[funnel.length - 1]?.value ?? 0), etiket: "satış" },
          ...(weakestStep ? [{ deger: percent(weakestStep.rate), etiket: "en zayıf geçiş", ton: "warning" as Tone }] : []),
        ]}
        /* Huni, aşamaların kendisinden: daralan çubuklar huninin
           şeklini veriyor, ayrı bir çizim gerekmiyor. */
        grafik={{ tur: "cubuk", bicim: "sayi", seri: funnel.map((row) => ({ ad: row.label, eksen: row.label, deger: row.value, etiket: String(row.value) })) }}
        cumle={weakestStep ? `${weakestStep.from} → ${weakestStep.to} aşaması en çok müşteriyi kaybediyor.` : "Huni oranları ilk kayıtlarla oluşur."}
      >
        <ol className="rpt-funnel">
          {funnel.map((row, index) => {
            const step = transitionRates[index];
            const isWeak = hasLeads && step !== undefined && step === weakestStep;
            return <li key={row.label}>
              <div className="rpt-funnel-row">
                <div className="rpt-funnel-label"><b>{row.label}</b><span>{row.detail}</span></div>
                <div className="rpt-funnel-track"><i style={cssVar("--w", `${Math.max(4, (row.value / maxFunnel) * 100)}%`)}/></div>
                <strong>{row.value}</strong>
              </div>
              {step ? <div className={`rpt-funnel-step${isWeak ? " is-weak" : ""}`}><span aria-hidden="true">↓</span><b>{percent(step.rate)}</b> sonraki aşamaya geçti{isWeak ? <em>En zayıf geçiş</em> : null}</div> : null}
            </li>;
          })}
        </ol>
        {!hasLeads ? <p className="rpt-empty-note">Bu dönemde yeni lead kaydı yok; huni oranları ilk kayıtlarla birlikte oluşur.</p> : null}
        <p className="rpt-pencere-alt"><Link href="/panel/crm" className="rpt-card-link">CRM’i aç<span aria-hidden="true"> ›</span></Link></p>
      </OzetKart>

      <OzetKart
        baslik="Bu dönem ne söylüyor?" altyazi="Yönetici için dört kısa not"
        kicker="DÖNEM YORUMU" ton={realizedProfit >= 0 ? "success" : "danger"}
        sayilar={[
          { deger: money(realizedProfit), etiket: "net nakit", ton: realizedProfit >= 0 ? "success" : "danger" },
          { deger: sales ? percent(grossMargin) : "—", etiket: "brüt marj", ton: "gold" },
        ]}
        /* Dört yargının TONU: kart rakam değil, iyi/kötü dağılımı
           anlatıyor. */
        grafik={{ tur: "durum", noktalar: [
          { ad: "Geçiş", ton: "warning" },
          { ad: "Marj", ton: sales ? "gold" : "info" },
          { ad: "Nakit", ton: realizedProfit >= 0 ? "success" : "danger" },
          { ad: "Referans", ton: referralLeads.length ? "info" : "warning" },
        ] }}
        cumle="En zayıf geçiş, kârlılık, nakit ve referans — dört başlıkta dönem yorumu."
      >
        <ul className="rpt-insights">
          <li data-tone="warning"><span className="rpt-insight-icon"><Icon name="alert" size={17} /></span><div><b>En zayıf geçiş</b><p>{weakestStep ? `${weakestStep.from} → ${weakestStep.to} dönüşümü ${percent(weakestStep.rate)}.` : "Yeterli veri yok."}</p></div></li>
          <li data-tone="gold"><span className="rpt-insight-icon"><Icon name="chart" size={17} /></span><div><b>Sözleşme kârlılığı</b><p>{sales?`${money(salesValue)} imzalı işin maliyeti ${money(contractedCost)}; brüt marj ${percent(grossMargin)}.`:"Bu dönemde imzalanan sözleşme yok."}</p></div></li>
          <li data-tone={realizedProfit >= 0 ? "success" : "danger"}><span className="rpt-insight-icon"><Icon name="wallet" size={17} /></span><div><b>Net nakit hareketi</b><p>{realizedProfit>=0?`${money(collections)} tahsilattan ${money(paidJobCost)} ödenmiş iş maliyeti ve ${money(operatingExpense)} genel gider düşüldükten sonra ${money(realizedProfit)} kaldı.`:`Bu dönemde ödemeler tahsilatı ${money(Math.abs(realizedProfit))} aşıyor; bu muhasebesel zarar değil, dönemsel nakit farkıdır.`}</p></div></li>
          <li data-tone="info"><span className="rpt-insight-icon"><Icon name="users" size={17} /></span><div><b>Referans gücü</b><p>{referralLeads.length ? `${referralLeads.length} referans lead’in ${referralSales} tanesi satışa döndü.` : "Bu dönemde referans kaynaklı lead kaydı yok."}</p></div></li>
        </ul>
      </OzetKart>

      <OzetKart
        baslik="Kârlılık dökümü" altyazi="Sözleşme marjı ve dönem nakdi"
        kicker="KÂRLILIK" ton={grossProfit >= 0 ? "success" : "danger"} genis
        sayilar={[
          { deger: contractTotal.amount, etiket: "brüt iş kârı", ton: contractTotal.tone },
          { deger: cashTotal.amount, etiket: "net nakit", ton: cashTotal.tone },
        ]}
        /* Maliyet ve kâr yan yana: marjın büyüklüğü tek bakışta. */
        grafik={{ tur: "yigin", bicim: "para", parcalar: [
          { ad: "Maliyet", deger: contractedCost, ton: "warning" },
          { ad: "Kâr", deger: Math.max(0, grossProfit), ton: grossProfit >= 0 ? "success" : "danger" },
        ] }}
        cumle="İmzalı işin marjı ile dönem içindeki gerçek para hareketi yan yana."
      >
        <div className="rpt-ledgers">
          <Ledger title="Sözleşme kârlılığı" caption="Pay: imzalı satış değerine oranı" rows={contractRows} total={contractTotal} />
          <Ledger title="Dönem nakit hareketi" caption="Pay: tahsilata oranı" rows={cashRows} total={cashTotal} />
        </div>
      </OzetKart>

      <OzetKart
        baslik="6 aylık eğilim" altyazi="Aylara göre gelen lead ve kazanılan satış"
        kicker="EĞİLİM" ton="info" genis
        sayilar={[{ deger: String(trendLeads), etiket: "lead" }, { deger: String(trendSales), etiket: "satış" }]}
        grafik={{ tur: "cubuk", bicim: "sayi", seri: leadSerisi }}
        cumle={trendEmpty ? "Son 6 ayda lead veya kazanılan satış kaydı yok." : "Son altı ayın aylık dağılımı."}
      >
        <div className="rpt-trend" role="img" aria-label={`Altı aylık grafik: ${months.map((month) => `${month.label} ${month.leads} lead, ${month.sales} satış`).join("; ")}`}>
          {months.map((month, index) => <div key={month.key} className={`rpt-trend-col${index === months.length - 1 ? " is-current" : ""}`}>
            <div className="rpt-trend-bars">
              <i className="is-lead" style={cssVar("--h", `${Math.max(3, clampPercent((month.leads / maxTrend) * 100))}%`)} title={`${month.leads} lead`}/>
              <i className="is-sale" style={cssVar("--h", `${Math.max(3, clampPercent((month.sales / maxTrend) * 100))}%`)} title={`${month.sales} satış`}/>
            </div>
            <b>{month.label}</b>
            <span>{month.leads} · {month.sales}</span>
          </div>)}
        </div>
        <div className="rpt-legend"><span><i className="is-lead"/>Lead</span><span><i className="is-sale"/>Satış</span></div>
        {trendEmpty ? <p className="rpt-empty-note">Son 6 ayda lead veya kazanılan satış kaydı yok.</p> : null}
      </OzetKart>

      <OzetKart
        baslik="Neden kaybedildi?" altyazi="Bu dönemde kaybedilen müşteriler"
        kicker="KAYIP" ton={lost.length ? "danger" : "success"}
        sayilar={[
          { deger: String(lost.length), etiket: "müşteri", ton: lost.length ? "danger" : "success" },
          ...(lostReasons[0] ? [{ deger: String(lostReasons[0].count), etiket: lostReasons[0].reason }] : []),
        ]}
        /* Sebepler kendi çubuklarıyla: hangisinin baskın olduğu
           kartta görünüyor, isimler pencerede. */
        grafik={{ tur: "cubuk", bicim: "sayi", seri: lostReasons.slice(0, 6).map((row) => ({ ad: row.reason, deger: row.count, etiket: String(row.count) })) }}
        cumle={lostReasons.length ? "Kayıp sebepleri ve kaç müşteriye denk geldiği." : "Bu dönemde kaybedildi olarak işaretlenen fırsat yok."}
      >
        {lostReasons.length ? <ul className="rpt-lost">
          {lostReasons.map((row) => <li key={row.reason}>
            <div className="rpt-lost-top"><b>{row.reason}</b><span>{row.count} müşteri</span></div>
            <div className="rpt-lost-track"><i style={cssVar("--w", `${(row.count / maxLostReason) * 100}%`)}/></div>
          </li>)}
        </ul> : <div className="rpt-empty" data-tone="success">
          <span className="rpt-insight-icon"><Icon name="heart" size={20} /></span>
          <b>Kaybedilen müşteri yok</b>
          <p>Bu dönemde kaybedildi olarak işaretlenen fırsat bulunmuyor.</p>
        </div>}
      </OzetKart>
    </div>
  </>;
}
