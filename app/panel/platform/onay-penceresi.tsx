"use client";

import { useEffect, useRef, useState } from "react";
// Pencere ve onay biçimleri konsolun stilinde (AGENTS.md: bileşen kendi CSS'ini import eder).
import "./platform.css";

/*
  KONSOL ONAY PENCERESİ (15.10.2026).

  Kurucunun en ağır iki işlemi — bir kurumun ArvoOS erişimini dondurmak ve
  bir modülü kapatmak — window.confirm / window.prompt ile soruluyordu.
  İki sorun vardı:

  1. Tarayıcı bu kutuları SUSTURABİLİYOR. Arka arkaya birkaç kutu açan bir
     sayfada Chrome "bu sayfanın başka pencere açmasını engelle" kutusunu
     gösteriyor; işaretlenince confirm() false, prompt() null dönüyor.
     Modül matrisinde üst üste modül kapatmak tam olarak bu akış: o andan
     sonra kurucu anahtara basıyor, HİÇBİR ŞEY olmuyor, hata da yok.
     Deponun kendi kararı da bu yöndeydi — satır içi silme onayı
     "tarayıcı confirm() yerine, daha güvenilir" diye yazılmıştı
     (panel-page-system.css), ama konsolun bu iki yolu dışarıda kalmıştı.
  2. prompt() kutusu biçimsiz ve dar: dondurma sebebi müşteriye kilit
     ekranında gösterilen bir metin, onu tarayıcının tek satırlık gri
     kutusunda yazmak ciddi bir işe yakışmıyor.

  Pencere panelin kendi penceresi (plt-pencere): telefonda alt sayfa
  olarak açılıyor, Esc ve arka plan tıklaması çalışıyor, sebep alanı
  boşken onay düğmesi kapalı.
*/
export type OnayIstegi = {
  /** Üst satır: hangi kurum / hangi kayıt. */
  ust?: string;
  baslik: string;
  /** Ne olacağını anlatan cümle(ler). */
  metin: string;
  onayEtiketi: string;
  /** Onay düğmesi kırmızı (geri alınabilir ama müşteriyi anında etkiler). */
  tehlike?: boolean;
  /** Verilirse zorunlu bir sebep alanı çıkar; değeri onaya geçer. */
  sebep?: { etiket: string; varsayilan?: string; ipucu?: string };
};

export function OnayPenceresi({ istek, calisiyor, onIptal, onOnay }: {
  istek: OnayIstegi | null;
  calisiyor?: boolean;
  onIptal: () => void;
  onOnay: (sebep: string) => void;
}) {
  const pencere = useRef<HTMLDialogElement>(null);

  /* showModal() elle: <dialog open> kipsiz açıyor, arka plan tıklanabilir
     kalıyor ve Esc çalışmıyor (lisans penceresindeki notun aynısı). */
  useEffect(() => {
    const oge = pencere.current;
    if (!oge) return;
    if (istek && !oge.open) {
      oge.showModal();
      /*
        Odak sebep alanına: showModal() odağı penceredeki İLK odaklanabilir
        öğeye veriyor, o da kapatma çarpısı. Sebep istenen bir pencerede
        kurucunun yapacağı ilk şey yazmak (React'in autoFocus'u burada
        işlemiyor: öğe pencere açılmadan önce çiziliyor).
      */
      oge.querySelector("textarea")?.focus();
    }
    if (!istek && oge.open) oge.close();
  }, [istek]);

  return (
    <dialog
      ref={pencere}
      className="plt-pencere plt-onay"
      aria-label={istek?.baslik ?? "Onay"}
      onClose={onIptal}
      onClick={(olay) => { if (olay.target === pencere.current) onIptal(); }}
    >
      {/* Gövde ayrı bileşen ve istekle ANAHTARLI: sebep metni yeni istekte
          kendiliğinden sıfırlansın, bir önceki dondurmanın gerekçesi
          ötekine taşınmasın. Efektle sıfırlamak aynı işi yapardı ama
          render'dan sonra ikinci bir çizim demek. */}
      {istek ? <OnayGovdesi key={istek.baslik} istek={istek} calisiyor={calisiyor} onIptal={onIptal} onOnay={onOnay} /> : null}
    </dialog>
  );
}

function OnayGovdesi({ istek, calisiyor, onIptal, onOnay }: {
  istek: OnayIstegi;
  calisiyor?: boolean;
  onIptal: () => void;
  onOnay: (sebep: string) => void;
}) {
  const [sebep, setSebep] = useState(istek.sebep?.varsayilan ?? "");
  const sebepGerekli = Boolean(istek.sebep);
  const hazir = !calisiyor && (!sebepGerekli || sebep.trim().length > 0);

  return (
    <form
      className="plt-pencere-govde"
      onSubmit={(olay) => { olay.preventDefault(); if (hazir) onOnay(sebep.trim()); }}
    >
      <header className="plt-pencere-bas">
        <div>
          {istek.ust ? <small>{istek.ust}</small> : null}
          <h2>{istek.baslik}</h2>
        </div>
        <button type="button" className="plt-pencere-kapat" aria-label="Kapat" onClick={onIptal}>×</button>
      </header>

      <p className="plt-onay-metin">{istek.metin}</p>

      {istek.sebep ? (
        <label className="plt-onay-sebep">
          <span>{istek.sebep.etiket}</span>
          {/* Odak showModal'dan sonra elle veriliyor (yukarıdaki not). */}
          <textarea
            name="reason"
            rows={3}
            maxLength={300}
            required
            value={sebep}
            onChange={(olay) => setSebep(olay.target.value)}
          />
          {istek.sebep.ipucu ? <small>{istek.sebep.ipucu}</small> : null}
        </label>
      ) : null}

      <div className="plt-onay-eylem">
        <button type="button" className="panel-secondary" onClick={onIptal}>Vazgeç</button>
        <button type="submit" className={istek.tehlike ? "panel-danger" : "panel-primary"} disabled={!hazir}>
          {calisiyor ? "Uygulanıyor…" : istek.onayEtiketi}
        </button>
      </div>
    </form>
  );
}
