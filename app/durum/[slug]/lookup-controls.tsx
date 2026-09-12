"use client";

import { useFormStatus } from "react-dom";

/* Sorgu formlarının ana düğmesi: bekleme sırasında dönen gösterge ve
   ekran okuyucu için aria-busy. */
export function LookupSubmitButton({ label = "Sorgula", pendingLabel = "Sorgulanıyor…" }: { label?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="trk-primary" type="submit" disabled={pending} aria-busy={pending || undefined}>
      {pending ? <span className="trk-spinner" aria-hidden="true" /> : null}
      <span>{pending ? pendingLabel : label}</span>
    </button>
  );
}
