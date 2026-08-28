import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import {
  createAdditionalService,
  createCollection,
  createRefund,
} from "../accounts/actions";
import "./finance.css";

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
type Contract = {
  id: string;
  party_id: string | null;
  amount: number;
  status: string;
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ arama?: string; durum?: string }>;
}) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (
    !modules.some((m) => m.code === "finance") ||
    !modules.some((m) => m.code === "accounts")
  )
    throw new Error("Finans ve cari hesap modülü erişimi gerekli.");
  const [{ data, error }, { data: contractData, error: contractError }] =
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
        .select("id,party_id,amount,status")
        .eq("organization_id", membership.organization_id)
        .in("status", ["signed", "completed"]),
    ]);
  if (error) throw new Error("Cari hesaplar okunamadı: " + error.message);
  if (contractError)
    throw new Error("Sözleşme bakiyeleri okunamadı: " + contractError.message);
  const contractTotals = new Map<string, number>();
  for (const contract of (contractData ?? []) as Contract[])
    if (contract.party_id)
      contractTotals.set(
        contract.party_id,
        (contractTotals.get(contract.party_id) ?? 0) + Number(contract.amount),
      );

  const accounts = ((data ?? []) as Party[]).map((party) => {
    const entries = [...(party.account_entries ?? [])].sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date),
    );
    const ledgerDebt = entries
      .filter((e) => e.entry_type === "debit" && e.source_type !== "adjustment")
      .reduce((s, e) => s + Number(e.amount), 0);
    const additionalServices = entries
      .filter(
        (e) =>
          e.entry_type === "debit" &&
          e.source_type === "manual" &&
          e.description.startsWith("Ek hizmet ·"),
      )
      .reduce((s, e) => s + Number(e.amount), 0);
    const debt = contractTotals.has(party.id)
      ? (contractTotals.get(party.id) ?? 0) + additionalServices
      : ledgerDebt;
    const recordedCollections = entries
      .filter((e) => e.entry_type === "credit")
      .reduce((s, e) => s + Number(e.amount), 0);
    const refunds = entries
      .filter((e) => e.entry_type === "debit" && e.source_type === "adjustment")
      .reduce((s, e) => s + Number(e.amount), 0);
    const collections = Math.min(recordedCollections, debt + refunds);
    return {
      ...party,
      entries,
      debt,
      collections,
      refunds,
      balance: Math.max(0, debt + refunds - collections),
    };
  });
  const totals = accounts.reduce(
    (r, a) => ({
      debt: r.debt + a.debt,
      collections: r.collections + a.collections,
      refunds: r.refunds + a.refunds,
      balance: r.balance + a.balance,
    }),
    { debt: 0, collections: 0, refunds: 0, balance: 0 },
  );
  const query = (params.arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const filtered = accounts.filter(
    (a) =>
      (!query ||
        [a.name, a.email, a.phone, a.tax_number]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR")
          .includes(query)) &&
      (params.durum === "acik"
        ? a.balance > 0
        : params.durum === "kapali"
          ? a.balance === 0
          : true),
  );

  return (
    <main className="finance-ledger-page">
      <header className="panel-pagehead finance-ledger-head">
        <div>
          <small className="panel-kicker">FİNANS</small>
          <h1>Cari Hesaplar</h1>
          <p>Sözleşme borçları, tahsilatlar ve iadeler tek ekranda.</p>
        </div>
        <span className="status-pill">{accounts.length} müşteri</span>
      </header>
      <section className="finance-ledger-summary" aria-label="Cari hesap özeti">
        <article>
          <span>Sözleşme toplamı</span>
          <strong>{money(totals.debt)}</strong>
          <small>Otomatik oluşan borç</small>
        </article>
        <article>
          <span>Toplam tahsilat</span>
          <strong>{money(totals.collections)}</strong>
          <small>Müşterilerden alınan</small>
        </article>
        <article>
          <span>Toplam iade</span>
          <strong>{money(totals.refunds)}</strong>
          <small>Müşteriye geri ödenen</small>
        </article>
        <article className="is-primary">
          <span>Açık bakiye</span>
          <strong>{money(totals.balance)}</strong>
          <small>Tahsil edilecek toplam</small>
        </article>
      </section>
      <form className="finance-ledger-filter">
        <input
          name="arama"
          defaultValue={params.arama}
          placeholder="Müşteri, telefon veya vergi no ara…"
        />
        <select name="durum" defaultValue={params.durum ?? "tumu"}>
          <option value="tumu">Tüm cariler</option>
          <option value="acik">Açık bakiyesi olanlar</option>
          <option value="kapali">Bakiyesi kapananlar</option>
        </select>
        <button>Filtrele</button>
      </form>
      <section className="finance-ledger-list">
        {filtered.map((a) => (
          <article className="finance-ledger-account" key={a.id}>
            <Link
              className="finance-ledger-customer"
              href={`/panel/accounts/${a.id}`}
            >
              <span className="finance-ledger-avatar">
                {a.name.slice(0, 2).toLocaleUpperCase("tr-TR")}
              </span>
              <div>
                <h2>{a.name}</h2>
                <p>
                  {a.phone || a.email || a.tax_number || "Müşteri cari hesabı"}
                </p>
              </div>
            </Link>
            <div className="finance-ledger-numbers">
              <span>
                <small>Sözleşme</small>
                <b>{money(a.debt)}</b>
              </span>
              <span>
                <small>Tahsilat</small>
                <b>{money(a.collections)}</b>
              </span>
              <span>
                <small>İade</small>
                <b>{money(a.refunds)}</b>
              </span>
            </div>
            <div className="finance-ledger-balance">
              <small>Kalan bakiye</small>
              <strong>{money(a.balance)}</strong>
              <span className={a.balance > 0 ? "is-open" : "is-closed"}>
                {a.balance > 0 ? "Tahsilat bekliyor" : "Kapandı"}
              </span>
            </div>
            <div className="finance-ledger-actions">
              <PanelDrawer
                triggerLabel="+ Tahsilat Ekle"
                title={`${a.name} · Tahsilat`}
                description={`Açık bakiye: ${money(a.balance)}`}
              >
                <form className="panel-form" action={createCollection}>
                  <input type="hidden" name="party_id" value={a.id} />
                  <label>
                    Tahsilat tutarı
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max={a.balance / 100}
                      step="0.01"
                      required
                    />
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
                    <input
                      name="description"
                      defaultValue="Müşteri tahsilatı"
                      minLength={2}
                      maxLength={500}
                      required
                    />
                  </label>
                  <div className="form-actions wide">
                    <button
                      className="panel-primary"
                      disabled={a.balance === 0}
                    >
                      Tahsilatı kaydet
                    </button>
                  </div>
                </form>
              </PanelDrawer>
              <PanelDrawer
                triggerLabel="Ek Hizmet"
                title={`${a.name} · Ek Hizmet`}
                description="Yeni hizmeti cari bakiyeye ekleyin."
              >
                <form className="panel-form" action={createAdditionalService}>
                  <input type="hidden" name="party_id" value={a.id} />
                  <label>
                    Hizmet tutarı
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    İşlem tarihi
                    <input name="transaction_date" type="date" />
                  </label>
                  <label>
                    Vade tarihi
                    <input name="due_date" type="date" />
                  </label>
                  <label>
                    Referans
                    <input name="reference_no" maxLength={100} />
                  </label>
                  <label className="wide">
                    Hizmet açıklaması
                    <input
                      name="description"
                      minLength={2}
                      maxLength={500}
                      required
                    />
                  </label>
                  <div className="form-actions wide">
                    <button className="panel-primary">Cari hesaba ekle</button>
                  </div>
                </form>
              </PanelDrawer>
              <PanelDrawer
                triggerLabel="İade İşlemi"
                title={`${a.name} · İade`}
                description={`İade edilebilir: ${money(Math.max(0, a.collections - a.refunds))}`}
              >
                <form className="panel-form" action={createRefund}>
                  <input type="hidden" name="party_id" value={a.id} />
                  <label>
                    İade tutarı
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max={Math.max(0, a.collections - a.refunds) / 100}
                      step="0.01"
                      required
                    />
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
                    İade nedeni
                    <input
                      name="description"
                      minLength={2}
                      maxLength={500}
                      required
                    />
                  </label>
                  <div className="form-actions wide">
                    <button
                      className="panel-primary"
                      disabled={a.collections <= a.refunds}
                    >
                      İadeyi kaydet
                    </button>
                  </div>
                </form>
              </PanelDrawer>
              <Link
                className="panel-secondary"
                href={`/panel/accounts/${a.id}`}
              >
                Hareketler
              </Link>
            </div>
          </article>
        ))}
        {!filtered.length ? (
          <div className="panel-empty">
            <h2>Cari hesap bulunamadı</h2>
            <p>Arama veya filtre ölçütünü değiştirin.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
