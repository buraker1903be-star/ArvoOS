"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { belgeMetniGonder } from "./whatsapp-gonder";
import { OnayPenceresi } from "../components/onay-penceresi";

/*
  Belgeyle ilgili ikincil mesajları (takip kodu, ek protokol hatırlatması)
  panelden gönderen düğme.

  Eskiden bunlar da `wa.me/?text=...` açıyordu: personel WhatsApp Web'e
  düşüyor, numarayı elle seçiyordu. Yanlış kişiye gitmesi kolaydı ve
  gönderilip gönderilmediğinin kaydı kalmıyordu.

  Bu mesajların onaylı şablonu yok, yani yalnızca müşterinin son
  mesajından sonraki 24 saat içinde gidebiliyorlar. Pencere kapalıysa
  sunucu sebebini söylüyor; düğmeyi gizlemiyoruz çünkü pencerenin açık
  olup olmadığı sayfa çizilirken bilinmiyor ve gizlenen bir düğme
  "bu özellik yok" izlenimi bırakırdı.

  Onay panelin kendi penceresinde (components/onay-penceresi): tarayıcı
  confirm kutusunu susturabiliyor ve susturulunca düğme sessizce hiçbir
  şey yapmıyordu. Gerekçenin tamamı o dosyanın başında.
*/
export function BelgeMetniDugmesi({
  kind,
  token,
  metin,
  etiket = "💬 WhatsApp ile gönder",
  className = "panel-secondary",
  onayMetni,
}: {
  kind: "proposal" | "contract";
  token: string;
  metin: string;
  etiket?: string;
  className?: string;
  /** Onay kutusunda ne yazacağı; kime gittiğini görmeden göndermeyelim. */
  onayMetni: string;
}) {
  const router = useRouter();
  const [gonderiliyor, basla] = useTransition();

  const [soruluyor, setSoruluyor] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={gonderiliyor || !metin.trim()}
        title={metin}
        onClick={() => setSoruluyor(true)}
      >
        {gonderiliyor ? "Gönderiliyor…" : etiket}
      </button>
      <OnayPenceresi
        istek={soruluyor ? {
          baslik: "Mesaj gönderilsin mi?",
          /* Çağıranın hazırladığı cümle (kime, ne gideceği) olduğu gibi;
             altında da gidecek metnin kendisi görünüyor — confirm
             kutusunda ikisi tek paragrafa sıkışıyordu. */
          metin: onayMetni,
          uyarilar: [metin.trim()],
          onayEtiketi: "Gönder",
        } : null}
        calisiyor={gonderiliyor}
        onIptal={() => { if (!gonderiliyor) setSoruluyor(false); }}
        onOnay={() => {
          setSoruluyor(false);
          basla(async () => {
            await belgeMetniGonder(kind, token, metin);
            router.refresh();
          });
        }}
      />
    </>
  );
}
