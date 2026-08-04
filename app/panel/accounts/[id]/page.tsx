import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { createEntry, deleteEntry, updateEntry } from "../actions";
import { ConfirmDeleteButton } from "../confirm-delete-button";
import "../../crm/crm.css";
import "./party-detail.css";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);
const partyTypeLabel: Record<string, string> = { customer: "MÜŞTERİ", supplier: "TEDARİKÇİ", both: "MÜŞTERİ / TEDARİKÇİ" };

type Party = { id: string; name: string; party_type: string; tax_number: string | null; tax_office: string | null; email: string | null; phone: string | null };
type Entry = { id: string; entry_type: "debit" | "credit"; source_type: string; amount: number; description: string; reference_no: string | null; transaction_date: string; due_date: string | null };

export default async function PartyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "accounts")) throw new Error("Cari hesap modülüne erişiminiz yok.");
  const canManage = ["owner", "admin"].includes(membership.role);

  const [{ data: partyRow, error: partyError }, { data: entryData, error: entryError }] = await Promise.all([
    supabase.from("account_parties").select("id,name,party_type,tax_number,tax_office,email,phone").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("account_entries").select("id,entry_type,source_type,amount,description,reference_no,transaction_date,due_date").eq("party_id", id).eq("organization_id", membership.organization_id).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (partyError) throw new Error("Cari okunamadı: " + partyError.message);
  if (!partyRow) notFound();
  const party = partyRow as Party;
  if (entryError) throw new Error("Cari hareketleri okunamadı: " + entryError.message);

  const entries = (entryData ?? []) as Entry[];
  const debitTotal = entries.filter((e) => e.entry_type === "debit").reduce((sum, e) => sum + Number(e.amount), 0);
  const creditTotal = entries.filter((e) => e.entry_type === "credit").reduce((sum, e) => sum + Number(e.amount), 0);
  const balance = debitTotal - creditTotal;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">CARİ HESAPLAR / DETAY</small>
        <h1>{party.name}</h1>
        <p>{partyTypeLabel[party.party_type] ?? party.party_type}{party.tax_number ? ` · VN: ${party.tax_number}` : ""}{party.phone ? ` · ${party.phone}` : ""}{party.email ? ` · ${party.email}` : ""}</p>
      </div>
      <div className="panel-page-actions">
        <Link className="panel-secondary" href="/panel/finance?tab=cari">← Cari listesine dön</Link>
        {canManage ? <PanelDrawer triggerLabel="+ Yeni hareket" title="Yeni cari hareketi" description={`${party.name} için borç veya alacak hareketi ekleyin.`}>
          <form className="panel-form" action={createEntry}>
            <input type="hidden" name="party_id" value={party.id} />
            <label>Hareket<select name="entry_type"><option value="debit">Borçlandır</option><option value="credit">Alacaklandır</option></select></label>
            <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Tarih<input name="transaction_date" type="date" /></label><label>Vade<input name="due_date" type="date" /></label>
            <label>Referans<input name="reference_no" /></label><label className="wide">Açıklama<input name="description" required minLength={2} maxLength={500} /></label>
            <div className="form-actions wide"><button className="panel-primary" type="submit">Hareketi kaydet</button></div>
          </form>
        </PanelDrawer> : null}
      </div>
    </div>

    <section className="metric-strip">
      <article><div><small>TOPLAM BORÇ</small><strong>{money(debitTotal)}</strong><p>Borçlandırma toplamı</p></div></article>
      <article><div><small>TOPLAM ALACAK</small><strong>{money(creditTotal)}</strong><p>Alacaklandırma toplamı</p></div></article>
      <article><div><small>NET BAKİYE</small><strong>{money(Math.abs(balance))}</strong><p>{balance >= 0 ? "Bize borçlu" : "Bizim borcumuz"}</p></div></article>
      <article><div><small>HAREKET SAYISI</small><strong>{entries.length}</strong><p>Toplam kayıt</p></div></article>
    </section>

    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">HAREKET DÖKÜMÜ</small><h2>Tüm hareketler</h2></div></div>
      {entries.length ? (
        <div className="party-entry-list">
          {entries.map((entry) => (
            <article key={entry.id} className="party-entry-row">
              <div className="party-entry-main">
                <span className={`status-pill ${entry.entry_type === "debit" ? "pill-debit" : "pill-credit"}`}>{entry.entry_type === "debit" ? "Borç" : "Alacak"}</span>
                <div>
                  <b>{entry.description}</b>
                  <small>{new Date(entry.transaction_date + "T00:00:00").toLocaleDateString("tr-TR")}{entry.due_date ? ` · Vade: ${new Date(entry.due_date + "T00:00:00").toLocaleDateString("tr-TR")}` : ""}{entry.reference_no ? ` · Ref: ${entry.reference_no}` : ""}</small>
                </div>
              </div>
              <strong className={entry.entry_type === "debit" ? "party-amount-debit" : "party-amount-credit"}>{entry.entry_type === "debit" ? "+" : "-"}{money(Number(entry.amount))}</strong>
              {canManage ? (
                <div className="party-entry-actions">
                  <span className="entry-edit-trigger">
                    <PanelDrawer triggerLabel="Düzenle" title="Hareketi düzenle" description={party.name}>
                      <form className="panel-form" action={updateEntry}>
                        <input type="hidden" name="entry_id" value={entry.id} />
                        <input type="hidden" name="party_id" value={party.id} />
                        <label>Hareket<select name="entry_type" defaultValue={entry.entry_type}><option value="debit">Borçlandır</option><option value="credit">Alacaklandır</option></select></label>
                        <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={(entry.amount / 100).toString()} /></label>
                        <label>Tarih<input name="transaction_date" type="date" defaultValue={entry.transaction_date} /></label>
                        <label>Vade<input name="due_date" type="date" defaultValue={entry.due_date ?? ""} /></label>
                        <label>Referans<input name="reference_no" defaultValue={entry.reference_no ?? ""} /></label>
                        <label className="wide">Açıklama<input name="description" required minLength={2} maxLength={500} defaultValue={entry.description} /></label>
                        <div className="form-actions wide"><button className="panel-primary" type="submit">Kaydet</button></div>
                      </form>
                    </PanelDrawer>
                  </span>
                  <form action={deleteEntry}>
                    <input type="hidden" name="entry_id" value={entry.id} />
                    <input type="hidden" name="party_id" value={party.id} />
                    <ConfirmDeleteButton label="Sil" confirmMessage={`"${entry.description}" hareketini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`} />
                  </form>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : <p className="panel-empty">Bu cari için henüz hareket kaydı yok.</p>}
    </section>
  </div>;
}
