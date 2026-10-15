"use client";

import Link from "next/link";
import { useEffect } from "react";

// Panel içindeki bir sayfa veya işlem hata verdiğinde Next'in genel
// "Application error" ekranı yerine bu gösterilir; menü ve üst bar yerinde
// kalır. Üretimde sunucu hata mesajları güvenlik gereği gizlendiği için
// asıl mesajı yalnızca geliştirme ortamında gösteriyoruz.
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const detail = process.env.NODE_ENV !== "production" ? error.message : null;

  return (
    <section className="panel-card panel-hata" role="alert">
      <small className="panel-kicker">İŞLEM TAMAMLANAMADI</small>
      {/* Ölçü ve başlık biçimi panel-page-system.css'te (.panel-hata):
          sınıfsız h1 bu sistemde gövde yazısı boyunda kalıyordu. */}
      <h1>Bir sorun oluştu</h1>
      <p>
        Son işleminiz kaydedilmemiş olabilir. Bilgileri kontrol edip tekrar
        deneyin. Sorun devam ederse bu ekranın görüntüsünü yöneticinize iletin.
      </p>
      {detail ? <pre>{detail}</pre> : null}
      {error.digest ? <p><small>Hata kodu: {error.digest}</small></p> : null}
      <div className="panel-page-actions">
        <button className="panel-primary" type="button" onClick={() => reset()}>
          Tekrar Dene
        </button>
        <Link className="panel-secondary" href="/panel">
          Panele Dön
        </Link>
      </div>
    </section>
  );
}
