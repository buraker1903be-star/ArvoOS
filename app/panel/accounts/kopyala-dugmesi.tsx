"use client";

import { useState } from "react";

/** Ödeme bağlantısını panoya kopyalar; WhatsApp numarası bağlı olmayan kurum bağlantıyı kendisi iletir. */
export function KopyalaDugmesi({ metin }: { metin: string }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
      window.setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      setKopyalandi(false);
    }
  };
  return (
    <button type="button" className="panel-secondary" onClick={() => void kopyala()}>
      {kopyalandi ? "Kopyalandı" : "Kopyala"}
    </button>
  );
}
