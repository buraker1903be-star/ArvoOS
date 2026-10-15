import Link from "next/link";
import { kimlikMi } from "@/lib/kimlik";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ContractDocument } from "@/app/_components/contract-document";
import { ProposalDocument } from "@/app/_components/proposal-document";
import { PrintDocumentButton } from "@/app/_components/print-document-button";
import { requestAudit } from "@/app/_components/request-origin";
import { TEKLIF_GRUP_ADLARI, type TeklifGrubu } from "@/lib/teklif-grubu";
import { SOZLESME_GRUP_ADLARI, sozlesmeGrubu, type SozlesmeGrubu } from "@/lib/sozlesme-grubu";
import { loadPanelDocument } from "../load";
import "../../../../crm/crm.css";
import "../../../../crm/kayit-detay/kayit-detay.css";

/*
  BELGE ÖNİZLEMESİ (12.10.2026): panelin başlığıyla. Müşteriye giden
  belgenin AYNISI çiziliyor (ortak bileşen); panel yalnızca çerçeveyi
  ekliyor: belge numarası, konu, durum, PDF ve ⋯ menüsü.

  Eskiden panel başlığı yoktu; belgenin kendi araç çubuğu (müşteri
  sayfasının düğme stili) "Yaşam döngüsüne dön" ve "PDF olarak indir"i
  taşıyordu. Müşteri bağlantısı bilerek burada YOK: panelden açılınca
  müşterinin görüntülenme sayacı ve erişim kaydı "müşteri açtı" diye
  yazılırdı.
*/

const TEKLIF_TONU: Record<TeklifGrubu, string> = { draft: "neutral", sent: "info", accepted: "success", rejected: "danger", expired: "warning", eski: "neutral", arsiv: "neutral" };
const SOZLESME_TONU: Record<SozlesmeGrubu, string> = { draft: "neutral", sent: "info", imzali: "warning", operasyonda: "success", tamam: "neutral", rejected: "danger", cancelled: "danger" };

export default async function DocumentPreviewPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa onu çökme ekranına çeviriyordu. */
  if (!kimlikMi(id)) notFound();
  if (!["proposal", "contract"].includes(type)) notFound();
  const document = await loadPanelDocument(type, id);
  if (!document) notFound();
  const { supabase } = await getPanelContext();
  const audit = await requestAudit();
  await supabase.rpc("log_document_access", { target_document_type: type, target_document_id: id, target_access_type: "panel_preview", target_ip: audit.ip, target_user_agent: audit.userAgent, target_referrer: audit.referrer, target_metadata: { number: document.number, source: "document_center_shared_renderer" } });

  const sozlesmeMi = document.type === "contract";
  const row = document.row;
  /* Durum: listelerdeki grup adı. Teklifte yükleyici asıl durumu zaten
     çözüyor (kararlanan teklif "archived" saklanıyor); sözleşmede iş
     açıldıysa "Operasyonda". */
  /* Teklifte belge, personelin müşteri adına çevirdiği teklifi müşteriye "onay
     bekliyor" (sent) gösteriyor; panelin etiketi gerçek sonucu, arşiv sebebinden. */
  const arsivSebebi = String(row.archive_reason ?? "");
  const teklifDurumu = ["accepted", "rejected", "expired"].includes(arsivSebebi) ? arsivSebebi : String(row.status ?? "");
  const durum = sozlesmeMi
    ? (() => { const grup = sozlesmeGrubu({ status: String(row.status ?? ""), workflow_id: row.workflow_id ?? null }, false); return { ad: SOZLESME_GRUP_ADLARI[grup], ton: SOZLESME_TONU[grup] }; })()
    : TEKLIF_GRUP_ADLARI[teklifDurumu as TeklifGrubu] ? { ad: TEKLIF_GRUP_ADLARI[teklifDurumu as TeklifGrubu], ton: TEKLIF_TONU[teklifDurumu as TeklifGrubu] } : null;
  const pdfHref = `/panel/documents/${type}/${id}/pdf`;

  return <div className="talep cari belge-onizleme">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">{document.number} · ÖNİZLEME</small>
        <h1>{String(row.title || document.number)}</h1>
      </div>
      <div className="talep-bas-eylem">
        {durum ? <span className="status-pill" data-tone={durum.ton}>{durum.ad}</span> : null}
        <PrintDocumentButton href={pdfHref} documentType={document.type} documentId={id} documentNumber={document.number} className="panel-primary" />
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            <Link className="os-menu-item" href={`/panel/documents/${type}/${id}`}>Yaşam döngüsü</Link>
            <Link className="os-menu-item" href={`/panel/documents/${type}/${id}/access-logs`}>Erişim geçmişi</Link>
            <Link className="os-menu-item" href={sozlesmeMi ? `/panel/crm/contracts/${id}` : `/panel/crm/proposals/${id}`}>{sozlesmeMi ? "Sözleşmeye git" : "Teklife git"}</Link>
            <Link className="os-menu-item" href="/panel/documents">Belge Merkezi</Link>
          </div>
        </details>
      </div>
    </header>
    <p className="belge-onizleme-not">Müşterinin gördüğü belgenin aynısı. Bu açılış erişim geçmişine &ldquo;Panelde önizleme&rdquo; olarak yazılır; müşterinin görüntülenme sayısına eklenmez.</p>
    <div className="belge-onizleme-kagit">
      {document.type === "contract"
        ? <ContractDocument kurum={document.kurum} workPlan={document.workPlan} addenda={document.addenda} row={row} audit={document.audit} auditAvailable={document.auditAvailable} verificationUrl={document.verificationUrl} verificationHash={document.verificationHash} logDocumentId={id} />
        : <ProposalDocument kurum={document.kurum} row={row} decision={document.decision} verificationUrl={document.verificationUrl} logDocumentId={id} />}
    </div>
  </div>;
}
