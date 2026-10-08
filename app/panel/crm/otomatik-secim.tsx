"use client";

import type { ReactNode } from "react";

/*
  Değişince formunu gönderen seçim kutusu. Liste süzgeçleri adreste
  (GET formu); ayrı bir "Filtrele" düğmesi yerine seçim anında uygulanır.
  JavaScript yoksa form yine Enter ile gönderilebilir.
*/
export function OtomatikSecim({ name, defaultValue, className, label, children }: { name: string; defaultValue: string; className?: string; label: string; children: ReactNode }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} aria-label={label} onChange={(olay) => olay.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}
