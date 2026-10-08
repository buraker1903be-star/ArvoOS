import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { PanelDrawer } from "../components/panel-drawer";
import { createCollection } from "../accounts/actions";
import { ProfitabilityWorkspace, type ProfitRow } from "./finance-workspaces";
import { OdemeBaglantisiFormu } from "../accounts/odeme-baglantisi";
import { normalizePhone } from "@/lib/whatsapp-send";
import { buildAccountBalances } from "./account-balances";
import { cariBolumle } from "@/lib/cari-arsiv";
import { getPaytrStatus } from "@/lib/paytr-status";
import { netTahsilat, taksitleriDagit } from "@/lib/taksit-dagitimi";
import { IstatistikKarti, degisimYazisi, kisaPara } from "../crm/istatistik-karti";
import { aylik, gunAraliginda, oran } from "@/lib/liste-istatistik";
import { simdi } from "../os/genel-bakis";
import "./finance.css";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";
import { SatirTiklama } from "@/app/panel/crm/satir-tiklama";

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
type CostItem={contract_id:string;amount:number;status:string};

/* Yalnızca başlık: açıklama satırı kaldırıldı (kurum sahibinin isteği,
   2026-10). Rakamlar hemen altındaki şeritte zaten duruyor; bir cümlelik
   tanım ekranın üstünde yer kaplıyordu. */
const pageCopy = {
  cari: { title: "Cari Hesaplar" },
  maliyet: { title: "İş Maliyetleri" },
} as const;

