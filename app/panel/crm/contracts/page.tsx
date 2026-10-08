import Link from "next/link";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { waMeAdresi } from "@/lib/wa-me";
import { belgeAliciTelefonu } from "../alici-telefonu";
import { WhatsappGonderDugmesi } from "../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../share-send-link";
import { phoneSearchTerms } from "@/lib/format-phone";
import { initials } from "@/lib/table-format";
import { daysSince, fetchLastContacts, relativeTime, waitingLabel } from "../last-contact";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import {
  contractMessages,
  organizationBrandName,
} from "@/lib/customer-message-templates";
import { AKTIF_SOZLESME_GRUPLARI, SOZLESME_GRUP_ADLARI, sozlesmeGrubu, type SozlesmeGrubu } from "@/lib/sozlesme-grubu";
import "../crm.css";
import "../kayit-detay/kayit-detay.css";

/*
  SÖZLEŞMELER LİSTESİ (2026-10): teklifler listesiyle aynı kalıp. Üstte
  başlık, altında durum şeridi (her sayı o duruma süzer, aktif
  sözleşmelerin değeri dahil); solda sözleşmeler, sağda temsilciler.

  Eskiden dört sayaç kutusu, ayrı süzgeç kartı, dokuz sütunlu tablo ve
  sayfanın en altında katlanmış bir arşiv vardı; arşivdeki operasyona
  devredilmiş sözleşmeler sözleşmeye değil Operasyon ana sayfasına
  gidiyordu. Artık her satır sözleşme detayına gider (orada "İşe git"
  var). Hangi sözleşmenin aktif sayılacağı kuralı lib/sozlesme-grubu.ts'te,
  testli; kural öncekiyle aynı.
*/

