import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { waMeAdresi } from "@/lib/wa-me";
import { belgeAliciTelefonu } from "../alici-telefonu";
import { WhatsappGonderDugmesi } from "../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../share-send-link";
import { phoneSearchTerms } from "@/lib/format-phone";
import { daysSince, fetchLastContacts, waitingLabel } from "../last-contact";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import {
  organizationBrandName,
  proposalMessages,
} from "@/lib/customer-message-templates";
import { teklifGrubu, TEKLIF_GRUP_ADLARI, type TeklifGrubu } from "@/lib/teklif-grubu";
import { CustomerCell, DateCell, LastContactCell, RepresentativeCell, SubjectCell } from "../table-cells";
import { OtomatikSecim } from "../otomatik-secim";
import { IstatistikKarti, degisimYazisi, kisaPara } from "../istatistik-karti";
import { aylik, enCok, oran, ortanca, son30Degisim } from "@/lib/liste-istatistik";
import { simdi } from "../../os/genel-bakis";
import "../crm.css";
import "../kayit-detay/kayit-detay.css";

/*
  TEKLİFLER LİSTESİ (2026-10): talepler listesiyle aynı kalıp. Üstte
  başlık, altında durum şeridi (her sayı o duruma süzer, aktif tekliflerin
  toplam değeri dahil); solda teklif tablosu (önceki sürümün sütunları),
  sağda istatistikler (son 30 gün, kabul oranı, aylık teklif değeri).

  Eskiden dört sayaç kutusu, ayrı süzgeç kartı, dokuz sütunlu tablo ve
  sayfanın en altında katlanmış bir arşiv vardı. Üç de hata vardı:
  - Arama veritabanında yalnızca teklif no ve başlıkta yapılıyordu; müşteri
    adıyla arayınca liste boş geliyordu (sonradan yapılan müşteri araması
    zaten daralmış satırlara uygulanıyordu).
  - Durumu "expired" olan teklifler ne aktif listede ne arşivde vardı.
  - Yeni revizyonla değişen eski teklifler aktif listede kalıyordu.
  Artık tüm teklifler tek sorguyla okunuyor ve gruplama saf bir fonksiyonda
  (lib/teklif-grubu.ts, testli).
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
type Proposal = {
  id: string;
  proposal_no: string;
  title: string;
  amount: number;
  currency: string;
  valid_until: string | null;
  status: string;
  sent_at: string | null;
  view_count: number;
  created_at: string;
  revision_no: number;
  superseded_by: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  opportunity_id: string;
  crm_opportunities: {
    id: string;
    customer_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    assigned_employee_id: string | null;
    request_details: Record<string, unknown> | null;
  } | null;
};
/** Adresteki durum değeri; eski bağlantılar (?status=sent) çalışmaya devam ediyor. */
const DURUMLAR = ["", "draft", "sent", "accepted", "rejected", "expired", "arsiv", "tumu"] as const;
const SERIT: TeklifGrubu[] = ["draft", "sent", "accepted", "rejected", "expired"];
const money = (v: number, c: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(v / 100);
const GRUP_TONU: Record<TeklifGrubu, string> = { draft: "neutral", sent: "info", accepted: "success", rejected: "danger", expired: "warning", eski: "neutral", arsiv: "neutral" };

export default async function ProposalsPage({ searchParams }: Props) {
  const p = await searchParams;
  const search = (p.search ?? "").trim().slice(0, 100);
  const status = (DURUMLAR as readonly string[]).includes(p.status ?? "") ? p.status ?? "" : "";
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
      .from("crm_proposals")
      .select("id,proposal_no,title,amount,currency,valid_until,status,sent_at,view_count,created_at,revision_no,superseded_by,archived_at,archive_reason,opportunity_id,crm_opportunities!inner(id,customer_name,contact_email,contact_phone,assigned_employee_id,request_details)")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_employees")
      .select("id,full_name,can_receive_sales_requests,employment_status")
      .eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("Teklifler okunamadı: " + error.message);
  if (employeeError) throw new Error("Satış temsilcileri okunamadı: " + employeeError.message);
  const employees = (employeeData ?? []) as { id: string; full_name: string; can_receive_sales_requests: boolean; employment_status: string }[];
  const representativeMap = new Map(employees.map((e) => [e.id, e.full_name]));

  const all = ((data ?? []) as unknown as Proposal[]).map((row) => ({ row, grup: teklifGrubu(row) }));
  const searchKey = search.toLocaleLowerCase("tr-TR");
  const aramaUyar = (row: Proposal) => {
    if (!searchKey) return true;
    const customer = row.crm_opportunities;
    return [row.proposal_no, row.title, customer?.customer_name, customer?.contact_email, phoneSearchTerms(customer?.contact_phone)]
      .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(searchKey);
  };
  const temsilciUyar = (row: Proposal) => {
    const id = row.crm_opportunities?.assigned_employee_id ?? null;
    return !temsilci || (temsilci === "atanmamis" ? !id : id === temsilci);
  };
  const aktifMi = (grup: TeklifGrubu) => grup === "draft" || grup === "sent";
  const durumUyar = (grup: TeklifGrubu) =>
    status === "tumu" ? true
    : status === "arsiv" ? !aktifMi(grup)
    : status ? grup === status
    : aktifMi(grup);
  const rows = all.filter(({ row, grup }) => durumUyar(grup) && aramaUyar(row) && temsilciUyar(row));
  // Şerit sayıları arama ve temsilci süzgecine göre, durum süzgecinden bağımsız.
  const kapsam = all.filter(({ row }) => aramaUyar(row) && temsilciUyar(row));
  const sayi = (grup: TeklifGrubu) => kapsam.filter((item) => item.grup === grup).length;
  const aktifler = kapsam.filter((item) => aktifMi(item.grup));
  const aktifDeger = aktifler.reduce((s, { row }) => s + Number(row.amount), 0);

  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    [...new Set(rows.map(({ row }) => row.opportunity_id).filter(Boolean))],
  );

  /* Paylaşım kartı: teklif bağlantısı oluşturulunca buraya ?share= ile
     dönülüyor (proposal-actions.ts). Kendi numarasını bağlamamış kurumda
     WhatsApp eski usul (lib/belge-gonderim-yolu.ts). */
  let paylasim: React.ReactNode = null;
  if (share) {
    const waDurum = await getWhatsappStatus(membership.organization_id);
    const gonderimYolu = belgeGonderimYolu({
      kendiNumarasiBagli: waDurum.connected && waDurum.status !== "disabled",
      arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
    });
    // Eski usul bağlantısının alıcısı; telefon URL'ye taşınmıyor (gerekçe: alici-telefonu.ts).
    const aliciTelefonu = await belgeAliciTelefonu(supabase, membership.organization_id, "proposal", share);
    const publicHost = await resolvePublicHost(supabase, membership.organization_id);
    const shareUrl = `https://${publicHost}/teklif/${share}`;
    const messages = proposalMessages({
      organizationName: organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name }),
      customerName,
      documentNo: docNo,
      title: p.title,
      formattedAmount: p.amount ? money(Number(p.amount), p.currency || "TRY") : undefined,
      url: shareUrl,
    });
    paylasim = (
      <section className="teklif-paylasim" aria-label="Teklif bağlantısı hazır">
        <span className="teklif-paylasim-ikon" aria-hidden="true">✓</span>
        <div className="teklif-paylasim-metin">
          <b>Teklif bağlantısı hazır{docNo ? ` · ${docNo}` : ""}</b>
          <small title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</small>
        </div>
        <div className="talep-iletisim">
          <ShareSendLink kind="proposal" token={share} className="panel-primary" href={`mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
            E-posta ile gönder
          </ShareSendLink>
          {gonderimYolu === "panel" ? (
            <WhatsappGonderDugmesi kind="proposal" token={share} musteriAdi={customerName} />
          ) : (
            <ShareSendLink kind="proposal" token={share} className="panel-secondary" newTab href={waMeAdresi(aliciTelefonu, messages.whatsapp)}>
              WhatsApp ile gönder
            </ShareSendLink>
          )}
          <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>Önizle</a>
          <Link className="panel-secondary" href="/panel/crm/proposals" aria-label="Kapat">✕</Link>
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
    return s ? `/panel/crm/proposals?${s}` : "/panel/crm/proposals";
  };
  /*
    İSTATİSTİKLER (sağ kart). Eskiden burada temsilcilere göre dağılım
    vardı; temsilci süzgeci listenin üstüne geldi. Sayılar tüm tekliflerden
    (eski revizyonlar hariç), süzgeçten bağımsız.
  */
  const an = simdi();
  const gecerli = all.filter(({ grup }) => grup !== "eski");
  const { son30, degisim } = son30Degisim(gecerli.map(({ row }) => row.created_at), an);
  const kabul = gecerli.filter(({ grup }) => grup === "accepted").length;
  const karara = gecerli.filter(({ grup }) => grup === "accepted" || grup === "rejected" || grup === "expired").length;
  const kabulOrani = oran(kabul, karara);
  const tipikTutar = ortanca(gecerli.map(({ row }) => Number(row.amount)));
  const bekleyen = gecerli.filter(({ grup }) => grup === "sent");
  const bekleyenGec = bekleyen.filter(({ row }) => (daysSince(row.sent_at) ?? 0) >= 7).length;
  const aylikDeger = aylik(gecerli.map(({ row }) => ({ tarih: row.created_at, tutar: Number(row.amount) })), 6, an);
  const hizmetler = enCok(gecerli.map(({ row }) => String(row.crm_opportunities?.request_details?.service_type ?? "").trim() || "Belirtilmedi"), 5);
  // Temsilci seçimi: satış talebi alabilen aktif personel ve listede adı geçen herkes.
  const atananlar = new Set(all.map(({ row }) => row.crm_opportunities?.assigned_employee_id).filter(Boolean));
  const temsilciSecenekleri = employees
    .filter((e) => (e.employment_status === "active" && e.can_receive_sales_requests) || atananlar.has(e.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
  const filtered = Boolean(search || temsilci || status);

  return (
    <main className="talep cari ekip talepler teklifler">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">CRM</small>
          <h1>Teklifler</h1>
        </div>
        <div className="talep-bas-eylem">
          {/* Teklif bir talepten hazırlanıyor; buradan oluşturulmuyor. */}
          <Link className="panel-secondary" href="/panel/crm">Taleplere git</Link>
        </div>
      </header>

      {paylasim}

      <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
        <dl>
          {SERIT.map((grup) => (
            <div key={grup} className={status === grup ? "is-active" : undefined}>
              <dt>{TEKLIF_GRUP_ADLARI[grup]}</dt>
              <dd><Link href={adres({ status: grup })} aria-current={status === grup ? "page" : undefined}>{sayi(grup)}</Link></dd>
            </div>
          ))}
          <div className="cari-bakiye"><dt>Aktif teklif değeri</dt><dd>{money(aktifDeger, "TRY")}</dd></div>
        </dl>
      </nav>

      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Teklif listesi">
          <div className="ekip-suzgec talep-suzgec">
            <Link href={adres({ status: "" })} className={!status ? "is-active" : undefined}>Aktif <small>{aktifler.length}</small></Link>
            <Link href={adres({ status: "arsiv" })} className={status === "arsiv" ? "is-active" : undefined}>Kapanan <small>{kapsam.length - aktifler.length}</small></Link>
            <Link href={adres({ status: "tumu" })} className={status === "tumu" ? "is-active" : undefined}>Tümü <small>{kapsam.length}</small></Link>
            {SERIT.includes(status as TeklifGrubu) ? <span className="talep-suzgec-etiket">{TEKLIF_GRUP_ADLARI[status as TeklifGrubu]}</span> : null}
            {/* Temsilci süzgeci eskiden sağdaki temsilci kartındaydı; o kartın
                yerini istatistikler aldı, süzgeç buraya geldi. */}
            <form action="/panel/crm/proposals" className="talep-ara talep-ara--secimli" role="search">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <OtomatikSecim name="temsilci" defaultValue={temsilci} className="talep-temsilci-sec" label="Satış temsilcisi">
                <option value="">Tüm temsilciler</option>
                <option value="atanmamis">Atanmamış</option>
                {temsilciSecenekleri.map((e) => (
                  <option key={e.id} value={e.id}>{formatPersonName(e.full_name)}</option>
                ))}
              </OtomatikSecim>
              <input name="search" defaultValue={search} placeholder="Teklif no, müşteri, konu ara" aria-label="Teklif / müşteri ara" />
            </form>
          </div>

          {rows.length ? (
            /* Önceki sürümün sütunları; satırın tamamı ilk hücredeki
               bağlantıyla tıklanır (panel-premium.css). */
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="proposals">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Müşteri</th>
                    <th>Konu</th>
                    <th className="crm-col-rep">Temsilci</th>
                    <th className="crm-col-amount">Tutar</th>
                    <th>Durum</th>
                    <th className="crm-col-date">Geçerlilik</th>
                    <th className="crm-col-contact">Son temas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, grup }) => {
                    const customer = row.crm_opportunities;
                    const repId = customer?.assigned_employee_id;
                    const representativeName = repId ? (representativeMap.get(repId) ?? "Pasif personel") : null;
                    return (
                      <tr key={row.id}>
                        <td className="crm-table-mono" data-label="Teklif No">
                          <Link className="crm-row-link" href={`/panel/crm/proposals/${row.id}`}>{row.proposal_no}</Link>
                          {row.revision_no > 0 ? <span className="status-pill talep-revizyon" data-tone="gold">R{row.revision_no}</span> : null}
                        </td>
                        <CustomerCell name={customer?.customer_name} phone={customer?.contact_phone} email={customer?.contact_email} />
                        <SubjectCell title={row.title} service={String(customer?.request_details?.service_type ?? "")} />
                        <RepresentativeCell name={representativeName} />
                        <td data-label="Tutar" className="crm-col-amount">{money(Number(row.amount), row.currency || "TRY")}</td>
                        <td data-label="Durum">
                          <span className="status-pill" data-tone={GRUP_TONU[grup] ?? statusTone(row.status)}>{TEKLIF_GRUP_ADLARI[grup]}</span>
                          {grup === "sent" && row.sent_at ? (
                            <small className={(daysSince(row.sent_at) ?? 0) >= 7 ? "crm-waiting is-late" : "crm-waiting"}>{waitingLabel(row.sent_at)}</small>
                          ) : null}
                        </td>
                        <DateCell label="Geçerlilik" value={row.valid_until} />
                        <LastContactCell contact={lastContacts.get(row.opportunity_id)} />
                        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="crm-empty-state talep-bos-kutu">
              <h2>{all.length === 0 ? "Henüz teklif yok" : filtered ? "Eşleşen teklif yok" : "Aktif teklif yok"}</h2>
              <p>
                {all.length === 0
                  ? "Teklifler bir talepten hazırlanır: talebi açın ve “Teklif oluştur”u kullanın. Hazırladığınız teklifler burada listelenir."
                  : filtered
                    ? "Aramayı veya süzgeci değiştirip yeniden deneyin."
                    : "Gönderilmeyi ya da karar bekleyen teklif yok. Kabul edilen, reddedilen ve süresi dolanlar “Kapanan”da."}
              </p>
              <div className="crm-empty-actions">
                {filtered ? <Link className="panel-secondary" href="/panel/crm/proposals">Süzgeci temizle</Link> : null}
                {all.length === 0 ? <Link className="panel-primary" href="/panel/crm">Taleplere git</Link> : null}
              </div>
            </div>
          )}
        </section>

        <IstatistikKarti
          kapsam="tüm teklifler"
          kutular={[
            { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni teklif", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
            { ad: "Kabul oranı", deger: kabulOrani === null ? "—" : `%${kabulOrani}`, alt: `${kabul} kabul · ${karara - kabul} red/süre` },
            { ad: "Tipik teklif", deger: money(tipikTutar, "TRY"), alt: `ortanca · ${gecerli.length} teklif` },
            { ad: "Yanıt bekleyen", deger: String(bekleyen.length), alt: bekleyenGec ? `${bekleyenGec} tanesi 7+ gündür` : "hepsi 7 günden yeni", ton: bekleyenGec ? "uyari" : undefined },
          ]}
          gruplar={[
            { baslik: "Son 6 ay · teklif değeri", satirlar: aylikDeger.map((ay) => ({ ad: `${ay.ad} · ${ay.adet} teklif`, adet: ay.toplam, etiket: kisaPara(ay.toplam) })) },
            { baslik: "Hizmet türüne göre", satirlar: hizmetler.map(([ad, adet]) => ({ ad, adet })) },
          ]}
        />
      </div>
    </main>
  );
}
