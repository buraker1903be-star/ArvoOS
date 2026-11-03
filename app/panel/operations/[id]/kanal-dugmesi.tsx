"use client";

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { PanelModal } from "../../components/panel-modal";

/*
  İLETİŞİM KARTININ KANAL DÜĞMESİ (03.11.2026, kurum sahibinin isteği:
  "bildirimler okunduktan sonra sönsün").

  Rozet sunucuda hesaplanınca pencereyi açıp okusanız da sayfa yenilenene
  kadar yanıyordu; yorumlarda ve postalarda ise okunma kaydı hiç yok. Bu
  yüzden "görüldü" anı tarayıcıda, kanal başına tutuluyor: pencere açılınca
  en yeni olayın zamanı yazılır, rozet ondan SONRAKİ olayları sayar.
  Müşteri mesajlarının asıl okundu işareti yine veritabanında
  (MarkCustomerMessagesRead); burası yalnızca düğmenin hemen sönmesi için.

  Tarayıcıya bağlı bir kayıt: başka bir cihazda rozet yeniden görünür.
  Bu bilerek kabul edildi — rozet bir hatırlatma, bir kayıt değil.
*/
const OLAY = "arvo:kanal-goruldu";

function okuGorulme(anahtar: string): string {
  try {
    return window.localStorage.getItem(anahtar) ?? "";
  } catch {
    return "";
  }
}

export function KanalDugmesi({
  anahtar,
  etiket,
  olaylar,
  varsayilanGorulme = "",
  title,
  description,
  kicker,
  baslangicAcik = false,
  children,
}: {
  /** localStorage anahtarı (iş + kanal). */
  anahtar: string;
  etiket: string;
  /** Rozete sayılabilecek olayların zamanları (ISO). */
  olaylar: string[];
  /** Hiç açılmadıysa bundan öncesi görülmüş sayılır (yorumlarda: kişinin son yorumu). */
  varsayilanGorulme?: string;
  title: string;
  description?: string;
  kicker?: string;
  baslangicAcik?: boolean;
  children: ReactNode;
}) {
  const abone = useCallback((degisti: () => void) => {
    window.addEventListener(OLAY, degisti);
    window.addEventListener("storage", degisti);
    return () => {
      window.removeEventListener(OLAY, degisti);
      window.removeEventListener("storage", degisti);
    };
  }, []);
  const kayitli = useSyncExternalStore(abone, () => okuGorulme(anahtar), () => "");
  const gorulme = kayitli > varsayilanGorulme ? kayitli : varsayilanGorulme;
  const sayi = olaylar.filter((zaman) => zaman > gorulme).length;

  const gorulduYaz = useCallback(() => {
    const enYeni = olaylar.reduce((a, b) => (b > a ? b : a), "");
    if (!enYeni) return;
    try {
      window.localStorage.setItem(anahtar, enYeni);
    } catch {
      /* Gizli pencere ya da kapalı depolama: rozet yalnızca bu açılışta sönmez. */
    }
    window.dispatchEvent(new Event(OLAY));
  }, [anahtar, olaylar]);

  /* Adresten açılan pencere (?pencere=mesajlar) de görülmüş sayılır. */
  useEffect(() => {
    if (baslangicAcik) gorulduYaz();
  }, [baslangicAcik, gorulduYaz]);

  return (
    <PanelModal
      triggerClassName="opd-kanal"
      triggerLabel={etiket}
      triggerBadge={sayi ? String(sayi) : null}
      title={title}
      description={description}
      kicker={kicker}
      boy="yazisma"
      baslangicAcik={baslangicAcik}
      acilinca={gorulduYaz}
    >
      {children}
    </PanelModal>
  );
}
