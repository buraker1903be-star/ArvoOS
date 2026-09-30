"use client";
import { useState, type ReactNode } from "react";

/*
  Aylık / yıllık seçici.

  İki tutar da sunucuda basılır; seçici yalnızca sarmalayıcının
  `data-cycle` değerini değiştirir, CSS hangisinin görüneceğini seçer.
  Böylece JavaScript çalışmadığında (ya da yüklenmeden önce) sayfa boş
  fiyatla değil AYLIK fiyatla görünür — fiyat listesinde okunamayan bir
  tutar, olmayan tutardan kötüdür.
*/
export function PriceCycle({
  monthly, yearly, badge, label, children,
}: {
  monthly: string; yearly: string; badge: string; label: string; children: ReactNode;
}) {
  const [yillik, setYillik] = useState(false);
  return (
    <div className="pricing" data-cycle={yillik ? "yearly" : "monthly"}>
      <div className="cycle" role="group" aria-label={label}>
        <button type="button" className="cycle-btn" aria-pressed={!yillik} onClick={() => setYillik(false)}>
          {monthly}
        </button>
        <button type="button" className="cycle-btn" aria-pressed={yillik} onClick={() => setYillik(true)}>
          {yearly}
          <span className="cycle-badge">{badge}</span>
        </button>
      </div>
      {children}
    </div>
  );
}