/*
  Cari tablosu (2026-10): talepler/teklifler/sözleşmeler listeleriyle aynı
  sütunlu tablo; satırın tamamı cari detayına gider. Eskiden her satırda
  üç çekmece (tahsilat, ek hizmet, iade) ve "Hareketler" bağlantısı vardı;
  ek hizmet ve iade cari detayının "⋯" menüsünde. Açık bakiyeli caride sık
  kullanılan "Tahsilat" satırda kaldı.
*/
function CariTablosu({ rows, paytrHazir }: { rows: Hesap[]; paytrHazir: boolean }) {
  return (
    <div className="talep-tablo">
      <table className="crm-data-table" data-cols="ledger">
        <thead>
          <tr>
            <th>Müşteri</th>
            <th className="crm-col-amount">Sözleşme</th>
            <th className="crm-col-amount">Tahsilat</th>
            <th className="crm-col-amount">İade</th>
            <th className="crm-col-amount">Kalan bakiye</th>
            <th className="crm-col-date">Son hareket</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const sonHareket = a.entries.reduce<string | null>((son, e) => (!son || e.transaction_date > son ? e.transaction_date : son), null);
            return (
              <tr key={a.id}>
                <td data-label="Müşteri">
                  <Link className="crm-row-link" href={`/panel/accounts/${a.id}`} aria-label={`${a.name} carisini aç`}>
                    <span className="crm-table-title" title={a.name}>{a.name}</span>
                    <span className="crm-table-sub">{a.phone || a.email || a.tax_number || "Müşteri cari hesabı"}</span>
                  </Link>
                </td>
                <td className="crm-col-amount" data-label="Sözleşme">{money(a.debt)}</td>
                <td className={a.collections ? "crm-col-amount cari-arti" : "crm-col-amount cari-sifir"} data-label="Tahsilat">{money(a.collections)}</td>
                <td className={a.refunds ? "crm-col-amount talep-uyari" : "crm-col-amount cari-sifir"} data-label="İade">{money(a.refunds)}</td>
                <td className="crm-col-amount" data-label="Kalan bakiye">
                  {money(a.balance)}
                  <small className={a.balance > 0 ? "crm-waiting is-late" : "crm-waiting"}>{a.balance > 0 ? "tahsilat bekliyor" : "kapandı"}</small>
                </td>
                <td className="crm-col-date" data-label="Son hareket">{sonHareket ? new Date(`${sonHareket}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
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
            );
          })}
        </tbody>
      </table>
      <SatirTiklama />
    </div>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ arama?: string; durum?: string; gorunum?: string }>;
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
      supabase.from("contract_cost_items").select("contract_id,amount,status").eq("organization_id",membership.organization_id),
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
  const query = (params.arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const filtered = accounts.filter(
    (a) =>
      !query ||
      [a.name, a.email, a.phone, a.tax_number]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query),
  );
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
  const profitRows:ProfitRow[]=contracts.map(contract=>{const relation=Array.isArray(contract.crm_opportunities)?contract.crm_opportunities[0]:contract.crm_opportunities;const cost=costTotals.get(contract.id)??Number(contract.service_cost);const profit=Number(contract.amount)-cost;const operationEmployeeId=contract.workflow_id?workflowMap.get(contract.workflow_id):null;return{id:contract.id,contractNo:contract.contract_no,customer:relation?.customer_name||contract.title,title:contract.title,sales:relation?.assigned_employee_id?employeeMap.get(relation.assigned_employee_id)||"Pasif personel":"Atanmamış",operation:operationEmployeeId?employeeMap.get(operationEmployeeId)||"Pasif personel":"Atanmamış",amount:Number(contract.amount),cost,profit,margin:Number(contract.amount)?profit/Number(contract.amount)*100:0,date:(contract.signed_at||contract.created_at).slice(0,10)}});

  // İş maliyetleri özeti (yalnızca gösterim; değerler tablodakiyle aynı kuralla)
  const contractSum = contracts.reduce((s, c) => s + Number(c.amount), 0);
  const profitSum = contracts.reduce((s, c) => s + Number(c.amount) - (costTotals.get(c.id) ?? Number(c.service_cost)), 0);
  const averageMargin = Math.round(contracts.reduce((s, c) => s + (Number(c.amount) ? ((Number(c.amount) - (costTotals.get(c.id) ?? Number(c.service_cost))) / Number(c.amount)) * 100 : 0), 0) / (contracts.length || 1));
  const { aktif, arsiv } = cariBolumle(filtered);
  // ?durum=: "" açık cariler, "arsiv" (eski bağlantılarda "kapali") kapananlar, "tumu" hepsi.
  const cariGorunum = params.durum === "kapali" || params.durum === "arsiv" ? "arsiv" : params.durum === "tumu" ? "tumu" : "";
  const gorunenCariler = cariGorunum === "arsiv" ? arsiv : cariGorunum === "tumu" ? filtered : aktif;
  const cariAdres = (durum: string) => {
    const q = new URLSearchParams();
    if (params.arama) q.set("arama", params.arama);
    if (durum) q.set("durum", durum);
    const s = q.toString();
    return s ? `/panel/finance?${s}` : "/panel/finance";
  };
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
  for (const item of installments) {
    const sahip = planSahibi.get(item.payment_plan_id);
    if (sahip && accounts.some((a) => a.id === sahip)) cariTaksitleri.set(sahip, [...(cariTaksitleri.get(sahip) ?? []), item]);
    else carisizTaksitler.push(item);
  }
  const gecenTaksit: { kalan: number }[] = [];
  for (const a of accounts) {
    const liste = cariTaksitleri.get(a.id);
    if (!liste) continue;
    for (const t of taksitleriDagit(liste, netTahsilat(a.entries), today)) if (t.durum === "gecikti") gecenTaksit.push({ kalan: t.kalan });
  }
  for (const item of carisizTaksitler)
    if (item.status !== "paid" && item.status !== "cancelled" && item.due_date && item.due_date < today) gecenTaksit.push({ kalan: Number(item.amount) });
  const gecenTaksitTutari = gecenTaksit.reduce((sum, item) => sum + item.kalan, 0);
  const openCount = accounts.filter((a) => a.balance > 0).length;
  const isFiltered = Boolean(query);
  const copy = pageCopy[mode];
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
          <nav className="kayit-serit talep-serit" aria-label="Cari özeti">
            <dl>
              <div><dt>Sözleşme toplamı</dt><dd>{money(totals.debt)}</dd></div>
              <div><dt>Tahsilat</dt><dd className="cari-arti">{money(totals.collections)}</dd></div>
              <div><dt>İade</dt><dd>{money(totals.refunds)}</dd></div>
              <div className="cari-bakiye" data-tone={totals.balance > 0 ? "warning" : "success"}><dt>Açık bakiye</dt><dd>{money(totals.balance)}</dd></div>
              <div className={cariGorunum === "" ? "is-active" : undefined}><dt>Açık cari</dt><dd><Link href={cariAdres("")}>{openCount}</Link></dd></div>
              <div className={cariGorunum === "arsiv" ? "is-active" : undefined}><dt>Kapanan cari</dt><dd><Link href={cariAdres("arsiv")}>{accounts.length - openCount}</Link></dd></div>
            </dl>
          </nav>

          <div className="talep-izgara personel-iki ekip-izgara">
            <section className="panel-card talep-bilgi" aria-label="Müşteri carileri">
              {/*
                Açık / Kapanan / Tümü. Bakiyesi kapanan cari kendiliğinden arşive
                düşer (lib/cari-arsiv.ts); eskiden arşiv sayfanın altında katlanmış
                ayrı bir karttaydı. Eski ?durum=kapali bağlantısı kapananları açar.
              */}
              <div className="ekip-suzgec talep-suzgec">
                <Link href={cariAdres("")} className={cariGorunum === "" ? "is-active" : undefined}>Açık <small>{aktif.length}</small></Link>
                <Link href={cariAdres("arsiv")} className={cariGorunum === "arsiv" ? "is-active" : undefined}>Kapanan <small>{arsiv.length}</small></Link>
                <Link href={cariAdres("tumu")} className={cariGorunum === "tumu" ? "is-active" : undefined}>Tümü <small>{filtered.length}</small></Link>
                <form action="/panel/finance" className="talep-ara" role="search">
                  {cariGorunum ? <input type="hidden" name="durum" value={cariGorunum} /> : null}
                  <input name="arama" defaultValue={params.arama ?? ""} placeholder="Müşteri, telefon veya vergi no" aria-label="Cari ara" />
                </form>
              </div>
              {gorunenCariler.length ? (
                <CariTablosu rows={gorunenCariler} paytrHazir={paytrHazir} />
              ) : (
                <div className="crm-empty-state talep-bos-kutu">
                  <h2>{isFiltered ? "Aramaya uygun cari yok" : cariGorunum === "" && arsiv.length ? "Açık bakiyesi olan cari yok" : "Henüz müşteri carisi yok"}</h2>
                  <p>
                    {isFiltered
                      ? "Aramayı değiştirip yeniden deneyin."
                      : cariGorunum === "" && arsiv.length
                        ? "Tüm cariler kapandı; hepsi “Kapanan”da."
                        : "Bir sözleşme imzalandığında müşterinin cari hesabı burada oluşur."}
                  </p>
                </div>
              )}
            </section>

            <IstatistikKarti
              kapsam="tüm cariler"
              kutular={[
                { ad: "Son 30 gün tahsilat", deger: kisaPara(tahsilat30), alt: degisimYazisi(tahsilatDegisim) ?? "önceki dönem yok", ton: tahsilatDegisim !== null && tahsilatDegisim < 0 ? "uyari" : tahsilatDegisim !== null ? "arti" : undefined },
                { ad: "Tahsil oranı", deger: tahsilOrani === null ? "—" : `%${tahsilOrani}`, alt: "borç ve iadeye göre" },
                { ad: "Vadesi geçen taksit", deger: String(gecenTaksit.length), alt: gecenTaksit.length ? kisaPara(gecenTaksitTutari) : "gecikme yok", ton: gecenTaksit.length ? "uyari" : undefined },
                { ad: "Ortalama açık bakiye", deger: openCount ? kisaPara(Math.round(totals.balance / openCount)) : "—", alt: `${openCount} açık cari` },
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

          <div className="talep-izgara maliyet-liste-izgara">
            <ProfitabilityWorkspace rows={profitRows} />
          </div>
        </>
      ) : null}
    </main>
  );
}
