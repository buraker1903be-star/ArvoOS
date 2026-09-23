"use client";

import { useRef, useState } from "react";

/*
  Dekont kararı: onayla ya da reddet.

  İki sorun vardı:

    1. Onay TEYİTSİZDİ. Tek tıkla lisans açılıyordu; konsolun her yerinde
       (modül anahtarı, abonelik isteği) geri alınamaz işlem teyit istiyor,
       burada istemiyordu. Yanlış karta düşen bir tık, parası gelmemiş bir
       kiracıyı çalışır hale getiriyordu.
    2. Ret GEREKÇESİZ olabiliyordu. Not müşteriye gösteriliyor; boş bir ret,
       müşteriye "ödemeniz kabul edilmedi" deyip sebebini söylememek demek.
       Sebep artık rette zorunlu, onayda isteğe bağlı.

  Karar sunucu tarafında da doğrulanıyor (actions.ts + RPC); buradakiler
  yalnızca kolaylık.
*/

export function KararFormu({
  paymentId,
  kurumAdi,
  tutar,
  kaydet,
}: {
  paymentId: string;
  kurumAdi: string;
  tutar: string;
  kaydet: (formData: FormData) => void;
}) {
  const [not, setNot] = useState("");
  const form = useRef<HTMLFormElement>(null);
  /*
    Karar gizli bir alanda ve REACT DURUMUNDA DEĞİL, ref ile yazılıyor.
    Teyit penceresi native gönderimi kestiği için formu kendimiz
    gönderiyoruz; kararı setState ile yazsaydık gönderim, React'in DOM'a
    işlemesinden önce çalışabilir ve sunucuya boş karar giderdi.
  */
  const kararAlani = useRef<HTMLInputElement>(null);

  const gonder = (secim: "approved" | "rejected") => {
    if (secim === "rejected" && !not.trim()) {
      window.alert("Ret sebebini yazın. Not müşteriye gösteriliyor; sebepsiz bir ret, müşteriye neyin eksik olduğunu söylemiyor.");
      return;
    }
    if (!window.confirm(secim === "approved"
      ? `${kurumAdi} için ${tutar} tutarındaki ödeme onaylansın mı?\n\nOnay lisansı açar ve dönemi uzatır. Tutarın hesaba geçtiğini doğruladığınızdan emin olun.`
      : `${kurumAdi} için ${tutar} tutarındaki bildirim reddedilsin mi?\n\nMüşteri notunuzu görecek.`)) return;

    if (!kararAlani.current || !form.current) return;
    kararAlani.current.value = secim;
    form.current.requestSubmit();
  };

  return (
    <form className="panel-form" action={kaydet} ref={form}>
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="decision" ref={kararAlani} defaultValue="" />
      <label className="wide">
        İnceleme notu
        <textarea
          name="review_note" rows={2} maxLength={1000} value={not}
          placeholder="Onayda isteğe bağlı, rette zorunlu · müşteri görür"
          onChange={(olay) => setNot(olay.target.value)}
        />
      </label>
      <div className="wide panel-form-actions">
        <button className="panel-secondary" type="button" onClick={() => gonder("rejected")}>Reddet</button>
        <button className="panel-primary" type="button" onClick={() => gonder("approved")}>Ödemeyi onayla</button>
      </div>
    </form>
  );
}
