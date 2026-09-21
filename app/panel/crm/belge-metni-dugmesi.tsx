"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { belgeMetniGonder } from "./whatsapp-gonder";

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

  return (
    <button
      type="button"
      className={className}
      disabled={gonderiliyor || !metin.trim()}
      title={metin}
      onClick={() => {
        if (!window.confirm(onayMetni)) return;
        basla(async () => {
          await belgeMetniGonder(kind, token, metin);
          router.refresh();
        });
      }}
    >
      {gonderiliyor ? "Gönderiliyor…" : etiket}
    </button>
  );
}
