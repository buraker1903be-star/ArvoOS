import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import {
  createAdditionalService,
  createCollection,
  createRefund,
} from "../actions";
import { FinEmpty, FinIcon, FinWidget, type FinTone } from "../../finance/finance-ui";
import "../../finance/finance.css";

const money = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    n / 100,
  );
const date = (v: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(v));
type Entry = {
  id: string;
  entry_type: "debit" | "credit";
  amount: number;
  description: string;
  reference_no: string | null;
  source_type: string | null;
  transaction_date: string;
  created_at: string;
};
type Party = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_number: string | null;
  tax_office: string | null;
  account_entries: Entry[];
};
type Contract = {
  id: string;
  contract_no: string;
  title: string;
  amount: number;
  status: string;
  signed_at: string | null;
};

// Hareketin türü ve rozet tonu (etiket kuralı öncekiyle aynı)
function entryKind(e: Entry): { label: string; tone: FinTone } {
  if (e.source_type === "adjustment") return { label: "İade", tone: "warning" };
  if (e.entry_type === "credit") return { label: "Tahsilat", tone: "success" };
  if (e.source_type === "manual" && e.description.startsWith("Ek hizmet ·"))
    return { label: "Ek Hizmet", tone: "gold" };
  return { label: "Sözleşme", tone: "info" };
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((m) => m.code === "accounts"))
    throw new Error("Cari hesap modülüne erişiminiz yok.");
  const [{ data: party, error }, { data: contracts, error: contractError }] =
    await Promise.all([
      supabase
        .from("account_parties")
        .select(
          "id,name,email,phone,tax_number,tax_office,account_entries(id,entry_type,amount,description,reference_no,source_type,transaction_date,created_at)",
        )
        .eq("id", id)
        .eq("organization_id", membership.organization_id)
        .maybeSingle(),
      supabase
        .from("crm_contracts")
        .select("id,contract_no,title,amount,status,signed_at")
        .eq("party_id", id)
        .eq("organization_id", membership.organization_id)
        .in("status", ["signed", "completed"])
        .order("created_at", { ascending: false }),
    ]);
  if (error || !party) notFound();
  if (contractError)
    throw new Error("Sözleşmeler okunamadı: " + contractError.message);
  const current = party as Party;
  const entries = [...(current.account_entries ?? [])].sort(
    (a, b) =>
      b.transaction_date.localeCompare(a.transaction_date) ||
      b.created_at.localeCompare(a.created_at),
  );
  const contractDebt = (contracts ?? []).reduce(
    (sum, c) => sum + Number(c.amount),
    0,
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
  const debt = contractDebt ? contractDebt + additionalServices : ledgerDebt;
  const recorded = entries
    .filter((e) => e.entry_type === "credit")
    .reduce((s, e) => s + Number(e.amount), 0);
  const refunds = entries
    .filter((e) => e.entry_type === "debit" && e.source_type === "adjustment")
    .reduce((s, e) => s + Number(e.amount), 0);
  const collections = Math.min(recorded, debt + refunds);
  const balance = Math.max(0, debt + refunds - collections);
  const refundable = Math.max(0, collections - refunds);
  return (
    <main className="fin">
      <header className="panel-pagehead">
        <div>
          <small className="panel-kicker">CARİ HESAP</small>
          <h1>{current.name}</h1>
          <p>
            {[current.phone, current.email, current.tax_number]
              .filter(Boolean)
              .join(" · ") || "Müşteri cari hareket dökümü"}
          </p>
        </div>
        <div className="panel-page-actions">
          <Link className="panel-secondary" href="/panel/finance">
            <FinIcon name="back" size={16} />
            Cari hesaplar
          </Link>
          <PanelDrawer
            triggerLabel="Ek hizmet"
            triggerClassName="panel-secondary"
            kicker="EK HİZMET"
            title={`${current.name} · Ek Hizmet`}
            description="Yeni hizmeti cari bakiyeye ekleyin."
          >
            <form className="panel-form fin-form" action={createAdditionalService}>
              <input type="hidden" name="party_id" value={id} />
              <label>
                Hizmet tutarı (₺)
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
                <input name="reference_no" />
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
              <div className="panel-form-actions wide">
                <button className="panel-primary">Cari hesaba ekle</button>
              </div>
            </form>
          </PanelDrawer>
          <PanelDrawer
            triggerLabel="İade"
            triggerClassName="panel-secondary"
            kicker="İADE"
            title={`${current.name} · İade`}
            description={`İade edilebilir: ${money(refundable)}`}
          >
            <form className="panel-form fin-form" action={createRefund}>
              <input type="hidden" name="party_id" value={id} />
              <label>
                İade tutarı (₺)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={refundable / 100}
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
                <input name="reference_no" />
              </label>
              <label className="wide">
                İade nedeni
                <input name="description" required />
              </label>
              {collections <= refunds ? (
                <p className="fin-form-note">İade edilebilecek tahsilat yok.</p>
              ) : null}
              <div className="panel-form-actions wide">
                <button
                  className="panel-primary"
                  disabled={collections <= refunds}
                >
                  İadeyi kaydet
                </button>
              </div>
            </form>
          </PanelDrawer>
          <PanelDrawer
            triggerLabel="+ Tahsilat"
            kicker="TAHSİLAT"
            title={`${current.name} · Tahsilat`}
            description={`Açık bakiye: ${money(balance)}`}
          >
            <form className="panel-form fin-form" action={createCollection}>
              <input type="hidden" name="party_id" value={id} />
              <label>
                Tahsilat tutarı (₺)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={balance / 100}
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
                <input name="reference_no" />
              </label>
              <label className="wide">
                Açıklama
                <input
                  name="description"
                  defaultValue="Müşteri tahsilatı"
                  required
                />
              </label>
              <p className="fin-form-note">
                {balance
                  ? `En fazla açık bakiye kadar (${money(balance)}) tahsilat kaydedebilirsiniz.`
                  : "Bu carinin açık bakiyesi yok; yeni tahsilat kaydedilemez."}
              </p>
              <div className="panel-form-actions wide">
                <button className="panel-primary" disabled={!balance}>
                  Tahsilatı kaydet
                </button>
              </div>
            </form>
          </PanelDrawer>
        </div>
      </header>

      <section className="fin-widgets" aria-label="Cari özeti">
        <FinWidget tone="brand" icon="doc" label="Sözleşme toplamı" value={money(debt)} note={`${contracts?.length ?? 0} imzalı sözleşme`} />
        <FinWidget tone="success" icon="wallet" label="Toplam tahsilat" value={money(collections)} note="Bakiyeye uygulanan" />
        <FinWidget tone="warning" icon="refund" label="Toplam iade" value={money(refunds)} note="Müşteriye geri ödenen" />
        <FinWidget tone={balance > 0 ? "gold" : "success"} icon="scale" label="Açık bakiye" value={money(balance)} note={balance > 0 ? "Tahsilat bekliyor" : "Cari kapandı"} emphasis />
      </section>

      <section className="fin-card" aria-label="Hareket dökümü">
        <header className="fin-card-head">
          <div>
            <h2>Hareket dökümü</h2>
            <p>Bu cariye ait tüm borç, tahsilat ve iade hareketleri.</p>
          </div>
          <span className="status-pill">{entries.length} hareket</span>
        </header>
        {entries.length ? (
          <div className="fin-table-wrap">
            <table className="fin-table" data-cols="statement">
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">İşlem</th>
                  <th scope="col">Açıklama</th>
                  <th scope="col">Referans</th>
                  <th scope="col" className="fin-num">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const kind = entryKind(e);
                  return (
                    <tr key={e.id}>
                      <td data-label="Tarih">{date(e.transaction_date)}</td>
                      <td data-label="İşlem">
                        <span className="status-pill" data-tone={kind.tone}>{kind.label}</span>
                      </td>
                      <td className="fin-col-wide" data-label="Açıklama">{e.description}</td>
                      <td className={e.reference_no ? undefined : "fin-muted"} data-label="Referans">{e.reference_no || "—"}</td>
                      <td
                        className={e.entry_type === "credit" ? "fin-num fin-pos" : "fin-num"}
                        data-label="Tutar"
                      >
                        {e.entry_type === "credit" ? "−" : "+"}
                        {money(Number(e.amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <FinEmpty icon="receipt" title="Henüz cari hareket yok">
            Tahsilat, ek hizmet ve iade kayıtları burada tarih sırasıyla görünür.
          </FinEmpty>
        )}
      </section>

      {(contracts ?? []).length ? (
        <section className="fin-card" aria-label="Sözleşmeler">
          <header className="fin-card-head">
            <div>
              <h2>Bakiyeyi oluşturan sözleşmeler</h2>
              <p>İmzalı ve tamamlanan sözleşmeler.</p>
            </div>
            <span className="status-pill">{money(contractDebt)}</span>
          </header>
          <ul className="fin-rows">
            {(contracts as Contract[]).map((c) => (
              <li className="fin-row" key={c.id}>
                <span className="fin-row-icon" data-tone="info"><FinIcon name="doc" size={17} /></span>
                <span className="fin-entity-text">
                  <b>{c.contract_no}</b>
                  <small>
                    {c.title} · {c.signed_at ? date(c.signed_at) : "İmzalı"}
                  </small>
                </span>
                <strong>{money(Number(c.amount))}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
