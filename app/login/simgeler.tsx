/*
  GİRİŞ EKRANININ SİMGELERİ (26.11.2026).

  ArvoLab aynı simgeleri lucide-react'ten alıyor (Languages, Check, Sun,
  Moon, Monitor, ArrowRight, Eye, EyeOff). ArvoOS'ta o paket YOK ve tek
  bir ekran için bağımlılık eklemek pahalı: simgeler burada aynı
  çizimle, aynı 24'lük ızgarada ve aynı kalınlıkla yeniden yazıldı.
  Boyut ve kalınlık çağıran yerde ArvoLab'daki değerlerle veriliyor.

  Hepsi aria-hidden: anlamı yanlarındaki metin ya da düğmenin
  aria-label'ı taşır.
*/
type SimgeOzellikleri = { size?: number; strokeWidth?: number; className?: string };

function Govde({ size = 16, strokeWidth = 2, className, children }: SimgeOzellikleri & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function DilSimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </Govde>
  );
}

export function OnaySimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Govde>
  );
}

export function GunesSimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Govde>
  );
}

export function AySimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Govde>
  );
}

export function EkranSimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </Govde>
  );
}

export function OkSimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Govde>
  );
}

export function GozSimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Govde>
  );
}

export function GozKapaliSimgesi(p: SimgeOzellikleri) {
  return (
    <Govde {...p}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </Govde>
  );
}
