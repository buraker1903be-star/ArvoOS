import { getPanelContext } from "@/lib/panel-context";
import { createEntry, createParty } from "./actions";

const money = (amount: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount / 100);

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
    const debit = (party.account_entries ?? []).filter((e) => e.entry_type === "debit").reduce((s,e) => s + Number(e.amount), 0);
    const credit = (party.account_entries ?? []).filter((e) => e.entry_type === "credit").reduce((s,e) => s + Number(e.amount), 0);
    return { ...party, balance: debit - credit };
  });
  const receivable = totals.filter((p) => p.balance > 0).reduce((s,p) => s + p.balance, 0);
  const payable = totals.filter((p) => p.balance < 0).reduce((s,p) => s + Math.abs(p.balance), 0);

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">CARİ HESAPLAR</small><h1>Müşteri ve tedarikçi bakiyeleri</h1><p>Borç, alacak ve hareketleri kurum bazında tek ekrandan yönetin.</p></div></div>
    <section className="metric-strip">
      <article><div><small>TOPLAM CARİ</small><strong>{totals.length}</strong><p>Aktif müşteri ve tedarikçi</p></div></article>
      <article><div><small>ALACAK</small><strong>{money(receivable)}</strong><p>Müşterilerden tahsil edilecek</p></div></article>
      <article><div><small>BORÇ</small><strong>{money(payable)}</strong><p>Tedarikçilere ödenecek</p></div></article>
      <article><div><small>NET BAKİYE</small><strong>{money(receivable - payable)}</strong><p>Cari pozisyon</p></div></article>
    </section>

    <section className="panel-card"><h3>Yeni cari kart</h3><form className="panel-form" action={createParty}>
      <label>Cari adı<input name="name" required minLength={2} maxLength={180} /></label>
      <label>Tür<select name="party_type"><option value="customer">Müşteri</option><option value="supplier">Tedarikçi</option><option value="both">Her ikisi</option></select></label>
      <label>Vergi no<input name="tax_number" /></label><label>Vergi dairesi<input name="tax_office" /></label>
      <label>E-posta<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label>
      <button className="panel-primary" type="submit">Cari kart oluştur</button>
    </form></section>

    <section className="panel-card"><h3>Yeni cari hareket</h3><form className="panel-form" action={createEntry}>
      <label>Cari<select name="party_id" required>{totals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Hareket<select name="entry_type"><option value="debit">Borçlandır</option><option value="credit">Alacaklandır</option></select></label>
      <label>Tutar<input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label>Tarih<input name="transaction_date" type="date" /></label><label>Vade<input name="due_date" type="date" /></label>
      <label>Referans<input name="reference_no" /></label><label>Açıklama<input name="description" required minLength={2} maxLength={500} /></label>
      <button className="panel-primary" type="submit">Hareket ekle</button>
    </form></section>

    <section className="panel-modules">{totals.map((party) => <article className="panel-card" key={party.id}><small>{party.party_type === "supplier" ? "TEDARİKÇİ" : party.party_type === "both" ? "MÜŞTERİ / TEDARİKÇİ" : "MÜŞTERİ"}</small><h3>{party.name}</h3><p>{party.tax_number || "Vergi no girilmemiş"}</p><strong>{money(party.balance)}</strong><small>{party.balance >= 0 ? "alacak bakiyesi" : "borç bakiyesi"}</small></article>)}</section>
  </>;
}