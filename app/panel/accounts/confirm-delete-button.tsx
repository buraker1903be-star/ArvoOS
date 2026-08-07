"use client";

import { useState } from "react";

export function ConfirmDeleteButton({ label, confirmMessage }: { label: string; confirmMessage: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="confirm-delete-inline">
        <small>{confirmMessage}</small>
        <span>
          <button type="button" className="panel-secondary" onClick={() => setConfirming(false)}>Vazgeç</button>
          <button type="submit" className="panel-danger">Evet, Sil</button>
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
