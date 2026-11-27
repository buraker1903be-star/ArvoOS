"use client";

import { useRef, useState } from "react";
import { OnayPenceresi } from "../components/onay-penceresi";
import { faaliyetSil } from "./actions";

/*
  FAALİYET SİLME (F6 PR6a). Onay panelin kendi penceresinde: tarayıcının
  confirm() kutusu susturulabiliyor ve susturulunca düğme sessizce hiçbir
  şey yapmıyordu (gerekçe components/onay-penceresi.tsx'in başında).

  Onaydan sonra gönderim GERÇEK bir form gönderimi (requestSubmit):
  panelin bildirimi (flash-toast) sonucu "submit" olayından sonra
  yokluyor; doğrudan çağrılan bir işlemin hata mesajı ekrana hiç
  ulaşmazdı. Silme sunucuda kaydın sahibine bağlı (PR5 → faaliyetSil,
  owner_id = oturum); bu düğme yalnızca kişinin kendi listesinde çiziliyor.
*/
export function FaaliyetSil({ id, baslik }: { id: string; baslik: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [soruluyor, setSoruluyor] = useState(false);
  /* Onay penceresinin kendi <form>'u var: içine konursa iç içe form olur
     (HTML'de geçersiz, tarayıcı içtekini yok sayar) — pencere formun DIŞINDA. */
  return (
    <>
      <form ref={form} action={async (fd) => { await faaliyetSil(fd); }} className="docentlik-sil">
        <input type="hidden" name="faaliyet_id" value={id} />
        <button type="button" className="panel-secondary docentlik-tehlike" onClick={() => setSoruluyor(true)} aria-label={`${baslik} faaliyetini sil`}>
          Sil
        </button>
      </form>
      <OnayPenceresi
        istek={soruluyor ? {
          baslik: "Faaliyet silinsin mi?",
          metin: `"${baslik}" faaliyeti ve ona bağlı belge kalıcı olarak silinir; puanınız yeniden hesaplanır.`,
          onayEtiketi: "Sil",
          tehlike: true,
        } : null}
        onIptal={() => setSoruluyor(false)}
        onOnay={() => {
          setSoruluyor(false);
          form.current?.requestSubmit();
        }}
      />
    </>
  );
}