type Props = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    temsilci?: string;
    share?: string;
    doc_no?: string;
    customer_name?: string;
    customer_email?: string;
    title?: string;
    amount?: string;
    currency?: string;
  }>;
};
type Contract = {
  id: string;
  contract_no: string;
  title: string;
  amount: number;
  currency: string;
  due_date: string | null;
  status: string;
  sent_at: string | null;
  view_count: number;
  signed_at: string | null;
  workflow_id: string | null;
  created_at: string;
  opportunity_id: string;
  crm_opportunities: {
    id: string;
    customer_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    assigned_employee_id: string | null;
  } | null;
};
const GRUPLAR = Object.keys(SOZLESME_GRUP_ADLARI) as SozlesmeGrubu[];
const SERIT: SozlesmeGrubu[] = ["draft", "sent", "imzali", "operasyonda", "tamam"];
const GRUP_TONU: Record<SozlesmeGrubu, string> = { draft: "neutral", sent: "info", imzali: "warning", operasyonda: "success", tamam: "neutral", rejected: "danger", cancelled: "danger" };
const money = (v: number, c: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(v / 100);
const kisaTarih = (value: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : null;

export default async function ContractsPage({ searchParams }: Props) {
  const p = await searchParams;
  const search = (p.search ?? "").trim().slice(0, 100);
  // Eski bağlantılar: ?status=signed imzalı tüm sözleşmeleri (iş açılmış ya da açılmamış) gösteriyordu.
  const status = p.status === "signed" || p.status === "arsiv" || p.status === "tumu" || GRUPLAR.includes(p.status as SozlesmeGrubu) ? p.status ?? "" : "";
  const temsilci = (p.temsilci ?? "").trim().slice(0, 80);
  const share = p.share ?? "";
  const docNo = p.doc_no ?? "";
  const customerName = p.customer_name ?? "";
  const customerEmail = p.customer_email ?? "";
  const { supabase, membership, organization, modules } = await getPanelContext();
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");

  const [{ data, error }, { data: employeeData, error: employeeError }] = await Promise.all([
    supabase
      .from("crm_contracts")
      .select("id,contract_no,title,amount,currency,due_date,status,sent_at,view_count,signed_at,workflow_id,created_at,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,assigned_employee_id)")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_employees")
      .select("id,full_name")
      .eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("Sözleşmeler okunamadı: " + error.message);
  if (employeeError) throw new Error("Temsilciler okunamadı: " + employeeError.message);
  const representativeMap = new Map(((employeeData ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));
  const fetched = (data ?? []) as unknown as Contract[];

  // İşi tamamlanan (ya da tamamlanıp arşivlenen) sözleşme operasyondan çıkmış sayılır.
  const workflowIds = [...new Set(fetched.map((r) => r.workflow_id).filter((v): v is string => Boolean(v)))];
  const completedWorkflowIds = new Set<string>();
  if (workflowIds.length) {
    const { data: workflows } = await supabase
      .from("operation_workflows")
      .select("id,status")
      .eq("organization_id", membership.organization_id)
      .in("id", workflowIds);
    for (const wf of workflows ?? [])
      if (wf.status === "completed" || wf.status === "archived") completedWorkflowIds.add(wf.id);
  }
  const all = fetched.map((row) => ({ row, grup: sozlesmeGrubu(row, Boolean(row.workflow_id && completedWorkflowIds.has(row.workflow_id))) }));

  const searchKey = search.toLocaleLowerCase("tr-TR");
  const aramaUyar = (row: Contract) => {
    if (!searchKey) return true;
    const customer = row.crm_opportunities;
    return [row.contract_no, row.title, customer?.customer_name, customer?.contact_email, phoneSearchTerms(customer?.contact_phone)]
      .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(searchKey);
  };
  const temsilciUyar = (row: Contract) => {
    const id = row.crm_opportunities?.assigned_employee_id ?? null;
    return !temsilci || (temsilci === "atanmamis" ? !id : id === temsilci);
  };
  const aktifMi = (grup: SozlesmeGrubu) => AKTIF_SOZLESME_GRUPLARI.includes(grup);
  const durumUyar = (grup: SozlesmeGrubu) =>
    status === "tumu" ? true
    : status === "arsiv" ? !aktifMi(grup)
    : status === "signed" ? grup === "imzali" || grup === "operasyonda"
    : status ? grup === status
    : aktifMi(grup);
  const rows = all.filter(({ row, grup }) => durumUyar(grup) && aramaUyar(row) && temsilciUyar(row));
  // Şerit sayıları arama ve temsilci süzgecine göre, durum süzgecinden bağımsız.
  const kapsam = all.filter(({ row }) => aramaUyar(row) && temsilciUyar(row));
  const sayi = (grup: SozlesmeGrubu) => kapsam.filter((item) => item.grup === grup).length;
  const aktifler = kapsam.filter((item) => aktifMi(item.grup));
  const aktifDeger = aktifler.reduce((s, { row }) => s + Number(row.amount), 0);
  const geciken = aktifler.filter(({ row, grup }) => grup === "sent" && (daysSince(row.sent_at) ?? 0) >= 7).length;

  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    [...new Set(rows.map(({ row }) => row.opportunity_id).filter(Boolean))],
  );

  /* İmza bağlantısı hazır şeridi: bağlantı oluşturulunca buraya ?share= ile
     dönülüyor (contract-actions.ts). Kendi numarasını bağlamamış kurumda
     WhatsApp eski usul (lib/belge-gonderim-yolu.ts). */
  let paylasim: React.ReactNode = null;
  if (share) {
    const waDurum = await getWhatsappStatus(membership.organization_id);
    const gonderimYolu = belgeGonderimYolu({
      kendiNumarasiBagli: waDurum.connected && waDurum.status !== "disabled",
      arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
    });
    // Eski usul bağlantısının alıcısı; telefon URL'ye taşınmıyor (gerekçe: alici-telefonu.ts).
    const aliciTelefonu = await belgeAliciTelefonu(supabase, membership.organization_id, "contract", share);
    const publicHost = await resolvePublicHost(supabase, membership.organization_id);
    const shareUrl = `https://${publicHost}/sozlesme/${share}`;
    const messages = contractMessages({
      organizationName: organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name }),
      customerName,
      documentNo: docNo,
      title: p.title,
      formattedAmount: p.amount ? money(Number(p.amount), p.currency || "TRY") : undefined,
      url: shareUrl,
    });
    paylasim = (
      <section className="teklif-paylasim" aria-label="İmza bağlantısı hazır">
        <span className="teklif-paylasim-ikon" aria-hidden="true">✓</span>
        <div className="teklif-paylasim-metin">
          <b>İmza bağlantısı hazır{docNo ? ` · ${docNo}` : ""}</b>
          <small title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</small>
        </div>
        <div className="talep-iletisim">
          <ShareSendLink kind="contract" token={share} className="panel-primary" href={`mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
            E-posta ile gönder
          </ShareSendLink>
          {gonderimYolu === "panel" ? (
            <WhatsappGonderDugmesi kind="contract" token={share} musteriAdi={customerName} />
          ) : (
            <ShareSendLink kind="contract" token={share} className="panel-secondary" newTab href={waMeAdresi(aliciTelefonu, messages.whatsapp)}>
              WhatsApp ile gönder
            </ShareSendLink>
          )}
          <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>Önizle</a>
          <Link className="panel-secondary" href="/panel/crm/contracts" aria-label="Kapat">✕</Link>
        </div>
      </section>
    );
  }

  const adres = (ek: { status?: string; temsilci?: string }) => {
    const q = new URLSearchParams();
    const d = ek.status ?? status;
    const t = ek.temsilci ?? temsilci;
    if (search) q.set("search", search);
    if (d) q.set("status", d);
    if (t) q.set("temsilci", t);
    const s = q.toString();
    return s ? `/panel/crm/contracts?${s}` : "/panel/crm/contracts";
  };
  // Temsilci dağılımı aktif sözleşmeler üzerinden (arama dahil, temsilci süzgeci hariç).
  const aktifTum = all.filter(({ row, grup }) => aktifMi(grup) && aramaUyar(row));
  const temsilciler = [...new Set(aktifTum.map(({ row }) => row.crm_opportunities?.assigned_employee_id ?? null))]
    .map((id) => {
      const satirlar = aktifTum.filter(({ row }) => (row.crm_opportunities?.assigned_employee_id ?? null) === id);
      return { id, ad: id ? formatPersonName(representativeMap.get(id) ?? "Pasif personel") : "Atanmamış", sayi: satirlar.length, deger: satirlar.reduce((s, { row }) => s + Number(row.amount), 0) };
    })
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.sayi - a.sayi);
  const filtered = Boolean(search || temsilci || status);
  const seciliEtiket = status === "signed" ? "İmzalı" : GRUPLAR.includes(status as SozlesmeGrubu) ? SOZLESME_GRUP_ADLARI[status as SozlesmeGrubu] : null;

  return (
    <main className="talep cari ekip talepler teklifler">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">CRM</small>
          <h1>Sözleşmeler</h1>
        </div>
        <div className="talep-bas-eylem">
          {/* Sözleşme tekliften ya da talepten hazırlanıyor; buradan oluşturulmuyor. */}
          <Link className="panel-secondary" href="/panel/crm/proposals">Tekliflere git</Link>
        </div>
      </header>

      {paylasim}

      <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
        <dl>
          {SERIT.map((grup) => (
            <div key={grup} className={status === grup ? "is-active" : undefined}>
              <dt>{SOZLESME_GRUP_ADLARI[grup]}</dt>
              <dd><Link href={adres({ status: grup })} aria-current={status === grup ? "page" : undefined}>{sayi(grup)}</Link></dd>
            </div>
          ))}
          {/* Geciken: 7 günden uzun süredir imza bekleyen (eski "GECİKEN" kutusu). */}
          <div><dt>7+ gündür imza bekleyen</dt><dd className={geciken ? "talep-uyari" : undefined}>{geciken}</dd></div>
          <div className="cari-bakiye"><dt>Aktif sözleşme değeri</dt><dd>{money(aktifDeger, "TRY")}</dd></div>
        </dl>
      </nav>

      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Sözleşme listesi">
          <div className="ekip-suzgec talep-suzgec">
            <Link href={adres({ status: "" })} className={!status ? "is-active" : undefined}>Aktif <small>{aktifler.length}</small></Link>
            <Link href={adres({ status: "arsiv" })} className={status === "arsiv" ? "is-active" : undefined}>Kapanan <small>{kapsam.length - aktifler.length}</small></Link>
            <Link href={adres({ status: "tumu" })} className={status === "tumu" ? "is-active" : undefined}>Tümü <small>{kapsam.length}</small></Link>
            {seciliEtiket ? <span className="talep-suzgec-etiket">{seciliEtiket}</span> : null}
            {temsilci ? (
              <Link className="ekip-suzgec-dep" href={adres({ temsilci: "" })}>
                {temsilci === "atanmamis" ? "Atanmamış" : formatPersonName(representativeMap.get(temsilci) ?? "Temsilci")} ✕
              </Link>
            ) : null}
            <form action="/panel/crm/contracts" className="talep-ara" role="search">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              {temsilci ? <input type="hidden" name="temsilci" value={temsilci} /> : null}
              <input name="search" defaultValue={search} placeholder="Sözleşme no, müşteri, konu ara" aria-label="Sözleşme / müşteri ara" />
            </form>
          </div>

          {rows.length ? (
            <ul className="ekip-liste">
              {rows.map(({ row, grup }) => {
                const customer = row.crm_opportunities;
                const musteri = formatPersonName(customer?.customer_name) || "—";
                const repId = customer?.assigned_employee_id;
                const temsilciAdi = repId ? formatPersonName(representativeMap.get(repId) ?? "Pasif personel") : null;
                const temas = lastContacts.get(row.opportunity_id);
                const teslim = kisaTarih(row.due_date);
                const gecikti = grup === "sent" && (daysSince(row.sent_at) ?? 0) >= 7;
                const alt =
                  grup === "sent" ? (row.view_count ? `${waitingLabel(row.sent_at) ?? ""} · ${row.view_count} kez görüldü` : `${waitingLabel(row.sent_at) ?? ""} · açılmadı`)
                  : grup === "imzali" ? "İş akışı açılmadı"
                  : grup === "operasyonda" && row.signed_at ? `İmza ${kisaTarih(row.signed_at)}`
                  : null;
                return (
                  <li key={row.id}>
                    <Link href={`/panel/crm/contracts/${row.id}`}>
                      <span className="talep-avatar" aria-hidden="true">{initials(musteri)}</span>
                      <span className="cari-hareket-metin">
                        <b>{musteri}</b>
                        <small>{row.contract_no} · {row.title}</small>
                      </span>
                      <span className="talep-satir-yan">
                        <span className={temsilciAdi ? undefined : "is-bos"}>{temsilciAdi ?? "Atanmamış"}</span>
                        <small title={temas?.preview}>{temas ? `Not ${relativeTime(temas.at)}` : "Not yok"}{teslim ? ` · teslim ${teslim}` : ""}</small>
                      </span>
                      <strong className="teklif-tutar-satir">{money(Number(row.amount), row.currency || "TRY")}</strong>
                      <span className="talep-satir-durum">
                        <span className="status-pill" data-tone={GRUP_TONU[grup]}>{SOZLESME_GRUP_ADLARI[grup]}</span>
                        {alt ? <small className={gecikti || grup === "imzali" ? "talep-uyari" : undefined}>{alt}</small> : null}
                      </span>
                      <span className="ekip-ok" aria-hidden="true">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="crm-empty-state talep-bos-kutu">
              <h2>{all.length === 0 ? "Henüz sözleşme yok" : filtered ? "Eşleşen sözleşme yok" : "Aktif sözleşme yok"}</h2>
              <p>
                {all.length === 0
                  ? "Sözleşmeler kabul edilen bir tekliften “Sözleşmeye dönüştür” ile ya da talep sayfasındaki “Direkt sözleşme” ile hazırlanır."
                  : filtered
                    ? "Aramayı veya süzgeci değiştirip yeniden deneyin."
                    : "İmza bekleyen ya da işi açılmamış sözleşme yok. Operasyona devredilen, tamamlanan, reddedilen ve iptal edilenler “Kapanan”da."}
              </p>
              <div className="crm-empty-actions">
                {filtered ? <Link className="panel-secondary" href="/panel/crm/contracts">Süzgeci temizle</Link> : null}
                {all.length === 0 ? <Link className="panel-primary" href="/panel/crm/proposals">Tekliflere git</Link> : null}
              </div>
            </div>
          )}
        </section>

        <section className="panel-card talep-musteri" aria-label="Temsilciler">
          <div className="cari-baslik">
            <h2>Temsilciler</h2>
            <small>aktif sözleşme</small>
          </div>
          {temsilciler.length ? (
            <ul className="cari-hareketler">
              {temsilciler.map((t) => {
                const anahtar = t.id ?? "atanmamis";
                return (
                  <li key={anahtar}>
                    <Link href={adres({ temsilci: temsilci === anahtar ? "" : anahtar })} className={temsilci === anahtar ? "is-active" : undefined}>
                      <span className="ekip-dep-kod" data-pasif={t.id ? undefined : ""}>{t.id ? initials(t.ad) : "—"}</span>
                      <span className="cari-hareket-metin"><b>{t.ad}</b><small>{money(t.deger, "TRY")}</small></span>
                      <strong>{t.sayi}</strong>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="talep-bos cari-not">Aktif sözleşme yok.</p>}
        </section>
      </div>
    </main>
  );
}
