import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { waMeAdresi } from "@/lib/wa-me";
import { doluAlanlar, type Kunye } from "@/lib/musteri-kunyesi";
import { findCustomerHistory, LOOKUP_MAX_ITEMS, formatHistoryDate, type HistoryKind } from "../../customer-history-query";
import { buildAccountBalances } from "../../../finance/account-balances";
import { TalepAkis } from "../../kayit-detay/kayit-akis";
import "../../crm.css";
import "../../kayit-detay/kayit-detay.css";

/*
  MÜŞTERİ SAYFASI (2026-10). Panelde müşterinin kendi kaydı yok: aynı kişi
  talepler arasında telefonla (son 10 hane) ya da ad soyadla tanınıyor;
  "Müşteri sorgula" penceresi bu eşleşmeyi yapıyordu ama bir pencereydi,
  bağlantısı paylaşılamıyor ve detay sayfalarından açılamıyordu.

  Sayfa müşterinin bir talebine bağlı (/panel/crm/musteri/[talep id]):
  adreste telefon ya da ad yazmasın diye (kişisel veri URL'ye girmez).
  Kayıtlar sorgulama penceresiyle aynı sorgudan ve aynı yetki kuralıyla
  gelir (findCustomerHistory; satış personeli yalnızca görebildiğini görür).

  Üstte ad ve iletişim düğmeleri; altında sayılar (talep, teklif,
  sözleşme, iş, sözleşme değeri, açık bakiye). Solda kimlik, iletişim ve
  künye (en son talepten); ortada bütün kayıtlar tek tabloda, yeniden
  eskiye; sağda müşteri mesajları ve cari özeti.
*/

type Props = { params: Promise<{ id: string }> };
type Mesaj = { id: string; sender_type: "customer" | "staff"; sender_name: string; body: string; created_at: string; read_at: string | null; contract_id: string | null; workflow_id: string | null };

const TUR_SIRASI: HistoryKind[] = ["request", "proposal", "contract", "job"];
const TUR_ADLARI: Record<HistoryKind, string> = { request: "Talep", proposal: "Teklif", contract: "Sözleşme", job: "İş" };
const money = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);

