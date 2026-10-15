import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatPhone } from "@/lib/format-phone";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { TEKLIF_GRUP_ADLARI, teklifGrubu, type TeklifGrubu } from "@/lib/teklif-grubu";
import { SOZLESME_GRUP_ADLARI, sozlesmeGrubu, type SozlesmeGrubu } from "@/lib/sozlesme-grubu";
import { cariTaksitSonuclari, taksitDurumu } from "../../../crm/contracts/taksit-durumu";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import { modulGerekKosullu } from "@/lib/modul-kapisi";

/*
  BELGE YAŞAM DÖNGÜSÜ (10.10.2026): panelin kayıt detayı kalıbında.
  Üstte başlık, altında sayı şeridi, solda zaman çizelgesi, sağda
  müşteri ve belgenin künyesi.

  12.10.2026: talep/teklif/sözleşme detaylarıyla aynı kalite.
  - Durumlar gerçek sonuç (lib/teklif-grubu, lib/sozlesme-grubu).
    Kararlanan teklif veritabanında "archived" saklandığı için kabul
    edilen teklif "Teklif yanıtlandı", künye "archived" diyordu; ödeme
    planı ve fatura durumu İngilizce yazılıyordu.
  - Tahsilat taksitlerden, cari dökümüyle (../crm/contracts/
    taksit-durumu.ts — sözleşme detayıyla aynı kural). Eskiden yalnızca
    faturanın paid_at'ine bakılıyor ve tahsilat hep "bekleniyor"du.
  - Bir talepte birden çok sözleşme olabiliyor: eskiden sorgu tek kayıt
    beklediği için sayfa hata veriyordu. Artık açık olan sözleşme ya da
    bu teklife bağlı olan (yoksa en yenisi).
  - "Aç" bağlantıları kaydın kendisine gidiyor (eskiden genel listelere).
  - Künye panelin detay kartında (talep-musteri); eskiden Ayarlar'ın
    liste stilini (stg-list) kullanıyordu.
*/

type Durum = "complete" | "current" | "pending" | "danger";
type ZamanOlayi = { key: string; title: string; detail: string; at: string | null; status: Durum; href?: string };

