import Link from "next/link";
import type { CSSProperties } from "react";
import { statusTone } from "@/lib/status-tone";
import { formatSubject } from "@/lib/table-format";
import { formatPersonName } from "@/lib/format-name";
import { fetchLastContacts } from "../../crm/last-contact";
import { CustomerCell, LastContactCell, MobilSatir, RepresentativeCell } from "../../crm/table-cells";
import { OtomatikSecim } from "../../crm/otomatik-secim";
import { IstatistikKarti, degisimYazisi } from "../../crm/istatistik-karti";
import { aylikDilimler, oran } from "@/lib/liste-istatistik";
import { aramaDeseni } from "@/lib/liste-arama";
import { sayfaAraligi, sayfaNumarasi, sonSayfaNo } from "@/lib/liste-sayfalama";
import { simdi } from "../../os/genel-bakis";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { archiveWorkflow } from "../actions";
import { WorkflowCreateForm } from "../workflow-create-form";
import { OpsIcon, addDaysKey, adimIlerlemesi, dueBadge, priorityNames, priorityTones, shortDate, surenStatuses, todayIstanbul, workflowStatusNames } from "../ops-shared";
import { BEKLEYEN_TARAF_TONLARI, beklemeOzeti, bekleyenTarafMi } from "@/lib/bekleyen-taraf";
import "../../crm/crm.css";
import "../operations.css";
import "../../crm/kayit-detay/kayit-detay.css";
import { SatirTiklama } from "@/app/panel/crm/satir-tiklama";

/*
  İŞLER LİSTESİ (2026-10): talepler, teklifler ve sözleşmelerle aynı
  düzen. Üstte başlık, Arşiv ve Yeni iş; altında durum şeridi (her sayı
  süzer; geciken ve yeni mesajlı işler dahil); solda sütunlu tablo,
  sağda istatistikler. Süzgeçler adreste: eski bağlantılar (?durum=,
  ?termin=, ?mesaj=yeni) çalışıyor, ?sorumlu= yeni.

  Eskiden dört sayaç kutusu ve "Filtrele"/"Temizle" düğmeli ayrı bir
  süzgeç kartı vardı. Arşivlenen işler listede görünmez
  (/panel/operations/arsiv); istatistik için okunur.
*/

const boardStatuses = ["planned", "in_progress", "blocked", "completed"] as const;
// "devam": devam eden + beklemede (genel bakıştaki kartla aynı küme)
const statusFilters = [...boardStatuses, "devam"] as const;
const dueFilters = ["yaklasan", "geciken"] as const;
type Employee = { id: string; full_name: string; job_title: string | null; user_id: string | null };
/* Görünümün satırı: iş + adım sayıları + okunmamış mesaj + sözleşme ve
   müşteri bilgisi, hepsi düz. Adımların kendisi listede gerekmiyordu;
   yalnızca "kaçı tamam" gösteriliyor. */
type IsSatiri = {
  id: string; title: string; customer_name: string | null; description: string | null;
  status: string; priority: string; start_date: string | null; due_date: string | null;
  delivered_at: string | null; created_at: string; contract_id: string | null;
  assigned_employee_id: string | null; waiting_party: string; waiting_since: string | null;
  adim_toplam: number; adim_tamam: number; okunmamis_mesaj: number;
  opportunity_id: string | null; invoice_id: string | null;
  contact_phone: string | null; contact_email: string | null;
};

