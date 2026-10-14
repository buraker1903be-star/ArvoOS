"use client";

import { useRef, useState } from "react";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../../components/kayit-formu.css";

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
  farklar = [],
  kaydet,
}: {
  paymentId: string;
  kurumAdi: string;
  tutar: string;
  /** Beklenen tutar/paket ile farklar (lib/beklenen-odeme); boşsa uyumlu. */
  farklar?: string[];
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
  // Fark varsa onay teyidi bu alanla sunucuya gidiyor (actions.ts istiyor).
  const farkAlani = useRef<HTMLInputElement>(null);

  const gonder = (secim: "approved" | "rejected") => {
    if (secim === "rejected" && !not.trim()) {
      window.alert("Ret sebebini yazın. Not müşteriye gösteriliyor; sebepsiz bir ret, müşteriye neyin eksik olduğunu söylemiyor.");
      return;
    }
    const farkUyarisi = secim === "approved" && farklar.length ? `\n\nDİKKAT — beklenenle uyuşmuyor:\n• ${farklar.join("\n• ")}` : "";
    if (!window.confirm(secim === "approved"
      ? `${kurumAdi} için ${tutar} tutarındaki ödeme onaylansın mı?\n\nOnay lisansı açar ve dönemi uzatır. Tutarın hesaba geçtiğini doğruladığınızdan emin olun.${farkUyarisi}`
      : `${kurumAdi} için ${tutar} tutarındaki bildirim reddedilsin mi?\n\nMüşteri notunuzu görecek.`)) return;

    if (!kararAlani.current || !form.current) return;
    kararAlani.current.value = secim;
    if (farkAlani.current) farkAlani.current.value = secim === "approved" && farklar.length ? "evet" : "";
    form.current.requestSubmit();
  };

  return (
    <form className="panel-form kayit-formu" action={kaydet} ref={form}>
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="decision" ref={kararAlani} defaultValue="" />
      <input type="hidden" name="fark_onayi" ref={farkAlani} defaultValue="" />
      <label className="wide">
        İnceleme notu
        <textarea
          name="review_note" rows={2} maxLength={1000} value={not}
          placeholder="Onayda isteğe bağlı, rette zorunlu · müşteri görür"
          onChange={(olay) => setNot(olay.target.value)}
        />
      </label>
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p>Not müşteriye gösterilir; ret için zorunlu.</p>
        <span className="kayit-formu-dugmeler">
        <button className="panel-secondary" type="button" onClick={() => gonder("rejected")}>Reddet</button>
        <button className="panel-primary" type="button" onClick={() => gonder("approved")}>Ödemeyi onayla</button>
        </span>
      </div>
    </form>
  );
}
