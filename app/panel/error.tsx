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
    <section className="panel-card" role="alert" style={{ maxWidth: 640, margin: "32px auto", padding: "28px 32px" }}>
      <small className="panel-kicker">İŞLEM TAMAMLANAMADI</small>
      <h1 style={{ margin: "8px 0 10px" }}>Bir sorun oluştu</h1>
      <p>
        Son işleminiz kaydedilmemiş olabilir. Bilgileri kontrol edip tekrar
        deneyin. Sorun devam ederse bu ekranın görüntüsünü yöneticinize iletin.
      </p>
      {detail ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{detail}</pre> : null}
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
