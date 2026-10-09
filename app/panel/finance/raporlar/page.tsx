import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { canSeeFinanceReports } from "../finance-navigation";
import { PrintReportButton } from "./print-report-button";
import "./reporting.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
// Negatif oran "−%184" (eskiden "%-184" yazılıyordu).
const percent = (value: number) => (Math.round(value) < 0 ? `−%${Math.abs(Math.round(value))}` : `%${Math.round(value)}`);
const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function pad(value: number) { return String(value).padStart(2, "0"); }
function dateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function resolveRange(range?: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  if (range === "gecen_ay") return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0), key: range };
  if (range === "bu_yil") return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31), key: range };
  if (range === "ozel" && customStart && customEnd) return { start: new Date(`${customStart}T00:00:00`), end: new Date(`${customEnd}T23:59:59`), key: range };
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0), key: "bu_ay" };
}

// ---------------------------------------------------------------
// Sunum yardımcıları (yalnızca görünüm; veri mantığına dokunmaz)
// ---------------------------------------------------------------
/** Satır içi CSS değişkeni (ör. --w, --h). CSS tarafında her zaman fallback'li okunur. */
const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
/** Düşülen kalemler için "−₺1.250"; sıfırsa işaretsiz "₺0". */
const deduction = (amount: number) => (amount ? `−${money(amount)}` : money(0));
const shareOf = (value: number, base: number) => (base ? (value / base) * 100 : null);

type Tone = "brand" | "info" | "gold" | "success" | "warning" | "danger";
/*
  GRAFİKLİ KARTLAR (2026-10). Üstteki on kart eskiden yalnızca bir sayı ve
  bir cümleydi; dönemin gidişatı (artıyor mu, oranı ne, nereye gitti)
  görünmüyordu. Her kart kendi verisine uygun küçük bir grafik taşıyor:
    cubuk    son 6 ayın değeri (gelen lead, satış, iş maliyeti, tahsilat)
    halka    bir önceki aşamaya oran (ulaşılan, nitelikli, teklif)
    gosterge yarım daire oran (dönüşüm)
    yigin    satış değerinin maliyet / kâr bölünmesi (brüt kâr)
    selale   tahsilattan düşülenler ve kalan (net nakit)
  Grafikler sunucuda çizilen SVG ve CSS: istemci kodu, kütüphane yok.
*/
type SeriNoktasi = { ad: string; deger: number; etiket: string; simdiki?: boolean };
type Grafik =
  | { tur: "cubuk"; seri: SeriNoktasi[] }
  | { tur: "halka"; oran: number | null; altyazi: string }
  | { tur: "gosterge"; oran: number }
  | { tur: "yigin"; parcalar: { ad: string; deger: number; ton: Tone }[] }
  | { tur: "selale"; adimlar: { ad: string; deger: number; ton: Tone }[] };
type Widget = { label: string; value: string; note: string; icon: string; tone: Tone; toned?: boolean; grafik: Grafik };
type LedgerRow = { label: string; hint: string; amount: string; share: number | null; tone: Tone };

