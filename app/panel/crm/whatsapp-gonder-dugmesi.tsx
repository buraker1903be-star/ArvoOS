"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { belgeyiWhatsappGonder } from "./whatsapp-gonder";
import { OnayPenceresi } from "../components/onay-penceresi";

/*
  "WhatsApp ile gönder" düğmesi.

  Eskiden bu bir bağlantıydı ve `wa.me/?text=...` açıyordu: personel
  WhatsApp Web'e düşüyor, numarayı elle seçiyor, mesajı yapıştırıyordu.
  Artık mesaj panelden, kurumun numarasından gidiyor ve kaydı tutuluyor.

  Onay soruyoruz: eski akışta WhatsApp Web açılıyordu ve personel son bir
  kez kime yazdığını görüyordu. Tek tıkla giden bir mesajda o duraksama
  yok; yanlış müşteriye giden teklifi geri almanın yolu da yok.

  Onay panelin kendi penceresinde (components/onay-penceresi): tarayıcı
  confirm kutusunu susturabiliyor ve susturulunca düğme sessizce hiçbir
  şey yapmıyordu — personel "gönder"e basıp mesajın gidip gitmediğini
  bilemiyordu. Gerekçenin tamamı o dosyanın başında.
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

  const [soruluyor, setSoruluyor] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={gonderiliyor}
        onClick={() => setSoruluyor(true)}
      >
        {gonderiliyor ? "Gönderiliyor…" : "💬 WhatsApp ile gönder"}
      </button>
      <OnayPenceresi
        istek={soruluyor ? {
          baslik: `${belge} WhatsApp'tan gönderilsin mi?`,
          metin: `Mesaj${kime} kurumun numarasından gider ve geri alınamaz.`,
          onayEtiketi: "Gönder",
        } : null}
        calisiyor={gonderiliyor}
        onIptal={() => { if (!gonderiliyor) setSoruluyor(false); }}
        onOnay={() => {
          setSoruluyor(false);
          basla(async () => {
            await belgeyiWhatsappGonder(kind, token);
            // Belge taslaktan "gönderildi"ye geçtiyse ekran güncellensin.
            router.refresh();
          });
        }}
      />
    </>
  );
}
