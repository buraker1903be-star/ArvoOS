"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/*
  TEMBEL ÖNYÜKLEMELİ BAĞLANTI (22.10.2026, hız çalışması).

  next/link görünür olan her bağlantıyı ÖNCEDEN yüklüyor. Liste
  sayfalarında bu, her satırın talep, müşteri ve süzgeç bağlantıları
  demek: Talepler sayfası açılır açılmaz arka planda 60'tan fazla istek
  gidiyordu (canlıda ölçüldü). Her biri sunucuda panel bağlamını kurup
  veritabanına gidiyor; ekranı bekletmiyor ama bağlantı havuzunu
  dolduruyor ve kullanıcının bir SONRAKİ gerçek tıklaması bu kuyruğun
  arkasına düşüyordu.

  Burada önyükleme kapalı; fare üzerine gelince, klavyeyle odaklanınca
  ya da parmak dokununca başlıyor. Tıklamadan önce çoğunlukla 100–300 ms
  vakit var: tıklama yine anında hissedilir, yalnızca tıklanacak olan
  yüklenir. Liste satırları ve süzgeç hapları için; menü ve dock'ta
  sayısı az olduğu için düz Link kalıyor.
*/
export function TembelBaglanti({ href, onMouseEnter, onFocus, onTouchStart, ...rest }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const router = useRouter();
  const yukle = () => {
    if (typeof href === "string") router.prefetch(href);
  };
  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onMouseEnter={(olay) => { yukle(); onMouseEnter?.(olay); }}
      onFocus={(olay) => { yukle(); onFocus?.(olay); }}
      onTouchStart={(olay) => { yukle(); onTouchStart?.(olay); }}
    />
  );
}
