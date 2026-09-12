"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { discardPortalUploads, registerPortalFiles, removePortalFile, setPortalFileAccessRule, updatePortalFileNote } from "../portal-files-actions";
import {
  cleanPortalFileName, formatBytes, PORTAL_ACCEPT, PORTAL_ACCESS_RULES, PORTAL_BUCKET, PORTAL_EXTENSIONS,
  PORTAL_MAX_BYTES, PORTAL_MAX_FILES_PER_BATCH, portalExtension, type PortalAccessRule,
} from "../portal-files-shared";

// İş detayı: "Müşteri portalı dosyaları" kartı. Dosya tarayıcıdan doğrudan
// özel kovaya yüklenir (ilerleme çubuğu için XHR), ardından sunucu işlemi
// nesneyi depodan doğrulayıp kaydı ekler. Kilit müşteri tarafında
// veritabanında uygulanır; buradaki rozet yalnızca bilgi verir.

export type StaffPortalFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  accessRule: PortalAccessRule;
  createdLabel: string;
  uploaderName: string;
  downloads: number;
};

export type StaffPortalPayment = {
  hasContract: boolean;
  settled: boolean;
  /** Yalnızca yöneticilere; operasyon ekibi tutar görmez. */
  remainingLabel: string | null;
  paidPercent: number | null;
};

type QueueStatus = "ready" | "uploading" | "uploaded" | "failed";
type QueueItem = { key: string; file: File; name: string; ext: string | null; error: string | null; progress: number; status: QueueStatus; path?: string };

const kindOf = (ext: string | null) => {
  if (!ext) return "other";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "txt"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (["ppt", "pptx"].includes(ext)) return "slide";
  if (ext === "zip") return "zip";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return "image";
  return "other";
};

function storageErrorMessage(status: number, responseText: string) {
  if (status === 413 || /size|too large|exceed/i.test(responseText)) return "Dosya 50 MB sınırını aşıyor.";
  if (status === 415 || /mime|content type/i.test(responseText)) return "Bu dosya türü desteklenmiyor.";
  if (status === 401 || status === 403 || /row-level security|unauthorized/i.test(responseText)) return "Bu işe dosya yükleme yetkiniz yok.";
  if (status === 409) return "Aynı dosya zaten yüklenmiş.";
  return "Dosya yüklenemedi. Lütfen tekrar deneyin.";
}

function uploadObject(path: string, file: File, contentType: string, token: string, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${PORTAL_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""));
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(storageErrorMessage(xhr.status, xhr.responseText))));
    xhr.onerror = () => reject(new Error("Bağlantı kesildi. Lütfen tekrar deneyin."));
    xhr.onabort = () => reject(new Error("Yükleme iptal edildi."));
    xhr.send(file);
  });
}

const DocIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5" /></svg>
);
const UploadIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" /></svg>
);

