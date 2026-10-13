"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDeleteButton } from "../../accounts/confirm-delete-button";
import { registerPortalFiles, discardPortalUploads } from "../portal-files-actions";
import { registerTeamFiles, removeTeamFile } from "../team-files-actions";
import {
  cleanPortalFileName, formatBytes, PORTAL_ACCEPT, PORTAL_ACCESS_RULES, PORTAL_BUCKET, PORTAL_EXTENSIONS,
  PORTAL_MAX_BYTES, PORTAL_MAX_FILES_PER_BATCH, portalExtension, type PortalAccessRule,
} from "../portal-files-shared";
import { TEAM_BUCKET } from "../team-files-shared";
import "./saha-dosyalari.css";

/*
  SAHADAN FOTOĞRAF VE DOSYA (13.10.2026). Kurum sahibinin tarifi: sahadaki
  personel kameradan çektiği fotoğrafı ya da belgeyi "doğrudan işe veya
  müşteriye" ekleyebilmeli, çoğunu telefondan yapıyor.

  - "Fotoğraf çek" telefonun arka kamerasını açar (capture); "Dosya seç"
    galeri ve dosyalar.
  - Gideceği yer: "Ekip içi" (operation_team_files — müşteri görmez) ya da
    "Müşteriye gönder" (mevcut müşteri portalı dosyaları; erişim kuralıyla).
  - Telefon fotoğrafları 4–12 MB; sahada mobil veriyle yükleme dakikalar
    sürüyordu. Yüklemeden önce uzun kenar 2048 px'e küçültülüp JPEG'e
    çevriliyor (okunaklılık için yeterli). Küçültme sonucu büyüdüyse ya
    da tarayıcı çözemiyorsa (HEIC) dosya olduğu gibi gider.
  - Yükleme müşteri dosyalarıyla aynı yol: tarayıcıdan özel kovaya (ilerleme
    çubuğu), sonra sunucu nesneyi depodan doğrulayıp kaydı ekler.
*/

export type EkipDosyasi = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdLabel: string;
  uploaderName: string;
  /** Kısa ömürlü imzalı adres (sunucuda üretildi); okunamadıysa null. */
  url: string | null;
};

type Kuyruk = { key: string; file: File; name: string; ext: string | null; onizleme: string | null; error: string | null; progress: number; durum: "hazir" | "yukleniyor" | "yuklendi" | "hata" };
type Hedef = "ekip" | "musteri";

const UZUN_KENAR = 2048;
const KUCULTULEBILIR = new Set(["image/jpeg", "image/png", "image/webp"]);

