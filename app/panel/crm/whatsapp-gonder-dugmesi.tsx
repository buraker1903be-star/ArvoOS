"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { belgeyiWhatsappGonder } from "./whatsapp-gonder";

/*
  "WhatsApp ile gönder" düğmesi.

  Eskiden bu bir bağlantıydı ve `wa.me/?text=...` açıyordu: personel
  WhatsApp Web'e düşüyor, numarayı elle seçiyor, mesajı yapıştırıyordu.
  Artık mesaj panelden, kurumun numarasından gidiyor ve kaydı tutuluyor.

  Onay soruyoruz: eski akışta WhatsApp Web açılıyordu ve personel son bir
  kez kime yazdığını görüyordu. Tek tıkla giden bir mesajda o duraksama
  yok; yanlış müşteriye giden teklifi geri almanın yolu da yok.
*/
export function WhatsappGonderDugmesi({
  kind,
  token,
  className = "panel-secondary",
  musteriAdi,
}: {
  kind: "proposal" | "contract";
  token: string;
  className?: string;
  /** Onay metninde kime gideceğini yazmak için. */
  musteriAdi?: string | null;
}) {
  const router = useRouter();
  const [gonderiliyor, basla] = useTransition();

  const belge = kind === "proposal" ? "Teklif" : "Sözleşme";
  const kime = musteriAdi?.trim() ? ` ${musteriAdi.trim()} adlı müşteriye` : " müşteriye";

  return (
    <button
      type="button"
      className={className}
      disabled={gonderiliyor}
      onClick={() => {
        if (!window.confirm(`${belge}${kime} WhatsApp'tan gönderilsin mi?`)) return;
        basla(async () => {
          await belgeyiWhatsappGonder(kind, token);
          // Belge taslaktan "gönderildi"ye geçtiyse ekran güncellensin.
          router.refresh();
        });
      }}
    >
      {gonderiliyor ? "Gönderiliyor…" : "💬 WhatsApp ile gönder"}
    </button>
  );
}
