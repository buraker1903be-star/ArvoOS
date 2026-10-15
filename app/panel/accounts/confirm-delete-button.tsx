"use client";

import { useState } from "react";

export function ConfirmDeleteButton({
  label,
  confirmMessage,
  /*
    Silme, kaydetme formunun İÇİNDE bir düğmeyse (hazır cevaplar: aynı
    form hem "Kaydet" hem "Sil" taşıyor, iç içe form yazılamadığı için)
    gönderim hedefi formAction ile veriliyor. Boşsa formun kendi
    action'ı çalışır — eski davranış.
  */
  formAction,
  formNoValidate,
}: {
  label: string;
  confirmMessage: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="confirm-delete-inline">
        <small>{confirmMessage}</small>
        <span>
          <button type="button" className="panel-secondary" onClick={() => setConfirming(false)}>Vazgeç</button>
          <button type="submit" className="panel-danger" formAction={formAction} formNoValidate={formNoValidate}>Evet, Sil</button>
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="panel-danger"
      onClick={() => setConfirming(true)}
    >
      {label}
    </button>
  );
}