async function kucult(file: File): Promise<File> {
  if (!KUCULTULEBILIR.has(file.type) || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const oran = Math.min(1, UZUN_KENAR / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * oran);
    canvas.height = Math.round(bitmap.height * oran);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const ad = file.name.replace(/\.[^.]+$/, "") || "fotograf";
    return new File([blob], `${ad}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

function yukle(bucket: string, path: string, file: File, contentType: string, token: string, ilerleme: (oran: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""));
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (olay) => { if (olay.lengthComputable) ilerleme(olay.loaded / olay.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const metin = xhr.responseText;
      reject(new Error(
        xhr.status === 413 || /size|too large/i.test(metin) ? "Dosya 50 MB sınırını aşıyor."
          : xhr.status === 401 || xhr.status === 403 || /row-level security/i.test(metin) ? "Bu işe dosya ekleme yetkiniz yok."
            : "Dosya yüklenemedi. Tekrar deneyin.",
      ));
    };
    xhr.onerror = () => reject(new Error("Bağlantı kesildi. Tekrar deneyin."));
    xhr.send(file);
  });
}

export function SahaDosyalari({ workflowId, organizationId, portalAcik, dosyalar }: {
  workflowId: string;
  organizationId: string;
  /** İş bir sözleşmeye bağlıysa müşteriye gönderilebilir (takip ekranı var). */
  portalAcik: boolean;
  dosyalar: EkipDosyasi[];
}) {
  const [kuyruk, setKuyruk] = useState<Kuyruk[]>([]);
  const [hedef, setHedef] = useState<Hedef>("ekip");
  const [kural, setKural] = useState<PortalAccessRule>("immediate");
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const secici = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const alan = useRef<HTMLInputElement>(null);

  // Önizleme adresleri bellekte; kuyruktan çıkınca bırakılır.
  useEffect(() => () => { for (const k of kuyruk) if (k.onizleme) URL.revokeObjectURL(k.onizleme); }, [kuyruk]);

  const yamala = (key: string, ek: Partial<Kuyruk>) => setKuyruk((k) => k.map((o) => (o.key === key ? { ...o, ...ek } : o)));

  function ekle(liste: FileList | null) {
    if (!liste?.length || mesgul) return;
    setHata(null);
    setKuyruk((onceki) => {
      const yeni = [...onceki];
      for (const file of Array.from(liste)) {
        const name = cleanPortalFileName(file.name || "fotograf.jpg");
        const ext = portalExtension(name);
        let error: string | null = null;
        if (!ext) error = "Desteklenmeyen dosya türü.";
        else if (!file.size) error = "Dosya boş.";
        else if (file.size > PORTAL_MAX_BYTES) error = `50 MB sınırını aşıyor (${formatBytes(file.size)}).`;
        else if (yeni.filter((o) => !o.error).length >= PORTAL_MAX_FILES_PER_BATCH) error = `Tek seferde en fazla ${PORTAL_MAX_FILES_PER_BATCH} dosya.`;
        const onizleme = file.type.startsWith("image/") && !error ? URL.createObjectURL(file) : null;
        yeni.push({ key: crypto.randomUUID(), file, name, ext, onizleme, error, progress: 0, durum: "hazir" });
      }
      return yeni;
    });
  }
  const secildi = (olay: ChangeEvent<HTMLInputElement>) => { ekle(olay.currentTarget.files); olay.currentTarget.value = ""; };

  async function gonder() {
    const bekleyen = kuyruk.filter((o) => !o.error);
    if (!bekleyen.length) { setHata("Gönderilecek geçerli bir dosya seçin."); return; }
    setMesgul(true);
    setHata(null);
    const { data } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setMesgul(false); setHata("Oturumunuz sona ermiş. Sayfayı yenileyip tekrar deneyin."); return; }

    const bucket = hedef === "musteri" ? PORTAL_BUCKET : TEAM_BUCKET;
    const yuklenen: { path: string; name: string }[] = [];
    for (const o of bekleyen) {
      yamala(o.key, { durum: "yukleniyor", progress: 0 });
      try {
        const dosya = await kucult(o.file);
        const ad = dosya === o.file ? o.name : cleanPortalFileName(dosya.name);
        const ext = portalExtension(ad) ?? o.ext!;
        const path = `${organizationId}/${workflowId}/${crypto.randomUUID()}.${ext}`;
        await yukle(bucket, path, dosya, PORTAL_EXTENSIONS[ext], token, (oran) => yamala(o.key, { progress: oran }));
        yamala(o.key, { durum: "yuklendi", progress: 1 });
        yuklenen.push({ path, name: ad });
      } catch (error) {
        yamala(o.key, { durum: "hata", error: error instanceof Error ? error.message : "Yüklenemedi." });
      }
    }
    if (!yuklenen.length || !alan.current || !form.current) { setMesgul(false); return; }
    alan.current.value = JSON.stringify(yuklenen);
    // Gerçek form gönderimi: panel bildirimi (flash-toast) submit olayını dinliyor.
    form.current.requestSubmit();
  }

  async function kaydet(formData: FormData) {
    const yollar = (JSON.parse(String(formData.get("files") ?? "[]")) as { path: string }[]).map((o) => o.path);
    try {
      const sonuc = hedef === "musteri" ? await registerPortalFiles(formData) : await registerTeamFiles(formData);
      if (sonuc?.ok) setKuyruk([]);
      else setKuyruk((k) => k.map((o) => (o.durum === "yuklendi" ? { ...o, durum: "hazir", progress: 0 } : o)));
    } catch {
      if (hedef === "musteri") void discardPortalUploads(workflowId, yollar).catch(() => undefined);
      setHata("Dosyalar kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setMesgul(false);
    }
  }

  const gecerli = kuyruk.filter((o) => !o.error).length;

  return (
    <div className="saha-dosya">
      <div className="saha-dosya-sec">
        <button type="button" className="panel-primary saha-kamera" onClick={() => kamera.current?.click()} disabled={mesgul}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          Fotoğraf çek
        </button>
        <button type="button" className="panel-secondary" onClick={() => secici.current?.click()} disabled={mesgul}>Dosya seç</button>
        <input ref={kamera} type="file" accept="image/*" capture="environment" onChange={secildi} hidden />
        <input ref={secici} type="file" accept={`${PORTAL_ACCEPT},image/*`} multiple onChange={secildi} hidden />
      </div>

      {kuyruk.length ? (
        <div className="saha-dosya-kuyruk">
          <div className="saha-hedef" role="radiogroup" aria-label="Nereye eklensin">
            <button type="button" role="radio" aria-checked={hedef === "ekip"} className={hedef === "ekip" ? "is-active" : undefined} onClick={() => setHedef("ekip")} disabled={mesgul}>Ekip içi</button>
            <button type="button" role="radio" aria-checked={hedef === "musteri"} className={hedef === "musteri" ? "is-active" : undefined} onClick={() => setHedef("musteri")} disabled={mesgul || !portalAcik} title={portalAcik ? undefined : "Sözleşmeye bağlı olmayan işte müşteri ekranı yok"}>Müşteriye gönder</button>
          </div>
          <p className="saha-hedef-not">{hedef === "ekip" ? "Yalnızca işi görebilen ekip görür; müşteri görmez." : "Müşterinin takip ekranındaki “Dosyalarınız” bölümüne gider ve müşteriye bilgi mesajı yazılır."}</p>
          {hedef === "musteri" ? (
            <label className="saha-kural">Müşteri ne zaman açabilsin
              <select value={kural} onChange={(o) => setKural(o.target.value as PortalAccessRule)} disabled={mesgul}>
                {Object.entries(PORTAL_ACCESS_RULES).map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
              </select>
            </label>
          ) : null}
          <ul>
            {kuyruk.map((o) => (
              <li key={o.key} data-durum={o.durum}>
                {o.onizleme ? <img src={o.onizleme} alt="" /> : <span className="saha-dosya-simge" aria-hidden="true">{(o.ext ?? "?").toUpperCase()}</span>}
                <span className="saha-dosya-ad">
                  <b>{o.name}</b>
                  <small>{o.error ?? (o.durum === "yukleniyor" ? `Yükleniyor %${Math.round(o.progress * 100)}` : o.durum === "yuklendi" ? "Yüklendi" : formatBytes(o.file.size))}</small>
                  {o.durum === "yukleniyor" ? <i className="saha-ilerleme"><b style={{ width: `${Math.round(o.progress * 100)}%` }} /></i> : null}
                </span>
                {!mesgul ? <button type="button" className="saha-cikar" aria-label={`${o.name} listeden çıkar`} onClick={() => setKuyruk((k) => k.filter((x) => x.key !== o.key))}>×</button> : null}
              </li>
            ))}
          </ul>
          {hata ? <p className="saha-hata" role="alert">{hata}</p> : null}
          <form ref={form} action={kaydet} className="saha-gonder">
            <input type="hidden" name="workflow_id" value={workflowId} />
            <input type="hidden" name="access_rule" value={kural} />
            <input ref={alan} type="hidden" name="files" defaultValue="[]" />
            <input name="note" maxLength={500} placeholder="Not (isteğe bağlı)" disabled={mesgul} aria-label="Not" />
            <button type="button" className="panel-primary" onClick={gonder} disabled={mesgul || !gecerli}>
              {mesgul ? "Gönderiliyor…" : `${gecerli} dosyayı ${hedef === "musteri" ? "müşteriye gönder" : "işe ekle"}`}
            </button>
          </form>
        </div>
      ) : null}

      <div className="saha-dosya-liste">
        <h3>Ekip içi dosyalar <small>{dosyalar.length}</small></h3>
        {dosyalar.length ? (
          <ul>
            {dosyalar.map((d) => (
              <li key={d.id}>
                {d.url && d.mimeType.startsWith("image/") && d.mimeType !== "image/heic"
                  ? <a href={d.url} target="_blank" rel="noreferrer" className="saha-kucuk"><img src={d.url} alt={d.fileName} loading="lazy" /></a>
                  : <span className="saha-dosya-simge" aria-hidden="true">{(portalExtension(d.fileName) ?? "?").toUpperCase()}</span>}
                <span className="saha-dosya-ad">
                  <b>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.fileName}</a> : d.fileName}</b>
                  <small>{d.uploaderName} · {d.createdLabel} · {formatBytes(d.sizeBytes)}</small>
                  {d.note ? <small className="saha-not">{d.note}</small> : null}
                </span>
                <form action={removeTeamFile}>
                  <input type="hidden" name="file_id" value={d.id} />
                  <input type="hidden" name="workflow_id" value={workflowId} />
                  <ConfirmDeleteButton label="Kaldır" confirmMessage="Dosya işten kaldırılsın mı?" />
                </form>
              </li>
            ))}
          </ul>
        ) : <p className="saha-bos">Henüz ekip içi dosya yok. Sahadan fotoğraf ya da belge ekleyebilirsiniz.</p>}
      </div>
    </div>
  );
}