export default async function OperationsJobsPage({ searchParams }: { searchParams: Promise<{ arama?: string; durum?: string; termin?: string; mesaj?: string; sorumlu?: string; sayfa?: string }> }) {
  const { arama, durum, termin, mesaj, sorumlu, sayfa } = await searchParams;
  const selectedStatus = (statusFilters as readonly string[]).includes(durum ?? "") ? durum! : "";
  const selectedDue = (dueFilters as readonly string[]).includes(termin ?? "") ? termin! : "";
  const onlyUnread = mesaj === "yeni";
  const selectedOwner = (sorumlu ?? "").trim().slice(0, 80);
  const { supabase, membership, modules, userId, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  /*
    LİSTE SUNUCUDA SÜZÜLÜYOR (11.10.2026) — teklif ve sözleşme
    listeleriyle aynı dönüşüm. Eskiden kurumun bütün işleri (arşiv
    dahil) adımlarıyla çekiliyor, sonra sözleşme bağlantısı, müşteri
    iletişimi, okunmamış mesaj sayısı ve ödenmiş faturalar AYRI
    sorgularla okunup bellekte birleştiriliyordu.

    operasyon_is_liste hepsini tek satırda veriyor (adım ve mesaj
    sayıları yan sorgularla); kartın sayıları da veritabanından.
  */
  const sayfaNo = sayfaNumarasi(sayfa);
  const bugun = todayIstanbul();
  const haftaSonu = addDaysKey(bugun, 7);
  const desen = aramaDeseni(arama ?? "");

  /*
    SÜZGEÇ TEK TANIMDA (20261013141922): iptal/arşiv hariç, arama ve
    sorumlu süzgeci veritabanında (operasyon_is_suz). Liste bu işlevden,
    şerit sayıları (operasyon_is_serit) AYNI işlevin üstünden tek
    çağrıda — AGENTS.md: şerit listeyle aynı süzgeçten. Eskiden şeridin
    her sayısı için ayrı bir sayım isteği gidiyordu (sayfa başına 7).
  */
  const suzgecParametreleri = { p_org: membership.organization_id, p_desen: desen, p_sorumlu: selectedOwner || null };
  const suzulmus = () => supabase.rpc("operasyon_is_suz", suzgecParametreleri, { count: "exact" }).select("*");

  /* Durum, termin ve mesaj süzgeçleri. "devam" = devam eden +
     beklemede (genel bakıştaki kartla aynı küme). Termin süzgeçleri
     tamamlanan işi dışarıda bırakıyor: biten işin gecikmesi yok. */
  const digerSuzgecler = (q: ReturnType<typeof suzulmus>) => {
    let s = q;
    if (selectedStatus === "devam") s = s.in("status", [...surenStatuses]);
    else if (selectedStatus) s = s.eq("status", selectedStatus);
    if (selectedDue) {
      s = s.neq("status", "completed").not("due_date", "is", null);
      s = selectedDue === "geciken" ? s.lt("due_date", bugun) : s.lte("due_date", haftaSonu);
    }
    if (onlyUnread) s = s.gt("okunmamis_mesaj", 0);
    return s;
  };

  const [
    { data, error, count: suzgecSayisi },
    { data: employeeData, error: employeeError },
    { data: ozetVerisi, error: ozetHatasi },
    { data: seritVerisi, error: seritHatasi },
  ] = await Promise.all([
    /* Sıralama: yeni müşteri mesajı olan işler üstte (eskiden bellekte
       sıralanıyordu, yani yalnızca o sayfanın içinde doğruydu). */
    digerSuzgecler(suzulmus())
      .order("okunmamis_mesaj", { ascending: false })
      .order("created_at", { ascending: false })
      .range(sayfaAraligi(sayfaNo)[0], sayfaAraligi(sayfaNo)[1]),
    supabase.from("hr_employees").select("id,full_name,job_title,user_id")
      .eq("organization_id", membership.organization_id).eq("employment_status", "active").order("full_name"),
    supabase.rpc("operasyon_is_istatistikleri", { p_organization_id: membership.organization_id }),
    supabase.rpc("operasyon_is_serit", { ...suzgecParametreleri, p_bugun: bugun }),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (ozetHatasi) throw new Error("İş istatistikleri okunamadı: " + ozetHatasi.message);
  if (seritHatasi) throw new Error("İş sayıları okunamadı: " + seritHatasi.message);
  const serit = (seritVerisi ?? {}) as { tum?: number; geciken?: number; okunmamis?: number; durumlar?: Record<string, number> };
  const tumSayi = Number(serit.tum ?? 0);
  const gecikenSayisi = Number(serit.geciken ?? 0);
  const okunmamisSayisi = Number(serit.okunmamis ?? 0);

  const workflows = (data ?? []) as unknown as IsSatiri[];
  const sonSayfa = sonSayfaNo(suzgecSayisi, workflows.length, sayfaNo);
  const employees = (employeeData ?? []) as Employee[];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const durumSayisi = (durum: string) => Number(serit.durumlar?.[durum] ?? 0);

  const ozet = (ozetVerisi ?? {}) as {
    toplam?: number; arsiv?: number; son30?: number; onceki30?: number;
    teslimli?: number; zamaninda?: number; adim_toplam?: number; adim_tamam?: number;
    musteri_bekleyen?: number; okunmamis_is?: number;
    aylik?: { ay: string; adet: number; toplam: number }[];
    sorumlular?: { personel: string | null; adet: number }[];
  };
  const sayiAl = (deger: number | null | undefined) => Number(deger ?? 0);
  const archivedCount = sayiAl(ozet.arsiv);

  /* Ödeme kapanmış mı: yalnızca BU SAYFADAKİ tamamlanan işlerin
     faturaları soruluyor. Eskiden kurumun bütün işlerinin faturaları
     tek seferde okunuyordu. */
  const invoiceIds = [...new Set(workflows.filter((w) => w.status === "completed" && w.invoice_id).map((w) => w.invoice_id!))];
  const paidInvoiceIds = new Set<string>();
  if (invoiceIds.length) {
    const { data: invoices } = await supabase.from("billing_invoices").select("id,status").in("id", invoiceIds);
    for (const invoice of invoices ?? []) if (invoice.status === "paid") paidInvoiceIds.add(invoice.id);
  }
  const readyForArchive = (workflow: IsSatiri) => {
    if (workflow.status !== "completed") return false;
    if (!workflow.contract_id) return true;
    if (!workflow.invoice_id) return workflow.opportunity_id !== null;
    return paidInvoiceIds.has(workflow.invoice_id);
  };

  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    [...new Set(workflows.map((workflow) => workflow.opportunity_id).filter((v): v is string => Boolean(v)))],
  );
  // Termini ve arşivi yöneticiler ve işin sorumlusu yönetebilir (actions.ts isManagerOrAssignee)
  const canManage = izin("operations.is.yonet");
  /*
    Müşteri adı müşteri sayfasına bağlanır (/panel/crm/musteri/[talep id]).
    Sayfa CRM kayıtlarını okuyor: operasyon personeli CRM'i göremediği
    için bağlantı yalnızca CRM modülü olan ve müşteri sorgulama ya da iş
    yönetme yetkisi olana çıkar; diğerlerinde ad düz yazı.
  */
  const musteriBaglantisi = modules.some((module) => module.code === "crm") && (izin("crm.musteri.sorgula") || canManage);
  const myEmployeeId = employees.find((employee) => employee.user_id === userId)?.id ?? null;
  const canActOn = (workflow: IsSatiri) => canManage || (Boolean(myEmployeeId) && workflow.assigned_employee_id === myEmployeeId);
  const hasFilter = Boolean(arama || selectedStatus || selectedDue || onlyUnread || selectedOwner);

  /* Süzgeç değişince sayfa başa dönüyor; numara yalnızca
     sayfalayıcıdan taşınıyor. */
  const adres = (ek: { durum?: string; termin?: string; mesaj?: string; sorumlu?: string; sayfa?: number }) => {
    const q = new URLSearchParams();
    const d = ek.durum ?? selectedStatus;
    const t = ek.termin ?? selectedDue;
    const m = ek.mesaj ?? (onlyUnread ? "yeni" : "");
    const s = ek.sorumlu ?? selectedOwner;
    if (arama) q.set("arama", arama);
    if (d) q.set("durum", d);
    if (t) q.set("termin", t);
    if (m) q.set("mesaj", m);
    if (s) q.set("sorumlu", s);
    if (ek.sayfa && ek.sayfa > 1) q.set("sayfa", String(ek.sayfa));
    const qs = q.toString();
    return qs ? `/panel/operations/isler?${qs}` : "/panel/operations/isler";
  };

  /*
    İSTATİSTİKLER (sağ kart): tüm işlerden (arşiv dahil), süzgeçten bağımsız.
    Zamanında teslim: terminli ve teslim edilmiş işlerde teslim günü
    (Türkiye saatiyle) termin gününden sonra değilse.
  */
  const an = simdi();
  /* Kartın sayıları veritabanından (operasyon_is_istatistikleri):
     arşivdekiler de sayılıyor — zamanında teslim ve aylık teslim
     onlarsız eksik kalırdı — ama adım ilerlemesi ve sorumlu yükü
     yalnızca aktif işlerden. */
  const son30 = sayiAl(ozet.son30);
  const onceki30 = sayiAl(ozet.onceki30);
  const degisim = onceki30 ? Math.round(((son30 - onceki30) / onceki30) * 100) : null;
  const teslimliSayisi = sayiAl(ozet.teslimli);
  const zamaninda = sayiAl(ozet.zamaninda);
  const zamanindaOrani = oran(zamaninda, teslimliSayisi);
  const ilerleme = oran(sayiAl(ozet.adim_tamam), sayiAl(ozet.adim_toplam));
  const musteriBekleyen = sayiAl(ozet.musteri_bekleyen);
  const aylikTeslim = aylikDilimler(ozet.aylik ?? [], 6, an);
  /* Sorumlu yükü: kimlikler özetten, adlar burada. Pasif personelin
     adı haritada yok; "Pasif personel" diye görünmesi bilinçli. */
  const sorumluYuku = (ozet.sorumlular ?? []).map((satir) => [
    satir.personel ? formatPersonName(employeeMap.get(satir.personel) ?? "Pasif personel") : "Atanmamış",
    Number(satir.adet),
  ] as [string, number]);

  return <main className="talep cari ekip talepler teklifler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">OPERASYON</small>
        <h1>İşler</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/operations/arsiv">Arşiv ({archivedCount})</Link>
        {canManage ? <PanelDrawer triggerLabel="Yeni iş" kicker="YENİ KAYIT" title="Yeni iş" description="İş başlığını, önceliğini ve terminini belirleyin."><WorkflowCreateForm /></PanelDrawer> : null}
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
      <dl>
        {boardStatuses.map((status) => (
          <div key={status} className={selectedStatus === status ? "is-active" : undefined}>
            <dt>{workflowStatusNames[status]}</dt>
            <dd><Link href={adres({ durum: status, termin: "", mesaj: "" })} aria-current={selectedStatus === status ? "page" : undefined}>{durumSayisi(status)}</Link></dd>
          </div>
        ))}
        <div className={selectedDue === "geciken" ? "is-active" : undefined}>
          <dt>Termini geçen</dt>
          <dd className={gecikenSayisi ? "talep-uyari" : undefined}><Link href={adres({ durum: "", termin: "geciken", mesaj: "" })}>{gecikenSayisi}</Link></dd>
        </div>
        <div className={onlyUnread ? "is-active" : undefined}>
          <dt>Yeni müşteri mesajı</dt>
          <dd className={okunmamisSayisi ? "talep-uyari" : undefined}><Link href={adres({ durum: "", termin: "", mesaj: "yeni" })}>{okunmamisSayisi}</Link></dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="İş listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ durum: "", termin: "", mesaj: "" })} className={!selectedStatus && !selectedDue && !onlyUnread ? "is-active" : undefined}>Tümü <small>{tumSayi}</small></Link>
          <Link href={adres({ durum: "devam", termin: "", mesaj: "" })} className={selectedStatus === "devam" ? "is-active" : undefined}>Devam + bekleyen <small>{durumSayisi("in_progress") + durumSayisi("blocked")}</small></Link>
          <Link href={adres({ durum: "", termin: "yaklasan", mesaj: "" })} className={selectedDue === "yaklasan" ? "is-active" : undefined}>7 gün içinde</Link>
          {/* Sorumlu süzgeci seçince uygulanır; durum, termin ve mesaj süzgeçleri korunur. */}
          <form action="/panel/operations/isler" className="talep-ara talep-ara--secimli" role="search">
            {selectedStatus ? <input type="hidden" name="durum" value={selectedStatus} /> : null}
            {selectedDue ? <input type="hidden" name="termin" value={selectedDue} /> : null}
            {onlyUnread ? <input type="hidden" name="mesaj" value="yeni" /> : null}
            <OtomatikSecim name="sorumlu" defaultValue={selectedOwner} className="talep-temsilci-sec" label="Sorumlu">
              <option value="">Tüm sorumlular</option>
              <option value="atanmamis">Atanmamış</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{formatPersonName(employee.full_name)}</option>)}
            </OtomatikSecim>
            <input name="arama" defaultValue={arama ?? ""} placeholder="İş, müşteri ara" aria-label="İş / müşteri ara" />
          </form>
        </div>

        {workflows.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="operations">
              <thead><tr><th>İş</th><th>Müşteri</th><th className="crm-col-rep">Sorumlu</th><th>Öncelik</th><th>Durum</th><th>İlerleme</th><th className="crm-col-date">Termin</th><th className="crm-col-contact">Son temas</th><th></th></tr></thead>
              {/* Sıralama sunucuda: yeni mesajlı işler üstte. Eskiden
                  bellekte sıralanıyordu, yani yalnızca o sayfanın
                  içinde doğruydu. */}
              <tbody>{workflows.map((workflow) => {
                const { done, percentage } = adimIlerlemesi(Number(workflow.adim_tamam), Number(workflow.adim_toplam));
                const adimSayisi = Number(workflow.adim_toplam);
                const opportunityId = workflow.opportunity_id;
                const contact = { phone: workflow.contact_phone, email: workflow.contact_email };
                /*
                  Termin metni ops-shared/dueBadge'den: pano, genel bakış ve iş
                  detayı da aynı fonksiyonu kullanıyor.
                */
                const terminRozeti = dueBadge(workflow.due_date, bugun, workflow.status);
                const unreadMessages = Number(workflow.okunmamis_mesaj);
                const canAct = canActOn(workflow);
                return <tr key={workflow.id} className={unreadMessages ? "has-alert" : undefined}>
                  {/* Satırın tamamı bu bağlantıyla tıklanır (kayit-detay.css, ilk hücre) */}
                  <td data-label="İş"><Link className="crm-row-link" href={`/panel/operations/${workflow.id}`} aria-label={`${workflow.title} işini aç`}><span className="crm-table-title" title={workflow.title}>{formatSubject(workflow.title)}</span><span className="crm-table-sub">{adimSayisi ? `${done}/${adimSayisi} adım tamamlandı` : "Adım yok"}</span>{unreadMessages ? <span className="crm-alert-chip">{unreadMessages} yeni müşteri mesajı</span> : null}</Link></td>
                  <CustomerCell name={workflow.customer_name || "Kurum içi iş"} phone={contact?.phone} email={contact?.email} href={musteriBaglantisi && opportunityId ? `/panel/crm/musteri/${opportunityId}` : null} />
                  <RepresentativeCell label="Sorumlu" name={workflow.assigned_employee_id ? employeeMap.get(workflow.assigned_employee_id) ?? "Pasif personel" : null} />
                  <td data-label="Öncelik"><span className="status-pill" data-tone={priorityTones[workflow.priority] ?? "neutral"}>{priorityNames[workflow.priority] ?? workflow.priority}</span></td>
                  <td data-label="Durum" className="ops-status-cell">
                    <span className="status-pill" data-tone={statusTone(workflow.status)}>{workflowStatusNames[workflow.status] ?? workflow.status}</span>
                    {/*
                      Top bizde değilse listede görünmeli: gecikmiş gibi duran bir iş
                      aslında müşteriden yanıt bekliyor olabilir.
                    */}
                    {bekleyenTarafMi(workflow.waiting_party) && workflow.waiting_party !== "us" ? (
                      <span className="status-pill" data-tone={BEKLEYEN_TARAF_TONLARI[workflow.waiting_party]}>
                        {beklemeOzeti(workflow.waiting_party, workflow.waiting_since, bugun)}
                      </span>
                    ) : null}
                    {workflow.status === "completed" && canAct ? (
                      <form action={archiveWorkflow} className="ops-archive-form">
                        <input type="hidden" name="workflow_id" value={workflow.id} />
                        <button type="submit" className="ops-archive-btn" title={readyForArchive(workflow) ? "Ödemesi kapandı, arşive gönderilebilir" : "İşi arşive gönder"}><OpsIcon name="archive" size={14} />Arşivle</button>
                      </form>
                    ) : null}
                    {workflow.status === "completed" && readyForArchive(workflow) ? <small className="ops-ready-hint">Ödeme kapandı</small> : null}
                  </td>
                  <td data-label="İlerleme" className="crm-col-progress"><span className="ops-progress-mini" aria-hidden="true"><i style={{ "--p": `${percentage}%` } as CSSProperties} /></span><b>%{percentage}</b></td>
                  <td data-label="Termin" className={`crm-col-date${terminRozeti.late ? " is-late" : ""}`}>{workflow.due_date ? shortDate(workflow.due_date) : canAct ? <Link className="crm-inline-action" href={`/panel/operations/${workflow.id}#termin`}>+ Termin ekle</Link> : "—"}{workflow.due_date ? <small>{terminRozeti.label}</small> : null}</td>
                  <LastContactCell contact={opportunityId ? lastContacts.get(opportunityId) : null} />
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                  {/* Telefondaki tek görünüm (table-cells.tsx → MobilSatir). */}
                  <MobilSatir
                    href={`/panel/operations/${workflow.id}`}
                    baslik={formatSubject(workflow.title)}
                    /* "Devam ediyor" işlerin çoğunda aynı: her satırda tekrarlanınca başlığı kesiyordu. Telefonda yalnızca farklı durum yazılır. */
                    durum={workflow.status === "in_progress" ? null : { etiket: workflowStatusNames[workflow.status] ?? workflow.status, ton: statusTone(workflow.status) }}
                    alt={[formatPersonName(workflow.customer_name) || "Kurum içi iş", workflow.assigned_employee_id ? formatPersonName(employeeMap.get(workflow.assigned_employee_id) ?? "Pasif personel") : "Atanmamış"]}
                    isaretler={[
                      unreadMessages ? { metin: `${unreadMessages} yeni mesaj`, ton: "tehlike" } : null,
                      workflow.due_date
                        ? { metin: terminRozeti.label, ton: terminRozeti.tone === "danger" ? "tehlike" : terminRozeti.tone === "warning" ? "uyari" : terminRozeti.tone === "success" ? "basari" : "bilgi" }
                        : { metin: "Termin yok", ton: "sessiz" },
                      { metin: adimSayisi ? `${done}/${adimSayisi} adım` : "Adım yok", ton: "sessiz" },
                      bekleyenTarafMi(workflow.waiting_party) && workflow.waiting_party !== "us" ? { metin: beklemeOzeti(workflow.waiting_party, workflow.waiting_since, bugun), ton: "uyari" } : null,
                      workflow.priority === "high" || workflow.priority === "urgent" ? { metin: priorityNames[workflow.priority] ?? workflow.priority, ton: workflow.priority === "urgent" ? "tehlike" : "uyari" } : null,
                      workflow.status === "completed" && readyForArchive(workflow) ? { metin: "Ödeme kapandı", ton: "basari" } : null,
                    ]}
                  />
                </tr>;
              })}</tbody>
            </table>
            <SatirTiklama />
            {/* Sayfalayıcı: teklif, sözleşme ve posta listeleriyle aynı. */}
            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo - 1 })}>← Önceki</Link>
                  : <span className="panel-secondary is-disabled" aria-disabled="true">← Önceki</span>}
                <small>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} iş` : ""}</small>
                {sayfaNo < sonSayfa
                  ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo + 1 })}>Sonraki →</Link>
                  : <span className="panel-secondary is-disabled" aria-disabled="true">Sonraki →</span>}
              </nav>
            ) : null}
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{hasFilter ? "Eşleşen iş yok" : "Aktif iş yok"}</h2>
            <p>{hasFilter ? "Aramayı veya süzgeci değiştirip yeniden deneyin." : "Tamamlanıp arşivlenen işler Arşiv'de."}</p>
            <div className="crm-empty-actions">
              {hasFilter ? <Link className="panel-secondary" href="/panel/operations/isler">Süzgeci temizle</Link> : null}
            </div>
          </div>
        )}
      </section>

      <IstatistikKarti
        kapsam="tüm işler (arşiv dahil)"
        kutular={[
          { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni iş", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
          { ad: "Zamanında teslim", deger: zamanindaOrani === null ? "—" : `%${zamanindaOrani}`, alt: `${zamaninda}/${teslimliSayisi} terminli iş` },
          { ad: "Aktif işlerde ilerleme", deger: ilerleme === null ? "—" : `%${ilerleme}`, alt: `${sayiAl(ozet.adim_tamam)}/${sayiAl(ozet.adim_toplam)} adım` },
          { ad: "Müşteriyi bekleyen", deger: String(musteriBekleyen), alt: "top müşteride ya da üçüncü tarafta" },
        ]}
        gruplar={[
          { baslik: "Son 6 ay · teslim edilen", satirlar: aylikTeslim.map((ay) => ({ ad: ay.ad, adet: ay.adet })) },
          { baslik: "Sorumluya göre aktif iş", satirlar: sorumluYuku.map(([ad, adet]) => ({ ad, adet })) },
        ]}
      />
    </div>
  </main>;
}
