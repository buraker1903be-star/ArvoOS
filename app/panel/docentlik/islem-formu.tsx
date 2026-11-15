"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { OnayPenceresi } from "../components/onay-penceresi";
import { panelBildiriminiYokla } from "@/lib/panel-bildirim-yokla";
import "../components/gonder-dugmesi.css";
import "../components/kayit-formu.css";

/*
  DOÇENTLİK YÖNETİM FORMLARININ ORTAK KABUĞU (F6 PR6b).

  Faaliyet formunda (faaliyet-formu.tsx) ölçülen iki sorun burada tek yerde
  çözülüyor, kriter/hedef/profil/ÜAK formları aynı kabuğu kullanıyor:
   1. React 19 `<form action>` formu işlem bitince KENDİLİĞİNDEN sıfırlıyor;
      panelin işlemi hatayı fırlatmayıp bildirim olarak döndürdüğü için
      (runPanelAction) hata da "bitti" sayılıyor ve kullanıcının yazdığı
      kayboluyordu. Burada gönderim onSubmit ile; form yalnızca BAŞARIDA
      (ve istenirse) sıfırlanır.
   2. Çift gönderim: kilit REF'te ve eşzamanlı (durum güncellemesi bir
      sonraki çizime kadar görünmez).
  Panelin bildirimi (flash-toast) "submit" olayını dinliyor; olay
  preventDefault'tan sonra da yayılıyor, hata/başarı mesajı görünür.
  Sıfırlama yalnızca işlem `undefined` DIŞINDA bir şey döndürünce:
  runPanelAction hatada undefined döndürür, yani hiçbir değer döndürmeyen
  bir işlemin başarısı burada ayırt edilemez ve form sıfırlanmaz.
*/
type Islem = (formData: FormData) => Promise<unknown>;

export function IslemFormu({ islem, children, dugme, basaridaSifirla = false, className = "", id }: {
  islem: Islem;
  children: ReactNode;
  dugme: string;
  basaridaSifirla?: boolean;
  className?: string;
  id?: string;
}) {
  const gonderiliyor = useRef(false);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(olay: FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor.current) return;
    const form = olay.currentTarget;
    gonderiliyor.current = true;
    setBekliyor(true);
    try {
      const sonuc = await islem(new FormData(form));
      panelBildiriminiYokla();
      if (basaridaSifirla && sonuc !== undefined) form.reset();
    } finally {
      gonderiliyor.current = false;
      setBekliyor(false);
    }
  }

  return (
    <form onSubmit={gonder} className={`panel-form kayit-formu docentlik-form ${className}`.trim()} id={id}>
      {children}
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
        <button type="submit" className="panel-primary" disabled={bekliyor} aria-busy={bekliyor || undefined}>
          {bekliyor ? (
            <span className="gonder-bekleme" role="status">
              <span className="gonder-bekleme-kisa">Kaydediliyor…</span>
              <span className="gonder-bekleme-uzun">Hâlâ işleniyor — sonucu bekleyin</span>
            </span>
          ) : dugme}
        </button>
      </div>
    </form>
  );
}

/*
  ONAYLI İŞLEM DÜĞMESİ (silme, kaldırma). Onay panelin penceresinde
  (tarayıcının confirm() kutusu susturulabiliyor); onaydan sonra GERÇEK
  form gönderimi (requestSubmit) — bildirim "submit" olayıyla yoklanıyor.
  Onay penceresinin kendi <form>'u var: iç içe form olmasın diye pencere
  formun DIŞINDA.
*/
export function OnayliIslem({ islem, alanlar, etiket, ariaLabel, baslik, metin, onayEtiketi, tehlike = true }: {
  islem: Islem;
  alanlar: Record<string, string>;
  etiket: string;
  ariaLabel?: string;
  baslik: string;
  metin: string;
  onayEtiketi: string;
  tehlike?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [soruluyor, setSoruluyor] = useState(false);
  return (
    <>
      <form ref={form} action={async (fd) => { await islem(fd); panelBildiriminiYokla(); }} className="docentlik-sil">
        {Object.entries(alanlar).map(([ad, deger]) => <input key={ad} type="hidden" name={ad} value={deger} />)}
        <button type="button" className={`panel-secondary${tehlike ? " docentlik-tehlike" : ""}`} onClick={() => setSoruluyor(true)} aria-label={ariaLabel}>
          {etiket}
        </button>
      </form>
      <OnayPenceresi
        istek={soruluyor ? { baslik, metin, onayEtiketi, tehlike } : null}
        onIptal={() => setSoruluyor(false)}
        onOnay={() => { setSoruluyor(false); form.current?.requestSubmit(); }}
      />
    </>
  );
}
