"use client";

import { useState } from "react";

/**
 * Bir metni panoya kopyalar (ödeme bağlantısı, kurum anahtarı, takip kodu).
 *
 * KOPYALANAMADIĞINI SÖYLER. Eskiden `catch` yalnızca durumu sıfırlıyordu:
 * pano izni verilmemişse ya da sayfa güvenli bağlamda değilse düğme
 * basılıyor, hiçbir şey olmuyor ve kullanıcı metnin panosunda olduğunu
 * sanıyordu. Yapıştırdığında çıkan şey bir öncekiydi.
 */
export function KopyalaDugmesi({ metin, etiket = "Kopyala" }: { metin: string; etiket?: string }) {
  const [durum, setDurum] = useState<"hazir" | "oldu" | "olmadi">("hazir");
  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(metin);
      setDurum("oldu");
    } catch {
      setDurum("olmadi");
    }
    window.setTimeout(() => setDurum("hazir"), 2500);
  };
  return (
    <button
      type="button"
      className="panel-secondary"
      onClick={() => void kopyala()}
      /* Metin değişince ekran okuyucu da duysun. */
      aria-live="polite"
      title={durum === "olmadi" ? "Tarayıcı panoya yazmaya izin vermedi; metni elle seçin." : undefined}
    >
      {durum === "oldu" ? "Kopyalandı" : durum === "olmadi" ? "Kopyalanamadı" : etiket}
    </button>
  );
}