const para = (deger: number, birim: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(Number(deger || 0) / 100);
const tarihSaat = (deger: string | null) =>
  deger ? new Date(deger).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" }) : "—";
const tarih = (deger: string | null) =>
  deger ? new Date(deger).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" }) : null;

const IS_DURUMU: Record<string, string> = {
  planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede",
  completed: "Tamamlandı", archived: "Arşivlendi", cancelled: "İptal edildi",
};
const TEKLIF_TONU: Record<TeklifGrubu, string> = { draft: "neutral", sent: "info", accepted: "success", rejected: "danger", expired: "warning", eski: "neutral", arsiv: "neutral" };
const SOZLESME_TONU: Record<SozlesmeGrubu, string> = { draft: "neutral", sent: "info", imzali: "warning", operasyonda: "success", tamam: "neutral", rejected: "danger", cancelled: "danger" };

type Teklif = {
  id: string; proposal_no: string; title: string | null; amount: number; currency: string; status: string; revision_no: number; revision_note: string | null;
  created_at: string; sent_at: string | null; first_viewed_at: string | null; last_viewed_at: string | null; view_count: number | null; responded_at: string | null;
  archived_at: string | null; archive_reason: string | null; superseded_at: string | null; superseded_by: string | null; valid_until: string | null;
};
type Sozlesme = {
  id: string; contract_no: string; title: string | null; amount: number; currency: string; status: string; proposal_id: string | null; party_id: string | null;
  created_at: string; updated_at: string | null; sent_at: string | null; first_viewed_at: string | null; last_viewed_at: string | null; view_count: number | null;
  signed_at: string | null; signed_name: string | null; workflow_id: string | null; payment_plan_id: string | null; due_date: string | null;
};

export default async function BelgeYasamDongusu({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!["proposal", "contract"].includes(type)) notFound();
  const sozlesmeMi = type === "contract";

  const { supabase, membership, modules } = await getPanelContext();
  /* Belge merkezi iki modülden birine bağlı; ekranda "Belgeler" yazsın. */
  modulGerekKosullu(modules.some((m) => ["documents", "crm"].includes(m.code)), "documents");
  const org = membership.organization_id;

  const { data: kok, error: kokHatasi } = await supabase.from(sozlesmeMi ? "crm_contracts" : "crm_proposals")
    .select("id,opportunity_id").eq("id", id).eq("organization_id", org).maybeSingle();
  if (kokHatasi) throw new Error(`${sozlesmeMi ? "Sözleşme" : "Teklif"} okunamadı: ${kokHatasi.message}`);
  if (!kok) notFound();
  const opportunityId = (kok as { opportunity_id: string }).opportunity_id;

  const [firsatSonucu, teklifSonucu, sozlesmeSonucu] = await Promise.all([
    supabase.from("crm_opportunities")
      .select("id,title,customer_name,contact_phone,contact_email,created_at")
      .eq("id", opportunityId).eq("organization_id", org).maybeSingle(),
    supabase.from("crm_proposals")
      .select("id,proposal_no,title,amount,currency,status,revision_no,revision_note,created_at,sent_at,first_viewed_at,last_viewed_at,view_count,responded_at,archived_at,archive_reason,superseded_at,superseded_by,valid_until")
      .eq("opportunity_id", opportunityId).eq("organization_id", org).order("revision_no", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("crm_contracts")
      .select("id,contract_no,title,amount,currency,status,proposal_id,party_id,created_at,updated_at,sent_at,first_viewed_at,last_viewed_at,view_count,signed_at,signed_name,workflow_id,payment_plan_id,due_date")
      .eq("opportunity_id", opportunityId).eq("organization_id", org).order("created_at", { ascending: false }),
  ]);
  if (firsatSonucu.error) throw new Error(`Talep kaydı okunamadı: ${firsatSonucu.error.message}`);
  if (teklifSonucu.error) throw new Error(`Teklif geçmişi okunamadı: ${teklifSonucu.error.message}`);
  if (sozlesmeSonucu.error) throw new Error(`Sözleşme kaydı okunamadı: ${sozlesmeSonucu.error.message}`);
  const firsat = firsatSonucu.data;
  if (!firsat) notFound();
  const teklifler = (teklifSonucu.data ?? []) as Teklif[];
  const sozlesmeler = (sozlesmeSonucu.data ?? []) as Sozlesme[];

  /* Süreç hangi sözleşme üzerinden anlatılıyor: açık olan sözleşme; teklifte
     o teklife bağlı olan, yoksa talebin en yeni sözleşmesi. */
  const sozlesme = sozlesmeMi
    ? sozlesmeler.find((s) => s.id === id) ?? null
    : sozlesmeler.find((s) => s.proposal_id === id) ?? sozlesmeler[0] ?? null;
  const buTeklif = sozlesmeMi ? null : teklifler.find((t) => t.id === id) ?? null;

  const bugun = todayInIstanbul();
  const [isSonucu, planSonucu, taksitSonucu] = await Promise.all([
    sozlesme?.workflow_id
      ? supabase.from("operation_workflows").select("id,status,created_at,updated_at")
          .eq("id", sozlesme.workflow_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sozlesme?.payment_plan_id
      ? supabase.from("payment_plans").select("id,total_amount,currency,created_at")
          .eq("id", sozlesme.payment_plan_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sozlesme?.payment_plan_id
      ? supabase.from("payment_installments").select("installment_no,due_date,amount,status")
          .eq("payment_plan_id", sozlesme.payment_plan_id).eq("organization_id", org).order("installment_no", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (isSonucu.error) throw new Error(`İş akışı okunamadı: ${isSonucu.error.message}`);
  if (planSonucu.error) throw new Error(`Ödeme planı okunamadı: ${planSonucu.error.message}`);
  if (taksitSonucu.error) throw new Error(`Taksitler okunamadı: ${taksitSonucu.error.message}`);
  const is = isSonucu.data as { id: string; status: string; created_at: string; updated_at: string | null } | null;
  const plan = planSonucu.data as { id: string; total_amount: number; currency: string; created_at: string } | null;
  const taksitler = (taksitSonucu.data ?? []) as { installment_no: number; due_date: string | null; amount: number; status: string | null }[];

  /* Tahsilat: sözleşme detayındaki kuralla (cari dökümü). */
  const cariSonuc = sozlesme && taksitler.length ? await cariTaksitSonuclari(supabase, org, sozlesme, bugun) : null;
  const taksitDurumlari = taksitler.map((t) => ({ ...t, ...taksitDurumu({ no: t.installment_no, amount: Number(t.amount), status: t.status, due_date: t.due_date }, cariSonuc, bugun) }));
  const tahsilEdilen = taksitDurumlari.reduce((toplam, t) => toplam + t.odenen, 0);
  const taksitToplami = taksitDurumlari.filter((t) => t.durum !== "iptal").reduce((toplam, t) => toplam + Number(t.amount), 0);
  const odenenTaksit = taksitDurumlari.filter((t) => t.durum === "odendi").length;
  const geciken = taksitDurumlari.filter((t) => t.durum === "gecikti").length;
  const tahsilatBitti = taksitDurumlari.length > 0 && taksitDurumlari.every((t) => t.durum === "odendi" || t.durum === "iptal");

  const isBitti = Boolean(is && ["completed", "archived"].includes(is.status));
  const sozlesmeGrup = sozlesme ? sozlesmeGrubu({ status: sozlesme.status, workflow_id: sozlesme.workflow_id }, isBitti) : null;
  const grupOf = (t: Teklif) => teklifGrubu({ status: t.status, archive_reason: t.archive_reason, superseded_by: t.superseded_by });

  /* ---------- Zaman çizelgesi ---------- */
  const olaylar: ZamanOlayi[] = [
    { key: "talep", title: "Talep oluşturuldu", detail: `${formatPersonName(firsat.customer_name) || firsat.customer_name} · ${firsat.title}`, at: firsat.created_at, status: "complete", href: `/panel/crm/requests/${firsat.id}` },
  ];
  for (const t of teklifler) {
    const grup = grupOf(t);
    olaylar.push({
      key: `teklif-${t.id}`,
      title: t.revision_no > 0 ? `Teklif revizyonu R${t.revision_no} hazırlandı` : "Teklif hazırlandı",
      detail: `${t.proposal_no} · ${para(t.amount, t.currency)}${t.revision_note ? ` · ${t.revision_note}` : ""}`,
      at: t.created_at,
      status: grup === "draft" ? "current" : "complete",
      href: `/panel/documents/proposal/${t.id}`,
    });
    if (t.sent_at) olaylar.push({ key: `teklif-gonderim-${t.id}`, title: "Teklif müşteriye gönderildi", detail: t.proposal_no, at: t.sent_at, status: grup === "sent" ? "current" : "complete" });
    if (t.first_viewed_at) olaylar.push({ key: `teklif-goruntu-${t.id}`, title: "Müşteri teklifi açtı", detail: `${t.proposal_no}${t.view_count && t.view_count > 1 ? ` · ${t.view_count} kez görüntülendi` : ""}`, at: t.first_viewed_at, status: "complete" });
    if (grup === "accepted") olaylar.push({ key: `teklif-karar-${t.id}`, title: "Teklif kabul edildi", detail: t.proposal_no, at: t.responded_at ?? t.archived_at, status: "complete" });
    else if (grup === "rejected") olaylar.push({ key: `teklif-karar-${t.id}`, title: "Teklif reddedildi", detail: t.proposal_no, at: t.responded_at ?? t.archived_at, status: "danger" });
    else if (grup === "expired") olaylar.push({ key: `teklif-karar-${t.id}`, title: "Teklifin süresi doldu", detail: `${t.proposal_no}${t.valid_until ? ` · geçerlilik ${tarih(t.valid_until)}` : ""}`, at: t.archived_at, status: "danger" });
    else if (grup === "eski") olaylar.push({ key: `teklif-eski-${t.id}`, title: "Yeni revizyonla değişti", detail: t.proposal_no, at: t.superseded_at, status: "complete" });
  }
  if (!teklifler.length) olaylar.push({ key: "teklif-yok", title: "Teklif bekleniyor", detail: "Talepten teklif hazırlanınca burada görünür.", at: null, status: "pending" });

  if (sozlesme) {
    olaylar.push({ key: "sozlesme", title: "Sözleşme hazırlandı", detail: `${sozlesme.contract_no} · ${para(sozlesme.amount, sozlesme.currency)}`, at: sozlesme.created_at, status: "complete", href: `/panel/crm/contracts/${sozlesme.id}` });
    olaylar.push({ key: "sozlesme-gonderim", title: sozlesme.sent_at ? "Sözleşme imzaya gönderildi" : "İmzaya gönderim bekleniyor", detail: sozlesme.contract_no, at: sozlesme.sent_at, status: sozlesme.sent_at ? "complete" : "current" });
    if (sozlesme.first_viewed_at) olaylar.push({ key: "sozlesme-goruntu", title: "Müşteri sözleşmeyi açtı", detail: `${sozlesme.contract_no}${sozlesme.view_count && sozlesme.view_count > 1 ? ` · ${sozlesme.view_count} kez görüntülendi` : ""}`, at: sozlesme.first_viewed_at, status: "complete" });
    if (sozlesmeGrup === "rejected" || sozlesmeGrup === "cancelled") {
      olaylar.push({ key: "sozlesme-kapanis", title: sozlesmeGrup === "rejected" ? "Sözleşme reddedildi" : "Sözleşme iptal edildi", detail: sozlesme.contract_no, at: sozlesme.updated_at, status: "danger" });
    } else {
      olaylar.push({ key: "sozlesme-imza", title: sozlesme.signed_at ? "Sözleşme elektronik olarak imzalandı" : "Müşteri imzası bekleniyor", detail: sozlesme.signed_at ? `${formatPersonName(sozlesme.signed_name) || "Müşteri"} imzaladı` : "İmzalanınca iş ve ödeme planı açılır.", at: sozlesme.signed_at, status: sozlesme.signed_at ? "complete" : sozlesme.sent_at ? "current" : "pending" });
    }
  } else {
    olaylar.push({ key: "sozlesme-yok", title: "Sözleşme bekleniyor", detail: "Teklif kabul edildiğinde sözleşme hazırlanır.", at: null, status: "pending" });
  }

  const kapandi = sozlesmeGrup === "rejected" || sozlesmeGrup === "cancelled";
  if (!kapandi) {
    olaylar.push(is
      ? { key: "is", title: isBitti ? "İş tamamlandı" : "İş başladı", detail: `Durum: ${IS_DURUMU[is.status] ?? is.status}`, at: isBitti ? is.updated_at : is.created_at, status: isBitti ? "complete" : "current", href: `/panel/operations/${is.id}` }
      : { key: "is-yok", title: "İş bekleniyor", detail: "Sözleşme imzalanınca operasyonda iş açılır.", at: null, status: "pending" });
    olaylar.push(plan
      ? { key: "plan", title: "Ödeme planı oluştu", detail: `${para(plan.total_amount, plan.currency)} · ${taksitler.length} taksit`, at: plan.created_at, status: "complete", href: sozlesme ? `/panel/crm/contracts/${sozlesme.id}` : undefined }
      : { key: "plan-yok", title: "Ödeme planı bekleniyor", detail: "Sözleşme imzalanınca taksitler oluşur.", at: null, status: "pending" });
    olaylar.push(plan
      ? {
          key: "tahsilat",
          title: tahsilatBitti ? "Tahsilat tamamlandı" : geciken ? `${geciken} taksidin vadesi geçti` : "Tahsilat sürüyor",
          detail: `${para(tahsilEdilen, plan.currency)} / ${para(taksitToplami, plan.currency)} · ${odenenTaksit}/${taksitler.length} taksit ödendi`,
          at: null,
          status: tahsilatBitti ? "complete" : geciken ? "danger" : "current",
        }
      : { key: "tahsilat-yok", title: "Tahsilat bekleniyor", detail: "Taksitler ödendikçe burada ilerler.", at: null, status: "pending" });
  }
  const tamamlanan = olaylar.filter((olay) => olay.status === "complete").length;

  /* ---------- Künye ---------- */
  const musteri: string = formatPersonName(firsat.customer_name) || firsat.customer_name || "Müşteri";
  const belgeNo = sozlesmeMi ? sozlesme?.contract_no : buTeklif?.proposal_no;
  const belgeKonusu = (sozlesmeMi ? sozlesme?.title : buTeklif?.title) || firsat.title;
  const buBelge = sozlesmeMi ? sozlesme : buTeklif;
  const durumEtiketi = sozlesmeMi
    ? sozlesmeGrup ? { ad: SOZLESME_GRUP_ADLARI[sozlesmeGrup], ton: SOZLESME_TONU[sozlesmeGrup] } : null
    : buTeklif ? { ad: TEKLIF_GRUP_ADLARI[grupOf(buTeklif)], ton: TEKLIF_TONU[grupOf(buTeklif)] } : null;
  const guncelTutar = sozlesme?.amount ?? teklifler.find((t) => !t.superseded_by)?.amount ?? 0;
  const guncelBirim = sozlesme?.currency ?? teklifler.find((t) => !t.superseded_by)?.currency ?? "TRY";

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">{belgeNo ?? (sozlesmeMi ? "SÖZLEŞME" : "TEKLİF")} · YAŞAM DÖNGÜSÜ</small>
        <h1>{belgeKonusu}</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-primary" href={`/panel/documents/${type}/${id}/preview`}>Önizle / PDF</Link>
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            <Link className="os-menu-item" href={sozlesmeMi ? `/panel/crm/contracts/${id}` : `/panel/crm/proposals/${id}`}>{sozlesmeMi ? "Sözleşmeye git" : "Teklife git"}</Link>
            <Link className="os-menu-item" href={`/panel/documents/${type}/${id}/access-logs`}>Erişim geçmişi</Link>
            {!sozlesmeMi && buTeklif && (buTeklif.revision_no > 0 || teklifler.length > 1) ? <Link className="os-menu-item" href={`/panel/crm/proposals/${id}/revisions`}>Revizyon geçmişi</Link> : null}
            <Link className="os-menu-item" href="/panel/documents">Belge Merkezi</Link>
          </div>
        </details>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Belge özeti">
      <dl>
        <div className="cari-bakiye"><dt>Güncel bedel</dt><dd>{para(guncelTutar, guncelBirim)}</dd></div>
        <div><dt>Durum</dt><dd>{durumEtiketi ? <span className="status-pill" data-tone={durumEtiketi.ton}>{durumEtiketi.ad}</span> : "—"}</dd></div>
        <div><dt>Görüntülenme</dt><dd>{buBelge?.view_count ?? 0}</dd></div>
        <div><dt>Tahsilat</dt><dd className={geciken ? "talep-uyari" : undefined}>{plan ? `${odenenTaksit}/${taksitler.length} taksit` : "—"}</dd></div>
        <div><dt>Tamamlanan adım</dt><dd>{tamamlanan} / {olaylar.length}</dd></div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-iki-izgara">
      <section className="panel-card talep-bilgi" aria-label="Belge zaman çizelgesi">
        <div className="cari-baslik"><h2>Uçtan uca süreç</h2><small>talepten tahsilata</small></div>
        <ol className="kayit-zaman">
          {olaylar.map((olay) => (
            <li key={olay.key} data-durum={olay.status}>
              <i aria-hidden="true">{olay.status === "complete" ? "✓" : olay.status === "danger" ? "!" : olay.status === "current" ? "•" : "○"}</i>
              <div>
                <h3>{olay.title}</h3>
                <p>{olay.detail}</p>
                {olay.at ? <small>{tarihSaat(olay.at)}</small> : null}
              </div>
              {olay.href ? <Link className="panel-secondary" href={olay.href}>Aç</Link> : null}
            </li>
          ))}
        </ol>
      </section>

      <aside className="panel-card talep-musteri" aria-label="Müşteri ve belge">
        <div className="talep-musteri-kimlik">
          <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
          <div>
            <h2>{musteri}</h2>
            <small><Link className="personel-tumu" href={`/panel/crm/musteri/${firsat.id}`}>Müşteri sayfası</Link></small>
          </div>
        </div>
        {firsat.contact_phone || firsat.contact_email ? (
          <div className="talep-iletisim">
            {firsat.contact_phone ? <a className="panel-secondary" href={`tel:${firsat.contact_phone}`}>Ara</a> : null}
            {firsat.contact_email ? <a className="panel-secondary" href={`mailto:${firsat.contact_email}`}>E-posta</a> : null}
          </div>
        ) : null}
        <dl className="talep-liste">
          <div><dt>Telefon</dt><dd>{formatPhone(firsat.contact_phone) || <em>Yok</em>}</dd></div>
          <div><dt>E-posta</dt><dd>{firsat.contact_email || <em>Yok</em>}</dd></div>
        </dl>

        <div className="talep-gecmis">
          <h3>{sozlesmeMi ? "Sözleşme" : "Teklif"}</h3>
          <dl className="talep-liste">
            <div><dt>Belge no</dt><dd>{belgeNo ?? "—"}</dd></div>
            <div><dt>Tutar</dt><dd>{buBelge ? para(buBelge.amount, buBelge.currency) : "—"}</dd></div>
            <div><dt>Hazırlandı</dt><dd>{tarih(buBelge?.created_at ?? null) ?? "—"}</dd></div>
            <div><dt>Gönderim</dt><dd>{tarih(buBelge?.sent_at ?? null) ?? <em>Gönderilmedi</em>}</dd></div>
            <div><dt>Son görüntülenme</dt><dd>{tarih(buBelge?.last_viewed_at ?? null) ?? <em>Açılmadı</em>}</dd></div>
            {sozlesmeMi
              ? <div><dt>İmza</dt><dd>{sozlesme?.signed_at ? tarih(sozlesme.signed_at) : <em>Bekleniyor</em>}</dd></div>
              : <div><dt>Revizyon</dt><dd>{buTeklif?.revision_no ? `R${buTeklif.revision_no}` : "İlk sürüm"}</dd></div>}
            {!sozlesmeMi && buTeklif?.valid_until ? <div><dt>Geçerlilik</dt><dd>{tarih(buTeklif.valid_until)}</dd></div> : null}
          </dl>
        </div>

        {/* Bağlantılar: talep, bu talebin bütün teklifleri ve sözleşmeleri, iş. */}
        <div className="talep-gecmis">
          <h3>Bağlantılar</h3>
          <ul>
            <li><Link href={`/panel/crm/requests/${firsat.id}`}><span className="talep-gecmis-metin"><b>Talep</b><small>{firsat.title}</small></span></Link></li>
            {teklifler.filter((t) => t.id !== id).map((t) => (
              <li key={t.id}><Link href={`/panel/documents/proposal/${t.id}`}><span className="talep-gecmis-metin"><b>Teklif {t.proposal_no}{t.revision_no ? ` · R${t.revision_no}` : ""}</b><small>{TEKLIF_GRUP_ADLARI[grupOf(t)]} · {para(t.amount, t.currency)}</small></span></Link></li>
            ))}
            {sozlesmeler.filter((s) => s.id !== id).map((s) => (
              <li key={s.id}><Link href={`/panel/documents/contract/${s.id}`}><span className="talep-gecmis-metin"><b>Sözleşme {s.contract_no}</b><small>{para(s.amount, s.currency)}</small></span></Link></li>
            ))}
            {is ? <li><Link href={`/panel/operations/${is.id}`}><span className="talep-gecmis-metin"><b>İş</b><small>{IS_DURUMU[is.status] ?? is.status}</small></span></Link></li> : null}
          </ul>
        </div>
      </aside>
    </div>
  </main>;
}
