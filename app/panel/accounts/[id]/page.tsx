import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPhone } from "@/lib/format-phone";
import { PanelDrawer } from "../../components/panel-drawer";
import {
  createAdditionalService,
  createCollection,
  createRefund,
  deleteParty,
} from "../actions";
import { ConfirmDeleteButton } from "../confirm-delete-button";
import { cariDurumu } from "@/lib/cari-arsiv";
import { type FinTone } from "../../finance/finance-ui";
import "../../finance/finance.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  CARİ HESAP (MÜŞTERİ) DETAYI (2026-10): talep, teklif, sözleşme ve iş
  detayıyla aynı iskelet.

  Üstte müşterinin adı, asıl işlem "Tahsilat" ve "⋯" menüsü (ek hizmet,
  iade, sil); altında bakiye şeridi (borç, tahsilat, iade, açık bakiye ve
  tahsil oranı). Solda müşteri, ortada hareket dökümü, sağda bakiyeyi
  oluşturan sözleşmeler ve bakiyenin nasıl hesaplandığı.

  Eskiden dört özet kutusu, altında sayfa genişliğinde hareket tablosu ve
  onun da altında sözleşmeler vardı; dört işlem düğmesi (silme dahil)
  başlıkta yan yana duruyordu.
*/

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

const DURUM: Record<string, { ad: string; ton: string }> = {
  acik: { ad: "Açık bakiye", ton: "warning" },
  arsiv: { ad: "Kapandı · arşivde", ton: "neutral" },
  hareketsiz: { ad: "Hareket yok", ton: "neutral" },
};

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, membership, modules, isPlatformOwner, izin } = await getPanelContext();
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
  const durum = cariDurumu({ debt, collections, refunds, balance });
  // Silme yıkıcı: hareket dökümünü de götürür (CASCADE). Sunucu eylemi
  // ayrıca denetliyor; buradaki kontrol düğmeyi boşuna göstermemek için.
  const canDelete = isPlatformOwner || izin("finance.cari.sil");
  // Sözleşmeye bağlantı yalnızca CRM'i olana: yoksa sayfa hata verirdi.
  const crmVar = modules.some((m) => m.code === "crm");
  const tahsilOrani = debt + refunds > 0 ? Math.round((collections / (debt + refunds)) * 100) : 0;
  const durumBilgisi = DURUM[durum] ?? DURUM.hareketsiz;
  const basHarf = current.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("");

  return (
    <main className="talep cari">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">CARİ HESAP</small>
          <h1>{current.name}</h1>
        </div>
        <div className="talep-bas-eylem">
          <PanelDrawer
            triggerLabel="Tahsilat"
            kicker="TAHSİLAT"
            title={`${current.name} · Tahsilat`}
            description={`Açık bakiye: ${money(balance)}`}
          >
            <form className="panel-form fin-form" action={createCollection}>
              <input type="hidden" name="party_id" value={id} />
              <label>
                Tahsilat tutarı (₺)
                <input name="amount" type="number" min="0.01" max={balance / 100} step="0.01" required />
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
                <input name="description" defaultValue="Müşteri tahsilatı" required />
              </label>
              <p className="fin-form-note">
                {balance
                  ? `En fazla açık bakiye kadar (${money(balance)}) tahsilat kaydedebilirsiniz.`
                  : "Bu carinin açık bakiyesi yok; yeni tahsilat kaydedilemez."}
              </p>
              <div className="panel-form-actions wide">
                <button className="panel-primary" disabled={!balance}>Tahsilatı kaydet</button>
              </div>
            </form>
          </PanelDrawer>
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              <PanelDrawer
                triggerLabel="Ek hizmet"
                triggerClassName="os-menu-item"
                kicker="EK HİZMET"
                title={`${current.name} · Ek Hizmet`}
                description="Yeni hizmeti cari bakiyeye ekleyin."
              >
                <form className="panel-form fin-form" action={createAdditionalService}>
                  <input type="hidden" name="party_id" value={id} />
                  <label>
                    Hizmet tutarı (₺)
                    <input name="amount" type="number" min="0.01" step="0.01" required />
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
                    <input name="description" minLength={2} maxLength={500} required />
                  </label>
                  <div className="panel-form-actions wide">
                    <button className="panel-primary">Cari hesaba ekle</button>
                  </div>
                </form>
              </PanelDrawer>
              <PanelDrawer
                triggerLabel="İade"
                triggerClassName="os-menu-item"
                kicker="İADE"
                title={`${current.name} · İade`}
                description={`İade edilebilir: ${money(refundable)}`}
              >
                <form className="panel-form fin-form" action={createRefund}>
                  <input type="hidden" name="party_id" value={id} />
                  <label>
                    İade tutarı (₺)
                    <input name="amount" type="number" min="0.01" max={refundable / 100} step="0.01" required />
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
                    <button className="panel-primary" disabled={collections <= refunds}>İadeyi kaydet</button>
                  </div>
                </form>
              </PanelDrawer>
              <Link className="os-menu-item" href="/panel/finance">Cari hesaplar</Link>
              {canDelete ? (
                <PanelDrawer triggerLabel="Cariyi sil" title="Cariyi sil" description="Silme geri alınamaz." triggerClassName="os-menu-item is-danger">
                  <div className="panel-danger-zone">
                    <small className="panel-kicker">KALICI İŞLEM</small>
                    <p>
                      Cari, {entries.length ? `${entries.length} hareketiyle birlikte ` : ""}kalıcı olarak silinir ve
                      raporlardan da düşer.
                    </p>
                    <form action={deleteParty}>
                      <input type="hidden" name="party_id" value={id} />
                      <ConfirmDeleteButton
                        label="Cariyi sil"
                        confirmMessage={
                          entries.length
                            ? `${current.name} ve ${entries.length} hareketi kalıcı olarak silinsin mi?`
                            : `${current.name} kalıcı olarak silinsin mi?`
                        }
                      />
                    </form>
                  </div>
                </PanelDrawer>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      {/* BAKİYE ŞERİDİ: diğer detaylardaki aşama çizgisinin yerinde. */}
      <section className="kayit-serit" aria-label="Cari özeti">
        <dl>
          <div><dt>Borç</dt><dd>{money(debt)}</dd></div>
          <div><dt>Tahsilat</dt><dd className="cari-arti">{money(collections)}</dd></div>
          <div><dt>İade</dt><dd>{money(refunds)}</dd></div>
          <div className="cari-bakiye" data-tone={balance > 0 ? "warning" : "success"}><dt>Açık bakiye</dt><dd>{money(balance)}</dd></div>
        </dl>
        <div className="cari-oran">
          <span>Tahsil edilen %{tahsilOrani}</span>
          <div className="cari-oran-cubuk" aria-hidden="true"><i style={{ "--p": `${tahsilOrani}%` } as CSSProperties} /></div>
        </div>
      </section>

      <div className="talep-izgara">
        <section className="panel-card talep-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{basHarf}</span>
            <div>
              <h2>{current.name}</h2>
              <small>Müşteri · cari hesap</small>
            </div>
          </div>
          {current.phone || current.email ? (
            <div className="talep-iletisim">
              {current.phone ? <a className="panel-secondary" href={`tel:${current.phone}`}>Ara</a> : null}
              {current.email ? <a className="panel-secondary" href={`mailto:${current.email}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste">
            <div><dt>Durum</dt><dd><span className="status-pill" data-tone={durumBilgisi.ton}>{durumBilgisi.ad}</span></dd></div>
            <div><dt>Telefon</dt><dd>{formatPhone(current.phone) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{current.email || <em>Yok</em>}</dd></div>
            <div><dt>Vergi no</dt><dd>{current.tax_number || <em>Yok</em>}</dd></div>
            <div><dt>Vergi dairesi</dt><dd>{current.tax_office || <em>Yok</em>}</dd></div>
          </dl>
        </section>

        <section className="panel-card talep-bilgi" aria-label="Hareket dökümü">
          <div className="cari-baslik">
            <h2>Hareket dökümü</h2>
            <small>{entries.length} hareket</small>
          </div>
          {entries.length ? (
            <ul className="cari-hareketler">
              {entries.map((e) => {
                const kind = entryKind(e);
                return (
                  <li key={e.id}>
                    <span className="status-pill" data-tone={kind.tone}>{kind.label}</span>
                    <span className="cari-hareket-metin">
                      <b>{e.description}</b>
                      <small>{date(e.transaction_date)}{e.reference_no ? ` · ${e.reference_no}` : ""}</small>
                    </span>
                    <strong className={e.entry_type === "credit" ? "cari-arti" : undefined}>
                      {e.entry_type === "credit" ? "−" : "+"}
                      {money(Number(e.amount))}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ic-akis-bos">Henüz cari hareket yok. Tahsilat, ek hizmet ve iade kayıtları burada tarih sırasıyla görünür.</p>
          )}
        </section>

        <section className="panel-card talep-bilgi cari-sag" aria-label="Sözleşmeler ve bakiye">
          <div className="cari-baslik">
            <h2>Sözleşmeler</h2>
            <small>{(contracts ?? []).length} imzalı</small>
          </div>
          {(contracts ?? []).length ? (
            <ul className="cari-hareketler">
              {(contracts as Contract[]).map((c) => {
                const icerik = (
                  <>
                    <span className="cari-hareket-metin">
                      <b>{c.contract_no}</b>
                      <small>{c.title} · {c.signed_at ? date(c.signed_at) : "İmzalı"}</small>
                    </span>
                    <strong>{money(Number(c.amount))}</strong>
                  </>
                );
                return (
                  <li key={c.id}>
                    {crmVar ? <Link href={`/panel/crm/contracts/${c.id}`}>{icerik}</Link> : icerik}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="talep-bos cari-not">Bu cariye bağlı imzalı sözleşme yok.</p>
          )}

          {/* Bakiyenin nasıl çıktığı: dört kutudaki sayıların ilişkisi
              ekranda yazmıyordu, "açık bakiye neden bu" sorusu kalıyordu. */}
          <div className="talep-not">
            <h3>Bakiye hesabı</h3>
            <dl className="talep-liste">
              {contractDebt ? <div><dt>Sözleşmeler</dt><dd>{money(contractDebt)}</dd></div> : null}
              {contractDebt && additionalServices ? <div><dt>+ Ek hizmetler</dt><dd>{money(additionalServices)}</dd></div> : null}
              <div><dt>= Borç</dt><dd>{money(debt)}</dd></div>
              {refunds ? <div><dt>+ İadeler</dt><dd>{money(refunds)}</dd></div> : null}
              <div><dt>− Tahsilat</dt><dd>{money(collections)}</dd></div>
              <div className="cari-toplam"><dt>Açık bakiye</dt><dd>{money(balance)}</dd></div>
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}
