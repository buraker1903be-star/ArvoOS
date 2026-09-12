"use client";

import { useEffect, useState } from "react";
import type { CustomerPortalFile } from "../../takip/portal-files-data";
import { formatDay, IconAlert, IconDownload, IconLock, money } from "./status-view";

// Müşteri takip ekranı: "Dosyalarınız". Kilit burada yalnızca gösterilir;
// asıl kapı sunucudadır (/api/portal-files/[id] → veritabanı fonksiyonu).
// Kilitli dosyanın indirme bağlantısı hiç üretilmez, depolama yolu istemciye
// hiç gelmez. Takip kodu adres çubuğuna değil, POST gövdesine yazılır.

const kindOf = (name: string) => {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  if (ext === "pdf") return { ext: "PDF", kind: "pdf" };
  if (["doc", "docx", "txt"].includes(ext)) return { ext: ext.toUpperCase(), kind: "doc" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { ext: ext.toUpperCase(), kind: "sheet" };
  if (["ppt", "pptx"].includes(ext)) return { ext: ext.toUpperCase(), kind: "slide" };
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return { ext: ext === "jpeg" ? "JPG" : ext.toUpperCase(), kind: "image" };
  if (ext === "zip") return { ext: "ZIP", kind: "zip" };
  return { ext: ext.toUpperCase() || "DOSYA", kind: "other" };
};

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}

type DownloadState = { id: string; status: "pending" | "error"; message?: string } | null;

export function CustomerFiles({
  code, initialFiles, onRefresh, showAmount = true,
}: {
  code: string;
  initialFiles: CustomerPortalFile[];
  /** Sekmeye dönüldüğünde (ör. ödeme sonrası) listeyi tazeler. */
  onRefresh?: (code: string) => Promise<CustomerPortalFile[] | null>;
  /** Bu ekrandaki ödeme kartı aynı kaynaktan geliyorsa kalan tutar yazılır. */
  showAmount?: boolean;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [download, setDownload] = useState<DownloadState>(null);

  useEffect(() => {
    if (!onRefresh) return;
    const refresh = async () => {
      if (document.hidden) return;
      const fresh = await onRefresh(code).catch(() => null);
      if (fresh) setFiles(fresh);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [code, onRefresh]);

  const locked = files.filter((file) => file.locked);
  const remaining = files[0]?.remaining_amount ?? 0;
  const paymentUrl = files.find((file) => file.payment_url)?.payment_url ?? null;

  async function startDownload(file: CustomerPortalFile) {
    if (download?.status === "pending") return;
    setDownload({ id: file.id, status: "pending" });
    try {
      const response = await fetch(`/api/portal-files/${encodeURIComponent(file.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string; reason?: string };
      if (!response.ok || !body.url) {
        if (body.reason === "locked") setFiles((current) => current.map((item) => (item.id === file.id ? { ...item, locked: true } : item)));
        setDownload({ id: file.id, status: "error", message: body.error || "Dosya indirilemedi. Lütfen tekrar deneyin." });
        return;
      }
      // İmzalı bağlantı 60 sn geçerli ve "ek" olarak iner; sayfa yerinde kalır.
      window.location.assign(body.url);
      setDownload(null);
    } catch {
      setDownload({ id: file.id, status: "error", message: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." });
    }
  }

  return (
    <section className="trk-card trk-files-card" aria-labelledby="trk-files-title">
      <div className="trk-card-head">
        <h2 id="trk-files-title">Dosyalarınız</h2>
        {files.length ? <span>{files.length} dosya</span> : null}
      </div>

      {locked.length ? (
        <div className="trk-files-locked" role="note">
          <span className="trk-files-locked-icon" aria-hidden="true"><IconLock size={18} /></span>
          <div>
            <b>{locked.length === files.length ? (files.length > 1 ? "Dosyalarınız hazır" : "Dosyanız hazır") : `${locked.length} dosya ödeme bekliyor`}</b>
            <p>
              {showAmount && remaining > 0
                ? <>Kalan ödemeniz (<strong>{money(remaining)}</strong>) tamamlandığında açılacak.</>
                : "Kalan ödemeniz tamamlandığında açılacak."}
            </p>
          </div>
          {paymentUrl ? (
            <a className="trk-pay" href={paymentUrl} target="_blank" rel="noopener noreferrer">
              Şimdi öde<span className="trk-sr"> (güvenli ödeme sayfası yeni sekmede açılır)</span>
            </a>
          ) : null}
        </div>
      ) : null}

      {files.length ? (
        <ul className="trk-files">
          {files.map((file) => {
            const { ext, kind } = kindOf(file.file_name);
            const state = download?.id === file.id ? download : null;
            return (
              <li key={file.id} className={file.locked ? "is-locked" : undefined}>
                <div className="trk-file">
                  <span className="trk-file-type" data-kind={kind} aria-hidden="true">
                    {ext}
                    {file.locked ? <i className="trk-file-lock"><IconLock size={12} /></i> : null}
                  </span>
                  <span className="trk-file-text">
                    <b title={file.file_name}>{file.file_name}</b>
                    <small>{formatSize(file.size_bytes)} · {formatDay(file.created_at)}</small>
                  </span>
                  {file.locked ? (
                    <span className="trk-file-badge"><IconLock size={13} />Kilitli<span className="trk-sr"> — ödeme tamamlandığında açılır</span></span>
                  ) : (
                    <button
                      type="button"
                      className="trk-download"
                      onClick={() => startDownload(file)}
                      disabled={state?.status === "pending"}
                      aria-busy={state?.status === "pending" || undefined}
                      aria-label={`${file.file_name} dosyasını indir`}
                    >
                      {state?.status === "pending" ? <span className="trk-spinner" aria-hidden="true" /> : <IconDownload />}
                      <span aria-hidden="true">{state?.status === "pending" ? "Hazırlanıyor" : "İndir"}</span>
                    </button>
                  )}
                </div>
                {file.note ? <p className="trk-file-note">{file.note}</p> : null}
                {state?.status === "error" ? (
                  <p className="trk-inline-error trk-file-error" role="alert"><IconAlert size={15} />{state.message}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="trk-files-empty">
          <span aria-hidden="true"><IconDownload size={22} /></span>
          <b>Henüz dosya yok</b>
          <p>Ekibimiz teslim dosyalarınızı hazırladığında burada göreceksiniz.</p>
        </div>
      )}
    </section>
  );
}
