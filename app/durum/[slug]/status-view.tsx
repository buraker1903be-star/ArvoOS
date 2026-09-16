/* Müşteri takip ekranlarının ortak, durumsuz (hook'suz) görünüm parçaları.
   /takip, /durum/[slug] ve /is-durumu aynı durum eşlemesini, ilerleme
   halkasını, aşama çizelgesini ve finans özetini kullanır. Hook içermez;
   hem sunucu hem istemci bileşenlerinden içe aktarılabilir.

   Yalnızca sunum: sorgu eylemlerinin döndürdüğü alanlardan türetilir,
   müşteriye yeni bir veri açılmaz. */

import type { CSSProperties, ReactNode } from "react";

export type StatusTone = "live" | "planned" | "waiting" | "done" | "cancelled";
export type StatusInfo = { label: string; tone: StatusTone; note: string };

const DONE: StatusInfo = { label: "Tamamlandı", tone: "done", note: "Dosyanız tamamlandı. Bizi tercih ettiğiniz için teşekkür ederiz." };

const workflowStatuses: Record<string, StatusInfo> = {
  planned: { label: "Planlandı", tone: "planned", note: "Dosyanız planlandı; çalışma kısa süre içinde başlayacak." },
  in_progress: { label: "Devam Ediyor", tone: "live", note: "Ekibimiz dosyanız üzerinde çalışıyor." },
  blocked: { label: "Beklemede", tone: "waiting", note: "Dosyanız şu an beklemede. Süreç yeniden başladığında burada göreceksiniz." },
  completed: DONE,
  // Arşivlenen iş, müşteri için tamamlanmış iştir.
  archived: DONE,
  cancelled: { label: "İptal Edildi", tone: "cancelled", note: "Bu dosya iptal edildi." },
};

const contractStatuses: Record<string, StatusInfo> = {
  draft: { label: "Hazırlanıyor", tone: "planned", note: "Sözleşmeniz hazırlanıyor; hazır olduğunda buradan inceleyip imzalayabileceksiniz." },
  sent: { label: "İmza Bekliyor", tone: "waiting", note: "Sözleşmeniz onayınıza sunuldu. İnceleyip imzaladığınızda çalışma planlanır ve başlar." },
  signed: { label: "İmzalandı", tone: "planned", note: "Sözleşmeniz imzalandı; iş planınız hazırlanıyor." },
  completed: DONE,
  archived: DONE,
};

export function describeStatus(workflowStatus: string | null, contractStatus: string): StatusInfo {
  if (workflowStatus) return workflowStatuses[workflowStatus] ?? { label: workflowStatus, tone: "live", note: "" };
  return contractStatuses[contractStatus] ?? { label: contractStatus, tone: "planned", note: "" };
}

export const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

// Kuruş gösterilir: maximumFractionDigits 0 tutarı YUVARLIYORDU, yani aynı
// ekranda ödeme planı (takip-form.tsx'teki planMoney) kuruşlu, "Kalan bakiye"
// yuvarlanmış çıkıyordu — müşteri tek sayfada aynı para için iki farklı rakam
// görüyordu ve kalan bakiye 0,50 TL'ye kadar fazla yazılabiliyordu.
const moneyFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

export const money = (cents: number) => moneyFormat.format((cents ?? 0) / 100);
export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value));
export const formatDay = (value: string) => dayFormat.format(new Date(value));
export const formatTime = (value: string) => timeFormat.format(new Date(value));

/* --- Aşamalar ---
   Veritabanı adım adlarını müşteriye açmaz; aşamalar genel ilerleme
   yüzdesinden türetilir (eski ekranla aynı eşikler: her aşama %25). */
export const PHASES = ["Sözleşme", "Planlama", "Çalışma", "Kontrol", "Teslim"] as const;

export function phaseProgress(progress: number, tone: StatusTone) {
  const value = clampPercent(progress);
  if (tone === "done") return { reached: PHASES.length, current: -1 };
  // Eşiğine ulaşılan son aşama yürüyen aşamadır (%55 → Çalışma); sözleşme
  // imzalı olduğundan ilk aşama her zaman tamamdır, en erken Planlama sürer.
  const reached = PHASES.filter((_, index) => index === 0 || value >= index * 25).length;
  if (reached >= PHASES.length) return { reached, current: -1 };
  const current = tone === "cancelled" ? -1 : Math.max(reached - 1, 1);
  return { reached: tone === "cancelled" ? reached : current, current };
}

export function currentPhaseLabel(progress: number, status: StatusInfo) {
  if (status.tone === "done") return "Teslim edildi";
  if (status.tone === "cancelled") return "İptal edildi";
  const { current } = phaseProgress(progress, status.tone);
  return current >= 0 ? `${PHASES[current]} aşaması` : "Teslime hazır";
}

export function StatusPill({ status }: { status: StatusInfo }) {
  return (
    <span className="trk-pill" data-tone={status.tone}>
      <i aria-hidden="true" />
      {status.label}
    </span>
  );
}