export default async function MusteriPage({ params }: Props) {
  const { id } = await params;
  const context = await getPanelContext();
  const { supabase, membership, modules } = context;
  if (!modules.some((m) => m.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  const org = membership.organization_id;

  const { data: anchorData } = await supabase
    .from("crm_opportunities")
    .select("id,customer_name,contact_phone,contact_email,request_details,source,created_at")
    .eq("id", id)
    .eq("organization_id", org)
    .maybeSingle();
  if (!anchorData) notFound();
  const anchor = anchorData as { id: string; customer_name: string; contact_phone: string | null; contact_email: string | null; request_details: Record<string, unknown> | null; source: string | null; created_at: string };

  const gecmis = await findCustomerHistory(context, { phone: anchor.contact_phone, name: anchor.customer_name }, { maxItems: LOOKUP_MAX_ITEMS });
  const kayitlar = gecmis?.items ?? [];
  const sayilar = gecmis?.counts ?? { request: 0, proposal: 0, contract: 0, job: 0 };
  const kimlikIleri = (anahtar: string) => kayitlar.filter((k) => k.key.startsWith(`${anahtar}:`)).map((k) => k.key.slice(anahtar.length + 1));
  const sozlesmeIdleri = kimlikIleri("contract");
  const isIdleri = kimlikIleri("job");

  /*
    Mesajlar: müşterinin takip ekranından yazdıkları ve ekibin yanıtları,
    sözleşmeleri ve işleri üzerinden. Okunamazsa (yetki) bölüm boş kalır.
  */
  const [sozlesmeMesajlari, isMesajlari] = await Promise.all([
    sozlesmeIdleri.length ? supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at,contract_id,workflow_id").eq("organization_id", org).in("contract_id", sozlesmeIdleri) : Promise.resolve({ data: [] }),
    isIdleri.length ? supabase.from("customer_file_messages").select("id,sender_type,sender_name,body,created_at,read_at,contract_id,workflow_id").eq("organization_id", org).in("workflow_id", isIdleri) : Promise.resolve({ data: [] }),
  ]);
  const mesajlar = [...new Map([...((sozlesmeMesajlari.data ?? []) as Mesaj[]), ...((isMesajlari.data ?? []) as Mesaj[])].map((m) => [m.id, m])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const okunmamis = mesajlar.filter((m) => m.sender_type === "customer" && !m.read_at).length;

  /*
    Cari özeti: sözleşmelerin bağlı olduğu cari hesap (müşteri carisi).
    Bakiye cari listesi ve detayıyla aynı kuralla (account-balances.ts).
    Cari modülü yoksa ya da okunamazsa gösterilmez.
  */
  const cariVar = modules.some((m) => m.code === "accounts");
  let cari: { id: string; name: string; debt: number; collections: number; refunds: number; balance: number } | null = null;
  if (cariVar && sozlesmeIdleri.length) {
    const { data: partyRows } = await supabase.from("crm_contracts").select("party_id").eq("organization_id", org).in("id", sozlesmeIdleri).not("party_id", "is", null);
    const partyId = ((partyRows ?? []) as { party_id: string }[])[0]?.party_id;
    if (partyId) {
      const [{ data: party }, { data: partyContracts }] = await Promise.all([
        supabase.from("account_parties").select("id,name,account_entries(id,entry_type,amount,source_type,transaction_date,description)").eq("organization_id", org).eq("id", partyId).maybeSingle(),
        supabase.from("crm_contracts").select("party_id,amount").eq("organization_id", org).eq("party_id", partyId).in("status", ["signed", "completed"]),
      ]);
      if (party) {
        const { accounts } = buildAccountBalances([party as never], (partyContracts ?? []) as { party_id: string | null; amount: number }[]);
        const a = accounts[0] as unknown as { id: string; name: string; debt: number; collections: number; refunds: number; balance: number } | undefined;
        if (a) cari = a;
      }
    }
  }

  const musteri = formatPersonName(gecmis?.kunye?.name ?? anchor.customer_name) || anchor.customer_name;
  const telefon = gecmis?.kunye?.phone ?? anchor.contact_phone;
  const eposta = gecmis?.kunye?.email ?? anchor.contact_email;
  const kunyeSatirlari = doluAlanlar((anchor.request_details ?? {}) as Kunye);
  const ilkKayit = kayitlar.length ? kayitlar[kayitlar.length - 1]?.dateLabel : formatHistoryDate(anchor.created_at);
  const sonSatis = kayitlar.find((k) => k.personRole === "Satış")?.person ?? null;
  const sonOperasyon = kayitlar.find((k) => k.personRole === "Operasyon")?.person ?? null;

  return (
    <main className="talep musteri-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">MÜŞTERİ</small>
          <h1>{musteri}</h1>
        </div>
        <div className="talep-bas-eylem">
          <Link className="panel-secondary" href={`/panel/crm/requests/${anchor.id}`}>Talebe dön</Link>
        </div>
      </header>

      <nav className="kayit-serit" aria-label="Müşteri özeti">
        <dl>
          {TUR_SIRASI.map((tur) => (
            <div key={tur}><dt>{tur === "request" ? "Teklifsiz talep" : TUR_ADLARI[tur]}</dt><dd>{sayilar[tur] ?? 0}</dd></div>
          ))}
          <div><dt>Sözleşme değeri</dt><dd>{gecmis?.contractedLabel ?? "—"}</dd></div>
          {cari ? <div className="cari-bakiye" data-tone={cari.balance > 0 ? "warning" : "success"}><dt>Açık bakiye</dt><dd>{money(cari.balance)}</dd></div> : null}
        </dl>
      </nav>

      <div className="talep-izgara">
        <section className="panel-card talep-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              <small>{gecmis?.lastContactLabel ? `Son kayıt ${gecmis.lastContactLabel}` : "Müşteri"}</small>
            </div>
          </div>
          {telefon || eposta ? (
            <div className="talep-iletisim">
              {telefon ? <a className="panel-secondary" href={`tel:${telefon}`}>Ara</a> : null}
              {telefon ? <a className="panel-secondary" href={waMeAdresi(telefon, `Merhaba ${musteri},`)} target="_blank" rel="noreferrer">WhatsApp</a> : null}
              {eposta ? <a className="panel-secondary" href={`mailto:${eposta}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{formatPhone(telefon) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{eposta || <em>Yok</em>}</dd></div>
            <div><dt>Satış temsilcisi</dt><dd>{sonSatis ?? <em>—</em>}</dd></div>
            {sonOperasyon ? <div><dt>Operasyon</dt><dd>{sonOperasyon}</dd></div> : null}
            <div><dt>İlk kayıt</dt><dd>{ilkKayit || <em>—</em>}</dd></div>
            {anchor.source ? <div><dt>Kaynak</dt><dd>{anchor.source}</dd></div> : null}
          </dl>
          {kunyeSatirlari.length ? (
            <div className="talep-gecmis">
              <h3>Künye</h3>
              <dl className="talep-liste">
                {kunyeSatirlari.map((alan) => <div key={alan.anahtar}><dt>{alan.etiket}</dt><dd>{alan.deger}</dd></div>)}
              </dl>
            </div>
          ) : null}
          {gecmis?.matchedBy === "name" ? (
            <p className="talep-bos cari-not">Kayıtlar ad soyadla eşleşti; telefonu farklı kayıtlar başka bir kişiye ait olabilir.</p>
          ) : null}
        </section>

        <section className="panel-card talep-bilgi" aria-label="Müşterinin kayıtları">
          <div className="cari-baslik">
            <h2>Kayıtlar</h2>
            <small>{gecmis?.total ?? 0} kayıt{gecmis?.limited ? ` · son ${kayitlar.length}` : ""}</small>
          </div>
          {kayitlar.length ? (
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="musteri">
                <thead>
                  <tr>
                    <th>Tür</th>
                    <th>Kayıt</th>
                    <th className="crm-col-amount">Tutar</th>
                    <th>Durum</th>
                    <th className="crm-col-date">Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {kayitlar.map((k) => (
                    <tr key={k.key}>
                      <td className="crm-table-mono" data-label="Tür">
                        {k.canOpen ? <Link className="crm-row-link" href={k.href} aria-label={`${k.kindLabel}: ${k.title}`}>{k.kindLabel}</Link> : k.kindLabel}
                      </td>
                      <td data-label="Kayıt">
                        <span className="crm-table-title" title={k.title}>{k.title}</span>
                        <span className="crm-table-sub">{[k.detail, k.person ? `${k.personRole ?? ""} ${k.person}`.trim() : null].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="crm-col-amount" data-label="Tutar">{k.amountLabel ?? "—"}</td>
                      <td data-label="Durum"><span className="status-pill" data-tone={k.tone}>{k.statusLabel}</span></td>
                      <td className="crm-col-date" data-label="Tarih">{k.dateLabel}</td>
                      <td className="crm-table-actions">{k.canOpen ? <span className="crm-row-chevron" aria-hidden="true">›</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ic-akis-bos">Bu müşterinin görebildiğiniz başka kaydı yok.</p>
          )}
          {gecmis?.scopedToAssigned ? <p className="talep-bos cari-not">Yalnızca size atanmış kayıtlar listeleniyor.</p> : null}
        </section>

        <TalepAkis sekmeler={cari ? [okunmamis ? `Mesajlar · ${okunmamis}` : "Mesajlar", "Cari"] : [okunmamis ? `Mesajlar · ${okunmamis}` : "Mesajlar"]}>
          <div className="musteri-mesajlar">
            {mesajlar.length ? (
              <ul className="cari-hareketler">
                {mesajlar.map((m) => {
                  const href = m.workflow_id ? `/panel/operations/${m.workflow_id}?pencere=mesajlar` : m.contract_id ? `/panel/crm/contracts/${m.contract_id}` : null;
                  const icerik = (
                    <span className="cari-hareket-metin">
                      <b>{m.sender_type === "customer" ? musteri : formatPersonName(m.sender_name)}{m.sender_type === "customer" && !m.read_at ? " · yeni" : ""}</b>
                      <small className="musteri-mesaj-govde">{m.body}</small>
                      <small>{formatHistoryDate(m.created_at)}</small>
                    </span>
                  );
                  return <li key={m.id}>{href ? <Link href={href}>{icerik}</Link> : icerik}</li>;
                })}
              </ul>
            ) : (
              <p className="ic-akis-bos">Müşteri takip ekranından mesaj yazmamış.</p>
            )}
          </div>
          {cari ? (
            <div className="musteri-cari">
              <dl className="talep-liste">
                <div><dt>Borç</dt><dd>{money(cari.debt)}</dd></div>
                <div><dt>Tahsilat</dt><dd className="cari-arti">{money(cari.collections)}</dd></div>
                {cari.refunds ? <div><dt>İade</dt><dd>{money(cari.refunds)}</dd></div> : null}
                <div className="cari-toplam"><dt>Açık bakiye</dt><dd>{money(cari.balance)}</dd></div>
              </dl>
              <Link className="panel-secondary" href={`/panel/accounts/${cari.id}`}>Cari hesabı aç</Link>
            </div>
          ) : null}
        </TalepAkis>
      </div>
    </main>
  );
}
