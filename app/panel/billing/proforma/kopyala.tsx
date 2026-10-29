"use client";

import { useState } from "react";

/* IBAN'ı ve havale açıklamasını tek tıkla kopyalar: elle seçerken boşluk ya da bir hane düşüyordu. */
export function Kopyala({ metin, etiket = "Kopyala" }: { metin: string; etiket?: string }) {
  const [oldu, setOldu] = useState(false);
  return (
    <button
      type="button"
      className="doc-kopyala"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(metin);
          setOldu(true);
          window.setTimeout(() => setOldu(false), 1600);
        } catch {
          // Pano izni yoksa kullanıcı metni elle seçebilir; düğme sessizce kalır.
        }
      }}
    >
      {oldu ? "Kopyalandı ✓" : etiket}
    </button>
  );
}
