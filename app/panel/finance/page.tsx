import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { PanelDrawer } from "../components/panel-drawer";
import { createCollection } from "../accounts/actions";
import { PanelModal } from "../components/panel-modal";
import { MaliyetDetayi } from "./costs/maliyet-detayi";
import { OdemeBaglantisiFormu } from "../accounts/odeme-baglantisi";
import { normalizePhone } from "@/lib/whatsapp-send";
import { buildAccountBalances } from "./account-balances";
import { cariBolumle } from "@/lib/cari-arsiv";
import { getPaytrStatus } from "@/lib/paytr-status";
import { bakiyeyeSigdir, netTahsilat, taksitleriDagit } from "@/lib/taksit-dagitimi";
import { IstatistikKarti, degisimYazisi, kisaPara } from "../crm/istatistik-karti";
import { aylik, gunAraliginda, oran } from "@/lib/liste-istatistik";
import { simdi } from "../os/genel-bakis";
import "./finance.css";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";
import { SatirTiklama } from "@/app/panel/crm/satir-tiklama";
import { OtomatikSecim } from "../crm/otomatik-secim";
import { formatPersonName } from "@/lib/format-name";
import { formatPhone } from "@/lib/format-phone";

const money = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    n / 100,
  );
type Entry = {
  id: string;
  entry_type: "debit" | "credit";
  amount: number;
  description: string;
  reference_no: string | null;
  source_type: string | null;
  transaction_date: string;
};
type Party = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_number: string | null;
  account_entries: Entry[];
};
type Hesap = Party & {
  entries: Entry[];
  debt: number;
  collections: number;
  refunds: number;
  balance: number;
};
/* Müşteriler listesinin satırı: cari bakiyesi + müşteriye dair özet. */
type MusteriSatiri = Hesap & {
  sozlesmeAdedi: number;
  temsilciId: string | null;
  temsilci: string | null;
  tahsilOrani: number | null;
  gecikmis: number;
  sonHareket: string | null;
};
type Contract = {
  id: string;
  party_id: string | null;
  amount: number;
  status: string;
  contract_no: string;
  title: string;
  currency: string;
  service_cost: number;
  service_cost_supplier: string | null;
  service_cost_reference: string | null;
  service_cost_status: string;
  payment_plan_id: string | null;
  workflow_id:string|null;
  signed_at:string|null;
  created_at:string;
  crm_opportunities: { customer_name: string; contact_phone:string|null;contact_email:string|null;assigned_employee_id:string|null } | { customer_name: string;contact_phone:string|null;contact_email:string|null;assigned_employee_id:string|null }[] | null;
};
type Installment={id:string;payment_plan_id:string;installment_no:number;due_date:string|null;amount:number;status:string;payment_url:string|null;payment_link_source:string|null;notice_sent_at:string|null;reminder_sent_at:string|null};
type CostItem={contract_id:string;amount:number;status:string;cost_date:string;category:string};
/* İş maliyetleri listesinin satırı. */
type ProfitRow={id:string;contractNo:string;customer:string;title:string;sales:string;operation:string;amount:number;cost:number;paid:number;costEntered:boolean;profit:number;margin:number;date:string};

/* Yalnızca başlık: açıklama satırı kaldırıldı (kurum sahibinin isteği,
   2026-10). Rakamlar hemen altındaki şeritte zaten duruyor; bir cümlelik
   tanım ekranın üstünde yer kaplıyordu. */
const pageCopy = {
  cari: { title: "Müşteriler" },
  maliyet: { title: "İş Maliyetleri" },
} as const;

