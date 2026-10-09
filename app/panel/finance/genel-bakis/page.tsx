import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { formatPersonName } from "@/lib/format-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { netTahsilat, taksitleriDagit } from "@/lib/taksit-dagitimi";
import { oran } from "@/lib/liste-istatistik";
import { buildAccountBalances } from "../account-balances";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, simdi } from "../../os/genel-bakis";

/*
  FİNANS GENEL BAKIŞ: tahsilat odaklı günlük ekran. Ana ekranla aynı
  şablon (os/genel-bakis.tsx): üstte son 14 günün tahsilat grafiği ve
  başlığında dört özet (bu ay tahsilat, tahsil oranı, vadesi geçen,
  ortalama kâr oranı); altında dört liste.

  RAKAMLAR MÜŞTERİLER LİSTESİYLE AYNI KURALLA (2026-10):
  - Bakiyeler buildAccountBalances ile.
  - Gecikme ve yaklaşan vade, taksitin kendi "ödendi" işaretinden DEĞİL
    cari dökümünden: her müşterinin net tahsilatı taksitlerine en eski
    vadeden dağıtılır (lib/taksit-dagitimi.ts). Taksit işareti tahsilat
    girilince güncellenmiyor; eskiden bu ekran ona bakıyordu ve gecikmiş
    tutarı ₺280 bin gösterirken Müşteriler listesi aynı şey için ₺182 bin
    gösteriyordu (kısmen ödenmiş taksit tamamıyla gecikmiş sayılıyordu).
    Carisi olmayan sözleşmenin taksiti kendi işaretiyle sayılır.
  - Gecikmiş ödemeler MÜŞTERİ başına tek satır; eskiden her taksit ayrı
    satırdı ve aynı müşteri listede üç kez çıkıyordu.
*/

type Entry = { id: string; entry_type: "debit" | "credit"; amount: number; description: string; source_type: string | null; transaction_date: string };
type Party = { id: string; name: string; phone: string | null; email: string | null; account_entries: Entry[] };
type Customer = { customer_name: string } | { customer_name: string }[] | null;
type Contract = { id: string; party_id: string | null; amount: number; contract_no: string; title: string; payment_plan_id: string | null; service_cost: number | null; crm_opportunities: Customer };
type Installment = { id: string; payment_plan_id: string; installment_no: number; due_date: string | null; amount: number; status: string };
type CreditRow = { id: string; amount: number; transaction_date: string; description: string; party_id: string; account_parties: { name: string } | { name: string }[] | null };
type Vade = { id: string; ad: string; href: string; installmentNo: number; due: string; kalan: number };
type LinkRow = { id: string; amount: number; note: string | null; created_at: string; party_id: string | null };