const iconPaths: Record<string, ReactNode> = {
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></>,
  chat: <><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" /></>,
  badge: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.3 2.4 2.4 4.7-5" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  seal: <><path d="M12 3.5 14.2 5l2.6-.2.9 2.5 2.2 1.4-.8 2.5.8 2.5-2.2 1.4-.9 2.5-2.6-.2L12 20.5 9.8 19l-2.6.2-.9-2.5-2.2-1.4.8-2.5-.8-2.5 2.2-1.4.9-2.5 2.6.2Z" /><path d="m9.2 12.2 2 2 3.7-4" /></>,
  spark: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  wallet: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  flow: <><path d="M4 8h13" /><path d="m14 5 3 3-3 3" /><path d="M20 16H7" /><path d="m10 13-3 3 3 3" /></>,
  alert: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  heart: <><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" /></>,
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

function MiniGrafik({ grafik }: { grafik: Grafik }) {
  if (grafik.tur === "cubuk") {
    const enBuyuk = Math.max(1, ...grafik.seri.map((n) => n.deger));
    return (
      <div className="rpt-mini rpt-mini-cubuk" role="img" aria-label={grafik.seri.map((n) => `${n.ad} ${n.etiket}`).join(", ")}>
        {grafik.seri.map((n) => (
          <span key={n.ad} className={n.simdiki ? "is-current" : undefined} title={`${n.ad}: ${n.etiket}`}>
            <i style={cssVar("--h", `${n.deger ? Math.max(8, (n.deger / enBuyuk) * 100) : 3}%`)} />
            <small>{n.ad}</small>
          </span>
        ))}
      </div>
    );
  }
  if (grafik.tur === "halka") {
    const cevre = 2 * Math.PI * 22;
    const oran = grafik.oran === null ? 0 : clampPercent(grafik.oran);
    return (
      <div className="rpt-mini rpt-mini-halka">
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <circle className="rpt-halka-iz" cx="28" cy="28" r="22" />
          <circle className="rpt-halka-dolu" cx="28" cy="28" r="22" strokeDasharray={`${(oran / 100) * cevre} ${cevre}`} transform="rotate(-90 28 28)" />
          <text x="28" y="32" textAnchor="middle">{grafik.oran === null ? "—" : percent(grafik.oran)}</text>
        </svg>
        <span>{grafik.altyazi}</span>
      </div>
    );
  }
  if (grafik.tur === "gosterge") {
    const oran = clampPercent(grafik.oran);
    const uzunluk = Math.PI * 40;
    return (
      <div className="rpt-mini rpt-mini-gosterge" role="img" aria-label={`Dönüşüm ${percent(grafik.oran)}`}>
        <svg viewBox="0 0 100 56" width="100" height="56" aria-hidden="true">
          <path className="rpt-halka-iz" d="M10 50 A40 40 0 0 1 90 50" />
          <path className="rpt-halka-dolu" d="M10 50 A40 40 0 0 1 90 50" strokeDasharray={`${(oran / 100) * uzunluk} ${uzunluk}`} />
        </svg>
      </div>
    );
  }
  if (grafik.tur === "yigin") {
    const toplam = grafik.parcalar.reduce((t, p) => t + Math.max(0, p.deger), 0);
    return (
      <div className="rpt-mini rpt-mini-yigin">
        <div className="rpt-yigin-cubuk" aria-hidden="true">
          {toplam ? grafik.parcalar.map((p) => <i key={p.ad} data-tone={p.ton} style={cssVar("--w", `${(Math.max(0, p.deger) / toplam) * 100}%`)} />) : null}
        </div>
        <ul className="rpt-mini-lejant">
          {grafik.parcalar.map((p) => <li key={p.ad} data-tone={p.ton}><i />{p.ad} <b>{money(p.deger)}</b></li>)}
        </ul>
      </div>
    );
  }
  const taban = Math.max(1, ...grafik.adimlar.map((a) => Math.abs(a.deger)));
  return (
    <ul className="rpt-mini rpt-mini-selale">
      {grafik.adimlar.map((a) => (
        <li key={a.ad} data-tone={a.ton}>
          <span>{a.ad}</span>
          <span className="rpt-selale-iz"><i style={cssVar("--w", `${Math.max(a.deger ? 3 : 0, (Math.abs(a.deger) / taban) * 100)}%`)} /></span>
        </li>
      ))}
    </ul>
  );
}

function WidgetCard({ widget }: { widget: Widget }) {
  return (
    <article className="rpt-widget" data-tone={widget.tone}>
      <header className="rpt-widget-bas">
        <span className="rpt-widget-icon"><Icon name={widget.icon} /></span>
        <small>{widget.label}</small>
      </header>
      <strong className={widget.toned ? "is-toned" : undefined}>{widget.value}</strong>
      <MiniGrafik grafik={widget.grafik} />
      <span className="rpt-widget-note">{widget.note}</span>
    </article>
  );
}

function Ledger({ title, caption, rows, total }: { title: string; caption: string; rows: LedgerRow[]; total: LedgerRow }) {
  const shareCell = (row: LedgerRow) => (
    <td className="rpt-share">
      <span className="rpt-share-bar" data-tone={row.tone} aria-hidden="true"><i style={cssVar("--w", `${row.share === null ? 0 : clampPercent(row.share)}%`)} /></span>
      <span className="rpt-share-value">{row.share === null ? "—" : percent(row.share)}</span>
    </td>
  );
  return (
    <div className="rpt-ledger">
      <h3>{title}</h3>
      <div className="rpt-table-wrap">
        <table className="rpt-table">
          <caption>{caption}</caption>
          <thead><tr><th scope="col">Kalem</th><th scope="col">Pay</th><th scope="col" className="rpt-money">Tutar</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row"><b>{row.label}</b><small>{row.hint}</small></th>
                {shareCell(row)}
                <td className="rpt-money">{row.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-tone={total.tone}>
              <th scope="row"><b>{total.label}</b><small>{total.hint}</small></th>
              {shareCell(total)}
              <td className="rpt-money">{total.amount}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

type Opportunity = { id: string; stage: string; estimated_value: number; source: string | null; lost_reason: string | null; created_at: string; updated_at: string };
type Proposal = { id: string; opportunity_id: string; amount: number; status: string; superseded_by: string | null; created_at: string };
type Contract = { id: string; opportunity_id: string | null; amount: number; status: string; signed_at: string | null; created_at: string };
type Transaction = { transaction_type: "income" | "expense"; status: string; amount: number; category:string|null;paid_at: string | null; created_at: string };
type CostItem={contract_id:string;amount:number;status:string;cost_date:string};
type AccountEntry={entry_type:"debit"|"credit";source_type:string;amount:number;transaction_date:string};

export default async function ReportingPage({ searchParams }: { searchParams: Promise<{ aralik?: string; baslangic?: string; bitis?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules, yetkiler } = await getPanelContext();
  // Finans kapısı (sahip/yönetici) layout'ta; burada Raporlar modülü ve rol yetkisi
  const access = { modules, yetkiler };
  if (!canSeeFinanceReports(access)) throw new Error("Raporlar modülüne erişiminiz yok.");
  const { start, end, key } = resolveRange(params.aralik, params.baslangic, params.bitis);
  const startKey = dateKey(start); const endKey = dateKey(end);
  const inRange = (value: string | null) => Boolean(value && value.slice(0, 10) >= startKey && value.slice(0, 10) <= endKey);
  const trendStart = new Date(end.getFullYear(), end.getMonth() - 5, 1);
  const queryStart = start < trendStart ? start : trendStart;
  const organizationId = membership.organization_id;

  const [opportunityResult, proposalResult, contractResult, transactionResult,costResult,entryResult] = await Promise.all([
    supabase.from("crm_opportunities").select("id,stage,estimated_value,source,lost_reason,created_at,updated_at").eq("organization_id", organizationId),
    supabase.from("crm_proposals").select("id,opportunity_id,amount,status,superseded_by,created_at").eq("organization_id", organizationId).gte("created_at", queryStart.toISOString()),
    supabase.from("crm_contracts").select("id,opportunity_id,amount,status,signed_at,created_at").eq("organization_id", organizationId),
    supabase.from("finance_transactions").select("transaction_type,status,amount,category,paid_at,created_at").eq("organization_id", organizationId).gte("created_at", queryStart.toISOString()),
    supabase.from("contract_cost_items").select("contract_id,amount,status,cost_date").eq("organization_id",organizationId),
    supabase.from("account_entries").select("entry_type,source_type,amount,transaction_date").eq("organization_id",organizationId).gte("transaction_date",dateKey(queryStart)),
  ]);
  if (opportunityResult.error) throw new Error(`CRM raporu okunamadı: ${opportunityResult.error.message}`);
  if(proposalResult.error||contractResult.error||transactionResult.error||costResult.error||entryResult.error)throw new Error("Finansal rapor verileri eksiksiz okunamadı.");
  const opportunities = (opportunityResult.data ?? []) as Opportunity[];
  const proposals = (proposalResult.data ?? []) as Proposal[];
  const contracts = (contractResult.data ?? []) as Contract[];
  const transactions = (transactionResult.data ?? []) as Transaction[];
  const costItems=(costResult.data??[]) as CostItem[];
  const accountEntries=(entryResult.data??[]) as AccountEntry[];
  const incoming = opportunities.filter((row) => inRange(row.created_at));
  const reachedStages = new Set(["qualified", "proposal", "contract", "payment", "won", "lost"]);
  const qualifiedStages = new Set(["qualified", "proposal", "contract", "payment", "won"]);
  const reached = incoming.filter((row) => reachedStages.has(row.stage));
  const qualified = incoming.filter((row) => qualifiedStages.has(row.stage));
  const signedContracts = contracts.filter((row) => ["signed","completed"].includes(row.status) && inRange(row.signed_at ?? row.created_at));
  const signedOpportunityIds = new Set(signedContracts.map((row) => row.opportunity_id).filter((value): value is string => Boolean(value)));
  const wonOpportunities = opportunities.filter((row) => row.stage === "won" && inRange(row.updated_at));
  const saleOpportunityIds = new Set([...wonOpportunities.map((row) => row.id), ...signedOpportunityIds]);
  const sales = saleOpportunityIds.size;
  const salesValue = signedContracts.length ? signedContracts.reduce((sum, row) => sum + Number(row.amount), 0) : wonOpportunities.reduce((sum, row) => sum + Number(row.estimated_value), 0);
  /*
    Dönüşüm: bu dönemde GÖRÜŞÜLEN adaylardan satışa dönenlerin oranı.
    Eskiden dönemin bütün satışları (önceki aylarda gelmiş müşteriler
    dahil) bu dönemde görüşülenlere bölünüyordu ve oran %275 gibi
    %100'ü aşan değerler çıkıyordu.
  */
  /*
    HUNİ TEK BİR GRUBUN YOLCULUĞU: bu dönemde GELEN adaylar. Her aşama bir
    öncekinin alt kümesi (nitelikli ⊂ ulaşılan ⊂ gelen; teklif ve satış
    niteliklilerden), huni hiçbir zaman genişlemez.

    Eskiden "Teklif" dönemde teklif verilen bütün müşterileri, "Satış"
    dönemin bütün satışlarını sayıyordu (önceki aylarda gelmiş müşteriler
    dahil); huni teklif aşamasında 4'ken satışta 11'e çıkıyor, dönüşüm
    %275 gibi %100'ü aşan değerler veriyordu.

    Satışa dönmüş sayılmak: imzalı sözleşmesi olmak (ne zaman imzalanmış
    olursa) ya da aşamasının "kazanıldı" olması. Teklif verilmiş sayılmak:
    geçerli (yerine yenisi gelmemiş) bir teklifi olmak ya da satışa dönmüş
    olmak — sözleşmesi olan müşteriye teklif de verilmiştir.
  */
  const satisaDonenIds = new Set([
    ...contracts.filter((row) => ["signed", "completed"].includes(row.status)).map((row) => row.opportunity_id).filter((v): v is string => Boolean(v)),
    ...opportunities.filter((row) => row.stage === "won").map((row) => row.id),
  ]);
  const teklifliIds = new Set(proposals.filter((row) => !row.superseded_by).map((row) => row.opportunity_id));
  const huniTeklif = qualified.filter((row) => teklifliIds.has(row.id) || satisaDonenIds.has(row.id));
  const huniSatis = qualified.filter((row) => satisaDonenIds.has(row.id));
  const conversion = reached.length ? (huniSatis.length / reached.length) * 100 : 0;
  const averageSale = sales ? salesValue / sales : 0;
  const signedContractIds=new Set(signedContracts.map(row=>row.id));
  const contractedCost=costItems.filter(row=>signedContractIds.has(row.contract_id)).reduce((sum,row)=>sum+Number(row.amount),0);
  const grossProfit=salesValue-contractedCost;
  const grossMargin=salesValue?grossProfit/salesValue*100:0;
  const collections=accountEntries.filter(row=>row.entry_type==="credit"&&inRange(row.transaction_date)).reduce((sum,row)=>sum+Number(row.amount),0);
  const paidJobCost=costItems.filter(row=>row.status==="paid"&&inRange(row.cost_date)).reduce((sum,row)=>sum+Number(row.amount),0);
  const paidTransactions = transactions.filter((row) => row.status === "paid" && inRange(row.paid_at ?? row.created_at));
  const operatingExpense=paidTransactions.filter(row=>row.transaction_type==="expense"&&row.category!=="Hizmet maliyeti").reduce((sum,row)=>sum+Number(row.amount),0);
  const realizedProfit=collections-paidJobCost-operatingExpense;
  const realizedMargin=collections?realizedProfit/collections*100:0;
  const lost = opportunities.filter((row) => row.stage === "lost" && inRange(row.updated_at));
  const referralLeads = incoming.filter((row) => (row.source ?? "").toLocaleLowerCase("tr-TR").includes("referans"));
  const referralSales = referralLeads.filter((row) => saleOpportunityIds.has(row.id)).length;

  const lostReasonMap = new Map<string, number>();
  for (const row of lost) { const reason = row.lost_reason?.trim() || "Neden belirtilmedi"; lostReasonMap.set(reason, (lostReasonMap.get(reason) ?? 0) + 1); }
  const lostReasons = [...lostReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  const maxLostReason = Math.max(1, ...lostReasons.map((row) => row.count));
  const funnel = [
    { label: "Gelen lead", value: incoming.length, detail: "Yeni müşteri adayı" },
    { label: "Ulaşılan", value: reached.length, detail: incoming.length ? `${percent((reached.length / incoming.length) * 100)} erişim` : "—" },
    { label: "Nitelikli lead", value: qualified.length, detail: reached.length ? `${percent((qualified.length / reached.length) * 100)} nitelikli` : "—" },
    { label: "Teklif", value: huniTeklif.length, detail: qualified.length ? `${percent((huniTeklif.length / qualified.length) * 100)} teklif` : "—" },
    { label: "Satışa dönen", value: huniSatis.length, detail: reached.length ? `${percent(conversion)} dönüşüm` : "—" },
  ];
  const maxFunnel = Math.max(1, ...funnel.map((row) => row.value));
  const transitionRates = funnel.slice(0, -1).map((row, index) => ({ from: row.label, to: funnel[index + 1].label, rate: row.value ? (funnel[index + 1].value / row.value) * 100 : 0 }));
  const weakestStep = [...transitionRates].sort((a, b) => a.rate - b.rate)[0];
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(end.getFullYear(), end.getMonth() - (5 - index), 1); return { key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, label: monthNames[date.getMonth()], leads: 0, sales: 0 }; });
  for (const row of opportunities) { const bucket = months.find((month) => month.key === row.created_at.slice(0, 7)); if (bucket) bucket.leads += 1; }
  for (const row of opportunities.filter((item) => item.stage === "won")) { const bucket = months.find((month) => month.key === row.updated_at.slice(0, 7)); if (bucket) bucket.sales += 1; }
  const maxTrend = Math.max(1, ...months.map((row) => row.leads));
  /* Kart grafikleri için aylık seriler (yukarıdaki months dilimleriyle).
     Satış imzalı sözleşmeden (imza tarihi), maliyet kalem tarihinden,
     tahsilat cari dökümündeki ödemelerden. */
  const aylikSeri = (kayitlar: { tarih: string | null; tutar: number }[], bicim: (n: number) => string): SeriNoktasi[] =>
    months.map((ay, sira) => {
      const deger = kayitlar.filter((k) => k.tarih?.slice(0, 7) === ay.key).reduce((t, k) => t + k.tutar, 0);
      return { ad: ay.label, deger, etiket: bicim(deger), simdiki: sira === months.length - 1 };
    });
  const adet = (n: number) => String(n);
  const leadSerisi = aylikSeri(opportunities.map((o) => ({ tarih: o.created_at, tutar: 1 })), adet);
  const imzaliTumu = contracts.filter((c) => ["signed", "completed"].includes(c.status));
  const satisSerisi = aylikSeri(imzaliTumu.map((c) => ({ tarih: c.signed_at ?? c.created_at, tutar: 1 })), adet);
  const maliyetSerisi = aylikSeri(costItems.map((c) => ({ tarih: c.cost_date, tutar: Number(c.amount) })), money);
  const tahsilatSerisi = aylikSeri(accountEntries.filter((e) => e.entry_type === "credit").map((e) => ({ tarih: e.transaction_date, tutar: Number(e.amount) })), money);
  const rangeLabel = key === "bu_ay" ? "Bu ay" : key === "gecen_ay" ? "Geçen ay" : key === "bu_yil" ? "Bu yıl" : `${start.toLocaleDateString("tr-TR")} – ${end.toLocaleDateString("tr-TR")}`;

  // --- Sunum: yukarıda hesaplanan değerlerden türetilir, yeni sorgu yok ---
  const oranOf = (pay: number, payda: number) => (payda ? (pay / payda) * 100 : null);
  const salesWidgets: Widget[] = [
    { label: "Gelen lead", value: String(incoming.length), note: "Son 6 ay, aylık gelen aday", icon: "inbox", tone: "brand", grafik: { tur: "cubuk", seri: leadSerisi } },
    { label: "Ulaşılan", value: String(reached.length), note: "Gelen adayların görüşülen kısmı", icon: "chat", tone: "info", grafik: { tur: "halka", oran: oranOf(reached.length, incoming.length), altyazi: "erişim oranı" } },
    { label: "Nitelikli lead", value: String(qualified.length), note: "Görüşülenlerin gerçek aday kısmı", icon: "badge", tone: "info", grafik: { tur: "halka", oran: oranOf(qualified.length, reached.length), altyazi: "nitelikli oranı" } },
    { label: "Teklif", value: String(huniTeklif.length), note: "Bu dönemin adaylarından teklif verilen", icon: "doc", tone: "gold", grafik: { tur: "halka", oran: oranOf(huniTeklif.length, qualified.length), altyazi: "nitelikliye teklif" } },
    { label: "Satış", value: String(sales), note: `${money(salesValue)} · son 6 ay imzalanan`, icon: "seal", tone: "success", grafik: { tur: "cubuk", seri: satisSerisi } },
  ];
  const financeWidgets: Widget[] = [
    { label: "Dönüşüm", value: percent(conversion), note: `Görüşülen ${reached.length} adaydan ${huniSatis.length} satış`, icon: "spark", tone: "gold", grafik: { tur: "gosterge", oran: conversion } },
    { label: "İş maliyeti", value: money(contractedCost), note: "Bu dönem imzalanan işlerin maliyeti · son 6 ay", icon: "briefcase", tone: "warning", grafik: { tur: "cubuk", seri: maliyetSerisi } },
    { label: "Brüt iş kârı", value: money(grossProfit), note: `${percent(grossMargin)} sözleşme marjı`, icon: "chart", tone: grossProfit >= 0 ? "success" : "danger", toned: true, grafik: { tur: "yigin", parcalar: [{ ad: "Maliyet", deger: contractedCost, ton: "warning" }, { ad: "Kâr", deger: grossProfit, ton: grossProfit >= 0 ? "success" : "danger" }] } },
    { label: "Tahsilat", value: money(collections), note: "Kasaya giren müşteri ödemesi · son 6 ay", icon: "wallet", tone: "brand", grafik: { tur: "cubuk", seri: tahsilatSerisi } },
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

  return <div className="rpt">
    <div className="panel-pagehead rpt-pagehead">
      <div><small className="panel-kicker">FİNANS</small><h1>Raporlar</h1></div>
      <div className="panel-page-actions"><span className="status-pill rpt-range-pill" data-tone="gold">{rangeLabel}</span><PrintReportButton /></div>
    </div>

    <section className="rpt-toolbar" aria-label="Rapor dönemi">
      <nav className="rpt-segment" aria-label="Hazır dönemler">
        <Link className={key === "bu_ay" ? "is-active" : undefined} aria-current={key === "bu_ay" ? "page" : undefined} href="/panel/finance/raporlar?aralik=bu_ay">Bu Ay</Link>
        <Link className={key === "gecen_ay" ? "is-active" : undefined} aria-current={key === "gecen_ay" ? "page" : undefined} href="/panel/finance/raporlar?aralik=gecen_ay">Geçen Ay</Link>
        <Link className={key === "bu_yil" ? "is-active" : undefined} aria-current={key === "bu_yil" ? "page" : undefined} href="/panel/finance/raporlar?aralik=bu_yil">Bu Yıl</Link>
      </nav>
      <form className={`rpt-range-form${key === "ozel" ? " is-active" : ""}`} method="get">
        <input type="hidden" name="aralik" value="ozel"/>
        <span className="rpt-range-label">Özel aralık</span>
        <input name="baslangic" type="date" defaultValue={params.baslangic} required aria-label="Başlangıç tarihi"/>
        <span className="rpt-range-sep" aria-hidden="true">–</span>
        <input name="bitis" type="date" defaultValue={params.bitis} required aria-label="Bitiş tarihi"/>
        <button className="panel-secondary" type="submit">Uygula</button>
      </form>
    </section>

    <section className="rpt-group" aria-labelledby="rpt-sales-title">
      <h2 className="rpt-group-title" id="rpt-sales-title">Satış hattı</h2>
      <div className="rpt-widgets">{salesWidgets.map((widget) => <WidgetCard key={widget.label} widget={widget} />)}</div>
    </section>
    <section className="rpt-group" aria-labelledby="rpt-finance-title">
      <h2 className="rpt-group-title" id="rpt-finance-title">Kârlılık ve nakit</h2>
      <div className="rpt-widgets">{financeWidgets.map((widget) => <WidgetCard key={widget.label} widget={widget} />)}</div>
    </section>

    <div className="rpt-grid">
      <section className="rpt-card">
        <header className="rpt-card-head"><div><h2>Satış hunisi</h2><p>Lead’den satışa her aşamada kalan müşteri</p></div><Link href="/panel/crm" className="rpt-card-link">CRM’i aç<span aria-hidden="true"> ›</span></Link></header>
        <ol className="rpt-funnel">
          {funnel.map((row, index) => {
            const step = transitionRates[index];
            const isWeak = hasLeads && step !== undefined && step === weakestStep;
            return <li key={row.label} className={index === funnel.length - 1 ? "is-final" : undefined}>
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
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head"><div><h2>Bu dönem ne söylüyor?</h2><p>Yönetici için dört kısa not</p></div></header>
        <ul className="rpt-insights">
          <li data-tone="warning"><span className="rpt-insight-icon"><Icon name="alert" size={17} /></span><div><b>En zayıf geçiş</b><p>{weakestStep ? `${weakestStep.from} → ${weakestStep.to} dönüşümü ${percent(weakestStep.rate)}.` : "Yeterli veri yok."}</p></div></li>
          <li data-tone="gold"><span className="rpt-insight-icon"><Icon name="chart" size={17} /></span><div><b>Sözleşme kârlılığı</b><p>{sales?`${money(salesValue)} imzalı işin maliyeti ${money(contractedCost)}; brüt marj ${percent(grossMargin)}.`:"Bu dönemde imzalanan sözleşme yok."}</p></div></li>
          <li data-tone={realizedProfit >= 0 ? "success" : "danger"}><span className="rpt-insight-icon"><Icon name="wallet" size={17} /></span><div><b>Net nakit hareketi</b><p>{realizedProfit>=0?`${money(collections)} tahsilattan ${money(paidJobCost)} ödenmiş iş maliyeti ve ${money(operatingExpense)} genel gider düşüldükten sonra ${money(realizedProfit)} kaldı.`:`Bu dönemde ödemeler tahsilatı ${money(Math.abs(realizedProfit))} aşıyor; bu muhasebesel zarar değil, dönemsel nakit farkıdır.`}</p></div></li>
          <li data-tone="info"><span className="rpt-insight-icon"><Icon name="users" size={17} /></span><div><b>Referans gücü</b><p>{referralLeads.length ? `${referralLeads.length} referans lead’in ${referralSales} tanesi satışa döndü.` : "Bu dönemde referans kaynaklı lead kaydı yok."}</p></div></li>
        </ul>
      </section>

      <section className="rpt-card rpt-span-full">
        <header className="rpt-card-head"><div><h2>Kârlılık dökümü</h2><p>Sözleşme marjı ile dönem içindeki gerçek nakit hareketi yan yana</p></div></header>
        <div className="rpt-ledgers">
          <Ledger title="Sözleşme kârlılığı" caption="Pay: imzalı satış değerine oranı" rows={contractRows} total={contractTotal} />
          <Ledger title="Dönem nakit hareketi" caption="Pay: tahsilata oranı" rows={cashRows} total={cashTotal} />
        </div>
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head">
          <div><h2>6 aylık eğilim</h2><p>Aylara göre gelen lead ve kazanılan satış</p></div>
          <div className="rpt-stat"><strong>{trendLeads}</strong><span>lead · {trendSales} satış</span></div>
        </header>
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
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head">
          <div><h2>Neden kaybedildi?</h2><p>Bu dönemde kaybedilen müşteriler</p></div>
          <div className="rpt-stat" data-tone={lost.length ? "danger" : "success"}><strong>{lost.length}</strong><span>müşteri</span></div>
        </header>
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
      </section>
    </div>
  </div>;
}