/*
  MÜŞTERİLER TABLOSU (2026-10). Eskiden "Cari Hesaplar"dı ve sütunları
  cari dökümünün sütunlarıydı (sözleşme, tahsilat, iade, kalan bakiye);
  müşteriyi tanımaya yarayan hiçbir şey yoktu. Artık: kim (ad ve
  iletişim), ne kadarı tahsil edildi (oran çubuğu), ne kadar açık ve ne
  kadarı gecikmiş, en son ne zaman hareket oldu. Temsilci ve sözleşme
  sütunları da vardı; kurum sahibinin isteğiyle kaldırıldı (09.10.2026),
  ikisi de müşteri detayında. Temsilci süzgeci duruyor.

  Satırın tamamı müşteri detayını açar; açık bakiyeli müşteride sık
  kullanılan "Tahsilat" ve "Ödeme linki" satırda.
*/
/*
  İŞ MALİYETLERİ TABLOSU (2026-10): Müşteriler listesiyle aynı düzen
  (solda tablo, sağda istatistik). Eskiden istemcide süzülen, 10'arlı
  sayfalanan ayrı bir bileşendi (finance-workspaces.tsx) ve sütunları
  büyük harfli adlar, ayrı Satış/Operasyon sütunları ve çıplak bir oran
  rozetiydi. Satır maliyet detayını ortada açılan pencerede açar.
*/
function MaliyetTablosu({ rows, arama }: { rows: ProfitRow[]; arama: string }) {
  const ek = arama ? `&arama=${encodeURIComponent(arama)}` : "";
  return (
    <div className="talep-tablo">
      <table className="crm-data-table" data-cols="maliyetler">
        <thead>
          <tr>
            <th>İş / Müşteri</th>
            <th className="crm-col-rep">Sorumlular</th>
            <th className="crm-col-amount">Sözleşme</th>
            <th className="crm-col-amount">Maliyet</th>
            <th className="crm-col-amount">Kâr</th>
            <th>Kâr oranı</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const oranYuzde = Math.round(row.margin);
            return (
              <tr key={row.id}>
                <td data-label="İş / Müşteri">
                  <Link className="crm-row-link" href={`/panel/finance?gorunum=maliyet&maliyet=${row.id}${ek}`} scroll={false} aria-label={`${row.contractNo} maliyet detayı`}>
                    <span className="crm-table-title" title={row.customer}>{row.customer}</span>
                    <span className="crm-table-sub">{row.contractNo} · {row.title}</span>
                  </Link>
                </td>
                <td className="crm-col-rep" data-label="Sorumlular">
                  <span className="crm-table-sub maliyet-sorumlu"><b>Satış</b> {row.sales}</span>
                  <span className="crm-table-sub maliyet-sorumlu"><b>Operasyon</b> {row.operation}</span>
                </td>
                <td className="crm-col-amount" data-label="Sözleşme">{money(row.amount)}</td>
                <td className="crm-col-amount" data-label="Maliyet">
                  {row.costEntered ? money(row.cost) : <span className="cari-sifir">—</span>}
                  <small className={row.costEntered ? "crm-waiting" : "crm-waiting is-late"}>
                    {!row.costEntered ? "maliyet girilmedi" : row.paid >= row.cost ? "tamamı ödendi" : `${money(row.paid)} ödendi`}
                  </small>
                </td>
                <td className={row.profit < 0 ? "crm-col-amount talep-uyari" : "crm-col-amount cari-arti"} data-label="Kâr">{money(row.profit)}</td>
                <td data-label="Kâr oranı">
                  <span className="musteri-tahsil maliyet-oran" data-ton={row.margin < 0 ? "danger" : row.margin < 30 ? "warning" : "success"} title={`%${row.margin.toFixed(1)}`}>
                    <span className="cari-oran-cubuk" aria-hidden="true"><i style={{ "--p": `${Math.max(0, Math.min(100, oranYuzde))}%` } as React.CSSProperties} /></span>
                    <small>%{oranYuzde}</small>
                  </span>
                </td>
                <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <SatirTiklama />
    </div>
  );
}

const kisaTarih = (gun: string) => new Date(`${gun}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });

function MusteriTablosu({ rows, paytrHazir }: { rows: MusteriSatiri[]; paytrHazir: boolean }) {
  return (
    <div className="talep-tablo">
      <table className="crm-data-table" data-cols="musteriler">
        <thead>
          <tr>
            <th>Müşteri</th>
            <th>Tahsil</th>
            <th className="crm-col-amount">Açık bakiye</th>
            <th className="crm-col-date">Son hareket</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td data-label="Müşteri">
                <Link className="crm-row-link" href={`/panel/finance/musteri/${a.id}`} aria-label={`${a.name} müşterisini aç`}>
                  <span className="crm-table-title" title={a.name}>{a.name}</span>
                  <span className="crm-table-sub">{formatPhone(a.phone) || a.email || a.tax_number || "İletişim bilgisi yok"}</span>
                </Link>
              </td>
              <td data-label="Tahsil">
                {a.tahsilOrani === null ? <span className="cari-sifir">—</span> : (
                  <span className="musteri-tahsil" title={`${money(a.collections)} tahsil edildi`}>
                    <span className="cari-oran-cubuk" aria-hidden="true"><i style={{ "--p": `${a.tahsilOrani}%` } as React.CSSProperties} /></span>
                    <small>%{a.tahsilOrani}</small>
                  </span>
                )}
              </td>
              <td className="crm-col-amount" data-label="Açık bakiye">
                {a.balance > 0 ? money(a.balance) : <span className="cari-sifir">{money(0)}</span>}
                <small className={a.gecikmis > 0 ? "crm-waiting is-late" : "crm-waiting"}>
                  {a.gecikmis > 0 ? `${money(a.gecikmis)} vadesi geçti` : a.balance > 0 ? "vadesi gelmedi" : "kapandı"}
                </small>
              </td>
              <td className="crm-col-date" data-label="Son hareket">{a.sonHareket ? kisaTarih(a.sonHareket) : "—"}</td>
              <td className="crm-table-actions cari-satir-eylem">
                {a.balance > 0 && paytrHazir ? (
                  <PanelDrawer
                    triggerLabel="Ödeme linki"
                    triggerClassName="panel-secondary cari-tahsilat-btn"
                    kicker="ÖDEME BAĞLANTISI"
                    title={`${a.name} · Ödeme linki`}
                    description="Müşterinin söylediği tutarla PayTR bağlantısı oluşturun ve gönderin."
                  >
                    <OdemeBaglantisiFormu partyId={a.id} acikBakiye={a.balance} telefonVar={Boolean(normalizePhone(String(a.phone ?? "")))} epostaVar={Boolean(a.email?.trim())} hazir />
                  </PanelDrawer>
                ) : null}
                {a.balance > 0 ? (
                  <PanelDrawer
                    triggerLabel="Tahsilat"
                    triggerClassName="panel-secondary cari-tahsilat-btn"
                    kicker="TAHSİLAT"
                    title={`${a.name} · Tahsilat`}
                    description={`Açık bakiye: ${money(a.balance)}`}
                  >
                    <form className="panel-form fin-form" action={createCollection}>
                      <input type="hidden" name="party_id" value={a.id} />
                      <label>
                        Tahsilat tutarı (₺)
                        <input name="amount" type="number" min="0.01" max={a.balance / 100} step="0.01" required />
                      </label>
                      <label>
                        Tarih
                        <input name="transaction_date" type="date" />
                      </label>
                      <label>
                        Referans / dekont no
                        <input name="reference_no" maxLength={100} />
                      </label>
                      <label className="wide">
                        Açıklama
                        <input name="description" defaultValue="Müşteri tahsilatı" minLength={2} maxLength={500} required />
                      </label>
                      <p className="fin-form-note">En fazla açık bakiye kadar ({money(a.balance)}) tahsilat kaydedebilirsiniz.</p>
                      <div className="panel-form-actions wide">
                        <button className="panel-primary">Tahsilatı kaydet</button>
                      </div>
                    </form>
                  </PanelDrawer>
                ) : null}
                <span className="crm-row-chevron" aria-hidden="true">›</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SatirTiklama />
    </div>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ arama?: string; durum?: string; gorunum?: string; maliyet?: string; temsilci?: string; sira?: string }>;
}) {
  const params = await searchParams;
  const { supabase, membership, modules, izin } = await getPanelContext();
  if (
    !modules.some((m) => m.code === "finance") ||
    !modules.some((m) => m.code === "accounts")
  )
    throw new Error("Finans ve cari hesap modülü erişimi gerekli.");
  const [{ data, error }, { data: contractData, error: contractError }, { data: installmentData, error: installmentError }, {data:costItemData,error:costItemError},{data:employeeData},{data:workflowData}] =
    await Promise.all([
      supabase
        .from("account_parties")
        .select(
          "id,name,email,phone,tax_number,account_entries(id,entry_type,amount,description,reference_no,source_type,transaction_date)",
        )
        .eq("organization_id", membership.organization_id)
        .eq("is_active", true)
        .in("party_type", ["customer", "both"])
        .order("name"),
      supabase
        .from("crm_contracts")
        .select("id,party_id,amount,status,contract_no,title,currency,payment_plan_id,workflow_id,signed_at,created_at,service_cost,service_cost_supplier,service_cost_reference,service_cost_status,crm_opportunities(customer_name,contact_phone,contact_email,assigned_employee_id)")
        .eq("organization_id", membership.organization_id)
        .in("status", ["signed", "completed"]),
      supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status,payment_url,payment_link_source,notice_sent_at,reminder_sent_at").eq("organization_id",membership.organization_id).order("due_date"),
      supabase.from("contract_cost_items").select("contract_id,amount,status,cost_date,category").eq("organization_id",membership.organization_id),
      supabase.from("hr_employees").select("id,full_name").eq("organization_id",membership.organization_id),
      supabase.from("operation_workflows").select("id,assigned_employee_id").eq("organization_id",membership.organization_id),
    ]);
  if (error) throw new Error("Cari hesaplar okunamadı: " + error.message);
  if (contractError)
    throw new Error("Sözleşme bakiyeleri okunamadı: " + contractError.message);
  if(installmentError) throw new Error("Ödeme taksitleri okunamadı: "+installmentError.message);
  if(costItemError&&izin("finance.maliyet.yonet"))throw new Error("İş maliyetleri okunamadı: "+costItemError.message);
  const contracts = (contractData ?? []) as unknown as Contract[];
  // Cari bakiyeleri: Finans genel bakışla aynı kural (account-balances.ts)
  const { accounts, totals } = buildAccountBalances((data ?? []) as Party[], contracts);
  /*
    ARAMA: ad, e-posta, telefon, vergi no. Telefon RAKAMLARIYLA da
    aranıyor: kayıtlarda "+90 (532) …", "0532…" ve "532…" biçimleri bir
    arada; eskiden "0532" yazan "+90 532" kaydını bulamıyordu.
  */
  const query = (params.arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const aramaRakam = query.replace(/\D/g, "").replace(/^0+/, "").replace(/^90(?=\d{10})/, "");
  const filtered = accounts.filter((a) => {
    if (!query) return true;
    const metinde = [a.name, a.email, a.phone, a.tax_number].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(query);
    const rakamda = aramaRakam.length >= 4 && String(a.phone ?? "").replace(/\D/g, "").includes(aramaRakam);
    return metinde || rakamda;
  });
  /*
    Bakiyesi kapanan cari kendiliğinden arşive düşer (lib/cari-arsiv.ts).
    Eski "Durum" süzgeci kaldırıldı: iki seçeneği (açık / kapanan) artık
    iki bölümün kendisi karşılıyor, süzgeç olarak kalsaydı aynı ayrımı
    iki ayrı yerden yapan iki kural olurdu. Eski bağlantılar çalışmaya
    devam etsin diye ?durum=kapali arşivi açık getiriyor.
  */
  const canManageCosts = izin("finance.maliyet.yonet");
  const totalServiceCost = contracts.reduce((sum, contract) => sum + Number(contract.service_cost || 0), 0);
  const costItems=(costItemData??[]) as CostItem[];const costTotals=new Map<string,number>();for(const item of costItems)costTotals.set(item.contract_id,(costTotals.get(item.contract_id)??0)+Number(item.amount));
  const installments=(installmentData??[]) as Installment[];
  const employeeMap=new Map((employeeData??[]).map(employee=>[employee.id,employee.full_name]));const workflowMap=new Map((workflowData??[]).map(workflow=>[workflow.id,workflow.assigned_employee_id]));
  /* Eski "PAYTR Tahsilatları" görünümü (?gorunum=paytr) kaldırıldı: ödeme
     bağlantısı artık cari satırından, müşterinin söylediği tutarla açılıyor.
     Eski bağlantılar cari listesine düşer. */
  const mode=params.gorunum==="maliyet"&&canManageCosts?"maliyet":"cari";
  const today=todayInIstanbul();
  /*
    Maliyet: kalemler varsa onların toplamı, yoksa sözleşmedeki eski tek
    satırlık maliyet (service_cost). Ödenen kalemlerin durumundan; kalem
    yoksa eski alanın durumundan.
  */
  const paidTotals=new Map<string,number>();for(const item of costItems)if(item.status==="paid")paidTotals.set(item.contract_id,(paidTotals.get(item.contract_id)??0)+Number(item.amount));
  const kisiAdi=(id:string|null|undefined)=>{if(!id)return"Atanmamış";const ad=employeeMap.get(id);return ad?formatPersonName(ad)||ad:"Pasif personel"};
  const profitRows:ProfitRow[]=contracts.map(contract=>{
    const relation=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;
    const kalemVar=costTotals.has(contract.id);
    const cost=kalemVar?costTotals.get(contract.id)??0:Number(contract.service_cost||0);
    const paid=kalemVar?paidTotals.get(contract.id)??0:contract.service_cost_status==="paid"?Number(contract.service_cost||0):0;
    const profit=Number(contract.amount)-cost;
    const operationEmployeeId=contract.workflow_id?workflowMap.get(contract.workflow_id):null;
    const musteriAdi=relation?.customer_name||contract.title;
    return{id:contract.id,contractNo:contract.contract_no,customer:formatPersonName(musteriAdi)||musteriAdi,title:contract.title,sales:kisiAdi(relation?.assigned_employee_id),operation:kisiAdi(operationEmployeeId),amount:Number(contract.amount),cost,paid,costEntered:cost>0,profit,margin:Number(contract.amount)?profit/Number(contract.amount)*100:0,date:(contract.signed_at||contract.created_at).slice(0,10)};
  }).sort((x,y)=>y.date.localeCompare(x.date));

  // İş maliyetleri özeti (yalnızca gösterim; değerler tablodakiyle aynı kuralla)
  /* Maliyet listesinde arama: müşteri, iş konusu ya da sözleşme no. */
  const maliyetSatirlari = mode === "maliyet" && query
    ? profitRows.filter((row) => [row.customer, row.title, row.contractNo].join(" ").toLocaleLowerCase("tr-TR").includes(query))
    : profitRows;
  /* Maliyet istatistikleri (sağ kart): bütün işlerden, aramadan bağımsız. */
  const maliyetAn = simdi();
  const maliyet30 = costItems.filter((item) => gunAraliginda(item.cost_date, 0, 30, maliyetAn)).reduce((t, item) => t + Number(item.amount), 0);
  const maliyetOnceki = costItems.filter((item) => gunAraliginda(item.cost_date, 30, 60, maliyetAn)).reduce((t, item) => t + Number(item.amount), 0);
  const maliyetDegisim = maliyetOnceki ? Math.round(((maliyet30 - maliyetOnceki) / maliyetOnceki) * 100) : null;
  const zarardaki = profitRows.filter((row) => row.profit < 0);
  const maliyetsiz = profitRows.filter((row) => !row.costEntered);
  const aylikMaliyet = aylik(costItems.map((item) => ({ tarih: item.cost_date, tutar: Number(item.amount) })), 6, maliyetAn);
  const kategoriToplam = new Map<string, number>();
  for (const item of costItems) kategoriToplam.set(item.category || "Diğer", (kategoriToplam.get(item.category || "Diğer") ?? 0) + Number(item.amount));
  const kategoriler = [...kategoriToplam.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  const contractSum = contracts.reduce((s, c) => s + Number(c.amount), 0);
  const profitSum = contracts.reduce((s, c) => s + Number(c.amount) - (costTotals.get(c.id) ?? Number(c.service_cost)), 0);
  const averageMargin = Math.round(contracts.reduce((s, c) => s + (Number(c.amount) ? ((Number(c.amount) - (costTotals.get(c.id) ?? Number(c.service_cost))) / Number(c.amount)) * 100 : 0), 0) / (contracts.length || 1));
  /*
    İSTATİSTİKLER (sağ kart): tüm carilerden, aramadan bağımsız. Tahsilat
    hareketleri cari dökümündeki "credit" kayıtları; vadesi geçen taksit
    ödenmemiş ve vadesi bugünden önce olan taksitler.
  */
  const an = simdi();
  const tahsilatlar = accounts.flatMap((a) => a.entries.filter((e) => e.entry_type === "credit"));
  const tahsilat30 = tahsilatlar.filter((e) => gunAraliginda(e.transaction_date, 0, 30, an)).reduce((s, e) => s + Number(e.amount), 0);
  const tahsilatOnceki = tahsilatlar.filter((e) => gunAraliginda(e.transaction_date, 30, 60, an)).reduce((s, e) => s + Number(e.amount), 0);
  const tahsilatDegisim = tahsilatOnceki ? Math.round(((tahsilat30 - tahsilatOnceki) / tahsilatOnceki) * 100) : null;
  const tahsilOrani = oran(totals.collections, totals.debt + totals.refunds);
  const aylikTahsilat = aylik(tahsilatlar.map((e) => ({ tarih: e.transaction_date, tutar: Number(e.amount) })), 6, an);
  const enYuksek = [...accounts].filter((a) => a.balance > 0).sort((x, y) => y.balance - x.balance).slice(0, 5);
  /*
    Vadesi geçen taksit: taksitin kendi status sütunu cari tahsilatıyla
    güncellenmiyor; kısmen ya da tamamen tahsil edilmiş taksit "ödenmedi"
    sayılıyor ve toplam şişiyordu (285 bin TL). Her carinin net tahsilatı
    o carinin taksitlerine en eski vadeden dağıtılır (lib/taksit-dagitimi.ts,
    cari detayıyla aynı kural); gecikmiş sayılan yalnızca kalan tutar.
    Carisi olmayan sözleşmenin taksiti kendi durumuyla sayılır.
  */
  const planSahibi = new Map(contracts.filter((c) => c.payment_plan_id && c.party_id).map((c) => [c.payment_plan_id as string, c.party_id as string]));
  const cariTaksitleri = new Map<string, Installment[]>();
  const carisizTaksitler: Installment[] = [];
  /* Yalnızca imzalı sözleşmelerin planları: eskiden imzalanmamış ya da
     iptal edilmiş sözleşmenin taksitleri de "carisiz" diye gecikmiş
     sayılıyordu ve bu kart Finans genel bakıştan ₺5 bin fazla gösteriyordu. */
  const imzaliPlanlar = new Set(contracts.map((c) => c.payment_plan_id).filter(Boolean));
  for (const item of installments) {
    if (!imzaliPlanlar.has(item.payment_plan_id)) continue;
    const sahip = planSahibi.get(item.payment_plan_id);
    if (sahip && accounts.some((a) => a.id === sahip)) cariTaksitleri.set(sahip, [...(cariTaksitleri.get(sahip) ?? []), item]);
    else carisizTaksitler.push(item);
  }
  const gecenTaksit: { kalan: number }[] = [];
  const gecikmeler = new Map<string, number>();
  for (const a of accounts) {
    const liste = cariTaksitleri.get(a.id);
    if (!liste) continue;
    // Plan sözleşmeden büyük olabiliyor: vadesi geçen açık bakiyeyi aşmasın.
    for (const t of bakiyeyeSigdir(taksitleriDagit(liste, netTahsilat(a.entries), today), a.balance)) {
      if (t.durum !== "gecikti") continue;
      gecenTaksit.push({ kalan: t.kalan });
      gecikmeler.set(a.id, (gecikmeler.get(a.id) ?? 0) + t.kalan);
    }
  }
  for (const item of carisizTaksitler)
    if (item.status !== "paid" && item.status !== "cancelled" && item.due_date && item.due_date < today) gecenTaksit.push({ kalan: Number(item.amount) });
  const gecenTaksitTutari = gecenTaksit.reduce((sum, item) => sum + item.kalan, 0);
  /* ---- Satırlar: cari bakiyesi + müşteri özeti ---- */
  const sozlesmeleri = new Map<string, Contract[]>();
  for (const c of contracts) if (c.party_id) sozlesmeleri.set(c.party_id, [...(sozlesmeleri.get(c.party_id) ?? []), c]);
  const satira = (a: Hesap): MusteriSatiri => {
    const liste = sozlesmeleri.get(a.id) ?? [];
    // Temsilci: en son sözleşmenin talebindeki satış temsilcisi.
    const sonSozlesme = [...liste].sort((x, y) => (y.signed_at || y.created_at).localeCompare(x.signed_at || x.created_at))[0];
    const iliski = sonSozlesme ? (Array.isArray(sonSozlesme.crm_opportunities) ? sonSozlesme.crm_opportunities[0] : sonSozlesme.crm_opportunities) : null;
    const temsilciId = iliski?.assigned_employee_id ?? null;
    const temsilciAdi = temsilciId ? employeeMap.get(temsilciId) : null;
    return {
      ...a,
      sozlesmeAdedi: liste.length,
      temsilciId,
      temsilci: temsilciAdi ? formatPersonName(temsilciAdi) || temsilciAdi : null,
      tahsilOrani: oran(a.collections, a.debt + a.refunds),
      gecikmis: gecikmeler.get(a.id) ?? 0,
      sonHareket: a.entries.reduce<string | null>((son, e) => (!son || e.transaction_date > son ? e.transaction_date : son), null),
    };
  };
  const temsilciSecimi = params.temsilci ?? "";
  const satirlar = filtered.map(satira).filter((a) => !temsilciSecimi || a.temsilciId === temsilciSecimi);
  const { aktif, arsiv } = cariBolumle(satirlar);
  const gecikenler = aktif.filter((a) => a.gecikmis > 0);
  /*
    ?durum=: "" borcu olan, "gecikmis" vadesi geçen, "arsiv" (eski
    bağlantılarda "kapali") kapanan, "tumu" hepsi.
  */
  const cariGorunum = params.durum === "kapali" || params.durum === "arsiv" ? "arsiv" : params.durum === "tumu" ? "tumu" : params.durum === "gecikmis" ? "gecikmis" : "";
  const SIRALAR: Record<string, { ad: string; karsilastir: (x: MusteriSatiri, y: MusteriSatiri) => number }> = {
    bakiye: { ad: "Açık bakiye", karsilastir: (x, y) => y.balance - x.balance || x.name.localeCompare(y.name, "tr") },
    gecikme: { ad: "Vadesi geçen", karsilastir: (x, y) => y.gecikmis - x.gecikmis || y.balance - x.balance },
    son: { ad: "Son hareket", karsilastir: (x, y) => (y.sonHareket ?? "").localeCompare(x.sonHareket ?? "") },
    ad: { ad: "Ad", karsilastir: (x, y) => x.name.localeCompare(y.name, "tr") },
  };
  const sira = SIRALAR[params.sira ?? ""] ? (params.sira as string) : "bakiye";
  const gorunenCariler = [...(cariGorunum === "arsiv" ? arsiv : cariGorunum === "tumu" ? satirlar : cariGorunum === "gecikmis" ? gecikenler : aktif)].sort(SIRALAR[sira].karsilastir);
  // Süzgeçte yalnızca müşterisi olan temsilciler.
  const temsilciler = [...new Map(filtered.map(satira).filter((a) => a.temsilciId && a.temsilci).map((a) => [a.temsilciId as string, a.temsilci as string])).entries()]
    .sort((x, y) => x[1].localeCompare(y[1], "tr"));
  /* Süzgeçler birbirini silmesin: biri değişirken diğerleri korunuyor. */
  const cariAdres = (durum: string) => {
    const q = new URLSearchParams();
    if (params.arama) q.set("arama", params.arama);
    if (durum) q.set("durum", durum);
    if (temsilciSecimi) q.set("temsilci", temsilciSecimi);
    if (sira !== "bakiye") q.set("sira", sira);
    const s = q.toString();
    return s ? `/panel/finance?${s}` : "/panel/finance";
  };
  const openCount = accounts.filter((a) => a.balance > 0).length;
  const isFiltered = Boolean(query || temsilciSecimi);
  const copy = pageCopy[mode];
  // Pencerede açılacak iş: yalnızca listede olan (kurumun imzalı) bir sözleşme.
  const seciliMaliyet = mode === "maliyet" && params.maliyet ? profitRows.find((row) => row.id === params.maliyet) ?? null : null;
  // PayTR bağlı ve açıksa satırda "Ödeme linki" çıkar.
  const paytr = mode === "cari" ? await getPaytrStatus(membership.organization_id) : null;
  const paytrHazir = Boolean(paytr?.available && paytr.connected && paytr.enabled);

  return (
    <main className={mode === "cari" || mode === "maliyet" ? "fin talep cari ekip talepler teklifler liste-sayfa" : "fin"}>
      {/* İki görünüm de panel liste kalıbında: başlık sınıfı da ortak.
          Maliyet görünümü eskiden panel-pagehead kullanıyordu. */}
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">FİNANS</small>
          <h1>{copy.title}</h1>
        </div>
      </header>

      {mode === "cari" ? (
        <>
          <nav className="kayit-serit talep-serit" aria-label="Müşteri özeti">
            <dl>
              <div><dt>Sözleşme toplamı</dt><dd>{money(totals.debt)}</dd></div>
              <div><dt>Tahsilat</dt><dd className="cari-arti">{money(totals.collections)}</dd></div>
              <div><dt>İade</dt><dd>{money(totals.refunds)}</dd></div>
              <div className="cari-bakiye" data-tone={totals.balance > 0 ? "warning" : "success"}><dt>Açık bakiye</dt><dd>{money(totals.balance)}</dd></div>
              <div className={cariGorunum === "" ? "is-active" : undefined}><dt>Borcu olan</dt><dd><Link href={cariAdres("")}>{openCount}</Link></dd></div>
              <div className={cariGorunum === "gecikmis" ? "is-active" : undefined}><dt>Vadesi geçen</dt><dd className={gecikmeler.size ? "talep-uyari" : undefined}><Link href={cariAdres("gecikmis")}>{gecikmeler.size}</Link></dd></div>
            </dl>
          </nav>

          <div className="talep-izgara personel-iki ekip-izgara">
            <section className="panel-card talep-bilgi" aria-label="Müşteriler">
              {/*
                Açık / Kapanan / Tümü. Bakiyesi kapanan cari kendiliğinden arşive
                düşer (lib/cari-arsiv.ts); eskiden arşiv sayfanın altında katlanmış
                ayrı bir karttaydı. Eski ?durum=kapali bağlantısı kapananları açar.
              */}
              <div className="ekip-suzgec talep-suzgec">
                <Link href={cariAdres("")} className={cariGorunum === "" ? "is-active" : undefined}>Borcu olan <small>{aktif.length}</small></Link>
                <Link href={cariAdres("gecikmis")} className={cariGorunum === "gecikmis" ? "is-active" : undefined}>Vadesi geçen <small>{gecikenler.length}</small></Link>
                <Link href={cariAdres("arsiv")} className={cariGorunum === "arsiv" ? "is-active" : undefined}>Kapanan <small>{arsiv.length}</small></Link>
                <Link href={cariAdres("tumu")} className={cariGorunum === "tumu" ? "is-active" : undefined}>Tümü <small>{satirlar.length}</small></Link>
                {/* Temsilci ve sıralama seçince uygulanır; arama Enter'la. Hepsi aynı formda ki biri ötekini silmesin. */}
                <form action="/panel/finance" className="talep-ara talep-ara--secimli" role="search">
                  {cariGorunum ? <input type="hidden" name="durum" value={cariGorunum} /> : null}
                  {temsilciler.length ? (
                    <OtomatikSecim name="temsilci" defaultValue={temsilciSecimi} className="talep-temsilci-sec" label="Temsilci">
                      <option value="">Tüm temsilciler</option>
                      {temsilciler.map(([kimlik, ad]) => <option key={kimlik} value={kimlik}>{ad}</option>)}
                    </OtomatikSecim>
                  ) : null}
                  <OtomatikSecim name="sira" defaultValue={sira} className="talep-temsilci-sec" label="Sıralama">
                    {Object.entries(SIRALAR).map(([anahtar, deger]) => <option key={anahtar} value={anahtar}>Sırala: {deger.ad}</option>)}
                  </OtomatikSecim>
                  <input name="arama" defaultValue={params.arama ?? ""} placeholder="Ad, telefon, e-posta, vergi no" aria-label="Müşteri ara" />
                </form>
              </div>
              {gorunenCariler.length ? (
                <MusteriTablosu rows={gorunenCariler} paytrHazir={paytrHazir} />
              ) : (
                <div className="crm-empty-state talep-bos-kutu">
                  <h2>{cariGorunum === "gecikmis" && !isFiltered ? "Vadesi geçen ödeme yok" : isFiltered ? "Aramaya uygun müşteri yok" : cariGorunum === "" && arsiv.length ? "Borcu olan müşteri yok" : "Henüz müşteri yok"}</h2>
                  <p>
                    {cariGorunum === "gecikmis" && !isFiltered
                      ? "Bütün taksitler vadesinde ödenmiş."
                      : isFiltered
                        ? "Aramayı ya da temsilci seçimini değiştirip yeniden deneyin."
                        : cariGorunum === "" && arsiv.length
                          ? "Bütün müşterilerin hesabı kapandı; hepsi “Kapanan”da."
                          : "Bir sözleşme imzalandığında müşteri burada listelenir."}
                  </p>
                </div>
              )}
            </section>

            <IstatistikKarti
              kapsam="tüm müşteriler"
              kutular={[
                { ad: "Son 30 gün tahsilat", deger: kisaPara(tahsilat30), alt: degisimYazisi(tahsilatDegisim) ?? "önceki dönem yok", ton: tahsilatDegisim !== null && tahsilatDegisim < 0 ? "uyari" : tahsilatDegisim !== null ? "arti" : undefined },
                { ad: "Tahsil oranı", deger: tahsilOrani === null ? "—" : `%${tahsilOrani}`, alt: "borç ve iadeye göre" },
                { ad: "Vadesi geçen taksit", deger: String(gecenTaksit.length), alt: gecenTaksit.length ? kisaPara(gecenTaksitTutari) : "gecikme yok", ton: gecenTaksit.length ? "uyari" : undefined },
                { ad: "Ortalama açık bakiye", deger: openCount ? kisaPara(Math.round(totals.balance / openCount)) : "—", alt: `${openCount} borçlu müşteri` },
              ]}
              gruplar={[
                { baslik: "Son 6 ay · tahsilat", satirlar: aylikTahsilat.map((ay) => ({ ad: ay.ad, adet: ay.toplam, etiket: kisaPara(ay.toplam) })) },
                { baslik: "En yüksek açık bakiye", satirlar: enYuksek.map((a) => ({ ad: a.name, adet: a.balance, etiket: kisaPara(a.balance) })) },
              ]}
            />
          </div>
        </>
      ) : null}


      {mode === "maliyet" && canManageCosts ? (
        <>
          {/* Özet şeridi panelin diğer listeleriyle aynı: rakamlar üstte
              tek satırda, altında liste kartı. Eskiden dört büyük kutu
              (fin-widgets) ekranın yarısını kaplıyordu. */}
          <nav className="kayit-serit talep-serit" aria-label="İş maliyetleri özeti">
            <dl>
              <div><dt>Toplam sözleşme</dt><dd>{money(contractSum)}</dd></div>
              <div><dt>Maliyet toplamı</dt><dd>{money(totalServiceCost)}</dd></div>
              <div className="cari-bakiye" data-tone={profitSum >= 0 ? "success" : "warning"}><dt>Toplam kâr</dt><dd>{money(profitSum)}</dd></div>
              <div><dt>Ortalama kâr oranı</dt><dd>%{averageMargin}</dd></div>
              <div><dt>İş</dt><dd>{contracts.length}</dd></div>
            </dl>
          </nav>

          <div className="talep-izgara personel-iki ekip-izgara">
            <section className="panel-card talep-bilgi" aria-label="İş maliyetleri">
              <div className="ekip-suzgec talep-suzgec">
                <span className="talep-suzgec-etiket">{maliyetSatirlari.length} iş</span>
                <form action="/panel/finance" className="talep-ara" role="search">
                  <input type="hidden" name="gorunum" value="maliyet" />
                  <input name="arama" defaultValue={params.arama ?? ""} placeholder="Müşteri, iş konusu veya sözleşme no" aria-label="İş ara" />
                </form>
              </div>
              {maliyetSatirlari.length ? (
                <MaliyetTablosu rows={maliyetSatirlari} arama={params.arama ?? ""} />
              ) : (
                <div className="crm-empty-state talep-bos-kutu">
                  <h2>{query ? "Aramaya uygun iş yok" : "Henüz imzalı iş yok"}</h2>
                  <p>{query ? "Aramayı değiştirip yeniden deneyin." : "İmzalanan sözleşmeler maliyet ve kârlarıyla burada listelenir."}</p>
                </div>
              )}
            </section>

            <IstatistikKarti
              kapsam="tüm işler"
              kutular={[
                { ad: "Son 30 gün maliyet", deger: kisaPara(maliyet30), alt: degisimYazisi(maliyetDegisim) ?? "önceki dönem yok", ton: maliyetDegisim !== null && maliyetDegisim > 0 ? "uyari" : undefined },
                { ad: "Ortalama kâr oranı", deger: contracts.length ? `%${averageMargin}` : "—", alt: `${contracts.length} iş` },
                { ad: "Zarar eden iş", deger: String(zarardaki.length), alt: zarardaki.length ? kisaPara(zarardaki.reduce((t, row) => t + row.profit, 0)) : "yok", ton: zarardaki.length ? "uyari" : undefined },
                { ad: "Maliyeti girilmemiş", deger: String(maliyetsiz.length), alt: maliyetsiz.length ? "kâr eksik hesaplanıyor" : "hepsi girilmiş", ton: maliyetsiz.length ? "uyari" : undefined },
              ]}
              gruplar={[
                { baslik: "Son 6 ay · maliyet", satirlar: aylikMaliyet.map((ay) => ({ ad: ay.ad, adet: ay.toplam, etiket: kisaPara(ay.toplam) })) },
                { baslik: "Kategoriye göre maliyet", satirlar: kategoriler.map(([ad, toplam]) => ({ ad, adet: toplam, etiket: kisaPara(toplam) })) },
              ]}
            />
          </div>

          {/* Maliyet detayı ortada açılan pencere (?maliyet=<sözleşme>);
              eskiden ayrı sayfaydı ve listeye dönünce süzgeçler kayboluyordu.
              Kapanınca adres listeye döner. key: başka satıra geçince
              pencere yeniden kurulsun. */}
          {seciliMaliyet ? (
            <PanelModal
              key={seciliMaliyet.id}
              dugmesiz
              baslangicAcik
              triggerLabel=""
              boy="tam"
              kicker="İŞ MALİYETİ"
              title={`${seciliMaliyet.contractNo} · ${seciliMaliyet.customer}`}
              description={seciliMaliyet.title}
              kapaninca={`/panel/finance?gorunum=maliyet${params.arama ? `&arama=${encodeURIComponent(params.arama)}` : ""}`}
            >
              <MaliyetDetayi contractId={seciliMaliyet.id} />
            </PanelModal>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