const UPCOMING_DAYS = 14;
const money = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(amount || 0) / 100);
/** Ad tek biçimde: bazı kayıtlar büyük harfle girilmiş ("ERENCAN EREN …"). */
const adBicimi = (ad: string | null | undefined, yedek: string) => formatPersonName(ad) || ad || yedek;
const customerOf = (value: Customer) => adBicimi(Array.isArray(value) ? value[0]?.customer_name : value?.customer_name, "Müşteri");
const partyNameOf = (value: CreditRow["account_parties"]) => adBicimi(Array.isArray(value) ? value[0]?.name : value?.name, "Müşteri");
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
  const { supabase, membership, modules, izin } = context;
  if (!modules.some((m) => m.code === "finance") || !modules.some((m) => m.code === "accounts"))
    throw new Error("Finans ve cari hesap modülü erişimi gerekli.");
  const organizationId = membership.organization_id;
  const today = todayInIstanbul();
  const monthKey = today.slice(0, 7);
  const maliyetGorur = izin("finance.maliyet.yonet");

  const [
    { data: partyData, error: partyError },
    { data: contractData, error: contractError },
    { data: installmentData, error: installmentError },
    { data: creditData, error: creditError },
    { data: costData },
  ] = await Promise.all([
    supabase.from("account_parties")
      .select("id,name,phone,email,account_entries(id,entry_type,amount,description,source_type,transaction_date)")
      .eq("organization_id", organizationId).eq("is_active", true).in("party_type", ["customer", "both"]),
    supabase.from("crm_contracts")
      .select("id,party_id,amount,contract_no,title,payment_plan_id,service_cost,crm_opportunities(customer_name)")
      .eq("organization_id", organizationId).in("status", ["signed", "completed"]),
    supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status").eq("organization_id", organizationId).order("due_date"),
    supabase.from("account_entries")
      .select("id,amount,transaction_date,description,party_id,account_parties(name)")
      .eq("organization_id", organizationId).eq("entry_type", "credit")
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    // Kâr oranı yalnızca maliyeti görebilene (İş Maliyetleri sekmesiyle aynı yetki).
    maliyetGorur ? supabase.from("contract_cost_items").select("contract_id,amount").eq("organization_id", organizationId) : Promise.resolve({ data: [] }),
  ]);
  if (partyError) throw new Error("Müşteriler okunamadı: " + partyError.message);
  if (contractError) throw new Error("Sözleşme bakiyeleri okunamadı: " + contractError.message);
  if (installmentError) throw new Error("Ödeme taksitleri okunamadı: " + installmentError.message);
  if (creditError) throw new Error("Tahsilatlar okunamadı: " + creditError.message);

  const contracts = (contractData ?? []) as unknown as Contract[];
  const { accounts, totals } = buildAccountBalances((partyData ?? []) as Party[], contracts);
  const openAccounts = accounts.filter((account) => account.balance > 0).sort((a, b) => b.balance - a.balance);
  const hesapAdi = new Map(accounts.map((a) => [a.id, adBicimi(a.name, "Müşteri")]));

  // Bu ay tahsilat: müşteri carilerine giren ödemeler
  const monthCredits = accounts.flatMap((account) => account.entries).filter((entry) => entry.entry_type === "credit" && entry.transaction_date.startsWith(monthKey));
  const monthCollections = monthCredits.reduce((sum, entry) => sum + Number(entry.amount), 0);

  /* ---- Taksitler: cari dökümünden dağıtılmış ---- */
  const contractByPlan = new Map(contracts.filter((row) => row.payment_plan_id).map((row) => [row.payment_plan_id as string, row]));
  const cariTaksitleri = new Map<string, Installment[]>();
  const carisiz: Installment[] = [];
  for (const row of (installmentData ?? []) as Installment[]) {
    const sozlesme = contractByPlan.get(row.payment_plan_id);
    if (!sozlesme) continue; // yalnızca imzalı sözleşmenin planındakiler
    if (sozlesme.party_id && hesapAdi.has(sozlesme.party_id)) cariTaksitleri.set(sozlesme.party_id, [...(cariTaksitleri.get(sozlesme.party_id) ?? []), row]);
    else carisiz.push(row);
  }
  const gecikmis: Vade[] = [];
  const yaklasan: Vade[] = [];
  const vadeEkle = (t: { id: string; installment_no: number; due_date: string | null }, kalan: number, ad: string, href: string, gecikti: boolean) => {
    if (!t.due_date || kalan <= 0) return;
    const vade = { id: t.id, ad, href, installmentNo: t.installment_no, due: t.due_date, kalan };
    if (gecikti) gecikmis.push(vade);
    else if (t.due_date >= today && dayDiff(today, t.due_date) <= UPCOMING_DAYS) yaklasan.push(vade);
  };
  for (const a of accounts) {
    const liste = cariTaksitleri.get(a.id);
    if (!liste) continue;
    for (const t of taksitleriDagit(liste, netTahsilat(a.entries), today)) {
      if (t.durum === "odendi" || t.durum === "iptal") continue;
      vadeEkle(t, t.kalan, hesapAdi.get(a.id) ?? "Müşteri", `/panel/finance/musteri/${a.id}`, t.durum === "gecikti");
    }
  }
  for (const t of carisiz) {
    if (t.status === "paid" || t.status === "cancelled") continue;
    const sozlesme = contractByPlan.get(t.payment_plan_id)!;
    vadeEkle(t, Number(t.amount), customerOf(sozlesme.crm_opportunities), `/panel/crm/contracts/${sozlesme.id}`, Boolean(t.due_date && t.due_date < today));
  }
  // Gecikmiş: müşteri (bağlantı) başına tek satır, en çok geciken üstte.
  const gecikmisGruplar = [...gecikmis.reduce((harita, v) => {
    const grup = harita.get(v.href) ?? { href: v.href, ad: v.ad, adet: 0, toplam: 0, enEski: v.due };
    grup.adet += 1;
    grup.toplam += v.kalan;
    if (v.due < grup.enEski) grup.enEski = v.due;
    return harita.set(v.href, grup);
  }, new Map<string, { href: string; ad: string; adet: number; toplam: number; enEski: string }>()).values()]
    .sort((x, y) => x.enEski.localeCompare(y.enEski));
  const gecikmisToplam = gecikmis.reduce((sum, v) => sum + v.kalan, 0);
  yaklasan.sort((x, y) => x.due.localeCompare(y.due));
  const yaklasanToplam = yaklasan.reduce((sum, v) => sum + v.kalan, 0);

  /*
    Yaklaşan vade yoksa kart boş durmasın: yerinde müşteriye gönderilmiş,
    henüz ödenmemiş PayTR ödeme bağlantıları. payment_links kullanıcıya
    kapalı (RLS), service_role ile ve kurumla sınırlı okunuyor; bu sayfa
    finans modülünün arkasında. Sayısı ayrı sayılıyor (listedeki 6'dan
    değil).
  */
  let bekleyenLinkler: LinkRow[] = [];
  let bekleyenLinkSayisi = 0;
  if (!yaklasan.length) {
    const admin = createAdminClient();
    if (admin) {
      const [{ data }, { count }] = await Promise.all([
        admin.from("payment_links").select("id,amount,note,created_at,party_id").eq("organization_id", organizationId).eq("purpose", "account").eq("status", "active").order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
        admin.from("payment_links").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("purpose", "account").eq("status", "active"),
      ]);
      bekleyenLinkler = (data ?? []) as LinkRow[];
      bekleyenLinkSayisi = count ?? 0;
    }
  }

  /* ---- Özet: tahsil oranı ve ortalama kâr oranı ---- */
  const tahsilOrani = oran(totals.collections, totals.debt + totals.refunds);
  let karOrani: number | null = null;
  if (maliyetGorur && contracts.length) {
    const maliyetler = new Map<string, number>();
    for (const item of (costData ?? []) as { contract_id: string; amount: number }[]) maliyetler.set(item.contract_id, (maliyetler.get(item.contract_id) ?? 0) + Number(item.amount));
    // İş Maliyetleri sekmesindeki ortalamayla aynı: işlerin kâr oranlarının ortalaması.
    karOrani = Math.round(contracts.reduce((t, c) => {
      const tutar = Number(c.amount);
      const maliyet = maliyetler.get(c.id) ?? Number(c.service_cost || 0);
      return t + (tutar ? ((tutar - maliyet) / tutar) * 100 : 0);
    }, 0) / contracts.length);
  }

  const credits = (creditData ?? []) as unknown as CreditRow[];

  /* Grafik: son 14 günün tahsilatı, tutar (kuruş) olarak. Kayıtta saat
     yok; gün Türkiye takvimiyle. */
  const tumTahsilatlar = accounts.flatMap((account) => account.entries).filter((entry) => entry.entry_type === "credit");
  const seri = gunlukSeri(tumTahsilatlar.map((entry) => `${entry.transaction_date}T12:00:00+03:00`), simdi(), 14, tumTahsilatlar.map((entry) => Number(entry.amount)));

  return (
    <GenelBakis gizliBaslik="Finans genel bakış">
      <SeriKarti
        baslik="Tahsilat"
        alt="Son 14 gün"
        seri={seri}
        birim={money}
        adet="tahsilat"
        ozet={[
          { ad: "Bu ay tahsilat", deger: money(monthCollections) },
          { ad: "Tahsil oranı", deger: tahsilOrani === null ? "—" : `%${tahsilOrani}` },
          { ad: "Vadesi geçen", deger: money(gecikmisToplam), ton: gecikmisToplam ? "warning" : undefined, href: "/panel/finance?durum=gecikmis" },
          ...(karOrani !== null ? [{ ad: "Ortalama kâr oranı", deger: `%${karOrani}`, href: "/panel/finance?gorunum=maliyet" }] : []),
        ]}
      />

      <ListeIzgarasi etiket="Tahsilat işleri">
        <ListeKarti
          baslik="Gecikmiş ödemeler"
          alt={gecikmisGruplar.length ? `${gecikmisGruplar.length} müşteride ${money(gecikmisToplam)}` : "Vadesi geçmiş ödeme yok"}
          bos="Bütün taksitler vadesinde ödenmiş."
          href="/panel/finance?durum=gecikmis"
          hrefEtiket="Tümünü gör"
          sayi={gecikmisGruplar.length}
        >
          {gecikmisGruplar.slice(0, GENEL_BAKIS_SATIR).map((grup) => (
            <ListeSatiri
              key={grup.href}
              href={grup.href}
              baslik={grup.ad}
              alt={`${money(grup.toplam)} · ${grup.adet} taksit · en eski vade ${shortDate(grup.enEski)}`}
              sag={<span className="status-pill" data-tone="danger">{dayDiff(grup.enEski, today)} gün gecikti</span>}
            />
          ))}
        </ListeKarti>

        {yaklasan.length || !bekleyenLinkSayisi ? (
          <ListeKarti
            baslik="Yaklaşan vadeler"
            alt={yaklasan.length ? `${UPCOMING_DAYS} gün içinde ${money(yaklasanToplam)} tahsilat` : `Önümüzdeki ${UPCOMING_DAYS} gün`}
            bos={`Önümüzdeki ${UPCOMING_DAYS} günde vadesi gelen taksit yok.`}
            href="/panel/finance"
            hrefEtiket="Müşterilere git"
            sayi={yaklasan.length}
          >
            {yaklasan.slice(0, GENEL_BAKIS_SATIR).map((v) => {
              const left = dayDiff(today, v.due);
              return (
                <ListeSatiri
                  key={v.id}
                  href={v.href}
                  baslik={v.ad}
                  alt={`${money(v.kalan)} · ${v.installmentNo}. taksit · vade ${shortDate(v.due)}`}
                  sag={<span className="status-pill" data-tone={left <= 2 ? "warning" : "info"}>{left === 0 ? "Bugün" : `${left} gün kaldı`}</span>}
                />
              );
            })}
          </ListeKarti>
        ) : (
          <ListeKarti
            baslik="Bekleyen ödeme bağlantıları"
            alt={`Önümüzdeki ${UPCOMING_DAYS} günde vade yok · ${bekleyenLinkSayisi} bağlantı ödenmedi`}
            bos="Bekleyen ödeme bağlantısı yok."
            href="/panel/finance"
            hrefEtiket="Müşterilere git"
            sayi={bekleyenLinkSayisi}
          >
            {bekleyenLinkler.map((link) => (
              <ListeSatiri
                key={link.id}
                href={link.party_id ? `/panel/finance/musteri/${link.party_id}?pencere=cari` : "/panel/finance"}
                baslik={(link.party_id && hesapAdi.get(link.party_id)) || "Müşteri"}
                alt={link.note || "Ödeme bağlantısı"}
                sag={<span className="status-pill" data-tone="info">{money(link.amount)}</span>}
                zaman={daysAgoLabel(link.created_at.slice(0, 10), today)}
              />
            ))}
          </ListeKarti>
        )}

        <ListeKarti
          baslik="Borcu olan müşteriler"
          alt={openAccounts.length ? `${openAccounts.length} müşteride ${money(totals.balance)}` : "Tahsilat bekleyen müşteri yok"}
          bos="Bütün müşterilerin hesabı kapalı."
          href="/panel/finance"
          hrefEtiket="Tümünü gör"
          sayi={openAccounts.length}
        >
          {openAccounts.slice(0, GENEL_BAKIS_SATIR).map((account) => (
            <ListeSatiri
              key={account.id}
              href={`/panel/finance/musteri/${account.id}`}
              baslik={hesapAdi.get(account.id) ?? account.name}
              alt={`Sözleşme ${money(account.debt)} · tahsil edilen ${money(account.collections)}`}
              sag={<span className="status-pill" data-tone="warning">{money(account.balance)}</span>}
            />
          ))}
        </ListeKarti>

        <ListeKarti
          baslik="Son tahsilatlar"
          alt={monthCollections ? `Bu ay ${monthCredits.length} ödeme · ${money(monthCollections)}` : "Müşterilere işlenen son ödemeler"}
          bos="Henüz tahsilat kaydı yok. Müşteriler listesinden “Tahsilat” ile eklenir."
          href="/panel/finance"
          hrefEtiket="Müşterilere git"
          sayi={credits.length}
        >
          {credits.map((row) => (
            <ListeSatiri
              key={row.id}
              href={`/panel/finance/musteri/${row.party_id}`}
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