export function ProgressRing({ value, tone, size = "lg" }: { value: number; tone: StatusTone; size?: "lg" | "md" }) {
  const percent = clampPercent(value);
  return (
    <div className={`trk-ring trk-ring-${size}`} data-tone={tone} role="img" aria-label={`Genel ilerleme yüzde ${percent}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="trk-ring-track" cx="60" cy="60" r="52" />
        {percent > 0 ? (
          <circle className="trk-ring-value" cx="60" cy="60" r="52" pathLength={100} style={{ strokeDashoffset: 100 - percent }} />
        ) : null}
      </svg>
      <span className="trk-ring-label" aria-hidden="true">
        <b>%{percent}</b>
        {size === "lg" ? <small>tamamlandı</small> : null}
      </span>
    </div>
  );
}

export function PhaseTimeline({ progress, tone }: { progress: number; tone: StatusTone }) {
  const { reached, current } = phaseProgress(progress, tone);
  return (
    <ol className="trk-phases" data-tone={tone} aria-label="Süreç aşamaları">
      {PHASES.map((phase, index) => {
        const isCurrent = index === current;
        const isDone = !isCurrent && index < reached;
        return (
          <li key={phase} className={isCurrent ? "is-current" : isDone ? "is-done" : undefined} aria-current={isCurrent ? "step" : undefined}>
            <span className="trk-phase-dot" aria-hidden="true">
              {isDone ? <IconCheck /> : isCurrent ? null : index + 1}
            </span>
            <span className="trk-phase-name">{phase}</span>
            <span className="trk-sr">{isDone ? " — tamamlandı" : isCurrent ? " — şu anki aşama" : " — sırada"}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressOverview({ progress, status, size = "lg" }: { progress: number; status: StatusInfo; size?: "lg" | "md" }) {
  return (
    <div className="trk-progress-summary">
      <ProgressRing value={progress} tone={status.tone} size={size} />
      <div className="trk-progress-text">
        <span className="trk-overline">Şu an</span>
        <strong className="trk-phase-now">{currentPhaseLabel(progress, status)}</strong>
        {status.note ? <p className="trk-status-note">{status.note}</p> : null}
      </div>
    </div>
  );
}

export function FinanceSummary({ total, paid, remaining }: { total: number; paid: number; remaining: number }) {
  const paidPercent = total > 0 ? clampPercent((paid / total) * 100) : 0;
  const settled = total > 0 && remaining <= 0;
  return (
    <div className="trk-finance">
      <div className="trk-finance-hero">
        <span className="trk-overline">Kalan bakiye</span>
        <strong className="trk-amount">{money(remaining)}</strong>
        {settled ? <span className="trk-pill" data-tone="done"><i aria-hidden="true" />Ödeme tamamlandı</span> : null}
      </div>
      <div className="trk-meter" role="img" aria-label={`Sözleşme tutarının yüzde ${paidPercent} kadarı ödendi`}>
        <span style={{ "--trk-meter": `${paidPercent}%` } as CSSProperties} />
      </div>
      <p className="trk-meter-caption" aria-hidden="true"><span>%{paidPercent} ödendi</span></p>
      <dl className="trk-rows">
        <div><dt>Sözleşme tutarı</dt><dd>{money(total)}</dd></div>
        <div><dt>Toplam tahsilat</dt><dd className="is-paid">{money(paid)}</dd></div>
      </dl>
    </div>
  );
}

export function LookupAlert({ children }: { children: ReactNode }) {
  return (
    <p className="trk-alert" role="alert">
      <IconAlert />
      <span>{children}</span>
    </p>
  );
}

/* Rota yüklenirken (loading.tsx) ve otomatik sorguda gösterilen iskelet. */
export function LookupSkeleton() {
  return (
    <div className="trk-skeleton" aria-hidden="true">
      <span className="trk-skel" style={{ width: "32%", height: 14 }} />
      <span className="trk-skel" style={{ width: "72%", height: 34 }} />
      <span className="trk-skel" style={{ width: "44%", height: 28, borderRadius: 999 }} />
      <div className="trk-skeleton-grid">
        <span className="trk-skel" style={{ height: 250, borderRadius: 20 }} />
        <span className="trk-skel" style={{ height: 250, borderRadius: 20 }} />
      </div>
      <span className="trk-skel" style={{ height: 180, borderRadius: 20 }} />
    </div>
  );
}

/* --- Simgeler (SF Symbols benzeri, 1.8px çizgi) --- */
type IconProps = { size?: number };
const svgProps = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false,
});

export const IconCheck = ({ size = 14 }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.6}><path d="m5 12.5 4.2 4.2L19 7" /></svg>;
export const IconLock = ({ size = 16 }: IconProps) => <svg {...svgProps(size)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" /></svg>;
export const IconSearch = ({ size = 18 }: IconProps) => <svg {...svgProps(size)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>;
export const IconClock = ({ size = 15 }: IconProps) => <svg {...svgProps(size)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IconDoc = ({ size = 18 }: IconProps) => <svg {...svgProps(size)}><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" /></svg>;
export const IconChevron = ({ size = 16 }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.2}><path d="m9.5 6 6 6-6 6" /></svg>;
export const IconArrowUp = ({ size = 18 }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.4}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
export const IconChat = ({ size = 20 }: IconProps) => <svg {...svgProps(size)}><path d="M20 11.5c0 4.1-3.6 7.5-8 7.5a8.7 8.7 0 0 1-3.2-.6L4 20l1.3-3.9A7.2 7.2 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5Z" /></svg>;
export const IconAlert = ({ size = 18 }: IconProps) => <svg {...svgProps(size)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8v5M12 16.2v.01" strokeWidth={2.2} /></svg>;
export const IconDownload = ({ size = 16 }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.1}><path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5" /><path d="M5.5 19.5h13" /></svg>;
export const IconShield =({ size = 16 }: IconProps) => <svg {...svgProps(size)}><path d="M12 3.5 5 6.3v5.2c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6.3Z" /><path d="m9 12 2.2 2.2L15.3 10" /></svg>;
