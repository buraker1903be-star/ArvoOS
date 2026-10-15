"use client";

import { useRef, useState } from "react";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../../components/kayit-formu.css";
import { OnayPenceresi, type OnayIstegi } from "../../components/onay-penceresi";

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

  /* Onay ve eksik-not uyarısı panelin kendisinde (../onay-penceresi):
     tarayıcının confirm/alert kutuları susturulabiliyor ve susturulunca
     para kararı veren düğmeler sessizce hiçbir şey yapmıyordu. Gerekçe o
     dosyanın başında. */
  const [onay, setOnay] = useState<{ istek: OnayIstegi; uygula: () => void } | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const uygula = (secim: "approved" | "rejected") => {
    if (!kararAlani.current || !form.current) return;
    kararAlani.current.value = secim;
    if (farkAlani.current) farkAlani.current.value = secim === "approved" && farklar.length ? "evet" : "";
    setOnay(null);
    form.current.requestSubmit();
  };

  const gonder = (secim: "approved" | "rejected") => {
    if (secim === "rejected" && !not.trim()) {
      setHata("Ret sebebini yazın. Not müşteriye gösteriliyor; sebepsiz bir ret, müşteriye neyin eksik olduğunu söylemiyor.");
      return;
    }
    setHata(null);
    setOnay({
      istek: secim === "approved"
        ? {
            ust: kurumAdi,
            baslik: `${tutar} tutarındaki ödeme onaylansın mı?`,
            metin: "Onay lisansı açar ve dönemi uzatır. Tutarın hesaba geçtiğini doğruladığınızdan emin olun.",
            uyarilar: farklar.length ? farklar : undefined,
            onayEtiketi: "Onayla",
          }
        : {
            ust: kurumAdi,
            baslik: `${tutar} tutarındaki bildirim reddedilsin mi?`,
            metin: "Müşteri notunuzu görecek.",
            onayEtiketi: "Reddet",
            tehlike: true,
          },
      uygula: () => uygula(secim),
    });
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
      {hata ? <p className="wide panel-error" role="alert">{hata}</p> : null}
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p>Not müşteriye gösterilir; ret için zorunlu.</p>
        <span className="kayit-formu-dugmeler">
        <button className="panel-secondary" type="button" onClick={() => gonder("rejected")}>Reddet</button>
        <button className="panel-primary" type="button" onClick={() => gonder("approved")}>Ödemeyi onayla</button>
        </span>
      </div>
      <OnayPenceresi
        istek={onay?.istek ?? null}
        onIptal={() => setOnay(null)}
        onOnay={() => onay?.uygula()}
      />
    </form>
  );
}