export function PortalFilesCard({
  workflowId, organizationId, payment, files, downloadsConfigured,
}: {
  workflowId: string;
  organizationId: string;
  payment: StaffPortalPayment;
  files: StaffPortalFile[];
  downloadsConfigured: boolean;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [accessRule, setAccessRule] = useState<PortalAccessRule>("after_full_payment");
  const formRef = useRef<HTMLFormElement>(null);
  const filesFieldRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, next: Partial<QueueItem>) =>
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));

  function addFiles(list: FileList | null) {
    if (!list?.length || busy) return;
    setUploadError(null);
    setQueue((current) => {
      const next = [...current];
      for (const file of Array.from(list)) {
        const name = cleanPortalFileName(file.name);
        const ext = portalExtension(name);
        let error: string | null = null;
        if (!ext) error = "Desteklenmeyen dosya türü.";
        else if (file.size === 0) error = "Dosya boş.";
        else if (file.size > PORTAL_MAX_BYTES) error = `Dosya 50 MB sınırını aşıyor (${formatBytes(file.size)}).`;
        else if (next.filter((item) => !item.error).length >= PORTAL_MAX_FILES_PER_BATCH) error = `Tek seferde en fazla ${PORTAL_MAX_FILES_PER_BATCH} dosya.`;
        next.push({ key: `${crypto.randomUUID()}`, file, name, ext, error, progress: 0, status: "ready" });
      }
      return next;
    });
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  async function startUpload() {
    const pending = queue.filter((item) => !item.error && item.status !== "uploaded");
    const alreadyUploaded = queue.filter((item) => item.status === "uploaded" && item.path);
    if (!pending.length && !alreadyUploaded.length) {
      setUploadError("Gönderilecek geçerli bir dosya seçin.");
      return;
    }
    setBusy(true);
    setUploadError(null);

    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setBusy(false);
      setUploadError("Oturumunuz sona ermiş. Sayfayı yenileyip tekrar deneyin.");
      return;
    }

    const uploaded: { path: string; name: string }[] = alreadyUploaded.map((item) => ({ path: item.path!, name: item.name }));
    for (const item of pending) {
      const ext = item.ext!;
      const path = `${organizationId}/${workflowId}/${crypto.randomUUID()}.${ext}`;
      patch(item.key, { status: "uploading", progress: 0, error: null });
      try {
        await uploadObject(path, item.file, PORTAL_EXTENSIONS[ext], token, (ratio) => patch(item.key, { progress: ratio }));
        patch(item.key, { status: "uploaded", progress: 1, path });
        uploaded.push({ path, name: item.name });
      } catch (error) {
        patch(item.key, { status: "failed", progress: 0, error: error instanceof Error ? error.message : "Dosya yüklenemedi." });
      }
    }

    if (!uploaded.length || !filesFieldRef.current || !formRef.current) {
      setBusy(false);
      return;
    }
    filesFieldRef.current.value = JSON.stringify(uploaded);
    // Gerçek form gönderimi: panel bildirimi (flash-toast) submit olayını dinler.
    formRef.current.requestSubmit();
  }

  async function registerAction(formData: FormData) {
    let uploadedPaths: string[] = [];
    try {
      uploadedPaths = (JSON.parse(String(formData.get("files") ?? "[]")) as { path: string }[]).map((item) => item.path);
      const result = await registerPortalFiles(formData);
      if (result?.ok) {
        setQueue((current) => current.filter((item) => item.status !== "uploaded"));
        if (formRef.current) {
          const note = formRef.current.elements.namedItem("note");
          if (note instanceof HTMLTextAreaElement) note.value = "";
        }
      } else {
        // Sunucu yarım yüklemeleri sildi; kuyruk yeniden denemeye hazır.
        setQueue((current) => current.map((item) => (item.status === "uploaded" ? { ...item, status: "ready", path: undefined, progress: 0 } : item)));
      }
    } catch {
      void discardPortalUploads(workflowId, uploadedPaths).catch(() => undefined);
      setQueue((current) => current.map((item) => (item.status === "uploaded" ? { ...item, status: "ready", path: undefined, progress: 0 } : item)));
      setUploadError("Dosyalar kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const validCount = queue.filter((item) => !item.error || item.status === "failed").length;
  const totalProgress = queue.length ? Math.round((queue.reduce((sum, item) => sum + (item.error && item.status !== "failed" ? 0 : item.progress), 0) / Math.max(validCount, 1)) * 100) : 0;

  return (
    <section className="opd-card opd-pf" id="musteri-dosyalari" aria-labelledby="opd-pf-title">
      <header className="opd-card-head">
        <div>
          <h2 id="opd-pf-title">Müşteri portalı dosyaları</h2>
          <p>Müşterinin takip ekranındaki “Dosyalarınız” bölümünde görünür</p>
        </div>
        <span className="status-pill">{files.length} dosya</span>
      </header>

      {!payment.hasContract ? (
        <p className="opd-pf-banner" data-tone="info">
          <b>Müşteri portalı kapalı</b>
          <span>Bu iş bir sözleşmeye bağlı değil; müşterinin takip kodu olmadığı için dosya gönderilemez.</span>
        </p>
      ) : (
        <div className="opd-pf-banner" data-tone={payment.settled ? "success" : "warning"} role="status">
          <b>{payment.settled ? "Ödeme tamamlandı" : "Ödeme bekleniyor"}</b>
          <span>
            {payment.settled
              ? "“Ödeme tamamlanınca açılır” kuralındaki dosyalar müşteriye açık."
              : `“Ödeme tamamlanınca açılır” kuralındaki dosyalar müşteride kilitli görünür${payment.remainingLabel ? ` · kalan ${payment.remainingLabel}` : ""}.`}
          </span>
          {payment.paidPercent !== null ? (
            <span className="opd-pf-meter" aria-hidden="true"><i style={{ width: `${payment.paidPercent}%` }} /></span>
          ) : null}
        </div>
      )}

      {payment.hasContract && !downloadsConfigured ? (
        <p className="opd-pf-banner" data-tone="danger" role="alert">
          <b>Müşteri indirmesi yapılandırılmamış</b>
          <span>Sunucuda SUPABASE_SECRET_KEY (ya da SUPABASE_SERVICE_ROLE_KEY) tanımlı değil. Dosyalar listede görünür ama müşteri indiremez; yöneticinize bildirin.</span>
        </p>
      ) : null}

      {payment.hasContract ? (
        <form ref={formRef} action={registerAction} className="opd-pf-upload">
          <input type="hidden" name="workflow_id" value={workflowId} />
          <input type="hidden" name="files" ref={filesFieldRef} defaultValue="[]" />
          <label
            className={`opd-pf-drop${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
            onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input ref={pickerRef} type="file" multiple accept={PORTAL_ACCEPT} onChange={onPick} disabled={busy} className="opd-pf-picker" />
            <span className="opd-pf-drop-icon"><UploadIcon /></span>
            <b>Dosyaları sürükleyip bırakın</b>
            <small>ya da <u>bilgisayardan seçin</u> · PDF, Word, Excel, PowerPoint, ZIP, görsel, TXT · en fazla 50 MB</small>
          </label>

          {queue.length ? (
            <ul className="opd-pf-queue" aria-label="Gönderilecek dosyalar">
              {queue.map((item) => (
                <li key={item.key} data-status={item.error && item.status !== "failed" ? "invalid" : item.status}>
                  <span className="opd-pf-type" data-kind={kindOf(item.ext)}>{item.ext ? item.ext.toUpperCase() : "?"}</span>
                  <span className="opd-pf-queue-body">
                    <b title={item.name}>{item.name}</b>
                    <small>
                      {formatBytes(item.file.size)}
                      {item.error ? <em> · {item.error}</em> : item.status === "uploading" ? ` · %${Math.round(item.progress * 100)}` : item.status === "uploaded" ? " · yüklendi" : ""}
                    </small>
                    {item.status === "uploading" || item.status === "uploaded" ? (
                      <span className="opd-pf-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)} aria-label={`${item.name} yükleniyor`}>
                        <i style={{ width: `${Math.round(item.progress * 100)}%` }} />
                      </span>
                    ) : null}
                  </span>
                  {!busy ? (
                    <button type="button" className="opd-pf-x" onClick={() => setQueue((current) => current.filter((entry) => entry.key !== item.key))} aria-label={`${item.name} dosyasını listeden çıkar`}>×</button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {queue.length ? (
            <div className="opd-pf-options">
              <label>Erişim kuralı
                <select name="access_rule" value={accessRule} onChange={(event) => setAccessRule(event.currentTarget.value as PortalAccessRule)} disabled={busy}>
                  {Object.entries(PORTAL_ACCESS_RULES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="wide">Müşteriye not (isteğe bağlı)
                <textarea name="note" maxLength={500} rows={2} placeholder="Ör. Onaylı proje çizimleri, revizyon 2" disabled={busy} />
              </label>
              <div className="opd-pf-actions">
                <small>{accessRule === "after_full_payment" ? "Müşteri, ödemesi tamamlanana kadar dosyayı göremez ve indiremez." : "Müşteri dosyayı ödeme durumundan bağımsız hemen indirebilir."}</small>
                <button type="button" className="panel-primary" onClick={startUpload} disabled={busy || !queue.some((item) => !item.error || item.status === "failed")}>
                  {busy ? `Gönderiliyor… %${totalProgress}` : "Müşteriye gönder"}
                </button>
              </div>
            </div>
          ) : null}
          {uploadError ? <p className="opd-pf-error" role="alert">{uploadError}</p> : null}
        </form>
      ) : null}

      {files.length ? (
        <ul className="opd-pf-list">
          {files.map((file) => {
            const ext = portalExtension(file.fileName);
            const open = file.accessRule === "immediate" || payment.settled;
            const href = `/panel/operations/${workflowId}/portal-files/${file.id}`;
            return (
              <li key={file.id}>
                <div className="opd-pf-row">
                  <span className="opd-pf-type" data-kind={kindOf(ext)}>{ext ? ext.toUpperCase() : <DocIcon />}</span>
                  <div className="opd-pf-main">
                    <a href={href} target="_blank" rel="noreferrer" className="opd-pf-name" title={`${file.fileName} — önizle`}>{file.fileName}</a>
                    <small>{formatBytes(file.sizeBytes)} · {file.createdLabel} · {file.uploaderName}{file.downloads ? ` · ${file.downloads} kez indirildi` : ""}</small>
                    {file.note ? <p className="opd-pf-note">{file.note}</p> : null}
                  </div>
                  <span className="status-pill" data-tone={open ? "success" : "warning"}>{open ? "Müşteri açabilir" : "Ödeme bekleniyor — kilitli"}</span>
                </div>
                <div className="opd-pf-tools">
                  <form action={setPortalFileAccessRule} key={`${file.id}-${file.accessRule}`} className="opd-pf-rule">
                    <input type="hidden" name="file_id" value={file.id} />
                    <input type="hidden" name="workflow_id" value={workflowId} />
                    <select name="access_rule" defaultValue={file.accessRule} aria-label={`${file.fileName} erişim kuralı`} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
                      {Object.entries(PORTAL_ACCESS_RULES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </form>
                  <a className="panel-secondary opd-pf-btn" href={`${href}?download=1`}>İndir</a>
                  <details className="opd-pf-note-edit">
                    <summary className="panel-secondary opd-pf-btn">{file.note ? "Notu düzenle" : "Not ekle"}</summary>
                    <form action={updatePortalFileNote} key={`${file.id}-${file.note ?? ""}`}>
                      <input type="hidden" name="file_id" value={file.id} />
                      <input type="hidden" name="workflow_id" value={workflowId} />
                      <textarea name="note" maxLength={500} rows={2} defaultValue={file.note ?? ""} aria-label={`${file.fileName} notu`} />
                      <button type="submit" className="panel-primary opd-pf-btn">Notu kaydet</button>
                    </form>
                  </details>
                  <form action={removePortalFile} className="opd-pf-remove">
                    <input type="hidden" name="file_id" value={file.id} />
                    <input type="hidden" name="workflow_id" value={workflowId} />
                    <ConfirmDeleteButton label="Kaldır" confirmMessage="Müşteri bu dosyayı artık göremez ve indiremez. Kaldırılsın mı?" />
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : payment.hasContract ? (
        <p className="opd-empty">Henüz dosya gönderilmedi. Teslim dosyalarını buradan müşterinin takip ekranına iletebilirsiniz.</p>
      ) : null}
    </section>
  );
}
