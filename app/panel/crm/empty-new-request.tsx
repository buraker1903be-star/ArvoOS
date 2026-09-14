"use client";

/**
 * Boş talep listesindeki düğme: formu ikinci kez çizmek yerine sayfa
 * başlığındaki "+ Yeni talep" çekmecesini açar (müşteri sorgulamayla aynı yol).
 */
export function EmptyNewRequestButton() {
  return (
    <button
      className="panel-primary"
      type="button"
      onClick={() => document.querySelector<HTMLButtonElement>(".crm-new-request-trigger")?.click()}
    >
      + İlk talebi girin
    </button>
  );
}
