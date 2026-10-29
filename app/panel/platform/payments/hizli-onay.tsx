"use client";

import { useRef, useState } from "react";
import { OnayPenceresi, type OnayIstegi } from "../../components/onay-penceresi";

/*
  KONSOL ANA SAYFASINDAN TEK TIKLA ÖDEME ONAYI (29.10.2026, kurum
  sahibinin isteği).

  Ana sayfa salt okunurdu: kuyruktaki her satır işin yapıldığı ekrana
  götürüyordu. Kurucunun günde defalarca yaptığı iş "dekont geldi,
  tutar doğru, onayla" ve bunun için ekran değiştirmek gerekiyordu.

  YALNIZCA TEMİZ BİLDİRİM. Beklenen tutar/paketle farkı olan bildirim
  burada onaylanmıyor; satır "İncele" diyerek Ödeme onayları ekranına
  götürüyor. Orada fark satır satır yazılı ve kurucu farkı GÖREREK
  teyit ediyor (payments/karar-formu). Farkı burada küçük bir uyarı
  satırıyla geçiştirmek, teyidin anlamını boşaltırdı.

  RET BURADA YOK. Ret notu müşteriye gösteriliyor ve zorunlu; iki
  satırlık bir kuyruk satırı, sebep yazılacak yer değil.

  Karar yine AYNI sunucu işleminden geçiyor (payments/actions.ts →
  review_bank_transfer_payment): yetki, tutar denetimi, lisans uzatma
  ve ürün köprüsüne yansıtma orada. İkinci bir onay yolu yazmak, o
  denetimlerin birinde sapmak demekti.
*/
export function HizliOnay({
  paymentId,
  kurumAdi,
  tutar,
  ayrinti,
  kaydet,
}: {
  paymentId: string;
  kurumAdi: string;
  tutar: string;
  /** Ürün ve ödeme yolu gibi tek satırlık bağlam. */
  ayrinti: string;
  kaydet: (formData: FormData) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [onay, setOnay] = useState<OnayIstegi | null>(null);

  /* Teyit panelin kendi penceresiyle: tarayıcının confirm kutusu
     susturulabiliyor ve susturulunca para kararı veren düğme sessizce
     hiçbir şey yapmıyor (components/onay-penceresi başlığı). */
  const istek: OnayIstegi = {
    ust: kurumAdi,
    baslik: "Ödeme onaylansın mı?",
    metin: (
      <>
        <b>{tutar}</b> tutarındaki bildirim onaylanacak ve lisans bir dönem uzayacak.
        {ayrinti ? <> {ayrinti}.</> : null} Dekontu görmek isterseniz Ödeme onayları ekranından açın.
      </>
    ),
    onayEtiketi: "Onayla",
  };

  return (
    <form ref={form} action={kaydet} className="hizli-onay">
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="decision" value="approved" />
      <button className="panel-ghost" type="button" onClick={() => setOnay(istek)}>Onayla</button>
      <OnayPenceresi
        istek={onay}
        onIptal={() => setOnay(null)}
        onOnay={() => {
          setOnay(null);
          form.current?.requestSubmit();
        }}
      />
    </form>
  );
}
