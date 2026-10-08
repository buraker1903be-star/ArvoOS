import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { formatPersonName } from "@/lib/format-name";
import { buildAccountBalances } from "../account-balances";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, simdi } from "../../os/genel-bakis";

// Finans genel bakış: tahsilat odaklı günlük ekran. Ana ekranla aynı
// şablon (os/genel-bakis.tsx, 2026-10): son 14 günün tahsilat grafiği (₺)
// ve dört liste: gecikmiş ödemeler, yaklaşan vadeler, açık bakiyeli
// cariler, son tahsilatlar. Eskiden üstte beş sayı kartı vardı; toplamlar
// artık kart alt başlıklarında.
// Rakamlar sekmelerle aynı kuralla: bakiyeler Cari Hesaplar'daki
// buildAccountBalances ile, gecikme PAYTR Tahsilatları'ndaki kuralla
// (ödenmemiş ve vadesi bugünden önce) hesaplanır.

type Entry = { id: string; entry_type: "debit" | "credit"; amount: number; description: string; source_type: string | null; transaction_date: string };
type Party = { id: string; name: string; phone: string | null; email: string | null; account_entries: Entry[] };
type Customer = { customer_name: string } | { customer_name: string }[] | null;
type Contract = { id: string; party_id: string | null; amount: number; contract_no: string; title: string; payment_plan_id: string | null; crm_opportunities: Customer };
type Installment = { id: string; payment_plan_id: string; installment_no: number; due_date: string | null; amount: number; status: string };
type CreditRow = { id: string; amount: number; transaction_date: string; description: string; party_id: string; account_parties: { name: string } | { name: string }[] | null };

const UPCOMING_DAYS = 14;
const money = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(amount || 0) / 100);
const customerOf = (value: Customer) => formatPersonName(Array.isArray(value) ? value[0]?.customer_name : value?.customer_name) || "Müşteri";
const partyNameOf = (value: CreditRow["account_parties"]) => (Array.isArray(value) ? value[0]?.name : value?.name) || "Cari";
/** İki tarih anahtarı (YYYY-AA-GG) arasındaki gün farkı. */
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
/** Tahsilat kayıtlarında saat yok, yalnızca tarih: "bugün", "dün", "5 gün önce". */
const daysAgoLabel = (dateKey: string, today: string) => {
  const days = dayDiff(dateKey, today);
  return days <= 0 ? "bugün" : days === 1 ? "dün" : `${days} gün önce`;
};
const shortDate = (value: string) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

