import { getPanelContext } from "@/lib/panel-context";
import { createEntry, createParty } from "./actions";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount / 100);

type Entry = { id:string; party_id:string; entry_type:string; amount:number; description:string; transaction_date:string };
type Party = { id:string; name:string; party_type:string; tax_number:string|null; account_entries:Entry[] };

export default async function AccountsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "accounts")) throw new Error("Cari hesap modülüne erişiminiz yok.");
  const { data, error } = await supabase.from("account_parties")
    .select("id,name,party_type,tax_number,account_entries(id,party_id,entry_type,amount,description,transaction_date)")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error("Cari hesaplar okunamadı: " + error.message);

  const parties = (data ?? []) as Party[];
  const totals = parties.map((party) => {
    const debit = (party.account_entries ?? []).filter((entry) => entry.entry_type === "debit").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credit = (party.account_entries ?? []).filter((entry) => entry.entry_type === "credit").reduce((sum, entry) => sum + Number(entry.amount), 0);
    return { ...party, balance: debit - credit };
  });
  const receivable = totals.filter((party) => party.balance > 0).reduce((sum, party) => sum + party.balance, 0);
  const payable = totals.filter((party) => party.balance < 0).reduce((sum, party) => sum + Math.abs(party.balance), 0);

  return <>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">FİNANS</small><h1>Cari hesaplar</h1><p>Müşteri ve tedarikçi bakiyelerini takip edin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{totals.length} cari</span></div>
    </div>

    <section className="metric-strip">
      <article><div><small>ALACAK</small><strong>{money(receivable)}</strong><p>Tahsil edilecek</p></div></article>
      <article><div><small>BORÇ</small><strong>{money(payable)}</strong><p>Ödenecek</p></div></article>
      <article><div><small>NET BAKİYE</small><strong>{money(receivable - payable)}</strong><p>Toplam pozisyon</p></div></article>
      <article><div><small>AKTİF CARİ</small><strong>{totals.length}</strong><p>Müşteri ve tedarikçi</p></div></article>
    </section>

    <div className="panel-action-row">
      <details className="panel-card panel-action-details"><summary>+ Yeni cari</summary><form className="panel-form" action={createParty}>
        <label>Cari adı<input name="name" required minLength={2} maxLength={180} /></label>
        <label>Tür<select name="party_type"><option value="customer">Müşteri</option><option value="supplier">Tedarikçi</option><option value="both">Her ikisi</option></select></label>
        <label>Vergi no<input name="tax_number" /></label><label>Vergi dairesi<input name="tax_office" /></label>
        <label>E-posta<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label>
        <div className="form-actions wide"><button className="panel-primary" type="submit">Cariyi kaydet</button></div>
      </form></details>
      <details className="panel-card panel-action-details"><summary>+ Yeni hareket</summary><form className="panel-form" action={createEntry}>
        <label>Cari<select name="party_id" required>{totals.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
        <label>Hareket<select name="entry_type"><option value="debit">Borçlandır</option><option value="credit">Alacaklandır</option></select></label>
        <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Tarih<input name="transaction_date" type="date" /></label><label>Vade<input name="due_date" type="date" /></label>
        <label>Referans<input name="reference_no" /></label><label className="wide">Açıklama<input name="description" required minLength={2} maxLength={500} /></label>
        <div className="form-actions wide"><button className="panel-primary" type="submit">Hareketi kaydet</button></div>
      </form></details>
    </div>

    <div className="section-heading"><div><small className="panel-kicker">CARİ LİSTESİ</small><h2>Bakiyeler</h2></div></div>
    <section className="panel-modules">{totals.map((party) => <article className="panel-card account-summary-card" key={party.id}>
      <small>{party.party_type === "supplier" ? "TEDARİKÇİ" : party.party_type === "both" ? "MÜŞTERİ / TEDARİKÇİ" : "MÜŞTERİ"}</small>
      <h3>{party.name}</h3><p>{party.tax_number || "Vergi numarası yok"}</p>
      <strong>{money(Math.abs(party.balance))}</strong><span>{party.balance >= 0 ? "Alacak" : "Borç"}</span>
    </article>)}{!totals.length ? <div className="panel-card panel-empty">Henüz cari kart yok.</div> : null}</section>
  </>;
}