export default async function FinanceOverviewPage() {
  const context = await getPanelContext();
  const { supabase, membership, modules } = context;
  if (!modules.some((m) => m.code === "finance") || !modules.some((m) => m.code === "accounts"))
    throw new Error("Finans ve cari hesap modülü erişimi gerekli.");
  const organizationId = membership.organization_id;
  const today = todayInIstanbul();
  const monthKey = today.slice(0, 7);

  const [
    { data: partyData, error: partyError },
    { data: contractData, error: contractError },
    { data: installmentData, error: installmentError },
    { data: creditData, error: creditError },
  ] = await Promise.all([
    supabase.from("account_parties")
      .select("id,name,phone,email,account_entries(id,entry_type,amount,description,source_type,transaction_date)")
      .eq("organization_id", organizationId).eq("is_active", true).in("party_type", ["customer", "both"]),
    supabase.from("crm_contracts")
      .select("id,party_id,amount,contract_no,title,payment_plan_id,crm_opportunities(customer_name)")
      .eq("organization_id", organizationId).in("status", ["signed", "completed"]),
    supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status").eq("organization_id", organizationId).order("due_date"),
    supabase.from("account_entries")
      .select("id,amount,transaction_date,description,party_id,account_parties(name)")
      .eq("organization_id", organizationId).eq("entry_type", "credit")
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
  ]);
  if (partyError) throw new Error("Cari hesaplar okunamadı: " + partyError.message);
  if (contractError) throw new Error("Sözleşme bakiyeleri okunamadı: " + contractError.message);
  if (installmentError) throw new Error("Ödeme taksitleri okunamadı: " + installmentError.message);
  if (creditError) throw new Error("Tahsilatlar okunamadı: " + creditError.message);

  const contracts = (contractData ?? []) as unknown as Contract[];
  const { accounts, totals } = buildAccountBalances((partyData ?? []) as Party[], contracts);
  const openAccounts = accounts.filter((account) => account.balance > 0).sort((a, b) => b.balance - a.balance);

  // Bu ay tahsilat: müşteri carilerine giren ödemeler
  const monthCredits = accounts.flatMap((account) => account.entries).filter((entry) => entry.entry_type === "credit" && entry.transaction_date.startsWith(monthKey));
  const monthCollections = monthCredits.reduce((sum, entry) => sum + Number(entry.amount), 0);

  // Taksitler: yalnızca imzalı sözleşmenin ödeme planındakiler (PAYTR sekmesiyle aynı)
  const contractByPlan = new Map(contracts.filter((row) => row.payment_plan_id).map((row) => [row.payment_plan_id as string, row]));
  const installments = ((installmentData ?? []) as Installment[])
    .filter((row) => row.status !== "paid" && contractByPlan.has(row.payment_plan_id))
    .map((row) => ({ ...row, contract: contractByPlan.get(row.payment_plan_id)! }));
  const overdue = installments.filter((row) => row.due_date && row.due_date < today).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const upcoming = installments.filter((row) => row.due_date && row.due_date >= today && dayDiff(today, row.due_date) <= UPCOMING_DAYS);
  const overdueSum = overdue.reduce((sum, row) => sum + Number(row.amount), 0);
  const upcomingSum = upcoming.reduce((sum, row) => sum + Number(row.amount), 0);

  const credits = (creditData ?? []) as unknown as CreditRow[];

  /* Grafik: son 14 günün tahsilatı, tutar (kuruş) olarak. Bu ay
     tahsilatıyla aynı kaynak: müşteri carilerine giren ödemeler. Kayıtta
     saat yok; gün Türkiye takvimiyle. */
  const tumTahsilatlar = accounts.flatMap((account) => account.entries).filter((entry) => entry.entry_type === "credit");
  const seri = gunlukSeri(tumTahsilatlar.map((entry) => `${entry.transaction_date}T12:00:00+03:00`), simdi(), 14, tumTahsilatlar.map((entry) => Number(entry.amount)));

  return (
    <GenelBakis
      gizliBaslik="Finans genel bakış"
    >
      <SeriKarti baslik="Tahsilat" alt={monthCollections ? `Son 14 gün · bu ay ${money(monthCollections)}` : "Son 14 gün"} seri={seri} birim={money} adet="tahsilat" />

      <ListeIzgarasi etiket="Tahsilat işleri">
        <ListeKarti baslik="Gecikmiş ödemeler" alt={overdue.length ? `${money(overdueSum)} vadesi geçmiş tahsilat` : "Vadesi geçmiş taksit yok"} bos="Vadesi geçmiş ödeme yok." href="/panel/finance" hrefEtiket="Tümünü gör" sayi={overdue.length}>
          {overdue.slice(0, GENEL_BAKIS_SATIR).map((row) => (
            <ListeSatiri
              key={row.id}
              href={`/panel/crm/contracts/${row.contract.id}`}
              baslik={customerOf(row.contract.crm_opportunities)}
              alt={`${money(row.amount)} · ${row.installment_no}. taksit · vade ${shortDate(row.due_date!)}`}
              sag={<span className="status-pill" data-tone="danger">{dayDiff(row.due_date!, today)} gün gecikti</span>}
            />
          ))}
        </ListeKarti>

        <ListeKarti baslik="Yaklaşan vadeler" alt={upcoming.length ? `${UPCOMING_DAYS} gün içinde ${money(upcomingSum)} tahsilat` : `Önümüzdeki ${UPCOMING_DAYS} gün`} bos={`Önümüzdeki ${UPCOMING_DAYS} günde vadesi gelen taksit yok.`} href="/panel/finance" hrefEtiket="Tümünü gör" sayi={upcoming.length}>
          {upcoming.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const left = dayDiff(today, row.due_date!);
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/contracts/${row.contract.id}`}
                baslik={customerOf(row.contract.crm_opportunities)}
                alt={`${money(row.amount)} · ${row.installment_no}. taksit · vade ${shortDate(row.due_date!)}`}
                sag={<span className="status-pill" data-tone={left <= 2 ? "warning" : "info"}>{left === 0 ? "Bugün" : `${left} gün kaldı`}</span>}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Açık bakiyeli cariler" alt={openAccounts.length ? `${openAccounts.length} caride ${money(totals.balance)}` : "Tahsilat bekleyen cari yok"} bos="Tüm carilerin bakiyesi kapalı." href="/panel/finance?durum=acik" hrefEtiket="Tümünü gör" sayi={openAccounts.length}>
          {openAccounts.slice(0, GENEL_BAKIS_SATIR).map((account) => (
            <ListeSatiri
              key={account.id}
              href={`/panel/accounts/${account.id}`}
              baslik={account.name}
              alt={`Sözleşme ${money(account.debt)} · tahsil edilen ${money(account.collections)}`}
              sag={<span className="status-pill" data-tone="warning">{money(account.balance)}</span>}
            />
          ))}
        </ListeKarti>

        <ListeKarti baslik="Son tahsilatlar" alt={monthCollections ? `Bu ay ${monthCredits.length} ödeme · ${money(monthCollections)}` : "Carilere işlenen son ödemeler"} bos="Henüz tahsilat kaydı yok. Cari hesaplardan “+ Tahsilat” ile eklenir." href="/panel/finance" hrefEtiket="Cari hesaplara git" sayi={credits.length}>
          {credits.map((row) => (
            <ListeSatiri
              key={row.id}
              href={`/panel/accounts/${row.party_id}`}
              baslik={partyNameOf(row.account_parties)}
              alt={row.description}
              sag={<span className="status-pill" data-tone="success">+{money(row.amount)}</span>}
              zaman={daysAgoLabel(row.transaction_date, today)}
            />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
